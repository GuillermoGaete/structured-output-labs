import { TitleSlide } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow={"M0 · Tokens"} title={"Tokens"} sub={"El modelo lee y escribe tokens enteros, no caracteres."} />,
    notes: <p>{"El modelo lee y escribe tokens enteros, no caracteres."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
