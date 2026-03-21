#!/usr/bin/env node
// Fetches the Envol et Macadam schedule page, parses artist/show data,
// fetches artist detail pages, and writes envolet-schedule.json + envolet-artist-details.json.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import type { ArtistDetailEntry, ArtistLink, Row } from "../src/data.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scheduleOutPath = path.join(__dirname, "../assets/envolet-schedule.json");
const artistDetailsOutPath = path.join(__dirname, "../assets/envolet-artist-details.json");

const scheduleUrl = "https://envoletmacadam.com/programmation-2025/horaires/";
const baseUrl = "https://envoletmacadam.com";

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

function parseFrenchDate(header: string): string | null {
	const m = header.match(/(\d+)\s+(\w+)\s+(\d{4})/);
	if (!m) return null;
	const [, day, monthWord, year] = m;
	const month = MONTHS[monthWord.toLowerCase()];
	if (!month) return null;
	return `${year}-${month}-${day.padStart(2, "0")}`;
}

function parseTime(raw: string): string {
	// "20h00" → "20:00"
	const m = raw.match(/(\d{1,2})h(\d{2})/);
	if (!m) throw new Error(`Cannot parse time from: ${raw}`);
	return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function domainToLabel(url: string): string {
	if (url.includes("facebook.com")) return "Facebook";
	if (url.includes("instagram.com")) return "Instagram";
	if (url.includes("x.com") || url.includes("twitter.com")) return "X";
	if (url.includes("tiktok.com")) return "TikTok";
	return "Site officiel";
}

console.log(`Fetching ${scheduleUrl}...`);
const res = await fetch(scheduleUrl);
if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
const html = await res.text();
console.log(`Got ${html.length} bytes of HTML`);

// Split into day sections by iterating over <h2> elements
interface DaySection {
	date: string;
	htmlSlice: string;
}

const daySections: DaySection[] = [];
const h2Regex = /<h2[^>]*>/gi;
const h2Matches: { index: number; endIndex: number; text: string }[] = [];

// Find all h2 open tags and their positions
let h2Match: RegExpExecArray | null;
while ((h2Match = h2Regex.exec(html)) !== null) {
	const start = h2Match.index;
	const closeTag = html.indexOf("</h2>", start);
	if (closeTag === -1) continue;
	const endIndex = closeTag + "</h2>".length;
	const innerHtml = html.slice(start + h2Match[0].length, closeTag);
	const root = parse(innerHtml);
	const text = root.text.trim();
	h2Matches.push({ index: start, endIndex, text });
}

for (let i = 0; i < h2Matches.length; i++) {
	const { endIndex, text } = h2Matches[i];
	const date = parseFrenchDate(text);
	if (!date) continue;
	const nextStart = i + 1 < h2Matches.length ? h2Matches[i + 1].index : html.length;
	daySections.push({ date, htmlSlice: html.slice(endIndex, nextStart) });
}

console.log(`Found ${daySections.length} day sections`);

// Parse artist entries from each day section
interface ParsedShow {
	slug: string;
	artist: string;
	date: string;
	time: string;
}

const parsedShows: ParsedShow[] = [];

for (const { date, htmlSlice } of daySections) {
	const root = parse(htmlSlice);
	const artistLinks = root
		.querySelectorAll('a[href*="/artistes/"]')
		.filter((a) => !!a.querySelector("h5"));

	for (const link of artistLinks) {
		const href = link.getAttribute("href") ?? "";
		const slugMatch = href.match(/\/artistes\/([^/]+)\/?$/);
		if (!slugMatch) continue;
		const slug = slugMatch[1];

		const name = link.querySelector("h5")?.text.trim();
		if (!name) continue;

		const parent = link.parentNode;
		const timeLi = parent
			?.querySelectorAll("li")
			.find((li) => /\d{1,2}h\d{2}/.test(li.text));
		if (!timeLi) continue;
		const time = parseTime(timeLi.text.trim());

		parsedShows.push({ slug, artist: name, date, time });
	}
}

console.log(`Found ${parsedShows.length} shows`);

// Fetch all artist detail pages in parallel
const uniqueSlugs = [...new Set(parsedShows.map((s) => s.slug))];
const artistDetailPages = await Promise.all(
	uniqueSlugs.map(async (slug) => {
		const url = `${baseUrl}/artistes/${slug}/`;
		try {
			const r = await fetch(url);
			if (!r.ok) return { slug, html: "" };
			return { slug, html: await r.text() };
		} catch {
			return { slug, html: "" };
		}
	}),
);

console.log(`Fetched ${artistDetailPages.length} artist pages`);

const slugToPageHtml = new Map(artistDetailPages.map(({ slug, html: h }) => [slug, h]));

// Build rows sorted by date then time
const sorted = [...parsedShows].sort(
	(a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
);

const rows: Row[] = [];
const artistDetailsMap: Record<string, ArtistDetailEntry> = {};

for (const { slug, artist, date, time } of sorted) {
	const row: Row = {
		date,
		venue: "Agora port de Québec",
		paid: true,
		time,
		artist,
		genre: "",
	};
	rows.push(row);

	const pageHtml = slugToPageHtml.get(slug) ?? "";
	if (!pageHtml) {
		artistDetailsMap[artist] = { links: [] };
		continue;
	}

	const root = parse(pageHtml);

	const bio = root
		.querySelectorAll("p")
		.map((p) => p.text.trim())
		.filter(Boolean)
		.join("\n\n");
	const description = bio || undefined;

	const imageUrl = root
		.querySelectorAll('img[src*="wp-content/uploads"]')
		.find((img) => !(img.getAttribute("src") ?? "").includes("no-pics"))
		?.getAttribute("src");

	const socialUl = root.querySelector("ul.liste-social-icon__band");
	const links: ArtistLink[] = (socialUl?.querySelectorAll("a[href]") ?? [])
		.map((a) => {
			const url = a.getAttribute("href") ?? "";
			return { label: domainToLabel(url), url };
		})
		.filter((l) => l.url);

	artistDetailsMap[artist] = { description, imageUrl, links };
}

await fs.writeFile(scheduleOutPath, JSON.stringify(rows, null, 2));
console.log(`Written ${rows.length} rows to ${scheduleOutPath}`);

await fs.mkdir(path.dirname(artistDetailsOutPath), { recursive: true });
await fs.writeFile(artistDetailsOutPath, JSON.stringify(artistDetailsMap, null, 2));
console.log(`Written ${Object.keys(artistDetailsMap).length} artist details to ${artistDetailsOutPath}`);
