import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, inferLinkLabel, writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/data/festivals/envol-et-macadam-2026");

const SCHEDULE_URL = "https://envoletmacadam.com/fr/programmation-2025/horaire/";
const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
};

function parseFrenchDate(text: string): string | null {
  const match = text.match(/(\d+)\s+(\w+)\s+(\d{4})/i);
  if (!match) return null;
  const [, day, monthStr, year] = match;
  const month = FRENCH_MONTHS[monthStr.toLowerCase()];
  if (!month) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

interface ParsedShow {
  date: string;
  venue: string;
  paid: boolean;
  time: string;
  artist: string;
  artistUrl: string;
}

function parseSchedule(html: string): ParsedShow[] {
  const root = parse(html);
  const shows: ParsedShow[] = [];

  // Pair each date <h2> with its following venue grid
  const dateH2s = root.querySelectorAll("h2.h3-alt");
  const venueGrids = root.querySelectorAll("div.grid-columns-equal-3");
  const gridDateMap = new Map<object, string>();
  for (let i = 0; i < Math.min(dateH2s.length, venueGrids.length); i++) {
    const date = parseFrenchDate(dateH2s[i].textContent.trim());
    if (date) gridDateMap.set(venueGrids[i], date);
  }

  // Process each venue column via its venue header
  for (const venueHeader of root.querySelectorAll("ul.liste-edition.margin-bottom-15")) {
    const venueLink = venueHeader.querySelector('a[href="/lieux/"]');
    if (!venueLink) continue;
    const venue = venueLink.textContent.trim();

    const venueCol = venueHeader.parentNode;
    if (!venueCol) continue;
    const venueGrid = venueCol.parentNode;
    const date = gridDateMap.get(venueGrid) ?? "";
    if (!date) continue;

    // Free if "Entrée gratuite" appears as a standalone h5 in this column
    const paid = !venueCol.querySelectorAll("h5").some((h5) => h5.textContent.trim() === "Entrée gratuite");

    for (const showCard of venueCol.querySelectorAll(".grid-columns-3-9")) {
      const artistLinks = showCard.querySelectorAll("a[href*='/artistes/']");
      const artistLink = artistLinks.find((a) => a.querySelector("h5"));
      if (!artistLink) continue;

      const artist = artistLink.querySelector("h5")?.textContent.trim();
      if (!artist) continue;

      const artistUrl = artistLink.getAttribute("href") ?? "";
      if (!artistUrl) continue;

      const timeLi = showCard.querySelectorAll("li.green").find((li) => /^\d{1,2}h\d{2}$/.test(li.textContent.trim()));
      if (!timeLi) continue;
      const time = timeLi.textContent.trim().replace("h", ":");

      shows.push({ date, venue, paid, time, artist, artistUrl });
    }
  }

  return shows;
}

interface ArtistFetchResult {
  details: ArtistDetailEntry;
  country?: string;
}

async function fetchArtistDetails(artistUrl: string): Promise<ArtistFetchResult> {
  let res: Response;
  try {
    res = await fetch(artistUrl);
  } catch {
    return { details: { links: [] } };
  }
  if (!res.ok) return { details: { links: [] } };
  const html = await res.text();
  const root = parse(html);

  const imageEl = root.querySelector("img.wp-post-image");
  const imageUrl = imageEl?.getAttribute("src") ?? undefined;

  const countryEl = root.querySelector(".origine .bg__white");
  const country = countryEl?.textContent.trim() || undefined;

  const bioParagraphs: string[] = [];
  const bioCol = root.querySelector(".grid-column.sm-order-2");
  for (const p of bioCol?.querySelectorAll("p") ?? []) {
    const text = htmlToText(p.outerHTML);
    if (text) bioParagraphs.push(text);
  }
  const description = bioParagraphs.length > 0 ? bioParagraphs.join("\n\n") : undefined;

  const links: ArtistLink[] = [];
  const socialList = root.querySelector("ul.liste-social-icon__band");
  if (socialList) {
    for (const a of socialList.querySelectorAll("a[href]")) {
      const url = a.getAttribute("href") ?? "";
      if (!url || url.includes("envoletmacadam.com")) continue;
      links.push({ label: inferLinkLabel(url), url });
    }
  }

  return { details: { description, imageUrl, links }, country };
}

export async function run(): Promise<void> {
  console.log(`[envol-et-macadam-2026] Fetching ${SCHEDULE_URL}...`);
  const res = await fetch(SCHEDULE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const html = await res.text();
  console.log(`[envol-et-macadam-2026] Got ${html.length} bytes of HTML`);

  const shows = parseSchedule(html);
  console.log(`[envol-et-macadam-2026] Parsed ${shows.length} shows`);

  const artistUrls = new Map<string, string>();
  for (const show of shows) {
    if (!artistUrls.has(show.artist)) artistUrls.set(show.artist, show.artistUrl);
  }

  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};
  const artistCountries = new Map<string, string>();

  for (const [artist, artistUrl] of artistUrls) {
    const { details, country } = await fetchArtistDetails(artistUrl);
    console.log(`[envol-et-macadam-2026] Fetched details for ${artist}`);
    artistDetailsMap[artist] = details;
    if (country) artistCountries.set(artist, country);
    await new Promise((r) => setTimeout(r, 200));
  }

  const rows: Row[] = shows.map((show) => ({
    date: show.date,
    venue: show.venue,
    paid: show.paid,
    time: show.time,
    artist: show.artist,
    country: artistCountries.get(show.artist),
  }));

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (b.paid ? 1 : 0) - (a.paid ? 1 : 0) ||
      a.venue.localeCompare(b.venue) ||
      a.time.localeCompare(b.time),
  );

  await writeFestivalData(dataDir, rows, artistDetailsMap);
}
