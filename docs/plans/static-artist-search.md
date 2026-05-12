# Plan: Static Cross-Festival Artist Search

## Context

Users want to find shows by artist name across all festivals without a server. The solution is fully static: row `id` attributes added at build time, a generated `search-index.json` endpoint, and a client-side `/search` page that filters the index and links directly to the right row.

---

## Step 1 — Add `id` attributes to table rows

**File:** `src/components/ScheduleTable.astro` (line 82)

Add `id={`row-${row.date}-${idx}`}` to the `<tr data-row ...>` element. The `idx` here is already the within-day-group index from `rows.map((row, idx) => ...)`, making IDs unique per page in the format `row-2026-07-09-3`.

Also add `scroll-margin-top: 2rem` to `.sched-row` in the `<style>` block so fragment navigation doesn't hide the row under the sticky headers.

---

## Step 2 — Generate `search-index.json`

**New file:** `src/pages/search-index.json.ts`

Single static GET endpoint (no `getStaticPaths`). Replicates the override logic from `src/pages/[festival]/index.astro` exactly so artist names and venues match what the page displays.

```ts
import type { APIRoute } from "astro";
import festivalData from "../content/festivals.json";
import type { Festival, Row } from "../types";

type SearchEntry = {
  artist: string;
  normalizedArtist: string;
  festivalSlug: string;
  festivalName: string;
  date: string;
  time: string;
  venue: string;
  rowId: string;
};

const scheduleModules = import.meta.glob<{ default: Row[] }>(
  "../content/festivals/*/schedule.json", { eager: true }
);
const overrideModules = import.meta.glob<{ default: Record<string, Partial<Row>> }>(
  "../content/festivals/*/field-overrides.json", { eager: true }
);
const venueOverrideModules = import.meta.glob<{ default: Record<string, string> }>(
  "../content/festivals/*/venue-overrides.json", { eager: true }
);

function normalize(str: string): string {
  return str.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export const GET: APIRoute = () => {
  const festivals = (import.meta.env.DEV
    ? festivalData
    : festivalData.filter((f) => !f.draft)) as Festival[];

  const entries: SearchEntry[] = [];

  for (const festival of festivals) {
    const scheduleKey = Object.keys(scheduleModules).find((k) => k.includes(`/${festival.dataDir}/`));
    const overridesKey = Object.keys(overrideModules).find((k) => k.includes(`/${festival.dataDir}/`));
    const venueKey = Object.keys(venueOverrideModules).find((k) => k.includes(`/${festival.dataDir}/`));

    const rawRows: Row[] = scheduleKey ? scheduleModules[scheduleKey].default : [];
    const fieldOverrides = overridesKey ? overrideModules[overridesKey].default : {};
    const venueOverrides = venueKey ? venueOverrideModules[venueKey].default : {};
    const overridesByLower = Object.fromEntries(
      Object.entries(fieldOverrides).map(([k, v]) => [k.toLowerCase(), v])
    );

    // Group by date — mirrors index.astro exactly so idx matches the rendered row id
    const grouped = new Map<string, Row[]>();
    for (const row of rawRows) {
      const group = grouped.get(row.date);
      if (group) group.push(row);
      else grouped.set(row.date, [row]);
    }

    for (const [, dayRows] of grouped.entries()) {
      dayRows.forEach((rawRow, idx) => {
        const override = overridesByLower[rawRow.artist.toLowerCase()];
        const resolvedVenue = venueOverrides[rawRow.venue] ?? rawRow.venue;
        const row = override ? { ...rawRow, venue: resolvedVenue, ...override } : { ...rawRow, venue: resolvedVenue };
        entries.push({
          artist: row.artist,
          normalizedArtist: normalize(row.artist),
          festivalSlug: festival.slug,
          festivalName: festival.name,
          date: row.date,
          time: row.time,
          venue: row.venue,
          rowId: `row-${row.date}-${idx}`,
        });
      });
    }
  }

  return new Response(JSON.stringify(entries), {
    headers: { "Content-Type": "application/json" },
  });
};
```

---

## Step 3 — Search page + client script

**New file:** `src/pages/search.astro`

Static page using `Base` layout. Does not use `PageNav` (which requires a `festival` prop). A simple back link suffices.

Structure:
- `<a href="/">← Festivals</a>` back link in a header
- `<input type="search" id="search-input" autofocus>`
- `<p id="search-status" aria-live="polite">` for result count / empty state
- `<ul id="search-results">` for results

**New file:** `src/scripts/artist-search.ts`

- Fetch `/search-index.json` immediately on page load (eager, not lazy — index is small)
- On input (debounced 150ms): normalize query with same `NFD` + diacritic strip, filter by `normalizedArtist.includes(q)`
- Wait for ≥1 character before showing results
- Each result is an `<li>` with an `<a href="/{festivalSlug}/#{rowId}">` showing artist name, festival name, date, venue
- `escapeHtml()` for any interpolated strings (reuse pattern from `artist-dialog.ts`)
- Format date in French with `toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "long" })`

---

## Step 4 — Search icon in nav bar

**File:** `src/components/PageNav.astro`

The `.nav-bar` currently has `justify-content: space-between` with the festival trigger on the left and theme button on the right. Wrap the theme button and a new search link in a `<div class="nav-right">` (flex, align-center, gap) so both icons appear together on the right.

Search link:
```astro
<a href="/search/" class="search-btn" aria-label="Rechercher un artiste">
  <!-- magnifying glass SVG, 20×20, same stroke style as other icons -->
</a>
```

Style `.search-btn` to match `.theme-btn` visually (same padding, border-radius, color, hover).

---

## Verification

1. `npm run build` — confirm `search-index.json` appears in `dist/` and no type errors
2. `npm run preview` — open `/feq-2026/`, right-click a row → "Inspect", confirm `id="row-2026-07-09-N"` attributes present
3. Navigate to `/search/`, type an artist name → results appear with correct links
4. Click a result → browser scrolls to the correct row on the festival page (row not hidden under sticky header)
5. `npm run check` — formatting and type check pass
