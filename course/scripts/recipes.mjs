// What to record per module. `request` may be a function of { presets } (the backend's /presets).
export const TEXTS = {
  "person-json": '{"name": "Ada", "age": 36}',
  numbers: "In 1985 she paid 12.50 for 3 tickets and arrived 36 minutes late.",
  code: "def fibonacci(n):\n    return n if n < 2 else fibonacci(n - 1) + fibonacci(n - 2)",
  spanish: "El español paga más tokens: mañana, niño, ¿qué tal?, año 2024 🙂",
  "en-sentence": "The model reads and writes whole tokens, not characters.",
  "es-sentence": "El modelo lee y escribe tokens enteros, no caracteres.",
};

const tokenize = (id, text, extra = {}, title) => ({
  id,
  kind: "tokenize",
  title: title ?? { es: text.slice(0, 40), en: text.slice(0, 40) },
  request: { text, use_chat_template: false, tokenizer: "model", merges: true, ...extra },
});

const logits = (id, title, request) => ({ id, kind: "logits", title, request });

const loop = (id, title, prompt, useChatTemplate, steps, sample, seed) => ({
  id,
  kind: "loop",
  title,
  steps,
  seed,
  request: {
    prompt,
    use_chat_template: useChatTemplate,
    step: { top_k: 12, attention: "last", logit_lens: true, lens_top_k: 5, tail_bins: 64, decimals: 3, sample },
  },
});

/** N generations per mode with the same seeds; the first `full` runs keep their steps. */
const experiment = (id, title, presetId, { n, full, modes, temperature = 0.7, top_p = 0.8, top_k = 20, schema_in_prompt = true, max_new_tokens = 120 }) => ({
  id,
  kind: "experiment",
  title,
  presetId,
  n,
  full,
  modes,
  request: ({ presets }) => ({
    schema: presets[presetId].schema,
    prompt: presets[presetId].prompt,
    mode: "auto",
    max_new_tokens,
    temperature,
    top_k_sampling: top_k,
    top_p,
    top_k_report: 8,
    use_chat_template: true,
    schema_in_prompt,
  }),
});

export const RECIPES = {
  "no-strict": [
    experiment("person-dev", { es: "Person · 8 corridas por modo (desarrollo)", en: "Person · 8 runs per mode (development)" }, "person", { n: 8, full: 2, modes: ["none", "json", "schema"] }),
  ],
  "next-token": [
    loop("person-chat-greedy", { es: "Person · greedy", en: "Person · greedy" }, null, true, 48, { temperature: 0 }),
    loop("person-chat-t1-seed7", { es: "Person · T = 1 · semilla 7", en: "Person · T = 1 · seed 7" }, null, true, 48, { temperature: 1 }, 7),
    loop("capital-greedy", { es: "«The capital of France is» · greedy", en: "\"The capital of France is\" · greedy" }, "The capital of France is", false, 16, { temperature: 0 }),
    loop("fibonacci-greedy", { es: "«def fibonacci(n):» · greedy", en: "\"def fibonacci(n):\" · greedy" }, "def fibonacci(n):\n    ", false, 24, { temperature: 0 }),
  ],
  temperature: [
    logits("person-chat", { es: "Prompt Person con template · paso 0", en: "Person prompt with template · step 0" }, ({ presets }) => ({
      prompt: presets.person.prompt, use_chat_template: true, top_k: 200, tail_buckets: 64, full_logits: false,
    })),
    logits("tree-chat", { es: "Prompt Tree con template · paso 0", en: "Tree prompt with template · step 0" }, ({ presets }) => ({
      prompt: presets.tree.prompt, use_chat_template: true, top_k: 200, tail_buckets: 64, full_logits: false,
    })),
    logits("capital", { es: "«The capital of France is»", en: "\"The capital of France is\"" }, {
      prompt: "The capital of France is", use_chat_template: false, top_k: 200, tail_buckets: 64, full_logits: false,
    }),
    logits("fibonacci", { es: "«def fibonacci(n):»", en: "\"def fibonacci(n):\"" }, {
      prompt: "def fibonacci(n):\n    ", use_chat_template: false, top_k: 200, tail_buckets: 64, full_logits: false,
    }),
  ],
  tokens: [
    ...Object.entries(TEXTS).flatMap(([key, text]) => [
      tokenize(`${key}`, text),
      tokenize(`${key}-gpt2`, text, { tokenizer: "gpt2", merges: false }),
    ]),
    {
      id: "person-prompt-template",
      kind: "tokenize",
      title: { es: "Prompt Person con chat template", en: "Person prompt with the chat template" },
      request: ({ presets }) => ({ text: presets.person.prompt, use_chat_template: true, tokenizer: "model", merges: true }),
    },
    {
      id: "person-prompt",
      kind: "tokenize",
      title: { es: "Prompt Person sin template", en: "Person prompt without the template" },
      request: ({ presets }) => ({ text: presets.person.prompt, use_chat_template: false, tokenizer: "model", merges: true }),
    },
  ],
};
