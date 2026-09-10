/**
 * Byte-level BPE vocabularies (GPT-2, Qwen, DeepSeek, Llama 3…) spell a leading
 * space as `Ġ`, a newline as `Ċ` and a tab as `ĉ`; sentencepiece ones (Llama 2,
 * Mistral, and the tiny chat models built on them) spell it `▁`. The backend
 * already sends the decoded text for every token, but raw strings still show up
 * (top-K lists, graph edge labels), so the same cleanup lives here too.
 */
export function cleanBpeGlyphs(token: string): string {
  return token.replace(/Ġ/g, " ").replace(/Ċ/g, "\n").replace(/ĉ/g, "\t").replace(/▁/g, " ");
}

/**
 * What a token should read as, from its decoded text and its raw vocabulary form.
 *
 * `tokenizer.decode([id])` returns "" both for the end-of-sequence marker and for
 * sentencepiece's bare `▁`, which is only a space. Falling back to the raw form
 * tells them apart: `▁` cleans to a space, `<|im_end|>` does not.
 */
export function tokenDisplay(text: string, raw?: string): { shown: string; isEnd: boolean } {
  if (text !== "") return { shown: cleanBpeGlyphs(text), isEnd: false };
  const cleaned = cleanBpeGlyphs(raw ?? "");
  return { shown: cleaned, isEnd: cleaned.trim() !== "" || cleaned === "" };
}

/** A short, visible form of a token for labels: spaces and newlines get glyphs. */
export function visibleToken(text: string, raw?: string): string {
  const { shown, isEnd } = tokenDisplay(text, raw);
  if (isEnd) return "⟨eos⟩";
  return shown.replace(/ /g, "␠").replace(/\n/g, "⏎").replace(/\t/g, "⇥");
}

/** Pastel backgrounds for the token renderer. Text on top is always #000000. */
export const PASTELS = ["#FDE68A", "#BBF7D0", "#BFDBFE", "#FBCFE8", "#DDD6FE", "#FED7AA"] as const;

export function pastelFor(index: number): string {
  return PASTELS[index % PASTELS.length];
}

/**
 * Percentage with `digits` decimals. Values that would round to zero are shown in
 * scientific notation instead of being hidden behind "<0.1%".
 */
export function formatPct(p: number, digits = 1): string {
  const pct = p * 100;
  if (!Number.isFinite(pct)) return "—";
  if (pct === 0) return "0%";
  const min = 10 ** -digits;
  if (pct >= 100 - min / 2) return "100%";
  if (pct < min) return `${pct.toExponential(Math.max(digits - 1, 1))}%`;
  return `${pct.toFixed(digits)}%`;
}

export function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}
