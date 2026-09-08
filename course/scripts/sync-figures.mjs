// Copy the talk figures (SVG + PNG) and the self-hosted fonts into public/, rewriting the font URLs.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const presentation = join(root, "..", "presentation");
const figuresOut = join(root, "public", "figures");
const fontsOut = join(root, "public", "fonts");
mkdirSync(figuresOut, { recursive: true });
mkdirSync(fontsOut, { recursive: true });

let n = 0;
for (const name of readdirSync(join(presentation, "fonts"))) {
  copyFileSync(join(presentation, "fonts", name), join(fontsOut, name));
  n++;
}
const fontsCss = readFileSync(join(presentation, "fonts", "fonts.css"), "utf8");
for (const name of readdirSync(join(presentation, "out"))) {
  if (name.endsWith(".png")) {
    copyFileSync(join(presentation, "out", name), join(figuresOut, name));
    n++;
  } else if (name.endsWith(".svg")) {
    // The extracted SVGs inline fonts.css with relative urls; make them absolute so <object> embeds resolve them.
    const svg = readFileSync(join(presentation, "out", name), "utf8").replace(/url\((['"]?)\.\.\/fonts\//g, "url($1/fonts/").replace(/url\((['"]?)fonts\//g, "url($1/fonts/");
    writeFileSync(join(figuresOut, name), svg);
    n++;
  }
}
console.log(`${n} files synced into public/figures and public/fonts (fonts.css has ${(fontsCss.match(/@font-face/g) || []).length} faces)`);
