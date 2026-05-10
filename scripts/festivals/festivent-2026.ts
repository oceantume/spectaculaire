import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, writeFestivalData } from "../update-schedule.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/content/festivals/festivent-2026");

const DATES = ["2026-07-29", "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"];

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&rsquo;/gi, "’")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 10)))
    .trim();
}

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
  const eventsSectionMatch = html.match(/data-module-events[\s\S]*/);
  if (!eventsSectionMatch) throw new Error("Could not find data-module-events section");

  const eventsSection = eventsSectionMatch[0];
  const slides = eventsSection.split(/<div class="o-carousel_cell"/);

  const cards: ParsedCard[] = [];

  // slides[0] is before the first carousel cell, so slide index starts at 1 → date index 0
  for (let i = 1; i < slides.length && i - 1 < DATES.length; i++) {
    const slide = slides[i];
    const date = DATES[i - 1];

    const cardPattern =
      /<div[^>]*class="[^"]*c-card[^"]*"[^>]*data-filters-item='([^']+)'[\s\S]*?(?=<div[^>]*data-filters-item=|$)/g;

    for (const cardMatch of slide.matchAll(cardPattern)) {
      const filterData = cardMatch[1];
      let filterObj: { type?: string };
      try {
        filterObj = JSON.parse(filterData) as { type?: string };
      } catch {
        continue;
      }
      if (filterObj.type !== "musicale") continue;

      const cardHtml = cardMatch[0];

      const titleMatch = cardHtml.match(/class="[^"]*c-card_title[^"]*"[^>]*>([\s\S]*?)<\/(?:h\d|div|span|p)>/);
      const artist = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, "").trim()) : "";

      const tagMatch = cardHtml.match(/class="[^"]*c-card_tag[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|p)>/);
      const genre = tagMatch ? decodeHtmlEntities(tagMatch[1].replace(/<[^>]+>/g, "").trim()) : "";

      const subtitleMatch = cardHtml.match(/class="[^"]*c-card_subtitle[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|p)>/);
      const venue = subtitleMatch ? decodeHtmlEntities(subtitleMatch[1].replace(/<[^>]+>/g, "").trim()) : "";

      const timeMatch = cardHtml.match(/class="[^"]*c-timestamp[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|p|time)>/);
      const time = timeMatch ? timeMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      const imageMatch = cardHtml.match(/class="[^"]*c-card_image[^"]*"[^>]*src="([^"]+)"/);
      const imageUrl = imageMatch ? imageMatch[1] : "";

      const linkMatch = cardHtml.match(/href="https?:\/\/festivent\.ca\/programmation\/([^/"]+)\/?"/);
      const slug = linkMatch ? linkMatch[1] : "";

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

  const descSectionMatch = html.match(/class="[^"]*c-event-intro_description[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  const descHtml = descSectionMatch ? descSectionMatch[1] : "";
  const paragraphs: string[] = [];
  for (const pMatch of descHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = decodeHtmlEntities(htmlToText(pMatch[1]));
    if (text) paragraphs.push(text);
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
