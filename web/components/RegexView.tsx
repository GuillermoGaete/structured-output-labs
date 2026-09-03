import type { CompilePayload } from "@/lib/types";

export function RegexView({ compiled }: { compiled: CompilePayload }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="eyebrow">Compiled regex · {compiled.regex_length.toLocaleString("en-US")} chars</span>
        <span className="text-xs text-muted">
          {compiled.backend} · {compiled.mode.toUpperCase()}
          {compiled.recursive && " · recursive schema"}
        </span>
      </div>
      {compiled.regex ? (
        <pre className="panel p-3 text-[12px] leading-relaxed whitespace-pre-wrap break-all max-h-56 overflow-auto">{compiled.regex}</pre>
      ) : (
        <p className="text-sm text-critical">outlines_core could not build a regex for this schema: {compiled.regex_error}</p>
      )}
      {compiled.recursive && compiled.regex && (
        <p className="text-xs text-ink-2 max-w-prose">
          This schema references itself. A regex has no memory, so outlines_core unrolls the recursion a fixed number of levels
          and stops. The CFG engine keeps a stack instead and can nest as deep as the model wants.
        </p>
      )}
    </div>
  );
}
