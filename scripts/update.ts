#!/usr/bin/env node

import { run as runChansonTadoussac2026 } from "./festivals/chanson-tadoussac-2026.ts";
import { run as runEnvolEtMacadam2026 } from "./festivals/envol-et-macadam-2026.ts";
import { run as runFeq2026 } from "./festivals/feq-2026.ts";
import { run as runFestif2026 } from "./festivals/festif-2026.ts";
import { run as runFestivent2026 } from "./festivals/festivent-2026.ts";
import { run as runFrancos2026 } from "./festivals/francos-2026.ts";
import { run as runPiknicElektronik2026 } from "./festivals/piknic-electronik-2026.ts";

// lastUpdateDate: last calendar day on which updates should run (YYYY-MM-DD).
// Set to the final day of the festival. Add an entry here when adding a new festival.
const festivals = [
  { slug: "chanson-tadoussac-2026", run: runChansonTadoussac2026, lastUpdateDate: "2026-06-14" },
  { slug: "envol-et-macadam-2026", run: runEnvolEtMacadam2026, lastUpdateDate: "2026-09-12" },
  { slug: "feq-2026", run: runFeq2026, lastUpdateDate: "2026-07-19" },
  { slug: "festivent-2026", run: runFestivent2026, lastUpdateDate: "2026-08-02" },
  { slug: "festif-2026", run: runFestif2026, lastUpdateDate: "2026-07-25" },
  { slug: "francos-2026", run: runFrancos2026, lastUpdateDate: "2026-06-21" },
  { slug: "piknic-electronik-2026", run: runPiknicElektronik2026, lastUpdateDate: "2026-10-18" },
];

const today = new Date().toISOString().slice(0, 10);

const targetSlug = process.argv[2];

if (targetSlug !== undefined && !festivals.some((f) => f.slug === targetSlug)) {
  const available = festivals.map((f) => f.slug).join(", ");
  console.error(`Unknown festival slug: "${targetSlug}". Available: ${available}`);
  process.exit(1);
}

const toRun = targetSlug ? festivals.filter((f) => f.slug === targetSlug) : festivals;

for (const { slug, run, lastUpdateDate } of toRun) {
  if (today > lastUpdateDate) {
    console.log(`[${slug}] Skipping — festival ended on ${lastUpdateDate}`);
    continue;
  }
  await run();
}
