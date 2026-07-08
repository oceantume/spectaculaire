import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

// Extensions matching gzip_types/brotli_types in nginx.conf.
const compressibleExtensions = new Set([".html", ".css", ".js", ".json", ".svg", ".txt"]);

const distDir = resolve(import.meta.dirname, "../dist");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

let count = 0;
for (const path of walk(distDir)) {
  if (!compressibleExtensions.has(extname(path))) continue;

  const input = readFileSync(path);

  const brotli = brotliCompressSync(input, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      [constants.BROTLI_PARAM_SIZE_HINT]: input.length,
    },
  });
  writeFileSync(`${path}.br`, brotli);

  const gzip = gzipSync(input, { level: constants.Z_BEST_COMPRESSION });
  writeFileSync(`${path}.gz`, gzip);

  count++;
}

console.log(`Precompressed ${count} file(s) with Brotli and gzip.`);
