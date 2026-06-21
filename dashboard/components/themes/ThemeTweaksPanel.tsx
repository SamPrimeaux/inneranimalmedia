import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { applyCmsThemeToDocument, type CmsActiveThemePayload } from '../../src/applyCmsTheme';
import { ThemePreviewCanvas } from './ThemePreviewCanvas';
import type { CatalogTheme } from './ThemePreviewCard';
import {
  applyFieldsLive,
  DEFAULT_TWEAK_FIELDS,
  fetchCfImageLibrary,
  fieldsFromTheme,
  type ThemeTweakFields,
  updatePayloadFromFields,
} from './themeTweaksModel';

export type ThemeTweaksPanelProps = {
  workspaceId?: string | null;
  theme: CatalogTheme | null;
  createMode?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
};

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'color';
}) {
  return (
    <label className="grid gap-1 text-[11px]">
      <span className="text-[var(--text-muted)] uppercase tracking-wide">{label}</span>
      <div className="flex gap-2 items-center">
        {type === 'color' ? (
          <input
            type="color"
            value={value.startsWith('#') && value.length >= 7 ? value.slice(0, 7) : '#2563EB'}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-10 rounded border border-[var(--dashboard-border)] bg-transparent cursor-pointer"
          />
        ) : null}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 rounded-md border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-2 py-1.5 text-[12px] text-[var(--text-main)] font-mono"
        />
      </div>
    </label>
  );
}

