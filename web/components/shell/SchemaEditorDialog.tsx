"use client";

import type { RefObject } from "react";
import { IconClose } from "@/components/icons";
import { parseSchema } from "@/lib/labState";
import { derivedText, PresetChips, SourceChips, SourceEditor, type EditorProps } from "./schemaParts";

const PANE_HEIGHT = 440;

/** The wide editor: source on the left, what the server derives from it on the right, live. */
export function SchemaEditorDialog({ dialogRef, state, update, pydantic, disabled = false }: EditorProps & { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const close = () => dialogRef.current?.close();
  const isPydantic = state.sourceKind === "pydantic";
  const right = isPydantic ? derivedText(pydantic) : (() => {
    const parsed = parseSchema(state.schemaText);
    return parsed.schema ? JSON.stringify(parsed.schema, null, 2) : "";
  })();

  return (
    <dialog
      ref={dialogRef}
      className="dialog dialog-wide"
      aria-label="Schema editor"
      onClick={(e) => {
        if (e.target === dialogRef.current) close();
      }}
    >
      <div className="dialog-body">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="eyebrow">Schema</span>
          <PresetChips state={state} update={update} disabled={disabled} />
          <span className="text-muted" aria-hidden="true">
            ·
          </span>
          <SourceChips state={state} update={update} disabled={disabled} />
          <button className="btn btn-icon ml-auto" type="button" onClick={close} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          <SourceEditor state={state} update={update} pydantic={pydantic} disabled={disabled} minHeight={PANE_HEIGHT} />
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow">{isPydantic ? "Derived JSON Schema" : "Parsed"}</span>
            <pre className="panel mono overflow-auto p-3 text-[12px] leading-snug" style={{ minHeight: PANE_HEIGHT, maxHeight: "60vh" }}>
              {right || (isPydantic && pydantic.pending ? "converting…" : "")}
            </pre>
          </div>
        </div>
      </div>
    </dialog>
  );
}
