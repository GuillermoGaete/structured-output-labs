import { FigureSlide } from "@/deck/FigureSlide";
import { Bullets, Callout, Claim, Eyebrow, Foot, Source, TitleSlide, Widget } from "@/deck/primitives";
import { FALLBACK_PRESETS } from "@/lib/presets";
import type { SlideDefinition } from "@/modules/types";
import ui from "../i18n/es";
import { PRESET_TEXTS } from "../presets";
import { TokensWidget } from "../widgets/TokensWidget";

const PERSON_PROMPT = FALLBACK_PRESETS[0].prompt;
type Ids = "intro" | "figure" | "bpe" | "boundaries" | "digits" | "template" | "why";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow="M0 · Tokens" title="El modelo lee y escribe tokens, no caracteres" sub="Y todo lo que lo restrinja tendrá que caminar sobre esos mismos pedazos." />,
    notes: (
      <ul>
        <li>Preguntá: «¿cuántos tokens son estos 26 caracteres?» antes de mostrar la figura.</li>
        <li>Plantar: el autómata de M4 camina sobre tokens, no sobre caracteres.</li>
      </ul>
    ),
  },
  figure: {
    id: "figure",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "Tokens, no caracteres",
    render: () => <FigureSlide src="00a-tokens-not-characters" alt="El mismo JSON como 26 caracteres y 13 tokens" />,
    notes: (
      <ul>
        <li>26 caracteres, 13 tokens. La partición y los ids salen del tokenizer real.</li>
        <li>Tres call-outs: <code>{"{\""}</code> es un token; <code>{"\":"}</code> cruza la frontera clave/valor; « 36» son tres tokens (espacio, 3, 6).</li>
      </ul>
    ),
  },
  bpe: {
    id: "bpe",
    kind: "content",
    title: "Cómo se armó el vocabulario",
    render: () => (
      <>
        <Eyebrow>M0 · Tokens</Eyebrow>
        <Claim>El vocabulario se armó juntando los pares de bytes más frecuentes, 151,387 veces</Claim>
        <Bullets
          items={[
            "Se empieza con los 256 valores de byte.",
            "Se junta el par adyacente más frecuente del corpus y se repite.",
            <>151,387 merges después: 151,643 entradas más 22 tokens especiales. El modelo solo ve ids.</>,
            <>Lo frecuente queda entero (<code> is</code>); lo raro queda en pedazos.</>,
          ]}
        />
        <Callout code="Ġ i s  →  Ġ is (#29)  →  Ġis (#118, id 374)">la cadena real de merges para « is»</Callout>
        <Foot />
      </>
    ),
    notes: <p>El espacio se escribe Ġ y el salto de línea Ċ solo en la forma de texto del vocabulario; el modelo nunca ve esos glifos.</p>,
  },
  boundaries: {
    id: "boundaries",
    kind: "widget",
    title: "Tokens que cruzan la frontera del JSON",
    render: () => (
      <>
        <Eyebrow>M0 · Tokens</Eyebrow>
        <Claim>Un token puede cruzar la frontera del JSON: estructura y contenido comparten piezas</Claim>
        <Widget>
          <TokensWidget text={PRESET_TEXTS["person-json"]} ui={ui} size="lg" />
        </Widget>
        <Source>Qwen2.5-0.5B-Instruct · tokenizer real</Source>
      </>
    ),
    notes: (
      <ul>
        <li>Señalar <code>{"{\""}</code>, <code>{"\":"}</code> y <code>{"\","}</code>: llave y comilla juntas, dos puntos pegados a la comilla.</li>
        <li>Pasar el mouse por un chip muestra id y forma cruda.</li>
      </ul>
    ),
  },
  digits: {
    id: "digits",
    kind: "widget",
    title: "Los dígitos",
    render: () => (
      <>
        <Eyebrow>M0 · Tokens</Eyebrow>
        <Claim>La tokenización es una decisión de diseño: Qwen parte 36 en dos tokens, GPT-2 no</Claim>
        <Widget>
          <TokensWidget text={PRESET_TEXTS.numbers} ui={ui} compare size="md" />
        </Widget>
      </>
    ),
    notes: (
      <ul>
        <li>Qwen2: un dígito por token (« 36» = Ġ, 3, 6). GPT-2: « 36» es un solo token.</li>
        <li>Por eso el estado «entero» del autómata de M4 permite 13 tokens: diez dígitos, espacio, menos y el cierre.</li>
      </ul>
    ),
  },
  template: {
    id: "template",
    kind: "widget",
    title: "Lo que ve el modelo",
    render: () => (
      <>
        <Eyebrow>M0 · Tokens</Eyebrow>
        <Claim>Lo que el modelo ve de verdad: tu texto envuelto en un chat template</Claim>
        <Widget>
          <TokensWidget text={PERSON_PROMPT} ui={ui} useChatTemplate size="md" />
        </Widget>
      </>
    ),
    notes: (
      <ul>
        <li>Los chips grises son el template: system prompt, marcadores &lt;|im_start|&gt; y &lt;|im_end|&gt;. 26 tokens que no escribiste.</li>
        <li>El prompt Person pasa de 30 a 56 tokens. Todo lo que sigue (M1, M3) usa este prompt renderizado.</li>
      </ul>
    ),
  },
  why: {
    id: "why",
    kind: "content",
    title: "Por qué importa",
    render: () => (
      <>
        <Eyebrow>M0 · Tokens</Eyebrow>
        <Claim>Por qué importa: costo, latencia y el alfabeto de todo lo que viene</Claim>
        <Bullets
          items={[
            "Cada token es una pasada completa por la red: el conteo de tokens es el reloj y la factura.",
            "El español paga más tokens que el inglés por la misma frase; los emojis y las tildes se parten en bytes.",
            "El automáta que fuerza el JSON (M4) camina sobre tokens: tiene que saber dónde cae cada pieza entera.",
          ]}
        />
        <Callout>La unidad de todo el curso es el token. Los caracteres son un detalle de renderizado.</Callout>
        <Foot />
      </>
    ),
    notes: <p>Transición a M1: «el mundo del modelo son 151,936 ids. ¿Qué hace con uno? Lo busca en una tabla.»</p>,
  },
} satisfies Record<Ids, SlideDefinition>;

export default slides;
