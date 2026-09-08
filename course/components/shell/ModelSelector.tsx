"use client";

import { useBackend } from "@/components/backend/BackendProvider";
import { useT } from "@/i18n/client";

/** The allowlist the backend exposes; picking a model that is not resident starts loading it. */
export function ModelSelector({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const { models, model, health, setModel, modelStatus } = useBackend();
  if (models.length < 2) return null;
  const selected = model ?? health?.model_id ?? "";
  return (
    <label className="inline-flex items-center gap-2 text-xs text-ink-2">
      {!compact && <span>{t.backend.model}</span>}
      <select className="input mono text-[12px]" value={selected} onChange={(e) => setModel(e.target.value)} aria-label={t.backend.model}>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.id.split("/").pop()}
            {m.loaded ? "" : m.loading ? ` (${t.backend.loadingModel})` : m.error ? " (!)" : ""}
          </option>
        ))}
      </select>
      {modelStatus && !modelStatus.loaded && !modelStatus.error && <span className="text-warn">{t.backend.loadingModel}</span>}
    </label>
  );
}
