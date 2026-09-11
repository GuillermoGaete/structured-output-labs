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
    <div className="flex flex-col gap-2">
      <figure className="flex flex-col gap-2">
        <figcaption className="eyebrow">Stack · depth {stack.length}</figcaption>
        <div className="flex flex-col gap-1 w-40">
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
      {closer && <span className="chip">next closer: {closer}</span>}
    </div>
  );
}
