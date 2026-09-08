# Structured outputs: how an LLM is forced to emit valid JSON

*The last centimetre of the transformer.*

- **Length:** 45 min (40 talk + 5 buffer / Q&A). Hard stop at 50.
- **Audience:** developers who have called LLM APIs and never looked inside one. No maths beyond multiply, add and `exp`.
- **Demos:** live, from this repo. `/fsm` (Lab 1) and `/time-machine` (Lab 2), backend on the laptop.
- **Deck:** `deck.md` (Marp). Figures in `out/`. Slide numbers below refer to the deck.

## The spine

Everything the audience should be able to redraw on a napkin afterwards:

```
text → tokens → one vector per token → 24 blocks → one vector h
     → 151,936 numbers (logits) → softmax → sample → append → repeat
```

Structured output is one line written into the logits vector, right before softmax:

```
logits[forbidden] = -inf        # exp(-inf) = 0
```

Blocks 1–3 exist only so the audience knows *what* is being edited. Blocks 5–7 answer the one remaining question: *who decides what is forbidden?* First an automaton (FSM). Then, when the automaton cannot count, a grammar with a stack (CFG).

**Speaker rules**

- If a block runs long, cut from blocks 1–3 (scaffolding). Never cut from blocks 4–7 (centre of gravity).
- Hard checkpoint: be on the mask (slide 14) by minute 21.
- Exactly **one** live generation (Person, FSM, 23 tokens, 6.8 s measured with `TORCH_THREADS=10`). Every other run is pre-recorded in its own browser tab during setup.
- The live wait is narrated, not hidden: "one forward pass per token, that is the loop at the bottom of figure 01".

## Timing

| # | Block | Time | The one idea | Demo | Slides | Figure |
|---|---|---|---|---|---|---|
| 0 | Hook | 0:00–3:00 | A prompt can make `{` likely. It cannot make `Sure` impossible. | none | 1–3 | 03 (crop) |
| 1 | Tokens | 3:00–8:00 | The model reads and writes whole tokens, not characters. So will the automaton. | Time Machine, Person tab: the coloured final JSON | 4–6 | 00a |
| 2 | Embeddings | 8:00–11:00 | A token is a row in a 151,936 × 896 table. The same table is used again at the exit. | none | 7 | 00b |
| 3 | Transformer, intuition only | 11:00–15:00 | 24 blocks correct one running vector per position, looking only backwards. Out comes `h`. | none | 8–9 | 01 |
| 4 | Output stage: logits, softmax | 15:00–21:00 | One dot product per vocabulary entry. Softmax turns gaps into ratios. Sampling never sees the logits, only softmax of them. | Time Machine, step 0, "Original intent" panel | 10–13 | 02, 03 |
| 5 | The mask | 21:00–26:00 | `exp(-inf) = 0`. Forbidden tokens are not unlikely, they are impossible. | **LIVE** Person / FSM | 14–18 | 04, 06 |
| 6 | Who decides: the FSM | 26:00–33:00 | The mask is not computed from the text. It is read off an automaton state, precomputed once per (schema, vocabulary). | `/fsm` Person; Time Machine path strip | 19–23 | 05 |
| 7 | When the FSM cannot: the CFG | 33:00–39:00 | A regex cannot count. A grammar carries a stack. Pick the engine by the schema's shape. | `/fsm` Tree; Time Machine Tree ×2 (pre-recorded) | 24–27 | 07 |
| 8 | So what | 39:00–43:00 | Constraints buy syntax, not truth. Choose by shape. Pay the compile once. Validate anyway. | none | 28–30 | — |
| 9 | Close + Q&A | 43:00–45:00 | The vocabulary enters and leaves through the same table. The schema stands at the exit. | none | 31 | 00b callback |

## Block by block

### 0 · Hook (0:00–3:00)

Open on the probability panel of figure 03: the first-token distribution for *"Extract the person as JSON: Ada Lovelace, 36, London."*

> "This is the model choosing its very first character. `{` at 68%. `Sure` at 23%. Every one of you has written the regex that strips the ` ```json ` fence and the *Sure, here is your JSON* preamble. That regex exists because of the second bar. This talk is about that bar: where it comes from, and how to make it not small but exactly zero. Not persuaded away. Removed."

Contract with the room: "To do that I need to show you what a logit is. That takes twenty minutes. Then we spend twenty minutes in the last centimetre, with the lab running live."

