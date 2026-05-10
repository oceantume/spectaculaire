# Migration: Preact+Vite SPA to Astro + Vanilla TypeScript

## Context

The site currently supports one festival (FEQ) as a Preact SPA. We're migrating to Astro with vanilla TS to:
1. Support multiple festivals with per-festival data and URL routes (e.g. `/feq-2026/`, `/test-festival/`)
2. Render schedule tables as static HTML (no JS needed to view content)
3. Eliminate the framework runtime — interactive features (filters, sort, artist dialog) become vanilla TS progressive enhancements
4. Drop the PWA for now

Root `/` redirects to the primary festival. A `test-festival` with dummy data is included but hidden in production via `draft: true`.

---

## New File Structure

```
spectaculaire/
  astro.config.mjs                    # NEW (replaces vite.config.ts)
  biome.json                          # UPDATED
  tsconfig.json                       # UPDATED
  package.json                        # UPDATED
  .gitignore                          # UPDATED (add .astro/)
  nginx.conf                          # UPDATED (remove SPA fallback)
  Dockerfile                          # UNCHANGED
  fly.toml                            # UNCHANGED
  public/                             # UNCHANGED
  scripts/
    update-schedule.ts                # UPDATED (new output paths + type import)
    generate-icons.ts                 # UNCHANGED
  src/
    index.css                         # UPDATED (comment tweak)
    types.ts                          # NEW (extracted from data.ts)
    content/
      festivals.json                  # NEW (all festival metadata)
      festivals/
        feq-2026/
          schedule.json               # MOVED from assets/
          artist-details.json         # MOVED from assets/
          youtube-overrides.json      # MOVED from assets/
        test-festival/
          schedule.json               # NEW (dummy data, 5 rows)
          artist-details.json         # NEW (dummy data)
    layouts/
      Base.astro                      # NEW (replaces index.html)
    pages/
      index.astro                     # NEW (redirect to primary festival)
      [festival].astro                # NEW (dynamic route per festival)
    components/
      PageNav.astro                   # NEW (replaces PageNav.tsx)
      ScheduleTable.astro             # NEW (replaces ScheduleTable.tsx)
      ArtistDialog.astro              # NEW (replaces ArtistDialog.tsx)
    scripts/
      stored-state.ts                 # NEW (replaces useStoredState.ts)
      theme.ts                        # NEW (dark mode toggle)
      nav-dropdown.ts                 # NEW (festival dropdown)
      schedule-filter.ts              # NEW (filter + sort logic)
      artist-dialog.ts               # NEW (dialog populate/navigate/video)
      youtube.ts                      # NEW (YouTube URL parsing, extracted from ArtistDialog.tsx)

DELETE: src/App.tsx, src/main.tsx, src/ScheduleTable.tsx, src/ArtistDialog.tsx,
        src/PageNav.tsx, src/useStoredState.ts, src/data.ts, src/vite-env.d.ts,
        index.html, vite.config.ts, assets/ directory
```

---

## Implementation Steps

### Step 1: Install Astro, create config, update tooling

**astro.config.mjs** — Astro with Tailwind v4 via the Vite plugin:
```js
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
});
```

**package.json** changes:
- Remove: `preact`, `@preact/preset-vite`, `vite`, `vite-plugin-pwa`
- Add: `astro`
- Keep: `@tailwindcss/vite`, `tailwindcss`, `@biomejs/biome`, `typescript`, `@typescript/native-preview`, `husky`, `@resvg/resvg-js`, `@types/node`
- Scripts: `dev` → `astro dev`, `build` → `astro build`, `preview` → `astro preview`. Others unchanged.

**tsconfig.json** — Remove `jsx` and `jsxImportSource` (no JSX), add `"astro/client"` to types.

**biome.json** — Update `files.includes` to `["src/**", "scripts/**", "astro.config.mjs", "biome.json", "tsconfig.json"]`.

**.gitignore** — Add `.astro/`.

### Step 2: Create types and content structure

