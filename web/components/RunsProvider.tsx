"use client";

import { useEffect } from "react";
import { readPersisted, runStore } from "@/lib/runStore";
import { hydrateUiMode } from "@/lib/uiMode";

/** Brings the remembered runs and the interface mode back once the browser can read them. The stores are module singletons. */
export function RunsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    hydrateUiMode();
    runStore.dispatch({ type: "hydrate", persisted: readPersisted() });
  }, []);
  return <>{children}</>;
}
