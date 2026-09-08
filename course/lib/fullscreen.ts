"use client";

import { useCallback, useEffect, useState } from "react";

export function useFullscreen() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    onChange();
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const enter = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* the browser refused (must be a user gesture in this window) */
    }
  }, []);
  const exit = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = useCallback(() => (document.fullscreenElement ? exit() : enter()), [enter, exit]);

  return { active, enter, exit, toggle };
}
