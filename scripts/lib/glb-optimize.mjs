#!/usr/bin/env node
/**
 * Platform GLB optimizer — local @gltf-transform/cli + sharp (no global installs).
 *
 * Skinned / animated GLBs use meshopt (never Draco — Draco can corrupt skin weights).
 * Static props may also use meshopt; Draco is opt-in only via GLB_COMPRESS=draco.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '../..');

const GLTF_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'gltf-transform');

/** @returns {string} */
function gltfTransformBin() {
  if (existsSync(GLTF_BIN)) return GLTF_BIN;
  return 'gltf-transform';
}

/**
 * Heuristic + GLB JSON scan for rigs / clips.
 * @param {string} filePath
 */
export function glbHasSkinsOrAnimations(filePath) {
  const name = basename(filePath).toLowerCase();
  if (
    name.includes('withskin') ||
    name.includes('animation_') ||
    name.includes('_anim') ||
    name.includes('_rig') ||
    name.includes('skinned')
  ) {
    return true;
  }

  try {
    const buf = readFileSync(filePath);
    if (buf.length < 20) return false;
    const magic = buf.readUInt32LE(0);
    if (magic !== 0x46546c67) return false; // glTF
    let offset = 12;
    while (offset + 8 <= buf.length) {
      const chunkLength = buf.readUInt32LE(offset);
      const chunkType = buf.readUInt32LE(offset + 4);
      offset += 8;
      if (chunkType === 0x4e4f534a) {
        const json = buf.subarray(offset, offset + chunkLength).toString('utf8');
        const doc = JSON.parse(json);
        if (Array.isArray(doc.skins) && doc.skins.length > 0) return true;
        if (Array.isArray(doc.animations) && doc.animations.length > 0) return true;
        return false;
      }
      offset += chunkLength;
    }
  } catch {
    /* fall through */
  }
  return false;
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{ skinned?: boolean, compress?: 'meshopt'|'draco'|'false', textureCompress?: string, meshoptLevel?: string, simplify?: boolean }} [opts]
 */
export function optimizeGlbFile(inputPath, outputPath, opts = {}) {
  const skinned = opts.skinned ?? glbHasSkinsOrAnimations(inputPath);
  const compress =
    opts.compress ??
    (process.env.GLB_COMPRESS === 'draco' && !skinned ? 'draco' : 'meshopt');

  if (skinned && compress === 'draco') {
    throw new Error(
      'Draco compression is disabled for skinned/animated GLBs (use meshopt to preserve skin weights)',
    );
  }

  mkdirSync(dirname(outputPath), { recursive: true });

  const args = [
    'optimize',
    inputPath,
    outputPath,
    '--compress',
    compress,
    '--texture-compress',
    opts.textureCompress ?? process.env.GLB_TEXTURE_COMPRESS ?? 'webp',
    '--meshopt-level',
    opts.meshoptLevel ?? process.env.GLB_MESHOPT_LEVEL ?? 'medium',
  ];

  if (skinned) {
    args.push('--instance', 'false');
    if (opts.simplify !== true) {
      args.push('--simplify', 'false');
    }
  }

  const r = spawnSync(gltfTransformBin(), args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env,
  });

  if (r.status !== 0) {
    throw new Error(
      r.stderr?.trim() ||
        r.stdout?.trim() ||
        `gltf-transform optimize failed (${r.status}) for ${inputPath}`,
    );
  }

  const inSize = statSync(inputPath).size;
  const outSize = statSync(outputPath).size;
  return {
    inputPath,
    outputPath,
    skinned,
    compress,
    bytesIn: inSize,
    bytesOut: outSize,
    log: r.stdout?.trim() || '',
  };
}

/**
 * Optimize in place via temp file swap.
 * @param {string} filePath
 * @param {Parameters<typeof optimizeGlbFile>[2]} [opts]
 */
export function optimizeGlbInPlace(filePath, opts = {}) {
  const tmp = `${filePath}.opt.tmp.glb`;
  const result = optimizeGlbFile(filePath, tmp, opts);
  renameSync(tmp, filePath);
  result.outputPath = filePath;
  return result;
}
