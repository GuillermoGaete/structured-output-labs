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
  const { phase, health, models, selected } = useBackend();
  // With a registry the interesting state is the *chosen* model's, not the default's.
  const dot = selected ? (selected.loaded ? "bg-good" : selected.error ? "bg-critical" : "bg-warning") : PHASE_DOT[phase];
  const name = selected?.id ?? health?.model_id ?? "";
  // The picker already names the model, so the pill only carries the state then.
  const named = models.length < 2;
  const label =
    phase !== "online"
      ? PHASE_LABEL[phase]
      : selected && !selected.loaded
        ? `${selected.error ? "failed" : "loading…"}`
        : named
          ? (compact ? name.split("/").pop() : name)
          : "online";
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-2" title={selected?.error ?? name ?? PHASE_LABEL[phase]}>
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />
      <span className="font-mono">{label}</span>
      {health?.toy && <span className="rounded-full border border-line-2 px-1.5 py-px text-[10px] uppercase tracking-wide text-muted">toy model</span>}
    </span>
  );
}

/** The MODEL_IDS allowlist. Picking one asks the backend to load it. */
export function ModelPicker() {
  const { models, model, setModel, selected } = useBackend();
  if (models.length < 2) return null;
  const label = (m: (typeof models)[number]) => {
    const short = m.id.split("/").pop() ?? m.id;
    if (m.error) return `${short} · failed`;
    if (m.loading) return `${short} · loading…`;
    if (!m.loaded) return `${short} · not loaded`;
    const params = m.n_params ? ` · ${(m.n_params / 1e6).toFixed(0)}M` : "";
    return `${short}${params}`;
  };
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-muted">Model</span>
      <select
        className="input input-fit py-0.5 px-1.5 text-xs"
        value={model ?? selected?.id ?? ""}
        onChange={(e) => setModel(e.target.value)}
        aria-label="Model"
        title="Loads on first use; MAX_RESIDENT_MODELS evicts the least recently used"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {label(m)}
          </option>
        ))}
      </select>
    </label>
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
