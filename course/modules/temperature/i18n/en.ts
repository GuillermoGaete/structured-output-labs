import type { ModuleUi } from "@/modules/types";

const ui: ModuleUi = {
  labTitle: "Sampling Lab",
  labIntro: "The sampler never sees the logits: it sees softmax(logits / T).",
};

export default ui;
