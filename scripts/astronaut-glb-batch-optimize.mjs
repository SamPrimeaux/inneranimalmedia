#!/usr/bin/env node
/**
 * Batch optimize astronaut GLBs → sibling optimized/ directory.
 * Skinned/animated: meshopt + webp (never Draco).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { optimizeGlbFile } from './lib/glb-optimize.mjs';

const ARCHIVE =
  process.argv[2] ||
  '/Volumes/Expansion/astronaut!-glb-scenes/Archive';

const FILES = [
  'Animation_Boxing_Practice_withSkin.glb',
  'Animation_Climb_Attempt_and_Fall_3_withSkin.glb',
  'Animation_Fall4_withSkin.glb',
  'Animation_Running_withSkin.glb',
  'Animation_Walking_withSkin.glb',
  'Astronaut_0815114721_texture.glb',
  'astronaut_plane.glb',
  'astronaut_rebuild_plane.glb',
];

const OUT_DIR = join(ARCHIVE, 'optimized');
mkdirSync(OUT_DIR, { recursive: true });

const report = [];

for (const name of FILES) {
  const inputPath = join(ARCHIVE, name);
  const outputPath = join(OUT_DIR, name.replace(/\.glb$/i, '_opt.glb'));
  process.stdout.write(`→ ${name} …\n`);
  try {
    const result = optimizeGlbFile(inputPath, outputPath);
    const pct = result.bytesIn
      ? Math.round((1 - result.bytesOut / result.bytesIn) * 100)
      : 0;
    const line = {
      file: name,
      ok: true,
      skinned: result.skinned,
      compress: result.compress,
      bytesIn: result.bytesIn,
      bytesOut: result.bytesOut,
      pctSmaller: pct,
      output: outputPath,
    };
    report.push(line);
    console.log(
      `  ✓ ${formatBytes(result.bytesIn)} → ${formatBytes(result.bytesOut)} (${pct}% smaller, ${result.compress}${result.skinned ? '/skinned' : ''})`,
    );
  } catch (e) {
    report.push({ file: name, ok: false, error: String(e?.message ?? e) });
    console.error(`  ✗ ${e?.message ?? e}`);
  }
}

const manifestPath = join(OUT_DIR, 'optimize-manifest.json');
writeFileSync(manifestPath, JSON.stringify({ archive: ARCHIVE, results: report }, null, 2));
console.log(`\nManifest: ${manifestPath}`);
console.log(`Optimized GLBs: ${OUT_DIR}`);

function formatBytes(n) {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
