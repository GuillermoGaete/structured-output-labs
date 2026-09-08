import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    render: () => (
      <div className="flex h-full flex-col justify-center gap-6">
        <span className="eyebrow self-start">M4 · Structured output with strict mode</span>
        <h1 className="text-[100px] font-extrabold leading-none tracking-tight">{"Structured output with strict mode"}</h1>
        <p className="max-w-[1500px] text-[40px] text-ink-2">{"exp(−∞) = 0: forbidden is not unlikely, it is impossible. It never fails."}</p>
      </div>
    ),
    notes: <p>{"exp(−∞) = 0: forbidden is not unlikely, it is impossible. It never fails."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
