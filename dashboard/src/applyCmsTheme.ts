/**
 * Apply theme variables from GET /api/themes/active (live D1 config → `data`, plus Monaco metadata).
 * Source of truth for preview/edit is always D1 `cms_themes.config` merged server-side — not R2 `theme.css`.
 * Compiled CSS on R2 (`css_url`) is for public routes, published HTML, exports, and cacheable snapshots only.
 */

/** localStorage keys — Inner Animal Media dashboard only (legacy mcad_* removed on read). */
export const INNERANIMALMEDIA_LS_THEME_CSS = 'inneranimalmedia_theme_css';
export const INNERANIMALMEDIA_LS_THEME_SLUG = 'inneranimalmedia_theme_slug';
export const INNERANIMALMEDIA_LS_THEME_IS_DARK = 'inneranimalmedia_theme_is_dark';
/** Last active workspace id used for first-paint cache selection (not authority). */
export const INNERANIMALMEDIA_LS_THEME_LAST_WS = 'inneranimalmedia_theme_last_ws';

export function themeCssStorageKey(workspaceId: string | null | undefined): string {
  const w = workspaceId?.trim();
  return w ? `inneranimalmedia_theme_css:${w}` : INNERANIMALMEDIA_LS_THEME_CSS;
}

export function themeSlugStorageKey(workspaceId: string | null | undefined): string {
  const w = workspaceId?.trim();
  return w ? `inneranimalmedia_theme_slug:${w}` : INNERANIMALMEDIA_LS_THEME_SLUG;
}

export function themeIsDarkStorageKey(workspaceId: string | null | undefined): string {
  const w = workspaceId?.trim();
  return w ? `inneranimalmedia_theme_is_dark:${w}` : INNERANIMALMEDIA_LS_THEME_IS_DARK;
}

const INNERANIMALMEDIA_LS_THEME_MONACO = 'inneranimalmedia_theme_monaco';
const INNERANIMALMEDIA_LS_THEME_MONACO_DATA = 'inneranimalmedia_theme_monaco_data';

export function themeMonacoStorageKey(workspaceId: string | null | undefined): string {
  const w = workspaceId?.trim();
  return w ? `inneranimalmedia_theme_monaco:${w}` : INNERANIMALMEDIA_LS_THEME_MONACO;
}

export function themeMonacoDataStorageKey(workspaceId: string | null | undefined): string {
  const w = workspaceId?.trim();
  return w ? `inneranimalmedia_theme_monaco_data:${w}` : INNERANIMALMEDIA_LS_THEME_MONACO_DATA;
}

function monacoThemeIdFallback(slug: string | undefined): string | undefined {
  const s = slug != null && String(slug).trim() !== '' ? String(slug).trim() : '';
  return s ? `${s}-monaco` : undefined;
}

const LEGACY_MCAD_CSS = 'mcad_theme_css';
const LEGACY_MCAD_SLUG = 'mcad_theme_slug';
const LEGACY_MCAD_IS_DARK = 'mcad_theme_is_dark';

export type CmsActiveThemePayload = {
  slug?: string;
  name?: string;
  is_dark?: boolean;
  workspace_id?: string | null;
  project_id?: string | null;
  /** Live D1-backed styling (`live`); R2 snapshot URL is metadata only for published/public consumers. */
  theme_channel?: 'live' | string;
  /** Compiled snapshot URL on R2 — do not fetch for authenticated realtime theme apply; use `data`. */
  css_url?: string | null;
  compiled_css_hash?: string | null;
  resolved_from?: string;
  /** Monaco theme id (e.g. vs, vs-dark, hc-light, or a custom id registered client-side). */
  monaco_theme?: string | null;
  monaco_bg?: string | null;
  /** JSON string of `IStandaloneThemeData` for `monaco.editor.defineTheme` when theme id is custom. */
  monaco_theme_data?: string | null;
  data?: Record<string, string>;
};

