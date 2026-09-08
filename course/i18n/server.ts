import type { Dictionary } from "./dictionaries/es";
import type { Locale } from "./config";

const dictionaries: Record<Locale, () => Promise<{ default: Dictionary }>> = {
  es: () => import("./dictionaries/es"),
  en: () => import("./dictionaries/en"),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return (await dictionaries[locale]()).default;
}
