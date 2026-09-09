"use client";

import { useCallback, useEffect, useState } from "react";
import { FALLBACK_PRESETS } from "./presets";
import type { ModeRequest } from "./types";

/** Where the schema comes from: a pasted Pydantic model, or JSON Schema typed directly. */
export type SourceKind = "pydantic" | "schema";

export interface LabState {
  presetId: string;
  sourceKind: SourceKind;
  /** Pydantic source; the backend derives the schema from it. */
  pydanticText: string;
  /** Which class in that source to compile, when it defines several. */
  pydanticModel: string | null;
  schemaText: string;
  prompt: string;
  mode: ModeRequest;
  maxNewTokens: number;
  temperature: number;
  /** Decimals shown on probabilities. */
  pctDigits: number;
  /** Entries per top-K list (sent to the backend on the next run, max 20). */
  topK: number;
  /** Log-scale bars so tiny probabilities stay visible. */
  logBars: boolean;
}

const KEY = "sol.lab";

const initial: LabState = {
  presetId: "person",
  sourceKind: "pydantic",
  pydanticText: FALLBACK_PRESETS[0].model_source ?? "",
  pydanticModel: null,
  schemaText: JSON.stringify(FALLBACK_PRESETS[0].schema, null, 2),
  prompt: FALLBACK_PRESETS[0].prompt,
  mode: "auto",
  maxNewTokens: 120,
  temperature: 0,
  pctDigits: 1,
  topK: 8,
  logBars: false,
};

/** Schema, prompt and knobs, remembered per browser. */
export function useLabState(): [LabState, (patch: Partial<LabState>) => void] {
  const [state, setState] = useState<LabState>(initial);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount. The server cannot know the stored
  // value, so this has to be an effect; it runs once and is not a render loop.
  useEffect(() => {
    let stored: Partial<LabState> | null = null;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) stored = JSON.parse(raw) as Partial<LabState>;
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setState({ ...initial, ...stored });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  const update = useCallback((patch: Partial<LabState>) => setState((s) => ({ ...s, ...patch })), []);
  return [state, update];
}

export function parseSchema(text: string): { schema: Record<string, unknown> | null; error: string | null } {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { schema: null, error: "The schema must be a JSON object." };
    }
    return { schema: value as Record<string, unknown>, error: null };
  } catch (e) {
    return { schema: null, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}
