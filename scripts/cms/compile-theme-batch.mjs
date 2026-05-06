#!/usr/bin/env node
/**
 * Compile CMS theme CSS from D1 (cms_themes.config → cssVars), write repo artifacts under
 * cms/themes/<slug>/, optionally upload to R2 (inneranimalmedia), update compiled_css_hash + URLs.
 *
 * **Does not replace realtime dashboard theming.** Authenticated preview/edit continues to use D1
 * config merged into CSS vars (`GET /api/themes/active`, ThemeSwitcher, IAM_COLLAB `theme_update`).
 * R2 `theme.css` + `css_url` are for public routes, page previews, published snapshots, theme export,
 * and cacheable production HTML — the Shopify-like split (`theme_channel: live` vs published artifact).
 *
 * Usage:
 *   node scripts/cms/compile-theme-batch.mjs --offset=0 --limit=5 --remote
 *   node scripts/cms/compile-theme-batch.mjs --offset=5 --limit=5 --remote
 *   node scripts/cms/compile-theme-batch.mjs --offset=0 --limit=5 --dry-run   # files only, no R2/D1 writes
 *
 * Env:
 *   CMS_THEME_PUBLIC_ORIGIN — default https://inneranimalmedia.com (css_url = origin + / + r2 key)
 *   CMS_THEME_R2_BUCKET    — default inneranimalmedia
 *   WRANGLER_CONFIG        — default wrangler.production.toml
 *   D1_DATABASE            — default inneranimalmedia-business
 */

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_ORIGIN = process.env.CMS_THEME_PUBLIC_ORIGIN || "https://inneranimalmedia.com";
const R2_BUCKET = process.env.CMS_THEME_R2_BUCKET || "inneranimalmedia";
const WRANGLER_CONFIG = process.env.WRANGLER_CONFIG || "wrangler.production.toml";
const D1_DATABASE = process.env.D1_DATABASE || "inneranimalmedia-business";

/** Merge cms_themes.config into CSS variables (aligned with worker.js `variablesFromCmsThemeConfig`). */
function variablesFromCmsThemeConfig(cfg) {
  if (!cfg || typeof cfg !== "object") cfg = {};
  const variables = {};
  const mergeCssVars = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const k of Object.keys(obj)) {
      if (obj[k] == null) continue;
      const key = k.startsWith("--") ? k : `--${String(k).replace(/^-+/, "")}`;
      variables[key] = String(obj[k]);
    }
  };
  mergeCssVars(cfg.cssVars);
  mergeCssVars(cfg.css_vars);
  if (cfg.bg != null) variables["--bg-canvas"] = cfg.bg;
  if (cfg.surface != null) variables["--bg-elevated"] = cfg.surface;
  if (cfg.nav != null) variables["--bg-nav"] = cfg.nav;
  else if (cfg.bg != null) variables["--bg-nav"] = cfg.bg;
  if (cfg.bg != null) {
    variables["--bg-overlay"] = cfg.bg;
    variables["--bg-primary"] = cfg.bg;
  }
  if (cfg.surface != null) variables["--bg-secondary"] = cfg.surface;
  if (cfg.text != null) {
    variables["--text-primary"] = cfg.text;
    variables["--text-nav"] = cfg.text;
  }
  if (cfg.textSecondary != null) {
    variables["--text-secondary"] = cfg.textSecondary;
    variables["--text-nav-muted"] = cfg.textSecondary;
    variables["--text-muted"] = cfg.textSecondary;
    variables["--color-text"] = cfg.text;
  }
  if (cfg.border != null) {
    variables["--border"] = cfg.border;
    variables["--border-nav"] = cfg.border;
    variables["--color-border"] = cfg.border;
  }
  if (cfg.primary != null) {
    variables["--accent"] = cfg.primary;
    variables["--accent-primary"] = cfg.primary;
    variables["--color-primary"] = cfg.primary;
  }
  if (cfg.primaryHover != null) {
    variables["--accent-hover"] = cfg.primaryHover;
    variables["--accent-secondary"] = cfg.primaryHover;
  }
  if (cfg.radius != null) variables["--border-radius"] = cfg.radius;
  if (cfg.fontFamily != null) variables["--font-family"] = cfg.fontFamily;
  if (cfg.statusBar != null) variables["--status-bar-bg"] = String(cfg.statusBar);
  if (cfg.statusBarText != null) variables["--status-bar-text"] = String(cfg.statusBarText);
  if (cfg.repoSwitcher != null) variables["--repo-switcher-bg"] = String(cfg.repoSwitcher);
  variables["--transition"] =
    typeof cfg.transition === "string" ? cfg.transition : "all 0.2s ease";
  return variables;
}

function parseArgs(argv) {
  let offset = 0;
  let limit = 5;
  let remote = false;
  let dryRun = false;
  for (const a of argv) {
    if (a === "--remote") remote = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--offset=")) offset = Math.max(0, parseInt(a.slice("--offset=".length), 10) || 0);
    else if (a.startsWith("--limit=")) limit = Math.max(1, parseInt(a.slice("--limit=".length), 10) || 5);
  }
  return { offset, limit, remote, dryRun };
}

