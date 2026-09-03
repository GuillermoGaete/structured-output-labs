import Link from "next/link";
import { BackendSettings } from "@/components/BackendSettings";

const LABS = [
  {
    href: "/fsm",
    title: "Schema → Automaton",
    body: "Paste a JSON Schema and see the regex outlines compiles it to, then the finite-state machine behind that regex: character by character, or token by token as the model actually walks it.",
  },
  {
    href: "/time-machine",
    title: "Time Machine",
    body: "Generate with a small model and scrub through every step. Each token shows what the model wanted to say, what the mask allowed, how much vocabulary survived, and which automaton state you are in.",
  },
  {
    href: "/about",
    title: "How it works",
    body: "The transformer's output layer, logits, softmax, and where constrained decoding writes −∞. The diagrams from the talk, with the code path they describe.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3 max-w-3xl">
        <span className="eyebrow">Constrained decoding, opened up</span>
        <h1 className="text-4xl font-semibold tracking-tight leading-tight">A language model can only say what the automaton allows.</h1>
        <p className="text-lg text-ink-2">
          Structured outputs are not a prompt trick. At every step the model produces one logit per vocabulary entry; a
          compiled grammar sets the impossible ones to −∞ before sampling. These labs let you watch that happen.
        </p>
      </header>

      <section className="grid md:grid-cols-3 gap-4">
        {LABS.map((lab) => (
          <Link key={lab.href} href={lab.href} className="panel p-5 flex flex-col gap-2 hover:border-accent transition-colors">
            <h2 className="text-lg font-semibold">{lab.title}</h2>
            <p className="text-sm text-ink-2">{lab.body}</p>
            <span className="text-sm text-accent mt-auto">Open →</span>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Connect the backend</h2>
        <p className="text-sm text-ink-2 max-w-prose">
          Inference runs on a Python server (FastAPI + outlines + transformers) that you deploy as a Hugging Face Space or
          run locally with <code>docker compose up</code>. This page only needs its URL. Set{" "}
          <code>NEXT_PUBLIC_BACKEND_URL</code> on Vercel or paste it here; it is remembered in this browser.
        </p>
        <BackendSettings />
      </section>
    </div>
  );
}
