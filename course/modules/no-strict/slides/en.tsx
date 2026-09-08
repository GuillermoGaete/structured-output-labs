import { TitleSlide } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow={"M3 · Structured output without strict mode"} title={"Structured output without strict mode"} sub={"A prompt makes `{` likely; it cannot make the fence impossible. Sometimes it fails."} />,
    notes: <p>{"A prompt makes `{` likely; it cannot make the fence impossible. Sometimes it fails."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
