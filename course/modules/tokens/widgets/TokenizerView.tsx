"use client";

import { useState } from "react";
import { Metric } from "@/components/Metric";
import { TokenChips } from "@/components/tokens/TokenChips";
import { useLocale } from "@/i18n/client";
import { formatInt } from "@/lib/tokens";
import type { ModuleUi } from "@/modules/types";
import type { TokenizeResponse } from "@/lib/types";

/** Chips + counters (+ optional table) for one tokenizer answer. Used by the lab and by the slides. */
export function TokenizerView({
  data,
  ui,
  glyphs = false,
  size = "md",
  showTable = false,
  showMetrics = true,
  label,
}: {
  data: TokenizeResponse;
  ui: ModuleUi;
  glyphs?: boolean;
  size?: "sm" | "md" | "lg";
  showTable?: boolean;
  showMetrics?: boolean;
  label?: string;
}) {
  const locale = useLocale();
  const [tableOpen, setTableOpen] = useState(false);
  const words = data.text.trim().split(/\s+/).filter(Boolean).length || 1;
  const userTokens = data.tokens.filter((t) => t.segment === "user").length;
  const templateTokens = data.n_tokens - userTokens;
  return (
    <div className="flex flex-col gap-3">
      {label && <div className="text-sm font-semibold text-ink-2">{label}</div>}
      <TokenChips tokens={data.tokens} glyphs={glyphs} size={size} />
      {showMetrics && (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Metric label={ui.chars} value={formatInt(data.n_chars, locale)} />
          <Metric label={ui.bytes} value={formatInt(data.n_bytes, locale)} />
          <Metric label={ui.tokens} value={formatInt(data.n_tokens, locale)} hint={data.tokenizer_id} />
          <Metric label={ui.tokensPerWord} value={(userTokens / words).toLocaleString(locale, { maximumFractionDigits: 2 })} />
          {templateTokens > 0 && <Metric label={ui.templateTokens} value={formatInt(templateTokens, locale)} hint={ui.templateTokensHint} />}
          <Metric label={ui.vocab} value={formatInt(data.vocab_entries, locale)} hint={data.tokenizer_id} />
        </div>
      )}
      {showTable && (
        <div>
          <button type="button" className="btn text-xs" onClick={() => setTableOpen((o) => !o)}>
            {tableOpen ? ui.hideTable : ui.showTable}
          </button>
          {tableOpen && (
            <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-rule">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-raised text-left text-muted">
                  <tr>
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">id</th>
                    <th className="px-2 py-1">{ui.rawToken}</th>
                    <th className="px-2 py-1">{ui.text}</th>
                    <th className="px-2 py-1">{ui.bytes}</th>
                    <th className="px-2 py-1">{ui.segment}</th>
                  </tr>
                </thead>
                <tbody className="mono">
                  {data.tokens.map((t) => (
                    <tr key={t.i} className="border-t border-rule">
                      <td className="px-2 py-1 text-muted">{t.i}</td>
                      <td className="px-2 py-1">{t.id}</td>
                      <td className="px-2 py-1">{JSON.stringify(t.token)}</td>
                      <td className="px-2 py-1">{JSON.stringify(t.text)}</td>
                      <td className="px-2 py-1">{t.byte_end - t.byte_start}</td>
                      <td className="px-2 py-1 text-muted">{t.segment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
