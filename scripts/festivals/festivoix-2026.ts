import path from "node:path";
import { fileURLToPath } from "node:url";
import { HTMLElement, parse } from "node-html-parser";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, inferLinkLabel, writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/content/festivals/festivoix-2026");

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

function parseFrenchDate(raw: string): string {
  const match = raw.trim().match(/^(\d+)\s+(\S+)$/i);
  if (!match) throw new Error(`Cannot parse date: ${raw}`);
  const [, day, month] = match;
  const monthNum = FRENCH_MONTHS[month.toLowerCase()];
  if (!monthNum) throw new Error(`Unknown month: ${month}`);
  return `2026-${monthNum}-${day.padStart(2, "0")}`;
}

function parseTime(raw: string): string {
  // "21  h  55" → "21:55", "À partir de 23  h  00" → "23:00", "23  h" → "23:00"
  const clean = raw.replace(/[Àà]\s+partir\s+de\s*/i, "").trim();
  const match = clean.match(/(\d{1,2})\s*h\s*(\d{0,2})/i);
  if (!match) throw new Error(`Cannot parse time: ${raw}`);
  const [, h, m] = match;
  return `${h.padStart(2, "0")}:${(m || "00").padStart(2, "0")}`;
}

interface ShowEntry {
  detailUrl: string;
  artist: string;
  date: string;
  time: string;
  venue: string;
}

async function fetchShowEntries(): Promise<ShowEntry[]> {
  const res = await fetch("https://festivoix.com/fr/programmation/");
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching programmation`);
  const html = await res.text();
  const root = parse(html);

  const entries: ShowEntry[] = [];

  for (const jourEl of root.querySelectorAll("div.container_jour")) {
    const dateRaw = jourEl.querySelector("div.jour h3")?.textContent?.trim() ?? "";
    if (!dateRaw) continue;
    const date = parseFrenchDate(dateRaw);

    const itemJour = jourEl.querySelector("div.container_item_jour");
    if (!itemJour) continue;

    for (const node of itemJour.childNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (!node.classNames.includes("item_listing_2023")) continue;

      const href = node.getAttribute("href") ?? "";
      if (!href.includes("/programmation/")) continue;

      const heureRaw = node.querySelector("div.heure")?.textContent?.trim() ?? "";
      const artistName = node.querySelector("h4.titre")?.textContent?.trim() ?? "";
      const venueRaw = node.querySelector("div.scene")?.textContent?.trim() ?? "";

      if (!artistName || !heureRaw) continue;

      let time: string;
      try {
        time = parseTime(heureRaw);
      } catch {
        console.warn(`[festivoix-2026] Skipping "${artistName}" — cannot parse time: "${heureRaw}"`);
        continue;
      }

      entries.push({ detailUrl: href, artist: artistName, date, time, venue: venueRaw });
    }
  }

  return entries;
}

interface DetailData {
  paid: boolean;
  description?: string;
  imageUrl?: string;
  links: ArtistLink[];
}

async function fetchDetail(url: string): Promise<DetailData> {
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[festivoix-2026] HTTP ${res.status} for ${url}`);
    return { paid: true, links: [] };
  }
  const html = await res.text();
  const root = parse(html);

  const btnEl = root.querySelector(".container_billetterie a.btn");
  const btnText = btnEl?.textContent?.trim() ?? "";
  const paid = !/gratuit/i.test(btnText);

  const bioEl = root.querySelector("div.biographie");
  const description = bioEl ? htmlToText(bioEl.innerHTML) : undefined;

  const imgEl = root.querySelector("div.container_fiche_artiste_2023 div.image img");
  const rawSrc = imgEl?.getAttribute("src") ?? "";
  const imageUrl = rawSrc ? rawSrc.split("?")[0] : undefined;

  const links: ArtistLink[] = [];
  const seen = new Set<string>();

  for (const a of root.querySelectorAll("div.link_web a[href], a.btn_social[href]")) {
    const href = a.getAttribute("href") ?? "";
    if (href && !seen.has(href)) {
      seen.add(href);
      links.push({ label: inferLinkLabel(href), url: href });
    }
  }

  return { paid, description: description || undefined, imageUrl, links };
}

export async function run(): Promise<void> {
  console.log("[festivoix-2026] Fetching main programmation page...");
  const entries = await fetchShowEntries();
  console.log(`[festivoix-2026] Found ${entries.length} show entries`);

  const uniqueUrls = [...new Set(entries.map((e) => e.detailUrl))];
  console.log(`[festivoix-2026] Fetching ${uniqueUrls.length} artist detail pages...`);

  const detailCache = new Map<string, DetailData>();
  for (const url of uniqueUrls) {
    const slugMatch = url.match(/\/programmation\/([^/]+)\//);
    const label = slugMatch?.[1] ?? url;
    process.stdout.write(`  ${label}... `);
    detailCache.set(url, await fetchDetail(url));
    console.log("done");
    await new Promise((r) => setTimeout(r, 200));
  }

  const rows: Row[] = [];
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};

  for (const entry of entries) {
    const detail = detailCache.get(entry.detailUrl) ?? { paid: true, links: [] };

    rows.push({
      date: entry.date,
      venue: entry.venue,
      paid: detail.paid,
      time: entry.time,
      artist: entry.artist,
    });

    if (!artistDetailsMap[entry.artist]) {
      artistDetailsMap[entry.artist] = {
        description: detail.description,
        imageUrl: detail.imageUrl,
        links: detail.links,
      };
    }
  }

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.paid === b.paid ? 0 : a.paid ? -1 : 1) ||
      a.venue.localeCompare(b.venue) ||
      a.time.localeCompare(b.time),
  );

  await writeFestivalData(dataDir, rows, artistDetailsMap);
}
