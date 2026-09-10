"""Model loading, schema compilation and the observed generation loop."""

from __future__ import annotations

import json
import os
import threading
import time
from collections import OrderedDict
from typing import Any, Callable, Iterator

import jsonschema
import outlines
import torch
from outlines.backends.outlines_core import OutlinesCoreBackend, OutlinesCoreLogitsProcessor
from outlines_core import Index
from outlines_core.json_schema import build_regex_from_schema
from transformers import AutoModelForCausalLM, AutoTokenizer, LogitsProcessorList

from .fsm import char_fsm_payload, token_dfa_payload
from .presets import is_recursive
from .spy import MasterObserver, PreMaskObserver
from .tracing import Done, Meta, Mode, Step, TopEntry, json_stack_depth

DEFAULT_MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"
TOY_MODEL_ID = "toy/qwen2-random-64d"
SYSTEM_PROMPT = "You are a JSON generator. Reply with a single JSON object and nothing else."


# float32 costs 4 bytes per parameter, which is the real limit on a laptop: a
# 1.5B model needs ~6 GB of RAM before anything else. `MODEL_DTYPE=bfloat16`
# halves that, at the cost of a little precision in the probabilities this lab
# puts on screen, so float32 stays the default.
DTYPES = {"float32": torch.float32, "bfloat16": torch.bfloat16, "float16": torch.float16}
DTYPE = DTYPES[os.environ.get("MODEL_DTYPE", "float32").lower()]


