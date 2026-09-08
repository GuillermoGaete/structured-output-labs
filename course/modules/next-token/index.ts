import { defineModule } from "../types";
import { FIXTURES } from "./fixtures";

export default defineModule({
  id: "next-token",
  order: 1,
  title: { es: "Cómo se elige el siguiente token", en: "How the next token is chosen" },
  summary: {
    es: "24 bloques corrigen un vector; el último sale por la misma tabla; el token elegido vuelve a la entrada.",
    en: "24 blocks correct one vector; the last one leaves through the same table; the chosen token goes back to the input.",
  },
  slideIds: ["intro", "architecture", "table", "output-layer", "loop", "one-pass"] as const,
  ui: { es: () => import("./i18n/es"), en: () => import("./i18n/en") },
  fixtures: FIXTURES,
  defaultFixtureId: "person-chat-greedy",
  endpoints: ["forward"],
});
