"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/** Slide index kept in the URL (1-based) through the native history API; back/forward move the deck. */
export function useDeckNavigation(count: number, initialIndex: number, hrefFor: (index: number) => string) {
  const clamp = useCallback((i: number) => Math.min(Math.max(i, 0), Math.max(count - 1, 0)), [count]);
  const [index, setIndex] = useState(() => clamp(initialIndex));
  const pathname = usePathname();
  const lastPushed = useRef<string | null>(null);

  // A popstate (or any external navigation) changed the path: adopt the slide it names.
  useEffect(() => {
    const m = pathname.match(/\/slides(?:\/([^/]+))?\/?$/);
    if (!m) return;
    const pos = m[1] ?? "1";
    if (lastPushed.current === pathname) return;
    lastPushed.current = pathname;
    if (/^\d+$/.test(pos)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIndex(clamp(Number(pos) - 1));
    }
  }, [pathname, clamp]);

  const goTo = useCallback(
    (i: number) => {
      const target = clamp(i);
      setIndex(target);
      const href = hrefFor(target);
      const path = href.split("?")[0];
      lastPushed.current = path;
      if (window.location.pathname !== path) window.history.pushState(null, "", href);
    },
    [clamp, hrefFor],
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);
  return { index, goTo, next, prev };
}
