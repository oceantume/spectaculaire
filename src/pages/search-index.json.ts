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

function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export const GET: APIRoute = () => {
  const festivals = (import.meta.env.DEV ? festivalData : festivalData.filter((f) => !f.draft)) as Festival[];

  const entries: SearchEntry[] = [];

  for (const festival of festivals) {
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
