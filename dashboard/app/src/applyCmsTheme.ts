/**
 * applyCmsTheme.ts
 *
 * Applies CMS theme variables from GET /api/themes/active to :root.
 * Source of truth is always the database (cms_themes).
 * localStorage caches vars for first-paint only (see index.html bootstrap script).
 *
 * No legacy key references. No hardcoded values. All vars CSS-driven.
 */

// ─── localStorage keys ────────────────────────────────────────────────────────

export const INNERANIMALMEDIA_LS_THEME_CSS    = 'inneranimalmedia_theme_css';
export const INNERANIMALMEDIA_LS_THEME_SLUG   = 'inneranimalmedia_theme_slug';
export const INNERANIMALMEDIA_LS_THEME_IS_DARK = 'inneranimalmedia_theme_is_dark';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CmsActiveThemePayload = {
  slug?:    string;
  name?:    string;
  is_dark?: boolean;
  data?:    Record<string, string>;
};

// ─── No-op — legacy migration removed. Remove this import from App.tsx. ──────

export function migrateLegacyThemeLocalStorage(): void {}

// ─── Core apply ───────────────────────────────────────────────────────────────

/**
 * Apply a theme payload to :root and persist vars to localStorage for
 * next first-paint. Returns false if payload has no usable vars.
 */
export function applyCmsThemeToDocument(payload: CmsActiveThemePayload): boolean {
  const vars = payload.data;
  if (!vars || typeof vars !== 'object' || Object.keys(vars).length === 0) return false;

  // Apply all CSS vars to :root
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => {
    if (k && v != null) root.style.setProperty(k, String(v));
  });

  // Persist for first-paint bootstrap
  try {
    localStorage.setItem(INNERANIMALMEDIA_LS_THEME_CSS, JSON.stringify(vars));
  } catch { /* quota exceeded — non-fatal */ }

  // Persist slug for UI (ThemeSwitcher highlight etc.)
  if (payload.slug) {
    try {
      localStorage.setItem(INNERANIMALMEDIA_LS_THEME_SLUG, payload.slug);
    } catch { /* ignore */ }
  }

  // Apply and persist dark/light preference
  if (typeof payload.is_dark === 'boolean') {
    root.setAttribute('data-theme', payload.is_dark ? 'dark' : 'light');
    try {
      localStorage.setItem(INNERANIMALMEDIA_LS_THEME_IS_DARK, payload.is_dark ? '1' : '0');
    } catch { /* ignore */ }
  }

  return true;
}

// ─── API fetch ────────────────────────────────────────────────────────────────

function activeThemeUrl(workspaceId: string | null | undefined): string {
  const ws = workspaceId?.trim();
  return ws
    ? `/api/themes/active?workspace_id=${encodeURIComponent(ws)}`
    : '/api/themes/active';
}

/**
 * Fetch active theme from API, apply to :root, and persist to localStorage.
 * Returns parsed payload or null on failure.
 */
export async function fetchAndApplyActiveCmsTheme(
  workspaceId: string | null | undefined,
): Promise<CmsActiveThemePayload | null> {
  try {
    const res = await fetch(activeThemeUrl(workspaceId), { credentials: 'same-origin' });
    if (!res.ok) return null;
    const raw = await res.json() as CmsActiveThemePayload;
    applyCmsThemeToDocument(raw);
    return raw;
  } catch {
    return null;
  }
}

/**
 * Fetch active theme slug only — for UI state (ThemeSwitcher highlight).
 * Does not re-apply vars.
 */
export async function fetchActiveCmsThemeSlug(
  workspaceId: string | null | undefined,
): Promise<string | null> {
  try {
    const res = await fetch(activeThemeUrl(workspaceId), { credentials: 'same-origin' });
    if (!res.ok) return null;
    const raw = await res.json() as { slug?: string };
    return typeof raw.slug === 'string' ? raw.slug : null;
  } catch {
    return null;
  }
}

/**
 * Apply cached theme vars from localStorage — used as first-paint fallback
 * before the API fetch resolves. Called synchronously on mount.
 */
export function applyCachedCmsThemeFallback(): boolean {
  try {
    const cached = localStorage.getItem(INNERANIMALMEDIA_LS_THEME_CSS);
    if (!cached) return false;
    const vars = JSON.parse(cached) as Record<string, string>;
    if (!vars || typeof vars !== 'object') return false;
    const d = localStorage.getItem(INNERANIMALMEDIA_LS_THEME_IS_DARK);
    const payload: CmsActiveThemePayload = {
      data: vars,
      ...(d === '1' || d === '0' ? { is_dark: d === '1' } : {}),
    };
    return applyCmsThemeToDocument(payload);
  } catch {
    return false;
  }
}