function escapeSqlString(s) {
  return String(s).replace(/'/g, "''");
}

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

function buildCompiledCss(slug, variables) {
  const keys = Object.keys(variables).sort((a, b) => a.localeCompare(b));
  const decls = keys.map((k) => `  ${k}: ${variables[k]};`).join("\n");
  return `:root[data-cms-theme="${slug}"] {\n${decls}\n}\n\n:root[data-cms-theme="${slug}"] body {\n  background: var(--bg-canvas);\n  color: var(--color-text);\n}\n`;
}

function monacoJsonFromRow(row, variables) {
  const raw = row.monaco_theme_data;
  if (raw != null && String(raw).trim() !== "") {
    try {
      const obj = JSON.parse(String(raw));
      return `${JSON.stringify(obj, null, 2)}\n`;
    } catch {
      /* fall through */
    }
  }
  const fg = variables["--color-text"] || variables["--text-primary"] || "#e2e8f0";
  return `${JSON.stringify(
    {
      base: row.theme_family === "light" ? "vs" : "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": row.monaco_bg || "#1e293b",
        "editor.foreground": fg,
      },
    },
    null,
    2,
  )}\n`;
}

function themeJsonFromRow(row, computed) {
  const base = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    theme_family: row.theme_family,
    sort_order: row.sort_order,
    status: row.status,
    visibility: row.visibility,
    monaco_theme: row.monaco_theme,
    monaco_bg: row.monaco_bg,
    css_r2_bucket: computed.css_r2_bucket,
    css_r2_key: computed.css_r2_key,
    css_url: computed.css_url,
    compiled_css_hash: computed.compiled_css_hash,
    preview_image_url: row.preview_image_url,
    config_ok: true,
  };
  return `${JSON.stringify(base, null, 2)}\n`;
}

function r2Put(localFile, objectKey, contentType, remote) {
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
  if (remote) args.push("--remote");
  wranglerWrap(args);
}

