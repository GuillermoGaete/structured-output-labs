import { defineModule } from "../types";

export default defineModule({
  id: "temperature",
  order: 2,
  title: {"es": "Temperatura y sampling", "en": "Temperature and sampling"},
  summary: {"es": "El sampler nunca ve los logits: ve softmax(logits / T).", "en": "The sampler never sees the logits: it sees softmax(logits / T)."},
  slideIds: ["intro"] as const,
  ui: { es: () => import("./i18n/es"), en: () => import("./i18n/en") },
  fixtures: [],
  endpoints: ["logits"],
});
