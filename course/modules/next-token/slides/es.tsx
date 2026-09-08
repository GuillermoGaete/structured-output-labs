import { FigureSlide } from "@/deck/FigureSlide";
import { Bullets, Callout, Claim, Eyebrow, Foot, Source, TitleSlide, Widget } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";
import ui from "../i18n/es";
import { LOOP_PROMPTS } from "../presets";
import { InferenceLoop } from "../widgets/InferenceLoop";

type Ids = "intro" | "architecture" | "table" | "output-layer" | "loop" | "one-pass";
const PERSON = LOOP_PROMPTS.person;

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow="M1 · Cómo se elige el siguiente token" title="Una pasada por token. Y el token vuelve a la entrada." sub="24 bloques corrigen un vector por posición; el último vector sale por la misma tabla como 151,936 números." />,
    notes: <p>Intuición, no matemática: qué entra, qué sale, y que todo lo que hace structured output pasa en el último centímetro.</p>,
  },
  architecture: {
    id: "architecture",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "La máquina en una página",
    render: () => <FigureSlide src="01-transformer-architecture" alt="El transformer decoder-only de punta a punta, en cuatro etapas" />,
    notes: (
      <ul>
        <li>De izquierda a derecha, 90 segundos: tokens → ids → embedding + posición → 24 bloques sobre el flujo residual → capa de salida.</li>
        <li>Cada bloque lee el vector y le suma una corrección. La atención mira hacia atrás; el MLP piensa por posición.</li>
        <li>«Todo lo que hace structured output pasa en el último centímetro. Los bloques no se tocan.»</li>
      </ul>
    ),
  },
  table: {
    id: "table",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "Un token es una fila de una tabla",
    render: () => <FigureSlide src="00b-embedding-table" alt="La tabla de embeddings de 151,936 × 896, leída a la entrada y reutilizada a la salida" />,
    notes: (
      <ul>
        <li>Ada es el id 95347; E[95347] es una lectura de fila, no aritmética. 151,936 × 896 = 136 M números, 27.6 % del modelo.</li>
        <li>Derecha: la misma tabla leída al revés: h contra cada fila da un logit por fila. tie_word_embeddings = true, verificado.</li>
      </ul>
    ),
  },
  "output-layer": {
    id: "output-layer",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "La capa de salida",
    render: () => <FigureSlide src="02-output-layer" alt="z = W_U · h: un producto punto por entrada del vocabulario" />,
    notes: (
      <ul>
        <li>z = W_U · h. Un producto punto por entrada del vocabulario: 151,936 puntajes. Cualquier número real; importan los gaps.</li>
        <li>W_U es la tabla de la slide anterior. Un logit es «cuánto se parece h al embedding del token i».</li>
      </ul>
    ),
  },
  loop: {
    id: "loop",
    kind: "widget",
    title: "El loop, en vivo",
    render: () => (
      <>
        <Eyebrow>M1 · Cómo se elige el siguiente token</Eyebrow>
        <Claim>Step: una pasada, un token, y de vuelta a la entrada</Claim>
        <Widget zoom={1.35}>
          <InferenceLoop params={{ prompt: PERSON.prompt, useChatTemplate: PERSON.useChatTemplate, temperature: 0, topK: 0, topP: 1, seed: 7, maxSteps: 48, topKReport: 12 }} speed="real" rows={6} ui={ui} compact />
        </Widget>
        <Source>Qwen2.5-0.5B-Instruct · prompt Person con chat template · greedy</Source>
      </>
    ),
    notes: (
      <ul>
        <li>Señalar la entrada: 15 tokens del usuario más el template plegado. Cada uno es una fila de la tabla.</li>
        <li><b>Step</b>: los bloques se iluminan mientras dura la pasada; sale h y su primera elección: la llave, 68 %.</li>
        <li>Lupa: la misma tabla, un producto punto por fila, softmax vuelve los gaps proporciones. Las barras de la derecha son lo único que ve el sampler.</li>
        <li>Arrastrar T a 2 y a 0: la columna izquierda no se mueve. En 0, greedy es −∞ sobre todo menos el máximo.</li>
        <li><b>Auto</b> y pausar a los ~6 tokens: una pasada por token; <code>{"\":"}</code> es un token; 36 son dos.</li>
      </ul>
    ),
  },
  "one-pass": {
    id: "one-pass",
    kind: "content",
    title: "Lo que hay que recordar",
    render: () => (
      <>
        <Eyebrow>M1 · Cómo se elige el siguiente token</Eyebrow>
        <Claim>Todo lo que hace structured output pasa entre esos dos gráficos de barras</Claim>
        <Bullets
          items={[
            "Una pasada completa por token. El token elegido se agrega y la pasada vuelve a correr: por eso el conteo de tokens es el reloj.",
            "El vocabulario entra y sale por la misma tabla. Un logit es «cuánto se parece h a la fila i».",
            "El sampler nunca ve los logits: ve softmax(z / T). Editá z antes del softmax y controlás lo que puede salir.",
          ]}
        />
        <Callout code="logits → softmax(T) → sample → append → repetir">el napkin del curso</Callout>
        <Foot />
      </>
    ),
    notes: <p>Transición a M2: «primero la edición más simple de z, la temperatura; después la que nos importa, la máscara».</p>,
  },
} satisfies Record<Ids, SlideDefinition>;

export default slides;
