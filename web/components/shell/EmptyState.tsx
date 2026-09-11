import type { ReactNode } from "react";
import { IconCompare, IconEdit, IconPlay } from "@/components/icons";

export interface EmptyItem {
  id: string;
  name: string;
  description: string;
  /** Cards with the same group sit under one heading. */
  group?: string;
  /** Counterfactual variants, shown as chips; the card itself runs the first. */
  variants?: string[];
}

interface Props {
  eyebrow: string;
  items: EmptyItem[];
  activeId?: string;
  /** Pressing a card applies it and runs. */
  onPick: (id: string) => void;
  ready: boolean;
  /** The verb on every card. */
  action: string;
  hint?: ReactNode;
  /** Pressing a variant chip runs that variant. */
  onPickVariant?: (id: string, variant: number) => void;
  /** "Run all": every variant, `repeatN` times each, one batch after another. */
  onRunAll?: (id: string) => void;
  /** Load the variants into the setup to edit them before running. */
  onEdit?: (id: string) => void;
  /** The same preset twice, `repeatN` runs each: with the mask and with the schema asked for in the prompt only. */
  onCompareModes?: (id: string) => void;
  repeatN?: number;
}

/** Before the first run: the starting points, each one press away from a run. */
export function EmptyState({ eyebrow, items, activeId, onPick, ready, action, hint, onPickVariant, onRunAll, onEdit, onCompareModes, repeatN = 5 }: Props) {
  return (
    <section className="panel p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="eyebrow">{eyebrow}</span>
        {hint}
      </div>
      {groups(items).map(([group, list]) => (
        <div key={group ?? ""} className="flex flex-col gap-2">
          {group && <span className="eyebrow">{group}</span>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((it) =>
              it.variants?.length ? (
                <div key={it.id} className={`card card-static ${it.id === activeId ? "card-active" : ""}`}>
                  <span className="font-medium">{it.name}</span>
                  {it.description && <span className="text-xs text-ink-2 leading-snug">{it.description}</span>}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {it.variants.map((label, i) => (
                      <button
                        key={label}
                        type="button"
                        className="chip hover:border-accent"
                        onClick={() => onPickVariant?.(it.id, i)}
                        disabled={!ready}
                        title={`${action} this variant once`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <button
                      type="button"
                      className="card-action card-action-primary"
                      onClick={() => onRunAll?.(it.id)}
                      disabled={!ready}
                      title={`Every variant as is, ${repeatN} runs each, one batch after another; then the probe table compares them`}
                    >
                      <IconPlay size={13} />
                      {action} all ×{repeatN}
                    </button>
                    <button type="button" className="card-action" onClick={() => onEdit?.(it.id)} title="Put the prompts and the schema in the setup to edit them first">
                      <IconEdit size={13} />
                      Edit prompts & schema
                    </button>
                  </div>
                </div>
              ) : (
                <div key={it.id} className={`card card-static ${it.id === activeId ? "card-active" : ""}`}>
                  <button
                    type="button"
                    className="card-main text-left flex flex-col gap-1 bg-transparent border-0 p-0 text-inherit"
                    onClick={() => onPick(it.id)}
                    disabled={!ready}
                    title={ready ? `${action} this preset once` : "Waiting for the backend"}
                  >
                    <span className="font-medium">{it.name}</span>
                    {it.description && <span className="text-xs text-ink-2 leading-snug">{it.description}</span>}
                  </button>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <button type="button" className="card-action card-action-primary" onClick={() => onPick(it.id)} disabled={!ready} title={`${action} this preset once`}>
                      <IconPlay size={13} />
                      {action}
                    </button>
                    {onCompareModes && (
                      <button
                        type="button"
                        className="card-action"
                        onClick={() => onCompareModes(it.id)}
                        disabled={!ready}
                        title={`Two batches of ${repeatN}: with the mask, and with the JSON asked for in the prompt only; the probe table compares the valid rates`}
                      >
                        <IconCompare size={13} />
                        Mask vs prompt ×{repeatN}
                      </button>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Items in order of first appearance of their group; ungrouped ones first. */
function groups(items: EmptyItem[]): [string | undefined, EmptyItem[]][] {
  const out: [string | undefined, EmptyItem[]][] = [];
  for (const it of items) {
    const bucket = out.find(([g]) => g === it.group);
    if (bucket) bucket[1].push(it);
    else out.push([it.group, [it]]);
  }
  return out;
}
