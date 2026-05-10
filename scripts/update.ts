#!/usr/bin/env node

import { run as runFeq2026 } from "./festivals/feq-2026.ts";
import { run as runFestif2026 } from "./festivals/festif-2026.ts";
import { run as runFestivent2026 } from "./festivals/festivent-2026.ts";

await runFeq2026();
await runFestivent2026();
await runFestif2026();
