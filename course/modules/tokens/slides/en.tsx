import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    render: () => (
      <div className="flex h-full flex-col justify-center gap-6">
        <span className="eyebrow self-start">M0 · Tokens</span>
        <h1 className="text-[100px] font-extrabold leading-none tracking-tight">{"Tokens"}</h1>
        <p className="max-w-[1500px] text-[40px] text-ink-2">{"The model reads and writes whole tokens, not characters."}</p>
      </div>
    ),
    notes: <p>{"The model reads and writes whole tokens, not characters."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
