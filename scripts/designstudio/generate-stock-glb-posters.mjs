#!/usr/bin/env node
/**
 * Render WebP posters for stock cms_assets (model-viewer + Playwright + sharp).
 * Output: public/assets/glb/posters/{id}.webp (local dev) + manifest JSON.
 *
 * Usage:
 *   node scripts/designstudio/generate-stock-glb-posters.mjs
 *   node scripts/designstudio/generate-stock-glb-posters.mjs --only ds_stock_astronaut_rig
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import {
  STOCK_POSTER_SOURCES,
  posterPublicPath,
  posterR2Key,
} from './stock-poster-sources.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'public/assets/glb/posters');
const CAPTURE_HTML = join(REPO_ROOT, 'static/designstudio/glb-poster-capture.html');

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.error('Missing playwright. Run: npm i -D playwright');
    process.exit(1);
  }
}

function resolveGlbUrl(entry) {
  // Production / CDN URLs avoid file:// fetch blocks in headless Chromium.
  if (entry.glbUrl) return entry.glbUrl;
  if (entry.glbPath && existsSync(join(REPO_ROOT, entry.glbPath))) {
    return pathToFileURL(join(REPO_ROOT, entry.glbPath)).href;
  }
  throw new Error(`No GLB source for ${entry.id}`);
}

async function capturePoster(browser, entry) {
  const glbUrl = resolveGlbUrl(entry);
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.goto(pathToFileURL(CAPTURE_HTML).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__captureGlb === 'function', { timeout: 30000 });
  await page.evaluate(async (url) => {
    await window.__captureGlb(url);
  }, glbUrl);
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  return png;
}

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const onlyId = onlyArg ? onlyArg.slice('--only='.length) : process.argv.includes('--only')
    ? process.argv[process.argv.indexOf('--only') + 1]
    : null;

  const sources = onlyId
    ? STOCK_POSTER_SOURCES.filter((s) => s.id === onlyId)
    : STOCK_POSTER_SOURCES;

  if (!sources.length) {
    console.error('No matching stock poster sources');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.POSTER_CHROME_CHANNEL || 'chrome',
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });

  const results = [];

  for (const entry of sources) {
    const outPath = join(OUT_DIR, `${entry.id}.webp`);
    process.stdout.write(`→ ${entry.label} (${entry.id}) …\n`);
    try {
      const png = await capturePoster(browser, entry);
      await sharp(png).webp({ quality: 84, effort: 4 }).toFile(outPath);
      const bytes = (await sharp(outPath).metadata()).size ?? 0;
      results.push({
        id: entry.id,
        label: entry.label,
        ok: true,
        bytes,
        local_path: `public/assets/glb/posters/${entry.id}.webp`,
        r2_key: posterR2Key(entry.id),
        public_url: `https://inneranimalmedia.com${posterPublicPath(entry.id)}`,
        thumbnail_url: posterPublicPath(entry.id),
      });
      console.log(`  ✓ ${entry.id}.webp`);
    } catch (e) {
      results.push({ id: entry.id, label: entry.label, ok: false, error: String(e?.message ?? e) });
      console.error(`  ✗ ${e?.message ?? e}`);
    }
  }

  await browser.close();

  const manifest = {
    generated_at: new Date().toISOString(),
    posters: results,
  };
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nDone ${results.filter((r) => r.ok).length}/${results.length} → ${OUT_DIR}`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main();
