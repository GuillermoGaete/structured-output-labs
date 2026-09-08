import { TitleSlide } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow={"M1 · Cómo se elige el siguiente token"} title={"Cómo se elige el siguiente token"} sub={"24 bloques corrigen un vector; el último sale por la misma tabla; el token elegido vuelve a la entrada."} />,
    notes: <p>{"24 bloques corrigen un vector; el último sale por la misma tabla; el token elegido vuelve a la entrada."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
