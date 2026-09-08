import { TitleSlide } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow={"M1 · How the next token is chosen"} title={"How the next token is chosen"} sub={"24 blocks correct one vector; the last one leaves through the same table; the chosen token goes back to the input."} />,
    notes: <p>{"24 blocks correct one vector; the last one leaves through the same table; the chosen token goes back to the input."}</p>,
  },
} satisfies Record<"intro", SlideDefinition>;

export default slides;