class Engine:
    def __init__(self, model_id: str = DEFAULT_MODEL_ID, toy: bool = False) -> None:
        self.toy = toy
        if toy:
            from .toy import build_toy_model, build_toy_tokenizer

            self.model_id = TOY_MODEL_ID
            self.tokenizer = build_toy_tokenizer()
            self.model = build_toy_model(self.tokenizer)
        else:
            self.model_id = model_id
            self.tokenizer = AutoTokenizer.from_pretrained(model_id)
            self.model = AutoModelForCausalLM.from_pretrained(model_id, dtype=DTYPE)
            self.model.eval()
        self.device = "cpu"
        # outlines' wrapper is what the backends know how to read a vocabulary from.
        self.outlines_model = outlines.from_transformers(self.model, self.tokenizer)
        # Building the outlines_core Vocabulary walks the whole tokenizer vocab;
        # do it once and reuse it for every Index.
        self.core = OutlinesCoreBackend(self.outlines_model)
        self._llg = None
        self._index_cache: OrderedDict[str, Index] = OrderedDict()
        self.lock = threading.Lock()
        self.vocab_size = int(self.model.get_output_embeddings().weight.shape[0])

    # ------------------------------------------------------------------ helpers
    @property
    def llg(self):
        if self._llg is None:
            from outlines.backends.llguidance import LLGuidanceBackend

            self._llg = LLGuidanceBackend(self.outlines_model)
        return self._llg

    def index_for(self, regex: str) -> Index:
        cached = self._index_cache.get(regex)
        if cached is not None:
            self._index_cache.move_to_end(regex)
            return cached
        index = Index(regex, self.core.vocabulary)
        self._index_cache[regex] = index
        while len(self._index_cache) > 16:
            self._index_cache.popitem(last=False)
        return index

    def model_info(self) -> dict[str, Any]:
        """Shape of the loaded model, for /health and the model list."""
        config = self.model.config
        return {
            "n_params": sum(p.numel() for p in self.model.parameters()),
            "n_layers": int(getattr(config, "num_hidden_layers", 0)),
            "hidden_size": int(getattr(config, "hidden_size", 0)),
            "tied_embeddings": bool(getattr(config, "tie_word_embeddings", False)),
        }

    def warm_up(self) -> None:
        """Pay the one-off costs before the first visitor.

        The first llguidance call in a process spends ~1.6 s in torch.dynamo
        before falling back, and the first outlines_core Index build walks the
        whole vocabulary. Two two-token generations get both out of the way.
        """
        from .presets import PRESETS

        preset = PRESETS["person"]
        with self.lock:
            for mode in ("fsm", "cfg"):
                for _ in self.generate(preset["schema"], preset["prompt"], mode=mode, max_new_tokens=2):
                    pass

    def token_text(self, token_id: int) -> str:
        return self.tokenizer.decode([token_id])

    def token_raw(self, token_id: int) -> str:
        tok = self.tokenizer.convert_ids_to_tokens(token_id)
        return tok if isinstance(tok, str) else str(tok)

    @staticmethod
    def resolve_mode(schema: dict[str, Any], mode: str) -> tuple[Mode, bool]:
        recursive = is_recursive(schema)
        if mode == "fsm":
            return "fsm", recursive
        if mode == "cfg":
            return "cfg", recursive
        return ("cfg" if recursive else "fsm"), recursive

    def regex_for(self, schema: dict[str, Any]) -> str:
        return build_regex_from_schema(json.dumps(schema), None)

    # ------------------------------------------------------------------ compile
    def compile(self, schema: dict[str, Any], mode: str = "auto") -> dict[str, Any]:
        resolved, recursive = self.resolve_mode(schema, mode)
        regex: str | None
        regex_error: str | None = None
        try:
            regex = self.regex_for(schema)
        except Exception as exc:  # outlines_core rejects some schemas (unsupported keywords…)
            regex = None
            regex_error = f"{type(exc).__name__}: {exc}"
        payload: dict[str, Any] = {
            "mode": resolved,
            "backend": "outlines_core" if resolved == "fsm" else "llguidance",
            "recursive": recursive,
            "regex": regex,
            "regex_error": regex_error,
            "regex_length": len(regex) if regex else 0,
            "vocab_size": self.vocab_size,
            "model_id": self.model_id,
            "char_fsm": None,
            "token_dfa": None,
        }
        if regex is not None:
            payload["char_fsm"] = char_fsm_payload(regex)
            try:
                payload["token_dfa"] = token_dfa_payload(self.index_for(regex), self.token_text)
            except Exception as exc:
                payload["token_dfa_error"] = f"{type(exc).__name__}: {exc}"
        return payload

    # ------------------------------------------------------------------ generate
    def build_processor(self, schema: dict[str, Any], resolved: Mode):
        """Return (outlines processor, callable that reports the automaton state)."""
        if resolved == "fsm":
            proc = OutlinesCoreLogitsProcessor(self.index_for(self.regex_for(schema)), "torch")

            def state_getter() -> int | None:
                guides = getattr(proc, "_guides", None)
                return int(guides[0].get_state()) if guides else None

            return proc, state_getter
        # llguidance would otherwise accept unlimited whitespace between JSON
        # tokens; keep the output compact, the same shape outlines_core's
        # default `[ ]?` whitespace produces, so both engines are comparable.
        grammar_schema = dict(schema)
        grammar_schema["x-guidance"] = {"whitespace_flexible": False}
        proc = self.llg.get_json_schema_logits_processor(json.dumps(grammar_schema))
        return proc, None

    def format_prompt(self, prompt: str, use_chat_template: bool) -> str:
        template = getattr(self.tokenizer, "chat_template", None)
        if use_chat_template and template:
            return self.tokenizer.apply_chat_template(
                [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
                tokenize=False,
                add_generation_prompt=True,
            )
        return prompt

    def _top_entries(self, entries: list[tuple[int, float, bool]]) -> list[TopEntry]:
        return [
            TopEntry(token_id=t, token=self.token_raw(t), text=self.token_text(t), p=p, allowed=a)
            for t, p, a in entries
        ]

    def generate(
        self,
        schema: dict[str, Any],
        prompt: str,
        mode: str = "auto",
        max_new_tokens: int = 120,
        temperature: float = 0.0,
        top_k_sampling: int = 0,
        top_k_report: int = 8,
        seed: int | None = None,
        use_chat_template: bool = True,
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        """Yield ("meta"|"step"|"done", payload) while decoding one sequence.

        The loop below is the plain autoregressive loop `model.generate` runs
        internally, written out so the processor chain is explicit:

            logits -> PreMaskObserver -> outlines mask -> MasterObserver -> sample
        """
        resolved, recursive = self.resolve_mode(schema, mode)
        proc, state_getter = self.build_processor(schema, resolved)
        pre = PreMaskObserver()
        master = MasterObserver(pre, top_k=top_k_report, state_getter=state_getter)
        processors = LogitsProcessorList([pre, proc, master])
        # The blueprint's rule: clear observer history before every inference.
        master.reset()
        proc.reset()

        regex = None
        if resolved == "fsm":
            regex = self.regex_for(schema)
        else:
            try:
                regex = self.regex_for(schema)
            except Exception:
                regex = None

        prompt_text = self.format_prompt(prompt, use_chat_template)
        input_ids = self.tokenizer(prompt_text, return_tensors="pt").input_ids
        yield "meta", Meta(
            mode=resolved,
            backend="outlines_core" if resolved == "fsm" else "llguidance",
            model_id=self.model_id,
            regex=regex,
            prompt_token_count=int(input_ids.shape[1]),
            vocab_size=self.vocab_size,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            recursive=recursive,
        ).to_dict()

        generator = torch.Generator().manual_seed(seed) if seed is not None else None
        eos_id = self.tokenizer.eos_token_id
        generated: list[int] = []
        partial = ""
        stopped_by = "max_new_tokens"
        started = time.perf_counter()
        all_ids = input_ids
        cur_ids = input_ids
        past = None
        with torch.no_grad():
            for i in range(max_new_tokens):
                out = self.model(input_ids=cur_ids, past_key_values=past, use_cache=True)
                past = out.past_key_values
                logits = out.logits[:, -1, :].float()
                scores = processors(all_ids, logits)
                next_id = self._sample(scores, temperature, top_k_sampling, generator)

                rec = master.records[-1]
                raw_token = self.token_raw(next_id)
                text = self.token_text(next_id) if next_id != eos_id else ""
                is_eos = next_id == eos_id
                if not is_eos:
                    generated.append(next_id)
                    partial = self.tokenizer.decode(generated)
                p_o, p_f = master.probs_for(i, next_id)
                yield "step", Step(
                    i=i,
                    token_id=next_id,
                    token=raw_token,
                    text="" if is_eos else text,  # the UI renders "" as ⟨eos⟩
                    partial_text=partial,
                    n_allowed=rec["n_allowed"],
                    vocab_size=rec["vocab_size"],
                    mass_removed=rec["mass_removed"],
                    top_original=self._top_entries(rec["top_original"]),
                    top_forced=self._top_entries(rec["top_forced"]),
                    fsm_state=rec["fsm_state"],
                    stack_depth=json_stack_depth(partial),
                    was_overridden=rec["argmax_raw"] != next_id,
                    p_original=p_o,
                    p_forced=p_f,
                ).to_dict()
                if is_eos:
                    stopped_by = "eos"
                    break
                cur_ids = torch.tensor([[next_id]], dtype=all_ids.dtype)
                all_ids = torch.cat([all_ids, cur_ids], dim=1)

        elapsed = time.perf_counter() - started
        parsed: Any = None
        valid = False
        error: str | None = None
        try:
            parsed = json.loads(partial)
            jsonschema.validate(parsed, schema)
            valid = True
        except json.JSONDecodeError as exc:
            error = f"not valid JSON: {exc.msg} at position {exc.pos}"
        except jsonschema.ValidationError as exc:
            error = f"JSON does not match the schema: {exc.message}"
        yield "done", Done(
            text=partial,
            parsed=parsed,
            valid=valid,
            validation_error=error,
            n_steps=len(master.records),
            elapsed_s=elapsed,
            stopped_by=stopped_by,
            tokens=[{"token_id": t, "token": self.token_raw(t), "text": self.token_text(t)} for t in generated],
        ).to_dict()
        master.reset()
        proc.reset()

    @staticmethod
    def _sample(scores: torch.Tensor, temperature: float, top_k: int, generator: torch.Generator | None) -> int:
        row = scores[0]
        if temperature <= 0:
            return int(torch.argmax(row).item())
        logits = row / temperature
        if top_k and top_k > 0:
            k = min(top_k, logits.numel())
            kth = torch.topk(logits, k).values[-1]
            logits = torch.where(logits < kth, torch.full_like(logits, float("-inf")), logits)
        probs = torch.softmax(logits, dim=-1)
        if not torch.isfinite(probs).all() or probs.sum() <= 0:
            return int(torch.argmax(row).item())
        return int(torch.multinomial(probs, 1, generator=generator).item())


def engine_from_env() -> Engine:
    toy = os.environ.get("TOY_MODEL", "0") == "1"
    model_id = os.environ.get("MODEL_ID", DEFAULT_MODEL_ID)
    threads = os.environ.get("TORCH_THREADS")
    if threads:
        torch.set_num_threads(int(threads))
    return Engine(model_id=model_id, toy=toy)


ProgressCallback = Callable[[str, dict[str, Any]], None]
