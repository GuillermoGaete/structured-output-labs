/** localStorage with every read and write guarded: private mode, previews and SSR all throw or lack it. */

export const STORAGE_KEYS = {
  backendUrl: "sol.backendUrl",
  theme: "sol.theme",
  model: "sol.model",
  dataSource: "sol.dataSource",
  display: "sol.display",
  lab: "sol.lab",
} as const;

export function readString(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function readJson<T>(key: string): T | null {
  const raw = readString(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeString(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