/** Sets data-monaco-theme / data-monaco-bg for MonacoSurface and notifies listeners. */
export function syncMonacoHtmlDataAttributes(
  payload: Pick<CmsActiveThemePayload, 'monaco_theme' | 'monaco_bg' | 'is_dark' | 'monaco_theme_data' | 'slug'>,
  cssVars?: Record<string, string> | null,
): void {
  let themeStr =
    payload.monaco_theme != null && String(payload.monaco_theme).trim() !== ''
      ? String(payload.monaco_theme).trim()
      : '';
  if (!themeStr && payload.slug != null && String(payload.slug).trim() !== '') {
    themeStr = `${String(payload.slug).trim()}-monaco`;
  }
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

/** Call after live CMS vars are applied so dashboard alias tokens reject shell.css leakage. */
export function markDashboardThemeApplied(slug?: string | null): void {
  document.documentElement.setAttribute('data-dashboard-theme-ready', 'true');
  const s = slug != null && String(slug).trim() !== '' ? String(slug).trim() : null;
  if (s) document.documentElement.setAttribute('data-cms-theme', s);
  else document.documentElement.removeAttribute('data-cms-theme');
}

/** `?theme_debug=1` — logs resolved tokens (computed) for diagnosing shell vs Agent vs workspace drift. */
export function logDashboardThemeDebug(): void {
  if (typeof window === 'undefined') return;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('theme_debug') !== '1') return;
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    console.info('[iam theme_debug]', {
      slug: root.getAttribute('data-cms-theme'),
      theme_ready: root.getAttribute('data-dashboard-theme-ready'),
      '--bg-canvas': cs.getPropertyValue('--bg-canvas').trim(),
      '--bg-app': cs.getPropertyValue('--bg-app').trim(),
      '--bg-panel': cs.getPropertyValue('--bg-panel').trim(),
      '--dashboard-canvas': cs.getPropertyValue('--dashboard-canvas').trim(),
      '--dashboard-panel': cs.getPropertyValue('--dashboard-panel').trim(),
    });
  } catch {
    /* ignore */
  }
}

