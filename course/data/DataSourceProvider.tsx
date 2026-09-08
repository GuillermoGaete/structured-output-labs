"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useBackend } from "@/components/backend/BackendProvider";
import { STORAGE_KEYS, readString, writeString } from "@/lib/storage";
import { createLiveClient, createRecordedClient, type LabClient } from "./client";
import type { FixtureFile, FixtureManifestEntry } from "./fixtures";

export type DataSourceMode = "auto" | "live" | "recorded";

interface DataSourceValue {
  mode: DataSourceMode;
  setMode: (mode: DataSourceMode) => void;
  /** What actually answers right now: live when chosen and reachable, recorded otherwise. */
  effective: "live" | "recorded";
  client: LabClient;
  /** Fixtures registered by the module currently on screen. */
  fixtures: FixtureManifestEntry[];
  registerFixtures: (entries: FixtureManifestEntry[]) => () => void;
  loaded: FixtureFile[];
  activeFixtureId: string | null;
  setActiveFixture: (id: string | null) => void;
  imported: FixtureFile[];
  importFixture: (file: FixtureFile) => void;
  replayDelayMs: number;
  setReplayDelayMs: (ms: number) => void;
}

const DataSourceContext = createContext<DataSourceValue | null>(null);

export function DataSourceProvider({ children }: { children: React.ReactNode }) {
  const backend = useBackend();
  const [mode, setModeState] = useState<DataSourceMode>("auto");
  const [entries, setEntries] = useState<FixtureManifestEntry[]>([]);
  const [loaded, setLoaded] = useState<FixtureFile[]>([]);
  const [imported, setImported] = useState<FixtureFile[]>([]);
  const [activeFixtureId, setActiveFixture] = useState<string | null>(null);
  const [replayDelayMs, setReplayDelayMs] = useState(0);

  useEffect(() => {
    // `?src=live|recorded|auto` pins the source for this page load (a rehearsal tab); storage otherwise.
    const fromUrl = new URLSearchParams(window.location.search).get("src");
    const stored = readString(STORAGE_KEYS.dataSource);
    const pick = fromUrl === "live" || fromUrl === "recorded" || fromUrl === "auto" ? fromUrl : stored;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pick === "live" || pick === "recorded" || pick === "auto") setModeState(pick);
  }, []);

  const setMode = useCallback((next: DataSourceMode) => {
    setModeState(next);
    writeString(STORAGE_KEYS.dataSource, next);
  }, []);

  const registerFixtures = useCallback((next: FixtureManifestEntry[]) => {
    setEntries(next);
    let cancelled = false;
    Promise.all(next.map((e) => e.load().catch(() => null))).then((files) => {
      if (!cancelled) setLoaded(files.filter((f): f is FixtureFile => f !== null));
    });
    return () => {
      cancelled = true;
      setEntries([]);
      setLoaded([]);
    };
  }, []);

  const importFixture = useCallback((file: FixtureFile) => {
    setImported((prev) => [...prev.filter((f) => f.id !== file.id), file]);
    setActiveFixture(file.id);
  }, []);

  const effective: "live" | "recorded" = mode === "live" ? "live" : mode === "recorded" ? "recorded" : backend.ready ? "live" : "recorded";

  const client = useMemo<LabClient>(() => {
    if (effective === "live") return createLiveClient(backend.url, backend.model);
    return createRecordedClient([...imported, ...loaded], { activeId: activeFixtureId, replayDelayMs });
  }, [effective, backend.url, backend.model, imported, loaded, activeFixtureId, replayDelayMs]);

  const value = useMemo<DataSourceValue>(
    () => ({
      mode,
      setMode,
      effective,
      client,
      fixtures: entries,
      registerFixtures,
      loaded,
      activeFixtureId,
      setActiveFixture,
      imported,
      importFixture,
      replayDelayMs,
      setReplayDelayMs,
    }),
    [mode, setMode, effective, client, entries, registerFixtures, loaded, activeFixtureId, imported, importFixture, replayDelayMs],
  );
  return <DataSourceContext.Provider value={value}>{children}</DataSourceContext.Provider>;
}

export function useDataSource(): DataSourceValue {
  const ctx = useContext(DataSourceContext);
  if (!ctx) throw new Error("useDataSource must be used inside DataSourceProvider");
  return ctx;
}

/** Labs call this once with their module's manifest; the provider loads the files. */
export function useModuleFixtures(entries: FixtureManifestEntry[]): void {
  const { registerFixtures } = useDataSource();
  useEffect(() => registerFixtures(entries), [registerFixtures, entries]);
}
