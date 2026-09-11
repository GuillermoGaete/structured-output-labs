"use client";

import { useState } from "react";

interface Props {
  grammar: string | null | undefined;
  rules?: number;
  /** The rule to highlight: the object the cursor is inside. */
  active?: string | null;
  /** "schema": a reading the lab derives; "engine": the text the engine itself compiled. */
  source?: "schema" | "engine";
}

/** The grammar, folded to a chip: the CFG counterpart of the regex. */
export function GrammarView({ grammar, rules, active, source = "schema" }: Props) {
  const [open, setOpen] = useState(false);
  if (!grammar) return null;
  const lines = grammar.split("\n");
  return (
    <div className="flex flex-col gap-1">
      <button className="flex items-center gap-2 self-start text-xs text-ink-2" type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        <span className="eyebrow">Grammar</span>
        <span
          className="chip"
          title={
            source === "engine"
              ? "The grammar XGrammar compiled from the schema, printed by the engine itself"
              : "A BNF reading of the schema, with the separators the CFG mode asks for. llguidance compiles the same shape but does not print it."
          }
        >
          {rules ?? lines.length} rules · {source === "engine" ? "from the engine" : "from the schema"}
        </span>
      </button>
      {open && (
        <pre className="panel mono max-h-64 overflow-auto p-2 text-[11.5px] leading-snug">
          {lines.map((line, i) => {
            const hit = !!active && (line.startsWith(`${active}:`) || line.includes(`${active} ::=`) || line.includes(`${active}_`) && line.includes("::="));
            return (
              <div key={i} className={hit ? "bg-accent-soft rounded px-1 -mx-1" : undefined} title={hit ? "the rule the cursor is inside" : undefined}>
                {line}
              </div>
            );
          })}
        </pre>
      )}
    </div>
  );
}
