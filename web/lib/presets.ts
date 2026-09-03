import type { Preset } from "./types";

// Fallback copies of backend/app/presets.py so the editors have content before
// the backend answers (or when it is asleep). The backend's /presets wins once
// it responds.
export const FALLBACK_PRESETS: Preset[] = [
  {
    id: "person",
    name: "Person (flat)",
    description: "Three scalar fields. Compiles to a plain regex and a small finite-state machine.",
    schema: {
      properties: {
        name: { maxLength: 24, title: "Name", type: "string" },
        age: { title: "Age", type: "integer" },
        city: { maxLength: 24, title: "City", type: "string" },
      },
      required: ["name", "age", "city"],
      title: "Person",
      type: "object",
    },
    prompt:
      "Extract the person from this text as JSON: Ada Lovelace, 36, lives in London and writes about analytical engines.",
  },
  {
    id: "invoice",
    name: "Invoice (nested)",
    description: "An object with an array of objects inside. Still finite: the FSM just gets bigger.",
    schema: {
      $defs: {
        LineItem: {
          properties: {
            sku: { maxLength: 12, title: "Sku", type: "string" },
            qty: { title: "Qty", type: "integer" },
            unit_price: { title: "Unit Price", type: "number" },
          },
          required: ["sku", "qty", "unit_price"],
          title: "LineItem",
          type: "object",
        },
      },
      properties: {
        invoice_id: { maxLength: 12, title: "Invoice Id", type: "string" },
        customer: { maxLength: 24, title: "Customer", type: "string" },
        items: { items: { $ref: "#/$defs/LineItem" }, title: "Items", type: "array" },
        paid: { title: "Paid", type: "boolean" },
      },
      required: ["invoice_id", "customer", "items", "paid"],
      title: "Invoice",
      type: "object",
    },
    prompt:
      "Turn this order into an invoice JSON: customer Grace Hopper bought 2 units of SKU COB-1 at 12.5 each and 1 unit of SKU LSP-9 at 99.0; the invoice is unpaid.",
  },
  {
    id: "tree",
    name: "Tree (recursive)",
    description: "The schema references itself. A regex can only unroll a few levels; a grammar can nest forever.",
    schema: {
      $defs: {
        TreeNode: {
          description: "A recursive schema: every node holds a list of nodes.",
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
    },
    prompt:
      "Write a small tree as JSON: the root has value 1 and two children with values 2 and 3; the node with value 2 has one child with value 4.",
  },
];
