import type { Step } from "@/lib/types";

/** The open brackets in `text`, bottom to top, ignoring brackets inside strings. */
function openBrackets(text: string): string[] {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  return stack;
}

/**
 * What the grammar engine carries instead of a state id: a pushdown stack.
 * Every `{` or `[` pushes, every `}` or `]` pops, and a closing bracket is only
 * legal when it matches the top of the stack.
 */
export function StackView({ step }: { step: Step }) {
  const stack = openBrackets(step.partial_text);
  const top = stack[stack.length - 1];
  const closer = top === "{" ? "}" : top === "[" ? "]" : null;
  const rows = [...stack].reverse();
  return (
    <div className="grid md:grid-cols-[180px_1fr] gap-6 items-start">
      <figure className="flex flex-col gap-2">
        <figcaption className="eyebrow">Parser stack · depth {stack.length}</figcaption>
        <div className="flex flex-col gap-1 min-h-[96px]">
          {rows.length === 0 && <span className="text-xs text-muted">empty: at the top level</span>}
          {rows.map((b, i) => (
            <span
              key={i}
              className={`font-mono text-[15px] text-center rounded-md border px-3 py-1 ${i === 0 ? "bg-forced text-white border-forced" : "bg-surface border-line-2"}`}
              title={i === 0 ? "top of the stack" : undefined}
            >
              {b}
            </span>
          ))}
        </div>
      </figure>
      <div className="flex flex-col gap-2 text-sm text-ink-2 max-w-prose">
        <p>
          The CFG engine (llguidance) has no automaton state to report: it keeps a parser stack instead. The stack above is
          recomputed from the text so far, which is exactly the memory a regex does not have.
        </p>
        <p>
          {closer ? (
            <>
              Top of the stack is <code>{top}</code>, so the only closing bracket allowed next is <code>{closer}</code>; a{" "}
              <code>{closer === "}" ? "]" : "}"}</code> gets −∞ here no matter how much the model wants it.
            </>
          ) : (
            <>Nothing is open: after the top-level value closes, the only legal continuation is the end of the sequence.</>
          )}
        </p>
        <p className="text-xs text-muted">
          Depth over the whole run is the chart above. Note the grammar follows JSON Schema literally: unless the schema says{" "}
          <code>additionalProperties: false</code>, extra keys are legal, which the regex engine never allows.
        </p>
      </div>
    </div>
  );
}
