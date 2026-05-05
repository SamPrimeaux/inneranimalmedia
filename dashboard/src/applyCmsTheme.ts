/**
 * Apply theme variables from GET /api/themes/active (cms_themes + settings.appearance.theme).
 * Source of truth is the database; localStorage caches variables for first paint (see index.html).
 */

/** localStorage keys — Inner Animal Media dashboard only (legacy mcad_* removed on read). */
export const INNERANIMALMEDIA_LS_THEME_CSS = 'inneranimalmedia_theme_css';
export const INNERANIMALMEDIA_LS_THEME_SLUG = 'inneranimalmedia_theme_slug';
export const INNERANIMALMEDIA_LS_THEME_IS_DARK = 'inneranimalmedia_theme_is_dark';

const LEGACY_MCAD_CSS = 'mcad_theme_css';
const LEGACY_MCAD_SLUG = 'mcad_theme_slug';
const LEGACY_MCAD_IS_DARK = 'mcad_theme_is_dark';

export type CmsActiveThemePayload = {
  slug?: string;
  name?: string;
  is_dark?: boolean;
  /** Monaco theme id (e.g. vs, vs-dark, hc-light, or a custom id registered client-side). */
  monaco_theme?: string | null;
  monaco_bg?: string | null;
  /** JSON string of `IStandaloneThemeData` for `monaco.editor.defineTheme` when theme id is custom. */
  monaco_theme_data?: string | null;
  data?: Record<string, string>;
};

/** Sets data-monaco-theme / data-monaco-bg for MonacoSurface and notifies listeners. */
export function syncMonacoHtmlDataAttributes(
  payload: Pick<CmsActiveThemePayload, 'monaco_theme' | 'monaco_bg' | 'is_dark' | 'monaco_theme_data'>,
  cssVars?: Record<string, string> | null,
): void {
  let themeStr =
    payload.monaco_theme != null && String(payload.monaco_theme).trim() !== ''
      ? String(payload.monaco_theme).trim()
      : '';
  if (!themeStr) {
    themeStr = payload.is_dark === false ? 'vs' : 'vs-dark';
  }
  let bgStr =
    payload.monaco_bg != null && String(payload.monaco_bg).trim() !== ''
      ? String(payload.monaco_bg).trim()
      : '';
  if (!bgStr && cssVars && typeof cssVars === 'object') {
    const scene = cssVars['--scene-bg']?.trim();
    const bg = cssVars['--bg']?.trim();
    bgStr = scene || bg || '';
  }
  if (!bgStr) bgStr = '#1e293b';
  document.documentElement.setAttribute('data-monaco-theme', themeStr);
  document.documentElement.setAttribute('data-monaco-bg', bgStr);
  document.documentElement.setAttribute(
    'data-monaco-theme-data',
    payload.monaco_theme_data ?? '',
  );
  try {
    window.dispatchEvent(new CustomEvent('iam:cms-theme-applied'));
  } catch {
    /* ignore */
  }
}

/** One-time read: copy legacy mcad_* keys into inneranimalmedia_* then drop legacy. */
export function migrateLegacyThemeLocalStorage(): void {
  try {
    if (!localStorage.getItem(INNERANIMALMEDIA_LS_THEME_CSS)) {
      const c = localStorage.getItem(LEGACY_MCAD_CSS);
      if (c) {
        localStorage.setItem(INNERANIMALMEDIA_LS_THEME_CSS, c);
        localStorage.removeItem(LEGACY_MCAD_CSS);
      }
    } else {
      localStorage.removeItem(LEGACY_MCAD_CSS);
    }
    if (!localStorage.getItem(INNERANIMALMEDIA_LS_THEME_SLUG)) {
      const s = localStorage.getItem(LEGACY_MCAD_SLUG);
      if (s) {
        localStorage.setItem(INNERANIMALMEDIA_LS_THEME_SLUG, s);
        localStorage.removeItem(LEGACY_MCAD_SLUG);
      }
    } else {
      localStorage.removeItem(LEGACY_MCAD_SLUG);
    }
    const dNew = localStorage.getItem(INNERANIMALMEDIA_LS_THEME_IS_DARK);
    if (dNew !== '1' && dNew !== '0') {
      const d = localStorage.getItem(LEGACY_MCAD_IS_DARK);
      if (d === '1' || d === '0') {
        localStorage.setItem(INNERANIMALMEDIA_LS_THEME_IS_DARK, d);
      }
    }
    localStorage.removeItem(LEGACY_MCAD_IS_DARK);
  } catch {
    /* ignore */
  }
}

