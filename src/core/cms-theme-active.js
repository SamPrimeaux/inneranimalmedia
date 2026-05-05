/**
 * Live theme resolution from `cms_themes` rows (D1 `config` JSON).
 *
 * **Important:** Authenticated dashboard realtime paths (`GET /api/themes/active`, collab
 * `theme_update`, ThemeSwitcher optimistic apply) MUST use this pipeline — CSS variables merged
 * from D1 — not compiled `theme.css` on R2. R2 artifacts (`css_url`, compiled snapshots) exist for
 * public pages, embeds, exports, and cacheable published HTML — see `scripts/cms/compile-theme-batch.mjs`.
 */

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

/** Same variable map as `GET /api/themes/active` payload `data` — for collab broadcast parity. */
export function getCmsThemeDataVarsFromRow(row) {
  const cfg = parseCmsThemeConfig(row?.config);
  const base = variablesFromCmsThemeConfig(cfg);
  return mergeAgentDashboardIdeTokens(base, cfg);
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
  const base = variablesFromCmsThemeConfig(cfg);
  const data = mergeAgentDashboardIdeTokens(base, cfg);
  const resolvedDark =
    typeof cfg.is_dark === "boolean"
      ? cfg.is_dark
      : typeof cfg.is_dark === "number"
        ? cfg.is_dark !== 0
        : isDark;

  const monacoFromRow =
    row.monaco_theme != null && String(row.monaco_theme).trim() !== ""
      ? String(row.monaco_theme).trim()
      : null;
  const monacoFromCfg =
    cfg.monaco != null && String(cfg.monaco).trim() !== "" ? String(cfg.monaco).trim() : null;

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
    monaco_theme: monacoFromRow || monacoFromCfg,
    monaco_bg: row.monaco_bg ?? null,
    monaco_theme_data:
      row.monaco_theme_data != null && String(row.monaco_theme_data).trim() !== ""
        ? String(row.monaco_theme_data)
        : null,
  };
  if (cfg.terminal && typeof cfg.terminal === "object") out.terminal = cfg.terminal;
  return out;
}
