import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    render: () => (
      <div className="flex h-full flex-col justify-center gap-6">
        <span className="eyebrow self-start">M3 · Structured output sin strict mode</span>
        <h1 className="text-[100px] font-extrabold leading-none tracking-tight">{"Structured output sin strict mode"}</h1>
        <p className="max-w-[1500px] text-[40px] text-ink-2">{"Un prompt hace probable el `{`; no hace imposible el fence. A veces falla."}</p>
      </div>
    ),
    notes: <p>{"Un prompt hace probable el `{`; no hace imposible el fence. A veces falla."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
