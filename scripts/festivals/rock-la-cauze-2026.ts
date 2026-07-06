import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import type { ArtistDetailEntry, Row } from "../../src/types.ts";
import { htmlToText, writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/content/festivals/rock-la-cauze-2026");

const SITE = "https://rocklacauze.com";
const EDITION_TERM_ID = 90; // 2026

const MONTHS: Record<string, string> = {
  janvier: "01",
  février: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  août: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  décembre: "12",
};

interface WpTerm {
  id: number;
  name: string;
}

interface WpArtist {
  id: number;
  slug: string;
  title: { rendered: string };
  featured_media: number;
  date: number[];
  provenance: number[];
}

async function fetchTermMap(taxonomy: string): Promise<Map<number, string>> {
  const res = await fetch(`${SITE}/wp-json/wp/v2/${taxonomy}?per_page=100`);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${taxonomy} terms`);
  const terms = (await res.json()) as WpTerm[];
  return new Map(terms.map((t) => [t.id, t.name]));
}

function parseFrenchDate(termName: string): string | undefined {
  const match = termName.match(/(\d{1,2})\s+([a-zûé]+)\s+(\d{4})/i);
  if (!match) return undefined;
  const [, day, monthName, year] = match;
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return undefined;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function normalizeCountry(name: string): string {
  if (name === "Canada") return "Québec";
  return name;
}

async function fetchArtistPage(slug: string): Promise<{ time: string; description?: string; imageUrl?: string }> {
  const url = `${SITE}/artistes/${slug}/`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();
  const root = parse(html);

  const time = root.querySelector("h2.elementor-heading-title")?.textContent.trim() ?? "";

  const paragraphs = root
    .querySelectorAll(".elementor-widget-text-editor .elementor-widget-container")
    .map((el) => el.innerHTML)
    .filter((html) => !html.includes("Tous droits réservés"));
  const bio = htmlToText(paragraphs.join(""));
  const description = bio.length > 0 ? bio : undefined;

  const imageUrl = root.querySelector('meta[property="og:image"]')?.getAttribute("content");

  return { time, description, imageUrl: imageUrl || undefined };
}

export async function run(): Promise<void> {
  console.log("[rock-la-cauze-2026] Fetching artist list...");
  const [dateTerms, provenanceTerms] = await Promise.all([fetchTermMap("date"), fetchTermMap("provenance")]);

  const res = await fetch(`${SITE}/wp-json/wp/v2/artistes?per_page=100&editions=${EDITION_TERM_ID}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching artistes`);
  const artists = (await res.json()) as WpArtist[];
  console.log(`[rock-la-cauze-2026] Got ${artists.length} artists`);

  const rows: Row[] = [];
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};

  for (const artist of artists) {
    const artistName = artist.title.rendered.replace(/&rsquo;/g, "’").replace(/&#038;/g, "&");
    const dateTermId = artist.date[0];
    const date = dateTermId !== undefined ? parseFrenchDate(dateTerms.get(dateTermId) ?? "") : undefined;
    if (!date) {
      console.warn(`[rock-la-cauze-2026] Skipping ${artistName}: could not resolve date`);
      continue;
    }
    const countryTermId = artist.provenance[0];
    const country =
      countryTermId !== undefined ? normalizeCountry(provenanceTerms.get(countryTermId) ?? "") : undefined;

    const { time, description, imageUrl } = await fetchArtistPage(artist.slug);
    console.log(`[rock-la-cauze-2026]   ${artistName} — ${date} ${time}`);
    await new Promise((r) => setTimeout(r, 200));

    rows.push({
      date,
      venue: "Scène principale",
      paid: date !== "2026-08-06", // Thursday is free admission (per festival FAQ)
      time,
      artist: artistName,
      country,
    });

    artistDetailsMap[artistName] = { description, imageUrl, links: [] };
  }

  rows.sort(
    (a, b) => a.date.localeCompare(b.date) || (b.paid ? 1 : 0) - (a.paid ? 1 : 0) || a.time.localeCompare(b.time),
  );

  console.log(`[rock-la-cauze-2026] Built ${rows.length} rows`);
  await writeFestivalData(dataDir, rows, artistDetailsMap);
}
