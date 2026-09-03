"""An offline stand-in for the real model, used by the tests and local dev.

It is the same kind of object the Space runs (a `Qwen2ForCausalLM` + a
byte-level BPE `PreTrainedTokenizerFast`), only tiny and randomly initialised,
so the whole pipeline — outlines vocabulary, Index, mask, observers, SSE — is
exercised without downloading anything. Its probabilities are meaningless.
"""

from __future__ import annotations

import json
import random

import torch
from tokenizers import Tokenizer, models, pre_tokenizers, decoders, trainers
from transformers import PreTrainedTokenizerFast, Qwen2Config, Qwen2ForCausalLM

EOS = "<|endoftext|>"


def _corpus(seed: int = 0, n: int = 400) -> list[str]:
    rng = random.Random(seed)
    words = [
        "name", "age", "city", "value", "children", "items", "sku", "qty", "unit_price", "paid",
        "invoice_id", "customer", "Ada", "Lovelace", "Grace", "Hopper", "London", "Paris", "Turing",
        "true", "false", "null", "the", "a", "of", "and", "JSON", "object", "extract", "write",
    ]
    lines = []
    for _ in range(n):
        obj = {
            rng.choice(words): rng.choice([rng.randint(0, 999), rng.choice(words), rng.random() * 100, True, False]),
            rng.choice(words): [rng.randint(0, 99) for _ in range(rng.randint(0, 3))],
        }
        lines.append(json.dumps(obj))
        lines.append(" ".join(rng.choice(words) for _ in range(rng.randint(3, 10))))
    return lines


def build_toy_tokenizer(vocab_size: int = 700) -> PreTrainedTokenizerFast:
    tok = Tokenizer(models.BPE(unk_token=None))
    tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    tok.decoder = decoders.ByteLevel()
    trainer = trainers.BpeTrainer(
        vocab_size=vocab_size,
        special_tokens=[EOS],
        initial_alphabet=pre_tokenizers.ByteLevel.alphabet(),
        show_progress=False,
    )
    tok.train_from_iterator(_corpus(), trainer=trainer)
    fast = PreTrainedTokenizerFast(tokenizer_object=tok, eos_token=EOS, pad_token=EOS, bos_token=None)
    return fast


def build_toy_model(tokenizer: PreTrainedTokenizerFast, seed: int = 0) -> Qwen2ForCausalLM:
    torch.manual_seed(seed)
    config = Qwen2Config(
        vocab_size=len(tokenizer),
        hidden_size=64,
        intermediate_size=128,
        num_hidden_layers=2,
        num_attention_heads=4,
        num_key_value_heads=2,
        max_position_embeddings=1024,
        tie_word_embeddings=True,
        eos_token_id=tokenizer.eos_token_id,
        pad_token_id=tokenizer.eos_token_id,
    )
    model = Qwen2ForCausalLM(config)
    model.eval()
    return model
