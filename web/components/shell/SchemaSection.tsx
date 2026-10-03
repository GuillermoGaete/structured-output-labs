"use client";

import { parseSchema } from "@/lib/labState";
import { derivedText, SourceChips, SourceEditor, type EditorProps } from "./schemaParts";

const PANE_HEIGHT = 300;

/** The schema at full width: the source on the left, what the server derives from it on the right, live. */
export function SchemaSection({ state, update, pydantic, disabled = false }: EditorProps) {
  const isPydantic = state.sourceKind === "pydantic";
  const right = isPydantic
    ? derivedText(pydantic)
    : (() => {
        const parsed = parseSchema(state.schemaText);
        return parsed.schema ? JSON.stringify(parsed.schema, null, 2) : "";
      })();

  return (
    <div className="flex flex-col gap-2.5">
      <SourceChips state={state} update={update} disabled={disabled} />
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <SourceEditor state={state} update={update} pydantic={pydantic} disabled={disabled} minHeight={PANE_HEIGHT} />
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="eyebrow">{isPydantic ? "Derived JSON Schema" : "Parsed"}</span>
          <pre className="panel mono overflow-auto p-3 text-[12px] leading-snug m-0" style={{ minHeight: PANE_HEIGHT, maxHeight: 420 }}>
            {right || (isPydantic && pydantic.pending ? "converting…" : "")}
          </pre>
        </div>
      </div>
    </div>
  );
}
