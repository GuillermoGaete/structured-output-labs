import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    render: () => (
      <div className="flex h-full flex-col justify-center gap-6">
        <span className="eyebrow self-start">M1 · How the next token is chosen</span>
        <h1 className="text-[100px] font-extrabold leading-none tracking-tight">{"How the next token is chosen"}</h1>
        <p className="max-w-[1500px] text-[40px] text-ink-2">{"24 blocks correct one vector; the last one leaves through the same table; the chosen token goes back to the input."}</p>
      </div>
    ),
    notes: <p>{"24 blocks correct one vector; the last one leaves through the same table; the chosen token goes back to the input."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
