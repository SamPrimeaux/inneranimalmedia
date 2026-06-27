import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Box,
  FolderOpen,
  Database,
  LayoutTemplate,
  Github,
  Cloud,
  Sparkles,
  Plus,
  ArrowRight,
  Pencil,
  X,
  type LucideIcon,
} from 'lucide-react';
import { IAM_AGENT_CHAT_COMPOSE } from '../agentChatConstants';
import { fetchProjectsOverview, type OverviewProject } from '../api/projects';
import {
  fetchDashboardHomeTiles,
  saveDashboardHomeTiles,
  type DashboardHomeTile,
} from '../api/home';
import { useWorkspace } from '../src/context/WorkspaceContext';
import './DashboardHome.css';

type HomeIconId =
  | 'agent'
  | 'cube'
  | 'folder'
  | 'chat'
  | 'studio'
  | 'database'
  | 'cms'
  | 'drive'
  | 'github'
  | 'cloud'
  | 'supabase';

type HomeAction = {
  id: string;
  title: string;
  body: string;
  label: string;
  path: string;
  tone: 'blue' | 'dark' | 'purple';
  icon: HomeIconId;
};

type ConnectCard = {
  id: string;
  title: string;
  connectSlug: string;
  iconSlug: string;
};

const CONNECT_CARDS: ConnectCard[] = [
  { id: 'drive', title: 'Google Drive', connectSlug: 'google_drive', iconSlug: 'google' },
  { id: 'github', title: 'GitHub', connectSlug: 'github', iconSlug: 'github' },
  { id: 'cloudflare', title: 'Cloudflare', connectSlug: 'cloudflare', iconSlug: 'cloudflare' },
  { id: 'supabase', title: 'Supabase', connectSlug: 'supabase', iconSlug: 'supabase' },
];