**src/types.ts** — Extract types from current `src/data.ts`:
- `ArtistLink`, `ArtistDetailEntry`, `ArtistDetailsByName`, `Row` (unchanged)
- Add `Festival` type matching the festivals.json shape:
  ```ts
  export type Festival = {
    name: string;
    shortName: string;
    slug: string;
    year: number;
    region: string;
    features: string[];
    dataDir: string;
    sourceUrl: string | null;
    sourceLabel: string | null;
    sourceAttribution: string | null;
    draft: boolean;
  };
  ```

**src/content/festivals.json** — Festival registry:
```json
[
  {
    "name": "Programmation FEQ 2026",
    "shortName": "FEQ 2026",
    "slug": "feq-2026",
    "year": 2026,
    "region": "Québec",
    "features": ["filter-free", "filter-quebec"],
    "dataDir": "feq-2026",
    "sourceUrl": "https://www.feq.ca/fr/programmation",
    "sourceLabel": "feq.ca",
    "sourceAttribution": "Festival d'été de Québec",
    "draft": false
  },
  {
    "name": "Test Festival 2026",
    "shortName": "Test 2026",
    "slug": "test-festival",
    "year": 2026,
    "region": "Test",
    "features": ["filter-free", "filter-quebec"],
    "dataDir": "test-festival",
    "sourceUrl": null,
    "sourceLabel": null,
    "sourceAttribution": null,
    "draft": true
  }
]
```

**Move data files:**
- `assets/schedule.json` → `src/content/festivals/feq-2026/schedule.json`
- `assets/artist-details.json` → `src/content/festivals/feq-2026/artist-details.json`
- `assets/youtube-overrides.json` → `src/content/festivals/feq-2026/youtube-overrides.json`

**Create test-festival dummy data:**
- `src/content/festivals/test-festival/schedule.json` — 5 rows across 2 dates, mix of paid/free, at least one Québec artist
- `src/content/festivals/test-festival/artist-details.json` — Entries for each dummy artist, at least one with description+imageUrl+video link

### Step 3: Vanilla TS utility scripts

**src/scripts/stored-state.ts** — localStorage get/set helpers:
```ts
export function getStored<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}
export function setStored<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
```

**src/scripts/youtube.ts** — Extract `getYouTubeEmbed` from current `ArtistDialog.tsx:175-191` (exact same logic).

### Step 4: Base layout

**src/layouts/Base.astro** — Replaces `index.html`. Contains:
- `<html lang="fr">` with `<head>` (meta tags, icons, inline dark-mode script + style)
- `import "../index.css"` in frontmatter
- Props: `title: string`, `description: string`
- `<slot />` in `<body>`
- The inline dark-mode script is identical to current `index.html:4-9`

**src/index.css** — Unchanged except update comment to reference `Base.astro` instead of `index.html`.

### Step 5: PageNav component + scripts

**src/components/PageNav.astro** — Props: `festival: Festival`, `otherFestivals: Festival[]`

Static HTML structure:
- `<div data-nav-dropdown>` wrapper
- `<button data-nav-toggle>` showing `festival.name` + `▾`
- `<div data-nav-menu class="hidden">` with `<a href="/{slug}/">` links for each other festival
- `<button data-theme-toggle>` with both sun and moon SVGs — moon has `class="dark:hidden"`, sun has `class="hidden dark:block"` (CSS handles visibility, no JS swap needed)
- `<script>` tag importing `../scripts/theme.ts` and `../scripts/nav-dropdown.ts`

**src/scripts/theme.ts** — Click handler on `[data-theme-toggle]`:
- Toggle `.dark` on `document.documentElement`
- Save to localStorage via `setStored("theme", ...)`
- Update `meta[name="theme-color"]` content attribute

**src/scripts/nav-dropdown.ts** — Click handler on `[data-nav-toggle]`:
- Toggle `hidden` on `[data-nav-menu]`
- Close on outside click (`mousedown` on document)

