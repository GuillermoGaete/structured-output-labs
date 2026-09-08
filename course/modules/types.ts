import type { ReactNode } from "react";
import type { FixtureManifestEntry } from "@/data/fixtures";
import type { Locale } from "@/i18n/config";

export const MODULE_IDS = ["tokens", "next-token", "temperature", "no-strict", "strict", "benchmark"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];
export type EndpointKind = "tokenize" | "forward" | "logits" | "generate" | "compile";
export type ModuleUi = Record<string, string>;

export interface SlideDefinition {
  /** Stable id: the URL alias (/slides/the-mask) and the presenter-notes key. */
  id: string;
  title?: string;
  kind?: "title" | "section" | "content" | "figure" | "widget";
  layout?: "center" | "top" | "split" | "full";
  /** Figures are drawn for one theme; a slide can pin it regardless of the deck theme. */
  theme?: "inherit" | "dark" | "light";
  render: () => ReactNode;
  notes?: ReactNode;
}

export type SlideSet<S extends readonly string[]> = Record<S[number], SlideDefinition>;

export interface ModuleDefinition<S extends readonly string[] = readonly string[]> {
  id: ModuleId;
  order: number;
  title: Record<Locale, string>;
  summary: Record<Locale, string>;
  /** Canonical slide order, shared by every locale so /es/x/slides/7 and /en/x/slides/7 are the same slide. */
  slideIds: S;
  /** Plain strings for the lab, importable on the server. */
  ui: Record<Locale, () => Promise<{ default: ModuleUi }>>;
  fixtures: FixtureManifestEntry[];
  defaultFixtureId?: string;
  endpoints: EndpointKind[];
}

export interface LabProps {
  moduleId: ModuleId;
  locale: Locale;
  ui: ModuleUi;
}

export function defineModule<const S extends readonly string[]>(def: ModuleDefinition<S>): ModuleDefinition<S> {
  return def;
}

export function isModuleId(value: string): value is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(value);
}
