#!/usr/bin/env node
/**
 * Generate portable CMS theme packages from D1 (cms_themes), write artifacts/, optionally upload to R2, update D1.
 *
 * Usage:
 *   node scripts/themes/generate-theme-package.mjs --slug iam-storm-white
 *   node scripts/themes/generate-theme-package.mjs --theme-id theme-iam-storm-white
 *   node scripts/themes/generate-theme-package.mjs --all-active
 *   node scripts/themes/generate-theme-package.mjs --slug iam-storm-white --upload-r2 --remote
 *   node scripts/themes/generate-theme-package.mjs --slug iam-storm-white --zip --dry-run
 *
 * Env: WRANGLER_CONFIG, D1_DATABASE, CMS_THEME_R2_BUCKET (default inneranimalmedia)
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildFullThemePackage } from "../../src/core/cms-theme-package-files.js";
import { normalizeCatalogThemeRow } from "../../src/core/cms-theme-preview-model.js";
import { mergePackageMetaIntoTokensJson } from "../../src/core/cms-theme-registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const WRANGLER_CONFIG = process.env.WRANGLER_CONFIG || "wrangler.production.toml";
const D1_DATABASE = process.env.D1_DATABASE || "inneranimalmedia-business";
const R2_BUCKET = process.env.CMS_THEME_R2_BUCKET || "inneranimalmedia";
const DEFAULT_ASSETS_ORIGIN = process.env.CMS_THEME_PUBLIC_ORIGIN || "https://assets.inneranimalmedia.com";

function wranglerWrap(args) {
  const wrap = path.join(REPO_ROOT, "scripts/with-cloudflare-env.sh");
  return execFileSync(wrap, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function d1Json(command, remote) {
  const args = ["npx", "wrangler", "d1", "execute", D1_DATABASE];
  if (remote) args.push("--remote");
  args.push("-c", WRANGLER_CONFIG, "--command", command, "--json");
  const out = wranglerWrap(args);
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch (e) {
    throw new Error(`D1 JSON parse error: ${e.message}\n${out.slice(0, 800)}`);
  }
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (first && first.success === false) {
    throw new Error(`D1 command failed: ${out.slice(0, 800)}`);
  }
  return first?.results ?? [];
}

function escapeSqlString(s) {
  return String(s ?? "").replace(/'/g, "''");
}

function parseArgs(argv) {
  let slug = "";
  let themeId = "";
  let allActive = false;
  let uploadR2 = false;
  let remote = false;
  let dryRun = false;
  let zip = false;
  let workspaceId = "";
  let applyWorkspace = false;
  let limit = 0;
  for (const a of argv) {
    if (a.startsWith("--slug=")) slug = a.slice("--slug=".length).trim();
    else if (a.startsWith("--theme-id=")) themeId = a.slice("--theme-id=".length).trim();
    else if (a === "--all-active") allActive = true;
    else if (a === "--upload-r2") uploadR2 = true;
    else if (a === "--remote") remote = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--zip") zip = true;
    else if (a.startsWith("--workspace-id=")) workspaceId = a.slice("--workspace-id=".length).trim();
    else if (a === "--apply-workspace") applyWorkspace = true;
    else if (a.startsWith("--limit=")) limit = Math.max(0, parseInt(a.slice("--limit=".length), 10) || 0);
  }
  return { slug, themeId, allActive, uploadR2, remote, dryRun, zip, workspaceId, applyWorkspace, limit };
}

function putZipFromPath(localFile, objectKey, remoteFlag) {
  const args = [
    "npx",
    "wrangler",
    "r2",
    "object",
    "put",
    `${R2_BUCKET}/${objectKey}`,
    "--file",
    localFile,
    "--content-type",
    "application/zip",
    "-c",
    WRANGLER_CONFIG,
  ];
  if (remoteFlag) args.push("--remote");
  wranglerWrap(args);
}

function r2Put(localFile, objectKey, contentType, remoteFlag) {
  const args = [
    "npx",
    "wrangler",
    "r2",
    "object",
    "put",
    `${R2_BUCKET}/${objectKey}`,
    "--file",
    localFile,
    "--content-type",
    contentType,
    "-c",
    WRANGLER_CONFIG,
  ];
  if (remoteFlag) args.push("--remote");
  wranglerWrap(args);
}

async function sha256HexFallback(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

async function writePackageFiles(outDir, pkg) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = {
    "theme.css": pkg.theme_css,
    "theme.json": pkg.theme_json,
    "monaco.json": pkg.monaco_json,
    "manifest.json": pkg.manifest_json,
    "preview.html": pkg.preview_html,
    "README.md": pkg.readme_md,
  };
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(outDir, name), body, "utf8");
  }
}

async function maybePngPreview(outDir, slug, dryRun) {
  if (dryRun) return null;
  try {
    let chromium;
    try {
      ({ chromium } = await import("playwright"));
    } catch {
      ({ chromium } = await import("@playwright/test"));
    }
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
    const htmlPath = path.join(outDir, "preview.html");
    await page.goto(`file://${htmlPath}`, { waitUntil: "load", timeout: 15000 });
    const pngPath = path.join(outDir, "preview.png");
    await page.screenshot({ path: pngPath, type: "png" });
    await browser.close();
    return pngPath;
  } catch (e) {
    console.warn(`[theme:package] preview.png skipped for ${slug}:`, e?.message || e);
    return null;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let rows = [];

  if (opts.allActive) {
    const lim = opts.limit > 0 ? ` LIMIT ${opts.limit}` : "";
    const sql = `
SELECT * FROM cms_themes
WHERE COALESCE(status, 'active') = 'active'
ORDER BY sort_order ASC, name ASC${lim};
`.trim();
    rows = d1Json(sql, opts.remote);
  } else if (opts.themeId) {
    const sql = `SELECT * FROM cms_themes WHERE id = '${escapeSqlString(opts.themeId)}' LIMIT 1;`;
    rows = d1Json(sql, opts.remote);
  } else if (opts.slug) {
    const sql = `SELECT * FROM cms_themes WHERE slug = '${escapeSqlString(opts.slug)}' LIMIT 1;`;
    rows = d1Json(sql, opts.remote);
  } else {
    console.error("Specify --slug, --theme-id, or --all-active");
    process.exit(1);
  }

  if (!rows.length) {
    console.error("No matching cms_themes rows.");
    process.exit(2);
  }

  const artifactsRoot = path.join(REPO_ROOT, "artifacts", "themes");

  for (const row of rows) {
    const slug = String(row.slug || "").trim();
    if (!slug) continue;

    const normalized = normalizeCatalogThemeRow(row);
    let pkg = await buildFullThemePackage({
      row,
      publicAssetOrigin: DEFAULT_ASSETS_ORIGIN,
      bucket: R2_BUCKET,
      preview_model: normalized.preview_model,
    });
    if (!pkg.compiled_css_hash) {
      pkg = {
        ...pkg,
        compiled_css_hash: await sha256HexFallback(pkg.theme_css),
      };
    }

    const outDir = path.join(artifactsRoot, slug);
    if (!opts.dryRun) {
      await writePackageFiles(outDir, pkg);
      await maybePngPreview(outDir, slug, opts.dryRun);
    } else {
      console.log(`[dry-run] would write ${path.relative(REPO_ROOT, outDir)}`);
    }

    let zipSha256 = "";
    if (opts.zip && !opts.dryRun) {
      const zipPath = path.join(artifactsRoot, `${slug}.zip`);
      try {
        execFileSync("zip", ["-r", "-q", zipPath, slug], { cwd: artifactsRoot });
        zipSha256 = crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
        console.log(`[theme:package] zip ${path.relative(REPO_ROOT, zipPath)} sha256=${zipSha256.slice(0, 16)}…`);
      } catch (e) {
        console.warn("[theme:package] zip failed (install zip CLI or create manually):", e?.message || e);
      }
    }

    if (opts.uploadR2 && !opts.dryRun) {
      const dir = outDir;
      const put = (file, key, ct) => r2Put(path.join(dir, file), key, ct, opts.remote);
      const base = `cms/themes/${slug}`;
      const vp = String(pkg.version_prefix || "").trim();
      const files = [
        ["theme.css", "text/css; charset=utf-8"],
        ["theme.json", "application/json; charset=utf-8"],
        ["monaco.json", "application/json; charset=utf-8"],
        ["manifest.json", "application/json; charset=utf-8"],
        ["preview.html", "text/html; charset=utf-8"],
        ["README.md", "text/markdown; charset=utf-8"],
      ];
      for (const [fn, ct] of files) {
        put(fn, `${base}/${fn}`, ct);
        if (vp) put(fn, `${vp}/${fn}`, ct);
      }
      const pngLocal = path.join(dir, "preview.png");
      if (fs.existsSync(pngLocal)) {
        put("preview.png", `${base}/preview.png`, "image/png");
        if (vp) put("preview.png", `${vp}/preview.png`, "image/png");
      }
      const zipLocal = path.join(artifactsRoot, `${slug}.zip`);
      if (fs.existsSync(zipLocal)) {
        putZipFromPath(zipLocal, `${base}/${slug}.zip`, opts.remote);
        if (vp) putZipFromPath(zipLocal, `${vp}/${slug}.zip`, opts.remote);
      }

      const previewUrl = fs.existsSync(pngLocal)
        ? `${DEFAULT_ASSETS_ORIGIN.replace(/\/$/, "")}/${base}/preview.png`
        : null;

      const pkgMeta = {
        source_hash: pkg.source_hash,
        css_hash: pkg.compiled_css_hash,
        package_hash: pkg.package_hash,
        manifest_r2_key: `${base}/manifest.json`,
        manifest_url: `${DEFAULT_ASSETS_ORIGIN.replace(/\/$/, "")}/${base}/manifest.json`,
        preview_html_url: `${DEFAULT_ASSETS_ORIGIN.replace(/\/$/, "")}/${base}/preview.html`,
        versioned_r2_prefix: `${vp}/`,
        generated_at: new Date().toISOString(),
        file_hashes: {
          ...pkg.file_hashes,
          ...(zipSha256 ? { [`${slug}.zip`]: zipSha256 } : {}),
        },
      };

      const mergedTokens = mergePackageMetaIntoTokensJson(row.tokens_json, pkgMeta);

      const setParts = [
        `compiled_css_hash = '${escapeSqlString(pkg.compiled_css_hash)}'`,
        `css_url = '${escapeSqlString(pkg.css_url)}'`,
        `css_r2_key = '${escapeSqlString(pkg.css_r2_key)}'`,
        `css_r2_bucket = '${escapeSqlString(R2_BUCKET)}'`,
        `tokens_json = '${escapeSqlString(mergedTokens)}'`,
      ];
      if (previewUrl) {
        setParts.push(`preview_image_url = '${escapeSqlString(previewUrl)}'`);
      }
      setParts.push(`updated_at = unixepoch()`);
      const upd = `UPDATE cms_themes SET ${setParts.join(", ")} WHERE slug = '${escapeSqlString(slug)}';`;
      d1Json(upd, opts.remote);
      console.log(`[theme:package] D1 + R2 updated slug=${slug}`);
    }

    if (opts.applyWorkspace && opts.workspaceId && !opts.dryRun) {
      console.warn("[theme:package] --apply-workspace requires authenticated POST /api/themes/apply — use dashboard or curl.");
    }
  }
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
