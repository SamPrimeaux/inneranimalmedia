import React, { useEffect, useState } from 'react';

interface CmsTheme {
  id: string;
  name: string;
  slug: string;
  theme_family: string;
  monaco_bg: string | null;
  sort_order: number;
  config: string;
}

interface ThemeSwitcherProps {
  workspaceId?: string | null;
}

const COLLAB_WORKSPACE_ID = 'global';

function applyTheme(vars: Record<string, string>): void {
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => {
    root.style.setProperty(k, v);
  });
}

function normalizeConfigRaw(theme: CmsTheme): string {
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

async function selectTheme(theme: CmsTheme): Promise<void> {
  const preview = await fetch('/api/themes/active', { credentials: 'include' })
    .then((r) => r.json())
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
    body: JSON.stringify({ theme_id: theme.id }),
  });

  if (!res.ok && preview?.data && typeof preview.data === 'object') {
    applyTheme(preview.data as Record<string, string>);
    return;
  }

  await fetch(`/api/collab/canvas/theme?workspace_id=${COLLAB_WORKSPACE_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ theme_slug: theme.slug }),
  }).catch(() => {});
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ workspaceId }) => {
  const [themes, setThemes] = useState<CmsTheme[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  useEffect(() => {
    const qs =
      workspaceId != null && String(workspaceId).trim() !== ''
        ? `?workspace_id=${encodeURIComponent(String(workspaceId).trim())}`
        : '';
    fetch(`/api/themes${qs}`)
      .then((res) => res.json())
      .then((data: { themes?: unknown }) => {
        const list = data.themes;
        if (!Array.isArray(list)) return;
        setThemes(
          list.map((t: Record<string, unknown>) => ({
            id: String(t.id ?? ''),
            name: String(t.name ?? ''),
            slug: String(t.slug ?? ''),
            theme_family: String(t.theme_family ?? 'custom'),
            monaco_bg: t.monaco_bg != null ? String(t.monaco_bg) : null,
            sort_order: typeof t.sort_order === 'number' ? t.sort_order : 0,
            config: typeof t.config === 'string' ? t.config : JSON.stringify(t.config ?? {}),
          })),
        );
      })
      .catch(console.error);

    fetch(`/api/themes/active${qs}`)
      .then((res) => res.json())
      .then((payload: { slug?: string }) => {
        if (payload?.slug) setActiveSlug(String(payload.slug));
      })
      .catch(() => {});
  }, [workspaceId]);

  return (
    <div className="p-4">
      <h3 className="text-sm font-medium text-[var(--text-main)] mb-4 uppercase tracking-wider">Themes</h3>
      <div className="grid grid-cols-2 gap-3">
        {themes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => {
              void selectTheme(theme).then(() => {
                setActiveSlug(theme.slug);
              });
            }}
            className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${
              activeSlug === theme.slug
                ? 'border-[var(--solar-cyan)] bg-[var(--bg-hover)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: theme.monaco_bg || '#1e293b',
                border:
                  theme.theme_family === 'light'
                    ? '2px solid rgba(0,0,0,0.15)'
                    : '2px solid rgba(255,255,255,0.12)',
                flexShrink: 0,
              }}
            />
            <span className="text-xs font-medium text-[var(--text-main)]">{theme.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
