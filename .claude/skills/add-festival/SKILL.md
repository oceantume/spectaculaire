---
description: Add a new festival by fetching its programmation page, writing an ingestion script in scripts/festivals/, and registering it in festivals.json.
---

# Add Festival

Festival programmation URL: $ARGUMENTS

Investigate the data source for this URL and write an ingestion script, then register the festival. Follow these steps in order.

## 0. Run the recon script first

```
npm run recon -- <url>
```

This is mandatory before proceeding. The script launches a headless browser, navigates to the URL, and captures every response (HTML, JS, JSON). Each URL gets its own isolated folder mirroring the URL path — `scripts/.recon/<hostname>/<path>/` — so it is safe to run multiple times on different pages without overwriting:

- `page.html` — the raw page HTML
- `scripts/` — same-origin JavaScript files loaded during page init
- `network/` — all JSON responses > 512 bytes (XHR, fetch, static JSON)

It then auto-detects the data source and prints:
- Which pattern (A–F) to follow, with confidence level
- Extracted config values (e.g. FestApp editionId)
- API call patterns found in the captured JavaScript

Requires `npx playwright install chromium` once (after `npm install`).

**Use the saved files for the rest of the process** — read from `scripts/.recon/<hostname>/<path>/` instead of re-fetching the live site. The JSON responses in `network/` are especially useful: inspect them to understand the data shape before writing the ingestion script.

If detail pages are needed (e.g. artist bios, individual show pages), run it again on a sample detail URL before writing the fetch loop — the results will be saved alongside without affecting the main page capture.

## 1. Reconnaissance — find the data source

This is fully dependent on the website. Below are real examples to help guide the process.

In any case, you should always prioritize finding the data-source from the programmation
page which will almost always provide a path to it. There are some exceptions like well-known
CMS platforms like below.

**A. Gatsby static JSON**
Fetch `{progUrl}` with the path replaced by the Gatsby page-data convention:
```
curl -sL "{siteOrigin}/page-data{pagePath}/page-data.json"
```
If it returns JSON with a `result.data` key, you have clean structured data. Typical shape:
- `allPrismicAppearances` / `allContentful*` for schedule entries
- `allPrismicArtists` / `allPrismicStages` for supporting data
- Individual artist details at `{siteOrigin}/page-data/artistes/{slug}/page-data.json` — run `npm run recon -- {siteOrigin}/page-data/artistes/{any-slug}/page-data.json` to capture a sample and inspect the JSON shape before writing the artist detail loop

**B. Next.js embedded JSON**
Fetch the page HTML and look for:
```
<script id="__NEXT_DATA__" type="application/json">
```
Parse its content with `JSON.parse`. Full page data is in `props.pageProps`. Individual pages carry their own `__NEXT_DATA__`.

**C. SvelteKit / Nuxt / other SSR hydration**
Fetch the page HTML and search for:
- `const data = [` (SvelteKit — large inline array)
- `window.__NUXT__` or `__NUXT__=` (Nuxt)
The value is a JS object literal, not JSON. Use bracket-counting to extract the full literal, then evaluate with `vm.runInNewContext` (see `scripts/utils.ts` for the pattern).

**D. WordPress REST API**
Fetch `{siteOrigin}/wp-json/` and inspect:
- `namespaces` — look for a custom namespace (e.g. `myfest/v1`)
- `routes` — check if custom routes exist and their allowed HTTP methods
- Fetch `{siteOrigin}/wp-json/wp/v2/types` to find custom post types exposed via REST

Caution: POST-only custom endpoints often serve user-favorites or ICS export features, not the full schedule. Verify by trying an empty POST body. If the response is an empty list or HTML, the REST API is not the data source — fall through to HTML.

Caution: Custom post types exposed via `wp/v2/types` may lack scheduling data (date, time, venue) — those fields are often only in the rendered HTML. If the REST endpoints return only post metadata and taxonomy IDs, fall through to HTML parsing (pattern F).

