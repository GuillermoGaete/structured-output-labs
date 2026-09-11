"""Model loading, schema compilation and the observed generation loop."""

from __future__ import annotations

import json
import os
import threading
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
from transformers import AutoModelForCausalLM, AutoTokenizer, LogitsProcessor, LogitsProcessorList

from .fsm import char_fsm_payload, token_dfa_payload
from .grammar import render_grammar
from . import xgr as xgr_engine
from .presets import is_recursive
from .spy import MasterObserver, PreMaskObserver
from .tracing import Done, Meta, Mode, Step, TopEntry, json_stack_depth

DEFAULT_MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"
TOY_MODEL_ID = "toy/qwen2-random-64d"
SYSTEM_PROMPT = (
    "You are a JSON generator. Answer directly with a single JSON object and nothing else: "
    "no explanation, no reasoning outside the JSON, no code fences."
)

# Qwen3-style templates open a `<think>` block unless told not to; with a mask on,
# `<think>` is forbidden anyway, so this keeps the prompt-only run comparable
# (and stops it from spending its whole budget reasoning in prose). Templates
# without the variable ignore it.
ENABLE_THINKING = False


# float32 costs 4 bytes per parameter, which is the real limit on a laptop: a
# 1.5B model needs ~6 GB of RAM before anything else. `MODEL_DTYPE=bfloat16`
# halves that, at the cost of a little precision in the probabilities this lab
# puts on screen, so float32 stays the default.
DTYPES = {"float32": torch.float32, "bfloat16": torch.bfloat16, "float16": torch.float16}
DTYPE = DTYPES[os.environ.get("MODEL_DTYPE", "float32").lower()]


BACKEND_NAME: dict[str, str] = {"fsm": "outlines_core", "cfg": "llguidance", "xgr": "xgrammar", "none": "none"}

# What the "none" mode appends to the prompt instead of a mask: the shape, asked for in words.
# `{schema}` is where the schema goes; a request may send its own wording.
SCHEMA_HINT = (
    "Answer directly with one JSON object that matches this JSON Schema. "
    "Do not explain, do not think aloud, do not use code fences.\n\n{schema}\n\nReturn just the JSON:"
)


def lean_schema(node: Any) -> Any:
    """The schema without `title` and `description`, at every level.

    The engines ignore both, and in the prompt they only cost tokens and leak the
    lab's own commentary (a class docstring such as "a bias probe" would tell the
    model what is being measured).
    """
    if isinstance(node, dict):
        return {k: lean_schema(v) for k, v in node.items() if k not in ("title", "description")}
    if isinstance(node, list):
        return [lean_schema(v) for v in node]
    return node


def render_hint(schema: dict[str, Any], template: str | None = None) -> str:
    """The hint with the schema in place. A template without `{schema}` gets it appended: the shape is never lost."""
    text = (template or "").strip() or SCHEMA_HINT
    if "{schema}" not in text:
        text = f"{text}\n{{schema}}"
    # `str.replace`, not `str.format`: a visitor's template may hold other braces.
    return text.replace("{schema}", json.dumps(lean_schema(schema)))


class NoMask(LogitsProcessor):
    """The processor slot of the "none" mode: it returns the scores untouched, so the observers see no difference."""

    def reset(self) -> None:
        return None

    def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor) -> torch.FloatTensor:
        return scores


def engines_available() -> list[str]:
    """The constraint engines this build can run; XGrammar only when its package is installed."""
    return ["fsm", "cfg"] + (["xgr"] if xgr_engine.available() else [])


# outlines_core's regex builder accepts numeric bounds and then ignores them:
# `{"type": "integer", "minimum": 1, "maximum": 5}` becomes the regex of any
# integer. A bounded integer range that is small enough is the same thing as an
# enum, which the builder does honour, so the FSM engine compiles those as
# enums; everything else it cannot enforce is reported, and the final
# validation still catches it.
RANGE_KEYS = ("minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf")
MAX_RANGE_ENUM = 500


