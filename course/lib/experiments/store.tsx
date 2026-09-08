"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useBackend } from "@/components/backend/BackendProvider";
import { useDataSource } from "@/data/DataSourceProvider";
import type { GenerateRequest } from "@/lib/types";
import { runOne, compactRun } from "./runner";
import { MODES, type ConstraintMode, type Run } from "./types";

const SESSION_KEY = "sol.experiments";
const SESSION_CAP = 2_000_000; // ~2 MB of compact runs

interface StoreValue {
  runs: Run[];
  addRuns: (runs: Run[]) => void;
  removeRun: (id: string) => void;
  clear: (experimentKey?: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

/** App-level store: a run made live in M3 is visible in M4 and M5; compact copies survive a reload. */
export function ExperimentProvider({ children }: { children: React.ReactNode }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as Run[];
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRuns(stored.filter((r) => r.source === "live"));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      const live = runs.filter((r) => r.source === "live").map(compactRun);
      let json = JSON.stringify(live);
      while (json.length > SESSION_CAP && live.length) {
        live.shift();
        json = JSON.stringify(live);
      }
      sessionStorage.setItem(SESSION_KEY, json);
    } catch {
      /* ignore */
    }
  }, [runs]);

  const addRuns = useCallback((next: Run[]) => {
    setRuns((prev) => {
      const ids = new Set(next.map((r) => r.id));
      return [...prev.filter((r) => !ids.has(r.id)), ...next];
    });
  }, []);
  const removeRun = useCallback((id: string) => setRuns((prev) => prev.filter((r) => r.id !== id)), []);
  const clear = useCallback((experimentKey?: string) => setRuns((prev) => (experimentKey ? prev.filter((r) => r.experimentKey !== experimentKey) : [])), []);

  const value = useMemo(() => ({ runs, addRuns, removeRun, clear }), [runs, addRuns, removeRun, clear]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useExperimentStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useExperimentStore must be used inside ExperimentProvider");
  return ctx;
}

/** Runs of one experiment (from fixtures, live and imports), grouped by mode. */
export function useExperiment(experimentKey: string) {
  const store = useExperimentStore();
  const runs = useMemo(() => store.runs.filter((r) => r.experimentKey === experimentKey), [store.runs, experimentKey]);
  const byMode = useMemo(() => Object.fromEntries(MODES.map((m) => [m, runs.filter((r) => r.mode === m)])) as Record<ConstraintMode, Run[]>, [runs]);
  return { runs, byMode, addRuns: store.addRuns, removeRun: store.removeRun, clear: () => store.clear(experimentKey) };
}

export interface RunnerState {
  running: boolean;
  progress: { done: number; total: number } | null;
  streaming: Run | null;
  canRunLive: boolean;
  whyNot: "backend" | "recorded" | "busy" | null;
}

/** Sequential live runs through the backend (one generation at a time), appended to the store. */
export function useRunner(experimentKey: string, base: GenerateRequest) {
  const { client, effective } = useDataSource();
  const backend = useBackend();
  const { addRuns } = useExperimentStore();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [streaming, setStreaming] = useState<Run | null>(null);
  const abort = useRef<AbortController | null>(null);
  const baseRef = useRef(base);
  useEffect(() => {
    baseRef.current = base;
  });

  const whyNot: RunnerState["whyNot"] = running ? "busy" : effective !== "live" ? "recorded" : !backend.ready ? "backend" : null;
  const canRunLive = whyNot === null;

  const runMany = useCallback(
    async (modes: ConstraintMode[], n: number, seeds?: number[]) => {
      if (running || effective !== "live") return [];
      setRunning(true);
      const controller = new AbortController();
      abort.current = controller;
      const total = modes.length * n;
      setProgress({ done: 0, total });
      const made: Run[] = [];
      try {
        for (const mode of modes) {
          for (let i = 0; i < n; i++) {
            if (controller.signal.aborted) break;
            const seed = seeds ? seeds[i] : Math.floor(Math.random() * 1_000_000);
            const run = await runOne(client, baseRef.current, mode, experimentKey, {
              seed,
              includeSteps: true,
              signal: controller.signal,
              source: "live",
              onEvent: (_e, trace) => setStreaming({ ...(made[made.length - 1] ?? ({} as Run)), mode, trace } as Run),
            });
            made.push(run);
            addRuns([run]);
            setProgress({ done: made.length, total });
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) throw e;
      } finally {
        setRunning(false);
        setStreaming(null);
        setProgress(null);
        abort.current = null;
      }
      return made;
    },
    [running, effective, client, experimentKey, addRuns],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  return { runMany, stop, running, progress, streaming, canRunLive, whyNot };
}
