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

// Generate favicon.ico (32x32 PNG wrapped in ICO container)
const icoResvg = new Resvg(svg, { fitTo: { mode: "width", value: 32 } });
const icoPng = icoResvg.render().asPng();

// ICO file format: ICONDIR + ICONDIRENTRY + PNG data
const pngSize = icoPng.byteLength;
const icoBuffer = Buffer.alloc(6 + 16 + pngSize);
// ICONDIR
icoBuffer.writeUInt16LE(0, 0); // reserved
icoBuffer.writeUInt16LE(1, 2); // type: 1 = ICO
icoBuffer.writeUInt16LE(1, 4); // count: 1 image
// ICONDIRENTRY
icoBuffer.writeUInt8(32, 6); // width (0 = 256)
icoBuffer.writeUInt8(32, 7); // height
icoBuffer.writeUInt8(0, 8); // color count
icoBuffer.writeUInt8(0, 9); // reserved
icoBuffer.writeUInt16LE(1, 10); // color planes
icoBuffer.writeUInt16LE(32, 12); // bits per pixel
icoBuffer.writeUInt32LE(pngSize, 14); // size of image data
icoBuffer.writeUInt32LE(22, 18); // offset of image data (6 + 16)
// PNG data
icoPng.copy(icoBuffer, 22);

const icoPath = resolve(import.meta.dirname, "../public/favicon.ico");
writeFileSync(icoPath, icoBuffer);
console.log(`Generated ${icoPath}`);
