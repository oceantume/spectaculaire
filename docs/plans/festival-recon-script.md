# Plan: Festival Recon Script + Skill Integration

## Context

Adding a new festival to Spectaculaire requires finding where the site serves its schedule data. This reconnaissance phase burns the most tokens — the agent repeatedly fetches pages, chases dead-end patterns, and guesses at API endpoints. The fix is a dedicated `scripts/recon.ts` tool that does the detective work upfront in a **single Playwright session**: the browser navigates to the URL, intercepts every response (HTML, JS, JSON), saves them all to disk, then performs framework detection against the saved files and the live JS context. The agent can then read from disk instead of re-fetching. The SKILL.md is updated to make this the mandatory first step, and a new dogfooding section ensures each added festival improves the skill going forward.

## Files to Create/Modify

- **`scripts/recon.ts`** — new standalone script (the main deliverable)
- **`package.json`** — add `playwright` devDependency + `recon` npm script
- **`.gitignore`** — add `scripts/.recon/`
- **`.claude/skills/add-festival/SKILL.md`** — add Step 0 (run recon) + Step 7 (dogfeed)

## Implementation

### 1. `package.json`

Add to `"scripts"`:
```json
"recon": "node scripts/recon.ts"
```

Add to `"devDependencies"`:
```json
"playwright": "^1.52.0"
```

Run `npm install` after. Run `npx playwright install chromium` once to download the browser binary.

### 2. `.gitignore`

Append:
```
scripts/.recon/
```

### 3. `scripts/recon.ts`

Standalone script (no exports). Usage: `node scripts/recon.ts <url>`.

Saves everything under `scripts/.recon/<hostname>/`:
- `page.html` — raw HTML of the initial response
- `scripts/<filename>.js` — same-origin JS files intercepted during load (skip CDN, cap at 8)
- `network/<sanitized>.json` — JSON responses > 512 bytes captured during load

**Types and constants:**

```typescript
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

interface CapturedFile { url: string; localPath: string; sizeBytes: number; }
interface ApiPattern { pattern: string; file: string; line: number; }

const CDN_DOMAINS = [
  "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com",
  "ajax.googleapis.com", "code.jquery.com",
  "stackpath.bootstrapcdn.com", "maxcdn.bootstrapcdn.com",
];
```

**Helpers** (before main block):

- `sanitizeFilename(url)` — strips origin, replaces non-alphanum with `-`, truncates to 120 chars
- `formatSize(bytes)` — returns `"45.2KB"` / `"1.2MB"` / `"800B"`
- `isCdnUrl(url)` — checks hostname against CDN_DOMAINS
- `grepApiPatterns(content, filename)` — line-by-line search for `fetch("`, `fetch('`, `axios.get(`, `/api/`, `.json`; first match per line per pattern; returns `ApiPattern[]`

**`detectFramework(page, parsedUrl, reconDir, capturedJsonFiles)`** — async, runs after navigation:

1. **Next.js:** `page.evaluate(() => !!(window as any).__NEXT_DATA__)` → HIGH, pattern B
2. **Nuxt:** `page.evaluate(() => !!(window as any).__NUXT__)` → HIGH, pattern C
3. **SvelteKit:** read `page.html` from disk, test `/const data = \[/` → HIGH, pattern C
4. **FestApp:** read `page.html`, test `festapp` or `api.sync.festapp.io`:
   - editionId: `parse(html).querySelector("[data-festapp-edition]")?.getAttribute(...)` first, then `/[a-z0-9]{32}/` fallback
   - → HIGH, pattern E, extras: `{ editionId }`
5. **Gatsby:** check if any `capturedJsonFiles` has `/page-data/` in its URL AND its content has `result` + `data` keys → HIGH, pattern A
6. **WordPress:** `page.evaluate(() => fetch('/wp-json/').then(r=>r.json()).catch(()=>null))` → if result has `namespaces` array → MEDIUM, pattern D (inspect custom routes)
7. Default → NONE

**`runRecon(url)`** — main async function:

