import { Bullets, Callout, Claim, Eyebrow, Foot, TitleSlide, Widget } from "@/deck/primitives";
import { ExperimentWidget } from "@/components/experiments/ExperimentWidget";
import type { SlideDefinition } from "@/modules/types";
import ui from "../i18n/es";

type Ids = "intro" | "hook" | "levels" | "failing" | "experiment" | "lesson";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow="M3 · Structured output sin strict mode" title="Un prompt hace probable el «{». No hace imposible el fence." sub="Pedir JSON con palabras: qué pasa cuando corrés lo mismo veinte veces." />,
    notes: <p>Este módulo es el problema; M4 es la solución. Todo lo que se ve acá salió del mismo modelo y el mismo prompt, solo cambia la semilla.</p>,
  },
  hook: {
    id: "hook",
    kind: "content",
    title: "El hook",
    render: () => (
      <>
        <Eyebrow>M3 · Structured output sin strict mode</Eyebrow>
        <Claim>Una corrida de cuatro rompe tu parser: el primer token, medido</Claim>
        <Bullets
          items={[
            <><code>{"{⏎"}</code> 68.5 % · <code>```</code> 23.0 % · <code>{"{}"}</code> 3.4 % · <code>{"{\""}</code> 3.3 %: la distribución real del primer token para el prompt Person.</>,
            "Todos escribimos la regex que saca el fence de markdown y el «Sure, here is your JSON». Existe por la segunda barra.",
            "Con el schema dentro del prompt mejora mucho, pero mejora es una probabilidad, no una garantía.",
          ]}
        />
        <Callout>El prompt persuade. No garantiza. Esta charla es sobre cómo hacer esa segunda barra exactamente cero.</Callout>
        <Foot />
      </>
    ),
    notes: <p>Los números salen de M2 (Sampling Lab, prompt Person con chat template). Decir «el fence» en vez de «Sure»: es lo que muestra el panel en vivo.</p>,
  },
  levels: {
    id: "levels",
    kind: "content",
    title: "Tres niveles",
    render: () => (
      <>
        <Eyebrow>M3 · Structured output sin strict mode</Eyebrow>
        <Claim>Las APIs ofrecen tres niveles: prompt, JSON mode y strict</Claim>
        <Bullets
          items={[
            <><b>Solo prompt:</b> el schema va en el texto. El modelo puede ignorarlo: fence, preámbulo, claves inventadas, tipos cambiados.</>,
            <><b>JSON mode:</b> se garantiza JSON válido de cualquier forma. El parser nunca falla; el validador de schema, sí.</>,
            <><b>Strict (schema):</b> se garantiza el schema completo. Es el tema de M4: una máscara sobre los logits.</>,
          ]}
        />
        <Callout code="constraint: none | json | schema">los tres niveles, en este backend</Callout>
        <Foot />
      </>
    ),
    notes: <p>JSON mode existe en las APIs comerciales como «response_format: json_object»; strict como «json_schema, strict: true». Ambos son este mecanismo del lado del servidor.</p>,
  },
  failing: {
    id: "failing",
    kind: "content",
    title: "Qué es fallar",
    render: () => (
      <>
        <Eyebrow>M3 · Structured output sin strict mode</Eyebrow>
        <Claim>Fallar tiene dos sabores: no parsea, o parsea y no cumple el schema</Claim>
        <Bullets
          items={[
            <><b>No parsea:</b> fence de markdown, preámbulo, texto al final, truncado por el presupuesto de tokens, JSON roto.</>,
            <><b>Parsea pero no cumple:</b> falta una clave, sobra una clave inventada, un tipo cambiado (<code>&quot;36&quot;</code> en vez de <code>36</code>).</>,
            "El backend clasifica cada corrida y vuelve a intentar después de sacar fence y preámbulo: «después de tu regex, ¿pasa?».",
          ]}
        />
        <Foot />
      </>
    ),
    notes: <p>La tabla del lab tiene esas clases como columnas. «Rescatable» = la regex lo habría salvado. Lo que no es rescatable es el argumento de M4.</p>,
  },
  experiment: {
    id: "experiment",
    kind: "widget",
    title: "Veinte corridas",
    render: () => (
      <>
        <Eyebrow>M3 · Structured output sin strict mode</Eyebrow>
        <Claim>El mismo prompt, la misma temperatura, distinta semilla</Claim>
        <Widget zoom={1.25}>
          <ExperimentWidget modes={["plain", "json_mode"]} preset="invoice" ui={ui} rows={3} />
        </Widget>
      </>
    ),
    notes: (
      <ul>
        <li>Grabado: N corridas por modo con el modelo y el prompt de siempre (T 0.7, top-p 0.8, schema en el prompt).</li>
        <li>Clic en una fila: la salida cruda con el fence tachado y lo que dice el parser o el validador.</li>
        <li>En vivo: «Correr 1 más» hace una generación real. Una sola en la charla.</li>
      </ul>
    ),
  },
  lesson: {
    id: "lesson",
    kind: "content",
    title: "Lo que aprendimos",
    render: () => (
      <>
        <Eyebrow>M3 · Structured output sin strict mode</Eyebrow>
        <Claim>Sin restricción, «a veces» es una tasa; con reintentos, es un costo</Claim>
        <Bullets
          items={[
            "Cada falla es un reintento: una pasada completa más, otra factura, otra espera.",
            "La regex rescata algunas; no rescata las claves inventadas ni los tipos cambiados.",
            "Lo que sigue: prohibir, en vez de persuadir. Probabilidad exactamente cero, en cada paso.",
          ]}
        />
        <Callout code="logits[forbidden] = -inf">la línea que M4 explica</Callout>
        <Foot />
      </>
    ),
    notes: <p>Transición: «ahora la misma tabla, con strict mode: treinta de treinta».</p>,
  },
} satisfies Record<Ids, SlideDefinition>;

export default slides;
