import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import type { ArtistDetailEntry, ArtistLink, Row } from "../../src/types.ts";
import { htmlToText, localDateStr, localTimeStr, toEDT, writeFestivalData } from "../utils.ts";

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
const dataDir = path.join(__dirname, "../../src/content/festivals/feq-2026");

export async function run(): Promise<void> {
  const url = "https://www.feq.ca/fr/programmation";
  console.log(`[feq-2026] Fetching ${url}...`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const html = await res.text();
  console.log(`[feq-2026] Got ${html.length} bytes of HTML`);

  // SvelteKit embeds: const data = [...]; in a large inline script tag.
  // We find the start of the array and use a bracket counter to find its end.
  const marker = "const data = ";
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) throw new Error("Could not find 'const data' in page HTML");

  const arrayStart = startIdx + marker.length;
  if (html[arrayStart] !== "[") throw new Error(`Expected '[' at position ${arrayStart}, got '${html[arrayStart]}'`);

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
  console.log(`[feq-2026] Extracted data literal: ${jsLiteral.length} chars`);

  // Evaluate in a sandboxed context — the literal contains unquoted JS object keys
  const raw = vm.runInNewContext(`(${jsLiteral})`, {}) as [unknown, { data: { mamData: MamData } }];
  console.log(`[feq-2026] Parsed successfully. Top-level entries: ${raw.length}`);

  const { ci, ve, sw } = raw[1].data.mamData;

  const venueById = Object.fromEntries(ve.map((v) => [v.id, v]));

  const venueOrderByLn: Record<string, number> = {};
  for (const v of ve) {
    if (!(v.ln in venueOrderByLn) || v.or < venueOrderByLn[v.ln]) venueOrderByLn[v.ln] = v.or;
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

      const row: Row = {
        date: localDateStr(edt),
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
        links: at.ls ?? [],
      };

      return { row, details };
    })
    .sort(
      (a, b) =>
        a.row.date.localeCompare(b.row.date) ||
        (b.row.paid ? 1 : 0) - (a.row.paid ? 1 : 0) ||
        venueOrderByLn[a.row.venue] - venueOrderByLn[b.row.venue] ||
        a.row.time.localeCompare(b.row.time),
    );

  const rows: Row[] = showsWithDetails.map((s) => s.row);
  const artistDetailsMap: Record<string, ArtistDetailEntry> = {};
  for (const { row, details } of showsWithDetails) {
    artistDetailsMap[row.artist] = details;
  }

  await writeFestivalData(dataDir, rows, artistDetailsMap);
}
