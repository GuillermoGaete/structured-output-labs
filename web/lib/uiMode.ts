"use client";

import { useSyncExternalStore } from "react";

/** Lab shows everything; Talk hides the knobs a projector does not need and enlarges the tokens. */
export type UiMode = "lab" | "talk";

const KEY = "sol.ui.mode";
let mode: UiMode = "lab";
const listeners = new Set<() => void>();

function apply(next: UiMode) {
  mode = next;
  if (typeof document !== "undefined") document.documentElement.dataset.ui = next;
  listeners.forEach((l) => l());
}

/** Read the remembered mode once the browser can; call after mount. */
export function hydrateUiMode(): void {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(KEY);
  } catch {
    /* ignore */
  }
  apply(stored === "talk" ? "talk" : "lab");
}

export function setUiMode(next: UiMode): void {
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  apply(next);
}

export function useUiMode(): UiMode {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => mode,
    () => "lab",
  );
}