export function ThemeTweaksPanel({
  workspaceId,
  theme,
  createMode = false,
  onClose,
  onSaved,
  onDeleted,
}: ThemeTweaksPanelProps): React.ReactElement {
  const [fields, setFields] = useState<ThemeTweakFields>(() =>
    createMode ? { ...DEFAULT_TWEAK_FIELDS } : fieldsFromTheme(theme),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [library, setLibrary] = useState<Array<{ id: string; url: string; name?: string }>>([]);
  const [loadingImages, setLoadingImages] = useState(false);

  useEffect(() => {
    setFields(
      createMode
        ? { ...DEFAULT_TWEAK_FIELDS, slug: `theme-${Date.now().toString(36).slice(-6)}` }
        : fieldsFromTheme(theme),
    );
    setMsg(null);
  }, [theme, createMode]);

  useEffect(() => {
    applyFieldsLive(fields);
  }, [fields]);

  const previewModel = useMemo(
    () => ({
      canvas: fields.canvas,
      panel: fields.panel,
      nav: fields.nav,
      shell: fields.syncNavShell ? fields.nav : fields.shell,
      text: fields.text,
      primary: fields.primary,
      monacoBg: fields.monacoBg,
      monacoText: fields.text,
    }),
    [fields],
  );

  const patchField = useCallback((key: keyof ThemeTweakFields, value: string | boolean) => {
    setFields((prev) => {
      const next = { ...prev, [key]: value } as ThemeTweakFields;
      if (key === 'nav' && next.syncNavShell) next.shell = String(value);
      if (key === 'shell' && next.syncNavShell) next.nav = String(value);
      return next;
    });
  }, []);

  const loadLibrary = useCallback(async () => {
    setLoadingImages(true);
    try {
      setLibrary(await fetchCfImageLibrary(1));
    } finally {
      setLoadingImages(false);
    }
  }, []);

  const save = useCallback(
    async (applyAfter = false) => {
      if (!workspaceId?.trim()) {
        setMsg('Workspace required to save.');
        return;
      }
      setBusy(true);
      setMsg(null);
      try {
        const endpoint = createMode ? '/api/themes/create' : '/api/themes/update';
        const body = createMode
          ? {
              workspace_id: workspaceId.trim(),
              ...updatePayloadFromFields(fields, { create: true }),
              apply_to_workspace: applyAfter,
            }
          : {
              workspace_id: workspaceId.trim(),
              theme_id: theme?.id,
              ...updatePayloadFromFields(fields, { theme_id: theme?.id }),
              apply_to_workspace: applyAfter,
              preview_live: applyAfter,
            };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => null)) as {
          error?: string;
          active_theme?: CmsActiveThemePayload;
        };
        if (!res.ok) {
          setMsg(json?.error || 'Save failed');
          return;
        }
        if (json?.active_theme) {
          applyCmsThemeToDocument(json.active_theme);
          window.dispatchEvent(new CustomEvent('iam:invalidate-active-theme-fetch'));
        }
        setMsg(createMode ? 'Theme created.' : 'Saved.');
        onSaved();
      } catch {
        setMsg('Save failed');
      } finally {
        setBusy(false);
      }
    },
    [workspaceId, fields, createMode, theme?.id, onSaved],
  );

  const remove = useCallback(async () => {
    if (!theme?.id || createMode) return;
    if (!window.confirm(`Archive theme "${theme.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/themes/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ theme_id: theme.id }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string };
        setMsg(json?.error || 'Delete failed');
        return;
      }
      onDeleted?.();
      onClose();
    } finally {
      setBusy(false);
    }
  }, [theme, createMode, onDeleted, onClose]);

  return (
    <aside className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--dashboard-border)] shrink-0">
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-main)]">
            {createMode ? 'New theme' : 'Theme tweaks'}
          </h4>
          <p className="text-[11px] text-[var(--text-muted)]">Live preview on this dashboard session</p>
        </div>
        <button type="button" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)]" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
        <div className="rounded-lg overflow-hidden border border-[var(--dashboard-border)]">
          {fields.preview_image_url ? (
            <img src={fields.preview_image_url} alt="" className="w-full aspect-[16/9] object-cover max-h-32" />
          ) : (
            <ThemePreviewCanvas model={previewModel} height={112} />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" value={fields.name} onChange={(v) => patchField('name', v)} />
          <Field label="Slug" value={fields.slug} onChange={(v) => patchField('slug', v)} />
        </div>

        <label className="grid gap-1 text-[11px]">
          <span className="text-[var(--text-muted)] uppercase tracking-wide">Cover image URL</span>
          <div className="flex gap-2">
            <input
              type="url"
              value={fields.preview_image_url}
              onChange={(e) => patchField('preview_image_url', e.target.value)}
              placeholder="https://imagedelivery.net/…"
              className="flex-1 rounded-md border border-[var(--dashboard-border)] bg-[var(--dashboard-canvas)] px-2 py-1.5 text-[12px] font-mono"
            />
            <button
              type="button"
              className="text-[11px] px-2 py-1 rounded-md border border-[var(--dashboard-border)] shrink-0"
              onClick={() => {
                setImagePickerOpen((o) => !o);
                if (!library.length) void loadLibrary();
              }}
            >
              CF Images
            </button>
          </div>
        </label>

        {imagePickerOpen ? (
          <div className="rounded-lg border border-[var(--dashboard-border)] p-2 max-h-40 overflow-auto grid grid-cols-4 gap-2">
            {loadingImages ? (
              <p className="text-[11px] text-[var(--text-muted)] col-span-4">Loading library…</p>
            ) : null}
            {library.map((img) => (
              <button
                key={img.id || img.url}
                type="button"
                title={img.name || img.url}
                className="rounded overflow-hidden border border-[var(--dashboard-border)] hover:ring-2 ring-[var(--color-primary)]"
                onClick={() => {
                  patchField('preview_image_url', img.url);
                  setImagePickerOpen(false);
                }}
              >
                <img src={img.url} alt="" className="w-full aspect-square object-cover" loading="lazy" />
              </button>
            ))}
            {!loadingImages && !library.length ? (
              <p className="text-[11px] text-[var(--text-muted)] col-span-4">No Cloudflare Images in library yet.</p>
            ) : null}
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-[12px] text-[var(--text-main)]">
          <input
            type="checkbox"
            checked={fields.syncNavShell}
            onChange={(e) => patchField('syncNavShell', e.target.checked)}
          />
          Sync top nav + sidebar chrome
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Canvas" value={fields.canvas} onChange={(v) => patchField('canvas', v)} type="color" />
          <Field label="Panel" value={fields.panel} onChange={(v) => patchField('panel', v)} type="color" />
          <Field label="Top nav" value={fields.nav} onChange={(v) => patchField('nav', v)} type="color" />
          {!fields.syncNavShell ? (
            <Field label="Sidebar" value={fields.shell} onChange={(v) => patchField('shell', v)} type="color" />
          ) : null}
          <Field label="Primary" value={fields.primary} onChange={(v) => patchField('primary', v)} type="color" />
          <Field label="Primary hover" value={fields.primaryHover} onChange={(v) => patchField('primaryHover', v)} type="color" />
          <Field label="Text" value={fields.text} onChange={(v) => patchField('text', v)} type="color" />
          <Field label="Muted" value={fields.muted} onChange={(v) => patchField('muted', v)} type="color" />
          <Field label="Nav text" value={fields.textNav} onChange={(v) => patchField('textNav', v)} type="color" />
          <Field label="Sidebar text" value={fields.textSidebar} onChange={(v) => patchField('textSidebar', v)} type="color" />
          <Field label="Border" value={fields.border} onChange={(v) => patchField('border', v)} type="color" />
          <Field label="Monaco bg" value={fields.monacoBg} onChange={(v) => patchField('monacoBg', v)} type="color" />
        </div>

        <label className="grid gap-1 text-[11px]">
          <span className="text-[var(--text-muted)] uppercase tracking-wide">Family</span>
          <select
            value={fields.theme_family}
            onChange={(e) => patchField('theme_family', e.target.value)}
            className="rounded-md border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-2 py-1.5 text-[12px]"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        {msg ? <p className="text-[11px] text-[var(--text-muted)]">{msg}</p> : null}
      </div>

      <div className="shrink-0 flex flex-wrap gap-2 p-4 border-t border-[var(--dashboard-border)]">
        <button
          type="button"
          disabled={busy}
          className="text-[11px] px-3 py-1.5 rounded-md bg-[var(--color-primary)] text-white font-medium disabled:opacity-50"
          onClick={() => void save(false)}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          disabled={busy}
          className="text-[11px] px-3 py-1.5 rounded-md border border-[var(--dashboard-border)]"
          onClick={() => void save(true)}
        >
          Save & apply
        </button>
        {!createMode && theme ? (
          <button
            type="button"
            disabled={busy}
            className="text-[11px] px-3 py-1.5 rounded-md border border-red-500/40 text-red-400 ml-auto"
            onClick={() => void remove()}
          >
            Delete
          </button>
        ) : null}
      </div>
    </aside>
  );
}
