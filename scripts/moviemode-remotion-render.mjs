#!/usr/bin/env node
/**
 * Server-side Remotion render invoked from Worker → PTY.
 * Requires @remotion/bundler + @remotion/renderer on the host (iam-pty machine).
 *
 * Usage: node scripts/moviemode-remotion-render.mjs /tmp/moviemode/job_xxx.json
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('Usage: moviemode-remotion-render.mjs <config.json>');
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(configPath, 'utf8'));
  const { session, config, jobId, outputFilename } = payload;
  const outDir = '/tmp/moviemode';
  mkdirSync(outDir, { recursive: true });
  const outputLocation = `${outDir}/${outputFilename}`;

  let bundleMod;
  let rendererMod;
  try {
    bundleMod = await import('@remotion/bundler');
    rendererMod = await import('@remotion/renderer');
  } catch (e) {
    console.error(
      'Missing @remotion/bundler or @remotion/renderer on host. Install in repo: npm i -D @remotion/bundler @remotion/renderer',
    );
    process.exit(1);
  }

  const { bundle } = bundleMod;
  const { renderMedia, selectComposition } = rendererMod;

  const QUALITY_MAP = { '480p': [854, 480], '720p': [1280, 720], '1080p': [1920, 1080] };
  const [width, height] = QUALITY_MAP[config?.quality] || [1280, 720];
  const fps = config?.fps || 30;
  const codec = config?.codec === 'vp9' ? 'vp9' : config?.codec === 'gif' ? 'gif' : 'h264';

  const inputProps = { ...session, width, height, fps };

  console.log('PROGRESS:5');
  const bundled = await bundle({
    entryPoint: resolve(REPO, 'dashboard/src/remotion-entry.tsx'),
  });

  console.log('PROGRESS:15');
  const comp = await selectComposition({
    serveUrl: bundled,
    id: 'MovieModeComposition',
    inputProps,
  });

  await renderMedia({
    composition: comp,
    serveUrl: bundled,
    codec,
    outputLocation,
    inputProps,
    fps,
    onProgress: ({ progress }) => {
      const pct = Math.min(99, Math.round(5 + progress * 90));
      console.log(`PROGRESS:${pct}`);
    },
  });

  console.log(`RENDER_DONE:${outputFilename}`);
  console.log(`OUTPUT:${outputLocation}`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
