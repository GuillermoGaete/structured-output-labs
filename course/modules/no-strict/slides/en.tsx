import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    render: () => (
      <div className="flex h-full flex-col justify-center gap-6">
        <span className="eyebrow self-start">M3 · Structured output without strict mode</span>
        <h1 className="text-[100px] font-extrabold leading-none tracking-tight">{"Structured output without strict mode"}</h1>
        <p className="max-w-[1500px] text-[40px] text-ink-2">{"A prompt makes `{` likely; it cannot make the fence impossible. Sometimes it fails."}</p>
      </div>
    ),
    notes: <p>{"A prompt makes `{` likely; it cannot make the fence impossible. Sometimes it fails."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
