import { defineModule } from "../types";
import { FIXTURES } from "./fixtures";

export default defineModule({
  id: "tokens",
  order: 0,
  title: { es: "Tokens", en: "Tokens" },
  summary: {
    es: "El modelo lee y escribe tokens enteros, no caracteres.",
    en: "The model reads and writes whole tokens, not characters.",
  },
  slideIds: ["intro", "figure", "bpe", "boundaries", "digits", "template", "why"] as const,
  ui: { es: () => import("./i18n/es"), en: () => import("./i18n/en") },
  fixtures: FIXTURES,
  defaultFixtureId: "person-json",
  endpoints: ["tokenize"],
});
