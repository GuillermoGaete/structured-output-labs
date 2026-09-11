import { describe, expect, it } from "vitest";
import { parsePartial, schemaPathOf, summarize } from "./partialJson";

const TREE = {
  $defs: {
    TreeNode: {
      properties: {
        value: { title: "Value", type: "integer" },
        children: { items: { $ref: "#/$defs/TreeNode" }, title: "Children", type: "array" },
      },
      required: ["value", "children"],
      title: "TreeNode",
      type: "object",
    },
  },
  $ref: "#/$defs/TreeNode",
};

describe("parsePartial", () => {
  it("reads a finished document with nothing open", () => {
    const p = parsePartial('{"name": "Ada", "age": 36}');
    expect(p.root?.kind).toBe("object");
    expect(p.root?.open).toBe(false);
    expect(p.root?.children.map((c) => c.key)).toEqual(["name", "age"]);
    expect(p.stack).toEqual([]);
    expect(p.cursor).toBeNull();
  });

  it("keeps the open containers as the stack, root first", () => {
    const p = parsePartial('{"value":1,"children":[{"value":2,"children":[{"value":4,"children":[]}]},{"value":3,"children":[');
    expect(p.stack.map((n) => n.kind)).toEqual(["object", "array", "object", "array"]);
    expect(p.cursor).toBe(p.stack[3]);
    // the first child closed, so it is not on the stack
    const children = p.root!.children[1];
    expect(children.children[0].open).toBe(false);
    expect(children.children[1].open).toBe(true);
  });

  it("marks a half-written string and a pending key", () => {
    const s = parsePartial('{"name": "Ada Lov');
    expect(s.cursor?.kind).toBe("string");
    expect(s.cursor?.text).toBe("Ada Lov");
    expect(s.stack.length).toBe(1);

    const k = parsePartial('{"name": "Ada", "ag');
    expect(k.root?.pendingKey).toBe("ag");
    expect(k.root?.children.length).toBe(1);

    const colon = parsePartial('{"name": "Ada", "age":');
    expect(colon.root?.pendingKey).toBe("age");
  });

  it("treats a number at the end as still growing", () => {
    const p = parsePartial('{"age": 3');
    expect(p.cursor?.kind).toBe("number");
    expect(p.cursor?.open).toBe(true);
    const done = parsePartial('{"age": 36,');
    expect(done.root?.children[0].open).toBe(false);
  });

  it("never throws on garbage", () => {
    expect(() => parsePartial("")).not.toThrow();
    expect(parsePartial("").root).toBeNull();
    expect(() => parsePartial("}}}]]")).not.toThrow();
  });
});

describe("schemaPathOf", () => {
  it("follows keys and array indices through $ref", () => {
    const p = parsePartial('{"value":1,"children":[{"value":2,"children":[]},{"value":3,"children":[');
    const path = schemaPathOf(p, TREE);
    expect(path.labels).toEqual(["TreeNode", "children[1]", "children"]);
    expect(path.rule).toBe("TreeNode");
  });

  it("names a pending key and a scalar under it", () => {
    const person = { title: "Person", type: "object", properties: { name: { type: "string" }, age: { type: "integer" } } };
    expect(schemaPathOf(parsePartial('{"name": "Ad'), person).labels).toEqual(["Person", "name"]);
    expect(schemaPathOf(parsePartial('{"name": "Ada", "ag'), person).labels).toEqual(["Person", "ag…"]);
  });
});

describe("summarize", () => {
  it("renders a closed subtree on one line and truncates", () => {
    const p = parsePartial('{"value":2,"children":[{"value":4,"children":[]}]}');
    expect(summarize(p.root!)).toBe("{value: 2, children: [{value: 4, children: []}]}");
    expect(summarize(p.root!, 12)).toBe("{value: 2, …");
  });
});
