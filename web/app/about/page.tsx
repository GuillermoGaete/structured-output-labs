import Image from "next/image";

const FIGURES = [
  { file: "00a-tokens-not-characters", title: "Tokens, not characters", body: "The same JSON as 26 characters and as the 13 byte-level BPE tokens the model actually reads. A token can straddle a JSON boundary, and this vocabulary spells digits one per token." },
  { file: "00b-embedding-table", title: "A token is a row in a table", body: "The embedding table has one learned vector per vocabulary slot. A look-up on the way in; on the way out the same tied table gives one logit per row." },
  { file: "01-transformer-architecture", title: "Transformer architecture", body: "Tokens become vectors, N blocks of attention and MLP refine them on the residual stream, and the last vector is projected onto the vocabulary." },
  { file: "02-output-layer", title: "The output layer", body: "One matrix multiplication turns a hidden vector of size d into one score per vocabulary entry: the logits." },
  { file: "03-logits-to-probabilities", title: "Logits → probabilities", body: "Softmax exponentiates and normalises. Temperature scales the logits first." },
  { file: "04-constrained-decoding-mask", title: "The mask", body: "Constrained decoding writes −∞ on every token the automaton forbids before softmax. Those tokens get exactly zero probability; the rest is renormalised." },
  { file: "05-fsm-walk", title: "Walking the automaton", body: "At each state only the outgoing edges are allowed. The model chooses among them with its own probabilities." },
  { file: "06-dual-spy-pipeline", title: "The two observers", body: "PreMaskObserver keeps the raw logits, MasterObserver measures the masked ones. Neither changes a value." },
  { file: "07-fsm-vs-cfg", title: "Finite states vs a stack", body: "A regex cannot count nesting. A recursive schema needs a grammar, which is what the CFG engine gives you." },
];

export default function AboutPage() {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2 max-w-3xl">
        <span className="eyebrow">Background</span>
        <h1 className="text-3xl font-semibold tracking-tight">How structured output acts on the model</h1>
        <p className="text-ink-2">
          The figures from the talk, in order. Each one maps to a line in the backend: the observers live in{" "}
          <code>backend/app/spy.py</code>, the automata export in <code>backend/app/fsm.py</code>.
        </p>
      </header>

      <div className="flex flex-col gap-10">
        {FIGURES.map((f, i) => (
          <figure key={f.file} className="flex flex-col gap-3">
            <div className="panel overflow-hidden">
              <Image src={`/figures/${f.file}.png`} alt={f.title} width={1920} height={1080} className="w-full h-auto" priority={i === 0} />
            </div>
            <figcaption className="max-w-prose">
              <span className="eyebrow">Figure {i + 1}</span>
              <h2 className="text-lg font-semibold">{f.title}</h2>
              <p className="text-sm text-ink-2">{f.body}</p>
            </figcaption>
          </figure>
        ))}
      </div>

      <section className="max-w-prose flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Where the numbers come from</h2>
        <ul className="list-disc pl-5 text-sm text-ink-2 flex flex-col gap-1.5">
          <li>
            <strong>Allowed tokens</strong> counts the finite entries in the logits after the mask. The rest were set to −∞.
          </li>
          <li>
            <strong>Probability removed</strong> is the softmax mass of the raw logits that sat on forbidden tokens: how much the
            model &ldquo;wanted&rdquo; something the schema does not allow.
          </li>
          <li>
            <strong>FSM state</strong> is <code>Guide.get_state()</code> from outlines_core right before the mask for that step was
            computed. The graph renumbers states in breadth-first order; hover a node to see its original id.
          </li>
          <li>
            <strong>Stack depth</strong> is the number of unclosed braces and brackets in the text so far. The grammar engine keeps
            an equivalent stack internally; the regex engine has no such memory and unrolls recursion a fixed number of times.
          </li>
        </ul>
      </section>
    </div>
  );
}
