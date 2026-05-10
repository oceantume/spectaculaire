import fs from "node:fs/promises";
import path from "node:path";
import type { ArtistDetailEntry, Row } from "../src/types.ts";

export function toEDT(utcStr: string): Date {
  return new Date(new Date(utcStr).getTime() - 4 * 60 * 60 * 1000);
}

export function localDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function localTimeStr(d: Date): string {
  return d.toISOString().slice(11, 16);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export async function writeFestivalData(
  dataDir: string,
  rows: Row[],
  artistDetails: Record<string, ArtistDetailEntry>,
): Promise<void> {
  const schedulePath = path.join(dataDir, "schedule.json");
  const detailsPath = path.join(dataDir, "artist-details.json");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(schedulePath, JSON.stringify(rows, null, 2));
  console.log(`Written ${rows.length} rows to ${schedulePath}`);
  await fs.writeFile(detailsPath, JSON.stringify(artistDetails, null, 2));
  console.log(`Written ${Object.keys(artistDetails).length} artist details to ${detailsPath}`);
}
