"use client";

import { useEffect, useRef, useState } from "react";
import type { SlideDefinition } from "@/modules/types";

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** A fixed 1920×1080 stage scaled to fit its container, so slides and figures share one coordinate system. */
export function SlideFrame({ slide, className = "", fit = "contain" }: { slide: SlideDefinition; className?: string; fit?: "contain" | "width" }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(fit === "width" ? width / STAGE_W : Math.min(width / STAGE_W, height / STAGE_H));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const themed = slide.theme && slide.theme !== "inherit" ? { "data-theme": slide.theme } : {};
  return (
    <div ref={box} className={`relative h-full w-full overflow-hidden ${className}`} style={fit === "width" ? { height: STAGE_H * scale } : undefined}>
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center" }}
        {...themed}
      >
        <section className={`slide-stage slide-layout-${slide.layout ?? "top"} slide-kind-${slide.kind ?? "content"}`} role="region" aria-roledescription="slide">
          {slide.render()}
        </section>
      </div>
    </div>
  );
}
