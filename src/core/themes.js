/**
 * Core Layer: Theme Management
 * Fully DB-driven via cms_themes table. Zero hardcoded slugs or color values.
 * Theme config is a JSON blob with cssVars, monaco settings, and base tokens.
 *
 * cms_themes schema:
 *   id, slug, name, config (JSON), theme_family, monaco_theme, monaco_bg,
 *   monaco_theme_data (JSON — full Monaco defineTheme payload),
 *   is_system, tenant_id, workspace_id, css_url, sort_order, wcag_scores,
 *   contrast_flags, created_at
 */

// ─── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Fetch a single theme row from cms_themes by slug.
 * Returns null if not found or DB unavailable.
 */
export async function getThemeBySlug(env, slug) {
  if (!env.DB || !slug) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT id, slug, name, config, theme_family, monaco_theme, monaco_bg,
              monaco_theme_data, css_url, is_system
       FROM cms_themes WHERE slug = ? LIMIT 1`
    ).bind(String(slug).trim()).first();
    return row ? parseThemeRow(row) : null;
  } catch (e) {
    console.warn('[themes] getThemeBySlug error', e?.message);
    return null;
  }
}

/**
 * Fetch a theme row from cms_themes by id.
 */
export async function getThemeById(env, id) {
  if (!env.DB || !id) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT id, slug, name, config, theme_family, monaco_theme, monaco_bg,
              monaco_theme_data, css_url, is_system
       FROM cms_themes WHERE id = ? LIMIT 1`
    ).bind(String(id).trim()).first();
    return row ? parseThemeRow(row) : null;
  } catch (e) {
    console.warn('[themes] getThemeById error', e?.message);
    return null;
  }
}

/**
 * List all available themes, optionally filtered by theme_family.
 * Ordered by sort_order, then name.
 */
export async function listThemes(env, family = null) {
  if (!env.DB) return [];
  try {
    const sql = family
      ? `SELECT id, slug, name, display_name, config, theme_family, monaco_theme,
                monaco_bg, monaco_theme_data, is_system, sort_order
         FROM cms_themes WHERE theme_family = ? ORDER BY sort_order ASC, name ASC`
      : `SELECT id, slug, name, display_name, config, theme_family, monaco_theme,
                monaco_bg, monaco_theme_data, is_system, sort_order
         FROM cms_themes ORDER BY sort_order ASC, name ASC`;

    const stmt = family
      ? env.DB.prepare(sql).bind(family)
      : env.DB.prepare(sql);

    const { results } = await stmt.all();
    return (results || []).map(parseThemeRow);
  } catch (e) {
    console.warn('[themes] listThemes error', e?.message);
    return [];
  }
}

// ─── Workspace Resolution ─────────────────────────────────────────────────────

/**
 * Resolve the active theme slug for a workspace or tenant.
 * Resolution order:
 *   1. workspaces.theme_id → cms_themes.slug
 *   2. tenant_theme.preset_name → cms_themes.slug
 *   3. theme_access (active) → cms_themes.slug
 *   4. First system theme by sort_order
 *   5. Empty string (caller decides fallback)
 */
export async function getWorkspaceTheme(env, workspaceId) {
  if (!env.DB) return '';

  try {
    if (workspaceId) {
      // 1. Workspace row
      const ws = await env.DB.prepare(
        `SELECT theme_id FROM workspaces WHERE id = ? OR handle = ? LIMIT 1`
      ).bind(workspaceId, workspaceId).first();

      if (ws?.theme_id) {
        const slug = await resolveSlugFromId(env, ws.theme_id);
        if (slug) return slug;
      }

      // 2. Tenant theme preset
      const tt = await env.DB.prepare(
        `SELECT preset_name FROM tenant_theme WHERE tenant_id = ? LIMIT 1`
      ).bind(workspaceId).first();

      if (tt?.preset_name) {
        const slug = await resolveSlugFromId(env, tt.preset_name);
        if (slug) return slug;
      }

      // 3. theme_access active row
      const ta = await env.DB.prepare(
        `SELECT theme_id FROM theme_access
         WHERE tenant_id = ? AND is_active = 1
         ORDER BY created_at DESC LIMIT 1`
      ).bind(workspaceId).first();

      if (ta?.theme_id) {
        const slug = await resolveSlugFromId(env, ta.theme_id);
        if (slug) return slug;
      }
    }

    // 4. First system theme
    const system = await env.DB.prepare(
      `SELECT slug FROM cms_themes WHERE is_system = 1 ORDER BY sort_order ASC LIMIT 1`
    ).first();

    return system?.slug || '';
  } catch (e) {
    console.warn('[themes] getWorkspaceTheme error', e?.message);
    return '';
  }
}

