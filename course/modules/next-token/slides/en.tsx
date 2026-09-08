import { FigureSlide } from "@/deck/FigureSlide";
import { Bullets, Callout, Claim, Eyebrow, Foot, TitleSlide, Widget } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";
import ui from "../i18n/en";
import { LOOP_PROMPTS } from "../presets";
import { InferenceLoop } from "../widgets/InferenceLoop";

type Ids = "intro" | "architecture" | "table" | "output-layer" | "loop" | "one-pass";
const PERSON = LOOP_PROMPTS.person;

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow="M1 · How the next token is chosen" title="One pass per token. And the token goes back to the input." sub="24 blocks correct one vector per position; the last vector leaves through the same table as 151,936 numbers." />,
    notes: <p>Intuition, not maths: what goes in, what comes out, and that everything structured output does happens in the last centimetre.</p>,
  },
  architecture: {
    id: "architecture",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "The machine on one page",
    render: () => <FigureSlide src="01-transformer-architecture" alt="The decoder-only transformer end to end, in four stages" />,
    notes: (
      <ul>
        <li>Left to right, 90 seconds: tokens → ids → embedding + position → 24 blocks on the residual stream → output layer.</li>
        <li>Each block reads the vector and adds a correction. Attention looks back; the MLP thinks per position.</li>
        <li>“Everything structured output does happens in the last centimetre. The blocks are untouched.”</li>
      </ul>
    ),
  },
  table: {
    id: "table",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "A token is a row in a table",
    render: () => <FigureSlide src="00b-embedding-table" alt="The 151,936 × 896 embedding table, read on the way in and reused on the way out" />,
    notes: (
      <ul>
        <li>Ada is id 95347; E[95347] is a row read, no arithmetic. 151,936 × 896 = 136 M numbers, 27.6 % of the model.</li>
        <li>Right: the same table read the other way: h against every row gives one logit per row. tie_word_embeddings = true, verified.</li>
      </ul>
    ),
  },
  "output-layer": {
    id: "output-layer",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "The output layer",
    render: () => <FigureSlide src="02-output-layer" alt="z = W_U · h: one dot product per vocabulary entry" />,
    notes: (
      <ul>
        <li>z = W_U · h. One dot product per vocabulary entry: 151,936 scores. Any real number; the gaps matter.</li>
        <li>W_U is the table from the previous slide. A logit is “how much does h look like the embedding of token i”.</li>
      </ul>
    ),
  },
  loop: {
    id: "loop",
    kind: "widget",
    title: "The loop, live",
    render: () => (
      <>
        <Eyebrow>M1 · How the next token is chosen</Eyebrow>
        <Claim>Step: one pass, one token, and back to the input</Claim>
        <Widget zoom={1.25}>
          <InferenceLoop params={{ prompt: PERSON.prompt, useChatTemplate: PERSON.useChatTemplate, temperature: 0, topK: 0, topP: 1, seed: 7, maxSteps: 48, topKReport: 12 }} speed="real" rows={5} ui={ui} compact />
        </Widget>
      </>
    ),
    notes: (
      <ul>
        <li>Point at the input: 15 user tokens plus the folded template. Each one is a row in the table.</li>
        <li><b>Step</b>: the blocks light up while the pass runs; out comes h and its first choice: the brace, 68 %.</li>
        <li>Magnifier: the same table, one dot product per row, softmax turns gaps into ratios. The bars on the right are the only thing the sampler sees.</li>
        <li>Drag T to 2 and to 0: the left column does not move. At 0, greedy is −∞ on everything but the max.</li>
        <li><b>Auto</b> and pause after ~6 tokens: one pass per token; <code>{"\":"}</code> is one token; 36 is two.</li>
      </ul>
    ),
  },
  "one-pass": {
    id: "one-pass",
    kind: "content",
    title: "What to remember",
    render: () => (
      <>
        <Eyebrow>M1 · How the next token is chosen</Eyebrow>
        <Claim>Everything structured output does happens between those two bar charts</Claim>
        <Bullets
          items={[
            "One full pass per token. The chosen token is appended and the pass runs again: that is why the token count is the clock.",
            "The vocabulary enters and leaves through the same table. A logit is “how much does h look like row i”.",
            "The sampler never sees the logits: it sees softmax(z / T). Edit z before the softmax and you control what can come out.",
          ]}
        />
        <Callout code="logits → softmax(T) → sample → append → repeat">the course on a napkin</Callout>
        <Foot />
      </>
    ),
    notes: <p>Transition to M2: “first the simplest edit of z, the temperature; then the one we care about, the mask”.</p>,
  },
} satisfies Record<Ids, SlideDefinition>;

export default slides;
