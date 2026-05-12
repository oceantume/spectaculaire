import type { APIRoute } from "astro";
import festivalData from "../content/festivals.json";
import type { Festival, Row } from "../types";

// [artist, festivalIdx, date, time, venueIdx, rowIdx]
type CompactEntry = [string, number, string, string, number, number];

type SearchIndex = {
  festivals: [slug: string, name: string][];
  venues: string[];
  entries: CompactEntry[];
};

const scheduleModules = import.meta.glob<{ default: Row[] }>("../content/festivals/*/schedule.json", {
  eager: true,
});
const overrideModules = import.meta.glob<{ default: Record<string, Partial<Row>> }>(
  "../content/festivals/*/field-overrides.json",
  { eager: true },
);
const venueOverrideModules = import.meta.glob<{ default: Record<string, string> }>(
  "../content/festivals/*/venue-overrides.json",
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

    for (const [, dayRows] of grouped.entries()) {
      dayRows.forEach((rawRow, idx) => {
        const override = overridesByLower[rawRow.artist.toLowerCase()];
        const resolvedVenue = venueOverrides[rawRow.venue] ?? rawRow.venue;
        const row = override ? { ...rawRow, venue: resolvedVenue, ...override } : { ...rawRow, venue: resolvedVenue };

        let vi = venueIndex.get(row.venue);
        if (vi === undefined) {
          vi = venueList.length;
          venueList.push(row.venue);
          venueIndex.set(row.venue, vi);
        }

        entries.push([row.artist, fi, row.date, row.time, vi, idx]);
      });
    }
  }

  const index: SearchIndex = { festivals: festivalList, venues: venueList, entries };
  return new Response(JSON.stringify(index), {
    headers: { "Content-Type": "application/json" },
  });
};
