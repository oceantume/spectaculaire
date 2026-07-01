import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, inferLinkLabel, writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/content/festivals/strochxp-2026");

const SITE_ORIGIN = "https://www.strochxp.com";
const SCHEDULE_URL = `${SITE_ORIGIN}/programmation/horaire-des-spectacles`;

function normalizeCountry(raw: string): string {
  const trimmed = raw.trim();
  if (/^(montréal|montreal|québec|quebec)$/i.test(trimmed)) return "Québec";
  return trimmed;
}

interface EventLdJson {
  startDate: string;
  image?: string;
  description?: string;
}

export async function run(): Promise<void> {
  console.log(`[strochxp-2026] Fetching ${SCHEDULE_URL}...`);
  const scheduleRes = await fetch(SCHEDULE_URL);
  if (!scheduleRes.ok) throw new Error(`HTTP ${scheduleRes.status} ${scheduleRes.statusText}`);
  const scheduleRoot = parse(await scheduleRes.text());

  type ShowRef = { href: string; venue: string };
  const shows: ShowRef[] = [];
  for (const stage of scheduleRoot.querySelectorAll(".schedule-stage")) {
    const venue = stage.querySelector(".schedule-stage__information strong")?.textContent.trim() ?? "";
    for (const article of stage.querySelectorAll(".schedule-event")) {
      const link = article.querySelector(".decal-h3 a");
      const href = link?.getAttribute("href");
      if (!href) continue;
      shows.push({ href: new URL(href, SITE_ORIGIN).toString(), venue });
    }
  }
  console.log(`[strochxp-2026] Found ${shows.length} shows`);

  const rows: Row[] = [];
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};

  for (const show of shows) {
    await new Promise((r) => setTimeout(r, 200));
    const res = await fetch(show.href);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${show.href}`);
    const root = parse(await res.text());

    const ldJsonScript = root
      .querySelectorAll("script[type='application/ld+json']")
      .find((s) => s.textContent.includes('"@type":"Event"'));
    if (!ldJsonScript) throw new Error(`No Event ld+json found on ${show.href}`);
    const ldJson = JSON.parse(ldJsonScript.textContent) as EventLdJson;

    const artist = root.querySelector("h1 span")?.textContent.trim() ?? "";
    const date = ldJson.startDate.slice(0, 10);
    const time = ldJson.startDate.slice(11, 16);

    const genre = root.querySelector("#lnkStyle")?.textContent.trim() || undefined;
    const rawCountry = root
      .querySelectorAll(".event__specification")
      .find((el) => el.querySelector("span")?.textContent.trim() === "Provenance")
      ?.querySelector("strong")
      ?.textContent.trim();
    const country = rawCountry ? normalizeCountry(rawCountry) : undefined;
    const paid = root.querySelector(".event__buy__button") !== null;

    const descriptionHtml = root.querySelector(".event__description")?.innerHTML;
    const description = descriptionHtml ? htmlToText(descriptionHtml) : undefined;

    const links: ArtistLink[] = root
      .querySelectorAll(".event__button--social")
      .map((a) => a.getAttribute("href"))
      .filter((href): href is string => Boolean(href))
      .map((url) => ({ label: inferLinkLabel(url), url }));

    rows.push({
      date,
      venue: show.venue,
      paid,
      time,
      artist,
      country,
      genre,
    });

    if (!artistDetailsMap[artist]) {
      artistDetailsMap[artist] = { description, imageUrl: ldJson.image, links };
    }
  }

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(b.paid) - Number(a.paid) ||
      a.venue.localeCompare(b.venue) ||
      a.time.localeCompare(b.time),
  );

  await writeFestivalData(dataDir, rows, artistDetailsMap);
}
