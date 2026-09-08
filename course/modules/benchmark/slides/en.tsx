import { Bullets, Callout, Claim, Eyebrow, Foot, TitleSlide, Widget } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";
import ui from "../i18n/en";
import { BenchmarkWidget } from "../widgets/BenchmarkWidget";

type Ids = "intro" | "measure" | "charts" | "retries" | "when";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow="M5 · Benchmark" title="What does forbidding cost?" sub="One compile, one lookup per token, and the bill nobody adds up: the retries." />,
    notes: <p>Everything measured here came from the same runs as M3 and M4. Same model, same hardware, same machine.</p>,
  },
  measure: {
    id: "measure",
    kind: "content",
    title: "What is measured",
    render: () => (
      <>
        <Eyebrow>M5 · Benchmark</Eyebrow>
        <Claim>Four clocks: compile, prefill, decode per token, and the mask</Claim>
        <Bullets
          items={[
            <><b>Compile:</b> once per (schema, vocabulary): the regex becomes an automaton over 151,936 tokens. Seconds the first time; cached afterwards.</>,
            <><b>Prefill:</b> the pass over the prompt. The same with and without the constraint.</>,
            <><b>Per token:</b> the forward pass dominates. The mask is a bitmask over the logits: tenths of a millisecond.</>,
            <><b>Tokens generated:</b> without a constraint the model writes more (fences, explanations); with one, just enough.</>,
          ]}
        />
        <Foot />
      </>
    ),
    notes: <p>The backend reports compile_ms, prefill_ms, decode_ms, processor_ms and tokens/s per run; the lab draws them.</p>,
  },
  charts: {
    id: "charts",
    kind: "widget",
    title: "The timings",
    render: () => (
      <>
        <Eyebrow>M5 · Benchmark</Eyebrow>
        <Claim>Same runs, three modes: the forward pass dominates, the mask barely shows</Claim>
        <Widget zoom={1.3}>
          <BenchmarkWidget ui={ui} />
        </Widget>
      </>
    ),
    notes: (
      <ul>
        <li>Dots = runs, bar = median. Without a constraint it tends to take longer because it writes more tokens.</li>
        <li>“Until one valid JSON” divides by the success rate: the metric that compares the three modes honestly.</li>
      </ul>
    ),
  },
  retries: {
    id: "retries",
    kind: "content",
    title: "The retries",
    render: () => (
      <>
        <Eyebrow>M5 · Benchmark</Eyebrow>
        <Claim>The real cost of “no strict” is the retries, not the milliseconds</Claim>
        <Bullets
          items={[
            "A parse failure is one more whole generation: time, billed tokens and a visible wait.",
            "Expected time until one valid JSON ≈ time per run / p(ok). With p(ok) = 0.75, 33 % more; with 0.5, double.",
            "With strict, p(ok) = 1 by construction: the only cost is the compile, paid once.",
          ]}
        />
        <Callout code="E[t] = t_run / p(ok)">the sum that decides</Callout>
        <Foot />
      </>
    ),
    notes: <p>If asked “how much slower is CFG”: measurable per step, dominated by the forward pass; one engine per schema shape.</p>,
  },
  when: {
    id: "when",
    kind: "content",
    title: "When to use what",
    render: () => (
      <>
        <Eyebrow>M5 · Benchmark</Eyebrow>
        <Claim>When to use what: an explicit schema, strict, and validate anyway</Claim>
        <Bullets
          items={[
            <><b>JSON mode / structured outputs</b> in the APIs is this mechanism server-side: hence the supported JSON Schema subset and the slower first call with a new schema.</>,
            <><b>Flat or nested but finite schema:</b> automaton (fast, inspectable). <b>Recursive or “any JSON”:</b> grammar with a stack.</>,
            <><b>Always:</b> <code>additionalProperties: false</code>, validate after the loop, a token budget with room for the closing brace.</>,
          ]}
        />
        <Callout>The vocabulary enters and leaves through the same table. Structured output stands at the exit and crosses out rows before the softmax.</Callout>
        <Foot />
      </>
    ),
    notes: <p>Close: back to the table from M1 and the line from M2. End, then questions.</p>,
  },
} satisfies Record<Ids, SlideDefinition>;

export default slides;
