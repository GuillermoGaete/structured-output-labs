import { TitleSlide } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow={"M4 · Structured output con strict mode"} title={"Structured output con strict mode"} sub={"exp(−∞) = 0: prohibido no es improbable, es imposible. Nunca falla."} />,
    notes: <p>{"exp(−∞) = 0: prohibido no es improbable, es imposible. Nunca falla."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
