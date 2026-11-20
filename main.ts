// Solmar City — entry point for the make.fun gta6-01 grader.
//
// Copies game/ and screenshots/ into the output directory and writes
// dossier.json there via buildDossier from vendor/makefun-game.ts.
//
// The output directory is MAKEFUN_OUTPUT_DIR (the grader sets it to a
// writable empty directory, /output). It is NEVER a path under the bot
// directory: in the grader the repository is mounted read-only at /bot
// and the process runs as an unprivileged user, so writing into the repo
// fails with EACCES and the run exits 1. The bot directory is only ever
// read from. When MAKEFUN_OUTPUT_DIR is unset the fallback is /output.
//
// Node 22, standard library only, erasable TypeScript: runs as-is under
// `node main.ts` with no flags, no build and no install.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root: MAKEFUN_BOT_DIR when the grader sets it, else the
// directory holding this file. Read-only in the grader; never written to.
const botDir = resolve(process.env.MAKEFUN_BOT_DIR ?? dirname(fileURLToPath(import.meta.url)));

// The output directory: MAKEFUN_OUTPUT_DIR when set, else /output.
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// Refuse an output directory inside the bot directory: that path is
// read-only in the grader, so building there would fail the run.
if (outDir === botDir || outDir.startsWith(botDir + '/')) {
  throw new Error(
    `main.ts: MAKEFUN_OUTPUT_DIR (${outDir}) must not be inside the bot directory (${botDir}): the grader mounts the repository read-only`,
  );
}

mkdirSync(outDir, { recursive: true });

// Clear any previous run's game/, screenshots/ and dossier.json from the
// output directory so stale files can never pollute the new dossier.
for (const name of ['game', 'screenshots', 'dossier.json']) {
  const target = join(outDir, name);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}

// Copy the game and its screenshots into the output directory.
cpSync(join(botDir, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(botDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

// Build the dossier from the output directory and write it there.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`built ${outDir} (${dossier.length} byte dossier)`);
