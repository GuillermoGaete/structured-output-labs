/**
 * Byte-level BPE vocabularies (GPT-2, Qwen, DeepSeek, Llama 3…) spell a leading
 * space as `Ġ`, a newline as `Ċ` and a tab as `ĉ`. The backend already sends the
 * decoded text for every token, but raw strings still show up (top-K lists,
 * graph edge labels), so the same cleanup lives here too.
 */
export function cleanBpeGlyphs(token: string): string {
  return token.replace(/Ġ/g, " ").replace(/Ċ/g, "\n").replace(/ĉ/g, "\t");
}

/** A short, visible form of a token for labels: spaces and newlines get glyphs. */
export function visibleToken(text: string): string {
  if (text === "") return "⟨eos⟩";
  return cleanBpeGlyphs(text).replace(/ /g, "␠").replace(/\n/g, "⏎").replace(/\t/g, "⇥");
}

/** Pastel backgrounds for the token renderer. Text on top is always #000000. */
export const PASTELS = ["#FDE68A", "#BBF7D0", "#BFDBFE", "#FBCFE8", "#DDD6FE", "#FED7AA"] as const;

export function pastelFor(index: number): string {
  return PASTELS[index % PASTELS.length];
}

export function formatPct(p: number, digits = 1): string {
  if (p >= 0.9995) return "100%";
  if (p < 0.0005) return p === 0 ? "0%" : "<0.1%";
  return `${(p * 100).toFixed(digits)}%`;
}

export function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}
