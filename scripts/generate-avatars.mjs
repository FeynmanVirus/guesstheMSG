// One-time avatar pre-generation — run manually (`npm run gen:avatars`), not
// wired into `next build`. DESIGN.md §3: "DiceBear open-peeps/notionists,
// curated set of ~12 seeds pre-rendered to static SVGs at build time — no
// runtime API calls." Output is committed to the repo; re-run only if you
// want to retune the curated set.
//
// Filenames are index-based (peep-01..peep-12), not seed-based, so
// `players.avatar_id` never encodes a DiceBear seed you might later retune.

import { createAvatar } from "@dicebear/core";
import { openPeeps } from "@dicebear/collection";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "avatars",
);

// 12 curated seeds — arbitrary strings, chosen only for the resulting doodle
// looking distinct/pleasant, no other significance.
const SEEDS = [
  "mango",
  "comet",
  "pebble",
  "juniper",
  "waffle",
  "lantern",
  "otter",
  "basil",
  "meadow",
  "pixel",
  "harbor",
  "fable",
];

// DESIGN.md §3 palette accents (hex, no '#') minus Ink and Coral (Coral is
// reserved for urgent/celebration state, not neutral avatar backgrounds) —
// cycled per seed so the curated set reads as palette-varied, not samey.
const BACKGROUNDS = ["ffc857", "8ecae6", "a8d5ba", "c9b6e4", "fffcf5"];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const [i, seed] of SEEDS.entries()) {
    const avatar = createAvatar(openPeeps, {
      seed,
      size: 128,
      radius: 50,
      backgroundType: ["solid"],
      backgroundColor: [BACKGROUNDS[i % BACKGROUNDS.length]],
    });

    const svg = avatar.toString();
    const filename = `peep-${String(i + 1).padStart(2, "0")}.svg`;
    await writeFile(path.join(OUT_DIR, filename), svg, "utf-8");
    console.log(`wrote ${filename} (seed: ${seed})`);
  }

  console.log(`\nDone — ${SEEDS.length} avatars written to public/avatars/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
