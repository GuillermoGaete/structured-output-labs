"use client";

import { useEffect, useState } from "react";
import { useDataSource, useModuleFixtures } from "@/data/DataSourceProvider";
import { useT } from "@/i18n/client";
import { codecs, useUrlState, type UrlSchema } from "@/lib/urlState";
import type { TokenizeRequest } from "@/lib/types";
import type { LabProps } from "@/modules/types";
import { FIXTURES } from "./fixtures";
import { PRESET_TEXTS, type PresetId } from "./presets";
import { MergeReplay } from "./widgets/MergeReplay";
import { TokenizerView } from "./widgets/TokenizerView";
import { useTokenize } from "./widgets/useTokenize";

interface State {
  preset: PresetId | "custom";
  q: string;
  tpl: boolean;
  cmp: boolean;
  glyphs: boolean;
}

const SCHEMA: UrlSchema<State> = {
  preset: { codec: codecs.enumOf(["person-json", "numbers", "code", "spanish", "custom"] as const), default: "person-json" },
  q: { codec: codecs.string(), default: "" },
  tpl: { codec: codecs.boolean(), default: false },
  cmp: { codec: codecs.boolean(), default: true },
  glyphs: { codec: codecs.boolean(), default: false },
};

export default function TokensLab({ ui }: LabProps) {
  const t = useT();
  useModuleFixtures(FIXTURES);
  const { effective } = useDataSource();
  const [state, update, meta] = useUrlState(SCHEMA);
  const text = state.preset === "custom" ? state.q : PRESET_TEXTS[state.preset];
  const [draft, setDraft] = useState(text);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(text);
  }, [text]);

  const request: TokenizeRequest | null = text.trim() ? { text, use_chat_template: state.tpl, tokenizer: "model", merges: true } : null;
  const main = useTokenize(request);
  const gpt2 = useTokenize(state.cmp && text.trim() ? { text, use_chat_template: false, tokenizer: "gpt2", merges: false } : null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <section className="panel flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(PRESET_TEXTS) as PresetId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`btn text-xs ${state.preset === id ? "btn-primary" : ""}`}
              onClick={() => update({ preset: id, q: "" })}
            >
              {ui[`preset_${id}`] ?? id}
            </button>
          ))}
          <button type="button" className={`btn text-xs ${state.preset === "custom" ? "btn-primary" : ""}`} onClick={() => update({ preset: "custom", q: draft })}>
            {ui.preset_custom}
          </button>
          <span className="ml-auto text-xs text-muted">{effective === "recorded" ? ui.recordedHint : ui.liveHint}</span>
        </div>
        <textarea
          className="input mono min-h-[88px] text-[13px]"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            update({ preset: "custom", q: e.target.value });
          }}
          spellCheck={false}
          aria-label={ui.textLabel}
        />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={state.tpl} onChange={(e) => update({ tpl: e.target.checked })} /> {ui.chatTemplate}
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={state.cmp} onChange={(e) => update({ cmp: e.target.checked })} /> {ui.compareGpt2}
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={state.glyphs} onChange={(e) => update({ glyphs: e.target.checked })} /> {ui.showGlyphs}
          </label>
          <button
            type="button"
            className="btn ml-auto text-xs"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.origin + meta.href).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? t.common.copied : t.common.copyLink}
          </button>
        </div>
      </section>

      <section className="panel-raised flex flex-col gap-5 p-5">
        <h2 className="text-lg font-extrabold tracking-tight">{ui.resultTitle}</h2>
        {main.missing && <p className="text-sm text-warn">{t.dataSource.noRecording}</p>}
        {main.error && <p className="text-sm text-critical">{main.error}</p>}
        {main.data && (
          <div className={main.loading ? "opacity-60" : ""}>
            <TokenizerView data={main.data} ui={ui} glyphs={state.glyphs} showTable label={main.data.tokenizer_id} />
          </div>
        )}
        {main.data?.merges && "pieces" in main.data.merges && <MergeReplay pieces={main.data.merges.pieces} ui={ui} />}
      </section>

      {state.cmp && (
        <section className="panel flex flex-col gap-4 p-5">
          <h2 className="text-lg font-extrabold tracking-tight">{ui.compareTitle}</h2>
          <p className="max-w-prose text-sm text-ink-2">{ui.compareIntro}</p>
          {gpt2.missing && <p className="text-sm text-warn">{t.dataSource.noRecording}</p>}
          {gpt2.error && <p className="text-sm text-critical">{gpt2.error}</p>}
          {gpt2.data && main.data && (
            <div className={gpt2.loading ? "opacity-60" : ""}>
              <TokenizerView data={gpt2.data} ui={ui} glyphs={state.glyphs} label={gpt2.data.tokenizer_id} />
              <p className="mt-3 text-sm text-ink-2">
                {ui.compareCounts
                  .replace("{a}", String(main.data.n_tokens))
                  .replace("{b}", String(gpt2.data.n_tokens))}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
