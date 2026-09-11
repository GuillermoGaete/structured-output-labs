"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  hint?: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface Props {
  /** The button's content. */
  label: ReactNode;
  items: MenuItem[];
  className?: string;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

interface Pos {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

const ITEM_H = 34;
const PAD = 12;
const MIN_W = 190;
const GAP = 6;
const EDGE = 8;

/**
 * A button that opens a short list of actions. The list is drawn on the body
 * with a fixed position taken from the button, so a scrolling column or the
 * tab strip never clips it; it opens upward or sideways when the edge is near.
 */
export function Menu({ label, items, className = "btn py-0.5 px-2 text-xs", title, ariaLabel, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>({});
  const button = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const h = items.length * ITEM_H + PAD;
    const up = r.bottom + GAP + h > window.innerHeight && r.top - GAP - h > 0;
    const alignLeft = r.right - MIN_W < EDGE;
    setPos({
      ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
      ...(alignLeft ? { left: Math.max(EDGE, r.left) } : { right: Math.max(EDGE, window.innerWidth - r.right) }),
    });
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !panel.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // A fixed panel would drift from its button otherwise.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`${className} ${open ? "border-accent" : ""}`}
        onClick={() => {
          if (!open) place();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
      >
        {label}
      </button>
      {open &&
        createPortal(
          <div ref={panel} className="popover popover-fixed menu" role="menu" style={pos}>
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className="menu-item"
                title={it.hint}
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
