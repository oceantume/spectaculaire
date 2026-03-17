#!/usr/bin/env node
// Fetches the FEQ programmation page, parses the embedded data, transforms it,
// and writes assets/schedule.json in a single pass (no intermediate file).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import type { ArtistDetailEntry, ArtistLink, Row } from "../src/data.ts";

interface Venue {
	id: number;
	ln: string; // location name
	tt: boolean; // ticketed (paid)
	or: number; // order
}

interface Artist {
	te: string; // text/name
	cy: string; // country
	ds: string; // description
	dl?: string; // image path
	ls?: ArtistLink[];
	sc: { name: string }; // subcategory
}

interface Show {
	st: string; // start time (UTC)
	ve: number; // venue id
	at: Artist;
}

interface MamData {
	ci: string; // image base URL
	ve: Venue[];
	sw: Show[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scheduleOutPath = path.join(__dirname, "../assets/schedule.json");
const artistDetailsOutPath = path.join(__dirname, "../assets/artist-details.json");
const overridesPath = path.join(__dirname, "../assets/youtube-overrides.json");

const url = "https://www.feq.ca/fr/programmation";
console.log(`Fetching ${url}...`);

const res = await fetch(url);
if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

const html = await res.text();
console.log(`Got ${html.length} bytes of HTML`);

// SvelteKit embeds: const data = [...]; in a large inline script tag.
// We find the start of the array and use a bracket counter to find its end.
const marker = "const data = ";
const startIdx = html.indexOf(marker);
if (startIdx === -1)
	throw new Error("Could not find 'const data' in page HTML");

const arrayStart = startIdx + marker.length;
if (html[arrayStart] !== "[")
	throw new Error(
		`Expected '[' at position ${arrayStart}, got '${html[arrayStart]}'`,
	);

// Walk forward counting brackets to find the end of the array literal
let depth = 0;
let inString = false;
let stringChar: string | null = null;
let escaped = false;
let arrayEnd = -1;

for (let i = arrayStart; i < html.length; i++) {
	const ch = html[i];

	if (escaped) {
		escaped = false;
		continue;
	}
	if (ch === "\\") {
		escaped = true;
		continue;
	}

	if (inString) {
		if (ch === stringChar) inString = false;
		continue;
	}

	if (ch === '"' || ch === "'") {
		inString = true;
		stringChar = ch;
		continue;
	}
	if (ch === "[" || ch === "{") depth++;
	else if (ch === "]" || ch === "}") {
		depth--;
		if (depth === 0) {
			arrayEnd = i + 1;
			break;
		}
	}
}

if (arrayEnd === -1) throw new Error("Could not find end of data array");

const jsLiteral = html.slice(arrayStart, arrayEnd);
console.log(`Extracted data literal: ${jsLiteral.length} chars`);

// Evaluate in a sandboxed context — the literal contains unquoted JS object keys
const raw = vm.runInNewContext(`(${jsLiteral})`, {}) as [unknown, { data: { mamData: MamData } }];
console.log(`Parsed successfully. Top-level entries: ${raw.length}`);

let youtubeOverrides: Record<string, string> = {};
try {
	const overridesRaw = await fs.readFile(overridesPath, "utf-8");
	youtubeOverrides = JSON.parse(overridesRaw) as Record<string, string>;
	console.log(`Loaded ${Object.keys(youtubeOverrides).length} YouTube overrides`);
} catch (err: unknown) {
	if ((err as NodeJS.ErrnoException).code === "ENOENT") {
		console.log("No youtube-overrides.json found, skipping overrides");
	} else {
		throw err;
	}
}
const youtubeOverridesNormalized = new Map(
	Object.entries(youtubeOverrides).map(([name, url]) => [name.toLowerCase().trim(), url]),
);

// Transform
const { ci, ve, sw } = raw[1].data.mamData;

const venueById = Object.fromEntries(ve.map((v) => [v.id, v]));

const venueOrderByLn: Record<string, number> = {};
for (const v of ve) {
	if (!(v.ln in venueOrderByLn) || v.or < venueOrderByLn[v.ln])
		venueOrderByLn[v.ln] = v.or;
}

function toEDT(utcStr: string): Date {
	return new Date(new Date(utcStr).getTime() - 4 * 60 * 60 * 1000);
}
function localDateStr(d: Date): string {
	return d.toISOString().slice(0, 10);
}
function localTimeStr(d: Date): string {
	return d.toISOString().slice(11, 16);
}

function htmlToText(html: string): string {
	return html
		.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
		.replace(/<p[^>]*>/gi, "")
		.replace(/<\/p>/gi, "")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.trim();
}

interface ShowWithDetails {
	row: Row;
	details: ArtistDetailEntry;
}

const showsWithDetails: ShowWithDetails[] = sw
	.map((show) => {
		const edt = toEDT(show.st);
		const venue = venueById[show.ve];
		const at = show.at;
		const country = at.cy === "Montréal" ? "Québec" : at.cy;
		const genre = at.sc.name;

		let links: ArtistLink[] = at.ls ?? [];
		const overrideUrl = youtubeOverridesNormalized.get(at.te.toLowerCase().trim());
		if (overrideUrl) {
			links = [
				...links.filter(
					(l) => !l.label.toLowerCase().includes("vidéo") && !l.label.toLowerCase().includes("video"),
				),
				{ label: "Vidéo officielle", url: overrideUrl },
			];
		}

		const row: Row = {
			dateStr: localDateStr(edt),
			venue: venue.ln,
			paid: venue.tt,
			time: localTimeStr(edt),
			artist: at.te,
			country,
			genre,
		};

		const details: ArtistDetailEntry = {
			description: at.ds ? htmlToText(at.ds) : undefined,
			imageUrl: at.dl ? ci + at.dl : undefined,
			links,
		};

		return { row, details };
	})
	.sort(
		(a, b) =>
			a.row.dateStr.localeCompare(b.row.dateStr) ||
			(b.row.paid ? 1 : 0) - (a.row.paid ? 1 : 0) ||
			venueOrderByLn[a.row.venue] - venueOrderByLn[b.row.venue] ||
			a.row.time.localeCompare(b.row.time),
	);

const rows: Row[] = showsWithDetails.map((s) => s.row);
const artistDetailsMap: Record<string, ArtistDetailEntry> = {};
for (const { row, details } of showsWithDetails) {
	artistDetailsMap[row.artist] = details;
}

await fs.writeFile(scheduleOutPath, JSON.stringify(rows, null, 2));
console.log(`Written ${rows.length} rows to ${scheduleOutPath}`);

await fs.mkdir(path.dirname(artistDetailsOutPath), { recursive: true });
await fs.writeFile(artistDetailsOutPath, JSON.stringify(artistDetailsMap, null, 2));
console.log(`Written ${Object.keys(artistDetailsMap).length} artist details to ${artistDetailsOutPath}`);
