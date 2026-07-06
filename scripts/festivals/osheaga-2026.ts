import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, inferLinkLabel, localDateStr, localTimeStr, toEDT, writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/data/festivals/osheaga-2026");

const ALGOLIA_URL = "https://osheaga.com/api/algolia/search";
const INDEX_NAME = "master_festival_Osheaga_fr-CA";

interface AlgoliaHeadliner {
  code: string;
  name: string;
  slug: string;
  youtube?: string;
  spotify?: string;
}

interface AlgoliaVenue {
  code: string | null;
  slug: string | null;
  name: string | null;
}

interface AlgoliaGenre {
  name: string;
  code: string;
  slug: string;
}

interface AlgoliaShow {
  entity_type: string;
  event_name: string;
  show_date: number;
  show_time: number | null;
  free: boolean;
  venues: AlgoliaVenue[] | AlgoliaVenue;
  genre: AlgoliaGenre[];
  thumbnail: string;
  headliners: AlgoliaHeadliner[];
  description: string;
}

async function fetchShows(): Promise<AlgoliaShow[]> {
  const query = {
    filters: {
      type: ["evenko_show", "show"],
      serie: [],
      genre: [],
      stage: [],
      location: [],
      free: [],
      freeEvent: [],
      date: [],
      hour: [],
      schedule: [],
      showTime: [],
      family: [],
      announced: true,
      activityType: [],
      activityTypeNuitBlanche: [],
      priceRange: [],
      poles: [],
      themeroutes: [],
      search: "",
    },
    options: { hitsPerPage: 1000, page: 0 },
    indexName: INDEX_NAME,
  };

  const encoded = Buffer.from(JSON.stringify(query)).toString("base64");
  const url = `${ALGOLIA_URL}?query=${encoded}`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "fr-CA,fr;q=0.9" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { hits: AlgoliaShow[] };
  return data.hits.filter((h) => h.entity_type === "show" || h.entity_type === "evenko_show");
}

function youtubeEmbedToWatch(embedUrl: string): string {
  const videoId = embedUrl.split("/embed/")[1]?.split("?")[0];
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : embedUrl;
}

// TODO: as of May 2026, show_time and venues are null for all shows — full schedule not announced yet.
// Re-run `npm run update -- osheaga-2026` once Osheaga publishes stage/time assignments (typically a few weeks before the festival).
export async function run(): Promise<void> {
  console.log("[osheaga-2026] Fetching schedule from Algolia API...");
  const shows = await fetchShows();
  console.log(`[osheaga-2026] Got ${shows.length} shows`);

  const rows: Row[] = [];
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};

  for (const show of shows) {
    const ts = (show.show_time ?? show.show_date) * 1000;
    const localDt = toEDT(new Date(ts).toISOString());
    const date = localDateStr(localDt);
    const time = show.show_time !== null ? localTimeStr(localDt) : "";

    const venueObj = Array.isArray(show.venues) ? show.venues[0] : show.venues;
    const venue = venueObj?.name ?? "";

    rows.push({
      date,
      time,
      venue,
      paid: !show.free,
      artist: show.event_name,
    });

    if (!(show.event_name in artistDetailsMap)) {
      const links: ArtistLink[] = [];
      const headliner = show.headliners?.[0];
      if (headliner?.youtube) {
        const watchUrl = youtubeEmbedToWatch(headliner.youtube);
        links.push({ label: inferLinkLabel(watchUrl), url: watchUrl });
      }
      if (headliner?.spotify) {
        links.push({ label: inferLinkLabel(headliner.spotify), url: headliner.spotify });
      }

      const imageUrl = show.thumbnail ? `https:${show.thumbnail}` : undefined;
      const description = show.description?.trim() ? htmlToText(show.description) : undefined;

      artistDetailsMap[show.event_name] = {
        ...(imageUrl ? { imageUrl } : {}),
        ...(description ? { description } : {}),
        links,
      };
    }
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.paid !== b.paid) return a.paid ? -1 : 1;
    if (a.venue !== b.venue) return a.venue.localeCompare(b.venue);
    return a.time.localeCompare(b.time);
  });

  await writeFestivalData(dataDir, rows, artistDetailsMap);
}
