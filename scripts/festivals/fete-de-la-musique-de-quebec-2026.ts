import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import type { ArtistDetailEntry, Row } from "../../src/types.ts";
import { writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/content/festivals/fete-de-la-musique-de-quebec-2026");

// Sponsor names stripped; short names from fetedelamusiquedequebec.com/les-scenes/
const VENUE_NAMES: Record<string, string> = {
  "Scène du Parvis WVE audiovisuel": "Scène du Parvis",
  "Scène SDC Quartier Saint-Jean-Baptiste": "Scène Saint-Jean-Baptiste",
  "Scène Passage Olympia Long & McQuade": "Scène Passage Olympia",
};

// Dates hardcoded: Fête de la Musique is always on June 21 (Sunday in 2026), Fri–Sun
const DAY_DATES: Record<string, string> = {
  vendredi: "2026-06-19",
  samedi: "2026-06-20",
  dimanche: "2026-06-21",
};

function parseTime(slot: string): string {
  const match = slot.match(/^(\d{1,2})[Hh](\d{2})/);
  if (!match) return "00:00";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function normKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function run(): Promise<void> {
  const [progRes, artistesRes] = await Promise.all([
    fetch("https://fetedelamusiquedequebec.com/programmation/"),
    fetch("https://fetedelamusiquedequebec.com/artistes-2026/"),
  ]);
  const [progHtml, artistesHtml] = await Promise.all([progRes.text(), artistesRes.text()]);

  // Build image map: normalized name → image URL
  const imageMap: Record<string, string> = {};
  const artistesDoc = parse(artistesHtml);
  for (const card of artistesDoc.querySelectorAll(".elementskit-info-image-box")) {
    const img = card.querySelector("img");
    const h5 = card.querySelector("h5.elementskit-info-box-title");
    if (!img || !h5) continue;
    const name = h5.text.trim();
    const src = img.getAttribute("src")?.replace(/-\d+x\d+(\.\w+)$/, "$1") ?? "";
    if (!name || !src) continue;
    const key = normKey(name);
    imageMap[key] = src;
    // Also store without spaces to handle "Black Magic" ↔ "Blackmagic" etc.
    imageMap[key.replace(/\s+/g, "")] = src;
  }
  console.log(`[fete-de-la-musique-de-quebec-2026] ${Object.keys(imageMap).length} artist images loaded`);

  // Determine which day each tablepress table belongs to by traversing in document order:
  // each table inherits the most recent h2 day heading that preceded it.
  const progDoc = parse(progHtml);
  const tableDay: Record<string, string> = {};
  const processedTables = new Set<string>();
  let currentDay = "";

  for (const el of progDoc.querySelectorAll("*")) {
    if (el.tagName === "H2") {
      const text = el.text.trim().toLowerCase();
      if (DAY_DATES[text]) currentDay = text;
    } else if (el.tagName === "TABLE") {
      const id = el.getAttribute("id") ?? "";
      if (id.startsWith("tablepress-") && currentDay && !tableDay[id]) {
        tableDay[id] = currentDay;
      }
    }
  }

  const rows: Row[] = [];
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};

  for (const table of progDoc.querySelectorAll("table[id^='tablepress-']")) {
    const tableId = table.getAttribute("id") ?? "";
    // Skip if day not resolved or if we already processed this table ID
    if (!tableDay[tableId] || processedTables.has(tableId)) continue;
    processedTables.add(tableId);

    const day = tableDay[tableId];
    const date = DAY_DATES[day];

    // Venue names from thead th elements (first td is the time column, skip it)
    const venues: string[] = table.querySelectorAll("thead th").map((th) => th.text.trim());

    for (const tr of table.querySelectorAll("tbody tr")) {
      const cells = tr.querySelectorAll("td");
      if (cells.length < 2) continue;

      const timeSlot = cells[0].text.trim();
      if (!timeSlot) continue;
      const time = parseTime(timeSlot);

      const seenArtists = new Set<string>();
      for (let i = 1; i < cells.length; i++) {
        const artistName = cells[i].text.trim();
        if (!artistName || seenArtists.has(artistName)) continue;
        seenArtists.add(artistName);

        const rawVenue = venues[i - 1] ?? "";
        const venue = VENUE_NAMES[rawVenue] ?? rawVenue;
        rows.push({ date, time, venue, artist: artistName, paid: false });

        if (!artistDetailsMap[artistName]) {
          const key = normKey(artistName);
          const imgUrl = imageMap[key] ?? imageMap[key.replace(/\s+/g, "")];
          artistDetailsMap[artistName] = { imageUrl: imgUrl, links: [] };
        }
      }
    }
  }

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.paid === b.paid ? 0 : a.paid ? -1 : 1) ||
      a.venue.localeCompare(b.venue) ||
      a.time.localeCompare(b.time),
  );

  console.log(`[fete-de-la-musique-de-quebec-2026] ${rows.length} rows`);
  await writeFestivalData(dataDir, rows, artistDetailsMap);
}
