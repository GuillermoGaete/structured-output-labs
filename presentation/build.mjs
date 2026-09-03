// Render every slides/*.html to out/<name>.png (1920x1080) and extract its
// inline <svg> to out/<name>.svg. Uses the Chromium Playwright ships with.
//
//   npm install && npx playwright install chromium && npm run build
//
// Set CHROMIUM_PATH to point at a specific browser binary if needed.

import { chromium } from "playwright";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const slidesDir = path.join(here, "slides");
const outDir = path.join(here, "out");
await mkdir(outDir, { recursive: true });

const only = process.argv[2];
const files = (await readdir(slidesDir)).filter((f) => f.endsWith(".html") && !f.startsWith("_") && (!only || f.includes(only))).sort();

const launch = {};
if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) launch.executablePath = process.env.CHROMIUM_PATH;

const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

for (const file of files) {
  const name = file.replace(/\.html$/, "");
  await page.goto(pathToFileURL(path.join(slidesDir, file)).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });

  // Standalone SVG: the slide's <svg> plus the font faces it relies on.
  const svg = await page.evaluate(() => {
    const el = document.querySelector("svg.slide");
    return el ? el.outerHTML : null;
  });
  if (svg) {
    const fontCss = await readFile(path.join(here, "fonts", "fonts.css"), "utf8").catch(() => "");
    const standalone = svg.replace(/<svg([^>]*)>/, (m, attrs) => {
      const withNs = attrs.includes("xmlns=") ? attrs : `${attrs} xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`;
      return `<svg${withNs}>\n<style>${fontCss}</style>`;
    });
    await writeFile(path.join(outDir, `${name}.svg`), `<?xml version="1.0" encoding="UTF-8"?>\n${standalone}\n`);
  }
  console.log(`rendered ${name}${svg ? " (+svg)" : ""}`);
}

await browser.close();
