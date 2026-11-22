// Solmar City entry: copies game/ and screenshots/ into the output
// directory (MAKEFUN_OUTPUT_DIR, falling back to /output) and writes
// /output/dossier.json via buildDossier. Never writes into the repo dir.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';
// Clear the output dir's contents, not the dir itself: the grader runs
// this as an unprivileged user with MAKEFUN_OUTPUT_DIR pointing at a
// directory it does not own, and removing the dir itself fails on the
// sticky-bit parent. Entries inside the dir are writable.
mkdirSync(out, { recursive: true });
for (const name of ['game', 'screenshots', 'dossier.json']) {
  rmSync(join(out, name), { recursive: true, force: true });
}
cpSync(join(root, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(root, 'screenshots'), join(out, 'screenshots'), { recursive: true });
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`wrote ${out} (${dossier.length} byte dossier)`);
