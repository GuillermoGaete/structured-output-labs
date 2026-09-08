import { TitleSlide } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow={"M4 · Structured output with strict mode"} title={"Structured output with strict mode"} sub={"exp(−∞) = 0: forbidden is not unlikely, it is impossible. It never fails."} />,
    notes: <p>{"exp(−∞) = 0: forbidden is not unlikely, it is impossible. It never fails."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
