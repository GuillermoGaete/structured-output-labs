import { TitleSlide } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow={"M0 · Tokens"} title={"Tokens"} sub={"The model reads and writes whole tokens, not characters."} />,
    notes: <p>{"The model reads and writes whole tokens, not characters."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
