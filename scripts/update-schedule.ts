#!/usr/bin/env node
// Fetches the FEQ programmation page, parses the embedded data, transforms it,
// and writes assets/schedule.json in a single pass (no intermediate file).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import type { ArtistLink, Row } from "../src/data.ts";

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
	sc: { name: string; bc: string; tc: string }; // subcategory
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
const outPath = path.join(__dirname, "../assets/schedule.json");

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

const rows: Row[] = sw
	.map((show) => {
		const edt = toEDT(show.st);
		const venue = venueById[show.ve];
		const at = show.at;
		return {
			dateStr: localDateStr(edt),
			venue: venue.ln,
			paid: venue.tt,
			time: localTimeStr(edt),
			artist: at.te,
			genre: at.sc.name,
			artistDetails: {
				name: at.te,
				country: at.cy === "Montréal" ? "Québec" : at.cy,
				genre: at.sc.name,
				genreBg: at.sc.bc,
				genreText: at.sc.tc,
				description: at.ds,
				imageUrl: at.dl ? ci + at.dl : undefined,
				links: at.ls ?? [],
			},
		};
	})
	.sort(
		(a, b) =>
			a.dateStr.localeCompare(b.dateStr) ||
			(b.paid ? 1 : 0) - (a.paid ? 1 : 0) ||
			venueOrderByLn[a.venue] - venueOrderByLn[b.venue] ||
			a.time.localeCompare(b.time),
	);

await fs.writeFile(outPath, JSON.stringify(rows, null, 2));
console.log(`Written ${rows.length} rows to ${outPath}`);
