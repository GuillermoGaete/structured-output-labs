"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS, readString, writeString } from "./storage";

export type ThemeChoice = "light" | "dark" | "system";

/**
 * Runs before the first paint (inline in the root layout) so a stored or
 * URL-forced theme never flashes. `?theme=light|dark` wins over storage so a
 * projector link can pin the theme.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var q=new URLSearchParams(location.search).get("theme");var t=(q==="light"||q==="dark")?q:localStorage.getItem("${STORAGE_KEYS.theme}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

interface ThemeValue {
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
  toggle: () => void;
  resolved: "light" | "dark";
}

const ThemeContext = createContext<ThemeValue | null>(null);

function readCurrent(): ThemeChoice {
  if (typeof document === "undefined") return "system";
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || attr === "dark" ? attr : "system";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    // The inline script already stamped the attribute; read it once after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(readCurrent());
    setSystemDark(systemPrefersDark());
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq?.addEventListener("change", onChange);
    return () => mq?.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
      writeString(STORAGE_KEYS.theme, null);
    } else {
      document.documentElement.setAttribute("data-theme", next);
      writeString(STORAGE_KEYS.theme, next);
    }
  }, []);

  const resolved: "light" | "dark" = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  const toggle = useCallback(() => setTheme(resolved === "dark" ? "light" : "dark"), [resolved, setTheme]);

  const value = useMemo<ThemeValue>(() => ({ theme, setTheme, toggle, resolved }), [theme, setTheme, toggle, resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

export { readString as _readThemeString };
