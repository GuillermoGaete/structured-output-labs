"use client";

import { useMemo } from "react";
import { useBackend } from "./BackendProvider";
import type { LabState } from "@/lib/labState";
import { parseSchema } from "@/lib/labState";
import type { ModeRequest } from "@/lib/types";

interface Props {
  state: LabState;
  update: (patch: Partial<LabState>) => void;
  showPrompt?: boolean;
  showKnobs?: boolean;
  disabled?: boolean;
}

const MODES: { value: ModeRequest; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "FSM for flat schemas, grammar for recursive ones" },
  { value: "fsm", label: "FSM", hint: "outlines_core: schema → regex → finite automaton over tokens" },
  { value: "cfg", label: "CFG", hint: "llguidance: schema → grammar with a real stack" },
];

export function SchemaEditor({ state, update, showPrompt = true, showKnobs = false, disabled = false }: Props) {
  const { presets } = useBackend();
  const parsed = useMemo(() => parseSchema(state.schemaText), [state.schemaText]);

  const applyPreset = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    update({ presetId: id, schemaText: JSON.stringify(preset.schema, null, 2), prompt: preset.prompt });
  };

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

      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">JSON Schema (editable)</span>
        <textarea
          className="input mono text-[12.5px] min-h-[220px]"
          value={state.schemaText}
          onChange={(e) => update({ schemaText: e.target.value, presetId: "" })}
          spellCheck={false}
          disabled={disabled}
        />
        {parsed.error ? (
          <span className="text-xs text-critical">Schema is not valid JSON: {parsed.error}</span>
        ) : (
          <span className="text-xs text-muted">Any JSON Schema outlines accepts works: objects, arrays, enums, string patterns, `$ref`s.</span>
        )}
      </label>

      {showPrompt && (
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Prompt</span>
          <textarea
            className="input text-sm min-h-[84px]"
            value={state.prompt}
            onChange={(e) => update({ prompt: e.target.value })}
            disabled={disabled}
          />
        </label>
      )}

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
        <span className="text-xs text-muted">{MODES.find((m) => m.value === state.mode)?.hint}</span>
      </div>

      {showKnobs && (
        <div className="grid grid-cols-2 gap-3">
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
      )}
    </div>
  );
}
