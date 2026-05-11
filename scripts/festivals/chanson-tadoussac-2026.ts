import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, inferLinkLabel, writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/content/festivals/chanson-tadoussac-2026");

const CONVEX_URL = "https://api.sync.festapp.io/api/query";
const EDITION_ID = "kh71n5znh7579n7eq1341wkrfs80k67v";

interface ConvexLocalizedField {
  field: string;
  locale: string;
  value: string;
}

interface ConvexCategory {
  _id: string;
  localized_fields: ConvexLocalizedField[];
}

interface ConvexPlace {
  _id: string;
  localized_fields: ConvexLocalizedField[];
  order: number;
}

interface ConvexScheduleItem {
  _id: string;
  artist: { _id: string; name: string };
  categories: ConvexCategory[];
  place: ConvexPlace;
  start_date: string;
  start_time: string;
}

interface ConvexArtistDetail {
  _id: string;
  image?: { url?: string };
  links: Array<{ url: string; label?: string }>;
  localized_fields: ConvexLocalizedField[];
  name: string;
}

async function convexQuery<T>(path: string, args: Record<string, string>): Promise<T> {
  const res = await fetch(CONVEX_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { status: string; value: T };
  if (data.status !== "success") throw new Error(`Convex error: ${data.status}`);
  return data.value;
}

function getLocalizedValue(fields: ConvexLocalizedField[], field: string, locale = "fr"): string | undefined {
  return fields.find((f) => f.field === field && f.locale === locale)?.value;
}

export async function run(): Promise<void> {
  console.log("[chanson-tadoussac-2026] Fetching schedule from Convex API...");

  const schedules = await convexQuery<ConvexScheduleItem[]>("queries/widget:schedules", {
    editionId: EDITION_ID,
  });
  console.log(`[chanson-tadoussac-2026] Got ${schedules.length} schedule items`);

  // Filter out non-show activities
  const shows = schedules.filter((item) => {
    const catNames = item.categories.flatMap((c) =>
      c.localized_fields.filter((f) => f.locale === "fr").map((f) => f.value),
    );
    return !catNames.some((n) => n.toLowerCase() === "activités");
  });
  console.log(`[chanson-tadoussac-2026] ${shows.length} shows after filtering activities`);

  // Fetch artist details for each unique artist
  const artistIds = [...new Set(shows.map((s) => s.artist._id))];
  console.log(`[chanson-tadoussac-2026] Fetching details for ${artistIds.length} artists...`);

  const artistDetails = new Map<string, ConvexArtistDetail>();
  for (const artistId of artistIds) {
    const detail = await convexQuery<ConvexArtistDetail>("queries/widget:artist", {
      editionId: EDITION_ID,
      artistId,
    });
    artistDetails.set(artistId, detail);
    console.log(`[chanson-tadoussac-2026]   ${detail.name}`);
    await new Promise((r) => setTimeout(r, 100));
  }

  const rows: Row[] = [];
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};

  for (const show of shows) {
    const catNames = show.categories.flatMap((c) =>
      c.localized_fields.filter((f) => f.locale === "fr").map((f) => f.value),
    );
    const paid = catNames.some((n) => /passeport|billet/i.test(n));
    const venue = getLocalizedValue(show.place.localized_fields, "name") ?? show.place._id;
    const artist = show.artist.name;

    rows.push({
      artist,
      venue,
      paid,
      date: show.start_date,
      time: show.start_time,
    });

    if (!artistDetailsMap[artist]) {
      const detail = artistDetails.get(show.artist._id);
      const biography = detail ? getLocalizedValue(detail.localized_fields, "biography") : undefined;
      const links: ArtistLink[] = (detail?.links ?? []).map((l) => ({
        label: l.label ?? inferLinkLabel(l.url),
        url: l.url,
      }));

      artistDetailsMap[artist] = {
        description: biography ? htmlToText(biography) : undefined,
        imageUrl: detail?.image?.url,
        links,
      };
    }
  }

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (b.paid ? 1 : 0) - (a.paid ? 1 : 0) ||
      a.venue.localeCompare(b.venue) ||
      a.time.localeCompare(b.time),
  );

  console.log(`[chanson-tadoussac-2026] Built ${rows.length} rows`);
  await writeFestivalData(dataDir, rows, artistDetailsMap);
}