/**
 * Resolve a theme_id (could be a slug, an id, or a preset_name) to a slug.
 */
async function resolveSlugFromId(env, value) {
  if (!value) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT slug FROM cms_themes WHERE slug = ? OR id = ? LIMIT 1`
    ).bind(value, value).first();
    return row?.slug || null;
  } catch (_) {
    return null;
  }
}

// ─── CSS Var Extraction ───────────────────────────────────────────────────────

/**
 * Extract a flat CSS variable map from a parsed theme object.
 * Merges top-level tokens with config.cssVars.
 * Inject into <style> tags or send to terminal/Monaco.
 */
export function extractCssVars(theme) {
  if (!theme) return {};
  const config = theme.config || {};
  const vars = { ...(config.cssVars || {}) };

  const tokenMap = {
    '--bg-canvas': config.bg,
    '--bg-surface': config.surface,
    '--color-text': config.text,
    '--text-secondary': config.textSecondary,
    '--color-border': config.border,
    '--color-primary': config.primary,
    '--color-primary-hover': config.primaryHover,
    '--radius': config.radius,
    '--monaco-bg': theme.monaco_bg,
  };

  for (const [k, v] of Object.entries(tokenMap)) {
    if (v && !vars[k]) vars[k] = v;
  }

  return vars;
}

/**
 * Render a <style> block string from a theme for injection into HTML pages.
 */
export function renderThemeStyleTag(theme) {
  const vars = extractCssVars(theme);
  if (!Object.keys(vars).length) return '';
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `<style>:root {\n${lines}\n}</style>`;
}

/**
 * Returns the Monaco editor theme config to pass to defineTheme/setTheme.
 *
 * If monaco_theme_data is populated in DB, use it as a full custom definition.
 * Otherwise falls back to the named built-in matching the theme's setting.
 *
 * Usage in MonacoEditorView.tsx:
 *   const { name, data } = getMonacoThemeConfig(theme);
 *   if (data) monaco.editor.defineTheme(name, data);
 *   monaco.editor.setTheme(name);
 */
export function getMonacoThemeConfig(theme) {
  if (!theme) return { name: 'vs-dark', data: null };

  if (theme.monaco_theme_data) {
    return {
      name: `iam-${theme.slug}`,
      data: theme.monaco_theme_data,
    };
  }

  return {
    name: theme.monaco_theme || 'vs-dark',
    data: null,
  };
}

// ─── User Preference ──────────────────────────────────────────────────────────

/**
 * Persist a user's theme choice to user_preferences.
 */
export async function setUserThemePreference(env, userId, slug) {
  if (!env.DB || !userId || !slug) return false;
  try {
    await env.DB.prepare(
      `INSERT INTO user_preferences (user_id, theme_preset, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         theme_preset = excluded.theme_preset,
         updated_at = excluded.updated_at`
    ).bind(String(userId), String(slug)).run();
    return true;
  } catch (e) {
    console.warn('[themes] setUserThemePreference error', e?.message);
    return false;
  }
}

/**
 * Get a user's saved theme slug from user_preferences.
 * Returns null if not set.
 */
export async function getUserThemePreference(env, userId) {
  if (!env.DB || !userId) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT theme_preset FROM user_preferences WHERE user_id = ? LIMIT 1`
    ).bind(String(userId)).first();
    return row?.theme_preset || null;
  } catch (_) {
    return null;
  }
}

// ─── Normalize ────────────────────────────────────────────────────────────────

/**
 * Sanitize any string into a valid slug format.
 * No defaults applied — caller is responsible for fallback.
 */
export function normalizeThemeSlug(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function parseThemeRow(row) {
  let config = {};
  if (row.config) {
    try { config = JSON.parse(row.config); } catch (_) {}
  }

  let monacoThemeData = null;
  if (row.monaco_theme_data) {
    try { monacoThemeData = JSON.parse(row.monaco_theme_data); } catch (_) {}
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    display_name: row.display_name || row.name,
    theme_family: row.theme_family || 'custom',
    monaco_theme: row.monaco_theme || 'vs-dark',
    monaco_bg: row.monaco_bg || null,
    monaco_theme_data: monacoThemeData,
    css_url: row.css_url || null,
    is_system: !!row.is_system,
    config,
  };
}
