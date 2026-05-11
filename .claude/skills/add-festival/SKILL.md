---
description: Add a new festival by fetching its programmation page, writing an ingestion script in scripts/festivals/, and registering it in festivals.json.
---

# Add Festival

Festival programmation URL: $ARGUMENTS

Investigate the data source for this URL and write an ingestion script, then register the festival. Follow these steps in order.

## 1. Reconnaissance — find the data source

Try each approach in order, stop at the first that works.

**A. Gatsby static JSON**
Fetch `{progUrl}` with the path replaced by the Gatsby page-data convention:
```
curl -sL "{siteOrigin}/page-data{pagePath}/page-data.json"
```
If it returns JSON with a `result.data` key, you have clean structured data. Typical shape:
- `allPrismicAppearances` / `allContentful*` for schedule entries
- `allPrismicArtists` / `allPrismicStages` for supporting data
- Individual artist details at `{siteOrigin}/page-data/artistes/{slug}/page-data.json`

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

**F. HTML parsing (last resort)**
The schedule is server-rendered in the page HTML (typically 200–400 KB). Look for:
- A repeating card/block element (e.g. `c-card`, `data-grid="item"`, `data-filters-item`)
- `data-module-save="{id}"` — the WordPress post ID, useful for deduplication
- Name in `.c-card_title` or `<h2>` inside the card
- Genre/tag in `.c-tag` or `.c-card_tag`
- Time in `.c-timestamp` or `<time>`
- Venue in `.c-card_subtitle`
- Detail page URL in the card's `<a href>`

Fetch each detail page for description, full image, and social links.
Use `node-html-parser` for parsing (already a devDependency).

## 2. Extract and map fields

| Target field | Look for |
|---|---|
| `artist` | name / title / performer |
| `date` | start date — convert UTC → local (EDT = UTC-4) |
| `time` | start time → 24h `HH:MM` in local time |
| `venue` | stage / scene / scène / location |
| `paid` | `!free` boolean, or ticketed/payant flag |
| `country` | origin / from / pays / provenance |
| `genre` | genre / style / category / tag |
| `description` | bio / description — strip HTML, `<p>` → `\n\n` |
| `imageUrl` | main image — use base URL, strip resize params |
| `links` | social links array |

Country normalization: "Montréal" → "Québec"; other Quebec cities → "Québec" if appropriate.

## 3. Social link label inference

When links are bare URLs with no labels:
- `facebook.com` → "Facebook"
- `instagram.com` → "Instagram"
- `tiktok.com` → "TikTok"
- `spotify.com` → "Spotify"
- `youtube.com` → "YouTube"
- `bandcamp.com` → "Bandcamp"
- `music.apple.com` → "Apple Music"
- `soundcloud.com` → "SoundCloud"
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
const dataDir = path.join(__dirname, "../../src/content/festivals/{slug}");
```

Inside `run()`:
- Fetch and parse the data source
- Build `Row[]` and `Record<string, ArtistDetailEntry>`
- Sort rows: `date` → paid-first → venue order → `time`
- Call `writeFestivalData(dataDir, rows, artistDetailsMap)` to write both JSON files
- For artists appearing multiple times: each appearance is its own row; `artist-details` entry written once

**Country data not available in the source?** Create `src/content/festivals/{slug}/field-overrides.json`:

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

The single npm script `"update": "node scripts/update.ts"` in `package.json` runs the orchestrator — no new npm scripts needed.

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
  "draft": true
}
```

Add `"all-paid"` to `features` if every show is paid (hides the paid/gratuit column entirely).
Add `"filter-free"` to `features` if free/paid data is available.
Add `"filter-quebec"` to `features` if country/origin data is available.

## 6. Verify

1. `npm run update` — check row count, no errors
2. Spot-check 3–5 rows in `schedule.json` for correct date, time, venue, paid flag
3. Spot-check `artist-details.json` for description, imageUrl, links
4. `npm run check` — TypeScript + formatting
5. `npm run dev` → open `/{slug}/` — confirm table renders and is populated
6. Click an artist row — confirm dialog shows image, bio, links
7. If `filter-quebec` enabled: test "Québécois" filter
8. If `filter-free` enabled: test "Gratuit" filter
9. Set `draft: false` when satisfied
