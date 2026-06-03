import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "node-html-parser";

type Confidence = "HIGH" | "MEDIUM" | "NONE";

interface FrameworkMatch {
  name: string;
  confidence: Confidence;
  skillSection?: string;
  extras?: Record<string, string>;
}

interface CapturedFile {
  url: string;
  localPath: string;
  sizeBytes: number;
}

interface ApiPattern {
  pattern: string;
  file: string;
  line: number;
}

const CDN_DOMAINS = [
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "unpkg.com",
  "ajax.googleapis.com",
  "code.jquery.com",
  "stackpath.bootstrapcdn.com",
  "maxcdn.bootstrapcdn.com",
];

function sanitizeFilename(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return (u.pathname + u.search)
      .replace(/^\//, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 120);
  } catch {
    return rawUrl.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

function isCdnUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname;
    return CDN_DOMAINS.some((cdn) => host === cdn || host.endsWith(`.${cdn}`));
  } catch {
    return false;
  }
}

function grepApiPatterns(content: string, filename: string): ApiPattern[] {
  const matchers = [/fetch\(["'`][^"'`]{3,}/g, /axios\.get\(["'`][^"'`]{3,}/g, /\/api\//g, /\.json["'`\s]/g];
  const results: ApiPattern[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const re of matchers) {
      re.lastIndex = 0;
      const m = re.exec(lines[i]);
      if (m) results.push({ pattern: m[0].slice(0, 80), file: filename, line: i + 1 });
    }
  }
  return results;
}

async function detectFramework(
  page: import("playwright").Page,
  reconDir: string,
  capturedJson: CapturedFile[],
): Promise<FrameworkMatch> {
  // Next.js
  const hasNextData = await page.evaluate(() => !!(window as unknown as Record<string, unknown>).__NEXT_DATA__);
  if (hasNextData) return { name: "Next.js", confidence: "HIGH", skillSection: "pattern B" };

  // Nuxt
  const hasNuxt = await page.evaluate(() => !!(window as unknown as Record<string, unknown>).__NUXT__);
  if (hasNuxt) return { name: "Nuxt", confidence: "HIGH", skillSection: "pattern C" };

  // SvelteKit and FestApp — check saved HTML
  let html = "";
  try {
    html = await fs.readFile(path.join(reconDir, "page.html"), "utf8");
  } catch {
    /* page.html not saved yet */
  }

  if (html && /const data = \[/.test(html)) {
    return { name: "SvelteKit", confidence: "HIGH", skillSection: "pattern C" };
  }

  if (html && (html.includes("festapp") || html.includes("api.sync.festapp.io"))) {
    let editionId: string | undefined;
    const root = parse(html);
    const attrVal = root.querySelector("[data-festapp-edition]")?.getAttribute("data-festapp-edition");
    if (attrVal && /^[a-z0-9]{32}$/.test(attrVal)) {
      editionId = attrVal;
    } else {
      const m = html.match(/[a-z0-9]{32}/);
      if (m) editionId = m[0];
    }
    return {
      name: "FestApp",
      confidence: "HIGH",
      skillSection: "pattern E",
      extras: editionId ? { editionId } : undefined,
    };
  }

  // Evenko/Algolia — look for /api/algolia/search in captured network responses
  for (const f of capturedJson) {
    if (f.url.includes("/api/algolia/search")) {
      let indexName: string | undefined;
      try {
        const urlObj = new URL(f.url.startsWith("http") ? f.url : `https://x${f.url}`);
        const encoded = urlObj.searchParams.get("query");
        if (encoded) {
          const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Record<string, unknown>;
          indexName = decoded.indexName as string | undefined;
        }
      } catch {
        /* ignore parse errors */
      }
      return {
        name: "Evenko/Algolia",
        confidence: "HIGH",
        skillSection: "pattern G",
        extras: indexName ? { indexName } : undefined,
      };
    }
  }

  // Gatsby — look for a page-data.json captured during navigation
  for (const f of capturedJson) {
    if (f.url.includes("/page-data/")) {
      try {
        const body = await fs.readFile(f.localPath, "utf8");
        const data = JSON.parse(body) as Record<string, unknown>;
        if (data.result !== undefined && (data.result as Record<string, unknown>).data !== undefined) {
          return { name: "Gatsby", confidence: "HIGH", skillSection: "pattern A" };
        }
      } catch {
        /* not valid JSON */
      }
    }
  }

  // WordPress — probe /wp-json/ from within the browser context
  const wpResult = await page.evaluate(async () => {
    try {
      const res = await fetch("/wp-json/");
      if (!res.ok) return null;
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  });
  if (wpResult && Array.isArray(wpResult.namespaces)) {
    return { name: "WordPress", confidence: "MEDIUM", skillSection: "pattern D (inspect custom routes)" };
  }

  return { name: "unknown", confidence: "NONE" };
}

async function printReport(
  framework: FrameworkMatch,
  apiPatterns: ApiPattern[],
  capturedJson: CapturedFile[],
  reconDir: string,
): Promise<void> {
  console.log("\n=== RESULTS ===\n");

  console.log("Framework detection:");
  if (framework.confidence !== "NONE") {
    const icon = framework.confidence === "HIGH" ? "✓" : "~";
    const section = framework.skillSection ? ` → follow SKILL.md ${framework.skillSection}` : "";
    console.log(`  ${icon} ${framework.name} detected${section}`);
    if (framework.extras) {
      for (const [k, v] of Object.entries(framework.extras)) {
        console.log(`    ${k}: "${v}"`);
      }
    }
  } else {
    console.log("  (no framework matched — inspect network/ files manually)");
  }

  if (apiPatterns.length > 0) {
    console.log("\nAPI patterns in JS:");
    for (const p of apiPatterns.slice(0, 20)) {
      console.log(`  ${p.pattern}  in ${p.file}:${p.line}`);
    }
    if (apiPatterns.length > 20) console.log(`  ... and ${apiPatterns.length - 20} more`);
  } else {
    console.log("\nAPI patterns in JS: none found");
  }

  if (capturedJson.length > 0) {
    console.log("\nJSON responses captured:");
    const sorted = [...capturedJson].sort((a, b) => b.sizeBytes - a.sizeBytes);
    for (const r of sorted) {
      let displayUrl: string;
      try {
        const u = new URL(r.url);
        displayUrl = u.pathname + u.search;
      } catch {
        displayUrl = r.url;
      }
      let preview = "";
      try {
        const raw = await fs.readFile(r.localPath, "utf8");
        preview = raw.slice(0, 80).replace(/\n/g, " ");
      } catch {
        /* skip */
      }
      console.log(`  ${displayUrl.padEnd(45)} ${formatSize(r.sizeBytes).padStart(8)}  ${preview}`);
    }
    const largest = sorted[0];
    let largestDisplay: string;
    try {
      largestDisplay = new URL(largest.url).pathname;
    } catch {
      largestDisplay = largest.url;
    }
    console.log(`\n→ Likely data source: ${largestDisplay} (largest)`);
    console.log(`  ${largest.localPath}`);
  } else {
    console.log("\nJSON responses captured: none");
  }

  console.log(`\nAll files saved to: ${reconDir}`);
}

async function runRecon(rawUrl: string): Promise<void> {
  const parsedUrl = new URL(rawUrl);
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  const reconDir = path.join(
    import.meta.dirname,
    ".recon",
    parsedUrl.hostname,
    ...(pathParts.length > 0 ? pathParts : ["root"]),
  );
  const scriptsDir = path.join(reconDir, "scripts");
  const networkDir = path.join(reconDir, "network");
  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.mkdir(networkDir, { recursive: true });

  console.log(`=== RECON: ${rawUrl} ===\n`);

  let chromium: import("playwright").BrowserType;
  try {
    chromium = (await import("playwright")).chromium;
  } catch {
    console.error("Playwright not installed. Run: npm install && npx playwright install chromium");
    process.exit(1);
  }

  let browser: import("playwright").Browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Executable doesn't exist") || msg.includes("browserType.launch")) {
      console.error("Chromium not found. Run: npx playwright install chromium");
      process.exit(1);
    }
    throw err;
  }

  const capturedJson: CapturedFile[] = [];
  let jsCount = 0;

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on("response", async (response) => {
      const responseUrl = response.url();
      const ct = response.headers()["content-type"] ?? "";
      let body: Buffer;
      try {
        body = await response.body();
      } catch {
        return;
      }

      if (ct.includes("text/html") && responseUrl === rawUrl) {
        await fs.writeFile(path.join(reconDir, "page.html"), body);
        console.log(`  [html]    ${formatSize(body.length)} → page.html`);
      } else if ((ct.includes("javascript") || ct.includes("text/plain")) && jsCount < 8) {
        let fileUrl: URL;
        try {
          fileUrl = new URL(responseUrl);
        } catch {
          return;
        }
        if (fileUrl.origin === parsedUrl.origin && !isCdnUrl(responseUrl)) {
          const filename = path.basename(fileUrl.pathname) || `script-${jsCount}.js`;
          await fs.writeFile(path.join(scriptsDir, filename), body);
          console.log(`  [js]      ${formatSize(body.length)} → scripts/${filename}`);
          jsCount++;
        }
      } else if ((ct.includes("application/json") || responseUrl.includes(".json")) && body.length > 512) {
        const filename = `${sanitizeFilename(responseUrl)}.json`;
        const localPath = path.join(networkDir, filename);
        await fs.writeFile(localPath, body);
        capturedJson.push({ url: responseUrl, localPath, sizeBytes: body.length });
        console.log(`  [json]    ${formatSize(body.length)} → network/${filename}`);
      }
    });

    console.log("Navigating (headless)...");
    await page.goto(rawUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000);

    const framework = await detectFramework(page, reconDir, capturedJson);

    const jsFiles = await fs.readdir(scriptsDir);
    const allPatterns: ApiPattern[] = [];
    for (const f of jsFiles) {
      const content = await fs.readFile(path.join(scriptsDir, f), "utf8");
      allPatterns.push(...grepApiPatterns(content, f));
    }

    let pageHtml = "";
    try {
      pageHtml = await fs.readFile(path.join(reconDir, "page.html"), "utf8");
    } catch {
      /* no page.html */
    }
    if (pageHtml) {
      parse(pageHtml)
        .querySelectorAll("script:not([src])")
        .forEach((el, i) => {
          const t = el.textContent;
          if (t.length > 200) allPatterns.push(...grepApiPatterns(t, `inline-${i}.js`));
        });
    }

    await printReport(framework, allPatterns, capturedJson, reconDir);
  } finally {
    await browser.close();
  }
}

const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/recon.ts <url>");
  process.exit(1);
}
try {
  new URL(url);
} catch {
  console.error(`Invalid URL: ${url}`);
  process.exit(1);
}
await runRecon(url);