export function applyCmsThemeToDocument(payload: CmsActiveThemePayload): boolean {
  const wsCtx =
    payload.workspace_id != null && String(payload.workspace_id).trim() !== ''
      ? String(payload.workspace_id).trim()
      : null;
  const kCss = themeCssStorageKey(wsCtx);
  const kSlug = themeSlugStorageKey(wsCtx);
  const kDark = themeIsDarkStorageKey(wsCtx);
  const kMonaco = themeMonacoStorageKey(wsCtx);
  const kMonacoData = themeMonacoDataStorageKey(wsCtx);

  if (wsCtx) {
    try {
      localStorage.removeItem(INNERANIMALMEDIA_LS_THEME_CSS);
      localStorage.removeItem(INNERANIMALMEDIA_LS_THEME_SLUG);
      localStorage.removeItem(INNERANIMALMEDIA_LS_THEME_IS_DARK);
      localStorage.removeItem(INNERANIMALMEDIA_LS_THEME_MONACO);
      localStorage.removeItem(INNERANIMALMEDIA_LS_THEME_MONACO_DATA);
    } catch {
      /* ignore */
    }
  }

  const vars = payload.data;
  let applied = false;
  if (vars && typeof vars === 'object' && Object.keys(vars).length > 0) {
    applied = true;
    Object.entries(vars).forEach(([k, v]) => {
      if (v == null || k == null) return;
      document.documentElement.style.setProperty(k, String(v));
    });
    try {
      /* DB / API wins over any stale first-paint cache */
      localStorage.setItem(kCss, JSON.stringify(vars));
      if (wsCtx) {
        localStorage.setItem(INNERANIMALMEDIA_LS_THEME_LAST_WS, wsCtx);
      }
      localStorage.removeItem(LEGACY_MCAD_CSS);
    } catch {
      /* ignore quota */
    }
  }
  if (payload.slug) {
    try {
      localStorage.setItem(kSlug, payload.slug);
      localStorage.removeItem(LEGACY_MCAD_SLUG);
    } catch {
      /* ignore */
    }
  }
  try {
    const mt =
      payload.monaco_theme != null && String(payload.monaco_theme).trim() !== ''
        ? String(payload.monaco_theme).trim()
        : monacoThemeIdFallback(payload.slug) ?? '';
    if (mt) {
      localStorage.setItem(kMonaco, mt);
    }
    const md =
      payload.monaco_theme_data != null && String(payload.monaco_theme_data).trim() !== ''
        ? String(payload.monaco_theme_data)
        : '';
    if (md) {
      localStorage.setItem(kMonacoData, md);
    } else {
      localStorage.removeItem(kMonacoData);
    }
  } catch {
    /* ignore */
  }
  if (typeof payload.is_dark === 'boolean') {
    document.documentElement.setAttribute('data-theme', payload.slug ?? (payload.is_dark ? 'dark' : 'light'));
    document.documentElement.classList.toggle('dark', payload.is_dark === true);
    try {
      localStorage.setItem(kDark, payload.is_dark ? '1' : '0');
      localStorage.removeItem(LEGACY_MCAD_IS_DARK);
    } catch {
      /* ignore */
    }
  }
  syncMonacoHtmlDataAttributes(payload, vars ?? null);
  markDashboardThemeApplied(payload.slug ?? null);
  logDashboardThemeDebug();
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

/** First paint: prefer cache for `inneranimalmedia_theme_last_ws` so the correct workspace bucket loads before React resolves membership. */
export function applyCachedCmsThemeFallback(): boolean {
  migrateLegacyThemeLocalStorage();
  try {
    const last = localStorage.getItem(INNERANIMALMEDIA_LS_THEME_LAST_WS)?.trim();
    if (last) return applyCachedCmsThemeFallbackForWorkspace(last);
    return applyCachedLegacyGlobalThemeFallback();
  } catch {
    return false;
  }
}

/** Temporary paint for a known workspace id (must match active workspace after boot). */
export function applyCachedCmsThemeFallbackForWorkspace(workspaceId: string | null | undefined): boolean {
  migrateLegacyThemeLocalStorage();
  const w = workspaceId?.trim();
  if (!w) return applyCachedLegacyGlobalThemeFallback();
  try {
    const last = localStorage.getItem(INNERANIMALMEDIA_LS_THEME_LAST_WS)?.trim();
    if (last && last !== w) return false;
    const cached = localStorage.getItem(themeCssStorageKey(w));
    if (!cached) return false;
    const vars = JSON.parse(cached) as Record<string, string>;
    if (!vars || typeof vars !== 'object') return false;
    const d = localStorage.getItem(themeIsDarkStorageKey(w));
    const slug = localStorage.getItem(themeSlugStorageKey(w));
    const payload: CmsActiveThemePayload = { data: vars, workspace_id: w };
    if (slug) payload.slug = slug;
    if (d === '1' || d === '0') payload.is_dark = d === '1';
    const cachedMt = localStorage.getItem(themeMonacoStorageKey(w))?.trim();
    const cachedMd = localStorage.getItem(themeMonacoDataStorageKey(w));
    if (cachedMt) {
      payload.monaco_theme = cachedMt;
    } else if (payload.slug) {
      payload.monaco_theme = monacoThemeIdFallback(payload.slug);
    }
    if (cachedMd) {
      payload.monaco_theme_data = cachedMd;
    }
    if (payload.monaco_theme == null || String(payload.monaco_theme).trim() === '') {
      payload.monaco_theme = payload.is_dark === false ? 'vs' : 'vs-dark';
    }
    return applyCmsThemeToDocument(payload);
  } catch {
    return false;
  }
}

function applyCachedLegacyGlobalThemeFallback(): boolean {
  try {
    const cached = localStorage.getItem(INNERANIMALMEDIA_LS_THEME_CSS);
    if (!cached) return false;
    const vars = JSON.parse(cached) as Record<string, string>;
    if (!vars || typeof vars !== 'object') return false;
    const d = localStorage.getItem(INNERANIMALMEDIA_LS_THEME_IS_DARK);
    const slug = localStorage.getItem(INNERANIMALMEDIA_LS_THEME_SLUG);
    const payload: CmsActiveThemePayload = { data: vars };
    if (slug) payload.slug = slug;
    if (d === '1' || d === '0') payload.is_dark = d === '1';
    const cachedMt = localStorage.getItem(INNERANIMALMEDIA_LS_THEME_MONACO)?.trim();
    const cachedMd = localStorage.getItem(INNERANIMALMEDIA_LS_THEME_MONACO_DATA);
    if (cachedMt) {
      payload.monaco_theme = cachedMt;
    } else if (payload.slug) {
      payload.monaco_theme = monacoThemeIdFallback(payload.slug);
    }
    if (cachedMd) {
      payload.monaco_theme_data = cachedMd;
    }
    if (payload.monaco_theme == null || String(payload.monaco_theme).trim() === '') {
      payload.monaco_theme = payload.is_dark === false ? 'vs' : 'vs-dark';
    }
    return applyCmsThemeToDocument(payload);
  } catch {
    return false;
  }
}
