# Plan: Add Festif 2026 Support

## Context

The app (Astro SSG) currently supports FEQ 2026. We want to add Le Festif! de Baie-Saint-Paul 2026. The Festif site is a Gatsby + Prismic CMS app that exposes all schedule data as static JSON at predictable Gatsby page-data URLs — no scraping needed.

---

## Data Sources

- **Schedule & artist list**: `https://lefestif.ca/page-data/programmation/page-data.json`
  - 184 appearances, 3 Prismic collections: `allPrismicArtists`, `allPrismicStages`, `allPrismicAppearances`
  - Each appearance has: artist name+image, event start/end time (UTC), stage name, `free` flag, `is_show`, `hidefromprog`
  - **Missing from this endpoint**: genre, country, description, social links

- **Per-artist details**: `https://lefestif.ca/page-data/artistes/{slug}/page-data.json`
  - `data.style.text` → genre (free-form, e.g. "Folk-rock québécois")
  - `data.from.text` → country (e.g. "Québec", "Montréal", "France")
  - `data.description.text` → bio
  - `data.youtube_ids.text` → YouTube video ID (prepend `https://www.youtube.com/watch?v=`)
  - `data.socialmedias_csv.text` → comma-separated URLs, no labels
  - `data.appearances.data.allPrismicAppearances.edges` → individual artist times within multi-artist events

---

## Design Decisions

- **Genre**: use `style.text` as-is
- **Country**: use `from.text`; "Montréal" → "Québec"; enable `filter-quebec`
- **Social links**: infer label from domain (facebook.com → "Facebook", instagram.com → "Instagram", spotify.com → "Spotify", youtube.com → "YouTube", apple.com → "Apple Music", tiktok.com → "TikTok", bandcamp.com → "Bandcamp", else "Site officiel")
- **Multi-artist events**: one row per artist using the per-artist appearance time from the individual artist page (not the event-level time)
- **Filtering**: skip entries where `hidefromprog: true` or `is_show: false`

---

## Field Mapping: Prismic → Our Format

### `schedule.json` Row
| Our field | Source |
|-----------|--------|
| `date` | `event.data.start_time` → convert UTC to EDT (UTC-4) → date portion |
| `time` | Per-artist `time` from artist page appearances (UTC ISO) → EDT |
| `venue` | `event.data.stage.document.data.title.text` |
| `paid` | `!event.data.free` |
| `artist` | `artist.document.data.title.text` |
| `country` | `artist-page.data.from.text` ("Montréal" → "Québec") |
| `genre` | `artist-page.data.style.text` |

### `artist-details.json` Entry
| Our field | Source |
|-----------|--------|
| `description` | `artist-page.data.description.text` |
| `imageUrl` | `artist.document.data.main_image.url` (fallback: `artist-page.data.main_image.url`) — use the base URL without Prismic params |
| `links` | Parsed from `socialmedias_csv` + YouTube ID (label: "Vidéo officielle") |

---

## Implementation Steps

### 1. Create `scripts/festivals/festif-2026.ts`

Export a single `run(): Promise<void>` function. Import shared helpers from `../update-schedule.ts` (`toEDT`, `localDateStr`, `localTimeStr`, `htmlToText`, `writeFestivalData`) and types from `../../src/types.ts`.

```
1. Fetch /page-data/programmation/page-data.json
2. Extract appearances from allPrismicAppearances.group (flatten groups)
3. Filter: skip hidefromprog=true, is_show=false
4. Collect unique artist slugs
5. Fetch /page-data/artistes/{slug}/page-data.json for each slug (parallel with Promise.all)
6. For each artist:
   - Get their per-show time from artist-page.appearances (per-artist time, not event time)
   - Build Row using per-artist time → EDT conversion
   - Build ArtistDetailEntry from style, from, description, youtube_ids, socialmedias_csv
7. Sort rows: date → paid-first → venue → time
8. Call writeFestivalData(dataDir, rows, artistDetailsMap)
```

Key helper: `inferLinkLabel(url: string): string` — maps domain to label.

Key note: artists may appear in multiple events (e.g., an artist performing twice). Each appearance becomes its own row. The artist-details entry is written once (last write wins, which is fine since details are per-artist not per-show).

### 2. Register in `scripts/update.ts`

Add to the orchestrator:
```ts
import { run as runFestif2026 } from "./festivals/festif-2026.ts";
await runFestif2026();
```

### 3. Add `festif-2026` to `src/content/festivals.json`

```json
{
  "name": "Programmation Festif 2026",
  "shortName": "Festif 2026",
  "slug": "festif-2026",
  "year": 2026,
  "region": "Charlevoix",
  "features": ["filter-free", "filter-quebec"],
  "dataDir": "festif-2026",
  "sourceUrl": "https://lefestif.ca/programmation",
  "sourceLabel": "lefestif.ca",
  "sourceAttribution": "Le Festif! de Baie-Saint-Paul",
  "draft": true
}
```

Start as `draft: true` so it's only visible in dev.

### 4. Create data directory

`src/content/festivals/festif-2026/` — created by the script on first run.

---

## Critical Files to Modify

- `scripts/festivals/festif-2026.ts` — **new file**
- `scripts/update.ts` — add import and `await runFestif2026()`
- `src/content/festivals.json` — add festif-2026 entry

## Files Referenced (read-only)

- `scripts/update-schedule.ts` — shared helpers to import
- `scripts/festivals/feq-2026.ts` — structural pattern to follow
- `src/types.ts` — Row, ArtistDetailEntry, ArtistLink types

---

## Verification

1. Run `npm run update` — should print progress and write two JSON files for festif-2026
2. Check `src/content/festivals/festif-2026/schedule.json` — should have ~100+ rows with date, time, venue, paid, artist, country, genre
3. Check `src/content/festivals/festif-2026/artist-details.json` — should have matching artist keys with description/imageUrl/links
4. Run `npm run check` to validate TypeScript and formatting
5. Run `npm run dev` and navigate to `/festif-2026/` — verify schedule table renders, artist dialog opens with image, bio, links
6. Test Quebec filter — clicking "Québécois" should filter to artists whose country is "Québec"
7. Test free filter — clicking "Gratuit" should show only free shows
8. Set `draft: false` in festivals.json when satisfied
