#!/usr/bin/env node
/**
 * Merge 5 astronaut animation GLBs → astronaut_rig_animations_opt.glb
 *
 * Repo policy: only the merged runtime rig + manifest.json are staged to public/.
 * Archive optimized variants and originals stay on Expansion / R2 (canonical host).
 */
import { mkdirSync, copyFileSync, writeFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { moveToDocument, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { optimizeGlbFile, REPO_ROOT } from './lib/glb-optimize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_ARCHIVE = '/Volumes/Expansion/astronaut!-glb-scenes/Archive';
const DEFAULT_OUT_SUBDIR = 'optimized';
const RUNTIME_GLB = 'astronaut_rig_animations_opt.glb';
const R2_PREFIX = 'glb/astronaut';
const WORKER_ORIGIN = 'https://inneranimalmedia.com';

const ANIMATION_SOURCES = [
  { file: 'Animation_Walking_withSkin_opt.glb', clip: 'walking', base: true },
  { file: 'Animation_Running_withSkin_opt.glb', clip: 'running' },
  { file: 'Animation_Boxing_Practice_withSkin_opt.glb', clip: 'boxing' },
  { file: 'Animation_Climb_Attempt_and_Fall_3_withSkin_opt.glb', clip: 'climb_fall' },
  { file: 'Animation_Fall4_withSkin_opt.glb', clip: 'fall' },
];

async function buildMergedRig(optimizedDir) {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });

  const baseEntry = ANIMATION_SOURCES.find((e) => e.base) ?? ANIMATION_SOURCES[0];
  const target = await io.read(join(optimizedDir, baseEntry.file));
  target.getRoot().listAnimations()[0].setName(baseEntry.clip);

  for (const { file, clip } of ANIMATION_SOURCES) {
    if (file === baseEntry.file) continue;
    const source = await io.read(join(optimizedDir, file));
    const anim = source.getRoot().listAnimations()[0];
    anim.setName(clip);
    moveToDocument(target, source, [anim]);
  }

  await target.transform(unpartition());

  const mergedRaw = join(optimizedDir, 'astronaut_rig_animations_merged_raw.glb');
  await io.write(mergedRaw, target);

  const mergedOpt = join(optimizedDir, RUNTIME_GLB);
  const result = optimizeGlbFile(mergedRaw, mergedOpt, { skinned: true });
  return {
    mergedOpt,
    clips: target.getRoot().listAnimations().map((a) => a.getName()),
    bytesIn: result.bytesIn,
    bytesOut: result.bytesOut,
  };
}

function listR2Variants(optimizedDir) {
  if (!existsSync(optimizedDir)) return [];
  return readdirSync(optimizedDir)
    .filter(
      (name) =>
        name.endsWith('.glb') &&
        name.endsWith('_opt.glb') &&
        name !== RUNTIME_GLB &&
        !name.startsWith('._') &&
        !name.includes('merged'),
    )
    .map((name) => {
      const r2Key = `${R2_PREFIX}/${name}`;
      let bytes = 0;
      try {
        bytes = statSync(join(optimizedDir, name)).size;
      } catch {
        /* ignore */
      }
      return {
        name,
        r2_key: r2Key,
        public_url: `${WORKER_ORIGIN}/assets/${r2Key}`,
        bytes,
        repo: false,
      };
    });
}

function copyRuntimeToRepo(optimizedDir) {
  const repoDest = join(REPO_ROOT, 'public/assets/glb/astronaut');
  mkdirSync(repoDest, { recursive: true });
  copyFileSync(join(optimizedDir, RUNTIME_GLB), join(repoDest, RUNTIME_GLB));
  return repoDest;
}

function writeManifest(optimizedDir, repoDest, mergeInfo) {
  const runtimeBytes = statSync(join(repoDest, RUNTIME_GLB)).size;
  const manifest = {
    id: 'astronaut_glb_pack_v1',
    title: 'Astronaut GLB pack',
    policy: {
      repo_runtime_only: [RUNTIME_GLB, 'manifest.json'],
      r2_canonical: true,
      r2_prefix: R2_PREFIX,
      note: 'Repo holds curated runtime rig; R2 holds sources, optimized singles, archives.',
    },
    runtime: {
      cms_asset_id: 'ds_stock_astronaut_rig',
      file: RUNTIME_GLB,
      bytes: runtimeBytes,
      clips: mergeInfo.clips,
      r2_key: `${R2_PREFIX}/${RUNTIME_GLB}`,
      public_url: `${WORKER_ORIGIN}/assets/${R2_PREFIX}/${RUNTIME_GLB}`,
      source_provider: 'archive_expansion',
      source_archive: 'astronaut!-glb-scenes/Archive',
      compress: 'meshopt',
      skinned: true,
      bytes_in: mergeInfo.bytesIn,
      bytes_out: mergeInfo.bytesOut,
    },
    r2_variants: listR2Variants(optimizedDir),
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  writeFileSync(join(optimizedDir, 'astronaut-pack-manifest.json'), manifestJson);
  writeFileSync(join(repoDest, 'manifest.json'), manifestJson);
  return manifest;
}

async function main() {
  const archive = process.argv[2] || DEFAULT_ARCHIVE;
  const optimizedDir = join(archive, DEFAULT_OUT_SUBDIR);

  if (!existsSync(join(optimizedDir, ANIMATION_SOURCES[0].file))) {
    throw new Error(`Missing optimized GLBs in ${optimizedDir} — run astronaut-glb-batch-optimize.mjs first`);
  }

  console.log('→ Merging 5 animation clips into single rig…');
  const mergeInfo = await buildMergedRig(optimizedDir);
  console.log(
    `  ✓ ${RUNTIME_GLB} (${formatBytes(mergeInfo.bytesIn)} → ${formatBytes(mergeInfo.bytesOut)}, clips: ${mergeInfo.clips.join(', ')})`,
  );

  console.log('→ Staging runtime GLB + manifest to public/assets/glb/astronaut/ …');
  const repoDest = copyRuntimeToRepo(optimizedDir);
  console.log(`  ✓ ${repoDest}/${RUNTIME_GLB}`);

  const manifest = writeManifest(optimizedDir, repoDest, mergeInfo);
  console.log(`  ✓ manifest (runtime + ${manifest.r2_variants.length} R2-only variants catalogued)`);

  console.log('\nNext: ./scripts/upload-astronaut-glb-pack.sh');
}

function formatBytes(n) {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