function sha256Hex(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function expectedMonacoThemeId(slug) {
  return `${slug}-monaco`;
}

function printBatchChecklist(rows) {
  console.log("\n--- 5-theme perfection checklist ---\n");
  for (const r of rows) {
    const slug = r.slug;
    const monacoOk = r.monaco_theme === expectedMonacoThemeId(slug);
    const visibilityOk =
      r.visibility === "public" || r.visibility === "internal" || r.visibility == null;

    const tok = r.tokens_ok;
    const cv = r.css_vars_ok;
    const lines = [
      `slug: ${slug}`,
      `  status active:              ${r.status === "active" ? "yes" : `no (${r.status ?? "?"})`}`,
      `  visibility public/internal: ${visibilityOk ? "yes" : `no (${r.visibility ?? "?"})`}`,
      `  monaco_theme = slug-monaco: ${monacoOk ? "yes" : `no (${r.monaco_theme})`}`,
      `  css_r2_key set:             ${r.css_r2_key ? "yes" : "no"}`,
      `  css_url set:                ${r.css_url ? "yes" : "no"}`,
      `  compiled_css_hash set:      ${r.compiled_css_hash ? "yes" : "no"}`,
      `  preview_image_url:         ${r.preview_image_url ? "yes" : "(optional)"}`,
      `  json_valid tokens_json:     ${tok == null ? "n/a" : tok}`,
      `  json_valid css_vars_json:   ${cv == null ? "n/a" : cv}`,
      `  json_valid brand_json:      ${r.brand_ok == null ? "n/a" : r.brand_ok}`,
      `  json_valid layout_json:     ${r.layout_ok == null ? "n/a" : r.layout_ok}`,
      `  json_valid typography_json: ${r.typography_ok == null ? "n/a" : r.typography_ok}`,
      `  json_valid components_json: ${r.components_ok == null ? "n/a" : r.components_ok}`,
      `  json_valid motion_json:     ${r.motion_ok == null ? "n/a" : r.motion_ok}`,
      `  json_valid monaco_theme_data: ${r.monaco_ok == null ? "n/a" : r.monaco_ok}`,
    ];
    console.log(lines.join("\n"));
    console.log("");
  }
}

function main() {
  const { offset, limit, remote, dryRun } = parseArgs(process.argv.slice(2));

  const sql = `
SELECT
  id,
  name,
  slug,
  theme_family,
  sort_order,
  status,
  visibility,
  monaco_theme,
  monaco_bg,
  monaco_theme_data,
  css_r2_bucket,
  css_r2_key,
  css_url,
  compiled_css_hash,
  preview_image_url,
  config,
  tokens_json,
  css_vars_json,
  brand_json,
  layout_json,
  typography_json,
  components_json,
  motion_json
FROM cms_themes
ORDER BY sort_order ASC, name ASC
LIMIT ${limit} OFFSET ${offset};
`.trim();

  console.error(
    `[compile-theme-batch] offset=${offset} limit=${limit} remote=${remote} dryRun=${dryRun}`,
  );

  const rawRows = d1Json(sql, remote);
  if (!rawRows.length) {
    console.error("No rows returned for this batch.");
    process.exit(0);
  }

  const cmsRoot = path.join(REPO_ROOT, "cms", "themes");

  for (const row of rawRows) {
    let cfg = {};
    try {
      cfg = JSON.parse(row.config || "{}");
    } catch {
      cfg = {};
    }
    const variables = variablesFromCmsThemeConfig(cfg);
    const slug = row.slug;
    if (!slug) {
      console.warn("Skipping row without slug", row.id);
      continue;
    }

    const cssText = buildCompiledCss(slug, variables);
    const hash = sha256Hex(cssText);
    const r2KeyCss = `cms/themes/${slug}/theme.css`;
    const r2KeyThemeJson = `cms/themes/${slug}/theme.json`;
    const r2KeyMonaco = `cms/themes/${slug}/monaco.json`;
    const publicOrigin = DEFAULT_ORIGIN.replace(/\/$/, "");
    const cssUrl = `${publicOrigin}/${r2KeyCss}`;

    const dir = path.join(cmsRoot, slug);
    fs.mkdirSync(dir, { recursive: true });

    const cssPath = path.join(dir, "theme.css");
    fs.writeFileSync(cssPath, cssText, "utf8");

    const computed = {
      css_r2_bucket: R2_BUCKET,
      css_r2_key: r2KeyCss,
      css_url: cssUrl,
      compiled_css_hash: hash,
    };

    fs.writeFileSync(path.join(dir, "monaco.json"), monacoJsonFromRow(row, variables), "utf8");
    fs.writeFileSync(
      path.join(dir, "theme.json"),
      themeJsonFromRow(row, computed),
      "utf8",
    );

    console.error(`OK wrote ${path.relative(REPO_ROOT, cssPath)} sha256=${hash.slice(0, 12)}…`);

    if (!dryRun && remote) {
      r2Put(cssPath, r2KeyCss, "text/css", remote);
      r2Put(path.join(dir, "theme.json"), r2KeyThemeJson, "application/json", remote);
      r2Put(path.join(dir, "monaco.json"), r2KeyMonaco, "application/json", remote);

      const upd = `
UPDATE cms_themes SET
  compiled_css_hash = '${escapeSqlString(hash)}',
  css_url = '${escapeSqlString(cssUrl)}',
  css_r2_key = '${escapeSqlString(r2KeyCss)}',
  css_r2_bucket = '${escapeSqlString(R2_BUCKET)}'
WHERE slug = '${escapeSqlString(slug)}';
`.trim();
      d1Json(upd, remote);
      console.error(`   D1 updated slug=${slug}`);
    } else if (dryRun) {
      console.error(`   dry-run: skip R2 + D1 update for ${slug}`);
    }
  }

  const slugList = rawRows.map((r) => `'${escapeSqlString(r.slug)}'`).join(",");
  const checklistSql = `
SELECT
  name,
  slug,
  theme_family,
  status,
  visibility,
  monaco_theme,
  monaco_bg,
  css_r2_bucket,
  css_r2_key,
  css_url,
  compiled_css_hash,
  preview_image_url,
  json_valid(tokens_json) AS tokens_ok,
  json_valid(css_vars_json) AS css_vars_ok,
  json_valid(brand_json) AS brand_ok,
  json_valid(layout_json) AS layout_ok,
  json_valid(typography_json) AS typography_ok,
  json_valid(components_json) AS components_ok,
  json_valid(motion_json) AS motion_ok,
  json_valid(monaco_theme_data) AS monaco_ok
FROM cms_themes
WHERE slug IN (${slugList})
ORDER BY sort_order ASC, name ASC;
`.trim();

  let checklistRows = [];
  try {
    checklistRows = d1Json(checklistSql, remote);
  } catch (e) {
    console.error("[compile-theme-batch] checklist query failed:", e.message);
  }

  if (dryRun && checklistRows.length) {
    for (const r of checklistRows) {
      const hit = rawRows.find((x) => x.slug === r.slug);
      if (hit) {
        let cfg = {};
        try {
          cfg = JSON.parse(hit.config || "{}");
        } catch {
          cfg = {};
        }
        const vars = variablesFromCmsThemeConfig(cfg);
        const h = sha256Hex(buildCompiledCss(hit.slug, vars));
        r.css_r2_key = `cms/themes/${hit.slug}/theme.css`;
        r.css_url = `${DEFAULT_ORIGIN.replace(/\/$/, "")}/${r.css_r2_key}`;
        r.compiled_css_hash = h;
        r.css_r2_bucket = R2_BUCKET;
      }
    }
  }

  printBatchChecklist(checklistRows);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
