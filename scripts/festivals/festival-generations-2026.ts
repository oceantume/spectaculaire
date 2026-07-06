import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Row } from "../../src/types.ts";
import { writeFestivalData } from "../utils.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../src/data/festivals/festival-generations-2026");

// Schedule extracted from the PNG schedule images on the programmation page.
// The source has no structured API — the schedule is published as image files only.
const SCHEDULE: Omit<Row, "paid">[] = [
  // Jeudi 23 juillet
  { date: "2026-07-23", time: "18:00", artist: "Cam Kahin", venue: "Scène principale" },
  { date: "2026-07-23", time: "19:45", artist: "Exterio", venue: "Scène principale" },
  { date: "2026-07-23", time: "21:30", artist: "Three Days Grace", venue: "Scène principale" },
  // Vendredi 24 juillet
  { date: "2026-07-24", time: "18:00", artist: "Classe Moyenne", venue: "Scène principale" },
  { date: "2026-07-24", time: "19:30", artist: "Kaïn", venue: "Scène principale" },
  { date: "2026-07-24", time: "21:30", artist: "Québec Redneck Bluegrass Project", venue: "Scène principale" },
  // Samedi 25 juillet
  { date: "2026-07-25", time: "18:15", artist: "Billie du Page", venue: "Scène principale" },
  { date: "2026-07-25", time: "20:00", artist: "Mike Posner", venue: "Scène principale" },
  { date: "2026-07-25", time: "21:50", artist: "Wiz Khalifa", venue: "Scène principale" },
];

export async function run(): Promise<void> {
  console.log("[festival-generations-2026] Building schedule from static image data...");

  const rows: Row[] = SCHEDULE.map((entry) => ({ ...entry, paid: true }));

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  console.log(`[festival-generations-2026] Built ${rows.length} rows`);
  await writeFestivalData(dataDir, rows, {});
}
