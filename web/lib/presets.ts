import type { Preset } from "./types";

const FORBID = '    model_config = ConfigDict(extra="forbid")';

const PERSON_SOURCE = `from pydantic import BaseModel, ConfigDict, Field


class Person(BaseModel):
${FORBID}

    name: str = Field(max_length=24)
    age: int
    city: str = Field(max_length=24)
`;

const INVOICE_SOURCE = `from pydantic import BaseModel, ConfigDict, Field


class LineItem(BaseModel):
${FORBID}

    sku: str = Field(max_length=12)
    qty: int
    unit_price: float


class Invoice(BaseModel):
${FORBID}

    invoice_id: str = Field(max_length=12)
    customer: str = Field(max_length=24)
    items: list[LineItem]
    paid: bool
`;

const TREE_SOURCE = `from pydantic import BaseModel, ConfigDict


class TreeNode(BaseModel):
    """A recursive schema: every node holds a list of nodes."""

${FORBID}

    value: int
    children: list["TreeNode"]
`;

// Fallback copies of backend/app/presets.py so the editors have content before
// the backend answers (or when it is asleep). The backend's /presets wins once
// it responds.
export const FALLBACK_PRESETS: Preset[] = [
  {
    id: "person",
    group: "Structure",
    model_source: PERSON_SOURCE,
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
      additionalProperties: false,
    },
    prompt:
      "Extract the person from this text as JSON: Ada Lovelace, 36, lives in London and writes about analytical engines.",
  },
  {
    id: "invoice",
    group: "Structure",
    model_source: INVOICE_SOURCE,
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
          additionalProperties: false,
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
      additionalProperties: false,
    },
    prompt:
      "Turn this order into an invoice JSON: customer Grace Hopper bought 2 units of SKU COB-1 at 12.5 each and 1 unit of SKU LSP-9 at 99.0; the invoice is unpaid.",
  },
  {
    id: "tree",
    group: "Structure",
    model_source: TREE_SOURCE,
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
          additionalProperties: false,
        },
      },
      $ref: "#/$defs/TreeNode",
    },
    prompt:
      "Write a small tree as JSON: the root has value 1 and two children with values 2 and 3; the node with value 2 has one child with value 4.",
  },
];
