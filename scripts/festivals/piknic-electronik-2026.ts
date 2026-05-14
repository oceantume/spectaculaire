import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, inferLinkLabel, localDateStr, localTimeStr, toEDT, writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/content/festivals/piknic-electronik-2026");
const BASE_URL = "https://piknicelectronik.com";

interface SveltekitShow {
  title: string;
  startDate: string;
  artists: { uri: string; image: { url: string }[] }[];
}

interface SveltekitProgram {
  startDate: string;
  displayTitle: string;
  shows: SveltekitShow[];
}

interface SveltekitEdition {
  isOffPiknic: boolean;
  programGroups: { programs: SveltekitProgram[] }[];
}

interface SveltekitProps {
  entry: { editions: SveltekitEdition[] };
}

interface ShowEntry {
  date: string;
  venue: string;
  artistName: string;
  time: string;
  imageUrl: string;
  slug: string;
  type: string;
}

export async function run(): Promise<void> {
  console.log("[piknic-electronik-2026] Fetching prog-complete...");
  const res = await fetch(`${BASE_URL}/fr/prog-complete`);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const html = await res.text();

  // All 6 months are embedded as SvelteKit SSR hydration props — no JS interaction needed
  const propsMatch = html.match(/<script[^>]*sveltekit:data-type="props"[^>]*>([\s\S]*?)<\/script>/);
  if (!propsMatch) throw new Error("Could not find SvelteKit props script tag");
  const props = JSON.parse(propsMatch[1]) as SveltekitProps;

  const shows: ShowEntry[] = [];

  for (const edition of props.entry.editions) {
    const type = edition.isOffPiknic ? "off" : "main";
    for (const group of edition.programGroups) {
      for (const program of group.programs) {
        const date = localDateStr(toEDT(program.startDate));
        for (const show of program.shows) {
          const artist = show.artists[0];
          if (!artist) continue;
          const slug = artist.uri.replace(/^artistes\//, "");
          shows.push({
            date,
            venue: program.displayTitle,
            artistName: show.title,
            time: localTimeStr(toEDT(show.startDate)),
            imageUrl: artist.image[0]?.url ?? "",
            slug,
            type,
          });
        }
      }
    }
  }

  // TODO: Add Petit Piknic (free, noon–3pm) once dates are published at /fr/petit-piknic.
  // Run `npm run recon -- https://piknicelectronik.com/fr/petit-piknic` first to discover
  // the data structure, then add rows here with paid: false.

  console.log(`[piknic-electronik-2026] Found ${shows.length} shows`);

  const slugs = [...new Set(shows.map((s) => s.slug))];
  console.log(`[piknic-electronik-2026] Fetching details for ${slugs.length} artists...`);

  const detailBySlug = new Map<string, ArtistDetailEntry>();

  for (const slug of slugs) {
    await new Promise((r) => setTimeout(r, 200));
    const url = `${BASE_URL}/fr/artistes/${slug}`;
    const detailRes = await fetch(url);
    if (!detailRes.ok) {
      console.warn(`[piknic-electronik-2026] Warning: HTTP ${detailRes.status} for ${url}`);
      continue;
    }

    const detailHtml = await detailRes.text();

    // The page has two <h1>: the artist title and "Infolettre & SMS" (newsletter).
    // Everything between them is the artist section (bio + social links).
    const firstH1 = detailHtml.indexOf("<h1");
    const secondH1 = detailHtml.indexOf("<h1", firstH1 + 1);
    const artistHtml = secondH1 > 0 ? detailHtml.slice(firstH1, secondH1) : detailHtml.slice(firstH1);

    // Bio is between <!-- HTML_TAG_START --> and <!-- HTML_TAG_END --> in artist section only
    const bioMatch = artistHtml.match(/<!-- HTML_TAG_START -->([\s\S]*?)<!-- HTML_TAG_END -->/);
    const description = bioMatch ? htmlToText(bioMatch[1]) || undefined : undefined;

    // Image: first cms.piknicelectronik.com upload image
    const artistRoot = parse(artistHtml);
    const imgEl = artistRoot.querySelector("img[src*='cms.piknicelectronik.com/uploads/Shows']");
    const imageUrl = imgEl?.getAttribute("src") ?? undefined;

    // Social links: external hrefs in artist section only
    const links: ArtistLink[] = [];
    const seenUrls = new Set<string>();
    for (const a of artistRoot.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") ?? "";
      if (
        !href.startsWith("http") ||
        href.includes("piknicelectronik.com") ||
        href.includes("googletagmanager") ||
        href.includes("billets.") ||
        seenUrls.has(href)
      )
        continue;
      seenUrls.add(href);
      links.push({ label: inferLinkLabel(href), url: href });
    }

    detailBySlug.set(slug, { description, imageUrl, links });
  }

  const rows: Row[] = [];
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};

  for (const show of shows) {
    rows.push({
      date: show.date,
      venue: show.venue,
      paid: true,
      time: show.time,
      artist: show.artistName,
      type: show.type,
    });

    if (!artistDetailsMap[show.artistName]) {
      const detail = detailBySlug.get(show.slug);
      artistDetailsMap[show.artistName] = {
        description: detail?.description,
        imageUrl: detail?.imageUrl ?? (show.imageUrl || undefined),
        links: detail?.links ?? [],
      };
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.venue.localeCompare(b.venue) || a.time.localeCompare(b.time));

  await writeFestivalData(dataDir, rows, artistDetailsMap);
}
