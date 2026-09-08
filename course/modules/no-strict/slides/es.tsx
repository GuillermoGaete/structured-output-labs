import { TitleSlide } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow={"M3 · Structured output sin strict mode"} title={"Structured output sin strict mode"} sub={"Un prompt hace probable el `{`; no hace imposible el fence. A veces falla."} />,
    notes: <p>{"Un prompt hace probable el `{`; no hace imposible el fence. A veces falla."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
