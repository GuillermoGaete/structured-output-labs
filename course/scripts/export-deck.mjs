// Print a module's deck to PDF (one 1920×1080 page per slide) from a running dev server.
//   node scripts/export-deck.mjs strict es [http://localhost:3000]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(join(dirname(dirname(fileURLToPath(import.meta.url))), "..", "presentation", "node_modules", "playwright")));
}

const [moduleId = "tokens", locale = "es", base = "http://localhost:3000"] = process.argv.slice(2);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "out");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `deck-${moduleId}-${locale}.pdf`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${base}/${locale}/${moduleId}/slides/1?print=1&src=recorded`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(3000);
const pages = await page.evaluate(() => document.querySelectorAll(".deck-print-page").length);
await page.pdf({ path: out, width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`${out}: ${pages} slides`);
