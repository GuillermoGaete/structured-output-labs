"use client";

import { useRef, useState } from "react";
import { IconClose } from "@/components/icons";
import { callLabel, FORMAT_LABEL, parseTraceText, TraceError, type ImportedTrace, type LlmCall } from "@/lib/langchainTrace";
import { formatInt } from "@/lib/tokens";

/** Exports of long agent runs get big; the parsed form kept afterwards is much smaller. */
export const MAX_TRACE_BYTES = 20_000_000;

interface Props {
  trace: ImportedTrace | null;
  /** False when the parsed trace is too large for sessionStorage: it is gone after a reload. */
  stored: boolean;
  onImport: (trace: ImportedTrace) => void;
  onClear: () => void;
  disabled?: boolean;
}

/** Upload, drop or paste a trace; what was detected in it. */
export function TraceSection({ trace, stored, onImport, onClear, disabled = false }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);

  const load = (text: string, name?: string): boolean => {
    try {
      onImport(parseTraceText(text, name));
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof TraceError ? e.message : `could not read it: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_TRACE_BYTES) {
      setError(`${formatInt(Math.round(file.size / 1e6))} MB · limit ${MAX_TRACE_BYTES / 1e6} MB: export the run you want, not the whole project`);
      return;
    }
    load(await file.text(), file.name);
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-md"
      style={dragging ? { outline: "2px dashed var(--accent)", outlineOffset: 4 } : undefined}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && !disabled) {
          e.preventDefault();
          void onFile(file);
        }
      }}
    >
      {trace ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium truncate" title={trace.name}>
            {trace.name}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="chip">{FORMAT_LABEL[trace.format]}</span>
            <span className="chip">
              {trace.calls.length} LLM call{trace.calls.length === 1 ? "" : "s"}
              {trace.nRuns ? ` · ${trace.nRuns} runs` : ""}
            </span>
            {!stored && (
              <span className="chip chip-warning" title="The parsed trace is too large for this tab's storage; the conversation you are editing is kept either way">
                not kept across reloads
              </span>
            )}
          </div>
          {trace.warnings.map((w) => (
            <span key={w} className="text-xs text-muted">
              {w}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-2 leading-snug">
          A LangSmith run exported as JSON (a single LLM call, or a chain or agent with its child runs), a JSON Lines export, or a list of LangChain messages. Drop it here.
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn py-0.5 px-2 text-xs" type="button" onClick={() => fileInput.current?.click()} disabled={disabled}>
          Upload .json
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.jsonl,.ndjson,application/json,text/plain"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
          aria-label="Trace file"
        />
        <button className="btn py-0.5 px-2 text-xs" type="button" onClick={() => dialog.current?.showModal()} disabled={disabled}>
          Paste JSON…
        </button>
        {trace && (
          <button className="btn py-0.5 px-2 text-xs" type="button" onClick={onClear} disabled={disabled} title="Forget the imported trace; the conversation stays in the editor">
            Clear
          </button>
        )}
      </div>
      {error && <p className="mono text-[12px] text-critical whitespace-pre-wrap break-words">{error}</p>}

      <dialog
        ref={dialog}
        className="dialog"
        aria-label="Paste a trace"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="dialog-body">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow">Paste a trace</span>
            <button className="btn btn-icon" type="button" onClick={() => dialog.current?.close()} aria-label="Close">
              <IconClose />
            </button>
          </div>
          <textarea
            className="input mono text-[12px] min-h-[240px]"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            spellCheck={false}
            placeholder='{"run_type": "llm", "inputs": {"messages": [...]}, ...}  or  [{"role": "user", "content": "..."}]'
            aria-label="Trace JSON"
          />
          {error && <p className="mono text-[12px] text-critical whitespace-pre-wrap break-words">{error}</p>}
          <div className="flex justify-end">
            <button
              className="btn btn-primary"
              type="button"
              disabled={!pasted.trim()}
              onClick={() => {
                if (load(pasted, "pasted")) {
                  setPasted("");
                  dialog.current?.close();
                }
              }}
            >
              Import
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

/** One LLM call of a multi-step trace (a chain, an agent loop), with where it sits in the tree. */
export function CallPicker({ calls, value, onChange, disabled = false }: { calls: LlmCall[]; value: string | null; onChange: (id: string) => void; disabled?: boolean }) {
  const current = calls.find((c) => c.id === value) ?? null;
  return (
    <div className="flex flex-col gap-1.5">
      <select className="input text-xs" value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label="LLM call">
        {!current && <option value="">—</option>}
        {calls.map((c) => (
          <option key={c.id} value={c.id}>
            {callLabel(c)} · {c.messages.filter((m) => m.origin !== "output").length} msgs{c.error ? " · failed" : ""}
          </option>
        ))}
      </select>
      {current && (
        <>
          {current.path.length > 0 && <span className="mono text-[11px] text-muted truncate" title={current.path.join(" › ")}>{current.path.join(" › ")}</span>}
          <div className="flex items-center gap-1.5 flex-wrap">
            {current.schema && <span className="chip chip-good" title="The call asked for this shape; Constrained enforces it with a mask">schema · {current.schema.source}</span>}
            {current.error && (
              <span className="chip chip-critical" title={current.error}>
                failed in the trace
              </span>
            )}
            {current.completion && <span className="chip">completion prompt</span>}
          </div>
          {current.warnings.map((w) => (
            <span key={w} className="text-xs text-muted">
              {w}
            </span>
          ))}
        </>
      )}
    </div>
  );
}
