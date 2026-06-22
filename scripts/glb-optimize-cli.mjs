#!/usr/bin/env node
/**
 * CLI: optimize one file, a directory tree, or repo public/assets/glb.
 *
 * Usage:
 *   node scripts/glb-optimize-cli.mjs path/to/model.glb
 *   node scripts/glb-optimize-cli.mjs public/assets/glb
 *   node scripts/glb-optimize-cli.mjs --in-place public/assets/glb/astronaut
 */
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { optimizeGlbFile, optimizeGlbInPlace, REPO_ROOT } from './lib/glb-optimize.mjs';

const IN_PLACE = process.argv.includes('--in-place');
const paths = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/** @param {string} dir @returns {string[]} */
function collectGlbs(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...collectGlbs(full));
    else if (ent.isFile() && extname(ent.name).toLowerCase() === '.glb') out.push(full);
  }
  return out;
}

function resolveTargets() {
  if (!paths.length) {
    return collectGlbs(join(REPO_ROOT, 'public/assets/glb'));
  }
  const targets = [];
  for (const p of paths) {
    const full = p.startsWith('/') ? p : join(REPO_ROOT, p);
    const st = statSync(full);
    if (st.isDirectory()) targets.push(...collectGlbs(full));
    else targets.push(full);
  }
  return targets;
}

const files = resolveTargets();
if (!files.length) {
  console.error('[glb-optimize] no .glb files found');
  process.exit(1);
}

let ok = 0;
for (const file of files) {
  try {
    const result = IN_PLACE
      ? optimizeGlbInPlace(file)
      : optimizeGlbFile(file, file.replace(/\.glb$/i, '_opt.glb'));
    const pct = result.bytesIn
      ? Math.round((1 - result.bytesOut / result.bytesIn) * 100)
      : 0;
    console.log(
      `[glb-optimize] ${basename(file)} → ${result.outputPath.split('/').pop()} ` +
        `(${formatBytes(result.bytesIn)} → ${formatBytes(result.bytesOut)}, ${pct}% smaller, ` +
        `${result.skinned ? 'skinned/meshopt' : result.compress})`,
    );
    ok += 1;
  } catch (e) {
    console.error(`[glb-optimize] ✗ ${file}:`, e?.message ?? e);
    process.exitCode = 1;
  }
}

console.log(`[glb-optimize] done ${ok}/${files.length}`);

function basename(p) {
  return p.split('/').pop() || p;
}

function formatBytes(n) {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
