import { TitleSlide } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow={"M5 · Benchmark"} title={"Benchmark"} sub={"The constraint costs one compile and one lookup per token; the forward pass dominates; and it saves retries."} />,
    notes: <p>{"The constraint costs one compile and one lookup per token; the forward pass dominates; and it saves retries."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
