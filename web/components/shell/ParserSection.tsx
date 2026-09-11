"use client";

import { useMemo } from "react";
import { AuthorStrip } from "@/components/parser/AuthorStrip";
import { GrammarView } from "@/components/parser/GrammarView";
import { ParseTree } from "@/components/parser/ParseTree";
import { StackDepth } from "@/components/StackDepth";
import { StackView } from "@/components/StackView";
import { parsePartial, schemaPathOf } from "@/lib/partialJson";
import type { CompilePayload, Step } from "@/lib/types";
import { Section } from "./Section";

interface Props {
  step: Step | undefined;
  steps: Step[];
  index: number;
  onIndex: (i: number) => void;
  compiled: CompilePayload | null;
  schema: Record<string, unknown> | null;
  /** "llguidance" or "xgrammar": both keep a stack, not an automaton state. */
  backend?: string;
}

/** The grammar engine's state: the JSON so far as a tree, the stack it implies, and what the grammar forces next. */
export function ParserSection({ step, steps, index, onIndex, compiled, schema, backend = "llguidance" }: Props) {
  const parse = useMemo(() => parsePartial(step?.partial_text ?? ""), [step]);
  const path = useMemo(() => schemaPathOf(parse, schema), [parse, schema]);
  const nests = steps.some((s) => s.stack_depth > 1);
  return (
    <Section
      id="parser"
      title="Parser"
      summary={`${backend} · depth ${step?.stack_depth ?? 0}${path.labels.length ? ` · ${path.labels.join(" › ")}` : ""}`}
      actions={
        <span className="chip" title={`${backend} carries a pushdown stack; it exposes no automaton state`}>
          {backend} · stack
        </span>
      }
    >
      <div className="panel p-4 flex flex-col gap-5">
        {step ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
            <div className="flex flex-col gap-2 min-w-0">
              <span className="eyebrow">Parse tree</span>
              <ParseTree parse={parse} />
            </div>
            <div className="flex flex-col gap-4 min-w-0">
              {path.labels.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="eyebrow">Schema path</span>
                  <span className="chip self-start" title="Where the cursor sits in the schema: the CFG counterpart of an automaton state">
                    {path.labels.join(" › ")}
                  </span>
                </div>
              )}
              <StackView step={step} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">waiting…</p>
        )}
        {steps.length > 0 && <AuthorStrip steps={steps} index={index} onIndex={onIndex} step={step} />}
        <GrammarView grammar={compiled?.grammar} rules={compiled?.grammar_rules} active={path.rule} source={compiled?.grammar_source ?? "schema"} />
        {nests && <StackDepth steps={steps} current={index} />}
      </div>
    </Section>
  );
}
