import { FigureSlide } from "@/deck/FigureSlide";
import { Bullets, Callout, Claim, Eyebrow, Foot, Source, TitleSlide, Widget } from "@/deck/primitives";
import type { SlideDefinition } from "@/modules/types";
import ui from "../i18n/en";
import { SamplingWidget } from "../widgets/SamplingWidget";

type Ids = "intro" | "figure" | "formula" | "temperature" | "die" | "greedy-mask";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow="M2 · Temperature and sampling" title="The sampler never sees the logits. It sees softmax(logits / T)." sub="One pass through the model ends in 151,936 numbers. How that becomes one token." />,
    notes: <p>The hinge of the course: edit the logits before the softmax and you control what can come out. Temperature is the first edit; the mask in M4 is the second.</p>,
  },
  figure: {
    id: "figure",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "Logits → probabilities",
    render: () => <FigureSlide src="03-logits-to-probabilities" alt="Twelve candidate tokens: raw logits on the left, probabilities after the softmax on the right" />,
    notes: (
      <ul>
        <li>Left: logits, any real number, the scale is arbitrary, the gaps matter.</li>
        <li>Right: exponentiate, then divide by the sum. A 1.1 logit gap became a 3× probability ratio.</li>
      </ul>
    ),
  },
  formula: {
    id: "formula",
    kind: "content",
    title: "The formula",
    render: () => (
      <>
        <Eyebrow>M2 · Temperature and sampling</Eyebrow>
        <Claim>Softmax is exponentiate-then-divide. Temperature divides before exponentiating.</Claim>
        <Bullets
          items={[
            <>T → 0: the max wins (greedy). T = 1: the distribution as the model learned it. T &gt; 1: flatter, the tail gains mass.</>,
            <>top-k and top-p do not change the model: they write −∞ over what they cut and renormalise the rest.</>,
            <>Greedy picks the max; sampling rolls a loaded die. Neither can land on a probability of exactly zero.</>,
          ]}
        />
        <Callout code="p_i = exp(z_i / T) / Σ_j exp(z_j / T)">exp(−∞) = 0: remember this line</Callout>
        <Foot />
      </>
    ),
    notes: <p>Say it twice: sampling never sees z, it sees softmax(z). And exp(−∞) = 0.</p>,
  },
  temperature: {
    id: "temperature",
    kind: "widget",
    title: "Temperature, live",
    render: () => (
      <>
        <Eyebrow>M2 · Temperature and sampling</Eyebrow>
        <Claim>Move the temperature: the logit column does not move, the model did not change</Claim>
        <Widget>
          <SamplingWidget prompt="person" ui={ui} controls={["temperature", "cutoffs"]} initialTemperature={1} rows={8} />
        </Widget>
        <Source>Qwen2.5-0.5B-Instruct · Person prompt with the chat template · first token</Source>
      </>
    ),
    notes: (
      <ul>
        <li>Measured: <code>{"{⏎"}</code> 68.5 %, fence 23.0 %, <code>{"{}"}</code> 3.4 %, <code>{"{\""}</code> 3.3 %. “Two runs in nine start with a markdown fence. The prompt persuaded; it did not guarantee.”</li>
        <li>Drag T to 2: the tail swells. To 0: greedy, and look what greedy is: −∞ on everything but the max.</li>
      </ul>
    ),
  },
  die: {
    id: "die",
    kind: "widget",
    title: "The loaded die",
    render: () => (
      <>
        <Eyebrow>M2 · Temperature and sampling</Eyebrow>
        <Claim>Sampling rolls a loaded die: it can land in the tail, never on a zero</Claim>
        <Widget>
          <SamplingWidget prompt="person" ui={ui} controls={["temperature"]} initialTemperature={1} rows={6} showDie />
        </Widget>
      </>
    ),
    notes: (
      <ul>
        <li>Roll once: the pointer lands where u falls. Roll a thousand times: the observed histogram approaches the bars.</li>
        <li>With T = 0 there is no die. With a high T, “everything else” shows up more often: the long tail is real.</li>
      </ul>
    ),
  },
  "greedy-mask": {
    id: "greedy-mask",
    kind: "content",
    title: "Greedy is a mask",
    render: () => (
      <>
        <Eyebrow>M2 · Temperature and sampling</Eyebrow>
        <Claim>Greedy is a mask: −∞ on everything but the max. Structured output is the same trick with a different author of the list.</Claim>
        <Bullets
          items={[
            <>llama.cpp with temperature ≤ 0 literally writes −∞ into every logit that is not the max.</>,
            <>top-k and top-p too: <code>masked_fill(…, −inf)</code> with a different criterion.</>,
            <>What follows (M4) only changes who decides the list: a schema instead of a ranking.</>,
          ]}
        />
        <Callout code="logits[forbidden] = -inf   # exp(-inf) = 0">the line the rest of the course explains</Callout>
        <Foot />
      </>
    ),
    notes: <p>Transition: “first let us see what happens when we ask for JSON with words only (M3), then who writes the −∞ (M4)”.</p>,
  },
} satisfies Record<Ids, SlideDefinition>;

export default slides;
