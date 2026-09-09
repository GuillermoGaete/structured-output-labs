"use client";

import { useEffect, useState } from "react";
import { PydanticSourceError, schemaFromPydantic } from "./api";
import type { PydanticError } from "./types";

const DEBOUNCE_MS = 400;

interface Result {
  /** The source this result belongs to, so `pending` can be derived instead of stored. */
  source: string;
  model: string | null;
  schema: Record<string, unknown> | null;
  root: string | null;
  models: string[];
  error: PydanticError | null;
}

const EMPTY: Result = { source: "", model: null, schema: null, root: null, models: [], error: null };

export interface PydanticState {
  schema: Record<string, unknown> | null;
  root: string | null;
  models: string[];
  error: PydanticError | null;
  pending: boolean;
}

/**
 * Debounced Pydantic source -> JSON Schema, via the backend (which parses the
 * source, never runs it). Returns the last good schema while a new one is in
 * flight, so the page does not flicker between keystrokes.
 */
export function usePydanticSchema(source: string, model: string | null, enabled: boolean, base: string, ready: boolean): PydanticState {
  const [result, setResult] = useState<Result>(EMPTY);
  const trimmed = source.trim();

  useEffect(() => {
    if (!enabled || !ready || !trimmed) return;
    if (result.source === source && result.model === model) return;
    let live = true;
    const settle = (next: Result) => {
      if (live) setResult(next);
    };
    const timer = setTimeout(() => {
      schemaFromPydantic(base, source, model)
        .then((out) => settle({ source, model, schema: out.schema, root: out.root, models: out.models, error: null }))
        .catch((e) =>
          settle(
            e instanceof PydanticSourceError
              ? { source, model, schema: null, root: null, models: [], error: { message: e.message, line: e.line } }
              : { source, model, schema: null, root: null, models: [], error: { message: e instanceof Error ? e.message : String(e), line: null } },
          ),
        );
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [enabled, ready, base, source, model, trimmed, result.source, result.model]);

  const fresh = result.source === source && result.model === model;
  return {
    schema: result.schema,
    root: result.root,
    models: result.models,
    error: fresh ? result.error : null,
    pending: enabled && !!trimmed && !fresh,
  };
}
