"use client";

import type { ReactNode } from "react";
import { IconChevron } from "@/components/icons";
import { useSectionOpen } from "@/lib/uiState";

interface Props {
  id: string;
  title: string;
  /** What the section currently says, shown on its one line when folded. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  /** Controls that stay visible whether folded or not. */
  actions?: ReactNode;
  children: ReactNode;
}

/** A block that folds to one line: its title and its current value. The open state is remembered per id. */
export function Section({ id, title, summary, defaultOpen = true, actions, children }: Props) {
  const [open, toggle] = useSectionOpen(id, defaultOpen);
  const bodyId = `section-${id}`;
  return (
    <section className="section">
      <div className="section-head">
        <button type="button" className="section-toggle" onClick={toggle} aria-expanded={open} aria-controls={bodyId}>
          <IconChevron open={open} size={14} className="shrink-0 text-muted" />
          <span className="eyebrow shrink-0">{title}</span>
          {!open && summary !== undefined && <span className="section-summary">{summary}</span>}
        </button>
        {actions && <span className="section-actions">{actions}</span>}
      </div>
      {open && (
        <div id={bodyId} className="section-body">
          {children}
        </div>
      )}
    </section>
  );
}
