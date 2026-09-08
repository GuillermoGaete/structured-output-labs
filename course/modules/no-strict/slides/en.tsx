import { Bullets, Callout, Claim, Eyebrow, Foot, TitleSlide, Widget } from "@/deck/primitives";
import { ExperimentWidget } from "@/components/experiments/ExperimentWidget";
import type { SlideDefinition } from "@/modules/types";
import ui from "../i18n/en";

type Ids = "intro" | "hook" | "levels" | "failing" | "experiment" | "lesson";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow="M3 · Structured output without strict mode" title="A prompt makes “{” likely. It cannot make the fence impossible." sub="Asking for JSON with words: what happens when you run the same thing twenty times." />,
    notes: <p>This module is the problem; M4 is the fix. Everything shown here came from the same model and the same prompt; only the seed changes.</p>,
  },
  hook: {
    id: "hook",
    kind: "content",
    title: "The hook",
    render: () => (
      <>
        <Eyebrow>M3 · Structured output without strict mode</Eyebrow>
        <Claim>One run in four breaks your parser: the first token, measured</Claim>
        <Bullets
          items={[
            <><code>{"{⏎"}</code> 68.5 % · <code>```</code> 23.0 % · <code>{"{}"}</code> 3.4 % · <code>{"{\""}</code> 3.3 %: the real first-token distribution for the Person prompt.</>,
            "We all wrote the regex that strips the markdown fence and the “Sure, here is your JSON”. It exists because of the second bar.",
            "With the schema inside the prompt it improves a lot, but an improvement is a probability, not a guarantee.",
          ]}
        />
        <Callout>The prompt persuades. It does not guarantee. This talk is about making that second bar exactly zero.</Callout>
        <Foot />
      </>
    ),
    notes: <p>The numbers come from M2 (Sampling Lab, Person prompt with the chat template). Say “the fence” rather than “Sure”: that is what the live panel shows.</p>,
  },
  levels: {
    id: "levels",
    kind: "content",
    title: "Three levels",
    render: () => (
      <>
        <Eyebrow>M3 · Structured output without strict mode</Eyebrow>
        <Claim>APIs offer three levels: prompt, JSON mode and strict</Claim>
        <Bullets
          items={[
            <><b>Prompt only:</b> the schema goes in the text. The model may ignore it: fence, preamble, invented keys, changed types.</>,
            <><b>JSON mode:</b> valid JSON of any shape is guaranteed. The parser never fails; the schema validator can.</>,
            <><b>Strict (schema):</b> the whole schema is guaranteed. That is M4: a mask over the logits.</>,
          ]}
        />
        <Callout code="constraint: none | json | schema">the three levels, in this backend</Callout>
        <Foot />
      </>
    ),
    notes: <p>JSON mode exists in commercial APIs as “response_format: json_object”; strict as “json_schema, strict: true”. Both are this mechanism, server-side.</p>,
  },
  failing: {
    id: "failing",
    kind: "content",
    title: "What failing means",
    render: () => (
      <>
        <Eyebrow>M3 · Structured output without strict mode</Eyebrow>
        <Claim>Failing comes in two flavours: it does not parse, or it parses and breaks the schema</Claim>
        <Bullets
          items={[
            <><b>Does not parse:</b> markdown fence, preamble, trailing text, truncated by the token budget, broken JSON.</>,
            <><b>Parses but does not conform:</b> a missing key, an invented extra key, a changed type (<code>&quot;36&quot;</code> instead of <code>36</code>).</>,
            "The backend classifies every run and tries again after stripping the fence and the preamble: “after your regex, does it pass?”.",
          ]}
        />
        <Foot />
      </>
    ),
    notes: <p>The lab’s table has those classes as columns. “Rescuable” = the regex would have saved it. What is not rescuable is M4’s argument.</p>,
  },
  experiment: {
    id: "experiment",
    kind: "widget",
    title: "Twenty runs",
    render: () => (
      <>
        <Eyebrow>M3 · Structured output without strict mode</Eyebrow>
        <Claim>The same prompt, the same temperature, a different seed</Claim>
        <Widget zoom={1.3}>
          <ExperimentWidget modes={["plain", "json_mode"]} preset="invoice" ui={ui} rows={5} />
        </Widget>
      </>
    ),
    notes: (
      <ul>
        <li>Recorded: N runs per mode with the usual model and prompt (T 0.7, top-p 0.8, schema in the prompt).</li>
        <li>Click a row: the raw output with the fence struck through and what the parser or validator says.</li>
        <li>Live: “Run 1 more” makes a real generation. Only one during the talk.</li>
      </ul>
    ),
  },
  lesson: {
    id: "lesson",
    kind: "content",
    title: "What we learned",
    render: () => (
      <>
        <Eyebrow>M3 · Structured output without strict mode</Eyebrow>
        <Claim>Without a constraint, “sometimes” is a rate; with retries, it is a cost</Claim>
        <Bullets
          items={[
            "Every failure is a retry: one more full pass, one more bill, one more wait.",
            "The regex rescues some; it does not rescue invented keys or changed types.",
            "What follows: forbid instead of persuade. Probability exactly zero, at every step.",
          ]}
        />
        <Callout code="logits[forbidden] = -inf">the line M4 explains</Callout>
        <Foot />
      </>
    ),
    notes: <p>Transition: “now the same table, with strict mode: thirty out of thirty”.</p>,
  },
} satisfies Record<Ids, SlideDefinition>;

export default slides;
