"use client";

import { useState } from "react";
import { DEFAULT_SCHEMA_HINT, renderHint, SCHEMA_PLACEHOLDER } from "@/lib/engines";

interface Props {
  /** The wording, with `{schema}` where the schema goes. */
  template: string;
  schema: Record<string, unknown> | null;
  /** Editable when given; without it the block reads out what a run used. */
  onChange?: (template: string) => void;
  disabled?: boolean;
  eyebrow?: string;
  /** Read-only variant: a way to bring this wording into the setup. */
  action?: { label: string; hint?: string; onSelect: () => void };
}

/**
 * The "Prompt only" mode has no mask, so this text is the only thing asking for
 * the shape. It goes after the prompt, and what is shown here is the real text:
 * the schema already in place, without titles and descriptions. "Edit wording"
 * opens the template with the `{schema}` placeholder.
 */
export function PromptHint({ template, schema, onChange, disabled = false, eyebrow = "Prompt only · appended after the prompt", action }: Props) {
  const [editing, setEditing] = useState(false);
  const isDefault = template === DEFAULT_SCHEMA_HINT;
  const rendered = schema ? renderHint(template, schema) : template;
  const hasSlot = template.includes(SCHEMA_PLACEHOLDER);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="eyebrow" title="No mask in this mode: this text, appended after the prompt, is the only thing asking for the shape">
          {eyebrow}
        </span>
        <span className="flex items-baseline gap-3">
          {onChange && !isDefault && (
            <button type="button" className="text-xs text-accent" onClick={() => onChange(DEFAULT_SCHEMA_HINT)} disabled={disabled} title="Back to the lab's wording">
              Reset
            </button>
          )}
          {onChange && (
            <button type="button" className="text-xs text-accent" onClick={() => setEditing((e) => !e)} disabled={disabled} title="Change the wording; {schema} marks where the schema goes">
              {editing ? "Done" : "Edit wording"}
            </button>
          )}
          {action && (
            <button type="button" className="text-xs text-accent" onClick={action.onSelect} disabled={disabled} title={action.hint}>
              {action.label}
            </button>
          )}
        </span>
      </div>
      {editing && onChange ? (
        <>
          <textarea
            className="input mono text-[12px] min-h-[104px]"
            value={template}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            spellCheck={false}
            aria-label="Prompt only hint"
          />
          <span className="text-xs text-muted">
            {hasSlot ? (
              <>
                <code className="mono">{SCHEMA_PLACEHOLDER}</code> becomes the derived schema, without titles and descriptions
              </>
            ) : (
              <>
                No <code className="mono">{SCHEMA_PLACEHOLDER}</code> in the text, so the schema is appended at the end
              </>
            )}
          </span>
        </>
      ) : (
        <>
          <pre className="input mono text-[12px] leading-snug whitespace-pre-wrap break-words max-h-56 overflow-auto" aria-label="Prompt only hint, as sent">
            {rendered}
          </pre>
          <span className="text-xs text-muted">
            {schema ? `${rendered.length.toLocaleString("en-US")} chars · the schema goes in without titles and descriptions` : "Waiting for the schema"}
          </span>
        </>
      )}
    </div>
  );
}
