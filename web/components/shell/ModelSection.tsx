"use client";

import { useRef } from "react";
import { useBackend } from "@/components/BackendProvider";
import { IconClose } from "@/components/icons";
import { ProviderKeys } from "@/components/logprobs/ProviderKeys";
import { PROVIDERS, providerOf } from "@/lib/providers";
import type { ModelStatus } from "@/lib/types";

interface Props {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Offer the hosted providers too (the logprobs mode). Keys are the visitor's and stay in this browser. */
  hosted?: boolean;
  keys?: Record<string, string>;
  onKey?: (provider: string, key: string) => void;
}

/** The MODEL_IDS allowlist, and the hosted models when the mode can reach them. Picking a local one asks the backend to load it. */
export function ModelSection({ value, onChange, disabled = false, hosted = false, keys = {}, onKey }: Props) {
  const { models, phase, selected } = useBackend();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const provider = hosted ? providerOf(value) : "";
  const missingKey = !!provider && !keys[provider];
  // The logprobs mode may pick a local model other than the header's choice.
  const current = provider ? null : (models.find((m) => m.id === value) ?? selected);

  const label = (m: ModelStatus) => {
    const short = m.id.split("/").pop() ?? m.id;
    if (phase !== "online") return short; // the last /health is stale; do not claim a state
    if (m.error) return `${short} · failed`;
    if (m.loading) return `${short} · loading…`;
    if (!m.loaded) return `${short} · not loaded`;
    const params = m.n_params ? ` · ${(m.n_params / 1e6).toFixed(0)}M` : "";
    return `${short}${params}`;
  };
  const options = models.map((m) => (
    <option key={m.id} value={m.id}>
      {label(m)}
    </option>
  ));

  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow">Model</span>
      <select
        className="input text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || models.length === 0}
        aria-label="Model"
        title="Loads on first use; MAX_RESIDENT_MODELS evicts the least recently used"
      >
        {models.length === 0 && <option value="">—</option>}
        {hosted ? <optgroup label="Local">{options}</optgroup> : options}
        {hosted &&
          PROVIDERS.map((p) => (
            <optgroup key={p.id} label={`${p.label}${keys[p.id] ? "" : " · no key"}`}>
              {p.models.map((m) => (
                <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>
                  {m}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
      <div className="flex items-center gap-2 flex-wrap">
        {current && phase === "online" && !current.loaded && (
          <span className="chip chip-warning" title={current.error ?? undefined}>
            {current.error ? "failed to load" : current.loading ? "loading…" : "not resident"}
          </span>
        )}
        {missingKey && <span className="chip chip-warning">add a key to use this model</span>}
        {provider && !missingKey && (
          <span className="chip" title="Your key travels on the request and the backend never stores it">
            sent from this browser
          </span>
        )}
        {hosted && (
          <button className="btn py-0.5 px-2 text-xs" type="button" onClick={() => dialog.current?.showModal()}>
            API keys…
          </button>
        )}
      </div>
      {hosted && (
        <dialog
          ref={dialog}
          className="dialog"
          aria-label="API keys"
          onClick={(e) => {
            if (e.target === dialog.current) dialog.current?.close();
          }}
        >
          <div className="dialog-body">
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow">API keys</span>
              <button className="btn btn-icon" type="button" onClick={() => dialog.current?.close()} aria-label="Close">
                <IconClose />
              </button>
            </div>
            <ProviderKeys keys={keys} onChange={(id, key) => onKey?.(id, key)} />
          </div>
        </dialog>
      )}
    </div>
  );
}
