import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, inferLinkLabel, writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/content/festivals/piknic-electronik-2026");
const BASE_URL = "https://piknicelectronik.com";
const YEAR = 2026;

const MONTH_MAP: Record<string, number> = {
  // English
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
  // French
  janvier: 0,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  décembre: 11,
};

function parseDate(text: string): string {
  // English: "Sun, May 17"  →  month=May, day=17
  // French:  "dim. 17 mai"  →  day=17, month=mai
  const cleaned = text.trim();
  const m = cleaned.match(/(\d+)\s+(\S+)$/) ?? cleaned.match(/(\w+)\s+(\d+)$/);
  if (!m) throw new Error(`Cannot parse date: ${text}`);
  let month: number;
  let day: number;
  if (/^\d+$/.test(m[1])) {
    // French: "dim. 17 mai"  →  m[1]=17, m[2]=mai
    day = parseInt(m[1], 10);
    month = MONTH_MAP[m[2]];
  } else {
    // English: "Sun, May 17"  →  m[1]=May, m[2]=17
    month = MONTH_MAP[m[1]];
    day = parseInt(m[2], 10);
  }
  if (month === undefined) throw new Error(`Unknown month in: ${text}`);
  const d = new Date(Date.UTC(YEAR, month, day));
  return d.toISOString().slice(0, 10);
}

function parseTime(text: string): string {
  // "20H00" → "20:00"
  return text.trim().replace("H", ":").toLowerCase();
}

interface ShowEntry {
  date: string;
  venue: string;
  artistName: string;
  time: string;
  imageUrl: string;
  slug: string;
}

export async function run(): Promise<void> {
  console.log("[piknic-electronik-2026] Fetching prog-complete...");
  const res = await fetch(`${BASE_URL}/fr/prog-complete`);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const html = await res.text();
  const root = parse(html);

  const shows: ShowEntry[] = [];

  for (const details of root.querySelectorAll("details")) {
    const dateText = details.querySelector(".py-20")?.textContent ?? "";
    if (!dateText.trim()) continue;
    const date = parseDate(dateText);

    // Venue groups: each is a div.grid containing a venue name div (with opacity-70) and artist links
    for (const venueGroup of details.querySelectorAll("div.grid")) {
      const venueEl = venueGroup.querySelector("div[class*='opacity-70']");
      if (!venueEl) continue;
      const venue = venueEl.textContent.trim();

      for (const card of venueGroup.querySelectorAll("a[href^='/fr/artistes/']")) {
        const slug = card.getAttribute("href")?.replace("/fr/artistes/", "") ?? "";
        const nameEl = card.querySelector("div[class*='font-extrabold']");
        const timeEl = card.querySelector("div[class*='_right']");
        const imgEl = card.querySelector("img");

        if (!slug || !nameEl || !timeEl) continue;

        shows.push({
          date,
          venue,
          artistName: nameEl.textContent.trim(),
          time: parseTime(timeEl.textContent),
          imageUrl: imgEl?.getAttribute("src") ?? "",
          slug,
        });
      }
    }
  }

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
