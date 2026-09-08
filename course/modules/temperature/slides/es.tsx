import { FigureSlide } from "@/deck/FigureSlide";
import { Bullets, Callout, Claim, Eyebrow, Foot, Source, TitleSlide, Widget } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";
import ui from "../i18n/es";
import { SamplingWidget } from "../widgets/SamplingWidget";

type Ids = "intro" | "figure" | "formula" | "temperature" | "die" | "greedy-mask";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow="M2 · Temperatura y sampling" title="El sampler nunca ve los logits. Ve softmax(logits / T)." sub="Una pasada del modelo termina en 151,936 números. Cómo se convierte eso en un token." />,
    notes: <p>La bisagra del curso: si edito los logits antes del softmax, controlo qué puede salir. La temperatura es la primera edición; la máscara de M4 es la segunda.</p>,
  },
  figure: {
    id: "figure",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "Logits → probabilidades",
    render: () => <FigureSlide src="03-logits-to-probabilities" alt="Doce tokens candidatos: logits crudos a la izquierda, probabilidades después del softmax a la derecha" />,
    notes: (
      <ul>
        <li>Izquierda: logits, cualquier número real, la escala es arbitraria, importan los gaps.</li>
        <li>Derecha: exponenciar y dividir por la suma. Un gap de 1.1 en logits se volvió una razón de 3× en probabilidad.</li>
      </ul>
    ),
  },
  formula: {
    id: "formula",
    kind: "content",
    title: "La fórmula",
    render: () => (
      <>
        <Eyebrow>M2 · Temperatura y sampling</Eyebrow>
        <Claim>Softmax es exponenciar y dividir por la suma. La temperatura divide antes de exponenciar.</Claim>
        <Bullets
          items={[
            <>T → 0: gana el máximo (greedy). T = 1: la distribución tal como la aprendió el modelo. T &gt; 1: se aplana, la cola gana masa.</>,
            <>top-k y top-p no cambian el modelo: escriben −∞ sobre lo que cortan y renormalizan el resto.</>,
            <>Greedy elige el máximo; el sampling tira un dado cargado. Ninguno puede caer en una probabilidad exactamente cero.</>,
          ]}
        />
        <Callout code="p_i = exp(z_i / T) / Σ_j exp(z_j / T)">exp(−∞) = 0: recordá esta línea</Callout>
        <Foot />
      </>
    ),
    notes: <p>Decirlo dos veces: el sampling nunca ve z, ve softmax(z). Y exp(−∞) = 0.</p>,
  },
  temperature: {
    id: "temperature",
    kind: "widget",
    title: "La temperatura, en vivo",
    render: () => (
      <>
        <Eyebrow>M2 · Temperatura y sampling</Eyebrow>
        <Claim>Mové la temperatura: la columna de logits no se mueve, el modelo no cambió</Claim>
        <Widget>
          <SamplingWidget prompt="person" ui={ui} controls={["temperature", "cutoffs"]} initialTemperature={1} rows={8} />
        </Widget>
        <Source>Qwen2.5-0.5B-Instruct · prompt Person con chat template · primer token</Source>
      </>
    ),
    notes: (
      <ul>
        <li>Medido: <code>{"{⏎"}</code> 68.5 %, fence 23.0 %, <code>{"{}"}</code> 3.4 %, <code>{"{\""}</code> 3.3 %. «Dos corridas de nueve empiezan con un fence de markdown. El prompt persuadió; no garantizó.»</li>
        <li>Arrastrar T a 2: la cola se hincha. A 0: greedy, y mirá lo que es greedy: −∞ sobre todo menos el máximo.</li>
      </ul>
    ),
  },
  die: {
    id: "die",
    kind: "widget",
    title: "El dado cargado",
    render: () => (
      <>
        <Eyebrow>M2 · Temperatura y sampling</Eyebrow>
        <Claim>El sampling tira un dado cargado: puede caer en la cola, nunca en un cero</Claim>
        <Widget>
          <SamplingWidget prompt="person" ui={ui} controls={["temperature"]} initialTemperature={1} rows={6} showDie />
        </Widget>
      </>
    ),
    notes: (
      <ul>
        <li>Tirar una vez: el puntero cae donde cae u. Tirar mil veces: el histograma observado se acerca a las barras.</li>
        <li>Con T = 0 no hay dado. Con T alta, «todo lo demás» aparece con más frecuencia: la cola larga existe.</li>
      </ul>
    ),
  },
  "greedy-mask": {
    id: "greedy-mask",
    kind: "content",
    title: "Greedy es una máscara",
    render: () => (
      <>
        <Eyebrow>M2 · Temperatura y sampling</Eyebrow>
        <Claim>Greedy es una máscara: −∞ sobre todo menos el máximo. Structured output es el mismo truco con otro autor de la lista.</Claim>
        <Bullets
          items={[
            <>llama.cpp con temperatura ≤ 0 escribe literalmente −∞ en cada logit que no es el máximo.</>,
            <>top-k y top-p también: <code>masked_fill(…, −inf)</code> con otro criterio.</>,
            <>Lo que sigue (M4) cambia solo quién decide la lista: un schema, en vez de un ranking.</>,
          ]}
        />
        <Callout code="logits[forbidden] = -inf   # exp(-inf) = 0">la línea que el resto del curso explica</Callout>
        <Foot />
      </>
    ),
    notes: <p>Transición: «primero veamos qué pasa cuando le pedimos JSON solo con palabras (M3), y después quién escribe los −∞ (M4)».</p>,
  },
} satisfies Record<Ids, SlideDefinition>;

export default slides;
