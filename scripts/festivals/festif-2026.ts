import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, inferLinkLabel, localDateStr, localTimeStr, toEDT, writeFestivalData } from "../utils.ts";

interface PrismicText {
  text: string;
}

interface PrismicGatsbyImage {
  url?: string;
  gatsbyImageData?: {
    images?: {
      fallback?: { src?: string };
    };
  };
}

interface AppearanceEdge {
  node: {
    data: {
      time: string | null;
      artist: {
        document: {
          slug: string;
          data: {
            title: PrismicText;
            main_image: PrismicGatsbyImage;
          };
        } | null;
      } | null;
      event: {
        document: {
          data: {
            is_show: boolean;
            hidefromprog: boolean;
            free: boolean;
            start_time: string;
            stage: {
              document: {
                data: {
                  title: PrismicText;
                };
              };
            };
          };
        } | null;
      };
    };
  };
}

interface ProgrammationPageData {
  result: {
    data: {
      allPrismicAppearances: {
        group?: Array<{ edges: AppearanceEdge[] }>;
        edges?: AppearanceEdge[];
      };
    };
  };
}

interface ArtistPostData {
  style?: PrismicText;
  from?: PrismicText;
  description?: PrismicText;
  youtube_ids?: PrismicText;
  socialmedias_csv?: PrismicText;
  main_image?: { url?: string };
}

interface ArtistPageData {
  result: {
    pageContext: {
      post: {
        data: ArtistPostData;
      };
    };
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/content/festivals/festif-2026");
const BASE_URL = "https://lefestif.ca";

export async function run(): Promise<void> {
  const progUrl = `${BASE_URL}/page-data/programmation/page-data.json`;
  console.log(`[festif-2026] Fetching ${progUrl}...`);

  const progRes = await fetch(progUrl);
  if (!progRes.ok) throw new Error(`HTTP ${progRes.status} ${progRes.statusText}`);

  const progData = (await progRes.json()) as ProgrammationPageData;
  const allAppearances = progData.result.data.allPrismicAppearances;

  const edges: AppearanceEdge[] = allAppearances.group
    ? allAppearances.group.flatMap((g) => g.edges)
    : (allAppearances.edges ?? []);

  const filtered = edges.filter(({ node }) => {
    if (!node.data.event?.document || !node.data.artist?.document) return false;
    const ev = node.data.event.document.data;
    return !ev.hidefromprog;
  });

  console.log(`[festif-2026] ${filtered.length} appearances after filtering (${edges.length} total)`);

  const slugSet = new Set(
    filtered.map(({ node }) => node.data.artist?.document?.slug).filter((s): s is string => s !== undefined),
  );
  const slugs = [...slugSet];

  console.log(`[festif-2026] Fetching details for ${slugs.length} artists...`);

  const artistPageEntries = await Promise.all(
    slugs.map(async (slug) => {
      const url = `${BASE_URL}/page-data/artistes/${slug}/page-data.json`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[festif-2026] Warning: HTTP ${res.status} for ${url}`);
        return [slug, null] as const;
      }
      return [slug, (await res.json()) as ArtistPageData] as const;
    }),
  );

  const artistPageBySlug = new Map(artistPageEntries);

  const rows: Row[] = [];
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};

  for (const { node } of filtered) {
    const { data } = node;
    const artistDoc = data.artist?.document;
    if (!artistDoc || !data.event?.document) continue;
    const slug = artistDoc.slug;
    const artistName = artistDoc.data.title.text;
    const ev = data.event.document.data;

    // Use per-artist time when set (multi-artist events), fall back to event start time
    const startTime = data.time ?? ev.start_time;
    const edt = toEDT(startTime);

    const artistPage = artistPageBySlug.get(slug);
    const artistData = artistPage?.result.pageContext.post.data;

    const rawCountry = artistData?.from?.text;
    const country = rawCountry ? (rawCountry === "Montréal" ? "Québec" : rawCountry) : undefined;

    rows.push({
      date: localDateStr(edt),
      venue: ev.stage.document.data.title.text,
      paid: !ev.free,
      time: localTimeStr(edt),
      artist: artistName,
      country,
      genre: artistData?.style?.text ?? "",
    });

    const links: ArtistLink[] = [];

    const socialsRaw = artistData?.socialmedias_csv?.text;
    if (socialsRaw) {
      for (const url of socialsRaw
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean)) {
        links.push({ label: inferLinkLabel(url), url });
      }
    }

    const youtubeId = artistData?.youtube_ids?.text?.trim();
    if (youtubeId) {
      links.push({ label: "Vidéo officielle", url: `https://www.youtube.com/watch?v=${youtubeId}` });
    }

    // Strip Prismic image params to get a clean URL
    const imageUrl = artistData?.main_image?.url?.split("?")[0];

    artistDetailsMap[artistName] = {
      description: artistData?.description?.text ? htmlToText(artistData.description.text) : undefined,
      imageUrl,
      links,
    };
  }

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (b.paid ? 1 : 0) - (a.paid ? 1 : 0) ||
      a.venue.localeCompare(b.venue) ||
      a.time.localeCompare(b.time),
  );

  await writeFestivalData(dataDir, rows, artistDetailsMap);
}
