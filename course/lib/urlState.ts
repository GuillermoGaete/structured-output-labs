"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Typed, shareable lab state in the query string. Local state is the source of
 * truth; writes go through `history.replaceState` (router-integrated in Next 16,
 * no server round trip); only non-default values appear in the URL.
 */
export interface ParamCodec<T> {
  parse(raw: string | null): T | undefined;
  serialize(value: T): string | null;
}

export const codecs = {
  string(): ParamCodec<string> {
    return { parse: (raw) => (raw === null ? undefined : raw), serialize: (v) => v };
  },
  number(opts: { min?: number; max?: number; step?: number } = {}): ParamCodec<number> {
    return {
      parse: (raw) => {
        if (raw === null || raw === "") return undefined;
        const n = Number(raw);
        if (!Number.isFinite(n)) return undefined;
        let v = n;
        if (opts.step) v = Math.round(v / opts.step) * opts.step;
        if (opts.min !== undefined) v = Math.max(opts.min, v);
        if (opts.max !== undefined) v = Math.min(opts.max, v);
        return v;
      },
      serialize: (v) => String(v),
    };
  },
  boolean(): ParamCodec<boolean> {
    return {
      parse: (raw) => (raw === null ? undefined : raw === "1" || raw === "true"),
      serialize: (v) => (v ? "1" : "0"),
    };
  },
  nullableNumber(): ParamCodec<number | null> {
    return {
      parse: (raw) => {
        if (raw === null) return undefined;
        if (raw === "" || raw === "null") return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : undefined;
      },
      serialize: (v) => (v === null ? "null" : String(v)),
    };
  },
  enumOf<const V extends readonly string[]>(values: V): ParamCodec<V[number]> {
    return {
      parse: (raw) => (raw !== null && (values as readonly string[]).includes(raw) ? (raw as V[number]) : undefined),
      serialize: (v) => v,
    };
  },
  json<T>(opts: { maxChars?: number } = {}): ParamCodec<T> {
    return {
      parse: (raw) => {
        if (raw === null) return undefined;
        try {
          return JSON.parse(fromBase64Url(raw)) as T;
        } catch {
          return undefined;
        }
      },
      serialize: (v) => {
        const encoded = toBase64Url(JSON.stringify(v));
        return opts.maxChars && encoded.length > opts.maxChars ? null : encoded;
      },
    };
  },
};

export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export type UrlSchema<T> = { [K in keyof T]: { key?: string; codec: ParamCodec<T[K]>; default: T[K] } };

export function parseUrlState<T extends object>(schema: UrlSchema<T>, params: URLSearchParams, fallback?: Partial<T>): T {
  const out = {} as T;
  for (const field of Object.keys(schema) as (keyof T)[]) {
    const spec = schema[field];
    const key = spec.key ?? String(field);
    const parsed = spec.codec.parse(params.get(key));
    out[field] = parsed !== undefined ? parsed : fallback && field in fallback && fallback[field] !== undefined ? (fallback[field] as T[keyof T]) : spec.default;
  }
  return out;
}

export function serializeUrlState<T extends object>(schema: UrlSchema<T>, state: T, base: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const field of Object.keys(schema) as (keyof T)[]) {
    const spec = schema[field];
    const key = spec.key ?? String(field);
    const value = state[field];
    const isDefault = JSON.stringify(value) === JSON.stringify(spec.default);
    const encoded = isDefault ? null : spec.codec.serialize(value);
    if (encoded === null) params.delete(key);
    else params.set(key, encoded);
  }
  return params;
}

export interface UrlStateOptions<T> {
  history?: "replace" | "push";
  debounceMs?: number;
  fallback?: () => Partial<T>;
}

export function useUrlState<T extends object>(
  schema: UrlSchema<T>,
  opts: UrlStateOptions<T> = {},
): [T, (patch: Partial<T>) => void, { href: string; isDefault: boolean; reset: () => void }] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  // Define the schema at module level: its identity is part of the memo below.
  const schemaRef = useRef(schema);
  const fallbackRef = useRef(opts.fallback);
  useEffect(() => {
    schemaRef.current = schema;
    fallbackRef.current = opts.fallback;
  });

  const [state, setState] = useState<T>(() => parseUrlState(schema, new URLSearchParams(searchParams.toString()), opts.fallback?.()));
  const lastSerialized = useRef<string>(searchParams.toString());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Back/forward or an external navigation changed the query string: adopt it.
  useEffect(() => {
    const current = searchParams.toString();
    if (current === lastSerialized.current) return;
    lastSerialized.current = current;
    setState(parseUrlState(schemaRef.current, new URLSearchParams(current), fallbackRef.current?.()));
  }, [searchParams]);

  const write = useCallback(
    (next: T) => {
      const params = serializeUrlState(schemaRef.current, next, new URLSearchParams(window.location.search));
      const query = params.toString();
      const url = `${pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      if (query === lastSerialized.current) return;
      lastSerialized.current = query;
      if (opts.history === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [pathname, opts.history],
  );

  const update = useCallback(
    (patch: Partial<T>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        if (timer.current) clearTimeout(timer.current);
        const delay = opts.debounceMs ?? 150;
        timer.current = setTimeout(() => write(next), delay);
        return next;
      });
    },
    [opts.debounceMs, write],
  );

  const reset = useCallback(() => {
    const defaults = {} as T;
    for (const field of Object.keys(schemaRef.current) as (keyof T)[]) defaults[field] = schemaRef.current[field].default;
    setState(defaults);
    write(defaults);
  }, [write]);

  const meta = useMemo(() => {
    const params = serializeUrlState(schema, state, new URLSearchParams());
    const query = params.toString();
    return { href: `${pathname}${query ? `?${query}` : ""}`, isDefault: query === "", reset };
  }, [schema, state, pathname, reset]);

  return [state, update, meta];
}
