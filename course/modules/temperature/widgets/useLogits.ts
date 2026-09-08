"use client";

import { useEffect, useRef, useState } from "react";
import { FixtureMissError } from "@/data/client";
import { useDataSource } from "@/data/DataSourceProvider";
import type { LogitsRequest, LogitsResponse } from "@/lib/types";

export interface LogitsState {
  data: LogitsResponse | null;
  loading: boolean;
  error: string | null;
  missing: boolean;
}

export function useLogits(request: LogitsRequest | null, debounceMs = 400): LogitsState {
  const { client } = useDataSource();
  const [state, setState] = useState<LogitsState>({ data: null, loading: false, error: null, missing: false });
  const key = request ? JSON.stringify(request) : null;
  const latest = useRef(0);
  useEffect(() => {
    if (!request || !key) return;
    const id = ++latest.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState((s) => ({ ...s, loading: true }));
      client
        .logits(request, controller.signal)
        .then((data) => {
          if (latest.current === id) setState({ data, loading: false, error: null, missing: false });
        })
        .catch((e: unknown) => {
          if (latest.current !== id || controller.signal.aborted) return;
          if (e instanceof FixtureMissError) setState((s) => ({ ...s, loading: false, missing: true, error: null }));
          else setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
        });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, client, debounceMs]);
  return state;
}