### Step 6: ScheduleTable component + filter script

**src/components/ScheduleTable.astro** — Props: `schedule: Map<string, Row[]>`, `artistDetails: ArtistDetailsByName`, `slug: string`, `features: string[]`

Renders the full table as static HTML with data attributes for JS:

- **Filter bar** (`data-filter-bar`): Buttons with `data-filter="all"`, `data-filter="free"`, `data-filter="quebec"`. Buttons conditionally rendered based on `features` array. Each button has both active and inactive class sets; JS toggles between them.
- **Table** (`data-schedule-table`, `data-schedule-slug={slug}`):
  - `<thead>`: column headers. "Début" header has `data-sort-toggle` with a `<span data-sort-label>`. "Passe?" header has `data-paid-header`.
  - `<tbody>`: For each date group:
    - Day header `<tr data-day-header data-date="YYYY-MM-DD">` with formatted date
    - Data rows `<tr data-row data-date="..." data-paid="true|false" data-country="..." data-time="HH:MM" data-genre="..." data-original-index={i}>`:
      - Venue cell
      - Paid/free badge cell with `data-paid-cell`
      - Time cell
      - Artist cell with `<button data-artist-open="Artist Name">` (includes Quebec flag img inline if applicable)
      - Genre cell (hidden on xs breakpoint, same as current)

**`data-original-index`** on each `<tr>`: a simple counter set during Astro rendering. Used to restore original (venue-based) order when sort is toggled off.

**src/scripts/schedule-filter.ts** — The main interactive script:
- Reads `data-schedule-slug` for localStorage key namespacing (keys: `{slug}:free`, `{slug}:quebec`, `{slug}:start`)
- On DOMContentLoaded, reads stored state via `getStored`
- `applyFilters()`: Shows/hides rows via `row.hidden`, hides empty day headers, toggles paid column visibility, updates button active states
- `applySortOrder()`: When sort active, reorders `<tr>` elements within each date group by `data-time` using `tbody.appendChild`. When sort off, restores by `data-original-index`.
- Event listeners via delegation on `[data-filter-bar]` for filter clicks, direct on `[data-sort-toggle]` for sort
- Persists state changes to localStorage

**Script tag** in ScheduleTable.astro: `<script>import "./scripts/schedule-filter.ts"</script>` (or inline import)

### Step 7: ArtistDialog component + dialog script

**src/components/ArtistDialog.astro** — No props. Renders an empty `<dialog>`:
```html
<dialog id="artist-dialog" class="rounded-xl shadow-2xl p-0 max-w-lg w-full backdrop:bg-black/50 bg-transparent">
  <div id="artist-dialog-content" class="flex flex-col bg-white dark:bg-gray-800 rounded-xl"></div>
</dialog>
```

**src/scripts/artist-dialog.ts** — The dialog logic:
- On DOMContentLoaded, parses `#artist-details-data` JSON (embedded in the page by `[festival].astro`)
- Uses event delegation (`document.addEventListener("click", ...)`) to handle:
  - `[data-artist-open]` clicks → populate and open dialog
  - `[data-dialog-close]` clicks → close dialog
  - `[data-play-video]` clicks → replace image with YouTube iframe
- Dialog event handlers: backdrop click to close, `cancel` event (Escape), arrow key navigation
- `renderDialogContent(name, country, genre, details)` builds the dialog innerHTML with:
  - Image + gradient overlay + name/country (or plain header if no image)
  - Close button
  - Play video button (if YouTube link found via `getYouTubeEmbed`)
  - Genre badge, description, remaining links
- Navigation: finds current artist in visible (non-hidden) rows, moves by delta
- Body scroll lock: `document.body.style.overflow = "hidden"` on open, `""` on close
- HTML escaping helpers (`escapeHtml`, `escapeAttr`) since we build innerHTML strings
- Genre is read from `data-genre` attribute on the `<tr>`

