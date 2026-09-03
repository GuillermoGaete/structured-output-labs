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

export function BackendSettings() {
  const { url, setUrl, phase, health, lastError, refresh } = useBackend();
  const [draft, setDraft] = useState(url);
  // Reset the draft when the stored URL changes (React's "adjust state while rendering" pattern).
  const [seenUrl, setSeenUrl] = useState(url);
  if (seenUrl !== url) {
    setSeenUrl(url);
    setDraft(url);
  }

  const explain = (() => {
    switch (phase) {
      case "unset":
        return "Paste the URL of your Hugging Face Space (for example https://your-name-structured-output-labs.hf.space) or http://127.0.0.1:7860 when running docker compose locally. The labs need it for every request.";
      case "checking":
        return "Contacting the backend…";
      case "waking":
        return "The Space is up but the model is still loading. On a free CPU Space the first boot downloads the weights and takes a few minutes; a sleeping Space wakes in about a minute.";
      case "online":
        return `Connected. Model ${health?.model_id}${health?.load_time_s ? ` loaded in ${health.load_time_s}s` : ""}; vocabulary of ${health?.vocab_size?.toLocaleString("en-US")} tokens.`;
      case "error":
        return `The backend started but could not load the model: ${lastError}. Check the MODEL_ID variable in the Space settings.`;
      case "offline":
        return `Could not reach ${url}: ${lastError}. If the Space is asleep, opening its page in a browser wakes it up.`;
    }
  })();

  return (
    <div className="panel p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Backend</span>
          <BackendStatusPill />
        </div>
        <button className="btn" onClick={refresh} type="button">
          Re-check
        </button>
      </div>
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
          placeholder="https://<user>-<space>.hf.space"
          aria-label="Backend URL"
          spellCheck={false}
        />
        <button className="btn btn-primary" type="submit">
          Use this URL
        </button>
      </form>
      <p className="text-sm text-ink-2 max-w-prose">{explain}</p>
    </div>
  );
}
