import { EXPERIMENT_UI } from "@/lib/experiments/ui";
import type { ModuleUi } from "@/modules/types";

const ui: ModuleUi = {
  ...EXPERIMENT_UI.es,
  "labTitle": "Experiment Runner · sin strict mode",
  "labIntro": "El mismo prompt N veces, pidiendo JSON solo con palabras. A veces falla.",
  "includeJson": "Incluir JSON mode (nivel intermedio)",
  "runsTitle": "Corridas",
  "recordedHint": "Modo grabado: se muestran las corridas grabadas; «revelar» agrega la siguiente.",
  "liveHint": "En vivo: cada corrida es una generación real (5–15 s).",
};

export default ui;