**Important: Tailwind class detection** — The dialog innerHTML uses Tailwind classes that may not appear in `.astro` files. Since Tailwind v4 scans all source files, the classes in `.ts` files under `src/scripts/` should be detected. If not, we may need to add a `@source` directive in `index.css` or verify Tailwind's content detection config.

### Step 8: Festival page + index redirect

**src/pages/[festival].astro** — Dynamic route:
- `getStaticPaths()` reads `festivals.json`, filters out drafts in production (`!import.meta.env.DEV`), returns `{ params: { festival: slug }, props: { festival } }` for each
- Frontmatter loads per-festival data via dynamic import (or `import.meta.glob` if dynamic import doesn't work with Astro's build):
  ```ts
  const scheduleModules = import.meta.glob("../content/festivals/*/schedule.json", { eager: true });
  const artistModules = import.meta.glob("../content/festivals/*/artist-details.json", { eager: true });
  ```
- Groups schedule rows by date (same logic as current `data.ts`)
- Builds `otherFestivals` list (non-draft, excluding current)
- Renders: `<Base>` layout → `<PageNav>` → `<ScheduleTable>` → `<ArtistDialog>` → footer (conditional on `sourceUrl`)
- Embeds artist details as `<script type="application/json" id="artist-details-data">{JSON.stringify(artistDetails)}</script>`

**src/pages/index.astro** — Redirect:
```astro
---
import allFestivals from "../content/festivals.json";
const visible = import.meta.env.DEV ? allFestivals : allFestivals.filter(f => !f.draft);
return Astro.redirect(`/${visible[0].slug}/`);
---
```

### Step 9: Update scraper

**scripts/update-schedule.ts** changes:
- Output paths: `../src/content/festivals/feq-2026/schedule.json`, `../src/content/festivals/feq-2026/artist-details.json`
- Overrides path: `../src/content/festivals/feq-2026/youtube-overrides.json`
- Type import: `from "../src/types.ts"` instead of `from "../src/data.ts"`
- Add `fs.mkdir(path.dirname(scheduleOutPath), { recursive: true })` before writing schedule

### Step 10: Update deployment config

**nginx.conf**:
- Change `/assets/` to `/_astro/` (Astro's hashed asset directory)
- Remove SPA fallback (`/index.html`)
- Add `$uri/index.html` fallback for directory URLs:
  ```nginx
  location / {
      add_header Cache-Control "no-cache";
      try_files $uri $uri/index.html =404;
  }
  ```

**Dockerfile** — No changes needed (same build command, same output dir `dist/`).

### Step 11: Delete old files

Remove: `src/App.tsx`, `src/main.tsx`, `src/ScheduleTable.tsx`, `src/ArtistDialog.tsx`, `src/PageNav.tsx`, `src/useStoredState.ts`, `src/data.ts`, `src/vite-env.d.ts`, `index.html`, `vite.config.ts`, `assets/` directory.

---

## Verification

1. `npm run dev` → dev server starts at localhost:4321
2. `/` redirects to `/feq-2026/`
3. `/feq-2026/` shows full schedule table (175 rows) as static HTML
4. Filter buttons: "Gratuit" hides paid rows + "Passe?" column; "Québécois" filters to Quebec; "Toute" resets
5. Sort: click "Début" to sort by time within each day, click again to restore venue order
6. Filters/sort persist across reload (localStorage)
7. Click artist → dialog opens with image, name, country, genre, description, links
8. YouTube play button → embeds video in dialog
9. Arrow up/down → navigate between artists (respects filters)
10. Dialog closes on ×, Escape, backdrop click; body scroll locked while open
11. Dark mode toggle works, persists, no flash on load
12. Nav dropdown shows other festivals as links
13. `/test-festival/` works in dev mode
14. `npm run build` succeeds; `npm run preview` serves correctly
15. Production build: `/test-festival/` page not generated
16. `npm run check` passes
17. `npm run update` writes to new data paths
18. View source on `/feq-2026/` — full table is in the HTML, no JS required to see content
