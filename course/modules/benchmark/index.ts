import { defineModule } from "../types";
import { FIXTURES } from "./fixtures";

export default defineModule({
  id: "benchmark",
  order: 5,
  title: { es: "Benchmark", en: "Benchmark" },
  summary: {
    es: "La restricción cuesta una compilación y un lookup por token; el forward domina; y ahorra reintentos.",
    en: "The constraint costs one compile and one lookup per token; the forward pass dominates; and it saves retries.",
  },
  slideIds: ["intro", "measure", "charts", "retries", "when"] as const,
  ui: { es: () => import("./i18n/es"), en: () => import("./i18n/en") },
  fixtures: FIXTURES,
  endpoints: ["generate"],
});
