"use client";

import { useState } from "react";
import { useBackend, type BackendPhase } from "./BackendProvider";

const PHASE_LABEL: Record<BackendPhase, string> = {
  unset: "No backend URL",
  checking: "Checking…",
  online: "Online",
  waking: "Model loading…",
  error: "Model failed to load",
  offline: "Unreachable",
};

const PHASE_DOT: Record<BackendPhase, string> = {
  unset: "bg-muted",
  checking: "bg-warning",
  online: "bg-good",
  waking: "bg-warning",
  error: "bg-critical",
  offline: "bg-critical",
};

export function BackendStatusPill({ compact = false }: { compact?: boolean }) {
  const { phase, health } = useBackend();
  const label = phase === "online" && health ? (compact ? health.model_id.split("/").pop() : health.model_id) : PHASE_LABEL[phase];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-2" title={health?.model_id ?? PHASE_LABEL[phase]}>
      <span className={`inline-block w-2 h-2 rounded-full ${PHASE_DOT[phase]}`} aria-hidden="true" />
      <span className="font-mono">{label}</span>
      {health?.toy && <span className="rounded-full border border-line-2 px-1.5 py-px text-[10px] uppercase tracking-wide text-muted">toy model</span>}
    </span>
  );
}

/** Backend URL field. The status itself is the pill; failures show the raw error, not an explanation. */
export function BackendSettings() {
  const { url, setUrl, phase, lastError, refresh } = useBackend();
  const [draft, setDraft] = useState(url);
  // Reset the draft when the stored URL changes (React's "adjust state while rendering" pattern).
  const [seenUrl, setSeenUrl] = useState(url);
  if (seenUrl !== url) {
    setSeenUrl(url);
    setDraft(url);
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex gap-2 flex-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          setUrl(draft);
        }}
      >
        <input
          className="input flex-1 min-w-[240px] font-mono text-[13px]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="http://127.0.0.1:7860"
          aria-label="Backend URL"
          spellCheck={false}
        />
        <button className="btn btn-primary" type="submit">
          Use
        </button>
        <button className="btn" onClick={refresh} type="button">
          Re-check
        </button>
      </form>
      {lastError && (phase === "offline" || phase === "error") && <p className="font-mono text-xs text-critical break-all">{lastError}</p>}
    </div>
  );
}
