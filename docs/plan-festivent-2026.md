# Plan: Add Festivent 2026 Support

## Context

The app (Astro SSG) already supports FEQ 2026 and has a plan for Festif 2026. We want to add Festivent de Lévis 2026 (July 29 – August 2, 2026). Festivent is a WordPress site — the schedule is fully server-rendered in the HTML of `/programmation/`. The WordPress REST API has a custom `festivent/v1` namespace, but those endpoints are POST-only and serve user favorites/ICS export, not the full schedule. Individual event pages provide description text and YouTube embed IDs.

---

## Data Sources

- **Main schedule**: `https://festivent.ca/programmation/` (HTML)
  - 82 total events split into 3 types: `musicale` (18), `aerienne` (15), `familiale` (49)
  - We only include `musicale` events — the others are hot-air balloon rides and family activities
  - Data per card: artist name, genre tag, stage name, display time (already local EDT), image URL, slug
  - Day grouping: 5 carousel slides → dates `2026-07-29` through `2026-08-02`
  - No country/origin field. All musicale events are ticketed (paid).

- **Per-event pages**: `https://festivent.ca/programmation/{slug}/`
  - `<p>` paragraphs → artist bio/description (skip short boilerplate strings)
  - `youtube.com/embed/{id}` regex → YouTube video ID

---

## What's Not Available

| FEQ field | Festivent |
|-----------|-----------|
| `country` | Not present → no `filter-quebec` |
| `paid` (mixed) | All musicale events are paid → hardcode `paid: true` |
| Social links | Not in HTML at all → `links` will contain only YouTube if available |
| UTC times | Times are already local EDT display strings → **no conversion needed** |

Features array will be `[]` (no free filter useful, no Quebec filter possible).

---

## Field Mapping: HTML → Our Format

### `schedule.json` Row
| Our field | Source |
|-----------|--------|
| `date` | Carousel slide index 0–4 → `2026-07-29` … `2026-08-02` |
| `time` | `.c-timestamp` text — already local EDT |
| `venue` | `.c-card_subtitle` text |
| `paid` | `true` (hardcoded) |
| `artist` | `.c-card_title` text (HTML-unescape) |
| `country` | *(omitted)* |
| `genre` | `.c-card_tag` text |

### `artist-details.json` Entry
| Our field | Source |
|-----------|--------|
| `description` | `<p>` paragraphs from individual event page (skip paragraphs < 80 chars) |
| `imageUrl` | `.c-card_image` `src` from programmation page |
| `links` | YouTube embed ID → `{ label: "Vidéo officielle", url: "https://www.youtube.com/watch?v={id}" }` |

---

## HTML Parsing Strategy

The programmation page structure:
```
div[data-module-events]
  div.o-carousel_cell   ← slide 0 = 2026-07-29
    div.c-card[data-filters-item='{"type":"musicale"}']   ← include
    div.c-card[data-filters-item='{"type":"aerienne"}']   ← skip
  div.o-carousel_cell   ← slide 1 = 2026-07-30
    ...
```

Split HTML on `<div class="o-carousel_cell">` after the `data-module-events` marker, iterate with index → date. Within each cell, regex-parse only `musicale` cards.

The name field may contain HTML entities (`&rsquo;`, `&#038;`, `&nbsp;`) — HTML-unescape them.

---

## Implementation Steps

### 1. Create `scripts/festivals/festivent-2026.ts`

Export a single `run(): Promise<void>` function. Import shared helpers from `../update-schedule.ts` (`htmlToText`, `writeFestivalData`) and types from `../../src/types.ts`.

```
1. Fetch https://festivent.ca/programmation/
2. Locate data-module-events section in HTML
3. Split into day slides; map slide index 0–4 to dates 2026-07-29 … 2026-08-02
4. For each slide, regex-parse musicale cards:
   - Extract: name, genre, venue, time, imageUrl, slug
5. Fetch https://festivent.ca/programmation/{slug}/ for each slug in parallel (Promise.all)
6. For each individual page:
   - Extract description: join <p> text blocks > 80 chars (filters out boilerplate)
   - Extract YouTube ID: regex youtube\.com/embed/([a-zA-Z0-9_-]+)
7. Build Row[] and ArtistDetailsByName
8. Sort rows: date → venue → time
9. Call writeFestivalData(dataDir, rows, artistDetailsMap)
```

### 2. Register in `scripts/update.ts`

Add to the orchestrator:
```ts
import { run as runFestivент2026 } from "./festivals/festivent-2026.ts";
await runFestivент2026();
```

### 3. Add `festivent-2026` to `src/content/festivals.json`

```json
{
  "name": "Programmation Festivent 2026",
  "shortName": "Festivent 2026",
  "slug": "festivent-2026",
  "year": 2026,
  "region": "Lévis",
  "features": [],
  "dataDir": "festivent-2026",
  "sourceUrl": "https://festivent.ca/programmation/",
  "sourceLabel": "festivent.ca",
  "sourceAttribution": "Festivent de Lévis",
  "draft": true
}
```

---

## Critical Files to Modify

- `scripts/festivals/festivent-2026.ts` — **new file**
- `scripts/update.ts` — add import and `await runFestivent2026()`
- `src/content/festivals.json` — add festivent-2026 entry

## Files Referenced (read-only)

- `scripts/update-schedule.ts` — shared helpers to import
- `scripts/festivals/feq-2026.ts` — structural pattern to follow
- `src/types.ts` — Row, ArtistDetailEntry, ArtistLink types

---

## Verification

1. Run `npm run update` — should write 2 JSON files for festivent-2026, 18 rows
2. Check `schedule.json` — 18 rows, all `paid: true`, dates between 2026-07-29 and 2026-08-02
3. Check `artist-details.json` — 18 artists with `imageUrl`, most with `description` and `links`
4. Run `npm run check` to validate TypeScript and formatting
5. Run `npm run dev`, navigate to `/festivent-2026/` — schedule table renders
6. Click an artist row — dialog opens with image, bio, YouTube link
7. Set `draft: false` in festivals.json when satisfied
