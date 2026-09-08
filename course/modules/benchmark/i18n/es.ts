import { EXPERIMENT_UI } from "@/lib/experiments/ui";
import type { ModuleUi } from "@/modules/types";

const ui: ModuleUi = {
  ...EXPERIMENT_UI.es,
  "labTitle": "Bench Lab",
  "labIntro": "Cuánto cuesta la restricción, medido en las mismas corridas: compilación, prefill, por token, y el costo de los reintentos.",
  "perMode": "Corridas nuevas por modo",
  "recordedHint": "Modo grabado: los tiempos vienen de las grabaciones (mirá el hardware al lado del título).",
  "liveHint": "En vivo: «Correr N más» agrega corridas en los tres modos, secuenciales.",
  "chartsTitle": "Tiempos por modo",
  "expectedToValid": "hasta un JSON válido",
  "expectedHint": "Tiempo esperado hasta obtener un JSON válido reintentando las fallas: total / p(ok).",
  "tokPerS": "tok/s",
  "chartTotal": "Tiempo total por corrida",
  "chartTotalNote": "puntos = corridas · barra = mediana · marca = p90",
  "chartPerToken": "Milisegundos por token (decode)",
  "chartPerTokenNote": "el forward domina; la máscara agrega 1–2 ms por token",
  "chartPrefill": "Prefill (la pasada sobre el prompt)",
  "chartPrefillNote": "mediana por modo",
  "chartCompile": "Compilar y enmascarar (strict)",
  "chartCompileNote": "primera vez vs índice cacheado · máscara total por corrida",
  "compileCold": "compilar, en frío",
  "compileWarm": "compilar, cacheado",
  "compileNoCold": "Ninguna corrida pagó la compilación: el índice ya estaba cacheado.",
  "maskPerRun": "máscara, por corrida",
  "chartTimeline": "Milisegundos por paso",
  "chartTimelineNote": "promedio de las corridas completas · el primer paso incluye el prefill",
  "readingTitle": "Cómo leerlo",
  "reading1": "La restricción cuesta una compilación por (schema, vocabulario), cacheada después, y un lookup por token que se pierde frente al forward.",
  "reading2": "Sin restricción el modelo suele escribir más tokens (fences, texto extra) y a veces hay que reintentar: «hasta un JSON válido» es la métrica que importa.",
  "reading3": "En una máquina distinta los números cambian; las proporciones entre modos, no.",
};

export default ui;
