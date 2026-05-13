import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, inferLinkLabel, writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/content/festivals/cigale-2026");

const FRENCH_MONTHS: Record<string, string> = {
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

const QC_CITIES = new Set([
  "montréal",
  "montreal",
  "québec",
  "quebec",
  "sherbrooke",
  "laval",
  "gatineau",
  "longueuil",
  "lévis",
  "levis",
  "saguenay",
  "trois-rivières",
  "trois-rivieres",
]);

function parseFrenchDate(titre: string): string {
  const match = titre.match(/^(\d+)\s+(\S+)\s+(\d{4})$/i);
  if (!match) throw new Error(`Cannot parse date: ${titre}`);
  const [, day, month, year] = match;
  const monthNum = FRENCH_MONTHS[month.toLowerCase()];
  if (!monthNum) throw new Error(`Unknown month: ${month}`);
  return `${year}-${monthNum}-${day.padStart(2, "0")}`;
}

function normalizeCountry(raw: string): string {
  if (QC_CITIES.has(raw.trim().toLowerCase())) return "Québec";
  return raw.trim();
}

function extractDescription(texteSimple: string): string | undefined {
  // Strip "Country | Genre" prefix — stops at first <, \n, or . (genre boundary)
  const stripped = texteSimple.replace(/^[^|]*\|[^<\n.]*(?:\.\s*)?/, "").trim();
  const text = htmlToText(stripped);
  return text || undefined;
}

function normalizeLink(url: string): string {
  // Decode Instagram login redirects: ?next=<encoded-url>
  try {
    const u = new URL(url);
    if (u.hostname.includes("instagram.com") && u.pathname.includes("/accounts/login")) {
      const next = u.searchParams.get("next");
      if (next) return decodeURIComponent(next);
    }
  } catch {}
  return url;
}

interface ArtistEntry {
  page: { title: string };
  heures: string;
  texte: string;
  texteSimple: string;
  dateFestival: { titre: string };
  imageSimple: { url: string };
  liensReseaux: Array<{ lien: string }>;
}

export async function run(): Promise<void> {
  const url = "https://cigalequebec.com/api/artistes.json";
  console.log(`[cigale-2026] Fetching ${url}...`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const json = (await res.json()) as { data: ArtistEntry[] };
  const items = json.data;
  console.log(`[cigale-2026] Got ${items.length} artists`);

  const rows: Row[] = [];
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};

  for (const item of items) {
    const name = item.page.title;
    const date = parseFrenchDate(item.dateFestival.titre);
    const time = item.heures.replace("h", ":");
    const venue = item.texte;

    const headerMatch = item.texteSimple.match(/^([^|]+)\|([^<\n.]+)/);
    const rawCountry = headerMatch?.[1]?.trim() ?? "";
    const genre = headerMatch?.[2]?.trim() ?? "";
    const country = rawCountry ? normalizeCountry(rawCountry) : undefined;

    const description = extractDescription(item.texteSimple);
    const imageUrl = item.imageSimple?.url || undefined;

    const links: ArtistLink[] = (item.liensReseaux ?? [])
      .map((l) => normalizeLink(l.lien))
      .filter(Boolean)
      .map((u) => ({ label: inferLinkLabel(u), url: u }));

    rows.push({
      date,
      venue,
      paid: true,
      time,
      artist: name,
      country: country || undefined,
      genre: genre || undefined,
    });

    if (!artistDetailsMap[name]) {
      artistDetailsMap[name] = { description, imageUrl, links };
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.venue.localeCompare(b.venue) || a.time.localeCompare(b.time));

  await writeFestivalData(dataDir, rows, artistDetailsMap);
}
