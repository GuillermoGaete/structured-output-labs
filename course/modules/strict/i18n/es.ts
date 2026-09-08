import { EXPERIMENT_UI } from "@/lib/experiments/ui";
import type { ModuleUi } from "@/modules/types";

const ui: ModuleUi = {
  ...EXPERIMENT_UI.es,
  "labTitle": "Experiment Runner · con strict mode + Time Machine",
  "labIntro": "Las mismas semillas que en M3, ahora con la máscara. Y cada corrida se puede recorrer paso a paso.",
  "compareSeeds": "Comparar con «solo prompt» por semilla",
  "runsTitle": "Corridas con strict mode",
  "recordedHint": "Modo grabado: corridas grabadas; las dos primeras conservan los pasos.",
  "liveHint": "En vivo: cada corrida es una generación real y cae en el Time Machine.",
  "timeMachine": "Time Machine",
  "timeMachineIntro": "Intención original contra forzado, paso a paso: tokens tachados, pasos anulados, masa removida, tokens permitidos.",
  "compareTitle": "La misma semilla ({seed}), sin y con máscara",
  "maskLabTitle": "Escribí −∞ vos",
  "maskLabHint": "Clic en un token del paso 0 para prohibirlo: el resto se renormaliza.",
  "maskLabRemoved": "masa removida",
  "maskLabReset": "Permitir todo",
};

export default ui;