```typescript
async function runRecon(rawUrl: string): Promise<void> {
  const parsedUrl = new URL(rawUrl);
  const reconDir = path.join(import.meta.dirname, ".recon", parsedUrl.hostname);
  const scriptsDir = path.join(reconDir, "scripts");
  const networkDir = path.join(reconDir, "network");
  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.mkdir(networkDir, { recursive: true });

  console.log(`=== RECON: ${rawUrl} ===`);

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
      try { body = await response.body(); } catch { return; }

      if (ct.includes("text/html") && responseUrl === rawUrl) {
        await fs.writeFile(path.join(reconDir, "page.html"), body);
        console.log(`  [html]    ${formatSize(body.length)} → page.html`);

      } else if ((ct.includes("javascript") || ct.includes("text/plain")) && jsCount < 8) {
        const fileUrl = new URL(responseUrl);
        if (fileUrl.origin === parsedUrl.origin && !isCdnUrl(responseUrl)) {
          const filename = path.basename(fileUrl.pathname) || `script-${jsCount}.js`;
          await fs.writeFile(path.join(scriptsDir, filename), body);
          console.log(`  [js]      ${formatSize(body.length)} → scripts/${filename}`);
          jsCount++;
        }

      } else if ((ct.includes("application/json") || responseUrl.includes(".json")) && body.length > 512) {
        const filename = sanitizeFilename(responseUrl) + ".json";
        const localPath = path.join(networkDir, filename);
        await fs.writeFile(localPath, body);
        capturedJson.push({ url: responseUrl, localPath, sizeBytes: body.length });
        console.log(`  [json]    ${formatSize(body.length)} → network/${filename}`);
      }
    });

    console.log("Navigating (headless)...");
    await page.goto(rawUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000);

    const framework = await detectFramework(page, parsedUrl, reconDir, capturedJson);

    const jsFiles = await fs.readdir(scriptsDir);
    const allPatterns: ApiPattern[] = [];
    for (const f of jsFiles) {
      const content = await fs.readFile(path.join(scriptsDir, f), "utf8");
      allPatterns.push(...grepApiPatterns(content, f));
    }

    let pageHtml = "";
    try { pageHtml = await fs.readFile(path.join(reconDir, "page.html"), "utf8"); } catch { /* */ }
    if (pageHtml) {
      parse(pageHtml).querySelectorAll("script:not([src])").forEach((el, i) => {
        const t = el.textContent;
        if (t.length > 200) allPatterns.push(...grepApiPatterns(t, `inline-${i}.js`));
      });
    }

    printReport(framework, allPatterns, capturedJson);
  } finally {
    await browser.close();
  }
}
```

**`printReport(framework, apiPatterns, capturedJson)`** — example output:

```
=== RESULTS ===

Framework detection:
  ✓ FestApp detected → follow SKILL.md pattern E
    editionId: "abc123..."

API patterns in JS:
  fetch('/api/schedule') in chunk-abc.js:234
  ... (cap at 20)

JSON responses captured:
  /api/programme         application/json  45.2KB  {"shows":[...
  /wp-json/wp/v2/posts  application/json   8.1KB  [{"id":123...

→ Likely data source: /api/programme (largest)
  scripts/.recon/example.com/network/api-programme.json

All files saved to: scripts/.recon/example.com/
```

**Main block** at bottom (top-level `await`):
```typescript
const url = process.argv[2];
if (!url) { console.error("Usage: node scripts/recon.ts <url>"); process.exit(1); }
try { new URL(url); } catch { console.error(`Invalid URL: ${url}`); process.exit(1); }
await runRecon(url);
```

Style notes: `node:` protocol on all built-in imports; `import.meta.dirname` (not `fileURLToPath`); no unnecessary comments; helpers go before `runRecon` which calls them.

### 4. SKILL.md changes

**Add Step 0** before the existing Step 1, and renumber existing steps 1–6 to 2–7:

````markdown
## 0. Run the recon script first

```
npm run recon <programmation-url>
```

This is mandatory before proceeding. The script launches a headless browser, navigates to the
URL, and captures every response (HTML, JS, JSON) to `scripts/.recon/<hostname>/`:

- `page.html` — the raw page HTML
- `scripts/` — same-origin JavaScript files loaded during page init
- `network/` — all JSON responses > 512 bytes (XHR, fetch, static JSON)

It then auto-detects the data source and prints:
- Which pattern (A–F) to follow, with confidence level
- Extracted config values (e.g. FestApp editionId)
- API call patterns found in the captured JavaScript

Requires `npx playwright install chromium` once (after `npm install`).

**Use the saved files for the rest of the process** — read from `scripts/.recon/<hostname>/`
instead of re-fetching the live site. The JSON responses in `network/` are especially useful:
inspect them to understand the data shape before writing the ingestion script.
````

**Remove the "Prefer pre-loading" sentence** from the existing Step 1 preamble (the recon script handles this now).

**Add Step 7 (dogfeed)** after the existing Step 6 (Verify):

```markdown
## 7. Update this skill

After the festival is successfully added, review what you learned:

1. **New pattern?** If the data source didn't match any of A–F, document it here with the
   same structure (detection signal, fetch approach, response shape, field mapping) and
   add a reference to the new festival script as an example.
2. **New edge case?** If you found a technique or quirk within an existing pattern that
   would have helped avoid a dead end, add a note under that section.
3. **Recon gap?** If the recon script missed a signal that would have identified the source
   faster, note what HTML/JS marker to add and update `detectFramework` in `scripts/recon.ts`.

This ensures each festival added makes future ones faster.
```

## Verification

1. `npm install` — installs `playwright`
2. `npx playwright install chromium` — downloads browser binary
3. `npm run recon https://www.feq.ca/fr/programmation` — should detect SvelteKit (pattern C); check `scripts/.recon/feq.ca/` for saved files
4. `npm run recon https://chansontadoussac.com/programmation-2026/` — should detect FestApp (pattern E) with editionId printed
5. `npm run recon https://lefestif.ca/programmation` — should detect Gatsby (pattern A) via intercepted `page-data.json` in `network/`
6. `npm run check` — TypeScript + formatting passes
