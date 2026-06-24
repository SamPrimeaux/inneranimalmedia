#!/usr/bin/env node
/**
 * Merge 5 astronaut animation GLBs into one rig + optimize → astronaut_rig_animations_opt.glb
 */
import { mkdirSync, copyFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { moveToDocument, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { optimizeGlbFile, REPO_ROOT } from './lib/glb-optimize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_ARCHIVE =
  '/Volumes/Expansion/astronaut!-glb-scenes/Archive';
const DEFAULT_OUT_SUBDIR = 'optimized';

const ANIMATION_SOURCES = [
  { file: 'Animation_Walking_withSkin_opt.glb', clip: 'walking', base: true },
  { file: 'Animation_Running_withSkin_opt.glb', clip: 'running' },
  { file: 'Animation_Boxing_Practice_withSkin_opt.glb', clip: 'boxing' },
  { file: 'Animation_Climb_Attempt_and_Fall_3_withSkin_opt.glb', clip: 'climb_fall' },
  { file: 'Animation_Fall4_withSkin_opt.glb', clip: 'fall' },
];

const STATIC_ASSETS = [
  { src: 'Astronaut_0815114721_texture_opt.glb', dest: 'astronaut_texture_opt.glb' },
];

const IAM_ASSETS_ORIGIN = 'https://assets.inneranimalmedia.com';
const WORKER_ORIGIN = 'https://inneranimalmedia.com';

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

  const mergedOpt = join(optimizedDir, 'astronaut_rig_animations_opt.glb');
  const result = optimizeGlbFile(mergedRaw, mergedOpt, { skinned: true });
  return {
    mergedRaw,
    mergedOpt,
    clips: target.getRoot().listAnimations().map((a) => a.getName()),
    bytesIn: result.bytesIn,
    bytesOut: result.bytesOut,
  };
}

function copyToRepo(optimizedDir) {
  const repoDest = join(REPO_ROOT, 'public/assets/glb/astronaut');
  mkdirSync(repoDest, { recursive: true });

  const copies = [
    'astronaut_rig_animations_opt.glb',
    'Astronaut_0815114721_texture_opt.glb',
    ...ANIMATION_SOURCES.map((a) => a.file),
  ];

  for (const name of copies) {
    const src = join(optimizedDir, name);
    if (!existsSync(src)) continue;
    const destName = name === 'Astronaut_0815114721_texture_opt.glb' ? 'astronaut_texture_opt.glb' : name;
    copyFileSync(src, join(repoDest, destName));
  }

  return repoDest;
}

function writeManifest(optimizedDir, repoDest, mergeInfo) {
  const r2Prefix = 'glb/astronaut';
  const files = [
    'astronaut_rig_animations_opt.glb',
    'astronaut_texture_opt.glb',
    ...ANIMATION_SOURCES.map((a) => a.file),
  ];

  const manifest = {
    id: 'astronaut_glb_pack_v1',
    title: 'Astronaut GLB pack',
    r2_prefix: r2Prefix,
    public_origin: IAM_ASSETS_ORIGIN,
    clips: mergeInfo.clips,
    merge: {
      bytesIn: mergeInfo.bytesIn,
      bytesOut: mergeInfo.bytesOut,
    },
    assets: files.map((name) => {
      const localPath = join(repoDest, name === 'Astronaut_0815114721_texture_opt.glb' ? 'astronaut_texture_opt.glb' : name);
      const r2Key = `${r2Prefix}/${name}`;
      let bytes = 0;
      try {
        bytes = statSync(existsSync(localPath) ? localPath : join(optimizedDir, name)).size;
      } catch {
        /* ignore */
      }
      return {
        name,
        r2_key: r2Key,
        public_url: `${WORKER_ORIGIN}/assets/${r2Key}`,
        bytes,
      };
    }),
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
    `  ✓ astronaut_rig_animations_opt.glb (${formatBytes(mergeInfo.bytesIn)} → ${formatBytes(mergeInfo.bytesOut)}, clips: ${mergeInfo.clips.join(', ')})`,
  );

  console.log('→ Copying to public/assets/glb/astronaut/ …');
  const repoDest = copyToRepo(optimizedDir);
  console.log(`  ✓ ${repoDest}`);

  const manifest = writeManifest(optimizedDir, repoDest, mergeInfo);
  console.log(`  ✓ manifest (${manifest.assets.length} assets)`);

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
