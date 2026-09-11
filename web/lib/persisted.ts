"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * State remembered per browser under `key`.
 *
 * The server cannot read localStorage, so the first render uses `initial` and
 * the stored value is applied after mount; that keeps hydration clean. Every
 * later change is written back. `initial` must be a module-level constant.
 */
export function usePersistedState<T extends object>(key: string, initial: T): [T, (patch: Partial<T>) => void] {
  const [state, setState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let stored: Partial<T> | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) stored = JSON.parse(raw) as Partial<T>;
    } catch {
      /* private mode etc. */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setState({ ...initial, ...stored });
    setHydrated(true);
  }, [key, initial]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [key, state, hydrated]);

  const update = useCallback((patch: Partial<T>) => setState((s) => ({ ...s, ...patch })), []);
  return [state, update];
}
