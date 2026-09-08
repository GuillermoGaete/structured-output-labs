import benchmark from "./benchmark";
import nextToken from "./next-token";
import noStrict from "./no-strict";
import strict from "./strict";
import temperature from "./temperature";
import tokens from "./tokens";
import type { ModuleDefinition, ModuleId } from "./types";

export const MODULES: ModuleDefinition[] = [tokens, nextToken, temperature, noStrict, strict, benchmark].sort(
  (a, b) => a.order - b.order,
);

export function moduleById(id: ModuleId): ModuleDefinition {
  const found = MODULES.find((m) => m.id === id);
  if (!found) throw new Error(`unknown module ${id}`);
  return found;
}

export { isModuleId, MODULE_IDS } from "./types";
export type { ModuleDefinition, ModuleId } from "./types";
