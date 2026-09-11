/**
 * A tolerant reading of JSON that is still being written.
 *
 * The grammar engine carries a stack, not an automaton state; this parser
 * rebuilds that stack from the text so far. It never throws: whatever is
 * unfinished at the end of the input is marked `open`, and the chain of open
 * containers from the root down is the stack the parser holds at that point.
 */

export type NodeKind = "object" | "array" | "string" | "number" | "literal";

export interface PNode {
  kind: NodeKind;
  /** Set when the node is a member of an object. */
  key?: string;
  /** Scalars: the text as written so far. */
  text?: string;
  children: PNode[];
  /** Still being written: no closing bracket or quote yet. */
  open: boolean;
  /** Objects: a key written (or half written) whose value has not started. */
  pendingKey?: string;
}

export interface PartialParse {
  root: PNode | null;
  /** The open containers, root first: the parser's stack. */
  stack: PNode[];
  /** The deepest open node of any kind, where the next token lands. */
  cursor: PNode | null;
}

const WS = /\s/;

export function parsePartial(text: string): PartialParse {
  let i = 0;
  const n = text.length;

  const skipWs = () => {
    while (i < n && WS.test(text[i])) i++;
  };

  /** A string starting at the opening quote. Returns the node, open if the input ended first. */
  const parseString = (): PNode => {
    let out = "";
    i++; // opening quote
    while (i < n) {
      const ch = text[i];
      if (ch === "\\") {
        if (i + 1 >= n) {
          i = n;
          return { kind: "string", text: out, children: [], open: true };
        }
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') {
        i++;
        return { kind: "string", text: out, children: [], open: false };
      }
      out += ch;
      i++;
    }
    return { kind: "string", text: out, children: [], open: true };
  };

  const parseNumber = (): PNode => {
    const start = i;
    while (i < n && /[-+0-9.eE]/.test(text[i])) i++;
    // A number can always grow until something else follows it.
    return { kind: "number", text: text.slice(start, i), children: [], open: i >= n };
  };

  const parseLiteral = (): PNode => {
    const start = i;
    while (i < n && /[a-z]/.test(text[i])) i++;
    const word = text.slice(start, i);
    const complete = word === "true" || word === "false" || word === "null";
    return { kind: "literal", text: word, children: [], open: !complete && i >= n };
  };

  const parseValue = (): PNode | null => {
    skipWs();
    if (i >= n) return null;
    const ch = text[i];
    if (ch === "{") return parseObject();
    if (ch === "[") return parseArray();
    if (ch === '"') return parseString();
    if (ch === "-" || (ch >= "0" && ch <= "9")) return parseNumber();
    if (/[a-z]/.test(ch)) return parseLiteral();
    i++; // something the grammar would never allow; step over it
    return parseValue();
  };

  const parseObject = (): PNode => {
    const node: PNode = { kind: "object", children: [], open: true };
    i++; // {
    for (;;) {
      skipWs();
      if (i >= n) return node;
      if (text[i] === "}") {
        i++;
        node.open = false;
        return node;
      }
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] !== '"') {
        i++;
        continue;
      }
      const key = parseString();
      if (key.open) {
        node.pendingKey = key.text;
        return node;
      }
      skipWs();
      if (i >= n || text[i] !== ":") {
        node.pendingKey = key.text;
        if (i < n) i++;
        else return node;
        continue;
      }
      i++; // :
      const value = parseValue();
      if (!value) {
        node.pendingKey = key.text;
        return node;
      }
      value.key = key.text;
      node.children.push(value);
      if (value.open) return node;
    }
  };

  const parseArray = (): PNode => {
    const node: PNode = { kind: "array", children: [], open: true };
    i++; // [
    for (;;) {
      skipWs();
      if (i >= n) return node;
      if (text[i] === "]") {
        i++;
        node.open = false;
        return node;
      }
      if (text[i] === ",") {
        i++;
        continue;
      }
      const value = parseValue();
      if (!value) return node;
      node.children.push(value);
      if (value.open) return node;
    }
  };

  const root = parseValue();
  const stack: PNode[] = [];
  let cursor: PNode | null = null;
  let node = root;
  while (node && node.open) {
    cursor = node;
    if (node.kind === "object" || node.kind === "array") {
      stack.push(node);
      const last = node.children[node.children.length - 1];
      node = last && last.open ? last : null;
    } else {
      node = null;
    }
  }
  return { root, stack, cursor };
}

type Schema = Record<string, unknown>;

function resolve(sub: Schema | undefined, root: Schema): { schema: Schema; name: string | null } {
  if (!sub) return { schema: {}, name: null };
  const ref = sub.$ref;
  if (typeof ref === "string") {
    const name = ref.split("/").pop() ?? ref;
    const defs = (root.$defs ?? root.definitions ?? {}) as Record<string, Schema>;
    return { schema: defs[name] ?? {}, name };
  }
  return { schema: sub, name: null };
}

export interface SchemaPath {
  /** One label per level: `TreeNode`, `children[1]`, `children`. */
  labels: string[];
  /** The rule name of the innermost object: its title or $ref name. */
  rule: string | null;
}

/** Where in the schema the cursor sits, following the open containers down from the root. */
export function schemaPathOf(parse: PartialParse, schema: Schema | null): SchemaPath {
  if (!schema || !parse.root) return { labels: [], rule: null };
  let { schema: cur, name } = resolve(schema, schema);
  const labels: string[] = [String(cur.title ?? name ?? "root")];
  let rule: string | null = typeof cur.title === "string" ? cur.title : name;
  const chain = [...parse.stack];
  if (parse.cursor && parse.cursor !== chain[chain.length - 1]) chain.push(parse.cursor);
  for (let k = 1; k < chain.length; k++) {
    const parent = chain[k - 1];
    const node = chain[k];
    if (parent.kind === "object" && node.key !== undefined) {
      const props = (cur.properties ?? {}) as Record<string, Schema>;
      ({ schema: cur, name } = resolve(props[node.key], schema));
      labels.push(node.key);
    } else if (parent.kind === "array") {
      const index = parent.children.indexOf(node);
      ({ schema: cur, name } = resolve(cur.items as Schema | undefined, schema));
      labels[labels.length - 1] = `${labels[labels.length - 1]}[${index}]`;
    }
    if (node.kind === "object") rule = typeof cur.title === "string" ? cur.title : (name ?? rule);
  }
  const last = chain[chain.length - 1];
  if (last && last.kind === "object" && last.pendingKey !== undefined) labels.push(`${last.pendingKey}…`);
  return { labels, rule };
}

/** One line for a finished container, so closed subtrees take one row. */
export function summarize(node: PNode, limit = 56): string {
  const render = (n: PNode): string => {
    if (n.kind === "string") return `"${n.text ?? ""}"`;
    if (n.kind === "number" || n.kind === "literal") return n.text ?? "";
    if (n.kind === "array") return `[${n.children.map(render).join(", ")}]`;
    return `{${n.children.map((c) => `${c.key}: ${render(c)}`).join(", ")}}`;
  };
  const text = render(node);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
