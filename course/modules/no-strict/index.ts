import { defineModule } from "../types";
import { FIXTURES } from "./fixtures";

export default defineModule({
  id: "no-strict",
  order: 3,
  title: { es: "Structured output sin strict mode", en: "Structured output without strict mode" },
  summary: {
    es: "Un prompt hace probable el `{`; no hace imposible el fence. A veces falla.",
    en: "A prompt makes `{` likely; it cannot make the fence impossible. Sometimes it fails.",
  },
  slideIds: ["intro", "hook", "levels", "failing", "experiment", "lesson"] as const,
  ui: { es: () => import("./i18n/es"), en: () => import("./i18n/en") },
  fixtures: FIXTURES,
  endpoints: ["generate"],
});
