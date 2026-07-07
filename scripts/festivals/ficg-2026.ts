import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, inferLinkLabel, writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/data/festivals/ficg-2026");

const PROGRAMMATION_URL = "https://ficg.qc.ca/programmation-complete/";

function parseCardDate(raw: string): string {
  // "Jeudi 06.08 (2026)" -> "2026-08-06"
  const match = raw.trim().match(/(\d{2})\.(\d{2})\s*\((\d{4})\)/);
  if (!match) throw new Error(`Cannot parse date: ${raw}`);
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function parseCardTime(raw: string): string {
  // "18h00" -> "18:00"
  const match = raw.trim().match(/(\d{1,2})\s*h\s*(\d{2})/i);
  if (!match) throw new Error(`Cannot parse time: ${raw}`);
  const [, h, m] = match;
  return `${h.padStart(2, "0")}:${m}`;
}

interface EventEntry {
  detailUrl: string;
  date: string;
  time: string;
  venue: string;
  paid: boolean;
}

interface ParticipantRef {
  name: string;
  detailUrl: string;
  genre?: string;
}

async function fetchEvents(): Promise<EventEntry[]> {
  const res = await fetch(PROGRAMMATION_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching programmation`);
  let html = await res.text();
  // Drop the "Événements passés" section (postponed/past shows, not part of this edition).
  const pastIdx = html.indexOf('id="past-events"');
  if (pastIdx !== -1) html = html.slice(0, pastIdx);
  const root = parse(html);

  const entries: EventEntry[] = [];
  for (const cardEl of root.querySelectorAll(".c-card")) {
    const dateRaw = cardEl.querySelector(".c-card_date")?.textContent ?? "";
    const timeRaw = cardEl.querySelector(".c-card_hour")?.textContent ?? "";
    const venue = cardEl.querySelector(".c-card_location")?.textContent?.trim() ?? "";
    const detailUrl = cardEl.querySelector(".c-card_artists")?.getAttribute("href") ?? "";
    if (!dateRaw || !timeRaw || !venue || !detailUrl) continue;

    const filterAttr = cardEl.closest("[data-filter-item]")?.getAttribute("data-filter-item") ?? "";
    const paid = !/gratuit/.test(filterAttr);

    entries.push({
      detailUrl,
      date: parseCardDate(dateRaw),
      time: parseCardTime(timeRaw),
      venue,
      paid,
    });
  }
  return entries;
}

async function fetchParticipants(eventUrl: string): Promise<ParticipantRef[]> {
  const res = await fetch(eventUrl);
  if (!res.ok) {
    console.warn(`[ficg-2026] HTTP ${res.status} for ${eventUrl}`);
    return [];
  }
  const html = await res.text();
  const root = parse(html);

  const participants: ParticipantRef[] = [];
  for (const artistEl of root.querySelectorAll("#participants .c-artist")) {
    const detailUrl = artistEl.getAttribute("href") ?? "";
    const name = artistEl.querySelector(".c-artist_title")?.textContent?.trim() ?? "";
    const genre = artistEl.querySelector(".c-artist_categories .o-tag")?.textContent?.trim();
    if (!name || !detailUrl) continue;
    participants.push({ name, detailUrl, genre: genre || undefined });
  }
  return participants;
}

interface DetailData {
  description?: string;
  imageUrl?: string;
  links: ArtistLink[];
}

async function fetchArtistDetail(url: string): Promise<DetailData> {
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[ficg-2026] HTTP ${res.status} for ${url}`);
    return { links: [] };
  }
  const html = await res.text();
  const root = parse(html);

  const bioEl = root.querySelector(".c-artist-details_content");
  const description = bioEl ? htmlToText(bioEl.innerHTML) : undefined;

  const rawSrc = root.querySelector(".c-artist-header_image")?.getAttribute("src") ?? "";
  const imageUrl = rawSrc ? rawSrc.split("?")[0] : undefined;

  const links: ArtistLink[] = [];
  const seen = new Set<string>();
  for (const a of root.querySelectorAll(".c-artist-details_social")) {
    const href = a.getAttribute("href") ?? "";
    if (href && !seen.has(href)) {
      seen.add(href);
      links.push({ label: inferLinkLabel(href), url: href });
    }
  }

  return { description: description || undefined, imageUrl, links };
}

export async function run(): Promise<void> {
  console.log("[ficg-2026] Fetching programmation page...");
  const events = await fetchEvents();
  console.log(`[ficg-2026] Found ${events.length} events`);

  const rows: Row[] = [];
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};
  const artistUrlByName = new Map<string, string>();

  for (const event of events) {
    process.stdout.write(`  ${event.detailUrl}... `);
    const participants = await fetchParticipants(event.detailUrl);
    console.log(`${participants.length} artist(s)`);
    await new Promise((r) => setTimeout(r, 200));

    for (const participant of participants) {
      rows.push({
        date: event.date,
        time: event.time,
        venue: event.venue,
        paid: event.paid,
        artist: participant.name,
        genre: participant.genre,
      });
      if (!artistUrlByName.has(participant.name)) {
        artistUrlByName.set(participant.name, participant.detailUrl);
      }
    }
  }

  console.log(`[ficg-2026] Fetching ${artistUrlByName.size} artist detail pages...`);
  for (const [name, url] of artistUrlByName) {
    process.stdout.write(`  ${name}... `);
    artistDetailsMap[name] = await fetchArtistDetail(url);
    console.log("done");
    await new Promise((r) => setTimeout(r, 200));
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
