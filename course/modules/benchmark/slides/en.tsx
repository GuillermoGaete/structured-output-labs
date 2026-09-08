import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    render: () => (
      <div className="flex h-full flex-col justify-center gap-6">
        <span className="eyebrow self-start">M5 · Benchmark</span>
        <h1 className="text-[100px] font-extrabold leading-none tracking-tight">{"Benchmark"}</h1>
        <p className="max-w-[1500px] text-[40px] text-ink-2">{"The constraint costs one compile and one lookup per token; the forward pass dominates; and it saves retries."}</p>
      </div>
    ),
    notes: <p>{"The constraint costs one compile and one lookup per token; the forward pass dominates; and it saves retries."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
