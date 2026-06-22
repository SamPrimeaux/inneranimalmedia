import React from 'react';
import { ThemePreviewCanvas, type PreviewModel } from './ThemePreviewCanvas';
import { ThemeSwatches } from './ThemeSwatches';

export type CatalogTheme = {
  id: string;
  name: string;
  slug: string;
  theme_family: string;
  status?: string | null;
  preview_image_url?: string | null;
  css_url?: string | null;
  preview_model?: PreviewModel;
  config?: unknown;
  parsed?: unknown;
  parse_errors?: Record<string, string | null | undefined>;
};

export type ThemePreviewCardProps = {
  theme: CatalogTheme;
  active: boolean;
  selected?: boolean;
  compact?: boolean;
  onOpen: (t: CatalogTheme) => void;
  onApply: (t: CatalogTheme) => void;
  onEdit: (t: CatalogTheme) => void;
  onPreviewLocal: (t: CatalogTheme) => void;
  onInspect: (t: CatalogTheme) => void;
  onOpenPackage: (t: CatalogTheme) => void;
  onRegenerate: (t: CatalogTheme) => void;
};

export function ThemePreviewCard({
  theme,
  active,
  selected = false,
  compact,
  onOpen,
  onApply,
  onEdit,
  onPreviewLocal,
  onInspect,
  onOpenPackage,
  onRegenerate,
}: ThemePreviewCardProps): React.ReactElement {
  const pm = theme.preview_model || {};
  const swatches = pm.swatches?.length
    ? pm.swatches
    : ([pm.canvas, pm.primary, pm.monacoBg, pm.nav].filter(Boolean) as string[]);

  const previewVisual =
    theme.preview_image_url && !compact ? (
      <div className="rounded-lg overflow-hidden border border-black/10 bg-black/5 aspect-[16/9] max-h-28">
        <img src={theme.preview_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
      </div>
    ) : (
      <ThemePreviewCanvas model={pm} height={compact ? 52 : 112} />
    );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(theme);
    }
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Open theme ${theme.name}`}
      onClick={() => onOpen(theme)}
      onKeyDown={handleKeyDown}
      className={`rounded-xl border transition-all flex flex-col overflow-hidden cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--solar-cyan)] ${
        selected
          ? 'border-[var(--solar-cyan)] ring-2 ring-[var(--solar-cyan)]/40 bg-[var(--bg-hover)] shadow-md'
          : active
            ? 'border-[var(--solar-cyan)] ring-1 ring-[var(--solar-cyan)]/35 bg-[var(--bg-hover)]'
            : 'border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] hover:bg-[var(--bg-hover)] hover:border-[var(--solar-cyan)]/50'
      }`}
    >
      <div className={compact ? 'p-2 gap-3 flex flex-row items-stretch' : 'p-3 gap-3 flex flex-col'}>
        <div className={compact ? 'w-[120px] shrink-0' : ''}>{previewVisual}</div>

        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-semibold text-[var(--text-main)] truncate">{theme.name}</h4>
                {active ? (
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--solar-cyan)]/15 text-[var(--solar-cyan)]">
                    Active
                  </span>
                ) : null}
                {selected ? (
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                    Editing
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-[var(--text-muted)] font-mono truncate">{theme.slug}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {theme.theme_family}
                {theme.status ? ` · ${theme.status}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-1">
            <ThemeSwatches colors={swatches} />
            <span
              className="text-[10px] px-1.5 py-0.5 rounded border border-black/10 font-mono"
              style={{
                background: pm.monacoBg || '#1e293b',
                color: pm.monacoText || '#e2e8f0',
              }}
              title="Monaco bg"
            >
              ●
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded text-white font-medium"
              style={{ background: pm.primary || '#0ea5e9' }}
              title="Primary"
            >
              Aa
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="text-[11px] px-2 py-1 rounded-md bg-[var(--color-primary)] text-white font-medium"
              onClick={() => onEdit(theme)}
            >
              Tweaks
            </button>
            <button
              type="button"
              className="text-[11px] px-2 py-1 rounded-md bg-[var(--color-primary)]/90 text-white font-medium"
              onClick={() => onApply(theme)}
            >
              Apply
            </button>
            <button
              type="button"
              className="text-[11px] px-2 py-1 rounded-md bg-[var(--bg-hover)] text-[var(--text-main)] border border-[var(--dashboard-border)]"
              onClick={() => onPreviewLocal(theme)}
            >
              Preview locally
            </button>
            <button
              type="button"
              className="text-[11px] px-2 py-1 rounded-md bg-[var(--bg-hover)] text-[var(--text-main)] border border-[var(--dashboard-border)]"
              onClick={() => onInspect(theme)}
            >
              Inspect JSON
            </button>
            <button
              type="button"
              className="text-[11px] px-2 py-1 rounded-md bg-[var(--bg-hover)] text-[var(--text-main)] border border-[var(--dashboard-border)]"
              onClick={() => onOpenPackage(theme)}
            >
              Open R2 package
            </button>
            <button
              type="button"
              className="text-[11px] px-2 py-1 rounded-md bg-[var(--bg-hover)] text-[var(--text-main)] border border-[var(--dashboard-border)]"
              onClick={() => onRegenerate(theme)}
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
