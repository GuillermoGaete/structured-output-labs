import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    render: () => (
      <div className="flex h-full flex-col justify-center gap-6">
        <span className="eyebrow self-start">M2 · Temperature and sampling</span>
        <h1 className="text-[100px] font-extrabold leading-none tracking-tight">{"Temperature and sampling"}</h1>
        <p className="max-w-[1500px] text-[40px] text-ink-2">{"The sampler never sees the logits: it sees softmax(logits / T)."}</p>
      </div>
    ),
    notes: <p>{"The sampler never sees the logits: it sees softmax(logits / T)."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
