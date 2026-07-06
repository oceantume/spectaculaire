import type { APIRoute } from "astro";
import festivalData from "../content/festivals.json";
import type { Festival, Row } from "../types";
import { resolveVenue } from "../types";

// [artist, festivalIdx, date, time, venueIdx, rowIdx]
type CompactEntry = [string, number, string, string, number, number];

type SearchIndex = {
  festivals: [slug: string, name: string][];
  venues: string[];
  entries: CompactEntry[];
};

const scheduleModules = import.meta.glob<{ default: Row[] }>("../data/festivals/*/schedule.json", {
  eager: true,
});
const overrideModules = import.meta.glob<{ default: Record<string, Partial<Row>> }>(
  "../data/festivals/*/field-overrides.json",
  { eager: true },
);
const venueOverrideModules = import.meta.glob<{ default: Record<string, string> }>(
  "../data/festivals/*/venue-overrides.json",
  { eager: true },
);

export const GET: APIRoute = () => {
  const festivals = (import.meta.env.DEV ? festivalData : festivalData.filter((f) => !f.draft)) as Festival[];

  const festivalList: [string, string][] = festivals.map((f) => [f.slug, f.name]);
  const venueList: string[] = [];
  const venueIndex = new Map<string, number>();
  const entries: CompactEntry[] = [];

  for (let fi = 0; fi < festivals.length; fi++) {
    const festival = festivals[fi];
    const scheduleKey = Object.keys(scheduleModules).find((k) => k.includes(`/${festival.dataDir}/`));
    const overridesKey = Object.keys(overrideModules).find((k) => k.includes(`/${festival.dataDir}/`));
    const venueKey = Object.keys(venueOverrideModules).find((k) => k.includes(`/${festival.dataDir}/`));

    const rawRows: Row[] = scheduleKey ? scheduleModules[scheduleKey].default : [];
    const fieldOverrides = overridesKey ? overrideModules[overridesKey].default : {};
    const venueOverrides = venueKey ? venueOverrideModules[venueKey].default : {};
    const overridesByLower = Object.fromEntries(Object.entries(fieldOverrides).map(([k, v]) => [k.toLowerCase(), v]));

    const grouped = new Map<string, Row[]>();
    for (const row of rawRows) {
      const group = grouped.get(row.date);
      if (group) group.push(row);
      else grouped.set(row.date, [row]);
    }

    let globalIdx = 0;
    for (const [, dayRows] of grouped.entries()) {
      for (const rawRow of dayRows) {
        const override = overridesByLower[rawRow.artist.toLowerCase()];
        const resolvedVenue = resolveVenue(rawRow.venue, venueOverrides);
        const row = override ? { ...rawRow, venue: resolvedVenue, ...override } : { ...rawRow, venue: resolvedVenue };

        let vi = venueIndex.get(row.venue);
        if (vi === undefined) {
          vi = venueList.length;
          venueList.push(row.venue);
          venueIndex.set(row.venue, vi);
        }

        entries.push([row.artist, fi, row.date, row.time, vi, globalIdx++]);
      }
    }
  }

  const index: SearchIndex = { festivals: festivalList, venues: venueList, entries };
  return new Response(JSON.stringify(index), {
    headers: { "Content-Type": "application/json" },
  });
};
