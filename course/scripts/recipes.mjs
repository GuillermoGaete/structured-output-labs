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

export const RECIPES = {
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
