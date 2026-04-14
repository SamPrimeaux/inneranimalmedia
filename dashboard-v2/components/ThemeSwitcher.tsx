import React, { useEffect, useState } from 'react';
import {
  fetchAndApplyActiveCmsTheme,
  fetchActiveCmsThemeSlug,
} from '../src/applyCmsTheme';

interface Theme {
  id: string | number;
  name: string;
  slug: string;
  config: string | Record<string, string>;
  preview_color?: string;
}

interface ThemeSwitcherProps {
  workspaceId?: string | null;
}

const COLLAB_WORKSPACE_ID = 'global';

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ workspaceId }) => {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/themes')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.themes)) {
          setThemes(data.themes as Theme[]);
        }
      })
      .catch(console.error);

    fetchActiveCmsThemeSlug(workspaceId)
      .then((slug) => {
        if (slug) setActiveSlug(slug);
      })
      .catch(() => {});
  }, [workspaceId]);

  const applyTheme = async (theme: Theme) => {
    try {
      // Keep backward-compat endpoint for other pages that depend on it
      await fetch('/api/themes/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ theme_id: String(theme.id) }),
      });

      // New collaborative endpoint — broadcasts to all connected clients
      const collabRes = await fetch(`/api/collab/canvas/theme?workspace_id=${COLLAB_WORKSPACE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ theme_slug: theme.slug }),
      });

      if (collabRes.ok) {
        const data = await collabRes.json() as { ok: boolean; theme_slug?: string };
        // Apply cssVars from the canonical theme broadcast (received via WebSocket in App.tsx)
        // Also fetch and apply locally so this tab updates immediately
        const payload = await fetchAndApplyActiveCmsTheme(workspaceId);
        if (payload?.slug) setActiveSlug(payload.slug);
      } else {
        // Collab endpoint unavailable — still apply locally via existing mechanism
        const payload = await fetchAndApplyActiveCmsTheme(workspaceId);
        if (payload?.slug) setActiveSlug(payload.slug);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-4">
      <h3 className="text-sm font-medium text-[var(--text-main)] mb-4 uppercase tracking-wider">Themes</h3>
      <div className="grid grid-cols-2 gap-3">
        {themes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => applyTheme(theme)}
            className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${
              activeSlug === theme.slug
                ? 'border-[var(--solar-cyan)] bg-[var(--bg-hover)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <div
              className="w-6 h-6 rounded-full border border-[var(--border-subtle)]"
              style={{ backgroundColor: theme.preview_color || 'var(--border-subtle)' }}
            />
            <span className="text-xs font-medium text-[var(--text-main)]">{theme.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
