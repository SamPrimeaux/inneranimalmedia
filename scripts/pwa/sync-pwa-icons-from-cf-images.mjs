#!/usr/bin/env node
/**
 * Download CF Images source + emit full-bleed PWA icon PNGs for dashboard/public/pwa/.
 *
 * Usage:
 *   node scripts/pwa/sync-pwa-icons-from-cf-images.mjs
 *   CF_PWA_IMAGE_ID=... CF_PWA_SOURCE_VARIANT=large node scripts/pwa/...
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(ROOT, 'dashboard/public/pwa');

const ACCOUNT_HASH =
  process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || 'g7wf09fCONpnidkRnR_5vw';
/** Official iOS B&W icon — CF Images IA-IOS-BW-BASIC-1024.png */
const IMAGE_ID =
  process.env.CF_PWA_IMAGE_ID || 'e5327954-d123-4a7a-2138-589146758b00';
const VARIANT = process.env.CF_PWA_SOURCE_VARIANT || 'large';
const THEME_BG = process.env.PWA_ICON_BG || '#000000';
const FILL_RATIO = Number(process.env.PWA_ICON_FILL || '1');
const DIRECT_RESIZE = process.env.PWA_ICON_DIRECT === '1' || FILL_RATIO >= 1;

const SOURCE_URL = `https://imagedelivery.net/${ACCOUNT_HASH}/${IMAGE_ID}/${VARIANT}`;

/** @type {{ name: string; size: number }[]} */
const OUTPUTS = [
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-192.png', size: 192 },
  { name: 'apple-touch-icon.png', size: 180 },
];

/**
 * Trim light/white margins, flatten on theme bg, scale logo to fill iOS icon square.
 * @param {Buffer} input
 * @param {number} size
 */
async function renderIconSquare(input, size) {
  if (DIRECT_RESIZE) {
    return sharp(input)
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  const logoMax = Math.max(32, Math.round(size * FILL_RATIO));
  let pipeline = sharp(input).flatten({ background: THEME_BG });

  try {
    pipeline = sharp(await pipeline.trim({ threshold: 12 }).toBuffer()).flatten({
      background: THEME_BG,
    });
  } catch {
    /* trim unavailable — use full frame */
  }

  const logo = await pipeline
    .resize(logoMax, logoMax, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: THEME_BG,
    },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  console.log(`[pwa-icons] source ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`CF Images fetch failed: HTTP ${res.status} ${SOURCE_URL}`);
  }
  const sourceBuf = Buffer.from(await res.arrayBuffer());
  if (sourceBuf.length < 1000) {
    throw new Error('CF Images response too small — check image ID / variant');
  }

  const meta = await sharp(sourceBuf).metadata();
  console.log(
    `[pwa-icons] downloaded ${sourceBuf.length} bytes (${meta.width}x${meta.height})`,
  );

  await mkdir(OUT_DIR, { recursive: true });

  for (const { name, size } of OUTPUTS) {
    const outBuf = await renderIconSquare(sourceBuf, size);
    const dest = resolve(OUT_DIR, name);
    await writeFile(dest, outBuf);
    console.log(`[pwa-icons] wrote ${name} (${size}x${size}, fill ${FILL_RATIO})`);
  }

  const manifestSnippet = {
    image_id: IMAGE_ID,
    account_hash: ACCOUNT_HASH,
    source_variant: VARIANT,
    source_url: SOURCE_URL,
    theme_bg: THEME_BG,
    fill_ratio: FILL_RATIO,
    synced_at: new Date().toISOString(),
    outputs: OUTPUTS.map(({ name, size }) => ({ name, size: `${size}x${size}` })),
  };
  await writeFile(
    resolve(OUT_DIR, 'icon-source.json'),
    `${JSON.stringify(manifestSnippet, null, 2)}\n`,
  );

  console.log('[pwa-icons] OK — deploy:full to publish');
}

main().catch((err) => {
  console.error(`✗ ${err.message || err}`);
  process.exit(1);
});
