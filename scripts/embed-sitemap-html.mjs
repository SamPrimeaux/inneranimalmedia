#!/usr/bin/env node
/**
 * Embeds static/pages/sitemap/index.html for Worker bundle (no runtime fs).
 * Run before wrangler deploy when sitemap HTML changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
if (path.basename(repoRoot) !== 'inneranimalmedia') {
  console.error('embed-sitemap-html: expected repo root inneranimalmedia');
  process.exit(1);
}

const src = path.join(repoRoot, 'static/pages/sitemap/index.html');
const out = path.join(repoRoot, 'src/public-pages/sitemap-page-html.generated.js');

const html = fs.readFileSync(src, 'utf8');
const body = `/** AUTO-GENERATED from static/pages/sitemap/index.html — run: node scripts/embed-sitemap-html.mjs */\nexport const SITEMAP_PAGE_HTML = ${JSON.stringify(html)};\n`;
fs.writeFileSync(out, body, 'utf8');
console.log(`Wrote ${path.relative(repoRoot, out)} (${html.length} bytes)`);
