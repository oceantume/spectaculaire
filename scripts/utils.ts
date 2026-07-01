import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "node-html-parser";
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
  const root = parse(html);
  for (const br of root.querySelectorAll("br")) br.replaceWith("\n");
  for (const p of root.querySelectorAll("p")) {
    p.replaceWith(`${p.innerHTML}\n\n`);
  }
  return root.textContent.trim().replace(/\n{3,}/g, "\n\n");
}

export function inferLinkLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname.includes("facebook.com") || hostname === "fb.com") return "Facebook";
    if (hostname.includes("instagram.com")) return "Instagram";
    if (hostname.includes("tiktok.com")) return "TikTok";
    if (hostname === "x.com" || hostname.includes("twitter.com")) return "X";
    if (hostname.includes("spotify.com")) return "Spotify";
    if (hostname.includes("youtube.com") || hostname === "youtu.be") return "YouTube";
    if (hostname.includes("apple.com")) return "Apple Music";
    if (hostname.includes("tidal.com")) return "Tidal";
    if (hostname.includes("deezer.com")) return "Deezer";
    if (hostname.includes("bandcamp.com")) return "Bandcamp";
    if (hostname.includes("soundcloud.com")) return "SoundCloud";
    if (hostname.includes("mixcloud.com")) return "Mixcloud";
    if (hostname === "linktr.ee") return "Linktree";
    if (hostname.includes("wikipedia.org")) return "Wikipedia";
    return "Site officiel";
  } catch {
    return "Site officiel";
  }
}

export async function writeFestivalData(
  dataDir: string,
  rows: Row[],
  artistDetails: Record<string, ArtistDetailEntry>,
): Promise<void> {
  const schedulePath = path.join(dataDir, "schedule.json");
  const detailsPath = path.join(dataDir, "artist-details.json");
  const cleanedRows = rows.map((r) => ({ ...r, artist: r.artist.trim(), venue: r.venue.trim() }));
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(schedulePath, `${JSON.stringify(cleanedRows, null, 2)}\n`);
  console.log(`Written ${rows.length} rows to ${schedulePath}`);
  await fs.writeFile(detailsPath, `${JSON.stringify(artistDetails, null, 2)}\n`);
  console.log(`Written ${Object.keys(artistDetails).length} artist details to ${detailsPath}`);
}
