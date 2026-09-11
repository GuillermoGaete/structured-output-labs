"use client";

import { useEffect, useState } from "react";
import { useActiveBatch, useQueued, useRunsRecord } from "@/lib/runStore";

/** "run 4 / 10 · 38 s · ~60 s left" while a repeat is in flight. */
export function BatchProgress() {
  const batch = useActiveBatch();
  const queued = useQueued();
  const runs = useRunsRecord();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!batch) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [batch]);
  if (!batch || (batch.n < 2 && !queued && !batch.probe)) return null;
  const list = batch.runIds.map((id) => runs[id]).filter(Boolean);
  const finished = list.filter((r) => r.status === "done" || r.status === "error" || r.status === "cancelled").length;
  const current = Math.min(finished + 1, batch.n);
  const elapsed = Math.max(0, (now - batch.createdAt) / 1000);
  const perRun = finished ? elapsed / finished : null;
  const left = perRun !== null ? Math.round(perRun * (batch.n - finished)) : null;
  return (
    <span className="chip chip-warning" title="Runs finished so far, time spent, and a guess at what is left from the mean so far">
      {batch.probe ? `${batch.probe.variant} · ` : ""}run {current} / {batch.n} · {Math.round(elapsed)} s{left !== null ? ` · ~${left} s left` : ""}
      {queued ? ` · ${queued} more batch${queued > 1 ? "es" : ""} queued` : ""}
    </span>
  );
}
