import { FigureSlide } from "@/deck/FigureSlide";
import { Bullets, Claim, Code, Eyebrow, Foot, TitleSlide, Widget } from "@/deck/primitives";
import { ExperimentWidget } from "@/components/experiments/ExperimentWidget";
import type { SlideDefinition } from "@/modules/types";
import ui from "../i18n/es";

type Ids = "intro" | "mask" | "hook" | "observers" | "who-decides" | "experiment" | "pitfalls";
const LOOP = `processors = LogitsProcessorList([pre, proc, master])   # engine.py

for i in range(max_new_tokens):
    out = self.model(input_ids=cur_ids, past_key_values=past, use_cache=True)
    logits = out.logits[:, -1, :].float()
    scores = processors(all_ids, logits)                 # -inf is written here
    next_id = self._sample(scores, temperature, top_k, top_p, generator)`;

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow="M4 · Structured output con strict mode" title="Prohibido no es improbable. Es imposible." sub="exp(−∞) = 0. Una línea escrita en los logits, antes del softmax, en cada paso." />,
    notes: <p>El centro de gravedad del curso. Si hay que cortar, se corta de M0–M2, nunca de acá.</p>,
  },
  mask: {
    id: "mask",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "La máscara",
    render: () => <FigureSlide src="04-constrained-decoding-mask" alt="Tres columnas: logits crudos, logits con −∞ sobre lo prohibido, probabilidades forzadas" />,
    notes: (
      <ul>
        <li>Tres columnas de izquierda a derecha. Parar en la del medio: «un LogitsProcessor hizo esto; nada más cambió».</li>
        <li>Los tokens prohibidos no son improbables, son imposibles: probabilidad exactamente 0, en cada paso, sin reintentos.</li>
        <li>El modelo sigue eligiendo, entre lo permitido, con sus preferencias intactas.</li>
      </ul>
    ),
  },
  hook: {
    id: "hook",
    kind: "content",
    title: "Un hook en el loop",
    render: () => (
      <>
        <Eyebrow>M4 · Structured output con strict mode</Eyebrow>
        <Claim>Es un hook en el loop de decodificación: seis líneas, el modelo intacto</Claim>
        <Code highlight={[1, 6]}>{LOOP}</Code>
        <Bullets items={["Sin fine-tuning, sin reentrenar: los pesos no se tocan.", "Es el loop que model.generate te esconde; acá está escrito a mano para poder mirar adentro."]} />
        <Foot />
      </>
    ),
    notes: <p>backend/app/engine.py. La línea resaltada es la única que importa: los procesadores escriben −∞ y el sampler recibe eso.</p>,
  },
  observers: {
    id: "observers",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "Los dos observadores",
    render: () => <FigureSlide src="06-dual-spy-pipeline" alt="PreMaskObserver → procesador de outlines → MasterObserver" />,
    notes: <p>45 segundos, solo para que confíen en los números de la pantalla: uno clona los logits crudos antes de la máscara, el otro compara después. Ninguno cambia un valor.</p>,
  },
  "who-decides": {
    id: "who-decides",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "Quién decide",
    render: () => <FigureSlide src="05-fsm-walk" alt="Un autómata sobre el regex del schema: en el estado del entero, 13 tokens permitidos" />,
    notes: (
      <ul>
        <li>¿Quién llena «forbidden»? El schema se compila a un regex y el regex a un autómata sobre tokens. El texto generado hasta ahora nos pone en un estado.</li>
        <li>La máscara no se calcula del texto: se lee del estado. Se construye una vez por (schema, vocabulario) y se cachea; por paso es un bitmask.</li>
        <li>Para schemas recursivos, una gramática con pila (llguidance). Mismo tipo de máscara, otro motor.</li>
      </ul>
    ),
  },
  experiment: {
    id: "experiment",
    kind: "widget",
    title: "Las mismas semillas, con máscara",
    render: () => (
      <>
        <Eyebrow>M4 · Structured output con strict mode</Eyebrow>
        <Claim>Las mismas semillas que fallaban en M3: ahora, todas</Claim>
        <Widget zoom={1.25}>
          <ExperimentWidget modes={["plain", "strict"]} preset="invoice" ui={ui} rows={3} />
        </Widget>
      </>
    ),
    notes: (
      <ul>
        <li>Mismo modelo, mismo prompt, mismas semillas. Cambia solo el procesador en el loop.</li>
        <li>Abrir una corrida en el lab: intención original vs forzado, los pasos «anulados», la masa removida. En el paso del entero, 13 tokens permitidos de 151,936.</li>
        <li>La única generación en vivo de la charla va acá.</li>
      </ul>
    ),
  },
  pitfalls: {
    id: "pitfalls",
    kind: "content",
    title: "Pitfalls",
    render: () => (
      <>
        <Eyebrow>M4 · Structured output con strict mode</Eyebrow>
        <Claim>Sintaxis, no verdad. Y otras cuatro cosas que decir en voz alta.</Claim>
        <Bullets
          items={[
            <><b>Sintaxis, no verdad:</b> la máscara fuerza el marco; los valores los sigue inventando el modelo. Cada paso «anulado» es un lugar donde quería otra cosa.</>,
            <><b>Espacios y fronteras de token:</b> una gramática que prohíbe el espacio enmascara el <code>{" \""}</code> que el modelo escribe tras cada dos puntos y lo empuja a <code>null</code>. Los motores difieren en los bordes: <code>additionalProperties: false</code> siempre.</>,
            <><b>Validar igual:</b> un desenrollado con bug puede aceptar lo que un parser rechaza. json.loads + schema después del loop.</>,
            <><b>Fuera de distribución:</b> quitar el 99 % de la masa es un empujón grande. Seguí pidiendo el formato; la restricción es la red de seguridad.</>,
            <><b>Truncamiento:</b> ningún autómata puede forzar una llave de cierre que no entra en el presupuesto de tokens.</>,
          ]}
        />
        <Foot />
      </>
    ),
    notes: <p>Transición a M5: «¿y cuánto cuesta?».</p>,
  },
} satisfies Record<Ids, SlideDefinition>;

export default slides;
