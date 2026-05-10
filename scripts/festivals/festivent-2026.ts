import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, writeFestivalData } from "../update-schedule.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/content/festivals/festivent-2026");

const DATES = ["2026-07-29", "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"];

interface ParsedCard {
  artist: string;
  genre: string;
  venue: string;
  time: string;
  imageUrl: string;
  slug: string;
  date: string;
}

function parseCards(html: string): ParsedCard[] {
  const root = parse(html);
  const eventsSection = root.querySelector("[data-module-events]");
  if (!eventsSection) throw new Error("Could not find data-module-events section");

  const slides = eventsSection.querySelectorAll(".o-carousel_cell");
  const cards: ParsedCard[] = [];

  for (let i = 0; i < slides.length && i < DATES.length; i++) {
    const slide = slides[i];
    const date = DATES[i];

    for (const card of slide.querySelectorAll("[data-filters-item]")) {
      const filterData = card.getAttribute("data-filters-item") ?? "";
      let filterObj: { type?: string };
      try {
        filterObj = JSON.parse(filterData) as { type?: string };
      } catch {
        continue;
      }
      if (filterObj.type !== "musicale") continue;

      const artist = card.querySelector(".c-card_title")?.textContent.trim() ?? "";
      const genre = card.querySelector(".c-card_tag")?.textContent.trim() ?? "";
      const venue = card.querySelector(".c-card_subtitle")?.textContent.trim() ?? "";
      const time = card.querySelector(".c-timestamp")?.textContent.trim() ?? "";
      const imageUrl = card.querySelector(".c-card_image")?.getAttribute("src") ?? "";

      const linkHref = card.querySelector('a[href*="festivent.ca/programmation/"]')?.getAttribute("href") ?? "";
      const slugMatch = linkHref.match(/festivent\.ca\/programmation\/([^/"]+)\/?/);
      const slug = slugMatch ? slugMatch[1] : "";

      if (artist && slug) {
        cards.push({ artist, genre, venue, time, imageUrl, slug, date });
      }
    }
  }

  return cards;
}

async function fetchEventDetails(slug: string): Promise<{ description?: string; youtubeId?: string }> {
  const url = `https://festivent.ca/programmation/${slug}/`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return {};
  }
  if (!res.ok) return {};
  const html = await res.text();

  const root = parse(html);
  const descSection = root.querySelector(".c-event-intro_description");
  const paragraphs: string[] = [];
  if (descSection) {
    for (const p of descSection.querySelectorAll("p")) {
      const text = htmlToText(p.outerHTML);
      if (text) paragraphs.push(text);
    }
  }
  const description = paragraphs.length > 0 ? paragraphs.join("\n\n") : undefined;

  const ytMatch = html.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
  const youtubeId = ytMatch ? ytMatch[1] : undefined;

  return { description, youtubeId };
}

export async function run(): Promise<void> {
  const url = "https://festivent.ca/programmation/";
  console.log(`[festivent-2026] Fetching ${url}...`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const html = await res.text();
  console.log(`[festivent-2026] Got ${html.length} bytes of HTML`);

  const cards = parseCards(html);
  console.log(`[festivent-2026] Parsed ${cards.length} musicale cards`);

  const details: { description?: string; youtubeId?: string }[] = [];
  for (const card of cards) {
    const result = await fetchEventDetails(card.slug);
    console.log(`[festivent-2026] Fetched details for ${card.artist}`);
    details.push(result);
    await new Promise((r) => setTimeout(r, 200));
  }

  const rows: Row[] = [];
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const { description, youtubeId } = details[i];

    const links: ArtistLink[] = youtubeId
      ? [{ label: "Vidéo officielle", url: `https://www.youtube.com/watch?v=${youtubeId}` }]
      : [];

    rows.push({
      date: card.date,
      venue: card.venue,
      paid: true,
      time: card.time,
      artist: card.artist,
      genre: card.genre,
    });

    artistDetailsMap[card.artist] = {
      description,
      imageUrl: card.imageUrl || undefined,
      links,
    };
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.venue.localeCompare(b.venue) || a.time.localeCompare(b.time));

  await writeFestivalData(dataDir, rows, artistDetailsMap);
}
