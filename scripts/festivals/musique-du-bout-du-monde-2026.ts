import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, inferLinkLabel, writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/data/festivals/musique-du-bout-du-monde-2026");

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
  const match = raw.trim().match(/^(\d+)\s+(\S+)\s+(\d{4})$/i);
  if (!match) throw new Error(`Cannot parse date: ${raw}`);
  const [, day, month, year] = match;
  const monthNum = FRENCH_MONTHS[month.toLowerCase()];
  if (!monthNum) throw new Error(`Unknown month: ${month}`);
  return `${year}-${monthNum}-${day.padStart(2, "0")}`;
}

function parseVenue(raw: string): { venue: string; paid: boolean } {
  const gratuitMatch = raw.match(/^(.*?)\s*\((Gratuit|Free)\)\s*$/i);
  if (gratuitMatch) {
    return { venue: gratuitMatch[1].trim(), paid: false };
  }
  return { venue: raw.trim(), paid: true };
}

interface ShowCard {
  artist: string;
  detailUrl: string;
  time: string;
  venue: string;
  paid: boolean;
  date: string;
}

async function fetchShowCards(): Promise<ShowCard[]> {
  const res = await fetch("https://musiqueduboutdumonde.com/programmation/");
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching programmation`);
  const html = await res.text();
  const root = parse(html);

  const cards: ShowCard[] = [];
  let currentDate = "";

  for (const el of root.querySelectorAll("h2.programmation-date, div.card-relative")) {
    if (el.tagName === "H2" && el.classList.contains("programmation-date")) {
      currentDate = parseFrenchDate(el.textContent.trim());
      continue;
    }

    if (!currentDate) continue;

    const linkEl = el.querySelector("a.link-absolute");
    const detailUrl = linkEl?.getAttribute("href") ?? "";

    const artistEl = el.querySelector("p.artist-name");
    const artist = artistEl?.textContent.trim() ?? "";

    const detailEls = el.querySelectorAll("span.show-details");
    const time = detailEls[0]?.textContent.trim() ?? "";
    const venueRaw = detailEls[1]?.textContent.trim() ?? "";

    if (!artist || !time || !venueRaw) continue;

    const { venue, paid } = parseVenue(venueRaw);

    cards.push({ artist, detailUrl, time, venue, paid, date: currentDate });
  }

  return cards;
}

async function fetchArtistDetail(url: string): Promise<ArtistDetailEntry> {
  const res = await fetch(url);
  if (!res.ok) return { links: [] };
  const html = await res.text();
  const root = parse(html);

  const imageEl = root.querySelector("div.artist-gallery img");
  const imageUrl = imageEl?.getAttribute("src") ?? undefined;

  const webSiteSection = root.querySelector("div.artist-web-site");
  const socialSection = root.querySelector("div.social-media");

  const videoIframe = root.querySelector("iframe[data-src-cmplz*='youtube.com/embed/']");
  const embedSrc = videoIframe?.getAttribute("data-src-cmplz") ?? "";
  const videoId = embedSrc.match(/youtube\.com\/embed\/([^?&]+)/)?.[1];
  const videoLink: ArtistLink | null = videoId
    ? { label: "Vidéo officielle", url: `https://www.youtube.com/watch?v=${videoId}` }
    : null;

  const links: ArtistLink[] = videoLink ? [videoLink] : [];
  for (const aEl of [
    ...(webSiteSection?.querySelectorAll("a") ?? []),
    ...(socialSection?.querySelectorAll("a") ?? []),
  ]) {
    const href = aEl.getAttribute("href");
    if (href?.startsWith("http")) {
      links.push({ label: inferLinkLabel(href), url: href });
    }
  }

  const col = root.querySelector("div.col-sm-8");
  const webSiteIdx = col?.innerHTML?.indexOf("artist-web-site") ?? -1;
  const bioHtml = webSiteIdx >= 0 ? (col?.innerHTML.slice(0, webSiteIdx) ?? "") : (col?.innerHTML ?? "");
  const bioRoot = parse(bioHtml);
  const paras = bioRoot
    .querySelectorAll("p")
    .map((p) => htmlToText(p.innerHTML).trim())
    .filter((t) => t.length > 20);
  const description = paras.join("\n\n") || undefined;

  return { imageUrl, links, description };
}

export async function run(): Promise<void> {
  console.log("[musique-du-bout-du-monde-2026] Fetching programmation...");
  const cards = await fetchShowCards();
  console.log(`[musique-du-bout-du-monde-2026] Got ${cards.length} shows`);

  const rows: Row[] = [];
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};
  const seen = new Set<string>();

  for (const card of cards) {
    rows.push({
      date: card.date,
      time: card.time,
      venue: card.venue,
      paid: card.paid,
      artist: card.artist,
    });

    if (!seen.has(card.artist) && card.detailUrl) {
      seen.add(card.artist);
      await new Promise((r) => setTimeout(r, 200));
      console.log(`[musique-du-bout-du-monde-2026] Fetching artist: ${card.artist}`);
      artistDetailsMap[card.artist] = await fetchArtistDetail(card.detailUrl);
    }
  }

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(a.paid) - Number(b.paid) ||
      a.venue.localeCompare(b.venue) ||
      a.time.localeCompare(b.time),
  );

  await writeFestivalData(dataDir, rows, artistDetailsMap);
}
