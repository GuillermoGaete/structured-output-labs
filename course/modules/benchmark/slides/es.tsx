import { TitleSlide } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow={"M5 · Benchmark"} title={"Benchmark"} sub={"La restricción cuesta una compilación y un lookup por token; el forward domina; y ahorra reintentos."} />,
    notes: <p>{"La restricción cuesta una compilación y un lookup por token; el forward domina; y ahorra reintentos."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
