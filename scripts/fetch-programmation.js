#!/usr/bin/env node
// Fetches the FEQ programmation page and extracts the embedded SvelteKit data array.
// The data uses JS object literals (unquoted keys), so we evaluate it with vm.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "../assets/programmation.json");

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
let stringChar = null;
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
const sandbox = {};
const data = vm.runInNewContext(`(${jsLiteral})`, sandbox);
console.log(`Parsed successfully. Top-level entries: ${data.length}`);

await fs.writeFile(outPath, JSON.stringify(data, null, 2));
console.log(`Written to ${outPath}`);
