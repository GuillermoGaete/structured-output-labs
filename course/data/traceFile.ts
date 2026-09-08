import { assertFixture, type FixtureFile } from "./fixtures";

/** Save the current recording as a fixture file the repo (or another visitor) can load. */
export function downloadFixture(file: FixtureFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${file.module}.${file.id}.${file.recordedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function parseFixtureFile(file: File): Promise<FixtureFile> {
  const text = await file.text();
  const value: unknown = JSON.parse(text);
  assertFixture(value);
  return value;
}

export function makeFixtureId(prefix: string): string {
  return `${prefix}-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;
}
