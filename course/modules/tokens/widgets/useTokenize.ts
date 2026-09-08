"use client";

import { useEffect, useRef, useState } from "react";
import { FixtureMissError } from "@/data/client";
import { useDataSource } from "@/data/DataSourceProvider";
import type { TokenizeRequest, TokenizeResponse } from "@/lib/types";

export interface TokenizeState {
  data: TokenizeResponse | null;
  loading: boolean;
  error: string | null;
  missing: boolean;
}

/** Tokenize through the current data source, debounced, with the last answer kept while a new one loads. */
export function useTokenize(request: TokenizeRequest | null, debounceMs = 300): TokenizeState {
  const { client } = useDataSource();
  const [state, setState] = useState<TokenizeState>({ data: null, loading: false, error: null, missing: false });
  const key = request ? JSON.stringify(request) : null;
  const latest = useRef(0);

  useEffect(() => {
    if (!request || !key) return;
    const id = ++latest.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState((s) => ({ ...s, loading: true }));
      client
        .tokenize(request, controller.signal)
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
    // `key` is the serialized request; `request` itself is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, client, debounceMs]);

  return state;
}
