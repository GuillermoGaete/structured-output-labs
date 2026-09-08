import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    render: () => (
      <div className="flex h-full flex-col justify-center gap-6">
        <span className="eyebrow self-start">M5 · Benchmark</span>
        <h1 className="text-[100px] font-extrabold leading-none tracking-tight">{"Benchmark"}</h1>
        <p className="max-w-[1500px] text-[40px] text-ink-2">{"La restricción cuesta una compilación y un lookup por token; el forward domina; y ahorra reintentos."}</p>
      </div>
    ),
    notes: <p>{"La restricción cuesta una compilación y un lookup por token; el forward domina; y ahorra reintentos."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
