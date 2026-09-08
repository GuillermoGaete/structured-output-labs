"use client";

import { useT } from "@/i18n/client";
import type { ModuleUi } from "@/modules/types";
import type { TokenizeRequest } from "@/lib/types";
import { TokenizerView } from "./TokenizerView";
import { useTokenize } from "./useTokenize";

/** Slide-embeddable tokenizer: one or two tokenizers over one text, fed by the current data source. */
export function TokensWidget({ text, ui, useChatTemplate = false, compare = false, glyphs = false, size = "lg" }: { text: string; ui: ModuleUi; useChatTemplate?: boolean; compare?: boolean; glyphs?: boolean; size?: "sm" | "md" | "lg" }) {
  const t = useT();
  const req: TokenizeRequest = { text, use_chat_template: useChatTemplate, tokenizer: "model", merges: true };
  const main = useTokenize(req, 0);
  const other = useTokenize(compare ? { text, use_chat_template: false, tokenizer: "gpt2", merges: false } : null, 0);
  if (main.missing) return <p className="text-warn">{t.dataSource.noRecording}</p>;
  if (main.error) return <p className="text-critical">{main.error}</p>;
  if (!main.data) return <p className="text-muted">{t.common.loading}</p>;
  return (
    <div className="flex flex-col gap-8">
      <TokenizerView data={main.data} ui={ui} glyphs={glyphs} size={size} label={compare ? main.data.tokenizer_id : undefined} />
      {compare && other.data && <TokenizerView data={other.data} ui={ui} glyphs={glyphs} size={size} label={other.data.tokenizer_id} />}
    </div>
  );
}
