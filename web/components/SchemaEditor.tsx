"use client";

import { useMemo, useRef, useState } from "react";
import { useBackend } from "./BackendProvider";
import type { LabState, SourceKind } from "@/lib/labState";
import { parseSchema } from "@/lib/labState";
import type { ModeRequest } from "@/lib/types";
import type { PydanticState } from "@/lib/usePydanticSchema";

interface Props {
  state: LabState;
  update: (patch: Partial<LabState>) => void;
  pydantic: PydanticState;
  disabled?: boolean;
}

const MODES: { value: ModeRequest; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "FSM for flat schemas, grammar for recursive ones" },
  { value: "fsm", label: "FSM", hint: "outlines_core: schema → regex → finite automaton over tokens" },
  { value: "cfg", label: "CFG", hint: "llguidance: schema → grammar with a real stack" },
];

const SOURCES: { value: SourceKind; label: string; hint: string }[] = [
  { value: "pydantic", label: "Pydantic", hint: "Paste a BaseModel; the server derives its JSON Schema" },
  { value: "schema", label: "JSON Schema", hint: "Write the schema outlines compiles, directly" },
];

const MAX_UPLOAD_BYTES = 8_000;

export function SchemaEditor({ state, update, pydantic, disabled = false }: Props) {
  const { presets } = useBackend();
  const parsed = useMemo(() => parseSchema(state.schemaText), [state.schemaText]);
  const [showDerived, setShowDerived] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const isPydantic = state.sourceKind === "pydantic";

  const applyPreset = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    update({
      presetId: id,
      schemaText: JSON.stringify(preset.schema, null, 2),
      pydanticText: preset.model_source ?? state.pydanticText,
      pydanticModel: null,
      prompt: preset.prompt,
    });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`${(file.size / 1024).toFixed(0)} kB · limit ${MAX_UPLOAD_BYTES / 1000} kB`);
      return;
    }
    setUploadError(null);
    update({ pydanticText: await file.text(), pydanticModel: null, presetId: "", sourceKind: "pydantic" });
  };

  const derived = pydantic.schema ? JSON.stringify(pydantic.schema, null, 2) : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">Preset</span>
        <div className="flex gap-2 flex-wrap">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn ${state.presetId === p.id ? "border-accent" : ""}`}
              onClick={() => applyPreset(p.id)}
              title={p.description}
              disabled={disabled}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">Source</span>
        <div className="flex gap-2 flex-wrap">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`btn ${state.sourceKind === s.value ? "border-accent" : ""}`}
              onClick={() => update({ sourceKind: s.value })}
              title={s.hint}
              disabled={disabled}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {isPydantic ? (
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Pydantic model</span>
            <textarea
              className="input mono text-[12.5px] min-h-[220px]"
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
            />
          </label>

          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn py-0.5 px-2 text-xs" type="button" onClick={() => fileInput.current?.click()} disabled={disabled} title="Load a .py file">
              Upload .py
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".py,text/x-python,text/plain"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
              aria-label="Pydantic file"
            />
            {pydantic.models.length > 1 && (
              <label className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-muted">Model</span>
                <select
                  className="input w-auto py-0.5 px-1.5 text-xs"
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
          </div>

          {uploadError && <span className="font-mono text-xs text-critical">{uploadError}</span>}
          {pydantic.error && (
            <span className="font-mono text-xs text-critical">
              {pydantic.error.line !== null && `line ${pydantic.error.line} · `}
              {pydantic.error.message}
            </span>
          )}

          {derived && (
            <div className="flex flex-col gap-1">
              <button className="flex items-center gap-2 self-start text-xs text-ink-2" type="button" onClick={() => setShowDerived((v) => !v)} aria-expanded={showDerived}>
                <span aria-hidden="true">{showDerived ? "▾" : "▸"}</span>
                <span className="eyebrow">Derived schema</span>
                <span className="chip">{derived.length.toLocaleString("en-US")} chars</span>
              </button>
              {showDerived && <pre className="panel mono max-h-64 overflow-auto p-2 text-[11.5px] leading-snug">{derived}</pre>}
            </div>
          )}
        </div>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">JSON Schema</span>
          <textarea
            className="input mono text-[12.5px] min-h-[220px]"
            value={state.schemaText}
            onChange={(e) => update({ schemaText: e.target.value, presetId: "" })}
            spellCheck={false}
            disabled={disabled}
          />
          {parsed.error && <span className="text-xs text-critical">Invalid JSON: {parsed.error}</span>}
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Prompt</span>
        <textarea className="input text-sm min-h-[84px]" value={state.prompt} onChange={(e) => update({ prompt: e.target.value })} disabled={disabled} />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">Constraint engine</span>
        <div className="flex gap-2 flex-wrap">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`btn ${state.mode === m.value ? "border-accent" : ""}`}
              onClick={() => update({ mode: m.value })}
              title={m.hint}
              disabled={disabled}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Max new tokens · {state.maxNewTokens}</span>
          <input
            type="range"
            min={8}
            max={200}
            step={4}
            value={state.maxNewTokens}
            onChange={(e) => update({ maxNewTokens: Number(e.target.value) })}
            disabled={disabled}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Temperature · {state.temperature === 0 ? "greedy" : state.temperature.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={state.temperature}
            onChange={(e) => update({ temperature: Number(e.target.value) })}
            disabled={disabled}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="eyebrow">Display</span>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs">
          <label className="col-span-2 inline-flex items-center gap-1.5">
            <span className="text-muted">Decimals</span>
            <select
              className="input w-auto py-0.5 px-1.5 text-xs"
              value={state.pctDigits}
              onChange={(e) => update({ pctDigits: Number(e.target.value) })}
              aria-label="Decimals shown on probabilities"
            >
              {[1, 2, 3, 4, 6].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn col-span-2 justify-self-start py-0.5 px-2 text-xs"
            onClick={() => update({ logBars: !state.logBars })}
            title="Log scale keeps tiny probabilities visible"
          >
            {state.logBars ? "log bars" : "linear bars"}
          </button>
          <label className="col-span-2 inline-flex items-center gap-1.5">
            <span className="text-muted">Top-K</span>
            <input
              type="number"
              min={1}
              max={20}
              className="input w-14 py-0.5 px-1.5 text-xs tabular-nums"
              value={state.topK}
              onChange={(e) => update({ topK: Math.min(Math.max(Number(e.target.value) || 1, 1), 20) })}
              aria-label="Entries per top-K list"
              title="Applies to the next run; max 20"
            />
            <span className="text-muted">next run</span>
          </label>
        </div>
      </div>
    </div>
  );
}
