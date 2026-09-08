"use client";

import { pastelFor, visibleToken } from "@/lib/tokens";
import type { ModuleUi } from "@/modules/types";

/**
 * Figure 01's feedback path: from under the sampled chip, left along the band,
 * up into the end of the token row. During "travel" the chip rides the path.
 */
export function LoopArrow({ traveling, chipText, position, ui, travelMs }: { traveling: boolean; chipText: string | null; position: number; ui: ModuleUi; travelMs: number }) {
  const path = "M 1160 8 L 1160 24 L 40 24 L 40 8";
  return (
    <div className="relative h-9 w-full">
      <svg viewBox="0 0 1200 36" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id="loop-arrow-head" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--series-chosen)" />
          </marker>
        </defs>
        <path d={path} fill="none" stroke="var(--series-chosen)" strokeWidth="2" strokeDasharray="6 6" markerEnd="url(#loop-arrow-head)" opacity={0.8} />
        {traveling && chipText !== null && (
          <g>
            <rect width="72" height="22" rx="5" fill={pastelFor(position)} stroke="var(--series-chosen)" strokeWidth="2">
              <animateMotion dur={`${Math.max(travelMs, 50)}ms`} fill="freeze" path="M 1124 -3 L 1124 13 L 4 13 L 4 -3" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1" />
            </rect>
            <text x="36" y="15" textAnchor="middle" fontSize="12" fontFamily="var(--font-mono)" fill="#000">
              {visibleToken(chipText).slice(0, 8)}
              <animateMotion dur={`${Math.max(travelMs, 50)}ms`} fill="freeze" path="M 1124 -3 L 1124 13 L 4 13 L 4 -3" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1" />
            </text>
          </g>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-[26px] text-center text-[11px] text-ink-2">{ui.loopCaption}</div>
    </div>
  );
}
