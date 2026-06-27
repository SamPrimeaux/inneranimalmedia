/**
 * Live theme resolution from `cms_themes` rows (D1 `config` JSON + `css_vars_json`).
 *
 * **Important:** Authenticated dashboard realtime paths (`GET /api/themes/active`, collab
 * `theme_update`, ThemeSwitcher optimistic apply) MUST use this pipeline — CSS variables merged
 * from D1 — not compiled `theme.css` on R2. R2 artifacts (`css_url`, compiled snapshots) exist for
 * public pages, embeds, exports, and cacheable published HTML — see `scripts/cms/compile-theme-batch.mjs`.
 *
 * When `css_vars_json` is still `{}` after a package sync, `hydrateCmsThemeCssVarsFromR2` (called from
 * `POST /api/themes/apply`) loads `theme.json` from the ASSETS bucket and backfills D1 so clients receive `data`.
 */

import { parseAgentHomeFromComponentsJson } from "./agent-home-scene-cms.js";

/** @param {unknown} raw */
export function parseCmsThemeConfig(raw) {
  if (raw == null) return {};
  try {
    return typeof raw === "string"
      ? JSON.parse(raw)
      : raw && typeof raw === "object"
        ? raw
        : {};
  } catch (_) {
    return {};
  }
}

/** Merge cms_themes.config into API variables (GET /api/settings/theme). Supports cssVars + css_vars. */
export function variablesFromCmsThemeConfig(cfg) {
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

/**
 * Map cms_themes.config-derived CSS variables to dashboard tokens (`--bg-app`, `--text-main`, …).
 * @param {Record<string, string>} variables
 * @param {Record<string, unknown>} cfg
 */
export function mergeAgentDashboardIdeTokens(variables, cfg) {
  const data = { ...variables };
  const get = (k) =>
    data[k] != null && String(data[k]).trim() !== "" ? String(data[k]) : null;
  if (!data["--bg-app"]) {
    data["--bg-app"] = get("--bg-canvas") || get("--bg-surface") || (cfg.bg != null ? String(cfg.bg) : null);
  }
  if (!data["--bg-panel"]) {
    data["--bg-panel"] =
      get("--bg-elevated") || get("--bg-panel") || (cfg.surface != null ? String(cfg.surface) : null);
  }
  if (!data["--text-main"]) {
    data["--text-main"] =
      get("--color-text") || get("--text-primary") || (cfg.text != null ? String(cfg.text) : null);
  }
  if (!data["--text-muted"]) {
    data["--text-muted"] =
      get("--text-muted") ||
      get("--text-secondary") ||
      (cfg.textSecondary != null ? String(cfg.textSecondary) : null);
  }
  if (!data["--text-heading"] && data["--text-main"]) data["--text-heading"] = data["--text-main"];
  if (!data["--border-subtle"] && get("--border")) data["--border-subtle"] = get("--border");
  if (!data["--border-focus"] && get("--color-primary")) data["--border-focus"] = get("--color-primary");
  if (!data["--scene-bg"] && data["--bg-app"]) data["--scene-bg"] = data["--bg-app"];
  if (!data["--terminal-surface"] && data["--bg-panel"]) data["--terminal-surface"] = data["--bg-panel"];
  if (!data["--terminal-chrome"] && data["--bg-panel"]) data["--terminal-chrome"] = data["--bg-panel"];
  if (!data["--terminal-tab-muted"] && data["--text-muted"]) data["--terminal-tab-muted"] = data["--text-muted"];
  const primary = get("--color-primary");
  if (!data["--solar-cyan"] && primary) data["--solar-cyan"] = primary;
  if (!data["--solar-blue"] && primary) data["--solar-blue"] = primary;
  return data;
}

/** @param {unknown} val */
function parseJsonObject(val) {
  if (val == null) return null;
  if (typeof val === "object") return /** @type {Record<string, unknown>} */ (val);
  if (typeof val === "string") {
    try {
      const o = JSON.parse(val);
      return o && typeof o === "object" ? /** @type {Record<string, unknown>} */ (o) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * D1 `cms_themes.css_vars_json` — must match runtime apply (same as catalog `cssVarsMerged` in preview-model).
 * @param {Record<string, unknown> | null | undefined} row
 * @param {Record<string, string>} data
 */
function mergeRowCssVarsJsonIntoData(row, data) {
  const obj = parseJsonObject(row?.css_vars_json);
  if (!obj) return;
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = k.startsWith("--") ? k : `--${String(k).replace(/^-+/, "")}`;
    data[key] = String(v);
  }
}

/**
 * When `config` is sparse, palette lives on `tokens_json` (preview-model already reads it for cards).
 * @param {Record<string, unknown> | null | undefined} row
 * @param {Record<string, string>} data
 */
function mergeTokensPaletteIntoData(row, data) {
  const tokens = parseJsonObject(row?.tokens_json);
  const pal = tokens?.palette;
  if (!pal || typeof pal !== "object") return;
  /** @param {string} k */
  const has = (k) => data[k] != null && String(data[k]).trim() !== "";
  /** @param {string} key */
  const get = (key) => {
    const v = /** @type {Record<string, unknown>} */ (pal)[key];
    return v != null && String(v).trim() !== "" ? String(v).trim() : "";
  };
  const canvas = get("canvas");
  const panel = get("panel");
  const panelAlt = get("panelAlt");
  const nav = get("nav");
  const shell = get("shell");
  const accent = get("accent");
  const accentSoft = get("accentSoft");
  const surface = panelAlt || panel;

  if (canvas && !has("--bg-canvas")) data["--bg-canvas"] = canvas;
  if (canvas && !has("--bg-app")) data["--bg-app"] = canvas;
  if (panel && !has("--bg-panel")) data["--bg-panel"] = panel;
  if (surface && !has("--bg-elevated")) data["--bg-elevated"] = surface;
  if (surface && !has("--bg-secondary")) data["--bg-secondary"] = surface;
  if (nav && !has("--bg-nav")) data["--bg-nav"] = nav;
  if (shell && !has("--bg-shell")) data["--bg-shell"] = shell;
  if (accent) {
    if (!has("--color-primary")) data["--color-primary"] = accent;
    if (!has("--accent")) data["--accent"] = accent;
    if (!has("--accent-primary")) data["--accent-primary"] = accent;
  }
  if (accentSoft && !has("--accent-hover")) data["--accent-hover"] = accentSoft;
}

/**
 * Extract CSS custom properties map from an R2 `theme.json` payload (shape varies by generator).
 * @param {unknown} themeJson
 * @returns {Record<string, string>}
 */
function cssVarsFromR2ThemeJson(themeJson) {
  if (!themeJson || typeof themeJson !== "object" || Array.isArray(themeJson)) return {};
  const o = /** @type {Record<string, unknown>} */ (themeJson);
  const pick = o.cssVars ?? o.css_vars ?? o.vars;
  if (pick && typeof pick === "object" && !Array.isArray(pick)) {
    const out = /** @type {Record<string, string>} */ ({});
    for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (pick))) {
      if (v == null) continue;
      out[k] = typeof v === "string" ? v : String(v);
    }
    if (Object.keys(out).length) return out;
  }
  const cfgRaw = o.config;
  if (typeof cfgRaw === "string" && cfgRaw.trim()) {
    try {
      const cfg = JSON.parse(cfgRaw);
      if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
        const cv =
          /** @type {Record<string, unknown>} */ (cfg).cssVars ??
          /** @type {Record<string, unknown>} */ (cfg).css_vars;
        if (cv && typeof cv === "object" && !Array.isArray(cv)) {
          const out = /** @type {Record<string, string>} */ ({});
          for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (cv))) {
            if (v == null) continue;
            out[k] = typeof v === "string" ? v : String(v);
          }
          if (Object.keys(out).length) return out;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

/**
 * When D1 `css_vars_json` is empty `{}` but the compiled package exists on R2, read `theme.json`,
 * merge vars onto the row, and best-effort backfill D1 so the next apply is instant.
 * Mutates `row.css_vars_json` when hydration succeeds.
 * @param {*} env
 * @param {Record<string, unknown> | null | undefined} row
 */
export async function hydrateCmsThemeCssVarsFromR2(env, row) {
  if (!row || typeof row !== "object") return;
  let cssVars = {};
  try {
    const raw = row.css_vars_json;
    if (typeof raw === "string") cssVars = JSON.parse(raw || "{}");
    else if (raw && typeof raw === "object" && !Array.isArray(raw))
      cssVars = { .../** @type {Record<string, unknown>} */ (raw) };
  } catch {
    cssVars = {};
  }
  if (Object.keys(cssVars).length > 0) return;

  const keyRaw = row.css_r2_key != null ? String(row.css_r2_key).trim() : "";
  const bucketRaw = row.css_r2_bucket != null ? String(row.css_r2_bucket).trim() : "";
  const slug = row.slug != null ? String(row.slug).trim() : "";
  if (!(keyRaw && bucketRaw) && !keyRaw && !slug) return;

  let cssPath = keyRaw;
  if (!cssPath && slug) cssPath = `cms/themes/${slug}/theme.css`;
  if (!cssPath) return;

  const jsonKey = cssPath.includes("theme.css")
    ? cssPath.replace("theme.css", "theme.json")
    : cssPath.replace(/\.css$/i, ".json");

  try {
    const r2Obj =
      (typeof env?.ASSETS?.get === "function" ? await env.ASSETS.get(jsonKey) : null) ??
      (typeof env?.DASHBOARD?.get === "function" ? await env.ASSETS.get(jsonKey) : null) ??
      (typeof env?.R2?.get === "function" ? await env.R2.get(jsonKey) : null);
    if (!r2Obj) return;
    const themeJson = await r2Obj.json();
    cssVars = cssVarsFromR2ThemeJson(themeJson);
    if (Object.keys(cssVars).length === 0) return;
    row.css_vars_json = JSON.stringify(cssVars);
    if (env?.DB && slug) {
      env.DB.prepare(`UPDATE cms_themes SET css_vars_json = ? WHERE slug = ?`)
        .bind(row.css_vars_json, slug)
        .run()
        .catch(() => {});
    }
  } catch {
    /* R2 or JSON parse — non-fatal */
  }
}

/** Same variable map as `GET /api/themes/active` payload `data` — for collab broadcast parity. */
export function getCmsThemeDataVarsFromRow(row) {
  const cfg = parseCmsThemeConfig(row?.config);
  const base = variablesFromCmsThemeConfig(cfg);
  const data = mergeAgentDashboardIdeTokens(base, cfg);
  mergeRowCssVarsJsonIntoData(row, data);
  mergeTokensPaletteIntoData(row, data);
  return mergeAgentDashboardIdeTokens(data, cfg);
}

/**
 * JSON body for GET /api/themes/active — always live D1-backed vars (`data`).
 * `css_url` / `compiled_css_hash` are metadata for published/export flows; clients must not use them
 * to drive authenticated realtime styling.
 * @param {Record<string, unknown>} row — cms_themes row
 */
export function buildActiveThemeApiPayload(row) {
  if (!row?.slug) return null;
  const fam = String(row.theme_family || "").toLowerCase();
  const isDark = fam === "dark" || (fam !== "light" && fam !== "high_contrast_light" && !fam);
  const cfg = parseCmsThemeConfig(row.config);
  const data = getCmsThemeDataVarsFromRow(row);
  const resolvedDark =
    typeof cfg.is_dark === "boolean"
      ? cfg.is_dark
      : typeof cfg.is_dark === "number"
        ? cfg.is_dark !== 0
        : isDark;

  const slugSafe = String(row.slug || "theme").trim() || "theme";
  /** Align with D1 `cms_themes.monaco_theme`, R2 monaco.json id, and IAM_COLLAB — `{slug}-monaco`, never `custom:` or built-ins. */
  const BUILTIN_MONACO = new Set(["vs", "vs-dark", "hc-black", "hc-light"]);
  let monacoEditorThemeId =
    row.monaco_theme != null && String(row.monaco_theme).trim() !== ""
      ? String(row.monaco_theme).trim()
      : "";
  if (!monacoEditorThemeId || BUILTIN_MONACO.has(monacoEditorThemeId)) {
    monacoEditorThemeId = `${slugSafe}-monaco`;
  }

  const monacoBgResolved =
    row.monaco_bg != null && String(row.monaco_bg).trim() !== "" ? String(row.monaco_bg).trim() : null;

  const monacoThemeDataStr =
    row.monaco_theme_data != null && String(row.monaco_theme_data).trim() !== ""
      ? String(row.monaco_theme_data).trim()
      : null;

  /** @type {Record<string, unknown>} */
  const out = {
    id: row.id,
    name: row.name || row.slug,
    slug: row.slug,
    is_dark: resolvedDark,
    data,
    theme_family: row.theme_family || "custom",
    wcag_scores: row.wcag_scores ?? null,
    contrast_flags: row.contrast_flags ?? null,
    css_url: row.css_url || null,
    compiled_css_hash: row.compiled_css_hash ?? null,
    theme_channel: "live",
    monaco_theme: monacoEditorThemeId,
    monaco_bg: monacoBgResolved,
    monaco_theme_data: monacoThemeDataStr,
  };
  if (cfg.terminal && typeof cfg.terminal === "object") out.terminal = cfg.terminal;
  out.agent_home = parseAgentHomeFromComponentsJson(row.components_json);
  return out;
}
