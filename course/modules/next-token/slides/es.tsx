import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    render: () => (
      <div className="flex h-full flex-col justify-center gap-6">
        <span className="eyebrow self-start">M1 · Cómo se elige el siguiente token</span>
        <h1 className="text-[100px] font-extrabold leading-none tracking-tight">{"Cómo se elige el siguiente token"}</h1>
        <p className="max-w-[1500px] text-[40px] text-ink-2">{"24 bloques corrigen un vector; el último sale por la misma tabla; el token elegido vuelve a la entrada."}</p>
      </div>
    ),
    notes: <p>{"24 bloques corrigen un vector; el último sale por la misma tabla; el token elegido vuelve a la entrada."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
