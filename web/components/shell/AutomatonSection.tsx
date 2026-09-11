"use client";

import { FsmGraph } from "@/components/FsmGraph";
import { AuthorStrip } from "@/components/parser/AuthorStrip";
import { PathStrip } from "@/components/PathStrip";
import { formatInt } from "@/lib/tokens";
import type { CompilePayload, Step } from "@/lib/types";
import { Section } from "./Section";

const GRAPH_HEIGHT = 520;

interface Props {
  compiled: CompilePayload | null;
  steps: Step[];
  index: number;
  graphIdOf: (raw: number | null) => number | null;
  currentGraphState: number | null;
  visited: number[];
  onIndex: (i: number) => void;
  /** The current state, in the graph's numbering. */
  stateLabel: string;
  stateHint?: string;
}

/** The token automaton: the path taken so far, and the graph, folded until asked for. */
export function AutomatonSection({ compiled, steps, index, graphIdOf, currentGraphState, visited, onIndex, stateLabel, stateHint }: Props) {
  const automaton = compiled?.token_dfa ?? null;
  const size = automaton ? `${formatInt(automaton.nodes.length)} / ${formatInt(automaton.total_states)} states` : compiled ? "no graph" : "compiling…";
  return (
    <Section
      id="automaton"
      title="Automaton"
      defaultOpen={false}
      summary={`outlines_core · ${size}`}
      actions={
        <span className="chip" title={stateHint}>
          state {stateLabel}
        </span>
      }
    >
      {steps.length > 0 && <AuthorStrip steps={steps} index={index} onIndex={onIndex} />}
      {steps.length > 0 && <PathStrip steps={steps} index={index} graphIdOf={graphIdOf} onPick={onIndex} />}
      {automaton ? (
        <FsmGraph automaton={automaton} currentState={currentGraphState} visited={visited} height={GRAPH_HEIGHT} />
      ) : (
        <div className="panel flex items-center justify-center text-sm text-muted" style={{ height: 160 }}>
          {compiled?.token_dfa_error ?? "compiling…"}
        </div>
      )}
    </Section>
  );
}
