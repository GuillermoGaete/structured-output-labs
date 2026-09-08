import { defineModule } from "../types";

export default defineModule({
  id: "strict",
  order: 4,
  title: {"es": "Structured output con strict mode", "en": "Structured output with strict mode"},
  summary: {"es": "exp(−∞) = 0: prohibido no es improbable, es imposible. Nunca falla.", "en": "exp(−∞) = 0: forbidden is not unlikely, it is impossible. It never fails."},
  slideIds: ["intro"] as const,
  ui: { es: () => import("./i18n/es"), en: () => import("./i18n/en") },
  fixtures: [],
  endpoints: ["generate", "compile"],
});