export function applyCmsThemeToDocument(payload: CmsActiveThemePayload): boolean {
  const vars = payload.data;
  let applied = false;
  if (vars && typeof vars === 'object' && Object.keys(vars).length > 0) {
    applied = true;
    Object.entries(vars).forEach(([k, v]) => {
      if (v == null || k == null) return;
      document.documentElement.style.setProperty(k, String(v));
    });
    try {
      localStorage.setItem(INNERANIMALMEDIA_LS_THEME_CSS, JSON.stringify(vars));
      localStorage.removeItem(LEGACY_MCAD_CSS);
    } catch {
      /* ignore quota */
    }
  }
  if (payload.slug) {
    try {
      localStorage.setItem(INNERANIMALMEDIA_LS_THEME_SLUG, payload.slug);
      localStorage.removeItem(LEGACY_MCAD_SLUG);
    } catch {
      /* ignore */
    }
  }
  if (typeof payload.is_dark === 'boolean') {
    document.documentElement.setAttribute('data-theme', payload.slug ?? (payload.is_dark ? 'dark' : 'light'));
    document.documentElement.classList.toggle('dark', payload.is_dark === true);
    try {
      localStorage.setItem(INNERANIMALMEDIA_LS_THEME_IS_DARK, payload.is_dark ? '1' : '0');
      localStorage.removeItem(LEGACY_MCAD_IS_DARK);
    } catch {
      /* ignore */
    }
  }
  syncMonacoHtmlDataAttributes(payload, vars ?? null);
  return applied;
}

function activeThemeUrl(workspaceId: string | null | undefined): string {
  const ws = workspaceId?.trim() || '';
  return ws
    ? `/api/themes/active?workspace_id=${encodeURIComponent(ws)}`
    : '/api/themes/active';
}

/** Load active theme from API and apply to :root. Returns parsed payload or null. */
export async function fetchAndApplyActiveCmsTheme(
  workspaceId: string | null | undefined,
): Promise<CmsActiveThemePayload | null> {
  const res = await fetch(activeThemeUrl(workspaceId), { credentials: 'same-origin' });
  if (!res.ok) return null;
  const raw = (await res.json()) as CmsActiveThemePayload;
  applyCmsThemeToDocument(raw);
  return raw;
}

/** Read active slug for UI (e.g. ThemeSwitcher highlight) without re-applying vars. */
export async function fetchActiveCmsThemeSlug(
  workspaceId: string | null | undefined,
): Promise<string | null> {
  const res = await fetch(activeThemeUrl(workspaceId), { credentials: 'same-origin' });
  if (!res.ok) return null;
  const raw = (await res.json()) as { slug?: string };
  return typeof raw.slug === 'string' ? raw.slug : null;
}

export function applyCachedCmsThemeFallback(): boolean {
  migrateLegacyThemeLocalStorage();
  try {
    const cached = localStorage.getItem(INNERANIMALMEDIA_LS_THEME_CSS);
    if (!cached) return false;
    const vars = JSON.parse(cached) as Record<string, string>;
    if (!vars || typeof vars !== 'object') return false;
    const d = localStorage.getItem(INNERANIMALMEDIA_LS_THEME_IS_DARK);
    const payload: CmsActiveThemePayload = { data: vars };
    if (d === '1' || d === '0') payload.is_dark = d === '1';
    if (payload.monaco_theme == null) {
      payload.monaco_theme = payload.is_dark === false ? 'vs' : 'vs-dark';
    }
    return applyCmsThemeToDocument(payload);
  } catch {
    return false;
  }
}
