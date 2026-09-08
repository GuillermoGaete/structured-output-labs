import { defineModule } from "../types";
import { FIXTURES } from "./fixtures";

export default defineModule({
  id: "temperature",
  order: 2,
  title: { es: "Temperatura y sampling", en: "Temperature and sampling" },
  summary: {
    es: "El sampler nunca ve los logits: ve softmax(logits / T).",
    en: "The sampler never sees the logits: it sees softmax(logits / T).",
  },
  slideIds: ["intro", "figure", "formula", "temperature", "die", "greedy-mask"] as const,
  ui: { es: () => import("./i18n/es"), en: () => import("./i18n/en") },
  fixtures: FIXTURES,
  defaultFixtureId: "person-chat",
  endpoints: ["logits"],
});
