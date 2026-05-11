# Spectaculaire

A static site that aggregates concert schedules from many Quebec festivals into a single tiny Web app with lean features and design.

Live at **https://spectaculaire.fly.dev**

## Getting started

```
npm install
npm run dev      # local dev server
npm run build    # production build
npm run check    # type check + format
npm run update   # re-fetch all festival data from source sites
```

## Architecture

Spectaculaire is an **Astro** static site and all pages are pre-rendered at build time with no server runtime.

```
src/
  content/
    festivals.json            # registry of all festivals (metadata, feature flags)
    festivals/{slug}/
      schedule.json           # concert rows (date, time, venue, artist, ...)
      artist-details.json     # artist bios, images, and links
  pages/
    [festival]/
      index.astro             # one page per festival slug
      artist-details.json.ts  # static API endpoint for artist detail popups
  components/
    ScheduleTable.astro       # schedule grid with filtering and sorting
    ArtistDialog.astro        # artist detail modal
    PageNav.astro             # festival picker and theme toggle
  layouts/
    Base.astro                # HTML shell

scripts/
  update.ts                   # orchestrator that runs all ingestion scripts
  utils.ts                    # shared helpers (date/time, HTML parsing, link labels)
  festivals/
    feq-2026.ts               # one ingestion script per festival
    ...
```

Data flows one way: ingestion scripts write JSON into `src/content/festivals/`, Astro reads it at build time, and nginx serves the resulting static files. A scheduled action updates the festival data daily in the repository.

## Adding a festival

**With Claude Code** (recommended): use the `/add-festival` skill. It handles finding the data source, writing the ingestion script, and registering the festival. Just provide the festival's programmation URL. Note that this can go a bit haywire if the site is hard to scrape.

**Manually:**

1. Write `scripts/festivals/{slug}.ts` — fetch the source, map rows to the `Row` type, call `writeFestivalData(dataDir, rows, artistDetails)` from `scripts/utils.ts`.
2. Register the script in `scripts/update.ts` by adding it to the `festivals` array.
3. Add a metadata entry to `src/content/festivals.json` (set `"draft": true` until verified).
4. Run `npm run update` to populate `src/content/festivals/{slug}/`.

See an existing script like `scripts/festivals/feq-2026.ts` for a concrete example.

## Deployment

Deployed to Fly.io as a Docker image. The build compiles the static site; nginx serves it at runtime, but it can be deployed manually via `fly deploy`.
