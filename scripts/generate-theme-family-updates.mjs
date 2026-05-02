#!/usr/bin/env node
/**
 * Reads theme slugs + config.bg from stdin as JSON (wrangler d1 execute --json output array[0].results)
 * or pass path to json file. Prints UPDATE SQL for theme_family light/dark.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml \
 *     --command "SELECT slug, json_extract(config, '\$.bg') AS bg FROM cms_themes;" --json > /tmp/themes.json
 *   node scripts/generate-theme-family-updates.mjs /tmp/themes.json
 */

import fs from "fs";

function hexLum(h) {
  if (!h || typeof h !== "string") return 0.25;
  let x = h.trim();
  if (/^rgba?\(/i.test(x)) return 0.25;
  if (!x.startsWith("#")) return 0.25;
  x = x.slice(1);
  if (x.length === 3) x = x.split("").map((c) => c + c).join("");
  if (x.length !== 6) return 0.25;
  const r = parseInt(x.slice(0, 2), 16) / 255;
  const g = parseInt(x.slice(2, 4), 16) / 255;
  const b = parseInt(x.slice(4, 6), 16) / 255;
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const R = lin(r),
    G = lin(g),
    B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

const raw = fs.readFileSync(process.argv[2] || "/dev/stdin", "utf8");
const parsed = JSON.parse(raw);
const results = Array.isArray(parsed) ? parsed[0]?.results || parsed : parsed.results || parsed;

const rows = [];
for (const r of results) {
  const L = hexLum(r.bg);
  const family = L >= 0.45 ? "light" : "dark";
  rows.push({ slug: r.slug, bg: r.bg, L, family });
}

rows.sort((a, b) => a.family.localeCompare(b.family) || a.slug.localeCompare(b.slug));

console.log("-- Generated theme_family: light if relative luminance >= 0.45, else dark");
console.log("-- D1: do not use BEGIN TRANSACTION in wrangler --file batches.\n");

for (const r of rows) {
  const esc = r.slug.replace(/'/g, "''");
  console.log(
    `UPDATE cms_themes SET theme_family = '${r.family}' WHERE slug = '${esc}'; -- bg=${r.bg || "?"} L~${r.L.toFixed(3)}`
  );
}

const d = rows.filter((x) => x.family === "dark").length;
const l = rows.filter((x) => x.family === "light").length;
console.error(`\n# counts: dark=${d} light=${l} total=${rows.length}`);
