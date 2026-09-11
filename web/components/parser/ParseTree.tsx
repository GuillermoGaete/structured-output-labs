import type { PartialParse, PNode } from "@/lib/partialJson";
import { summarize } from "@/lib/partialJson";

const INDENT = 16;

/**
 * The JSON so far as a tree. Open containers are the parser's stack, drawn
 * as highlighted brackets; the deepest one carries the cursor. Closed
 * subtrees fold to one line, so the eye stays on what is still being written.
 */
export function ParseTree({ parse }: { parse: PartialParse }) {
  if (!parse.root) return <p className="text-xs text-muted">nothing yet</p>;
  const top = parse.stack[parse.stack.length - 1] ?? null;
  const rows: React.ReactNode[] = [];

  const bracket = (node: PNode, ch: string) => (
    <span
      className={`inline-block w-5 text-center rounded border font-mono text-[12px] leading-[18px] ${
        node.open ? `bg-accent-soft ${node === top ? "border-forced" : "border-accent"}` : "border-line-2"
      }`}
      title={node.open ? (node === top ? "top of the stack" : "open: on the stack") : "closed: popped"}
    >
      {ch}
    </span>
  );

  const label = (node: PNode) => (node.key !== undefined ? <span className="text-ink">{node.key}</span> : null);

  const walk = (node: PNode, depth: number) => {
    const pad = { paddingLeft: depth * INDENT };
    if (node.kind === "object" || node.kind === "array") {
      const open = node.kind === "object" ? "{" : "[";
      if (!node.open) {
        rows.push(
          <div key={rows.length} className="flex items-center gap-2 font-mono text-[12px] leading-[18px] text-ink-2" style={pad}>
            {bracket(node, open)}
            {label(node)}
            <span className="text-muted truncate">{summarize(node)}</span>
          </div>,
        );
        return;
      }
      rows.push(
        <div key={rows.length} className="flex items-center gap-2 font-mono text-[12px] leading-[18px]" style={pad}>
          {bracket(node, open)}
          {label(node)}
        </div>,
      );
      node.children.forEach((c) => walk(c, depth + 1));
      if (node === parse.cursor) {
        rows.push(
          <div key={rows.length} className="flex items-center gap-2 font-mono text-[12px] leading-[18px]" style={{ paddingLeft: (depth + 1) * INDENT }}>
            {node.pendingKey !== undefined && <span className="text-ink-2">&quot;{node.pendingKey}</span>}
            <span className="inline-block w-0.5 h-3.5 bg-forced" aria-label="cursor" />
          </div>,
        );
      }
      return;
    }
    const value = node.kind === "string" ? `"${node.text ?? ""}${node.open ? "" : '"'}` : (node.text ?? "");
    rows.push(
      <div key={rows.length} className="flex items-center gap-2 font-mono text-[12px] leading-[18px]" style={pad}>
        {label(node)}
        {node.key !== undefined && <span className="text-muted">:</span>}
        <span className={node.open ? "text-ink" : "text-ink-2"}>{value}</span>
        {node.open && <span className="inline-block w-0.5 h-3.5 bg-forced" aria-label="cursor" />}
      </div>,
    );
  };

  walk(parse.root, 0);
  return <div className="flex flex-col gap-0.5 overflow-x-auto">{rows}</div>;
}