**Hybrid: JetEngine/Elementor custom post type + taxonomy terms, with time/bio only in HTML.** Some WordPress + Elementor + JetEngine sites expose a custom post type (e.g. `artistes`) with useful taxonomies but no date/time meta in REST. Detection: `wp/v2/types` shows a custom type whose taxonomies include something like `date` (terms are full display strings like `"Vendredi 7 août 2026"`, not ISO dates) plus a `provenance`/origin taxonomy. Approach:
- Fetch `wp/v2/{taxonomy}?per_page=100` for the `date` and `provenance`(-equivalent) taxonomies to build id→name maps once.
- Fetch `wp/v2/{cpt}?per_page=100&{edition_taxonomy}={term_id}` filtered to the current edition/year term — gives artist name, slug, and taxonomy term-id arrays (date, country) directly, no need to guess post IDs from the listing page.
- Parse the date term name with a small French month-name map (`janvier`→`01` … `décembre`→`12`) via regex `(\d{1,2})\s+([a-zûé]+)\s+(\d{4})`.
- **Time is often missing from REST entirely** — it's rendered as a bare `<h2>` heading on the artist's own detail page (Elementor `heading` widget), right after a `jet-listing-dynamic-terms` widget showing the date term. Fetch each detail page and grab the first/only `h2.elementor-heading-title`.
- **Bio is also missing from REST** (JetEngine CPTs commonly don't expose `content`) — scrape the `elementor-widget-text-editor` widget(s) on the detail page instead. Elementor reuses the same widget `data-id` across every post built from one template, so a shared site-wide block (e.g. a footer copyright text-editor widget) can show up as a false match — filter it out by its known text rather than relying on selector position.
- Image: prefer the `og:image` meta tag on the detail page over trying to resolve `featured_media` through another REST call — it's already the full-size URL.
- Band-level social links are usually absent (only the festival's own Facebook/Instagram appear in the HTML) — leave `links: []` rather than accidentally attaching the festival's own accounts.
- Reference implementation: `scripts/festivals/rock-la-cauze-2026.ts`.

**E. FestApp widget (Convex backend)**
Search the page source for `festapp` or `api.sync.festapp.io`. If found, the schedule is served by a Convex backend and this approach gives full structured data including dates, times, venues, paid/free, bios, images, and links.

**Find the edition ID:** Search the page HTML for `editionId` or a 32-character alphanumeric string near the widget initializer. Also look for `data-festapp-edition` attributes on widget container elements.

**API endpoint:** `POST https://api.sync.festapp.io/api/query`

**Fetch the schedule:**
```json
{ "path": "queries/widget:schedules", "args": { "editionId": "<id>" }, "format": "json" }
```
Response shape: `{ "status": "success", "value": [...] }`. Each item has:
- `artist._id`, `artist.name`
- `place.localized_fields[]` — venue name via `getLocalizedValue(fields, "name", "fr")`
- `start_date` (YYYY-MM-DD), `start_time` (HH:MM) — already local time, no UTC conversion needed
- `categories[]` with `localized_fields[]` — paid detection: `catNames.some(n => /passeport|billet/i.test(n))`; skip non-show items whose category name matches `"activités"`

**Fetch artist details** (one per unique `artist._id`, add 100ms delay between requests):
```json
{ "path": "queries/widget:artist", "args": { "editionId": "<id>", "artistId": "<id>" }, "format": "json" }
```
Returns: `image.url`, `links[]` (bare URLs — apply `inferLinkLabel()`), `localized_fields[]` containing `biography` (HTML — apply `htmlToText()`).

**Note on genre:** FestApp does not expose genre data. Use the `"no-genre"` feature flag in `festivals.json` to hide the genre column.

**Reference implementation:** `scripts/festivals/chanson-tadoussac-2026.ts`

**G. Evenko/Algolia search API**
The site proxies Algolia through its own backend. Detection signal: recon captures a response to `/api/algolia/search?query=<base64>` where the decoded JSON contains an `indexName` like `master_festival_Franco_fr-CA`.

**Detect:** Look for `/api/algolia/search` in the network captures. The site is typically Next.js App Router (turbopack JS filenames, no `__NEXT_DATA__`). Artist detail pages return 404 when fetched without JS — do not attempt to scrape them.

**Decode the captured query** to understand the exact `indexName` and filter structure:
```ts
Buffer.from(encodedQueryParam, "base64").toString("utf8")
```

**Replicate the request** in the ingestion script — base64-encode the full query JSON and pass it as `?query=`:
```ts
const query = {
  filters: { type: ["evenko_show", "show"], announced: true, /* all other filters empty */ },
  options: { hitsPerPage: 1000, page: 0 },
  indexName: "master_festival_Franco_fr-CA",
};
const encoded = Buffer.from(JSON.stringify(query)).toString("base64");
const url = `https://{site}/api/algolia/search?query=${encoded}`;
```

**Filter to shows only:** `h.entity_type === "show" || h.entity_type === "evenko_show"` (the response may include genres, locations, series).

**Response shape per hit:**
- `event_name` — artist name (use as-is, including collaborations like "ISHA & Limsa d'Aulnay")
- `show_time` — Unix timestamp **in UTC** → convert with `toEDT()` after `new Date(ts * 1000).toISOString()`
- `free` — boolean, reliable
- `venues.name` — venue name
- `genre[0].name` — first genre (available and accurate)
- `thumbnail` — protocol-relative URL (`//images.ctfassets.net/...`) → prepend `https:`
- `headliners[0].youtube` — YouTube embed URL (`https://www.youtube.com/embed/{id}`) → convert to watch URL by extracting the video ID after `/embed/`
- `headliners[0].spotify` — full Spotify artist URL

**YouTube embed → watch URL:**
```ts
function youtubeEmbedToWatch(embedUrl: string): string {
  const videoId = embedUrl.split("/embed/")[1]?.split("?")[0];
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : embedUrl;
}
```

**Artist bios:** Not available from the Algolia API. The site's artist detail pages require JavaScript (Next.js App Router SSR), so they cannot be fetched with a plain HTTP client. Skip descriptions.

**Country:** Not in the Algolia data. Omit `filter-quebec` unless you add a `field-overrides.json` with manual country entries.

**Reference implementation:** `scripts/festivals/francos-2026.ts`

**H. Vue.js SPA with custom JSON REST API**
Detection signal: `chunk-vendors.*.js` and `app.*.js` in the recon JS captures (Vue CLI SPA). All data is served from a custom REST API captured in `network/` by recon — no JS execution needed.

**Detect:** Recon auto-labels the largest JSON response as "Likely data source". Confirm by inspecting the URL — typically `/api/{resource}.json`.

**Fetch:** Plain `fetch()` on the API URL. Inspect the JSON shape in the recon `network/` folder and map fields accordingly.

**Reference implementation:** `scripts/festivals/cigale-2026.ts`

**F. HTML parsing (last resort)**
The schedule is server-rendered in the page HTML (typically 200–400 KB). Look for:
- A repeating card/block element (e.g. `c-card`, `data-grid="item"`, `data-filters-item`)
- `data-module-save="{id}"` — the WordPress post ID, useful for deduplication
- Name in `.c-card_title` or `<h2>` inside the card
- Genre/tag in `.c-tag` or `.c-card_tag`
- Time in `.c-timestamp` or `<time>`
- Venue in `.c-card_subtitle`
- Detail page URL in the card's `<a href>`

Fall back to inference from context plus repetitive content and styling if nothing else works.

Before writing the detail-page fetch loop, run recon on one sample detail page URL to get a local copy of the HTML:

```
npm run recon -- <one-detail-page-url>
```

This saves to `scripts/.recon/<hostname>/<detail-path>/page.html`. Inspect the selectors there, then write the fetch loop with a 200ms throttle between requests:

```typescript
await new Promise((r) => setTimeout(r, 200));
const res = await fetch(detailUrl);
```

Fetch each detail page for description, full image, and social links.
Use `node-html-parser` for parsing (already a devDependency).

**Date in a parent container:** Some sites render items flat inside a day wrapper (e.g. `<div class="day"><h3>25 juin</h3>...<div class="item">`) where the date is on the ancestor, not inside the item. A date field inside the item may show the server's current date rather than the show date — always verify against what's rendered visually. Parse the date from the nearest ancestor that holds it.

**Paid/free on detail pages:** When paid/free isn't in the listing HTML, check detail pages for a ticketing button whose text is "Billets" (paid) vs "Gratuit" (free). This is worth fetching since you're already getting bios and links. Also check venue/scene sub-pages — they sometimes state "gratuits à HH h et payants à HH h" for mixed-access stages.

**G. Image-only schedule (no structured data)**
Detection signal: the page HTML contains only `<img>` tags pointing to schedule PNG files with no repeating artist elements or API calls in the network captures.

Download the images and use the `Read` tool — Claude can extract text from them directly. Hardcode the extracted data as a static array in the ingestion script (no fetch calls). Note that the data won't auto-update; the hardcoded array must be edited manually if the festival publishes a revised schedule image.

**Reference implementation:** `scripts/festivals/festival-generations-2026.ts`

## 2. Extract and map fields

| Target field | Look for |
|---|---|
| `artist` | name / title / performer |
| `date` | start date — convert UTC → local (EDT = UTC-4) |
| `time` | start time → 24h `HH:MM` in local time |
| `venue` | stage / scene / scène / location |
| `paid` | `!free` boolean, or ticketed/payant flag |
| `country` | origin / from / pays / provenance |
| `genre` | genre / style / category / tag — **optional**, omit if unavailable |
| `description` | bio / description — strip HTML, `<p>` → `\n\n` |
| `imageUrl` | main image — use base URL, strip resize params |
| `links` | social links array |

**Three fields to look hard for — don't skip them:**
- **`paid`** — check detail pages, venue descriptions, or ticketing pages before giving up. Don't default to `true` without trying.
- **`imageUrl`** — prefer artist portrait over event poster; check detail pages if listing only has thumbnails.
- **YouTube link** — powers the in-app player. Check for embed URLs, watch URLs, or bare video IDs and convert as needed with `youtubeEmbedToWatch()`.

**Genre not available?** Omit the `genre` field from rows (it is optional in `Row`). Add `"no-genre"` to the festival's `features` array in `festivals.json` to hide the genre column in the UI.

**Paid/free not determinable from the source?** Default `paid: true`. Look harder before giving up: check for per-venue or per-show free-entry markers in the HTML (e.g. "Entrée gratuite", "gratuit", "free"), inspect the festival's ticketing page, or look at venue descriptions — outdoor main stages are usually paid while bar/side-stage venues are often free. If all shows are definitively paid (no free tier at all), use `"all-paid"` instead of `"filter-free"` — this hides the paid/free column entirely. If all shows are definitively free (e.g. a Fête de la Musique-style event), use `"all-free"` — same effect, better semantics. Use `field-overrides.json` to hard-code `paid` for individual artists when the source is ambiguous.

## 3. Social link label inference

Use `inferLinkLabel(url)` from `scripts/utils.ts` — do not re-implement it per script. It handles:
- `facebook.com`, `fb.com` → "Facebook"
- `instagram.com` → "Instagram"
- `tiktok.com` → "TikTok"
- `spotify.com` → "Spotify"
- `youtube.com`, `youtu.be` → "YouTube"
- `apple.com` (covers `music.apple.com`, `itunes.apple.com`) → "Apple Music"
- `tidal.com` → "Tidal"
- `deezer.com` → "Deezer"
- `bandcamp.com` → "Bandcamp"
- `soundcloud.com` → "SoundCloud"
- `mixcloud.com` → "Mixcloud"
- `linktr.ee` → "Linktree"
- `wikipedia.org` → "Wikipedia"
- anything else → "Site officiel"

YouTube IDs (bare string, no URL): prepend `https://www.youtube.com/watch?v=`. Label as "Vidéo officielle".

## 4. Write the ingestion script

Create `scripts/festivals/{slug}.ts`. It must export a single async function:

```ts
export async function run(): Promise<void> { ... }
```

Start the file with:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, localDateStr, localTimeStr, toEDT, writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/data/festivals/{slug}");
```

Inside `run()`:
- Fetch and parse the data source
- Build `Row[]` and `Record<string, ArtistDetailEntry>`
- Sort rows: `date` → paid-first → venue order → `time`
- Call `writeFestivalData(dataDir, rows, artistDetailsMap)` to write both JSON files
- For artists appearing multiple times: each appearance is its own row; `artist-details` entry written once

Consider country normalization: "Montréal" → "Québec"; other Quebec cities → "Québec" to support
the Quebec filtering features.

**Country data not available in the source?** Create `src/data/festivals/{slug}/field-overrides.json`:

```json
{
  "Artist Name": { "country": "Québec" },
  "Another Artist": { "country": "États-Unis" }
}
```

Keys are matched case-insensitively at runtime. Use this for any `Row` field the ingestion script can't reliably extract.

Then register it in `scripts/update.ts` by adding an import and an entry to the `festivals` array. Set `lastUpdateDate` to the festival's final day — updates are skipped automatically after that date:

```ts
import { run as runMyFestival } from "./festivals/{slug}.ts";

// in the festivals array:
{ slug: "{slug}", run: runMyFestival, lastUpdateDate: "YYYY-MM-DD" },
```

The single npm script `"update": "node scripts/update.ts"` in `package.json` runs the orchestrator — no new npm scripts needed. During development you can pass a slug to run only that festival: `npm run update -- {slug}`.

## 5. Register the festival

Add to `src/content/festivals.json`:
```json
{
  "name": "Programmation {Festival Name} {year}",
  "shortName": "{Festival} {year}",
  "slug": "{festival-slug}",
  "year": 2026,
  "region": "{city or region name}",
  "features": [],
  "dataDir": "{festival-slug}",
  "sourceUrl": "{programmation page URL}",
  "sourceLabel": "{domain without https://}",
  "sourceAttribution": "{Official festival full name}",
  "draft": true,
  "startDate": "{YYYY-MM-DD}",
  "endDate": "{YYYY-MM-DD}"
}
```

`startDate`/`endDate` drive sorting and the active/upcoming/past grouping in the nav festival picker. Source them from the festival's officially announced dates (the programmation page usually states them) — don't derive from `schedule.json`, which may still be sparse or empty for a fresh draft. If the schedule later reveals a wider date range (e.g. satellite/pre-events), update these fields to match the actual min/max show dates once known.

Add `"all-paid"` to `features` if every show is paid (hides the paid/gratuit column entirely).
Add `"all-free"` to `features` if every show is free (hides the paid/gratuit column entirely).
Add `"filter-free"` to `features` if free/paid data is available and some shows are free.
Add `"filter-quebec"` to `features` if country/origin data is available.
Add `"no-genre"` to `features` if genre data is unavailable (hides the genre column).

## 6. Verify

1. `npm run update -- {slug}` — check row count, no errors
2. Spot-check 3–5 rows in `schedule.json` for correct date, time, venue, paid flag
3. Spot-check `artist-details.json` for description, imageUrl, links
4. `npm run check` — TypeScript + formatting
5. `npm run dev` → open `/{slug}/` — confirm table renders and is populated
6. Click an artist row — confirm dialog shows image, bio, links
7. If `filter-quebec` enabled: test "Québécois" filter
8. If `filter-free` enabled: test "Gratuit" filter
9. Set `draft: false` when satisfied

## 7. Update this skill

After the festival is successfully added, review what you learned:

1. **New pattern?** If the data source didn't match any of A–F, document it here with the same structure (detection signal, fetch approach, response shape, field mapping) and add a reference to the new festival script as an example.
2. **New edge case?** If you found a technique or quirk within an existing pattern that would have helped avoid a dead end, add a note under that section.
3. **Recon gap?** If the recon script missed a signal that would have identified the source faster, note what HTML/JS marker to add and update `detectFramework` in `scripts/recon.ts`.

This ensures each festival added makes future ones faster.