def fsm_schema(schema: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Return (the schema the FSM engine compiles, the paths of bounds it cannot enforce)."""
    ignored: list[str] = []

    def lo_hi(node: dict[str, Any]) -> tuple[int | None, int | None]:
        lo = node.get("minimum")
        hi = node.get("maximum")
        if "exclusiveMinimum" in node and isinstance(node["exclusiveMinimum"], (int, float)):
            lo = node["exclusiveMinimum"] + 1
        if "exclusiveMaximum" in node and isinstance(node["exclusiveMaximum"], (int, float)):
            hi = node["exclusiveMaximum"] - 1
        lo_i = int(lo) if lo is not None and float(lo).is_integer() else (int(lo) + 1 if lo is not None else None)
        hi_i = int(hi) if hi is not None and float(hi).is_integer() else (int(hi) if hi is not None else None)
        return lo_i, hi_i

    def walk(node: Any, path: str) -> Any:
        if isinstance(node, list):
            return [walk(item, f"{path}[{i}]") for i, item in enumerate(node)]
        if not isinstance(node, dict):
            return node
        out = {k: walk(v, f"{path}.{k}" if path else k) for k, v in node.items() if k not in ("properties", "$defs", "definitions")}
        for holder in ("properties", "$defs", "definitions"):
            if holder in node:
                out[holder] = {name: walk(sub, f"{path}.{name}" if path else name) for name, sub in node[holder].items()}
        bounds = [k for k in RANGE_KEYS if k in node]
        if not bounds:
            return out
        lo, hi = lo_hi(node)
        if node.get("type") == "integer" and "multipleOf" not in node and lo is not None and hi is not None and 0 <= hi - lo <= MAX_RANGE_ENUM:
            for k in RANGE_KEYS:
                out.pop(k, None)
            out["enum"] = list(range(lo, hi + 1))
            return out
        ignored.extend(f"{path or '$'}.{k}" for k in bounds)
        return out

    return walk(schema, ""), ignored


class BadPrefix(ValueError):
    """A prefix the constraint would never have produced, or one that cannot be continued."""

    def __init__(self, message: str, step: int | None = None, token_id: int | None = None) -> None:
        super().__init__(message)
        self.step = step
        self.token_id = token_id


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
    def xgr(self) -> xgr_engine.XGrammarCompiler:
        """Built on first use: XGrammar is optional and reads the whole vocabulary once."""
        if getattr(self, "_xgr", None) is None:
            self._xgr = xgr_engine.XGrammarCompiler(self.tokenizer, self.vocab_size)
        return self._xgr

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
        if mode == "xgr":
            return "xgr", recursive
        if mode == "none":
            return "none", recursive
        return ("cfg" if recursive else "fsm"), recursive

    def regex_for(self, schema: dict[str, Any]) -> str:
        return build_regex_from_schema(json.dumps(fsm_schema(schema)[0]), None)

    # ------------------------------------------------------------------ compile
    def compile(self, schema: dict[str, Any], mode: str = "auto") -> dict[str, Any]:
        resolved, recursive = self.resolve_mode(schema, mode)
        if resolved == "none":
            # Nothing is compiled: the schema travels in the prompt and only validates the result.
            return {
                "mode": "none",
                "backend": "none",
                "recursive": recursive,
                "fsm_ignored": [],
                "regex": None,
                "regex_error": None,
                "regex_length": 0,
                "vocab_size": self.vocab_size,
                "model_id": self.model_id,
                "char_fsm": None,
                "token_dfa": None,
                "grammar": None,
                "grammar_rules": 0,
                "grammar_source": None,
                "schema_hint": render_hint(schema),
            }
        regex: str | None
        regex_error: str | None = None
        try:
            regex = self.regex_for(schema)
        except Exception as exc:  # outlines_core rejects some schemas (unsupported keywords…)
            regex = None
            regex_error = f"{type(exc).__name__}: {exc}"
        _, unenforced = fsm_schema(schema)
        payload: dict[str, Any] = {
            "mode": resolved,
            "backend": BACKEND_NAME[resolved],
            "recursive": recursive,
            # Bounds the FSM engine has no regex for; the grammar engine enforces them.
            "fsm_ignored": unenforced if resolved == "fsm" else [],
            "regex": regex,
            "regex_error": regex_error,
            "regex_length": len(regex) if regex else 0,
            "vocab_size": self.vocab_size,
            "model_id": self.model_id,
            "char_fsm": None,
            "token_dfa": None,
            "grammar": None,
            "grammar_rules": 0,
            # "schema": a BNF reading the lab derives; "engine": the text the engine itself compiled.
            "grammar_source": None,
        }
        if resolved == "cfg":
            grammar = render_grammar(schema)
            payload["grammar"] = grammar["text"]
            payload["grammar_rules"] = grammar["rules"]
            payload["grammar_source"] = "schema"
        elif resolved == "xgr":
            text = xgr_engine.XGrammarCompiler.grammar_text(self.xgr.compile(schema))
            payload["grammar"] = text
            payload["grammar_rules"] = sum(1 for line in text.splitlines() if "::=" in line)
            payload["grammar_source"] = "engine"
        if regex is not None:
            payload["char_fsm"] = char_fsm_payload(regex)
            try:
                payload["token_dfa"] = token_dfa_payload(self.index_for(regex), self.token_text)
            except Exception as exc:
                payload["token_dfa_error"] = f"{type(exc).__name__}: {exc}"
        return payload

    # ------------------------------------------------------------------ generate
    def build_processor(self, schema: dict[str, Any], resolved: Mode):
        """Return (outlines processor, automaton-state getter, engine probe); the last two may be None."""
        if resolved == "none":
            return NoMask(), None, None
        if resolved == "fsm":
            proc = OutlinesCoreLogitsProcessor(self.index_for(self.regex_for(schema)), "torch")

            def state_getter() -> int | None:
                guides = getattr(proc, "_guides", None)
                return int(guides[0].get_state()) if guides else None

            return proc, state_getter, None
        if resolved == "xgr":
            mask = xgr_engine.XGrammarMask(self.xgr.compile(schema), self.vocab_size)
            eos = self.tokenizer.eos_token_id
            return mask, None, lambda: mask.probe(eos)
        # llguidance would otherwise accept unlimited whitespace between JSON
        # tokens; keep the output compact, the same shape outlines_core's
        # default `[ ]?` whitespace produces, so both engines are comparable.
        grammar_schema = dict(schema)
        grammar_schema["x-guidance"] = {"whitespace_flexible": False}
        proc = self.llg.get_json_schema_logits_processor(json.dumps(grammar_schema))

        # llguidance keeps no automaton state, but its matcher can say what the
        # grammar forces next and whether it would accept EOS from here.
        def probe() -> dict[str, Any]:
            matchers = getattr(proc, "ll_matchers", None)
            if not matchers:
                return {}
            matcher = matchers[0]
            return {
                "ff_token_ids": [int(t) for t in matcher.compute_ff_tokens()],
                "accepting": bool(matcher.is_accepting()),
            }

        return proc, None, probe

    def format_prompt(
        self,
        prompt: str,
        use_chat_template: bool,
        schema: dict[str, Any] | None = None,
        schema_hint: str | None = None,
    ) -> str:
        """The text the model sees. With `schema`, the shape is asked for in words: the "none" mode's substitute for a mask."""
        if schema is not None:
            prompt = f"{prompt}\n\n{render_hint(schema, schema_hint)}"
        template = getattr(self.tokenizer, "chat_template", None)
        if use_chat_template and template:
            return self.tokenizer.apply_chat_template(
                [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
                tokenize=False,
                add_generation_prompt=True,
                enable_thinking=ENABLE_THINKING,
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
        stop: threading.Event | None = None,
        prefix_token_ids: list[int] | None = None,
        schema_hint: str | None = None,
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        """Yield ("meta"|"step"|"done", payload) while decoding one sequence.

        The loop below is the plain autoregressive loop `model.generate` runs
        internally, written out so the processor chain is explicit:

            logits -> PreMaskObserver -> outlines mask -> MasterObserver -> sample

        `stop` ends the run at the next step. `prefix_token_ids` is a branch:
        those tokens are replayed first, teacher-forced through the very same
        chain (which advances the automaton or the parser exactly as the
        original run did), in one forward pass; their steps are marked
        `replayed`, and sampling starts after them. `schema_hint` is the
        "none" mode's wording for asking the shape in the prompt.
        """
        resolved, recursive = self.resolve_mode(schema, mode)
        proc, state_getter, probe = self.build_processor(schema, resolved)
        pre = PreMaskObserver()
        master = MasterObserver(pre, top_k=top_k_report, state_getter=state_getter, probe=probe)
        processors = LogitsProcessorList([pre, proc, master])
        # The blueprint's rule: clear observer history before every inference.
        master.reset()
        proc.reset()

        regex = None
        if resolved == "fsm":
            regex = self.regex_for(schema)
        elif resolved != "none":
            try:
                regex = self.regex_for(schema)
            except Exception:
                regex = None

        prompt_text = self.format_prompt(prompt, use_chat_template, schema if resolved == "none" else None, schema_hint)
        input_ids = self.tokenizer(prompt_text, return_tensors="pt").input_ids
        yield "meta", Meta(
            mode=resolved,
            backend=BACKEND_NAME[resolved],
            model_id=self.model_id,
            regex=regex,
            prompt_token_count=int(input_ids.shape[1]),
            vocab_size=self.vocab_size,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            recursive=recursive,
            schema_in_prompt=resolved == "none",
            prompt_text=prompt_text,
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

        def record_step(i: int, next_id: int, replayed: bool) -> dict[str, Any]:
            nonlocal partial
            rec = master.records[-1]
            is_eos = next_id == eos_id
            if not is_eos:
                generated.append(next_id)
                partial = self.tokenizer.decode(generated)
            p_o, p_f = master.probs_for(i, next_id)
            return Step(
                i=i,
                token_id=next_id,
                token=self.token_raw(next_id),
                text="" if is_eos else self.token_text(next_id),  # the UI renders "" as ⟨eos⟩
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
                ff_token_ids=rec.get("ff_token_ids", []),
                # llguidance reports token ids, XGrammar a string; either way the UI shows text.
                ff_text=rec.get("ff_text") or (self.tokenizer.decode(rec["ff_token_ids"]) if rec.get("ff_token_ids") else ""),
                accepting=rec.get("accepting"),
                replayed=replayed,
            ).to_dict()

        prefix = [int(t) for t in (prefix_token_ids or [])]
        if eos_id in prefix:
            raise BadPrefix("the prefix already ends the sequence", step=prefix.index(eos_id), token_id=eos_id)
        if len(prefix) >= max_new_tokens:
            raise BadPrefix(f"the prefix has {len(prefix)} tokens and max_new_tokens is {max_new_tokens}")
        first = 0
        pending_logits: torch.Tensor | None = None
        with torch.no_grad():
            if prefix:
                # One pass over prompt + prefix; the processors still see the
                # sequence grow one token at a time, which is how they advance.
                ids = torch.cat([input_ids, torch.tensor([prefix], dtype=input_ids.dtype)], dim=1)
                p_len = int(input_ids.shape[1])
                out = self.model(input_ids=ids, use_cache=True)
                for j, tok in enumerate(prefix):
                    logits = out.logits[:, p_len - 1 + j, :].float()
                    scores = processors(ids[:, : p_len + j], logits)
                    if not torch.isfinite(scores[0, tok]):
                        raise BadPrefix(f"token {tok} ({self.token_text(tok)!r}) is masked at step {j}", step=j, token_id=tok)
                    yield "step", record_step(j, tok, replayed=True)
                all_ids = ids
                past = out.past_key_values
                pending_logits = out.logits[:, -1, :].float()
                first = len(prefix)

            for i in range(first, max_new_tokens):
                if stop is not None and stop.is_set():
                    stopped_by = "stopped"
                    break
                if pending_logits is not None:
                    logits = pending_logits
                    pending_logits = None
                else:
                    out = self.model(input_ids=cur_ids, past_key_values=past, use_cache=True)
                    past = out.past_key_values
                    logits = out.logits[:, -1, :].float()
                scores = processors(all_ids, logits)
                next_id = self._sample(scores, temperature, top_k_sampling, generator)
                yield "step", record_step(i, next_id, replayed=False)
                if next_id == eos_id:
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
