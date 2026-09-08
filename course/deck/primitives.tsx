"use client";

import type { ReactNode } from "react";
import { useDeckOptional } from "./DeckContext";

/** Slide building blocks. They carry the type scale of the design system; slides only supply content. */

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="s-eyebrow">{children}</span>;
}

export function Title({ children }: { children: ReactNode }) {
  return <h1 className="s-title">{children}</h1>;
}

export function Sub({ children }: { children: ReactNode }) {
  return <p className="s-sub">{children}</p>;
}

/** The assertion of a content slide: one sentence, the claim the evidence below supports. */
export function Claim({ children }: { children: ReactNode }) {
  return <h2 className="s-claim">{children}</h2>;
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="s-bullets">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** The one elevated card of a slide. */
export function Callout({ children, code }: { children?: ReactNode; code?: string }) {
  return (
    <div className="s-callout">
      {code && <code className="s-callout-code">{code}</code>}
      {children && <span className="s-callout-text">{children}</span>}
    </div>
  );
}

export function Code({ children, highlight }: { children: string; highlight?: number[] }) {
  const lines = children.replace(/\n$/, "").split("\n");
  return (
    <pre className="s-code">
      {lines.map((line, i) => (
        <span key={i} className={highlight && !highlight.includes(i + 1) ? "s-code-dim" : "s-code-line"}>
          {line}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

export function Columns({ children, ratio = "1fr 1fr" }: { children: ReactNode; ratio?: string }) {
  return (
    <div className="s-columns" style={{ gridTemplateColumns: ratio }}>
      {children}
    </div>
  );
}

/** A live widget inside a slide: it fills the remaining space and keeps its own keyboard handling. */
export function Widget({ children, title, zoom = 2 }: { children: ReactNode; title?: ReactNode; zoom?: number }) {
  return (
    <div className="s-widget" data-hotkeys="local">
      {title && <div className="s-widget-title">{title}</div>}
      <div className="s-widget-body" style={{ zoom }}>
        {children}
      </div>
    </div>
  );
}

export function Source({ children }: { children: ReactNode }) {
  return <p className="s-source">{children}</p>;
}

/** Course name and slide counter; reads the deck when rendered inside one. */
export function Foot({ left }: { left?: ReactNode }) {
  const deck = useDeckOptional();
  return (
    <div className="s-foot">
      <span>{left ?? (deck ? `M${deck.moduleOrder} · ${deck.moduleTitle}` : "")}</span>
      <span>{deck ? `${deck.index + 1} / ${deck.count}` : ""}</span>
    </div>
  );
}

/** A complete title slide. */
export function TitleSlide({ eyebrow, title, sub }: { eyebrow: ReactNode; title: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Title>{title}</Title>
      {sub && <Sub>{sub}</Sub>}
      <Foot />
    </>
  );
}
