"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRunState } from "./runStore";

/**
 * Every mode is two screens: 1 · Setup, then 2 · Inference. One value for the
 * whole app (only one mode is on screen), mirrored to the URL hash `#run` so a
 * reload stays on the results.
 */
export type Step = 1 | 2;

let step: Step = 1;
const listeners = new Set<() => void>();

export function setStep(next: Step): void {
  step = next;
  if (typeof window !== "undefined") {
    const url = `${window.location.pathname}${window.location.search}${next === 2 ? "#run" : ""}`;
    window.history.replaceState(window.history.state, "", url);
  }
  listeners.forEach((l) => l());
}

function useRawStep(): Step {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => step,
    () => 1,
  );
}

/** Step 2 needs something to show: with no run at all, the setup is the only screen. */
export function useStep(): Step {
  const raw = useRawStep();
  const hasRuns = useRunState((s) => s.batchOrder.length > 0);
  return raw === 2 && hasRuns ? 2 : 1;
}

export function useHasRuns(): boolean {
  return useRunState((s) => s.batchOrder.length > 0);
}

/**
 * For a mode's page: start on the step the URL asks for, and move to the
 * results whenever a new batch starts, whichever control started it. Batches
 * restored from storage on load do not count.
 */
export function useStepFlow(): void {
  const newest = useRunState((s) => s.batchOrder[0] ?? null);
  const hydrated = useRunState((s) => s.hydrated);
  const seen = useRef<{ hydrated: boolean; newest: string | null }>({ hydrated: false, newest: null });

  useEffect(() => {
    setStep(window.location.hash === "#run" ? 2 : 1);
  }, []);

  useEffect(() => {
    const before = seen.current;
    if (before.hydrated && hydrated && newest !== null && newest !== before.newest) setStep(2);
    seen.current = { hydrated, newest };
  }, [newest, hydrated]);
}
