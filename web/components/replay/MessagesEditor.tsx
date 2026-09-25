"use client";

import { useState } from "react";
import { cutPoints } from "@/lib/langchainTrace";
import type { DraftMessage, EditAction } from "@/lib/replayState";
import { formatInt } from "@/lib/tokens";
import type { ChatRole } from "@/lib/types";

const ROLES: ChatRole[] = ["system", "user", "assistant"];
/** Longer messages fold to a preview until opened. */
const FOLD_CHARS = 600;

interface Props {
  messages: DraftMessage[];
  cutAt: number;
  onEdit: (action: EditAction) => void;
  disabled?: boolean;
  /** Characters sent and the backend's limit, for the meter. */
  sentChars: number;
  maxChars: number;
  sentCount: number;
  edited: boolean;
  /** Back to the trace's messages; absent when there is nothing to go back to. */
  onReset?: () => void;
}

/**
 * The conversation of one LLM call, editable. The cut is a line between two
 * messages: everything above it is sent, and the model writes the message
 * below it, which is what the trace recorded there.
 */
export function MessagesEditor({ messages, cutAt, onEdit, disabled = false, sentChars, maxChars, sentCount, edited, onReset }: Props) {
  const points = new Set(cutPoints(messages));

  const cutLine = (at: number) => {
    if (at === cutAt) {
      const next = messages[at];
      return (
        <div key={`cut-${at}`} className="flex items-center gap-2 text-[11px] text-accent font-mono" role="separator" aria-label="Cut">
          <span className="h-px flex-1 bg-accent" />
          <span>✂ the model writes here{next?.role === "assistant" ? " · compared with the reply below" : ""}</span>
          <span className="h-px flex-1 bg-accent" />
        </div>
      );
    }
    if (!points.has(at)) return null;
    return (
      <button
        key={`cut-${at}`}
        type="button"
        className="self-center text-[11px] text-muted hover:text-accent font-mono px-2"
        onClick={() => onEdit({ type: "cut", at })}
        disabled={disabled}
        title="Send the messages above this line; the model writes the next assistant message"
      >
        ✂ replay from here
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {messages.length === 0 && <p className="text-xs text-muted">No messages yet: import a trace, or add one.</p>}
      {messages.map((m, i) => (
        <div key={m.id} className="flex flex-col gap-2">
          {cutLine(i)}
          <MessageCard message={m} index={i} sent={i < cutAt} onEdit={onEdit} disabled={disabled} />
        </div>
      ))}
      {messages.length > 0 && cutLine(messages.length)}
      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn py-0.5 px-2 text-xs" type="button" onClick={() => onEdit({ type: "insert", index: cutAt, role: "user" })} disabled={disabled} title="A new user message just before the cut">
          + message at the cut
        </button>
        {onReset && edited && (
          <button className="btn py-0.5 px-2 text-xs" type="button" onClick={onReset} disabled={disabled}>
            Reset to trace
          </button>
        )}
        {edited && <span className="chip chip-warning" title="The conversation sent differs from the trace's: a counterfactual">edited</span>}
      </div>
      <span className={`text-[11px] font-mono ${sentChars > maxChars ? "text-critical" : "text-muted"}`}>
        {sentCount} message{sentCount === 1 ? "" : "s"} sent · {formatInt(sentChars)} / {formatInt(maxChars)} chars
      </span>
    </div>
  );
}

function MessageCard({ message: m, index, sent, onEdit, disabled }: { message: DraftMessage; index: number; sent: boolean; onEdit: (a: EditAction) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const long = m.content.length > FOLD_CHARS;
  const changed = !!m.original && (m.original.role !== m.role || m.original.content !== m.content);
  const lines = m.content.split("\n").length;
  return (
    <div className={`rounded-md border border-line p-2 flex flex-col gap-1.5 ${sent ? "bg-surface" : "bg-surface-2 opacity-70"}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="mono text-[11px] text-muted">#{index + 1}</span>
        <select
          className="input input-fit py-0 px-1 text-xs"
          value={m.role}
          onChange={(e) => onEdit({ type: "set", index, role: e.target.value as ChatRole })}
          disabled={disabled}
          aria-label={`Role of message ${index + 1}`}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {m.origin === "output" && <span className="chip" title="What this call answered in the trace">recorded reply</span>}
        {m.origin === "tool" && <span className="chip" title="A tool result, sent as a user turn">tool result</span>}
        {!!m.toolCalls && (
          <span className="chip" title="Tool calls written into the text; the replay cannot call tools">
            {m.toolCalls} tool call{m.toolCalls === 1 ? "" : "s"}
          </span>
        )}
        {!!m.placeholders && <span className="chip" title="Images, files or audio: the replay reads text only">{m.placeholders} placeholder{m.placeholders === 1 ? "" : "s"}</span>}
        {!m.original && <span className="chip chip-warning">new</span>}
        {changed && <span className="chip chip-warning">edited</span>}
        {sent && !m.content.trim() && <span className="chip">empty · skipped</span>}
        <span className="ml-auto flex items-center gap-1">
          {changed && (
            <button type="button" className="text-[11px] text-accent px-1" onClick={() => onEdit({ type: "revert", index })} disabled={disabled} title="Back to the trace's text and role">
              revert
            </button>
          )}
          <button type="button" className="text-[11px] text-muted hover:text-ink px-1" onClick={() => onEdit({ type: "insert", index: index + 1, role: "user" })} disabled={disabled} title="Insert a message below">
            + below
          </button>
          <button type="button" className="text-[11px] text-muted hover:text-critical px-1" onClick={() => onEdit({ type: "delete", index })} disabled={disabled} title="Delete this message">
            delete
          </button>
        </span>
      </div>
      {long && !open ? (
        <button type="button" className="text-left mono text-[12px] leading-snug whitespace-pre-wrap break-words text-ink-2" onClick={() => setOpen(true)} title="Open to edit">
          {m.content.slice(0, 280)}… <span className="text-accent">edit all {formatInt(m.content.length)} chars</span>
        </button>
      ) : (
        <textarea
          className="input mono text-[12px] py-1"
          rows={Math.min(Math.max(lines, 2), open ? 18 : 8)}
          value={m.content}
          onChange={(e) => onEdit({ type: "set", index, content: e.target.value })}
          spellCheck={false}
          disabled={disabled}
          aria-label={`Message ${index + 1}`}
        />
      )}
    </div>
  );
}
