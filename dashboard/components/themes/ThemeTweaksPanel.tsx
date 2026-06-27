import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { applyCmsThemeToDocument, type CmsActiveThemePayload } from '../../src/applyCmsTheme';
import { ThemePreviewCanvas } from './ThemePreviewCanvas';
import type { CatalogTheme } from './ThemePreviewCard';
import { CfImagePicker, CoverImageAddButton } from './CfImagePicker';
import {
  applyFieldsLive,
  activePayloadFromFields,
  cacheThemeDraftForWorkspace,
  clearThemeDraftForWorkspace,
  DEFAULT_TWEAK_FIELDS,
  fieldsFromTheme,
  readThemeDraftForWorkspace,
  type ThemeTweakFields,
  updatePayloadFromFields,
} from './themeTweaksModel';
import {
  agentHomeFieldsFromTheme,
  agentHomePayloadFromFields,
  applyAgentHomeFieldsLive,
  DEFAULT_AGENT_HOME_TWEAK_FIELDS,
  type AgentHomeTweakFields,
} from './agentHomeSceneTweaksModel';

export type ThemeTweaksPanelProps = {
  workspaceId?: string | null;
  theme: CatalogTheme | null;
  createMode?: boolean;
  onClose: () => void;
  onSaved: (savedTheme?: CatalogTheme) => void;
  onDeleted?: () => void;
  className?: string;
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
            className="h-8 w-10 rounded border border-[var(--dashboard-border)] bg-transparent cursor-pointer shrink-0"
          />
        ) : null}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 rounded-md border border-[var(--dashboard-border)] bg-[var(--dashboard-canvas)] px-2 py-1.5 text-[12px] text-[var(--text-main)] font-mono"
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
  className = '',
}: ThemeTweaksPanelProps): React.ReactElement {
  const [fields, setFields] = useState<ThemeTweakFields>(() =>
    createMode ? { ...DEFAULT_TWEAK_FIELDS } : fieldsFromTheme(theme),
  );
  const [agentFields, setAgentFields] = useState<AgentHomeTweakFields>(() =>
    createMode ? { ...DEFAULT_AGENT_HOME_TWEAK_FIELDS } : agentHomeFieldsFromTheme(theme),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);

  const themeDraftKey = createMode ? '__new__' : theme?.id || theme?.slug || '';

  useEffect(() => {
    if (createMode) {
      setFields({ ...DEFAULT_TWEAK_FIELDS, slug: `theme-${Date.now().toString(36).slice(-6)}` });
      setAgentFields({ ...DEFAULT_AGENT_HOME_TWEAK_FIELDS });
    } else if (workspaceId?.trim() && themeDraftKey) {
      const draft = readThemeDraftForWorkspace(workspaceId, themeDraftKey);
      setFields(draft ?? fieldsFromTheme(theme));
    } else {
      setFields(fieldsFromTheme(theme));
      setAgentFields(agentHomeFieldsFromTheme(theme));
    }
    setMsg(null);
  }, [theme, createMode, workspaceId, themeDraftKey]);

  useEffect(() => {
    applyFieldsLive(fields);
    applyAgentHomeFieldsLive(agentFields);
    if (!workspaceId?.trim() || !themeDraftKey) return;
    const timer = window.setTimeout(() => {
      cacheThemeDraftForWorkspace(workspaceId, fields, themeDraftKey);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fields, agentFields, workspaceId, themeDraftKey]);

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
              ...agentHomePayloadFromFields(agentFields),
              apply_to_workspace: applyAfter,
            }
          : {
              workspace_id: workspaceId.trim(),
              theme_id: theme?.id,
              ...updatePayloadFromFields(fields, { theme_id: theme?.id }),
              ...agentHomePayloadFromFields(agentFields),
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
          theme?: CatalogTheme;
        };
        if (!res.ok) {
          setMsg(json?.error || 'Save failed');
          return;
        }
        if (json?.active_theme) {
          applyCmsThemeToDocument(json.active_theme);
          window.dispatchEvent(new CustomEvent('iam:invalidate-active-theme-fetch'));
        } else if (applyAfter && workspaceId?.trim()) {
          applyCmsThemeToDocument(activePayloadFromFields(fields, workspaceId.trim()));
        }
        clearThemeDraftForWorkspace(workspaceId, themeDraftKey);
        setMsg(createMode ? 'Theme created.' : applyAfter ? 'Saved and applied.' : 'Saved.');
        onSaved(json?.theme ?? undefined);
      } catch {
        setMsg('Save failed');
      } finally {
        setBusy(false);
      }
    },
    [workspaceId, fields, agentFields, createMode, theme?.id, themeDraftKey, onSaved],
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
    <>
      <aside
        className={`rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] flex flex-col min-h-0 overflow-hidden h-full max-h-[inherit] ${className}`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--dashboard-border)] shrink-0">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-[var(--text-main)] truncate">
              {createMode ? 'New theme' : theme?.name || 'Theme tweaks'}
            </h4>
            <p className="text-[11px] text-[var(--text-muted)]">Live preview · draft saved locally until Save</p>
          </div>
          <button
            type="button"
            className="text-xs shrink-0 px-2 py-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-5 custom-scrollbar">
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                Cover
              </span>
              <CoverImageAddButton onClick={() => setImagePickerOpen(true)} />
            </div>
            <button
              type="button"
              className="relative w-full rounded-lg overflow-hidden border border-[var(--dashboard-border)] group"
              onClick={() => setImagePickerOpen(true)}
            >
              {fields.preview_image_url ? (
                <img src={fields.preview_image_url} alt="" className="w-full aspect-[16/9] object-cover max-h-36" />
              ) : (
                <ThemePreviewCanvas model={previewModel} height={120} />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--text-main)]/0 group-hover:bg-[var(--text-main)]/25 transition-colors">
                <span className="opacity-0 group-hover:opacity-100 text-[11px] font-medium text-white bg-black/50 px-2 py-1 rounded-md">
                  Browse images
                </span>
              </div>
            </button>
            <input
              type="url"
              value={fields.preview_image_url}
              onChange={(e) => patchField('preview_image_url', e.target.value)}
              placeholder="https://imagedelivery.net/…"
              className="w-full rounded-md border border-[var(--dashboard-border)] bg-[var(--dashboard-canvas)] px-2 py-1.5 text-[11px] font-mono text-[var(--text-main)]"
            />
          </section>

          <section className="space-y-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Identity
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name" value={fields.name} onChange={(v) => patchField('name', v)} />
              <Field label="Slug" value={fields.slug} onChange={(v) => patchField('slug', v)} />
            </div>
            <label className="grid gap-1 text-[11px]">
              <span className="text-[var(--text-muted)] uppercase tracking-wide">Family</span>
              <select
                value={fields.theme_family}
                onChange={(e) => patchField('theme_family', e.target.value)}
                className="rounded-md border border-[var(--dashboard-border)] bg-[var(--dashboard-canvas)] px-2 py-1.5 text-[12px]"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                Colors
              </span>
              <label className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={fields.syncNavShell}
                  onChange={(e) => patchField('syncNavShell', e.target.checked)}
                />
                Sync nav + sidebar
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Canvas" value={fields.canvas} onChange={(v) => patchField('canvas', v)} type="color" />
              <Field label="Panel" value={fields.panel} onChange={(v) => patchField('panel', v)} type="color" />
              <Field label="Top nav" value={fields.nav} onChange={(v) => patchField('nav', v)} type="color" />
              {!fields.syncNavShell ? (
                <Field label="Sidebar" value={fields.shell} onChange={(v) => patchField('shell', v)} type="color" />
              ) : null}
              <Field label="Primary" value={fields.primary} onChange={(v) => patchField('primary', v)} type="color" />
              <Field
                label="Primary hover"
                value={fields.primaryHover}
                onChange={(v) => patchField('primaryHover', v)}
                type="color"
              />
              <Field label="Text" value={fields.text} onChange={(v) => patchField('text', v)} type="color" />
              <Field label="Muted" value={fields.muted} onChange={(v) => patchField('muted', v)} type="color" />
              <Field label="Nav text" value={fields.textNav} onChange={(v) => patchField('textNav', v)} type="color" />
              <Field
                label="Sidebar text"
                value={fields.textSidebar}
                onChange={(v) => patchField('textSidebar', v)}
                type="color"
              />
              <Field label="Border" value={fields.border} onChange={(v) => patchField('border', v)} type="color" />
              <Field label="Monaco bg" value={fields.monacoBg} onChange={(v) => patchField('monacoBg', v)} type="color" />
            </div>
          </section>

          <section className="space-y-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Agent home backdrop
            </span>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Time-of-day gradients for <code className="text-[var(--solar-cyan)]">/dashboard/agent</code>.
              Optional image URLs override each period (Cloudflare Images). Live preview updates the agent home if it is open.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <label className="grid gap-1 text-[11px]">
                <span className="text-[var(--text-muted)] uppercase tracking-wide">Vignette %</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={agentFields.agentVignette}
                  onChange={(e) =>
                    setAgentFields((p) => ({ ...p, agentVignette: Number(e.target.value) }))
                  }
                  className="w-full"
                />
              </label>
              <label className="grid gap-1 text-[11px]">
                <span className="text-[var(--text-muted)] uppercase tracking-wide">Grain</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={agentFields.agentGrain}
                  onChange={(e) =>
                    setAgentFields((p) => ({ ...p, agentGrain: Number(e.target.value) }))
                  }
                  className="w-full"
                />
              </label>
              <label className="grid gap-1 text-[11px]">
                <span className="text-[var(--text-muted)] uppercase tracking-wide">Glass %</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={agentFields.agentGlassOpacity}
                  onChange={(e) =>
                    setAgentFields((p) => ({ ...p, agentGlassOpacity: Number(e.target.value) }))
                  }
                  className="w-full"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {(
                [
                  ['Dawn image URL', 'agentBackdropDawn'],
                  ['Day image URL', 'agentBackdropDay'],
                  ['Dusk image URL', 'agentBackdropDusk'],
                  ['Night image URL', 'agentBackdropNight'],
                  ['Minimal dark URL', 'agentBackdropMinimal'],
                ] as const
              ).map(([label, key]) => (
                <label key={key} className="grid gap-1 text-[11px]">
                  <span className="text-[var(--text-muted)] uppercase tracking-wide">{label}</span>
                  <input
                    type="url"
                    value={agentFields[key]}
                    onChange={(e) => setAgentFields((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder="Leave empty for built-in gradient"
                    className="w-full rounded-md border border-[var(--dashboard-border)] bg-[var(--dashboard-canvas)] px-2 py-1.5 text-[11px] font-mono text-[var(--text-main)]"
                  />
                </label>
              ))}
            </div>
          </section>

          {msg ? <p className="text-[11px] text-[var(--text-muted)]">{msg}</p> : null}
        </div>

        <div className="shrink-0 flex flex-wrap gap-2 p-4 border-t border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]">
          <button
            type="button"
            disabled={busy}
            className="text-[11px] px-3 py-1.5 rounded-md border border-[var(--dashboard-border)] text-[var(--text-main)] font-medium disabled:opacity-50"
            onClick={() => void save(false)}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            disabled={busy}
            className="text-[11px] px-3 py-1.5 rounded-md bg-[var(--color-primary)] text-white font-medium disabled:opacity-50"
            onClick={() => void save(true)}
          >
            {busy ? 'Saving…' : 'Save & apply'}
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

      <CfImagePicker
        open={imagePickerOpen}
        onClose={() => setImagePickerOpen(false)}
        workspaceId={workspaceId}
        onSelect={(img) => patchField('preview_image_url', img.url)}
      />
    </>
  );
}
