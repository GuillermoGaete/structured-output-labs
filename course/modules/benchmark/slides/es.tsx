import { Bullets, Callout, Claim, Eyebrow, Foot, TitleSlide, Widget } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";
import ui from "../i18n/es";
import { BenchmarkWidget } from "../widgets/BenchmarkWidget";

type Ids = "intro" | "measure" | "charts" | "retries" | "when";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow="M5 · Benchmark" title="¿Cuánto cuesta prohibir?" sub="Una compilación, un lookup por token, y la cuenta que nadie hace: los reintentos." />,
    notes: <p>Todo lo que se mide acá salió de las mismas corridas de M3 y M4. Mismo modelo, mismo hardware, misma máquina.</p>,
  },
  measure: {
    id: "measure",
    kind: "content",
    title: "Qué se mide",
    render: () => (
      <>
        <Eyebrow>M5 · Benchmark</Eyebrow>
        <Claim>Cuatro relojes: compilar, prefill, decodificar por token, y la máscara</Claim>
        <Bullets
          items={[
            <><b>Compilar:</b> una vez por (schema, vocabulario): el regex se convierte en un autómata sobre 151,936 tokens. Segundos la primera vez; después, cache.</>,
            <><b>Prefill:</b> la pasada sobre el prompt. Igual con y sin restricción.</>,
            <><b>Por token:</b> el forward pass domina (300 ms acá). La máscara es un bitmask sobre los logits: 1–2 ms, con cualquiera de los dos motores.</>,
            <><b>Tokens generados:</b> sin restricción el modelo escribe más (fences, explicaciones); con restricción, lo justo.</>,
          ]}
        />
        <Foot />
      </>
    ),
    notes: <p>El backend reporta compile_ms, prefill_ms, decode_ms, processor_ms y tokens/s por corrida; el lab los dibuja.</p>,
  },
  charts: {
    id: "charts",
    kind: "widget",
    title: "Los tiempos",
    render: () => (
      <>
        <Eyebrow>M5 · Benchmark</Eyebrow>
        <Claim>Mismas corridas, tres modos: el forward domina, la máscara casi no se ve</Claim>
        <Widget zoom={1.3}>
          <BenchmarkWidget ui={ui} />
        </Widget>
      </>
    ),
    notes: (
      <ul>
        <li>Puntos = corridas, barra = mediana. Sin restricción suele tardar más porque escribe más tokens.</li>
        <li>«Hasta un JSON válido» divide por la tasa de éxito: es la métrica que compara los tres modos con honestidad.</li>
      </ul>
    ),
  },
  retries: {
    id: "retries",
    kind: "content",
    title: "Los reintentos",
    render: () => (
      <>
        <Eyebrow>M5 · Benchmark</Eyebrow>
        <Claim>El costo real del «sin strict» son los reintentos, no los milisegundos</Claim>
        <Bullets
          items={[
            "Una falla de parseo es una generación entera más: tiempo, tokens facturados y una espera visible.",
            "Tiempo esperado hasta un JSON válido ≈ tiempo por corrida / p(ok). Con p(ok) = 0.75, un 33 % más; con 0.5, el doble.",
            "Con strict, p(ok) = 1 por construcción: el único costo es la compilación, que se paga una vez.",
          ]}
        />
        <Callout code="E[t] = t_run / p(ok)">la cuenta que decide</Callout>
        <Foot />
      </>
    ),
    notes: <p>Si preguntan «cuánto más lento es CFG»: medible por paso, dominado por el forward; hay un motor por forma de schema.</p>,
  },
  when: {
    id: "when",
    kind: "content",
    title: "Cuándo usar qué",
    render: () => (
      <>
        <Eyebrow>M5 · Benchmark</Eyebrow>
        <Claim>Cuándo usar qué: schema explícito, strict, y validar igual</Claim>
        <Bullets
          items={[
            <><b>JSON mode / structured outputs</b> de las APIs es este mecanismo del lado del servidor: por eso publican un subconjunto de JSON Schema y la primera llamada con un schema nuevo es más lenta.</>,
            <><b>Schema plano o anidado pero finito:</b> autómata (rápido, inspeccionable). <b>Recursivo o «cualquier JSON»:</b> gramática con pila.</>,
            <><b>Siempre:</b> <code>additionalProperties: false</code>, validar después del loop, presupuesto de tokens con margen para la llave de cierre.</>,
          ]}
        />
        <Callout>El vocabulario entra y sale por la misma tabla. Structured output se para en la salida y tacha filas antes del softmax.</Callout>
        <Foot />
      </>
    ),
    notes: <p>Cierre: volver a la tabla de M1 y a la línea de M2. Fin, y preguntas.</p>,
  },
} satisfies Record<Ids, SlideDefinition>;

export default slides;
