"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { LabProps, ModuleId } from "./types";

const loading = () => <div className="panel p-6 text-sm text-muted">…</div>;

/** One chunk per lab. `ssr: false`: labs read localStorage and the URL on mount. */
export const LABS: Record<ModuleId, ComponentType<LabProps>> = {
  tokens: dynamic(() => import("./tokens/Lab"), { ssr: false, loading }),
  "next-token": dynamic(() => import("./next-token/Lab"), { ssr: false, loading }),
  temperature: dynamic(() => import("./temperature/Lab"), { ssr: false, loading }),
  "no-strict": dynamic(() => import("./no-strict/Lab"), { ssr: false, loading }),
  strict: dynamic(() => import("./strict/Lab"), { ssr: false, loading }),
  benchmark: dynamic(() => import("./benchmark/Lab"), { ssr: false, loading }),
};
