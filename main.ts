// Solmar City — entry tooling (Node 22, standard library only).
// Copies game/ and screenshots/ into the output directory and writes
// /output/dossier.json via buildDossier from vendor/makefun-game.ts.
// Usage: node main.ts [output-dir]   (default: ./out)

import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const root = resolve(import.meta.dirname || '.');
const outDir = resolve(process.argv[2] || join(root, 'out'));

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const name of ['game', 'screenshots']) {
  const src = join(root, name);
  if (existsSync(src)) cpSync(src, join(outDir, name), { recursive: true });
}
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`built ${outDir} (${dossier.length} byte dossier)`);
