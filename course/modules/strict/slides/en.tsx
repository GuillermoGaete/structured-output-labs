import { FigureSlide } from "@/deck/FigureSlide";
import { Bullets, Claim, Code, Eyebrow, Foot, TitleSlide, Widget } from "@/deck/primitives";
import { ExperimentWidget } from "@/components/experiments/ExperimentWidget";
import type { SlideDefinition } from "@/modules/types";
import ui from "../i18n/en";

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
    render: () => <TitleSlide eyebrow="M4 · Structured output with strict mode" title="Forbidden is not unlikely. It is impossible." sub="exp(−∞) = 0. One line written into the logits, before the softmax, at every step." />,
    notes: <p>The centre of gravity of the course. If something has to be cut, cut from M0–M2, never from here.</p>,
  },
  mask: {
    id: "mask",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "The mask",
    render: () => <FigureSlide src="04-constrained-decoding-mask" alt="Three columns: raw logits, logits with −∞ over the forbidden, forced probabilities" />,
    notes: (
      <ul>
        <li>Three columns, left to right. Stop on the middle one: “a LogitsProcessor did this; nothing else changed”.</li>
        <li>Forbidden tokens are not unlikely, they are impossible: probability exactly 0, every step, no retries.</li>
        <li>The model still chooses, among what is allowed, with its own preferences intact.</li>
      </ul>
    ),
  },
  hook: {
    id: "hook",
    kind: "content",
    title: "A hook in the loop",
    render: () => (
      <>
        <Eyebrow>M4 · Structured output with strict mode</Eyebrow>
        <Claim>It is a hook in the decode loop: six lines, the model untouched</Claim>
        <Code highlight={[1, 6]}>{LOOP}</Code>
        <Bullets items={["No fine-tuning, no retraining: the weights are not touched.", "This is the loop model.generate hides from you; here it is written out so we can look inside."]} />
        <Foot />
      </>
    ),
    notes: <p>backend/app/engine.py. The highlighted line is the only one that matters: the processors write −∞ and the sampler receives that.</p>,
  },
  observers: {
    id: "observers",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "The two observers",
    render: () => <FigureSlide src="06-dual-spy-pipeline" alt="PreMaskObserver → outlines processor → MasterObserver" />,
    notes: <p>45 seconds, only so the audience trusts the numbers on screen: one clones the raw logits before the mask, the other compares after. Neither changes a value.</p>,
  },
  "who-decides": {
    id: "who-decides",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "Who decides",
    render: () => <FigureSlide src="05-fsm-walk" alt="An automaton over the schema's regex: in the integer state, 13 tokens allowed" />,
    notes: (
      <ul>
        <li>Who fills in “forbidden”? The schema compiles to a regex and the regex to an automaton over tokens. The text so far puts us in a state.</li>
        <li>The mask is not computed from the text: it is read off the state. Built once per (schema, vocabulary) and cached; per step it is a bitmask.</li>
        <li>For recursive schemas, a grammar with a stack (llguidance). Same kind of mask, another engine.</li>
      </ul>
    ),
  },
  experiment: {
    id: "experiment",
    kind: "widget",
    title: "The same seeds, with the mask",
    render: () => (
      <>
        <Eyebrow>M4 · Structured output with strict mode</Eyebrow>
        <Claim>The same seeds that failed in M3: now, all of them</Claim>
        <Widget zoom={1.25}>
          <ExperimentWidget modes={["plain", "strict"]} preset="invoice" ui={ui} rows={3} />
        </Widget>
      </>
    ),
    notes: (
      <ul>
        <li>Same model, same prompt, same seeds. Only the processor in the loop changes.</li>
        <li>Open a run in the lab: original intent vs forced, the “overridden” steps, the mass removed. At the integer step, 13 tokens allowed out of 151,936.</li>
        <li>The talk’s only live generation goes here.</li>
      </ul>
    ),
  },
  pitfalls: {
    id: "pitfalls",
    kind: "content",
    title: "Pitfalls",
    render: () => (
      <>
        <Eyebrow>M4 · Structured output with strict mode</Eyebrow>
        <Claim>Syntax, not truth. And four other things to say out loud.</Claim>
        <Bullets
          items={[
            <><b>Syntax, not truth:</b> the mask forces the frame; the model still invents the values. Every “overridden” step is a place it wanted something else.</>,
            <><b>Engines disagree at the edges:</b> extra keys, order, whitespace. <code>additionalProperties: false</code>, always.</>,
            <><b>Validate anyway:</b> a buggy unroller can accept what a parser rejects. json.loads + schema after the loop.</>,
            <><b>Off-distribution:</b> removing 99 % of the mass is a big push. Still prompt for the format; the constraint is the safety net.</>,
            <><b>Truncation:</b> no automaton can force a closing brace that does not fit in the token budget.</>,
          ]}
        />
        <Foot />
      </>
    ),
    notes: <p>Transition to M5: “and what does it cost?”.</p>,
  },
} satisfies Record<Ids, SlideDefinition>;

export default slides;
