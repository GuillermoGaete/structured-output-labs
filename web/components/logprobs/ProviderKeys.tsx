"use client";

import { useState } from "react";
import { EXCLUDED, PROVIDERS, maskKey, writeKey } from "@/lib/providers";

/**
 * Where a visitor puts their own API keys.
 *
 * The keys are held in this browser's localStorage and travel on the request
 * that uses them. The backend forwards them and stores nothing, so a shared
 * deployment never spends its owner's credit.
 */
export function ProviderKeys({ keys, onChange }: { keys: Record<string, string>; onChange: (provider: string, key: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const start = (provider: string) => {
    setEditing(provider);
    setDraft(keys[provider] ?? "");
  };
  const save = (provider: string) => {
    writeKey(provider, draft.trim());
    onChange(provider, draft.trim());
    setEditing(null);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="eyebrow">API keys</span>
      {PROVIDERS.map((p) => {
        const key = keys[p.id] ?? "";
        const open = editing === p.id;
        return (
          <div key={p.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="w-16 font-medium">{p.label}</span>
              {open ? (
                <>
                  <input
                    className="input flex-1 min-w-[180px] font-mono text-xs"
                    type="password"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") save(p.id);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    placeholder={p.console}
                    autoFocus
                    spellCheck={false}
                    aria-label={`${p.label} API key`}
                  />
                  <button className="btn py-0.5 px-2 text-xs" type="button" onClick={() => save(p.id)}>
                    Save
                  </button>
                </>
              ) : (
                <>
                  <span className={`chip ${key ? "chip-good" : ""}`}>{key ? maskKey(key) : "no key"}</span>
                  <button className="btn py-0.5 px-2 text-xs" type="button" onClick={() => start(p.id)}>
                    {key ? "Replace" : "Add"}
                  </button>
                  {key && (
                    <button
                      className="btn py-0.5 px-2 text-xs"
                      type="button"
                      onClick={() => {
                        writeKey(p.id, "");
                        onChange(p.id, "");
                      }}
                    >
                      Remove
                    </button>
                  )}
                </>
              )}
            </div>
            <span className="text-[11px] leading-snug text-muted">{p.note}</span>
          </div>
        );
      })}
      <p className="text-[11px] leading-snug text-muted">
        Keys stay in this browser. They are sent with the request that uses them and the backend never stores them.{" "}
        {EXCLUDED.label} is not offered because {EXCLUDED.why}.
      </p>
    </div>
  );
}