Figure 03's numbers are illustrative, but the measured distribution (2026-09-06, this model, the Person prompt, chat template on) has almost the same shape: `{⏎` 68.5%, ` ``` ` 23.0%, `{}` 3.4%, `{"` 3.3%. The second bar is not "Sure": it is the markdown fence you have all stripped. Say it that way and the live step-0 panel will back you up. For the Tree prompt the fence is at 97.2%.

**Transition →** "To remove that bar I have to reach into the model. First question: what is it even choosing between? Not characters."

### 1 · Tokens (3:00–8:00)

- The tokenizer has 151,665 entries (151,643 from 151,387 BPE merges, plus 22 special tokens). Byte-level BPE: start from the 256 byte values, merge the most frequent adjacent pair, repeat. Frequent things become one token: ` is` is `i`+`s` (merge #29) then `Ġ`+`is` (merge #118), id 374. Rare things stay in pieces.
- A token can straddle a JSON boundary: `{"`, `":`, `",` are single tokens. Structural characters and content share tokens.
- The glyphs: a leading space is spelled `Ġ`, newline `Ċ`, tab `ĉ` in the string form of the vocabulary. The model only sees ids. (`backend/app/tracing.py`, `BPE_GLYPHS`.)
- **Digits (verified 2026-09-06 with the real tokenizer).** Qwen2's pre-tokenizer splits numbers one digit per token: ` 36` is `Ġ` + `3` + `6` (ids 220, 18, 21), ` 1985` is five tokens. Figures 01 and 05 currently show `␠36` as one token and must be fixed (risk 7). Use it as the teaching beat: "tokenization is a design choice; this model spells 36 as two tokens, GPT-2 spells it as one."
- **Vocabulary size, if someone asks.** The tokenizer has 151,665 entries; the logits vector has 151,936. The extra 271 rows are padding in the embedding matrix and never correspond to a token; the mask forbids them like everything else.

**Demo (45 s).** Time Machine, pre-recorded Person tab. Scroll to *Text so far*: the final JSON with one pastel per token. Ask the room to count before you reveal. Point at `":` and at the digits. Hover a token for its id and raw form. Do not scrub yet.

Plant: "The automaton will have to walk over these coloured pieces, not over characters. Hold that thought until slide 21."

**Transition →** "So the model's world is 151,936 tokens. What does it do with a token id? It looks it up."

### 2 · Embeddings (8:00–11:00)

- `E` is a 151,936 × 896 table. One learned vector per token. Look-up, not arithmetic: `E[token_id]`.
- 151,936 × 896 = 136,134,656 numbers, 27.6% of the 494,032,768 parameters, is just the vocabulary table.
- Learned, not designed: rows for tokens used in similar places end up near each other. (Do not show a 2-D projection. It invites questions you do not want at minute 9.)
- **Plant:** in Qwen2.5-0.5B the same table is used again at the exit (`tie_word_embeddings`). Say "remember this" and come back at slide 10 and slide 31.

> "The model has no idea what `Ada` is. It has 896 numbers it learned to put next to `Ada`."

**Transition →** "Now we have one vector per token. Twenty-four blocks later we still have one vector per token, just a much better one. Here is the whole machine on one page. We walk it once."

### 3 · Transformer, intuition only (11:00–15:00)

Figure 01, left to right, 90 seconds:

1. Tokens → ids.
2. Embedding + position → one vector per token (5 × 896).
3. 24 blocks on the residual stream. Each block reads the running vector and adds a correction back: `x ← x + attn(x)`, `x ← x + mlp(x)`. Attention: each position looks at the positions before it and copies what is useful. MLP: each position thinks on its own. Every position sees only the past.
4. Output layer: the last position's vector `h`, one matrix, 151,936 logits, softmax, sample. The sampled token is appended and the whole thing runs again.

Use the figure's own caption: "Everything structured output does happens in the last centimetre of this picture. The blocks are untouched."

Slide 9 (attention / residual stream in one breath) is skippable if late. Figure 01 already says it.

**Transition →** "Everything I care about is in the bottom-right corner: one vector `h`, one matrix, 151,936 numbers."

### 4 · Output stage: logits and softmax (15:00–21:00)

- **Figure 02.** `z = W_U · h`. One dot product per vocabulary entry gives 151,936 scores: the logits. Any real number; the scale is arbitrary; the gaps matter, not the values. Callback: `W_U` *is* the table from block 2. A logit is "how much does `h` look like the embedding of token *i*". Say this explicitly; it is the payoff of the embeddings slide.
- **Figure 03.** Softmax: exponentiate, then divide by the sum. `p_i = exp(z_i / T) / Σ_j exp(z_j / T)`. A 1.1 logit gap became a 3× probability gap. The long tail still holds real mass in aggregate; sampling occasionally lands there.
- **Temperature.** `T → 0` picks the max (greedy). `T = 1` is the model's own belief. `T > 1` flattens. The lab runs `T = 0` so runs are reproducible; mention once.
- **Greedy vs sampling, one sentence:** greedy picks the max; sampling rolls a loaded die weighted by the softmax. Neither can land on a probability of exactly 0, so the mask works the same under both.
- **The hinge of the talk, said twice:** sampling never sees `z`. It sees `softmax(z)`. And `exp(-inf) = 0`.

**Demo (60 s).** Time Machine, Person tab, scrub to step 0, left panel *Original intent* (raw logits → softmax). Measured: `{⏎` 68.5%, ` ``` ` 23.0%, `{}` 3.4%, `{"` 3.3%, `{` 1.1%. "Two runs in nine start with a markdown fence. The system prompt persuaded; it did not guarantee." Set *Display → Top-K* to 8 and *Bars* to *log scale* to show the tail (Top-K applies to the next run, so set it during setup).

**Transition →** "Sampling never sees the logits, it sees softmax of them. So if I edit the logits before softmax, I control what can come out. Here is the edit."

### 5 · The mask (21:00–26:00)

- **Figure 04**, three columns left to right: raw logits → `logits[forbidden] = -inf` → forced probabilities. Stop on the middle column: "a LogitsProcessor did this; nothing else changed." Forbidden tokens are not "unlikely", they are impossible: probability exactly 0, on every step, no retries, no parsing failures. The model still chooses, among what the grammar allows, with its own preferences intact.
- **It is a hook in the decode loop** (`backend/app/engine.py:182` and `:221-225`). Show six lines. "This is the loop `model.generate` hides from you." No fine-tuning, no retraining, the model is untouched.
- **Slide 16, in the source (45 s, skippable):** transformers' own `if do_sample: multinomial else argmax` and the two `masked_fill(…, -inf)` lines from llguidance and outlines_core. References with line numbers in the section at the end of this file.
- **Figure 06**, 45 s, only so the audience trusts the numbers on screen: `PreMaskObserver` clones the raw logits before the mask, `MasterObserver` compares after. Neither changes a value.

**Demo, LIVE (2 min).** Time Machine, Person tab, engine **FSM**, *Max new tokens* 60, *Temperature* greedy. Press **Generate**. Tokens arrive at 2–5 per second; narrate: one forward pass each. Then scrub (`←` `→`, space to play):

- *Original intent* vs *Forced* bars; forbidden tokens struck through with `✕`.
- Measured run (greedy, 23 steps, 6.8 s): four **Overridden** steps, at 0, 1, 17 and 21. Step 0: the model wanted `{⏎`, the mask forced `{"`, 95.6% of the mass removed. Step 17: `city` forced, 91% removed. Step 21: `"}` forced, 80% removed; the model wanted to keep writing. "The model wanted something else; the mask won."
- Steps 4–8, inside `"Ada Lovelace"`: *Vocabulary kept* 96.8%, *Probability removed* 0.000. "Here the model is free; the schema only cares about the frame."
- Step 12, right after `"age":`: *Allowed tokens* 13 of 151,936. Digits are one token each in this vocabulary, plus space and minus (figure 05 shows exactly this state).
- Last step: only `<|im_end|>` is allowed. The automaton is what stops the generation.

**Transition →** "That was one line of code. The whole difficulty is the other line: who fills in `forbidden`?"

### 6 · Who decides "forbidden": the FSM (26:00–33:00)

- **Schema → regex.** outlines compiles the JSON Schema to one regular expression: keys in declared order, quoted literally, values as character classes. `{"age": integer}` becomes `\{"age":(0|[1-9][0-9]*)\}`. Show the Person regex on `/fsm`: it is long, and that is the point. "A schema is a regex with better PR."
- **Figure 05.** Regex → automaton. The text generated so far puts us in a state. At state 7: 1,126 tokens allowed, the other 150,810 forbidden. The mask is not computed from the text; it is read off the current state. `state → allowed set` is built once per (schema, vocabulary) and cached; per step it is a bitmask over the logits.
- **Why tokens make this hard, and why it is precomputed.** A token may cross regex boundaries, so for every state the compiler tests all 151,936 tokens once and keeps the survivors with their target state. That table is the compile cost (seconds for a large schema). The per-step cost is a lookup. This is why the first request for a new schema is slow and later ones are not. The lab keeps 16 compiled indexes (`engine.py:71`).

**Demo A (90 s).** `/fsm`, Person tab. Press **Compile schema** (done in setup). Read the regex. *Automaton → Character level*: the interegular automaton, one character per edge. Press **Freeze layout** before pointing. Then *Token level*: `outlines_core.Index(regex, vocabulary)`, one vocabulary token per edge, "this is what generation walks". Same language, different alphabet: `":` jumps two character states in one edge. This is the payoff of block 1.

**Demo B (60–90 s).** Back to the Time Machine Person tab. Section *Token-level automaton*: the path strip `state —token→ state`, visited states tinted in the graph, **Follow current state** on. Scrub and watch *Allowed tokens* collapse to a handful on structural tokens (2 at step 0, 4 before each key, 13 at the integer) and open up to about 147,000 inside string values. Final state: only `⟨eos⟩` is allowed. "The automaton is also what stops generation."

**Transition →** "This works for anything finite: arrays of objects, nested objects, enums, patterns. Now let me give it a schema that refers to itself."

### 7 · When the FSM cannot: the CFG (33:00–39:00)

- **Figure 07.** Left panel first: loops are fine, a loop is one state visiting itself. What an FSM cannot do is remember how many times. Right panel: `TreeNode` with `children: list["TreeNode"]`. Every `{` or `[` pushes; every `}` or `]` pops; `]` is only allowed when the top of the stack is `[`. Read the grammar line aloud. Cost: an Earley-style parser step per token instead of a table lookup.
- **outlines_core does not build a CFG.** It unrolls the recursive schema three levels and cuts. Still an FSM, still fast; a fourth level of nesting is simply forbidden. And the cut is buggy in 0.2.14: the innermost level keeps the comma before the property it dropped, so the regex ends in `,[ ]?\}`. The automaton accepts `{"value": 3, }`, a parser does not. "Not a bug in the idea. A bug in one unroller. But it shows the FSM has no idea it is describing JSON."
- **Auto mode** = `is_recursive(schema)` (`backend/app/presets.py:103`): does some `$defs` entry reach itself through `$ref`? Finite → outlines_core. Recursive → llguidance. Both produce the same kind of mask on the logits; they differ in how they decide the allowed set.

**Demo A (60 s).** `/fsm`, Tree tab. The regex is the schema unrolled three levels. The warning box under it names the bug and points at `,[ ]?\}` (`web/components/RegexView.tsx` detects exactly this).

**Demo B (2 min), both pre-recorded.** The preset Tree prompt only nests three levels, which is exactly the unroll limit, so it does **not** trigger the bug (verified: valid JSON, 39 steps). To trigger it, replace the prompt in the Tree / **FSM** tab with a four-level tree the model can copy:

```
Return this tree as JSON, exactly as given: {"value": 1, "children": [{"value": 2, "children": [{"value": 3, "children": [{"value": 4, "children": []}]}]}]}
```

Measured: 50 steps, 10.7 s, stack depth 7, ends in `{"value": 4, }` and the validator says *Expecting property name enclosed in double quotes*. *Text so far* shows the error and the callout *Why the automaton accepted invalid JSON*. Bonus: the model then invented a `{"value": 5}` node that was never asked for. Then the Tree / **CFG** tab with the preset prompt: the *Grammar engine* section with the parser stack (`StackView`, top highlighted, prose naming the one legal closer) and the *Across the run* depth chart pushing and popping. Same mask, different machine. The CFG run also hallucinated an extra child under node 3: "syntax, not truth", live.

**Transition →** "Two engines, same mask. What does that mean for the code you ship on Monday?"

### 8 · So what (39:00–43:00)

**What it costs**

| | FSM (`outlines_core`) | CFG (`llguidance`) |
|---|---|---|
| Compile | once per (schema, vocabulary); seconds for a large schema; cache it | grammar build, cheap |
| Per token | bitmask lookup | a parser advance |
| State you can inspect | automaton state id | none; the stack is the state |
| Depth | fixed (unrolled) | as deep as the model goes |
| Both | the first request for a new schema pays the compile; the forward pass still dominates on real hardware; budget `max_new_tokens` so the closing brace fits | |

**Pitfalls to name out loud**

- Syntax, not truth. The mask forces the frame; the model still invents the values. Every *Overridden* step is a place where the model wanted something else. Log them in production if you can.
- Engines disagree at the edges. Extra keys: the grammar follows JSON Schema (allowed unless `additionalProperties: false`), the regex never allows them. That is why every preset sets `extra="forbid"`. Also key order, whitespace (the lab pins it with `x-guidance.whitespace_flexible: false`), unsupported keywords (`regex_error` on compile).
- Unroll bugs are real: an automaton can accept what a parser rejects. Always `json.loads` + schema validation on the output, exactly as `engine.py` does after the loop.
- Removing 99% of the mass pushes the model off-distribution. Still prompt for the format; the constraint is the safety net, not the instruction.
- Truncation: no automaton can force a closing brace that does not fit in the token budget.

**When to reach for what**

- Hosted "JSON mode" / "structured outputs" is this mechanism server-side. That is why vendors publish a supported-schema subset and why the first call with a new schema is slower.
- Flat or nested but finite schema, latency-sensitive: FSM.
- Recursive schema, "any JSON value", or a grammar that is not JSON (SQL, code): CFG.
- Always: explicit schema, `additionalProperties: false`, validate, keep a fallback for truncation.

**Transition →** "Back to the table we started with."

### 9 · Close (43:00–45:00)

Tokens in, tokens out, through one 151,936 × 896 matrix. Structured output stands at the exit and crosses out rows before softmax. Callback to slide 3 (the spine) and slide 7 (the table). Links: repo, `/about` with the figures, the two labs. End on the sentence, then Q&A.

## Figures

All in `out/`, built from `slides/*.html` with `npm run build`:

| Figure | Slides |
|---|---|
| 00a tokens, not characters | 4 |
| 00b a token is a row in a table | 7 |
| 01 transformer end to end | 8 |
| 02 output layer | 10; crop of the formula panel on 12 |
| 03 logits → probabilities | 2 (crop of the probability panel), 11 |
| 04 the mask | 14 |
| 05 FSM walk | 20 |
| 06 the two observers | 17 |
| 07 FSM vs CFG | 24 |

### 00a "Tokens, not characters" (built 2026-09-06, `slides/00a-tokens-not-characters.html`)

What it shows (the split and ids come from the real tokenizer):

- Top band, two rows over the same string `{"name": "Ada", "age": 36}`: row 1 one thin box per character (26); row 2 one pastel box per token (13) with the raw vocabulary string and the id under each box. The real split: `{"` 4913 · `name` 606 · `":` 788 · `Ġ"` 330 · `Ada` 95347 · `",` 497 · `Ġ"` 330 · `age` 424 · `":` 788 · `Ġ` 220 · `3` 18 · `6` 21 · `}` 92.
- Middle-left, three call-outs with arrows into row 2: `{"` is one token (brace and quote together); `":` is one token (it straddles the key/value boundary); ` 36` is three tokens (space, then one per digit).
- Middle-right, BPE in four lines: start from 256 bytes; merge the most frequent adjacent pair; 151,387 merges later, 151,643 entries plus 22 special tokens; the model only ever sees the ids. The real merge chain for ` is`: `Ġ` `i` `s` → `Ġ` `is` (merge #29) → `Ġis` (merge #118, id 374).
- Legend: `Ġ` = space, `Ċ` = newline, `ĉ` = tab, "only in the string form of the vocabulary".
- Footer: "The model reads and writes whole tokens. So must anything that constrains it: the automaton runs over tokens, not characters (figure 05)."

### 00b "A token is a row in a table" (built 2026-09-06, `slides/00b-embedding-table.html`)

- Left, the input side: a tall thin matrix `E`, 151,936 × 896, the row for `Ada` highlighted and pulled out as an 896-wide vector (same styling as `h` in figure 02). Caption: "look-up, not arithmetic: `E[token_id]`".
- Centre, a numbers strip: 151,936 × 896 = 136,134,656 numbers; 27.6% of the 494,032,768 parameters; learned, not designed.
- Right, the output side: the same matrix mirrored, `h` coming in from the left, one dot product per row producing the logit column from figure 02. Label: "the same table, tied (`tie_word_embeddings = true` in Qwen2.5-0.5B, verified from the model config)", echoing figure 02's own caption.
- Footer: "The vocabulary enters and leaves through the same table. A logit is: how much does `h` look like the embedding of token *i*?"

Both are listed first on `/about` (`web/app/about/page.tsx`), so the page reads tokens → embeddings → transformer → logits → softmax → mask → automaton → observers → FSM vs CFG, the same order as the talk.

## Demo risks and mitigations

1. **CPU latency.** Measured on this laptop with `TORCH_THREADS=10`: Person 23 tokens in 6.8 s, Tree/FSM 39 in 8.0 s, Tree/CFG 42 in 9.3 s (3–5 tok/s). The 30–60 s figure is the free Hugging Face Space, do not demo from there. One live generation only (Person, 60 max tokens). Pre-record Tree/FSM and Tree/CFG in separate tabs. Start the backend with `TORCH_THREADS=10 docker compose up -d` (compose defaults to 4).
2. **Losing a recorded run.** The trace is React state only (`web/app/time-machine/page.tsx:25`); reload or navigation loses it. One tab per run, `/fsm` in its own tabs, a fresh browser window for the talk, never press reload on a run tab. Optional hardening (30 min): persist the trace next to the settings in `web/lib/labState.ts`, or add export/import of the trace JSON.
3. **Backend unavailable.** Run it locally with `docker compose up`; check `GET /health` → `loaded: true` before walking on stage. Fallback A: `TOY_MODEL=1` (mask mechanics, states, stack depth and allowed counts are real; probabilities are meaningless, so use it for blocks 6–7 only and say so). Fallback B: screenshots of every demo state taken during rehearsal, placed right after each demo slide in the deck.
4. **Resolved: the second bar is the markdown fence, not "Sure".** With the chat template the measured step 0 is `{⏎` 68.5% / ` ``` ` 23.0% for Person and ` ``` ` 97.2% for Tree. Use those numbers on slide 2 and in the hook; they are better than the figure's and the live panel will show them.
5. **The unroll bug needs a fourth level of nesting.** The preset Tree prompt nests three levels and produces valid JSON; prompts that merely *ask* for four levels get flattened by this 0.5B model. The prompt that works gives it the nested JSON to copy (block 7, demo B). Greedy decoding makes it deterministic per model version; confirm in rehearsal. If it ever stops triggering, slide 24's regex warning carries the point on its own.
6. **Graph legibility.** Person for the character/token toggle (Invoice's token graph is large). Freeze layout before pointing. Browser zoom 125–150%. Top-K 6–8, precision 1–2 decimals, log scale only when showing the tail.
7. **Digit tokenization vs figures 01/05: confirmed wrong.** `tokenizer.tokenize(" 36")` → `['Ġ', '3', '6']`. Figure 01's token column (`Ada`, `␠is`, `␠36`, `.`, `{`, "5 × 896") and figure 05's integer-state token list (`12 36 100 1985 2024 360 ␠36 ␠2000`) need redrawing before the talk. Do not let the talk contradict the demo.

## References in source code: greedy vs sampling, and why −∞ beats both

Slide 16 quotes the first and the two −∞ lines. Versions are the ones installed in the backend container on 2026-09-07: transformers 5.16.1, outlines 1.3.3, outlines_core 0.2.14, llguidance 1.8.0, torch 2.14.0. llama.cpp is `src/llama-sampler.cpp` at commit `dd1ea52433` (2026-08-10).

**The two strategies, one `if`**

- `transformers/generation/utils.py:2920-2925` (inside `_sample`): `if do_sample: probs = softmax(next_token_scores); next_tokens = torch.multinomial(probs, num_samples=1)` else `next_tokens = torch.argmax(next_token_scores, dim=-1)`. Greedy is an argmax; sampling is a draw from the softmax.
- llama.cpp `llama_sampler_greedy_apply` (line 1053): a loop that keeps the index with the largest logit. `llama_sampler_dist_apply` (line 1150): softmax by hand (`expf(logit - max_l)`, lines 1178-1183), then one uniform random number `rnd = dist(ctx->rng)` (line 1190) and a walk over the cumulative probabilities until `sum_run >= sum_cum * rnd` (lines 1192-1203). That walk is the loaded die.
- This lab, `backend/app/engine.py` `_sample`: `temperature <= 0` → `torch.argmax`; otherwise `/ temperature`, optional top-k to −∞, `softmax`, `torch.multinomial`.

**The knobs are edits to the logits before softmax**

- Temperature: `TemperatureLogitsWarper.__call__`, `logits_process.py:302`: `scores_processed = scores / self.temperature`. llama.cpp `llama_sampler_temp_impl`, line 289: `cur_p->data[i].logit /= temp`.
- Top-k: `TopKLogitsWarper`, `logits_process.py:581,593-594`: `filter_value: float = -float("Inf")`, `indices_to_remove = scores < torch.topk(scores, top_k)[0][..., -1, None]`, `scores.masked_fill(indices_to_remove, self.filter_value)`. Top-k is the same operation as the schema mask with a different criterion. llama.cpp `llama_sampler_top_k_impl`, line 337: it just truncates the candidate array, `cur_p->size = k`.
- Top-p: `TopPLogitsWarper`, `logits_process.py:529-538`: sort, `cumulative_probs = sorted_logits.softmax(-1).cumsum(-1)`, drop what falls under `1 - top_p`, `masked_fill(..., -inf)`.
- Greedy as a mask, in llama.cpp: `llama_sampler_temp_impl` with `temp <= 0`, lines 270-286, sets every logit except the maximum to `-INFINITY`. Greedy decoding is literally "write −∞ over everything that is not the argmax". Same trick as structured output, different author of the list.

**Where the schema mask is written**

- llguidance: `llguidance/torch.py:34`: `logits.masked_fill_(bit_masks == 0, float("-inf"))`, and line 50 for the padding rows: `logits[:, cutoff:] = float("-inf")`. The numpy twin is `llguidance/numpy.py:26`.
- outlines_core: `outlines_core/kernels/torch.py:64`: `logits.masked_fill_(~bit_masks, -torch.inf)`, and line 48 for the padding rows. outlines 1.3 calls these from `outlines/backends/outlines_core.py:116` and `outlines/backends/llguidance.py:119`.
- Both engines hand the same kind of object to the sampler: a logits vector with −∞ in the forbidden positions. `exp(−∞) = 0`, so `multinomial` never draws them and `argmax` never picks them.

**What a real model asks for by default**

- `Qwen2.5-0.5B-Instruct/generation_config.json` (in the HF cache): `do_sample: true, temperature: 0.7, top_p: 0.8, top_k: 20, repetition_penalty: 1.1`. Sampling is the default; the lab overrides it with `temperature = 0` so runs are reproducible.
- `transformers/generation/configuration_utils.py:401-414`: `do_sample`, `temperature`, `top_k`, `top_p` are the `GenerationConfig` fields; the library defaults are `do_sample=False`, `temperature=1.0`, `top_k=50`, `top_p=1.0`.

## Pre-talk checklist (30 minutes before)

- [ ] `TORCH_THREADS=10 docker compose up -d`; wait for `/health` → `loaded: true` (about 5 s when the model is cached in the volume). `cd web && NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:7860 npm run dev`.
- [ ] Display settings once (they persist): Top-K 8, precision 2, bars linear.
- [ ] Tab 1 · `/time-machine`, Person, FSM, greedy, 60 tokens: **Generate** once now (warms the index cache and the model). This is also the live tab; generating again on stage will be fast to start.
- [ ] Tab 2 · `/time-machine`, Tree, FSM, prompt replaced by the four-level copy prompt from block 7: generate; confirm the `, }` ending and the *Why the automaton accepted invalid JSON* callout.
- [ ] Tab 3 · `/time-machine`, Tree, CFG: generate; confirm the *Grammar engine* stack and the depth chart.
- [ ] Tab 4 · `/fsm`, Person: **Compile schema**; render both *Character level* and *Token level* once; **Freeze layout**.
- [ ] Tab 5 · `/fsm`, Tree: compile; warning visible under the regex.
- [ ] Deck open in a separate window (`npm run deck`, open `deck.html`; presenter view with `p`).
- [ ] Backup: PDF of the deck, screenshots of tabs 1–5.
