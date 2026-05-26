import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { applyCmsThemeToDocument, type CmsActiveThemePayload } from '../../src/applyCmsTheme';
import { ThemePreviewCard, type CatalogTheme } from './ThemePreviewCard';
import { ThemeJsonInspector } from './ThemeJsonInspector';

type ThemesApiResponse = { themes?: CatalogTheme[] };

function normalizeConfigRaw(theme: CatalogTheme & { config?: unknown }): string {
  const c = theme.config as unknown;
  if (typeof c === 'string') return c;
  if (c != null && typeof c === 'object') {
    try {
      return JSON.stringify(c);
    } catch {
      return '{}';
    }
  }
  return '{}';
}

export type ThemeBrowserProps = {
  workspaceId?: string | null;
};

export function ThemeBrowser({ workspaceId }: ThemeBrowserProps): React.ReactElement {
  const [themes, setThemes] = useState<CatalogTheme[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'compact'>('grid');
  const [inspectTheme, setInspectTheme] = useState<CatalogTheme | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const qs =
    workspaceId != null && String(workspaceId).trim() !== ''
      ? `?workspace_id=${encodeURIComponent(String(workspaceId).trim())}`
      : '';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, activeRes] = await Promise.all([
        fetch(`/api/themes${qs}`, { credentials: 'include' }),
        fetch(`/api/themes/active${qs}`, { credentials: 'include' }),
      ]);
      const listJson = (await listRes.json()) as ThemesApiResponse;
      const list = listJson.themes;
      if (Array.isArray(list)) {
        setThemes(list as CatalogTheme[]);
      }
      if (activeRes.ok) {
        const a = (await activeRes.json()) as { slug?: string };
        if (a.slug) setActiveSlug(String(a.slug));
      }
    } catch (e) {
      console.error(e);
      setStatusMsg('Could not load themes');
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return themes;
    return themes.filter((t) => {
      const blob = `${t.name} ${t.slug} ${t.theme_family} ${t.status ?? ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [themes, query]);

  const applyTheme = useCallback(
    async (theme: CatalogTheme) => {
      if (!workspaceId?.trim()) {
        console.error('[ThemeBrowser] workspaceId required to apply theme');
        setStatusMsg('Pick a workspace before applying a theme.');
        return;
      }
      const ws = workspaceId.trim();
      const rollbackUrl = `/api/themes/active?workspace_id=${encodeURIComponent(ws)}`;
      const preview = await fetch(rollbackUrl, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      const raw = normalizeConfigRaw(theme);
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const vars = parsed.cssVars as Record<string, string> | undefined;
        const root = document.documentElement;
        if (vars && typeof vars === 'object') {
          Object.entries(vars).forEach(([k, v]) => {
            if (typeof v === 'string') root.style.setProperty(k, v);
          });
        } else {
          Object.entries(parsed).forEach(([k, v]) => {
            if (k.startsWith('--') && typeof v === 'string') root.style.setProperty(k, v);
          });
        }
      } catch {
        /* optimistic apply skipped */
      }

      const res = await fetch('/api/themes/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          theme_id: theme.id,
          scope: 'workspace',
          workspace_id: ws,
        }),
      });

      if (!res.ok && preview?.data && typeof preview.data === 'object') {
        applyCmsThemeToDocument(preview as CmsActiveThemePayload);
        setStatusMsg('Apply failed — restored previous theme.');
        return;
      }

      const payload = (await res.json().catch(() => null)) as CmsActiveThemePayload | null;
      const data = payload?.data;
      if (
        payload &&
        data != null &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        Object.keys(data as object).length > 0
      ) {
        applyCmsThemeToDocument(payload);
        try {
          window.dispatchEvent(new CustomEvent('iam:invalidate-active-theme-fetch'));
        } catch {
          /* ignore */
        }
      }

      await loadAll();
      setActiveSlug(theme.slug);
      setStatusMsg(null);
    },
    [workspaceId, loadAll],
  );

  const previewLocal = useCallback((theme: CatalogTheme) => {
    const pm = theme.preview_model;
    if (!pm) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${theme.slug}</title></head><body style="margin:0;background:${pm.canvas};font-family:system-ui"><div style="padding:16px;color:${pm.text}"><strong>${theme.name}</strong><pre style="font-size:11px">${JSON.stringify(pm, null, 2)}</pre></div></body></html>`;
    w.document.write(html);
    w.document.close();
  }, []);

  const openPackage = useCallback((theme: CatalogTheme) => {
    const url = `https://assets.inneranimalmedia.com/cms/themes/${encodeURIComponent(theme.slug)}/manifest.json`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const regenerate = useCallback(
    async (theme: CatalogTheme) => {
      if (!workspaceId?.trim()) {
        setStatusMsg('workspace_id required to regenerate package.');
        return;
      }
      setStatusMsg('Regenerating package…');
      try {
        const res = await fetch('/api/themes/package', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            workspace_id: workspaceId.trim(),
            theme_id: theme.id,
            slug: theme.slug,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setStatusMsg(typeof json?.error === 'string' ? json.error : 'Regenerate failed');
          return;
        }
        await loadAll();
        setStatusMsg('Package regenerated.');
      } catch {
        setStatusMsg('Regenerate failed');
      }
    },
    [workspaceId, loadAll],
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <h3 className="text-sm font-medium text-[var(--text-main)] uppercase tracking-wider">Themes</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Search name, slug, family…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="text-xs rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-3 py-1.5 min-w-[200px] text-[var(--text-main)]"
          />
          <div className="flex rounded-lg border border-[var(--dashboard-border)] overflow-hidden">
            <button
              type="button"
              className={`text-xs px-3 py-1.5 ${view === 'grid' ? 'bg-[var(--bg-hover)]' : ''}`}
              onClick={() => setView('grid')}
            >
              Grid
            </button>
            <button
              type="button"
              className={`text-xs px-3 py-1.5 ${view === 'compact' ? 'bg-[var(--bg-hover)]' : ''}`}
              onClick={() => setView('compact')}
            >
              List
            </button>
          </div>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]"
            onClick={() => void loadAll()}
          >
            Refresh
          </button>
        </div>
      </div>

      {statusMsg ? <p className="text-xs text-[var(--text-muted)]">{statusMsg}</p> : null}

      {loading ? (
        <p className="text-xs text-[var(--text-muted)]">Loading themes…</p>
      ) : (
        <div
          className={
            view === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'
              : 'flex flex-col gap-2'
          }
        >
          {filtered.map((theme) => (
            <ThemePreviewCard
              key={theme.id}
              theme={theme}
              active={activeSlug === theme.slug}
              compact={view === 'compact'}
              workspaceId={workspaceId}
              onApply={(t) => void applyTheme(t)}
              onPreviewLocal={previewLocal}
              onInspect={setInspectTheme}
              onOpenPackage={openPackage}
              onRegenerate={(t) => void regenerate(t)}
            />
          ))}
        </div>
      )}

      <ThemeJsonInspector
        open={inspectTheme != null}
        title={inspectTheme ? `Theme: ${inspectTheme.slug}` : ''}
        data={
          inspectTheme
            ? {
                row: inspectTheme,
                preview_model: inspectTheme.preview_model,
                parsed: (inspectTheme as { parsed?: unknown }).parsed,
                parse_errors: (inspectTheme as { parse_errors?: unknown }).parse_errors,
              }
            : null
        }
        onClose={() => setInspectTheme(null)}
      />
    </div>
  );
}
