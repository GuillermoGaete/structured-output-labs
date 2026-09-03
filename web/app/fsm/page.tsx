"use client";

import { useCallback, useMemo, useState } from "react";
import { useBackend } from "@/components/BackendProvider";
import { BackendSettings } from "@/components/BackendSettings";
import { FsmGraph } from "@/components/FsmGraph";
import { RegexView } from "@/components/RegexView";
import { SchemaEditor } from "@/components/SchemaEditor";
import { compileSchema } from "@/lib/api";
import { parseSchema, useLabState } from "@/lib/labState";
import type { CompilePayload } from "@/lib/types";

export default function FsmPage() {
  const backend = useBackend();
  const [state, update] = useLabState();
  const [compiled, setCompiled] = useState<CompilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState<"char" | "token">("char");
  const parsed = useMemo(() => parseSchema(state.schemaText), [state.schemaText]);

  const run = useCallback(async () => {
    if (!parsed.schema || !backend.ready) return;
    setBusy(true);
    setError(null);
    try {
      setCompiled(await compileSchema(backend.url, parsed.schema, state.mode));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [parsed.schema, backend.ready, backend.url, state.mode]);

  const automaton = compiled ? (level === "char" ? compiled.char_fsm : compiled.token_dfa) : null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2 max-w-3xl">
        <span className="eyebrow">Lab 1</span>
        <h1 className="text-3xl font-semibold tracking-tight">Schema → Regex → Automaton</h1>
        <p className="text-ink-2">
          outlines turns a JSON Schema into a regular expression, then into a deterministic automaton whose edges are
          vocabulary tokens. At generation time the model is only ever offered the edges leaving the current state.
        </p>
      </header>

      {!backend.ready && <BackendSettings />}

      <div className="grid lg:grid-cols-[380px_1fr] gap-8 items-start">
        <div className="flex flex-col gap-4">
          <SchemaEditor state={state} update={update} showPrompt={false} />
          <button className="btn btn-primary self-start" type="button" onClick={run} disabled={!backend.ready || !parsed.schema || busy}>
            {busy ? "Compiling…" : "Compile schema"}
          </button>
          {error && <p className="text-sm text-critical">{error}</p>}
        </div>

        <div className="flex flex-col gap-6 min-w-0">
          {compiled ? (
            <>
              <RegexView compiled={compiled} />
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="eyebrow">Automaton</span>
                  <button className={`btn ${level === "char" ? "border-accent" : ""}`} type="button" onClick={() => setLevel("char")}>
                    Character level
                  </button>
                  <button className={`btn ${level === "token" ? "border-accent" : ""}`} type="button" onClick={() => setLevel("token")} disabled={!compiled.token_dfa}>
                    Token level
                  </button>
                  <span className="text-xs text-muted">
                    {level === "char"
                      ? "interegular.parse_pattern(regex).to_fsm() — one character per edge"
                      : "outlines_core.Index(regex, vocabulary) — one vocabulary token per edge; this is what generation walks"}
                  </span>
                </div>
                {automaton ? (
                  <FsmGraph automaton={automaton} />
                ) : (
                  <p className="text-sm text-critical">{compiled.token_dfa_error ?? "No automaton available for this schema."}</p>
                )}
                {automaton?.truncated && (
                  <p className="text-xs text-warning">
                    Showing the first {automaton.nodes.length} of {automaton.total_states.toLocaleString("en-US")} states (breadth-first from the
                    initial state). Tighten the schema, for example with maxLength, to see all of it.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="panel p-8 text-sm text-ink-2">
              Pick a preset or paste a schema on the left, then compile. The Person preset gives a graph small enough to read
              every edge; the Tree preset shows what a recursive schema does to a regex.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
