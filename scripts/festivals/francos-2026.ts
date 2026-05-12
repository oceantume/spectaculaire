import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, inferLinkLabel, localDateStr, localTimeStr, toEDT, writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/content/festivals/francos-2026");

const ALGOLIA_URL = "https://francosmontreal.com/api/algolia/search";
const INDEX_NAME = "master_festival_Franco_fr-CA";

interface AlgoliaHeadliner {
  code: string;
  name: string;
  slug: string;
  youtube?: string;
  spotify?: string;
}

interface AlgoliaGenre {
  name: string;
  code: string;
  slug: string;
}

interface AlgoliaVenues {
  code: string;
  slug: string;
  name: string;
}

interface AlgoliaShow {
  entity_type: string;
  event_name: string;
  show_time: number;
  free: boolean;
  venues: AlgoliaVenues;
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

export async function run(): Promise<void> {
  console.log("[francos-2026] Fetching schedule from Algolia API...");
  const shows = await fetchShows();
  console.log(`[francos-2026] Got ${shows.length} shows`);

  const rows: Row[] = [];
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};

  for (const show of shows) {
    const localDt = toEDT(new Date(show.show_time * 1000).toISOString());
    const date = localDateStr(localDt);
    const time = localTimeStr(localDt);
    const venue = show.venues?.name ?? "";
    const genre = show.genre?.[0]?.name;

    rows.push({
      date,
      time,
      venue,
      paid: !show.free,
      artist: show.event_name,
      ...(genre ? { genre } : {}),
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
