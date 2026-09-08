import { TOKENS } from "@/design/tokens.generated";

/**
 * Byte-level BPE vocabularies (GPT-2, Qwen, DeepSeek, Llama 3…) spell a leading
 * space as `Ġ`, a newline as `Ċ` and a tab as `ĉ`. The backend sends decoded
 * text for every token, but raw strings still show up (top-K lists, merge
 * replays), so the same cleanup lives here too.
 */
export function cleanBpeGlyphs(token: string): string {
  return token.replace(/Ġ/g, " ").replace(/Ċ/g, "\n").replace(/ĉ/g, "\t");
}

/** A short, visible form of a token for labels: spaces and newlines get glyphs. */
export function visibleToken(text: string): string {
  if (text === "") return "⟨eos⟩";
  return cleanBpeGlyphs(text).replace(/ /g, "␠").replace(/\n/g, "⏎").replace(/\t/g, "⇥");
}

/** Pastel backgrounds for token chips (identity of a token, never of a data series). Text on top is always #000. */
export const PASTELS = TOKENS.tokenPastels;

export function pastelFor(index: number): string {
  return PASTELS[index % PASTELS.length];
}

/**
 * Percentage with `digits` decimals in the given locale. Values that would round
 * to zero are shown in scientific notation instead of hiding behind "<0.1%".
 */
export function formatPct(p: number, digits = 1, locale = "en"): string {
  const pct = p * 100;
  if (!Number.isFinite(pct)) return "—";
  if (pct === 0) return "0 %";
  const min = 10 ** -digits;
  if (pct >= 100 - min / 2) return "100 %";
  if (pct < min) return `${pct.toExponential(Math.max(digits - 1, 1))} %`;
  return `${pct.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

export function formatInt(n: number, locale = "en"): string {
  return n.toLocaleString(locale);
}

export function formatMs(ms: number, locale = "en"): string {
  if (ms >= 1000) return `${(ms / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} s`;
  return `${Math.round(ms).toLocaleString(locale)} ms`;
}