const INTEGRATION_ASSET_BASE = `${import.meta.env.BASE_URL || '/'}`.replace(/\/*$/, '/');

const HOME_ICONS: Record<HomeIconId, LucideIcon> = {
  agent: Bot,
  cube: Box,
  folder: FolderOpen,
  chat: Sparkles,
  studio: Box,
  database: Database,
  cms: LayoutTemplate,
  drive: Cloud,
  github: Github,
  cloud: Cloud,
  supabase: Database,
};

const FALLBACK_QUICK_TILES: DashboardHomeTile[] = [
  {
    id: 'fallback_agent',
    tile_key: 'agent_sam',
    title: 'Agent Sam',
    cta_label: 'Chat',
    path: '/dashboard/agent',
    image_url: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/b5557284-485e-4305-2c5a-49c6acf99a00/public',
    sort_order: 10,
    is_enabled: true,
  },
  {
    id: 'fallback_studio',
    tile_key: 'design_studio',
    title: 'Design Studio',
    cta_label: 'Build',
    path: '/dashboard/designstudio',
    image_url: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/b5557284-485e-4305-2c5a-49c6acf99a00/public',
    sort_order: 20,
    is_enabled: true,
  },
  {
    id: 'fallback_database',
    tile_key: 'database',
    title: 'Database',
    cta_label: 'Inspect',
    path: '/dashboard/database',
    image_url: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/c2eec95d-98c4-48ed-0394-45ae2f632300/public',
    sort_order: 30,
    is_enabled: true,
  },
  {
    id: 'fallback_cms',
    tile_key: 'cms_suite',
    title: 'CMS Suite',
    cta_label: 'Edit',
    path: '/dashboard/cms',
    image_url: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/b1d0bd36-0f88-4301-4e68-7e8d5e255b00/public',
    sort_order: 40,
    is_enabled: true,
  },
];

const FEATURED_ACTIONS: HomeAction[] = [
  {
    id: 'resume-agent',
    title: 'Resume latest build session',
    body: 'Continue the most recent repo, design, or deployment task.',
    label: 'Open',
    path: '/dashboard/agent',
    tone: 'blue',
    icon: 'agent',
  },
  {
    id: 'new-surface',
    title: 'Create a new visual surface',
    body: 'Start Design Studio with brand, UI, image, or model direction.',
    label: 'Build',
    path: '/dashboard/designstudio',
    tone: 'dark',
    icon: 'cube',
  },
  {
    id: 'files',
    title: 'Find files and artifacts',
    body: 'Open Drive, R2, generated files, previews, and uploads.',
    label: 'View',
    path: '/dashboard/artifacts',
    tone: 'purple',
    icon: 'folder',
  },
];

function HomeIcon({ id, size = 20 }: { id: HomeIconId; size?: number }) {
  const Icon = HOME_ICONS[id];
  return <Icon size={size} strokeWidth={1.75} aria-hidden />;
}

function cfImageVariants(url: string | null | undefined) {
  const raw = (url || '').trim();
  if (!raw) return { src: '', srcSet: undefined as string | undefined };
  if (!raw.includes('imagedelivery.net')) return { src: raw, srcSet: undefined };
  const publicUrl = raw.replace(/\/(small|thumbnail|avatar|hero)$/, '/public');
  const smallUrl = publicUrl.replace(/\/public$/, '/small');
  return { src: publicUrl, srcSet: `${smallUrl} 1x, ${publicUrl} 2x` };
}

function projectHref(project: OverviewProject) {
  return `/dashboard/artifacts?view=projects&project=${encodeURIComponent(project.id)}`;
}

function projectUpdatedLabel(project: OverviewProject) {
  if (project.lastDeploy && project.lastDeploy !== '—') return `Updated ${project.lastDeploy}`;
  if (project.dueDate && project.dueDate !== '—') return `Due ${project.dueDate}`;
  return 'Recently active';
}

function openAgentComposer() {
  window.dispatchEvent(
    new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
      detail: { message: '', send: false, ensureAgentPanel: true },
    }),
  );
}

export function DashboardHome() {
  const navigate = useNavigate();
  const { workspaceId } = useWorkspace();
  const [quickTiles, setQuickTiles] = useState<DashboardHomeTile[]>(FALLBACK_QUICK_TILES);
  const [recentProjects, setRecentProjects] = useState<OverviewProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [editTiles, setEditTiles] = useState<DashboardHomeTile[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [connectedSlugs, setConnectedSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/settings/integrations/connected', { credentials: 'same-origin' });
        const data = (await res.json().catch(() => ({}))) as { connected_slugs?: string[] };
        if (cancelled || !res.ok) return;
        setConnectedSlugs(new Set((data.connected_slugs || []).map((s) => s.toLowerCase())));
      } catch {
        /* non-fatal on home */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchDashboardHomeTiles(workspaceId);
      if (cancelled) return;
      if (res.ok && res.tiles?.length) setQuickTiles(res.tiles);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    setProjectsLoading(true);
    void (async () => {
      const data = await fetchProjectsOverview(workspaceId);
      if (cancelled) return;
      const rows = data.ok ? data.projects || [] : [];
      const sorted = [...rows].sort((a, b) => {
        const pa = Number(a.priority_num) || 0;
        const pb = Number(b.priority_num) || 0;
        if (pb !== pa) return pb - pa;
        return a.name.localeCompare(b.name);
      });
      setRecentProjects(sorted.slice(0, 4));
      setProjectsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const openCustomize = useCallback(() => {
    setEditTiles(quickTiles.map((t) => ({ ...t })));
    setSaveError(null);
    setCustomizeOpen(true);
  }, [quickTiles]);

  const saveCustomize = useCallback(async () => {
    if (!workspaceId?.trim()) return;
    setSaveBusy(true);
    setSaveError(null);
    const res = await saveDashboardHomeTiles(workspaceId, editTiles);
    setSaveBusy(false);
    if (!res.ok) {
      setSaveError(res.error || 'Save failed');
      return;
    }
    if (res.tiles?.length) setQuickTiles(res.tiles);
    setCustomizeOpen(false);
  }, [workspaceId, editTiles]);

  const quickGrid = useMemo(
    () => quickTiles.filter((t) => t.is_enabled).sort((a, b) => a.sort_order - b.sort_order),
    [quickTiles],
  );

  const openConnectCard = useCallback(
    (card: ConnectCard) => {
      const slug = card.connectSlug.toLowerCase();
      if (connectedSlugs.has(slug) || connectedSlugs.has(`${slug}_oauth`)) {
        navigate('/dashboard/settings/integrations');
        return;
      }
      window.location.href = `/api/integrations/${encodeURIComponent(slug)}/connect`;
    },
    [connectedSlugs, navigate],
  );

  return (
    <main className="iam-home" aria-label="Dashboard home">
      <section className="iam-home-shell">
        <section className="iam-home-hero" aria-labelledby="home-title">
          <p className="iam-home-eyebrow">Ready when you are.</p>
          <h1 id="home-title">
            What are we building, <span>Sam?</span>
          </h1>
          <p>
            Pick a workflow below, or open Agent Sam from the panel to start with full context.
          </p>
          <button type="button" className="iam-hero-agent-cta" onClick={openAgentComposer}>
            <Sparkles size={16} strokeWidth={1.75} aria-hidden />
            Ask Agent Sam
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </section>

        <section className="iam-home-lane" aria-label="Suggested actions">
          {FEATURED_ACTIONS.map((action, index) => (
            <button
              key={action.id}
              type="button"
              className={`iam-feature-card iam-feature-card--${action.tone} ${index === 0 ? 'is-featured' : ''}`}
              onClick={() => navigate(action.path)}
            >
              <span className="iam-feature-glyph" aria-hidden>
                <HomeIcon id={action.icon} size={22} />
              </span>
              <span className="iam-feature-copy">
                <strong>{action.title}</strong>
                <small>{action.body}</small>
              </span>
              <span className="iam-feature-cta">{action.label}</span>
            </button>
          ))}
        </section>

        <section className="iam-home-section" aria-labelledby="quick-starts-title">
          <div className="iam-section-head">
            <div>
              <h2 id="quick-starts-title">Quick starts</h2>
              <p>Full-card app tiles — workspace customizable.</p>
            </div>
            <div className="iam-section-actions">
              <button type="button" className="iam-section-icon-btn" onClick={openCustomize} title="Customize tiles">
                <Pencil size={14} strokeWidth={1.75} aria-hidden />
                <span>Customize</span>
              </button>
              <button type="button" onClick={() => navigate('/dashboard/agent')}>See all</button>
            </div>
          </div>
          <div className="iam-quick-image-grid">
            {quickGrid.map((tile) => {
              const img = cfImageVariants(tile.image_url);
              return (
                <article key={tile.id || tile.tile_key} className="iam-quick-image-card">
                  <button
                    type="button"
                    className="iam-quick-image-hit"
                    onClick={() => navigate(tile.path)}
                    aria-label={`${tile.title} — ${tile.cta_label}`}
                  >
                    {img.src ? (
                      <img
                        className="iam-quick-image-art"
                        src={img.src}
                        srcSet={img.srcSet}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="iam-quick-image-fallback" aria-hidden />
                    )}
                    <span className="iam-quick-image-cta">{tile.cta_label}</span>
                  </button>
                  <p className="iam-quick-image-label">{tile.title}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="iam-home-section" aria-labelledby="connect-context-title">
          <div className="iam-section-head">
            <div>
              <h2 id="connect-context-title">Connect context</h2>
              <p>Make future chats smarter.</p>
            </div>
            <button type="button" onClick={() => navigate('/dashboard/settings/integrations')}>See all</button>
          </div>
          <div className="iam-connect-icon-grid">
            {CONNECT_CARDS.map((item) => {
              const slug = item.connectSlug.toLowerCase();
              const connected =
                connectedSlugs.has(slug) ||
                connectedSlugs.has(`${slug}_oauth`) ||
                (slug === 'cloudflare' && connectedSlugs.has('cloudflare_oauth'));
              return (
                <article key={item.id} className="iam-connect-icon-card">
                  <button
                    type="button"
                    className="iam-connect-icon-hit"
                    onClick={() => openConnectCard(item)}
                    aria-label={`${item.title}${connected ? ' — connected' : ''}`}
                  >
                    {connected ? <span className="iam-connect-icon-dot" aria-hidden /> : null}
                    <img
                      className="iam-connect-icon-art"
                      src={`${INTEGRATION_ASSET_BASE}assets/integrations/${encodeURIComponent(item.iconSlug)}.svg`}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                  <p className="iam-connect-icon-label">{item.title}</p>
                  <p className="iam-connect-icon-sub">{connected ? 'Connected' : 'Connect'}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="iam-home-section" aria-labelledby="recent-title">
          <div className="iam-section-head">
            <div>
              <h2 id="recent-title">Recent projects</h2>
              <p>Your workspace — not shared across tenants.</p>
            </div>
            <button type="button" onClick={() => navigate('/dashboard/artifacts?view=projects')}>View all</button>
          </div>
          <div className="iam-project-lane">
            {projectsLoading ? (
              <div className="iam-project-loading">Loading projects…</div>
            ) : recentProjects.length === 0 ? (
              <div className="iam-project-loading">No projects yet — create one to see it here.</div>
            ) : (
              recentProjects.map((project) => {
                const cover = cfImageVariants(project.cover_image_url);
                return (
                  <button
                    key={project.id}
                    type="button"
                    className="iam-project-card iam-project-card--dynamic"
                    onClick={() => navigate(projectHref(project))}
                  >
                    <span className="iam-project-cover">
                      {cover.src ? (
                        <img src={cover.src} srcSet={cover.srcSet} alt="" loading="lazy" decoding="async" />
                      ) : null}
                    </span>
                    <strong>{project.name}</strong>
                    <small>{projectUpdatedLabel(project)}</small>
                  </button>
                );
              })
            )}
            <button type="button" className="iam-project-card iam-project-card--new" onClick={() => navigate('/dashboard/projects')}>
              <span><Plus size={22} strokeWidth={1.75} aria-hidden /></span>
              <strong>New project</strong>
              <small>Create a fresh workspace</small>
            </button>
          </div>
        </section>
      </section>

      {customizeOpen ? (
        <div className="iam-home-customize-scrim" role="presentation" onClick={() => setCustomizeOpen(false)}>
          <div
            className="iam-home-customize-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customize-home-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="iam-home-customize-head">
              <h2 id="customize-home-title">Customize quick starts</h2>
              <button type="button" className="iam-section-icon-btn" onClick={() => setCustomizeOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </header>
            <p className="iam-home-customize-note">Image URLs are stored per workspace. Use Cloudflare Images / imagedelivery links.</p>
            <div className="iam-home-customize-list">
              {editTiles.map((tile, idx) => (
                <div key={tile.tile_key} className="iam-home-customize-row">
                  <label>
                    <span>{tile.title}</span>
                    <input
                      type="url"
                      value={tile.image_url || ''}
                      placeholder="https://imagedelivery.net/…/public"
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditTiles((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, image_url: v } : row)),
                        );
                      }}
                    />
                  </label>
                  <label>
                    <span>Link path</span>
                    <input
                      type="text"
                      value={tile.path}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditTiles((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, path: v } : row)),
                        );
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>
            {saveError ? <p className="iam-home-customize-error">{saveError}</p> : null}
            <footer className="iam-home-customize-foot">
              <button type="button" onClick={() => setCustomizeOpen(false)}>Cancel</button>
              <button type="button" className="iam-home-customize-save" disabled={saveBusy} onClick={() => void saveCustomize()}>
                {saveBusy ? 'Saving…' : 'Save workspace tiles'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default DashboardHome;
