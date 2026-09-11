"use client";

import { useRef, useState } from "react";
import { IconExpand } from "@/components/icons";
import { SchemaEditorDialog } from "./SchemaEditorDialog";
import { derivedText, PresetChips, SourceChips, SourceEditor, type EditorProps } from "./schemaParts";

/** The compact editor in the setup column; "Expand" opens the wide one next to the derived schema. */
export function SchemaSection({ state, update, pydantic, disabled = false }: EditorProps) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [showDerived, setShowDerived] = useState(false);
  const derived = state.sourceKind === "pydantic" ? derivedText(pydantic) : "";

  return (
    <>
      <PresetChips state={state} update={update} disabled={disabled} />
      <SourceChips state={state} update={update} disabled={disabled} />
      <SourceEditor
        state={state}
        update={update}
        pydantic={pydantic}
        disabled={disabled}
        minHeight={200}
        extra={
          <button className="btn py-0.5 px-2 text-xs" type="button" onClick={() => dialog.current?.showModal()} title="Edit in a wider window, next to the derived schema">
            <IconExpand size={13} /> Expand
          </button>
        }
      />
      {derived && (
        <div className="flex flex-col gap-1">
          <button className="flex items-center gap-2 self-start text-xs text-ink-2" type="button" onClick={() => setShowDerived((v) => !v)} aria-expanded={showDerived}>
            <span aria-hidden="true">{showDerived ? "▾" : "▸"}</span>
            <span className="eyebrow">Derived schema</span>
            <span className="chip">{derived.length.toLocaleString("en-US")} chars</span>
          </button>
          {showDerived && <pre className="panel mono max-h-64 overflow-auto p-2 text-[11.5px] leading-snug">{derived}</pre>}
        </div>
      )}
      <SchemaEditorDialog dialogRef={dialog} state={state} update={update} pydantic={pydantic} disabled={disabled} />
    </>
  );
}
