/**
 * Shopify-style Theme Studio workbench — three panels + draft preview canvas.
 * Preview stage uses ?preview=draft&cms=1 (refine before publish).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Columns2,
  Eye,
  EyeOff,
  LayoutGrid,
  Monitor,
  Plus,
  Settings2,
  Smartphone,
  Sparkles,
  Tablet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  IAM_AGENT_CHAT_COMPOSE,
  IAM_AGENT_ENSURE_PANEL,
} from '../../agentChatConstants';
import { publishCmsPage, saveCmsPageDraft } from '../../../src/dashboard/cms/cmsApi';
import { CmsImagePicker } from './CmsImagePicker';
import { resolveCmsLogoUrl } from './resolveCmsBranding';
import { buildCmsHubPath, buildCmsPath } from './cmsRoute';
import './themeStudio.css';

export type ThemeStudioViewport = 'desktop' | 'tablet' | 'mobile';
export type ThemeStudioRailMode = 'sections' | 'theme-settings' | 'app-embeds';

type AppContext = {
  id?: string;
  app_key?: string;
  display_name?: string;
  logo_url?: string | null;
  cms_api_profile?: string | null;
  website_r2?: { bucket_name?: string; custom_domain?: string | null } | null;
  catalog_r2?: { bucket_name?: string } | null;
};

type BootPage = {
  id: string;
  slug?: string;
  title?: string;
  route_path?: string;
  status?: string;
  page_type?: string;
  is_homepage?: number | boolean;
  preview_draft_url?: string;
  embed_url?: string;
  live_url?: string;
};

type BootSection = {
  id: string;
  page_id: string;
  section_type?: string;
  section_name?: string;
  sort_order?: number;
  is_visible?: number | boolean;
  section_data?: Record<string, unknown> | string | null;
};

type Props = {
  projectSlug: string;
  pageId?: string | null;
  workspaceId?: string;
  publicDomain?: string | null;
  siteName?: string | null;
  logoUrl?: string | null;
  apiProfile?: string | null;
  onNavigatePath?: (path: string, opts?: { replace?: boolean }) => void;
};

const BLANK_BASELINE: Array<{
  section_type: string;
  section_name: string;
  sort_order: number;
  section_data: Record<string, unknown>;
}> = [
  {
    section_type: 'header',
    section_name: 'Header',
    sort_order: 10,
    section_data: { headline: 'Site header', links: [] },
  },
  {
    section_type: 'hero',
    section_name: 'Hero',
    sort_order: 20,
    section_data: { headline: 'Welcome', subheadline: 'Edit this draft section', cta: 'Get started' },
  },
  {
    section_type: 'rich_text',
    section_name: 'Body',
    sort_order: 30,
    section_data: { body: 'Replace this copy with your story.' },
  },
  {
    section_type: 'featured_collection',
    section_name: 'Featured',
    sort_order: 40,
    section_data: { title: 'Featured', items: [] },
  },
  {
    section_type: 'footer',
    section_name: 'Footer',
    sort_order: 90,
    section_data: { copyright: '' },
  },
];

function sectionKeyOf(s: BootSection): string {
  const raw = String(s.section_name || s.section_type || s.id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return raw || s.id;
}

function groupForSection(s: BootSection): 'HEADER' | 'TEMPLATE' | 'FOOTER' {
  const t = String(s.section_type || s.section_name || '').toLowerCase();
  if (t.includes('header') || t.includes('nav')) return 'HEADER';
  if (t.includes('footer')) return 'FOOTER';
  return 'TEMPLATE';
}

function parseSectionData(raw: BootSection['section_data']): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
}

export function ThemeStudioWorkbench({
  projectSlug,
  pageId = null,
  workspaceId = '',
  publicDomain = null,
  siteName = null,
  logoUrl = null,
  apiProfile = null,
  onNavigatePath,
}: Props) {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  const [app, setApp] = useState<AppContext | null>(null);
  const [pages, setPages] = useState<BootPage[]>([]);
  const [sectionsByPage, setSectionsByPage] = useState<Record<string, BootSection[]>>({});
  const [activePageId, setActivePageId] = useState<string | null>(pageId);
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);
  const [railMode, setRailMode] = useState<ThemeStudioRailMode>('sections');
  const [viewport, setViewport] = useState<ThemeStudioViewport>('desktop');
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [rightTab, setRightTab] = useState<'content' | 'design' | 'advanced'>('content');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [embeds, setEmbeds] = useState<{
    connected: Array<{ id: string; display_name: string; provider_key: string; is_active?: boolean }>;
    recommended: Array<{ provider_key: string; display_name: string }>;
  }>({ connected: [], recommended: [] });
  const [embedsLoading, setEmbedsLoading] = useState(false);
  const [themeCatsOpen, setThemeCatsOpen] = useState<Record<string, boolean>>({ Logo: true });
  const [draftFields, setDraftFields] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [canvasNonce, setCanvasNonce] = useState(0);
  const [themeLogoOverride, setThemeLogoOverride] = useState<string | null>(null);

  const go = useCallback(
    (path: string, opts?: { replace?: boolean }) => {
      if (onNavigatePath) onNavigatePath(path, opts);
      else navigate(path, opts);
    },
    [navigate, onNavigatePath],
  );

  const reloadBootstrap = useCallback(async () => {
    const qs = encodeURIComponent(projectSlug);
    const [appRes, bootRes] = await Promise.all([
      fetch(`/api/cms/app-context?project_slug=${qs}`, { credentials: 'include', cache: 'no-store' }),
      fetch(`/api/cms/bootstrap?project_slug=${qs}&site=${qs}`, {
        credentials: 'include',
        cache: 'no-store',
      }),
    ]);
    const appJson = (await appRes.json().catch(() => ({}))) as AppContext & { error?: string };
    const bootJson = (await bootRes.json().catch(() => ({}))) as {
      pages?: BootPage[];
      sections_by_page?: Record<string, BootSection[]>;
      error?: string;
      home_page?: { id?: string };
    };
    if (appRes.ok) setApp(appJson);
    else if (appRes.status !== 404) setError(appJson.error || 'app_context_failed');
    if (!bootRes.ok) {
      setError(bootJson.error || 'bootstrap_failed');
      setPages([]);
      return;
    }
    const list = Array.isArray(bootJson.pages) ? bootJson.pages : [];
    setPages(list);
    setSectionsByPage(bootJson.sections_by_page || {});
    const focus =
      pageId ||
      list.find((p) => p.is_homepage)?.id ||
      bootJson.home_page?.id ||
      list[0]?.id ||
      null;
    setActivePageId((prev) => prev || focus);
  }, [projectSlug, pageId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await reloadBootstrap();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load_failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadBootstrap]);

  useEffect(() => {
    if (railMode !== 'app-embeds') return;
    let cancelled = false;
    setEmbedsLoading(true);
    fetch(`/api/cms/client-integrations?project_slug=${encodeURIComponent(projectSlug)}`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        setEmbeds({
          connected: Array.isArray(data.connected) ? data.connected : [],
          recommended: Array.isArray(data.recommended) ? data.recommended : [],
        });
      })
      .catch(() => {
        if (!cancelled) setEmbeds({ connected: [], recommended: [] });
      })
      .finally(() => {
        if (!cancelled) setEmbedsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [railMode, projectSlug]);

  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId) || pages[0] || null,
    [pages, activePageId],
  );

  const sections = useMemo(() => {
    if (!activePage) return [];
    const list = sectionsByPage[activePage.id] || [];
    return [...list].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }, [activePage, sectionsByPage]);

  const grouped = useMemo(() => {
    const out: Record<'HEADER' | 'TEMPLATE' | 'FOOTER', BootSection[]> = {
      HEADER: [],
      TEMPLATE: [],
      FOOTER: [],
    };
    for (const s of sections) out[groupForSection(s)].push(s);
    return out;
  }, [sections]);

  const canvasSrc = useMemo(() => {
    if (!activePage) return null;
    const base =
      activePage.preview_draft_url ||
      activePage.embed_url ||
      (publicDomain
        ? `https://${String(publicDomain).replace(/^https?:\/\//, '')}${activePage.route_path || '/'}`
        : activePage.route_path || '/');
    try {
      const u = new URL(base, window.location.origin);
      u.searchParams.set('cms', '1');
      u.searchParams.set('preview', 'draft');
      if (activePage.id) u.searchParams.set('page_id', activePage.id);
      u.searchParams.set('_ts', String(canvasNonce));
      return u.toString();
    } catch {
      return `${base}${base.includes('?') ? '&' : '?'}cms=1&preview=draft&_ts=${canvasNonce}`;
    }
  }, [activePage, publicDomain, canvasNonce]);

  const postSelect = useCallback((key: string | null) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    if (!key) {
      win.postMessage({ type: 'cms:deselect' }, '*');
      return;
    }
    win.postMessage({ type: 'cms:select-section', sectionKey: key }, '*');
  }, []);

  const loadSectionDetail = useCallback(async (section: BootSection) => {
    setDraftFields(parseSectionData(section.section_data));
    try {
      const res = await fetch(`/api/cms/sections?page_id=${encodeURIComponent(section.page_id)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as {
        sections?: BootSection[];
      };
      const found = (data.sections || []).find((s) => s.id === section.id);
      if (found) {
        setDraftFields(parseSectionData(found.section_data));
        setSectionsByPage((prev) => {
          const list = prev[section.page_id] || [];
          return {
            ...prev,
            [section.page_id]: list.map((s) => (s.id === found.id ? { ...s, ...found } : s)),
          };
        });
      }
    } catch {
      /* keep local parse */
    }
  }, []);

  const selectSection = useCallback(
    (key: string) => {
      setActiveSectionKey(key);
      setRailMode('sections');
      setDirty(false);
      postSelect(key);
      const row = railRef.current?.querySelector(`[data-section-key="${CSS.escape(key)}"]`);
      row?.scrollIntoView({ block: 'nearest' });
      const sec = sections.find((s) => sectionKeyOf(s) === key);
      if (sec) void loadSectionDetail(sec);
    },
    [loadSectionDetail, postSelect, sections],
  );

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'cms:section-clicked' && d.sectionKey) {
        const key = String(d.sectionKey);
        setActiveSectionKey(key);
        setRailMode('sections');
        const sec = sections.find((s) => sectionKeyOf(s) === key || s.id === key);
        if (sec) void loadSectionDetail(sec);
        const row = railRef.current?.querySelector(`[data-section-key="${CSS.escape(key)}"]`);
        row?.scrollIntoView({ block: 'nearest' });
      }
      if (d.type === 'iam-cms-select-section' && d.section_name) {
        setActiveSectionKey(String(d.section_name));
      }
      if (d.type === 'cms:section-action') {
        setActiveSectionKey(String(d.sectionKey || ''));
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [loadSectionDetail, sections]);

  const branding = resolveCmsLogoUrl({
    appKey: projectSlug,
    clientAppsLogo: app?.logo_url,
    propLogo: logoUrl,
  });
  const brand = app?.display_name || siteName || projectSlug;
  const mark = themeLogoOverride || branding.logo_url;
  const profile = app?.cms_api_profile || apiProfile || 'primetch';
  const activeSection = sections.find((s) => sectionKeyOf(s) === activeSectionKey) || null;

  const themeCategories = [
    'Logo',
    'Colors',
    'Typography',
    'Layout',
    'Animations',
    'Buttons',
    'Inputs',
    'Media',
    'Brand information',
  ];

  const openAgent = useCallback(() => {
    window.dispatchEvent(new CustomEvent(IAM_AGENT_ENSURE_PANEL));
    const sectionHint = activeSection
      ? `Selected section: ${activeSection.section_name || activeSection.section_type} (${activeSection.id}) on page ${activePage?.title || activePage?.id || ''}.`
      : `Editing CMS page ${activePage?.title || activePage?.id || ''} for ${projectSlug}.`;
    window.dispatchEvent(
      new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
        detail: {
          message: '',
          send: false,
          ensureAgentPanel: true,
          project_slug: projectSlug,
          surface: 'cms',
          context: {
            cms: {
              project_slug: projectSlug,
              page_id: activePage?.id || null,
              section_id: activeSection?.id || null,
              section_key: activeSectionKey,
              hint: sectionHint,
            },
          },
        },
      }),
    );
  }, [activePage, activeSection, activeSectionKey, projectSlug]);

  const updateField = useCallback((key: string, value: unknown) => {
    setDraftFields((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!activePage) return;
    setSaving(true);
    setActionMsg(null);
    try {
      if (activeSection) {
        const res = await fetch(`/api/cms/sections/${encodeURIComponent(activeSection.id)}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            section_data: draftFields,
            section_name: activeSection.section_name,
            section_type: activeSection.section_type,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      } else {
        await saveCmsPageDraft(activePage.id, {
          title: activePage.title,
          project_slug: projectSlug,
        });
      }
      setDirty(false);
      setActionMsg('Draft saved');
      setCanvasNonce((n) => n + 1);
      await reloadBootstrap();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [activePage, activeSection, draftFields, projectSlug, reloadBootstrap]);

  const handlePublish = useCallback(async () => {
    if (!activePage) return;
    setPublishing(true);
    setActionMsg(null);
    try {
      if (dirty && activeSection) {
        await handleSave();
      }
      await publishCmsPage(activePage.id, { project_slug: projectSlug });
      setActionMsg('Published');
      setCanvasNonce((n) => n + 1);
      await reloadBootstrap();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }, [activePage, dirty, activeSection, handleSave, projectSlug, reloadBootstrap]);

  const seedBaseline = useCallback(async () => {
    if (!activePage) return;
    setSeeding(true);
    setActionMsg(null);
    try {
      for (const seed of BLANK_BASELINE) {
        const res = await fetch('/api/cms/sections', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            page_id: activePage.id,
            project_slug: projectSlug,
            ...seed,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `Seed failed (${res.status})`);
        }
      }
      setActionMsg('Baseline layout added (draft)');
      await reloadBootstrap();
      setCanvasNonce((n) => n + 1);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  }, [activePage, projectSlug, reloadBootstrap]);

  const toggleVisibility = useCallback(
    async (section: BootSection) => {
      const next = !(section.is_visible !== 0 && section.is_visible !== false);
      await fetch(`/api/cms/sections/${encodeURIComponent(section.id)}/visibility`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_visible: next }),
      }).catch(() => null);
      setSectionsByPage((prev) => {
        const list = prev[section.page_id] || [];
        return {
          ...prev,
          [section.page_id]: list.map((s) =>
            s.id === section.id ? { ...s, is_visible: next ? 1 : 0 } : s,
          ),
        };
      });
      setCanvasNonce((n) => n + 1);
    },
    [],
  );

  const removeSection = useCallback(async () => {
    if (!activeSection || !activePage) return;
    const res = await fetch(`/api/cms/sections/${encodeURIComponent(activeSection.id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setActionMsg(data.error || 'Remove failed');
      return;
    }
    setActiveSectionKey(null);
    setDraftFields({});
    setDirty(false);
    await reloadBootstrap();
    setCanvasNonce((n) => n + 1);
  }, [activeSection, activePage, reloadBootstrap]);

  const contentKeys = useMemo(() => {
    const keys = Object.keys(draftFields).filter((k) => typeof draftFields[k] !== 'object');
    if (!keys.length) return ['headline', 'subheadline', 'body'];
    return keys.slice(0, 12);
  }, [draftFields]);

  return (
    <div className="ts-shell">
      <header className="ts-topbar">
        <div className="ts-topbar__left">
          <button
            type="button"
            className="ts-icon-btn"
            aria-label="Back to themes"
            onClick={() => go(buildCmsHubPath(projectSlug))}
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
          </button>
          <div className="ts-topbar__theme">
            {mark ? (
              <img src={mark} alt="" className="ts-topbar__logo" />
            ) : (
              <span className="ts-topbar__logo-fallback">{brand.slice(0, 2).toUpperCase()}</span>
            )}
            <span className="ts-topbar__name">{brand}</span>
            <span className="ts-theme-status">{dirty ? 'Unsaved' : 'Draft'}</span>
            <span className="ts-topbar__profile" title="cms_api_profile">
              {profile}
            </span>
          </div>
        </div>

        <div className="ts-topbar__center">
          <button
            type="button"
            className="ts-page-selector"
            onClick={() => setPageMenuOpen((v) => !v)}
            aria-expanded={pageMenuOpen}
          >
            {activePage?.title || activePage?.slug || 'Select page'}
            <span aria-hidden>▾</span>
          </button>
          {pageMenuOpen ? (
            <div className="ts-page-menu" role="listbox">
              {pages.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`ts-page-menu__row${p.id === activePage?.id ? ' is-active' : ''}`}
                  onClick={() => {
                    setActivePageId(p.id);
                    setPageMenuOpen(false);
                    setActiveSectionKey(null);
                    setDirty(false);
                    go(
                      buildCmsPath({
                        panel: 'pages',
                        pageId: p.id,
                        siteSlug: projectSlug,
                      }),
                      { replace: true },
                    );
                  }}
                >
                  <span>{p.title || p.slug || p.id}</span>
                  <span className="ts-page-menu__route">{p.route_path || ''}</span>
                </button>
              ))}
              <div className="ts-page-menu__divider" />
              <button
                type="button"
                className="ts-page-menu__row ts-page-menu__row--create"
                onClick={() => {
                  setPageMenuOpen(false);
                  go(buildCmsPath({ panel: 'pages', siteSlug: projectSlug }));
                }}
              >
                + Create new page
              </button>
            </div>
          ) : null}
        </div>

        <div className="ts-topbar__right">
          <button
            type="button"
            className="ts-icon-btn"
            aria-label="Open Agent Sam"
            title="Agent Sam"
            onClick={openAgent}
          >
            <Sparkles size={15} strokeWidth={1.75} />
          </button>
          <div className="ts-viewport" role="group" aria-label="Viewport">
            {(
              [
                ['desktop', Monitor],
                ['tablet', Tablet],
                ['mobile', Smartphone],
              ] as const
            ).map(([id, Icon]) => (
              <button
                key={id}
                type="button"
                className={`ts-viewport__btn${viewport === id ? ' is-active' : ''}`}
                onClick={() => setViewport(id)}
                aria-pressed={viewport === id}
                title={id}
              >
                <Icon size={15} strokeWidth={1.75} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ts-btn ts-btn--ghost"
            disabled={saving || !activePage}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="ts-btn ts-btn--primary"
            disabled={publishing || !activePage}
            onClick={() => void handlePublish()}
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </header>
      {actionMsg ? <div className="ts-toast">{actionMsg}</div> : null}

      <div className="ts-body">
        <aside className="ts-rail">
          <div className="ts-rail__toolbar">
            <button
              type="button"
              className="ts-toolbar-icon"
              aria-label="Back"
              onClick={() => go(buildCmsHubPath(projectSlug))}
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              className={`ts-toolbar-icon${railMode === 'sections' ? ' is-active' : ''}`}
              aria-label="Sections"
              onClick={() => setRailMode('sections')}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={`ts-toolbar-icon${railMode === 'theme-settings' ? ' is-active' : ''}`}
              aria-label="Theme settings"
              onClick={() => setRailMode('theme-settings')}
            >
              <Settings2 size={16} />
            </button>
            <button
              type="button"
              className={`ts-toolbar-icon${railMode === 'app-embeds' ? ' is-active' : ''}`}
              aria-label="App embeds"
              onClick={() => setRailMode('app-embeds')}
            >
              <Columns2 size={16} />
            </button>
          </div>

          <div className="ts-rail__scroll" ref={railRef}>
            {loading ? (
              <div className="ts-skeleton" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="ts-skeleton__row" />
                ))}
              </div>
            ) : error ? (
              <p className="ts-rail__empty">{error}</p>
            ) : railMode === 'sections' ? (
              <>
                {(['HEADER', 'TEMPLATE', 'FOOTER'] as const).map((group) =>
                  grouped[group].length ? (
                    <div key={group}>
                      <div className="ts-section-group-label">{group}</div>
                      {grouped[group].map((s) => {
                        const key = sectionKeyOf(s);
                        const visible = s.is_visible !== 0 && s.is_visible !== false;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            data-section-key={key}
                            className={`ts-section-row${activeSectionKey === key ? ' is-active' : ''}`}
                            onClick={() => selectSection(key)}
                          >
                            <LayoutGrid size={14} className="ts-section-row__icon" />
                            <span className="ts-section-row__text">
                              <span className="ts-section-row__name">
                                {s.section_name || s.section_type || key}
                              </span>
                              <span className="ts-section-row__subtitle">{s.section_type || key}</span>
                            </span>
                            <span
                              className="ts-section-row__eye"
                              title={visible ? 'Visible' : 'Hidden'}
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleVisibility(s);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.stopPropagation();
                                  void toggleVisibility(s);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              {visible ? <Eye size={14} /> : <EyeOff size={14} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null,
                )}
                {!sections.length ? (
                  <div className="ts-rail__empty-stack">
                    <p className="ts-rail__empty">No sections on this page yet.</p>
                    <button
                      type="button"
                      className="ts-btn ts-btn--primary ts-btn--sm"
                      disabled={seeding || !activePage}
                      onClick={() => void seedBaseline()}
                    >
                      {seeding ? 'Adding…' : 'Add baseline layout'}
                    </button>
                  </div>
                ) : null}
              </>
            ) : railMode === 'theme-settings' ? (
              <>
                <div className="ts-rail__mode-title">Theme settings</div>
                {themeCategories.map((cat) => {
                  const open = !!themeCatsOpen[cat];
                  return (
                    <div key={cat}>
                      <button
                        type="button"
                        className={`ts-theme-setting-row${open ? ' is-open' : ''}`}
                        onClick={() => setThemeCatsOpen((m) => ({ ...m, [cat]: !m[cat] }))}
                      >
                        <span>{cat}</span>
                        <span className="ts-theme-setting-chevron">▾</span>
                      </button>
                      {open && cat === 'Logo' ? (
                        <div className="ts-theme-setting-body">
                          <div className="ts-image-picker">
                            {mark ? (
                              <img src={mark} alt="" className="ts-image-picker__thumb" />
                            ) : null}
                            <button
                              type="button"
                              className="ts-image-picker-btn"
                              onClick={() => setPickerOpen(true)}
                            >
                              {mark ? 'Change' : 'Select'}
                            </button>
                            <p className="ts-image-picker-hint">
                              Source: {branding.branding_source} ·{' '}
                              {app?.website_r2?.bucket_name ||
                                app?.website_r2?.custom_domain ||
                                'client_apps inventory'}
                            </p>
                          </div>
                        </div>
                      ) : null}
                      {open && cat !== 'Logo' ? (
                        <div className="ts-theme-setting-body">
                          <p className="ts-image-picker-hint">Wired to cms_themes for this site.</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                <div className="ts-rail__mode-title">App embeds</div>
                {embedsLoading ? (
                  <div className="ts-skeleton" aria-hidden>
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="ts-skeleton__row" />
                    ))}
                  </div>
                ) : embeds.connected.length ? (
                  embeds.connected.map((item) => (
                    <div key={item.id} className="ts-app-embed-row">
                      <span className="ts-app-embed-name">{item.display_name}</span>
                      <input
                        type="checkbox"
                        className="ts-app-embed-toggle"
                        checked={item.is_active !== false}
                        readOnly
                        aria-label={item.display_name}
                      />
                    </div>
                  ))
                ) : (
                  <p className="ts-rail__empty">No integrations connected for this site.</p>
                )}
                {embeds.recommended.length ? (
                  <>
                    <div className="ts-section-group-label">Recommended</div>
                    {embeds.recommended.slice(0, 8).map((item) => (
                      <div key={item.provider_key} className="ts-app-embed-row">
                        <span className="ts-app-embed-name">{item.display_name}</span>
                        <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm">
                          Connect
                        </button>
                      </div>
                    ))}
                  </>
                ) : null}
              </>
            )}
          </div>

          {railMode === 'sections' ? (
            <button type="button" className="ts-add-section" onClick={() => setAddOpen(true)}>
              <Plus size={14} />
              Add section
            </button>
          ) : null}
        </aside>

        <main className="ts-canvas">
          <div className={`ts-canvas__frame ts-canvas__frame--${viewport}`}>
            {canvasSrc ? (
              <iframe
                ref={iframeRef}
                title="CMS preview draft"
                src={canvasSrc}
                className="ts-canvas__iframe"
              />
            ) : (
              <div className="ts-canvas__empty">Select a page to preview draft</div>
            )}
          </div>
          {addOpen ? (
            <div className="ts-drawer" role="dialog" aria-label="Add section">
              <div className="ts-drawer__panel">
                <div className="ts-drawer__head">
                  <input className="ts-drawer__search" placeholder="Search sections" />
                  <button type="button" className="ts-icon-btn" onClick={() => setAddOpen(false)}>
                    Close
                  </button>
                </div>
                <p className="ts-drawer__hint">
                  Templates load from the cms catalog bucket. Applying writes into this site&apos;s
                  draft — not live publish.
                </p>
                <button
                  type="button"
                  className="ts-section-picker-item"
                  onClick={() => {
                    setAddOpen(false);
                    void seedBaseline();
                  }}
                >
                  Add baseline layout (header + 3 + footer)
                </button>
                <button
                  type="button"
                  className="ts-section-picker-item"
                  onClick={() => {
                    setAddOpen(false);
                    go(buildCmsPath({ panel: 'templates', siteSlug: projectSlug }));
                  }}
                >
                  Browse template library
                </button>
              </div>
              <button
                type="button"
                className="ts-drawer__backdrop"
                aria-label="Close drawer"
                onClick={() => setAddOpen(false)}
              />
            </div>
          ) : null}
        </main>

        <aside className="ts-right">
          <div className="ts-right__tabs">
            {(['content', 'design', 'advanced'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`ts-rp-tab${rightTab === tab ? ' is-active' : ''}`}
                onClick={() => setRightTab(tab)}
              >
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          {activeSection ? (
            <>
              <div className="ts-rp-section-header">
                <span>&lt;&gt; {sectionKeyOf(activeSection)}</span>
              </div>
              {rightTab === 'content' ? (
                <>
                  <div className="ts-setting-row">
                    <div className="ts-setting-label">Section name</div>
                    <input
                      className="ts-setting-input"
                      value={String(activeSection.section_name || '')}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSectionsByPage((prev) => {
                          const list = prev[activeSection.page_id] || [];
                          return {
                            ...prev,
                            [activeSection.page_id]: list.map((s) =>
                              s.id === activeSection.id ? { ...s, section_name: v } : s,
                            ),
                          };
                        });
                        setDirty(true);
                      }}
                    />
                  </div>
                  {contentKeys.map((key) => (
                    <div key={key} className="ts-setting-row">
                      <div className="ts-setting-label">{key}</div>
                      <textarea
                        className="ts-setting-input ts-setting-input--area"
                        rows={key === 'body' ? 4 : 2}
                        value={String(draftFields[key] ?? '')}
                        onChange={(e) => updateField(key, e.target.value)}
                      />
                    </div>
                  ))}
                </>
              ) : null}
              {rightTab === 'design' ? (
                <div className="ts-setting-row">
                  <div className="ts-setting-label">Type</div>
                  <div className="ts-setting-value">{activeSection.section_type || '—'}</div>
                </div>
              ) : null}
              {rightTab === 'advanced' ? (
                <>
                  <div className="ts-setting-row">
                    <div className="ts-setting-label">Section id</div>
                    <div className="ts-setting-value">{activeSection.id}</div>
                  </div>
                  {workspaceId ? (
                    <div className="ts-setting-row">
                      <div className="ts-setting-label">Workspace</div>
                      <div className="ts-setting-value">{workspaceId}</div>
                    </div>
                  ) : null}
                </>
              ) : null}
              <button type="button" className="ts-remove-section" onClick={() => void removeSection()}>
                Remove section
              </button>
            </>
          ) : (
            <p className="ts-rail__empty">Select a section on the canvas or in the rail.</p>
          )}
        </aside>
      </div>

      <CmsImagePicker
        projectSlug={projectSlug}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => {
          setThemeLogoOverride(url);
          setDirty(true);
          setActionMsg('Logo selected — Save to keep (site brand row updates separately)');
        }}
      />
    </div>
  );
}

export default ThemeStudioWorkbench;
