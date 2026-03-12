#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inPath = path.join(__dirname, "../assets/programmation.json");
const outPath = path.join(__dirname, "../assets/schedule.json");

const raw = JSON.parse(await fs.readFile(inPath, "utf-8"));
const { ci, ve, sw } = raw[1].data.mamData;

const venueById = Object.fromEntries(ve.map((v) => [v.id, v]));

const venueOrderByLn = {};
for (const v of ve) {
  if (!(v.ln in venueOrderByLn) || v.or < venueOrderByLn[v.ln])
    venueOrderByLn[v.ln] = v.or;
}

function toEDT(utcStr) {
  return new Date(new Date(utcStr).getTime() - 4 * 60 * 60 * 1000);
}
function localDateStr(d) { return d.toISOString().slice(0, 10); }
function localTimeStr(d) { return d.toISOString().slice(11, 16); }

const rows = sw
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

await fs.writeFile(outPath, JSON.stringify(rows));
console.log(`Written ${rows.length} rows to ${outPath}`);
