"use client";

import { useState } from "react";
import { fill, useLocale, useT } from "@/i18n/client";
import { formatInt } from "@/lib/tokens";
import { useBackend, type BackendPhase } from "./BackendProvider";
import { ModelSelector } from "@/components/shell/ModelSelector";

const PHASE_DOT: Record<BackendPhase, string> = {
  unset: "bg-muted",
  checking: "bg-warn",
  online: "bg-good",
  waking: "bg-warn",
  error: "bg-critical",
  offline: "bg-critical",
};

export function BackendStatusPill({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const { phase, health, modelStatus } = useBackend();
  const modelId = modelStatus?.id ?? health?.model_id ?? null;
  const label = phase === "online" && modelId ? (compact ? modelId.split("/").pop() : modelId) : t.backend.phases[phase];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-2" title={modelId ?? t.backend.phases[phase]}>
      <span className={`inline-block h-2 w-2 rounded-full ${PHASE_DOT[phase]}`} aria-hidden="true" />
      <span className="mono">{label}</span>
      {health?.toy && <span className="rounded-full border border-rule-2 px-1.5 py-px text-[10px] uppercase tracking-wide text-muted">{t.backend.toy}</span>}
    </span>
  );
}

export function BackendSettings() {
  const t = useT();
  const locale = useLocale();
  const { url, setUrl, phase, health, lastError, refresh, modelStatus } = useBackend();
  const [draft, setDraft] = useState(url);
  const [seenUrl, setSeenUrl] = useState(url);
  if (seenUrl !== url) {
    setSeenUrl(url);
    setDraft(url);
  }

  const explain = fill(t.backend.explain[phase], {
    model: modelStatus?.id ?? health?.model_id,
    vocab: health?.vocab_size ? formatInt(health.vocab_size, locale) : "",
    error: lastError,
    url,
  });

  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">{t.backend.title}</span>
          <BackendStatusPill />
        </div>
        <div className="flex items-center gap-2">
          <ModelSelector />
          <button className="btn" onClick={refresh} type="button">
            {t.backend.recheck}
          </button>
        </div>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setUrl(draft);
        }}
      >
        <input
          className="input mono min-w-[240px] flex-1 text-[13px]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.backend.placeholder}
          aria-label={t.backend.urlLabel}
          spellCheck={false}
        />
        <button className="btn btn-primary" type="submit">
          {t.backend.useUrl}
        </button>
      </form>
      <p className="max-w-prose text-sm text-ink-2">{explain}</p>
    </div>
  );
}
