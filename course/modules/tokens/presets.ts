export const PRESET_TEXTS = {
  "person-json": '{"name": "Ada", "age": 36}',
  numbers: "In 1985 she paid 12.50 for 3 tickets and arrived 36 minutes late.",
  code: "def fibonacci(n):\n    return n if n < 2 else fibonacci(n - 1) + fibonacci(n - 2)",
  spanish: "El español paga más tokens: mañana, niño, ¿qué tal?, año 2024 🙂",
} as const;

export type PresetId = keyof typeof PRESET_TEXTS;

export const SENTENCES = {
  en: "The model reads and writes whole tokens, not characters.",
  es: "El modelo lee y escribe tokens enteros, no caracteres.",
} as const;
