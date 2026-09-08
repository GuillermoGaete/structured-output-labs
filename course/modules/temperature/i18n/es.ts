import type { ModuleUi } from "@/modules/types";

const ui: ModuleUi = {
  labTitle: "Sampling Lab",
  labIntro: "El sampler nunca ve los logits: ve softmax(logits / T).",
};

export default ui;
