"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BACKEND_URL, fetchHealth, fetchPresets, normalizeUrl, readStoredBackendUrl, storeBackendUrl } from "@/lib/api";
import { FALLBACK_PRESETS } from "@/lib/presets";
import type { Health, Preset } from "@/lib/types";

export type BackendPhase = "unset" | "checking" | "online" | "waking" | "error" | "offline";

interface BackendContextValue {
  url: string;
  setUrl: (url: string) => void;
  phase: BackendPhase;
  health: Health | null;
  lastError: string | null;
  presets: Preset[];
  refresh: () => void;
  ready: boolean;
}

const BackendContext = createContext<BackendContextValue | null>(null);

export function BackendProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrlState] = useState<string>(DEFAULT_BACKEND_URL);
  const [phase, setPhase] = useState<BackendPhase>(DEFAULT_BACKEND_URL ? "checking" : "unset");
  const [health, setHealth] = useState<Health | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>(FALLBACK_PRESETS);
  const [tick, setTick] = useState(0);
  const presetsLoadedFor = useRef<string | null>(null);

  // Hydrate the URL the visitor saved earlier. The server cannot know it, so
  // this is a one-off effect after mount, not a render loop.
  useEffect(() => {
    const stored = readStoredBackendUrl();
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrlState(stored);
      setPhase("checking");
    }
  }, []);

  const setUrl = useCallback((next: string) => {
    const normalized = normalizeUrl(next);
    storeBackendUrl(normalized || null);
    setUrlState(normalized);
    setHealth(null);
    setLastError(null);
    setPhase(normalized ? "checking" : "unset");
    setTick((t) => t + 1);
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!url) return; // setUrl already put the phase at "unset"
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const h = await fetchHealth(url);
        if (cancelled) return;
        setHealth(h);
        setLastError(null);
        if (h.loaded) {
          setPhase("online");
          if (presetsLoadedFor.current !== url) {
            presetsLoadedFor.current = url;
            fetchPresets(url)
              .then((p) => {
                if (!cancelled && p.length) setPresets(p);
              })
              .catch(() => undefined);
          }
          timer = setTimeout(poll, 30000);
        } else if (h.error) {
          setPhase("error");
          setLastError(h.error);
          timer = setTimeout(poll, 30000);
        } else {
          setPhase("waking");
          timer = setTimeout(poll, 5000);
        }
      } catch (e) {
        if (cancelled) return;
        setPhase("offline");
        setLastError(e instanceof Error ? e.message : String(e));
        timer = setTimeout(poll, 8000);
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [url, tick]);

  const value = useMemo<BackendContextValue>(
    () => ({ url, setUrl, phase, health, lastError, presets, refresh, ready: phase === "online" }),
    [url, setUrl, phase, health, lastError, presets, refresh],
  );
  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}

export function useBackend(): BackendContextValue {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error("useBackend must be used inside BackendProvider");
  return ctx;
}
