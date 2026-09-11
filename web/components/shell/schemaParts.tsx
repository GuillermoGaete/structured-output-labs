"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useBackend } from "@/components/BackendProvider";
import type { LabState, SourceKind } from "@/lib/labState";
import { parseSchema, presetPatch } from "@/lib/labState";
import type { PydanticState } from "@/lib/usePydanticSchema";

export interface EditorProps {
  state: LabState;
  update: (patch: Partial<LabState>) => void;
  pydantic: PydanticState;
  disabled?: boolean;
}

const SOURCES: { value: SourceKind; label: string; hint: string }[] = [
  { value: "pydantic", label: "Pydantic", hint: "Paste a BaseModel; the server derives its JSON Schema" },
  { value: "schema", label: "JSON Schema", hint: "Write the schema outlines compiles, directly" },
];

const MAX_UPLOAD_BYTES = 8_000;

export function PresetChips({ state, update, disabled }: Pick<EditorProps, "state" | "update" | "disabled">) {
  const { presets } = useBackend();
  if (presets.length > 4) {
    const groups: [string, typeof presets][] = [];
    for (const p of presets) {
      const g = p.group ?? "Presets";
      const bucket = groups.find(([name]) => name === g);
      if (bucket) bucket[1].push(p);
      else groups.push([g, [p]]);
    }
    return (
      <label className="flex items-center gap-2 text-xs">
        <span className="text-muted shrink-0">Preset</span>
        <select
          className="input text-xs"
          value={state.presetId}
          onChange={(e) => {
            const preset = presets.find((p) => p.id === e.target.value);
            if (preset) update(presetPatch(preset, state));
          }}
          disabled={disabled}
          aria-label="Preset"
        >
          {!state.presetId && <option value="">custom</option>}
          {groups.map(([name, list]) => (
            <optgroup key={name} label={name}>
              {list.map((p) => (
                <option key={p.id} value={p.id} title={p.description}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div className="flex gap-2 flex-wrap">
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`btn py-1 px-2.5 text-[13px] ${state.presetId === p.id ? "border-accent" : ""}`}
          onClick={() => update(presetPatch(p, state))}
          title={p.description}
          disabled={disabled}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}

export function SourceChips({ state, update, disabled }: Pick<EditorProps, "state" | "update" | "disabled">) {
  return (
    <div className="flex gap-2 flex-wrap">
      {SOURCES.map((s) => (
        <button
          key={s.value}
          type="button"
          className={`btn py-1 px-2.5 text-[13px] ${state.sourceKind === s.value ? "border-accent" : ""}`}
          onClick={() => update({ sourceKind: s.value })}
          title={s.hint}
          disabled={disabled}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** The derived schema as text, or "" while there is none. */
export function derivedText(pydantic: PydanticState): string {
  return pydantic.schema ? JSON.stringify(pydantic.schema, null, 2) : "";
}

/** The Pydantic or JSON Schema textarea with its own errors; `extra` sits on the row under it. */
export function SourceEditor({ state, update, pydantic, disabled = false, minHeight, extra }: EditorProps & { minHeight: number; extra?: ReactNode }) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const isPydantic = state.sourceKind === "pydantic";
  // A new preset starts at its first line; the textarea would otherwise keep the old scroll offset.
  useEffect(() => {
    if (area.current) area.current.scrollTop = 0;
  }, [state.presetId, state.sourceKind]);
  const parsed = isPydantic ? null : parseSchema(state.schemaText);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`${(file.size / 1024).toFixed(0)} kB · limit ${MAX_UPLOAD_BYTES / 1000} kB`);
      return;
    }
    setUploadError(null);
    update({ pydanticText: await file.text(), pydanticModel: null, presetId: "", sourceKind: "pydantic" });
  };

  return (
    <div className="flex flex-col gap-1.5">
      {isPydantic ? (
        <textarea
          ref={area}
          className="input mono text-[12.5px]"
          style={{ minHeight }}
          value={state.pydanticText}
          onChange={(e) => update({ pydanticText: e.target.value, presetId: "", pydanticModel: null })}
          onDrop={(e) => {
            const file = e.dataTransfer.files?.[0];
            if (file) {
              e.preventDefault();
              void onFile(file);
            }
          }}
          spellCheck={false}
          disabled={disabled}
          aria-label="Pydantic model"
        />
      ) : (
        <textarea
          ref={area}
          className="input mono text-[12.5px]"
          style={{ minHeight }}
          value={state.schemaText}
          onChange={(e) => update({ schemaText: e.target.value, presetId: "" })}
          spellCheck={false}
          disabled={disabled}
          aria-label="JSON Schema"
        />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {isPydantic && (
          <>
            <button className="btn py-0.5 px-2 text-xs" type="button" onClick={() => fileInput.current?.click()} disabled={disabled} title="Load a .py file">
              Upload .py
            </button>
            <input ref={fileInput} type="file" accept=".py,text/x-python,text/plain" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Pydantic file" />
            {pydantic.models.length > 1 && (
              <label className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-muted">Class</span>
                <select
                  className="input input-fit py-0.5 px-1.5 text-xs"
                  value={state.pydanticModel ?? pydantic.root ?? ""}
                  onChange={(e) => update({ pydanticModel: e.target.value })}
                  disabled={disabled}
                  aria-label="Model to compile"
                >
                  {pydantic.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {pydantic.pending && <span className="chip">converting…</span>}
          </>
        )}
        <span className="ml-auto inline-flex items-center gap-2">{extra}</span>
      </div>

      {uploadError && <span className="font-mono text-xs text-critical">{uploadError}</span>}
      {isPydantic && pydantic.error && (
        <span className="font-mono text-xs text-critical">
          {pydantic.error.line !== null && `line ${pydantic.error.line} · `}
          {pydantic.error.message}
        </span>
      )}
      {parsed?.error && <span className="text-xs text-critical">Invalid JSON: {parsed.error}</span>}
    </div>
  );
}
