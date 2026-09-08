import { TitleSlide } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow={"M2 · Temperatura y sampling"} title={"Temperatura y sampling"} sub={"El sampler nunca ve los logits: ve softmax(logits / T)."} />,
    notes: <p>{"El sampler nunca ve los logits: ve softmax(logits / T)."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
