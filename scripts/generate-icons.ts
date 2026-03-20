import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const svgPath = resolve(import.meta.dirname, "../public/icon.svg");
const svg = readFileSync(svgPath, "utf-8");

for (const size of [192, 512]) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
  });
  const png = resvg.render().asPng();
  const outPath = resolve(import.meta.dirname, `../public/icons/${size}.png`);
  writeFileSync(outPath, png);
  console.log(`Generated ${outPath}`);
}
