"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";

/**
 * One window keydown listener with scopes. The most recently activated scope
 * that handles a key wins; unhandled keys fall through to older scopes.
 * Events from editable targets, modifier combos, IME composition and anything
 * inside `[data-hotkeys="local"]` are never dispatched.
 */
export interface HotkeyBinding {
  /** `e.key` values (case-insensitive for letters) or `e.code` values. */
  keys: string[];
  handler: (e: KeyboardEvent) => void;
  when?: () => boolean;
}

interface ScopeEntry {
  scope: string;
  bindings: HotkeyBinding[];
  active: boolean;
  order: number;
}

interface HotkeysApi {
  register: (entry: ScopeEntry) => () => void;
  touch: (entry: ScopeEntry) => void;
}

const HotkeysContext = createContext<HotkeysApi | null>(null);

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return true;
  return target.closest('[data-hotkeys="local"]') !== null;
}

function matches(binding: HotkeyBinding, e: KeyboardEvent): boolean {
  return binding.keys.some((k) => k === e.code || k === e.key || k.toLowerCase() === e.key.toLowerCase());
}

export function HotkeysProvider({ children }: { children: React.ReactNode }) {
  const entries = useRef<ScopeEntry[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target)) return;
      const ordered = [...entries.current].filter((en) => en.active).sort((a, b) => b.order - a.order);
      for (const entry of ordered) {
        for (const binding of entry.bindings) {
          if (!matches(binding, e)) continue;
          if (binding.when && !binding.when()) continue;
          e.preventDefault();
          binding.handler(e);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const api = useMemo<HotkeysApi>(
    () => ({
      register: (entry) => {
        entry.order = ++counter.current;
        entries.current.push(entry);
        return () => {
          entries.current = entries.current.filter((en) => en !== entry);
        };
      },
      touch: (entry) => {
        entry.order = ++counter.current;
      },
    }),
    [],
  );
  return <HotkeysContext.Provider value={api}>{children}</HotkeysContext.Provider>;
}

/** Register `bindings` under `scope` while mounted; `active: false` keeps them registered but silent. */
export function useHotkeys(scope: string, bindings: HotkeyBinding[], options: { active?: boolean } = {}): void {
  const api = useContext(HotkeysContext);
  const active = options.active ?? true;
  const entry = useRef<ScopeEntry>({ scope, bindings, active, order: 0 });

  // Handlers close over fresh state; swap them in after every render (they are only read on keydown).
  useEffect(() => {
    entry.current.bindings = bindings;
  });

  useEffect(() => {
    if (!api) return;
    return api.register(entry.current);
  }, [api]);

  useEffect(() => {
    const current = entry.current;
    current.active = active;
    if (active && api) api.touch(current); // becoming active moves the scope to the front
  }, [active, api]);
}

export function useHotkeysAvailable(): boolean {
  return useContext(HotkeysContext) !== null;
}

/** Small helper for components that want the label of a key in the current OS. */
export const useKeyLabel = () =>
  useCallback((key: string) => (key === "ArrowLeft" ? "←" : key === "ArrowRight" ? "→" : key === " " ? "Space" : key), []);
