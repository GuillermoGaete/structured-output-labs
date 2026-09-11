"use client";

import { useEffect, useRef, useState } from "react";
import { IconSliders } from "@/components/icons";
import { DIGIT_CHOICES, MAX_ROWS, type ViewState } from "@/lib/viewState";

export type ViewField = "digits" | "bars" | "rows";

interface Props {
  view: ViewState;
  onChange: (patch: Partial<ViewState>) => void;
  fields?: ViewField[];
}

/** Decimals, bar scale and rows, behind one button next to the numbers they change. */
export function ViewSettings({ view, onChange, fields = ["digits", "bars", "rows"] }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative talk-hide" ref={box}>
      <button
        type="button"
        className={`btn btn-icon ${open ? "border-accent" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="View settings"
        title="Decimals · bar scale · rows"
      >
        <IconSliders />
      </button>
      {open && (
        <div className="popover" role="group" aria-label="View settings">
          {fields.includes("digits") && (
            <label className="popover-row">
              <span>Decimals</span>
              <select className="input input-fit py-0.5 px-1.5 text-xs" value={view.digits} onChange={(e) => onChange({ digits: Number(e.target.value) })}>
                {DIGIT_CHOICES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}
          {fields.includes("bars") && (
            <div className="popover-row">
              <span>Bars</span>
              <button type="button" className="btn py-0.5 px-2 text-xs" onClick={() => onChange({ logBars: !view.logBars })} title="Log scale keeps tiny probabilities visible">
                {view.logBars ? "log" : "linear"}
              </button>
            </div>
          )}
          {fields.includes("rows") && (
            <label className="popover-row">
              <span>Rows</span>
              <input
                type="number"
                min={1}
                max={MAX_ROWS}
                className="input input-num py-0.5 px-1.5 text-xs tabular-nums"
                value={view.rows}
                onChange={(e) => onChange({ rows: Math.min(Math.max(Number(e.target.value) || 1, 1), MAX_ROWS) })}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
