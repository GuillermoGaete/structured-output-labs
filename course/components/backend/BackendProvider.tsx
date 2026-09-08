"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchHealth, fetchPresets, loadModel } from "@/lib/api/endpoints";
import { DEFAULT_BACKEND_URL, normalizeUrl } from "@/lib/api/http";
import { FALLBACK_PRESETS } from "@/lib/presets";
import { STORAGE_KEYS, readString, writeString } from "@/lib/storage";
import type { Health, ModelStatus, Preset } from "@/lib/types";

export type BackendPhase = "unset" | "checking" | "online" | "waking" | "error" | "offline";

interface BackendContextValue {
  url: string;
  setUrl: (url: string) => void;
  phase: BackendPhase;
  health: Health | null;
  lastError: string | null;
  presets: Preset[];
  refresh: () => void;
  /** The backend answers and the selected model is resident. */
  ready: boolean;
  models: ModelStatus[];
  /** Selected model id (null = the backend's default). */
  model: string | null;
  modelStatus: ModelStatus | null;
  setModel: (id: string | null) => void;
  /** Pause the health polling (recorded mode with no backend: no error loop during a talk). */
  setPaused: (paused: boolean) => void;
}

const BackendContext = createContext<BackendContextValue | null>(null);

export function BackendProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrlState] = useState<string>(DEFAULT_BACKEND_URL);
  const [phase, setPhase] = useState<BackendPhase>(DEFAULT_BACKEND_URL ? "checking" : "unset");
  const [health, setHealth] = useState<Health | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>(FALLBACK_PRESETS);
  const [model, setModelState] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  const presetsLoadedFor = useRef<string | null>(null);

  // Hydrate what the visitor saved earlier (server cannot know it): one effect after mount.
  useEffect(() => {
    const storedUrl = readString(STORAGE_KEYS.backendUrl);
    const storedModel = readString(STORAGE_KEYS.model);
    if (storedUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrlState(storedUrl);
      setPhase("checking");
    }
    if (storedModel) setModelState(storedModel);
  }, []);

  const setUrl = useCallback((next: string) => {
    const normalized = normalizeUrl(next);
    writeString(STORAGE_KEYS.backendUrl, normalized || null);
    setUrlState(normalized);
    setHealth(null);
    setLastError(null);
    setPhase(normalized ? "checking" : "unset");
    setTick((t) => t + 1);
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const setModel = useCallback(
    (id: string | null) => {
      setModelState(id);
      writeString(STORAGE_KEYS.model, id);
      const status = health?.models.find((m) => m.id === id);
      if (id && url && status && !status.loaded && !status.loading) {
        loadModel(url, id).catch(() => undefined);
        setTick((t) => t + 1);
      }
    },
    [health, url],
  );

  const models = useMemo(() => health?.models ?? [], [health]);
  const selectedId = model ?? health?.model_id ?? null;
  const modelStatus = models.find((m) => m.id === selectedId) ?? null;
  const selectedLoading = modelStatus ? !modelStatus.loaded && !modelStatus.error : false;

  useEffect(() => {
    if (!url || paused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const h = await fetchHealth(url);
        if (cancelled) return;
        setHealth(h);
        setLastError(null);
        const selected = h.models.find((m) => m.id === (model ?? h.model_id));
        const waitingForModel = selected ? !selected.loaded && !selected.error : false;
        if (h.loaded && !waitingForModel) {
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
        } else if (h.error || selected?.error) {
          setPhase("error");
          setLastError(h.error ?? selected?.error ?? null);
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
  }, [url, tick, paused, model]);

  const value = useMemo<BackendContextValue>(
    () => ({
      url,
      setUrl,
      phase,
      health,
      lastError,
      presets,
      refresh,
      ready: phase === "online" && !selectedLoading,
      models,
      model,
      modelStatus,
      setModel,
      setPaused,
    }),
    [url, setUrl, phase, health, lastError, presets, refresh, selectedLoading, models, model, modelStatus, setModel],
  );
  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}

export function useBackend(): BackendContextValue {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error("useBackend must be used inside BackendProvider");
  return ctx;
}
