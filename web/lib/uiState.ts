"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "sol.ui.sections";

function readAll(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Whether a folding section is open, remembered per section id. */
export function useSectionOpen(id: string, defaultOpen = true): [boolean, () => void] {
  const [open, setOpen] = useState(defaultOpen);

  // The stored value is only readable in the browser, after mount.
  useEffect(() => {
    const all = readAll();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id in all) setOpen(all[id]);
  }, [id]);

  const toggle = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      try {
        window.localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [id]: next }));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [id]);

  return [open, toggle];
}
