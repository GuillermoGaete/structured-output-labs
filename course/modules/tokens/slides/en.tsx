import { FigureSlide } from "@/deck/FigureSlide";
import { Bullets, Callout, Claim, Eyebrow, Foot, Source, TitleSlide, Widget } from "@/deck/primitives";
import { FALLBACK_PRESETS } from "@/lib/presets";
import type { SlideDefinition } from "@/modules/types";
import ui from "../i18n/en";
import { PRESET_TEXTS } from "../presets";
import { TokensWidget } from "../widgets/TokensWidget";

const PERSON_PROMPT = FALLBACK_PRESETS[0].prompt;
type Ids = "intro" | "figure" | "bpe" | "boundaries" | "digits" | "template" | "why";

const slides = {
  intro: {
    id: "intro",
    kind: "title",
    layout: "center",
    render: () => <TitleSlide eyebrow="M0 · Tokens" title="The model reads and writes tokens, not characters" sub="And anything that constrains it will have to walk over those same pieces." />,
    notes: (
      <ul>
        <li>Ask “how many tokens are these 26 characters?” before showing the figure.</li>
        <li>Plant: the automaton in M4 walks over tokens, not characters.</li>
      </ul>
    ),
  },
  figure: {
    id: "figure",
    kind: "figure",
    layout: "full",
    theme: "dark",
    title: "Tokens, not characters",
    render: () => <FigureSlide src="00a-tokens-not-characters" alt="The same JSON as 26 characters and 13 tokens" />,
    notes: (
      <ul>
        <li>26 characters, 13 tokens. The split and the ids come from the real tokenizer.</li>
        <li>Three call-outs: <code>{"{\""}</code> is one token; <code>{"\":"}</code> straddles the key/value boundary; “ 36” is three tokens (space, 3, 6).</li>
      </ul>
    ),
  },
  bpe: {
    id: "bpe",
    kind: "content",
    title: "How the vocabulary was built",
    render: () => (
      <>
        <Eyebrow>M0 · Tokens</Eyebrow>
        <Claim>The vocabulary was built by merging the most frequent byte pairs, 151,387 times</Claim>
        <Bullets
          items={[
            "Start from the 256 byte values.",
            "Merge the most frequent adjacent pair in the corpus; repeat.",
            <>151,387 merges later: 151,643 entries plus 22 special tokens. The model only ever sees ids.</>,
            <>Frequent things stay whole (<code> is</code>); rare things stay in pieces.</>,
          ]}
        />
        <Callout code="Ġ i s  →  Ġ is (#29)  →  Ġis (#118, id 374)">the real merge chain for “ is”</Callout>
        <Foot />
      </>
    ),
    notes: <p>A space is spelled Ġ and a newline Ċ only in the string form of the vocabulary; the model never sees those glyphs.</p>,
  },
  boundaries: {
    id: "boundaries",
    kind: "widget",
    title: "Tokens across the JSON boundary",
    render: () => (
      <>
        <Eyebrow>M0 · Tokens</Eyebrow>
        <Claim>A token can straddle the JSON boundary: structure and content share pieces</Claim>
        <Widget>
          <TokensWidget text={PRESET_TEXTS["person-json"]} ui={ui} size="lg" />
        </Widget>
        <Source>Qwen2.5-0.5B-Instruct · real tokenizer</Source>
      </>
    ),
    notes: (
      <ul>
        <li>Point at <code>{"{\""}</code>, <code>{"\":"}</code> and <code>{"\","}</code>: brace and quote together, colon glued to the quote.</li>
        <li>Hovering a chip shows its id and raw form.</li>
      </ul>
    ),
  },
  digits: {
    id: "digits",
    kind: "widget",
    title: "Digits",
    render: () => (
      <>
        <Eyebrow>M0 · Tokens</Eyebrow>
        <Claim>Tokenization is a design choice: Qwen splits 36 into two tokens, GPT-2 does not</Claim>
        <Widget>
          <TokensWidget text={PRESET_TEXTS.numbers} ui={ui} compare size="md" />
        </Widget>
      </>
    ),
    notes: (
      <ul>
        <li>Qwen2: one digit per token (“ 36” = Ġ, 3, 6). GPT-2: “ 36” is a single token.</li>
        <li>That is why the automaton’s integer state in M4 allows 13 tokens: ten digits, space, minus and the closer.</li>
      </ul>
    ),
  },
  template: {
    id: "template",
    kind: "widget",
    title: "What the model sees",
    render: () => (
      <>
        <Eyebrow>M0 · Tokens</Eyebrow>
        <Claim>What the model really sees: your text wrapped in a chat template</Claim>
        <Widget>
          <TokensWidget text={PERSON_PROMPT} ui={ui} useChatTemplate size="md" />
        </Widget>
      </>
    ),
    notes: (
      <ul>
        <li>The grey chips are the template: system prompt, &lt;|im_start|&gt; and &lt;|im_end|&gt; markers. 26 tokens you did not write.</li>
        <li>The Person prompt goes from 30 to 56 tokens. Everything that follows (M1, M3) uses this rendered prompt.</li>
      </ul>
    ),
  },
  why: {
    id: "why",
    kind: "content",
    title: "Why it matters",
    render: () => (
      <>
        <Eyebrow>M0 · Tokens</Eyebrow>
        <Claim>Why it matters: cost, latency, and the alphabet of everything that follows</Claim>
        <Bullets
          items={[
            "Every token is one full pass through the network: the token count is the clock and the bill.",
            "Spanish pays more tokens than English for the same sentence; emoji and accents split into bytes.",
            "The automaton that forces JSON (M4) walks over tokens: it must know where every whole piece lands.",
          ]}
        />
        <Callout>The unit of this whole course is the token. Characters are a rendering detail.</Callout>
        <Foot />
      </>
    ),
    notes: <p>Transition to M1: “the model’s world is 151,936 ids. What does it do with one? It looks it up in a table.”</p>,
  },
} satisfies Record<Ids, SlideDefinition>;

export default slides;
