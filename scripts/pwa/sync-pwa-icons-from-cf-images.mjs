#!/usr/bin/env node
/**
 * Download CF Images source + emit PWA icon PNGs for dashboard/public/pwa/.
 *
 * Usage:
 *   node scripts/pwa/sync-pwa-icons-from-cf-images.mjs
 *   CF_PWA_IMAGE_ID=... CF_PWA_SOURCE_VARIANT=large node scripts/pwa/...
 */
import { execFileSync } from 'child_process';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(ROOT, 'dashboard/public/pwa');

const ACCOUNT_HASH =
  process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || 'g7wf09fCONpnidkRnR_5vw';
const IMAGE_ID =
  process.env.CF_PWA_IMAGE_ID || 'b1d0bd36-0f88-4301-4e68-7e8d5e255b00';
const VARIANT = process.env.CF_PWA_SOURCE_VARIANT || 'large';

const SOURCE_URL = `https://imagedelivery.net/${ACCOUNT_HASH}/${IMAGE_ID}/${VARIANT}`;

/** @type {{ name: string; size: number }[]} */
const OUTPUTS = [
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-192.png', size: 192 },
  { name: 'apple-touch-icon.png', size: 180 },
];

function resizeWithSips(src, dest, size) {
  execFileSync(
    'sips',
    ['-z', String(size), String(size), '-s', 'format', 'png', '--out', dest, src],
    { stdio: 'pipe' },
  );
}

async function main() {
  console.log(`[pwa-icons] source ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`CF Images fetch failed: HTTP ${res.status} ${SOURCE_URL}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) {
    throw new Error('CF Images response too small — check image ID / variant');
  }

  await mkdir(OUT_DIR, { recursive: true });
  const sourcePath = resolve(OUT_DIR, '.source-large.png');
  await writeFile(sourcePath, buf);

  const meta = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', sourcePath], {
    encoding: 'utf8',
  });
  console.log(`[pwa-icons] downloaded ${buf.length} bytes (${meta.trim().replace(/\n/g, ', ')})`);

  for (const { name, size } of OUTPUTS) {
    const dest = resolve(OUT_DIR, name);
    resizeWithSips(sourcePath, dest, size);
    const outMeta = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', dest], {
      encoding: 'utf8',
    });
    console.log(`[pwa-icons] wrote ${name} (${outMeta.trim().replace(/\n/g, ', ')})`);
  }

  const manifestSnippet = {
    image_id: IMAGE_ID,
    account_hash: ACCOUNT_HASH,
    source_variant: VARIANT,
    source_url: SOURCE_URL,
    synced_at: new Date().toISOString(),
    outputs: OUTPUTS.map(({ name, size }) => ({ name, size: `${size}x${size}` })),
  };
  await writeFile(
    resolve(OUT_DIR, 'icon-source.json'),
    `${JSON.stringify(manifestSnippet, null, 2)}\n`,
  );

  console.log('[pwa-icons] OK — commit dashboard/public/pwa/*.png then deploy:full');
}

main().catch((err) => {
  console.error(`✗ ${err.message || err}`);
  process.exit(1);
});
