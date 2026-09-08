"""Model loading, schema compilation and the observed generation loop."""

from __future__ import annotations

import json
import os
import threading
import time
from collections import OrderedDict
from contextlib import contextmanager
from typing import Any, Callable, Iterator

import outlines
import torch
from outlines.backends.outlines_core import OutlinesCoreBackend, OutlinesCoreLogitsProcessor
from outlines_core import Index
from outlines_core.json_schema import build_regex_from_schema
from transformers import AutoModelForCausalLM, AutoTokenizer, LogitsProcessorList

from .fsm import char_fsm_payload, token_dfa_payload
from .presets import is_recursive
from .spy import MasterObserver, PreMaskObserver, TimedProcessor
from .tracing import Constraint, Done, EngineBackend, Meta, Mode, Step, Summary, Timing, TopEntry, json_stack_depth
from .validate import legacy_error, validate_text

DEFAULT_MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"
TOY_MODEL_ID = "toy/qwen2-random-64d"
DEFAULT_COMPARE_TOKENIZER_ID = "openai-community/gpt2"
SYSTEM_PROMPT = "You are a JSON generator. Reply with a single JSON object and nothing else."
SCHEMA_IN_PROMPT = (
    "{prompt}\n\nRespond with a single JSON object that matches this JSON Schema, and nothing else:\n{schema}"
)
# "JSON mode": any JSON object is fine, the schema is not enforced.
PERMISSIVE_JSON_SCHEMA: dict[str, Any] = {"type": "object"}
INDEX_CACHE_SIZE = 16


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
            self.model = AutoModelForCausalLM.from_pretrained(model_id, dtype=torch.float32)
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
        # Added tokens (chat-template markers, EOS…). `special_tokens_mask` only
        # flags what the post-processor adds, so this set is what "special" means.
        self.added_ids = frozenset(int(i) for i in self.tokenizer.get_added_vocab().values())
        self.compare_tokenizer_id = os.environ.get("COMPARE_TOKENIZER_ID", DEFAULT_COMPARE_TOKENIZER_ID)
        self._compare_tokenizer = None
        self._compare_error: str | None = None
        self._merge_ranks: dict[tuple[str, str], int] | None = None
        self._merge_ranks_checked = False
        self._model_info: dict[str, Any] | None = None
        self._aux_lock = threading.Lock()

    # ------------------------------------------------------------------ helpers
    @property
    def llg(self):
        if self._llg is None:
            from outlines.backends.llguidance import LLGuidanceBackend

            self._llg = LLGuidanceBackend(self.outlines_model)
        return self._llg

    def index_for(self, regex: str) -> tuple[Index, bool]:
        """Return (index, cached): the token-level automaton for `regex`, built once per vocabulary."""
        cached = self._index_cache.get(regex)
        if cached is not None:
            self._index_cache.move_to_end(regex)
            return cached, True
        index = Index(regex, self.core.vocabulary)
        self._index_cache[regex] = index
        while len(self._index_cache) > INDEX_CACHE_SIZE:
            self._index_cache.popitem(last=False)
        return index, False

    def token_text(self, token_id: int) -> str:
        return self.tokenizer.decode([token_id])

    def token_raw(self, token_id: int) -> str:
        tok = self.tokenizer.convert_ids_to_tokens(token_id)
        return tok if isinstance(tok, str) else str(tok)

    def model_info(self) -> dict[str, Any]:
        """Static facts about the loaded model (cached)."""
        if self._model_info is None:
            cfg = self.model.config
            embed = self.model.get_input_embeddings().weight
            head = self.model.get_output_embeddings().weight
            rope = getattr(cfg, "rope_parameters", None)
            rope_theta = rope.get("rope_theta") if isinstance(rope, dict) else getattr(cfg, "rope_theta", None)
            gen = getattr(self.model, "generation_config", None)
            default_sampling = {
                key: getattr(gen, key, None)
                for key in ("do_sample", "temperature", "top_p", "top_k", "repetition_penalty")
            }
            self._model_info = {
                "n_layers": int(cfg.num_hidden_layers),
                "n_heads": int(cfg.num_attention_heads),
                "n_kv_heads": int(getattr(cfg, "num_key_value_heads", cfg.num_attention_heads)),
                "hidden_size": int(cfg.hidden_size),
                "intermediate_size": int(getattr(cfg, "intermediate_size", 0)),
                # parameters() de-duplicates shared tensors, so the tied matrix counts once
                "n_params": int(sum(p.numel() for p in self.model.parameters())),
                "n_params_embedding": int(embed.numel()),
                "tied_embeddings": bool(getattr(cfg, "tie_word_embeddings", False)) and embed.data_ptr() == head.data_ptr(),
                "rope_theta": rope_theta,
                "rms_norm_eps": getattr(cfg, "rms_norm_eps", None),
                "tokenizer_entries": int(len(self.tokenizer)),
                "padding_rows": int(self.vocab_size - len(self.tokenizer)),
                "eos_token_id": self.tokenizer.eos_token_id,
                "default_sampling": default_sampling,
            }
        info = dict(self._model_info)
        info["attn_implementation"] = self.attn_implementation
        return info

    @property
    def attn_implementation(self) -> str | None:
        return getattr(self.model.config, "_attn_implementation", None)

    @contextmanager
    def eager_attention(self):
        """Run the model with eager attention (the only implementation that returns the weights)."""
        prev = self.attn_implementation
        if prev == "eager":
            yield
            return
        self._set_attn(prev, "eager")
        try:
            yield
        finally:
            self._set_attn("eager", prev or "sdpa")

    def _set_attn(self, current: str | None, target: str) -> None:
        setter = getattr(self.model, "set_attn_implementation", None)
        if callable(setter):
            setter(target)
        else:  # older transformers: the config attribute is what the layers read
            self.model.config._attn_implementation = target

    def merge_ranks(self) -> dict[tuple[str, str], int] | None:
        """BPE merge table as {(a, b): rank}, or None when the tokenizer is not a plain BPE model."""
        with self._aux_lock:
            if self._merge_ranks_checked:
                return self._merge_ranks
            self._merge_ranks_checked = True
            try:
                model = json.loads(self.tokenizer.backend_tokenizer.to_str())["model"]
            except Exception:
                return None
            if model.get("type") != "BPE" or model.get("ignore_merges") or model.get("byte_fallback") or model.get("dropout"):
                return None
            ranks: dict[tuple[str, str], int] = {}
            for i, merge in enumerate(model.get("merges", [])):
                pair = tuple(merge) if isinstance(merge, list) else tuple(merge.split(" ", 1))
                if len(pair) == 2:
                    ranks[(pair[0], pair[1])] = i
            self._merge_ranks = ranks
            return ranks

    def compare_tokenizer(self):
        """The second tokenizer (GPT-2 by default) used to contrast splits; loaded lazily from the Hub."""
        with self._aux_lock:
            if self._compare_tokenizer is not None:
                return self._compare_tokenizer
            if self._compare_error is not None:
                raise RuntimeError(self._compare_error)
            if not self.compare_tokenizer_id:
                self._compare_error = "comparison tokenizer disabled (COMPARE_TOKENIZER_ID is empty)"
                raise RuntimeError(self._compare_error)
            try:
                self._compare_tokenizer = AutoTokenizer.from_pretrained(self.compare_tokenizer_id)
            except Exception as exc:
                self._compare_error = f"comparison tokenizer unavailable: {type(exc).__name__}: {exc}"
                raise RuntimeError(self._compare_error) from exc
            return self._compare_tokenizer

    @staticmethod
    def resolve_mode(schema: dict[str, Any], mode: str) -> tuple[Mode, bool]:
        recursive = is_recursive(schema)
        if mode == "fsm":
            return "fsm", recursive
        if mode == "cfg":
            return "cfg", recursive
        return ("cfg" if recursive else "fsm"), recursive

    def resolve(self, schema: dict[str, Any], mode: str, constraint: Constraint) -> tuple[Mode, bool]:
        if constraint == "none":
            return "none", is_recursive(schema)
        if constraint == "json":
            return "json", is_recursive(schema)
        return self.resolve_mode(schema, mode)

    @staticmethod
    def backend_for(resolved: Mode) -> EngineBackend:
        return {"fsm": "outlines_core", "cfg": "llguidance", "json": "llguidance", "none": "none"}[resolved]

    @staticmethod
    def constraint_for(resolved: Mode) -> Constraint:
        return {"fsm": "schema", "cfg": "schema", "json": "json", "none": "none"}[resolved]

    def regex_for(self, schema: dict[str, Any]) -> str:
        return build_regex_from_schema(json.dumps(schema), None)

    # ------------------------------------------------------------------ compile
    def compile(self, schema: dict[str, Any], mode: str = "auto", constraint: Constraint = "schema") -> dict[str, Any]:
        resolved, recursive = self.resolve(schema, mode, constraint)
        regex: str | None
        regex_error: str | None = None
        try:
            regex = self.regex_for(schema)
        except Exception as exc:  # outlines_core rejects some schemas (unsupported keywords…)
            regex = None
            regex_error = f"{type(exc).__name__}: {exc}"
        backend = self.backend_for(resolved)
        payload: dict[str, Any] = {
            "mode": resolved,
            "constraint": self.constraint_for(resolved),
            "backend": backend,
            "engine_backend": backend,
            "recursive": recursive,
            "regex": regex,
            "regex_error": regex_error,
            "regex_length": len(regex) if regex else 0,
            "vocab_size": self.vocab_size,
            "model_id": self.model_id,
            "char_fsm": None,
            "token_dfa": None,
        }
        if resolved == "none":
            payload["note"] = "no constraint: the regex is shown for reference only, nothing is enforced"
        elif resolved == "json":
            payload["note"] = "JSON mode: any JSON object is allowed; the schema is not enforced"
        elif regex is not None:
            payload["char_fsm"] = char_fsm_payload(regex)
            try:
                payload["token_dfa"] = token_dfa_payload(self.index_for(regex)[0], self.token_text)
            except Exception as exc:
                payload["token_dfa_error"] = f"{type(exc).__name__}: {exc}"
        return payload

    # ------------------------------------------------------------------ generate
    def build_processor(self, schema: dict[str, Any], resolved: Mode):
        """Return (processor or None, automaton state getter or None, compile_ms, compile_cached)."""
        started = time.perf_counter()
        if resolved == "none":
            return None, None, 0.0, None
        if resolved == "fsm":
            index, cached = self.index_for(self.regex_for(schema))
            proc = OutlinesCoreLogitsProcessor(index, "torch")

            def state_getter() -> int | None:
                guides = getattr(proc, "_guides", None)
                return int(guides[0].get_state()) if guides else None

            return proc, state_getter, (time.perf_counter() - started) * 1000.0, cached
        # llguidance would otherwise accept unlimited whitespace between JSON
        # tokens; keep the output compact, the same shape outlines_core's
        # default `[ ]?` whitespace produces, so both engines are comparable.
        grammar_schema = dict(PERMISSIVE_JSON_SCHEMA if resolved == "json" else schema)
        grammar_schema["x-guidance"] = {"whitespace_flexible": False}
        proc = self.llg.get_json_schema_logits_processor(json.dumps(grammar_schema))
        return proc, None, (time.perf_counter() - started) * 1000.0, False

    @staticmethod
    def compose_prompt(prompt: str, schema: dict[str, Any], schema_in_prompt: bool) -> str:
        if not schema_in_prompt:
            return prompt
        return SCHEMA_IN_PROMPT.format(prompt=prompt, schema=json.dumps(schema))

    def format_prompt(self, prompt: str, use_chat_template: bool) -> str:
        template = getattr(self.tokenizer, "chat_template", None)
        if use_chat_template and template:
            return self.tokenizer.apply_chat_template(
                [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
                tokenize=False,
                add_generation_prompt=True,
            )
        return prompt

    def encode(self, text: str, use_chat_template: bool = False) -> tuple[str, list[int]]:
        """Render (chat template or not) and tokenize the way `generate` does."""
        rendered = self.format_prompt(text, use_chat_template)
        return rendered, [int(i) for i in self.tokenizer(rendered, add_special_tokens=False)["input_ids"]]

    def _top_entries(self, entries: list[tuple[int, float, bool]]) -> list[TopEntry]:
        return [
            TopEntry(token_id=t, token=self.token_raw(t), text=self.token_text(t), p=p, allowed=a)
            for t, p, a in entries
        ]

    def warm_up(self) -> None:
        """Pay the one-off costs (Guide setup, llguidance's dynamo fallback) before the first visitor."""
        from .presets import PRESETS

        preset = PRESETS["person"]
        with self.lock:
            for constraint in ("schema", "json"):
                for _ in self.generate(
                    preset["schema"], preset["prompt"], constraint=constraint, max_new_tokens=2, include_steps=False
                ):
                    pass

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
        constraint: Constraint = "schema",
        top_p: float = 1.0,
        schema_in_prompt: bool = False,
        include_steps: bool = True,
        stop: threading.Event | None = None,
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        """Yield ("meta"|"step"|"done", payload) while decoding one sequence.

        The loop below is the plain autoregressive loop `model.generate` runs
        internally, written out so the processor chain is explicit:

            logits -> PreMaskObserver -> [constraint mask] -> MasterObserver -> sample
        """
        resolved, recursive = self.resolve(schema, mode, constraint)
        engine_backend = self.backend_for(resolved)
        inner, state_getter, compile_ms, compile_cached = self.build_processor(schema, resolved)
        pre = PreMaskObserver()
        master = MasterObserver(pre, top_k=top_k_report, state_getter=state_getter)
        timed = TimedProcessor(inner) if inner is not None else None
        processors = LogitsProcessorList([pre, timed, master] if timed is not None else [pre, master])
        # The blueprint's rule: clear observer history before every inference.
        master.reset()
        if timed is not None:
            timed.reset()

        regex: str | None
        try:
            regex = self.regex_for(schema)
        except Exception:
            if resolved == "fsm":
                raise
            regex = None

        user_prompt = self.compose_prompt(prompt, schema, schema_in_prompt)
        prompt_text = self.format_prompt(user_prompt, use_chat_template)
        input_ids = self.tokenizer(prompt_text, return_tensors="pt", add_special_tokens=False).input_ids
        sampling = {"temperature": temperature, "top_k": top_k_sampling, "top_p": top_p, "seed": seed}
        yield "meta", Meta(
            mode=resolved,
            backend=engine_backend,
            model_id=self.model_id,
            regex=regex,
            prompt_token_count=int(input_ids.shape[1]),
            vocab_size=self.vocab_size,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            recursive=recursive,
            constraint=self.constraint_for(resolved),
            engine_backend=engine_backend,
            sampling=sampling,
            schema_in_prompt=schema_in_prompt,
            use_chat_template=use_chat_template,
            prompt_rendered=prompt_text,
            compile_ms=compile_ms,
            compile_cached=compile_cached,
            include_steps=include_steps,
        ).to_dict()

        generator = torch.Generator().manual_seed(seed) if seed is not None else None
        eos_id = self.tokenizer.eos_token_id
        generated: list[int] = []
        partial = ""
        stop_reason = "max_new_tokens"
        started = time.perf_counter()
        all_ids = input_ids
        cur_ids = input_ids
        past = None
        forward_ms: list[float] = []
        mask_ms: list[float] = []
        observer_ms: list[float] = []
        sample_ms: list[float] = []
        dt_ms: list[float] = []
        n_overridden = 0
        n_argmax_taken = 0
        vocab_kept_sum = 0.0
        mass_removed_sum = 0.0
        min_n_allowed = self.vocab_size
        max_stack_depth = 0
        with torch.no_grad():
            for i in range(max_new_tokens):
                if stop is not None and stop.is_set():
                    stop_reason = "stopped"
                    break
                t0 = time.perf_counter()
                out = self.model(input_ids=cur_ids, past_key_values=past, use_cache=True)
                past = out.past_key_values
                logits = out.logits[:, -1, :].float()
                t1 = time.perf_counter()
                scores = processors(all_ids, logits)
                t2 = time.perf_counter()
                next_id = self._sample(scores, temperature, top_k_sampling, top_p, generator)
                t3 = time.perf_counter()

                rec = master.records[-1]
                step_mask_ms = timed.last_ms if timed is not None else 0.0
                step_forward_ms = (t1 - t0) * 1000.0
                step_observer_ms = max(0.0, (t2 - t1) * 1000.0 - step_mask_ms)
                step_sample_ms = (t3 - t2) * 1000.0
                step_dt_ms = (t3 - t0) * 1000.0
                forward_ms.append(step_forward_ms)
                mask_ms.append(step_mask_ms)
                observer_ms.append(step_observer_ms)
                sample_ms.append(step_sample_ms)
                dt_ms.append(step_dt_ms)

                was_overridden = not rec["argmax_allowed"]
                argmax_taken = next_id == rec["argmax_raw"]
                n_overridden += int(was_overridden)
                n_argmax_taken += int(argmax_taken)
                vocab_kept_sum += rec["n_allowed"] / max(rec["vocab_size"], 1)
                mass_removed_sum += rec["mass_removed"]
                min_n_allowed = min(min_n_allowed, rec["n_allowed"])

                raw_token = self.token_raw(next_id)
                is_eos = next_id == eos_id
                if not is_eos:
                    generated.append(next_id)
                    partial = self.tokenizer.decode(generated)
                depth = json_stack_depth(partial)
                max_stack_depth = max(max_stack_depth, depth)
                if include_steps:
                    p_o, p_f = master.probs_for(i, next_id)
                    yield "step", Step(
                        i=i,
                        token_id=next_id,
                        token=raw_token,
                        text="" if is_eos else self.token_text(next_id),  # the UI renders "" as ⟨eos⟩
                        partial_text=partial,
                        n_allowed=rec["n_allowed"],
                        vocab_size=rec["vocab_size"],
                        mass_removed=rec["mass_removed"],
                        top_original=self._top_entries(rec["top_original"]),
                        top_forced=self._top_entries(rec["top_forced"]),
                        fsm_state=rec["fsm_state"],
                        stack_depth=depth,
                        was_overridden=was_overridden,
                        p_original=p_o,
                        p_forced=p_f,
                        argmax_taken=argmax_taken,
                        dt_ms=step_dt_ms,
                        forward_ms=step_forward_ms,
                        mask_ms=step_mask_ms,
                        observer_ms=step_observer_ms,
                        sample_ms=step_sample_ms,
                    ).to_dict()
                if is_eos:
                    stop_reason = "eos"
                    break
                cur_ids = torch.tensor([[next_id]], dtype=all_ids.dtype)
                all_ids = torch.cat([all_ids, cur_ids], dim=1)

        elapsed = time.perf_counter() - started
        n_steps = len(master.records)
        validation = validate_text(partial, schema, stop_reason)
        decode_total = sum(forward_ms[1:])
        dt_total = sum(dt_ms)
        timing = Timing(
            compile_ms=compile_ms,
            compile_cached=compile_cached,
            prefill_ms=forward_ms[0] if forward_ms else 0.0,
            decode_ms=decode_total,
            forward_ms=sum(forward_ms),
            processor_ms=sum(mask_ms),
            observer_ms=sum(observer_ms),
            sample_ms=sum(sample_ms),
            total_ms=compile_ms + dt_total,
            n_prompt_tokens=int(input_ids.shape[1]),
            n_new_tokens=len(generated),
            tokens_per_s=(n_steps / (dt_total / 1000.0)) if dt_total > 0 else 0.0,
            decode_tokens_per_s=((n_steps - 1) / (decode_total / 1000.0)) if decode_total > 0 and n_steps > 1 else 0.0,
            first_token_ms=compile_ms + (dt_ms[0] if dt_ms else 0.0),
            torch_threads=int(torch.get_num_threads()),
        )
        summary = Summary(
            n_overridden=n_overridden,
            n_argmax_taken=n_argmax_taken,
            mean_vocab_kept=(vocab_kept_sum / n_steps) if n_steps else 0.0,
            mean_mass_removed=(mass_removed_sum / n_steps) if n_steps else 0.0,
            min_n_allowed=min_n_allowed if n_steps else 0,
            max_stack_depth=max_stack_depth,
        )
        yield "done", Done(
            text=partial,
            parsed=validation.parsed if validation.raw_parse_ok else None,
            valid=validation.raw_parse_ok and validation.raw_schema_ok,
            validation_error=legacy_error(partial, schema),
            n_steps=n_steps,
            elapsed_s=elapsed,
            stopped_by=stop_reason,
            tokens=[{"token_id": t, "token": self.token_raw(t), "text": self.token_text(t)} for t in generated],
            mode=resolved,
            engine_backend=engine_backend,
            stop_reason=stop_reason,
            validation=validation.to_dict(),
            timing=timing.to_dict(),
            summary=summary.to_dict(),
        ).to_dict()
        master.reset()
        if timed is not None:
            timed.reset()

    @staticmethod
    def _sample(
        scores: torch.Tensor,
        temperature: float,
        top_k: int,
        top_p: float,
        generator: torch.Generator | None,
    ) -> int:
        """Greedy when T <= 0; otherwise temperature -> top-k -> top-p -> multinomial (the HF warper order)."""
        row = scores[0]
        if temperature <= 0:
            return int(torch.argmax(row).item())
        logits = row / temperature
        if top_k and top_k > 0:
            k = min(top_k, logits.numel())
            kth = torch.topk(logits, k).values[-1]
            logits = torch.where(logits < kth, torch.full_like(logits, float("-inf")), logits)
        probs = torch.softmax(logits, dim=-1)
        if top_p is not None and 0 < top_p < 1:
            sorted_p, order = torch.sort(probs, descending=True)
            cumulative_before = torch.cumsum(sorted_p, dim=-1) - sorted_p
            keep_sorted = cumulative_before < top_p  # always keeps the first token
            keep = torch.zeros_like(keep_sorted).scatter(0, order, keep_sorted)
            probs = torch.where(keep, probs, torch.zeros_like(probs))
            total = probs.sum()
            if total > 0:
                probs = probs / total
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
