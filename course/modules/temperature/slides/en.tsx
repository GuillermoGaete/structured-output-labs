import { TitleSlide } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow={"M2 · Temperature and sampling"} title={"Temperature and sampling"} sub={"The sampler never sees the logits: it sees softmax(logits / T)."} />,
    notes: <p>{"The sampler never sees the logits: it sees softmax(logits / T)."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
