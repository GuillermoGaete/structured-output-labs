import { defineModule } from "../types";

export default defineModule({
  id: "next-token",
  order: 1,
  title: {"es": "Cómo se elige el siguiente token", "en": "How the next token is chosen"},
  summary: {"es": "24 bloques corrigen un vector; el último sale por la misma tabla; el token elegido vuelve a la entrada.", "en": "24 blocks correct one vector; the last one leaves through the same table; the chosen token goes back to the input."},
  slideIds: ["intro"] as const,
  ui: { es: () => import("./i18n/es"), en: () => import("./i18n/en") },
  fixtures: [],
  endpoints: ["forward"],
});
