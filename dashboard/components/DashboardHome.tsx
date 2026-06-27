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
  type LucideIcon,
} from 'lucide-react';
import { IAM_AGENT_CHAT_COMPOSE } from '../agentChatConstants';
import { fetchProjectsOverview, type OverviewProject } from '../api/projects';
import {
  fetchDashboardHomeTiles,
  saveDashboardHomeTiles,
  type DashboardHomeTile,
} from '../api/home';
import { AppIcon } from './ui/AppIcon';
import {
  HomeTileEditor,
  loadHomeLayoutDraft,
  saveHomeLayoutDraft,
} from './home/HomeTileEditor';
import { useWorkspace } from '../src/context/WorkspaceContext';
import './ui/AppIcon.css';
import './home/HomeTileEditor.css';
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
  const [quickTilesBaseline, setQuickTilesBaseline] = useState<DashboardHomeTile[]>(FALLBACK_QUICK_TILES);
  const [recentProjects, setRecentProjects] = useState<OverviewProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editingTileKey, setEditingTileKey] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [connectedSlugs, setConnectedSlugs] = useState<Set<string>>(new Set());
  const [integrationIssues, setIntegrationIssues] = useState<Map<string, 'warning' | 'error'>>(new Map());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/settings/integrations/connected', { credentials: 'same-origin' });
        const data = (await res.json().catch(() => ({}))) as {
          connected_slugs?: string[];
          items?: Array<{
            connection?: { provider_key?: string; status?: string };
            integration_status?: { error?: string };
          }>;
        };
        if (cancelled || !res.ok) return;
        setConnectedSlugs(new Set((data.connected_slugs || []).map((s) => s.toLowerCase())));
        const issues = new Map<string, 'warning' | 'error'>();
        for (const item of data.items || []) {
          const pk = String(item.connection?.provider_key || '').toLowerCase();
          const st = String(item.connection?.status || '').toLowerCase();
          if (st === 'auth_expired' || item.integration_status?.error === 'token_expired') {
            issues.set(pk, 'error');
          } else if (st === 'degraded' || item.integration_status?.error === 'tunnel_unreachable') {
            issues.set(pk, 'warning');
          }
        }
        setIntegrationIssues(issues);
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
      if (res.ok && res.tiles?.length) {
        setQuickTiles(res.tiles);
        setQuickTilesBaseline(res.tiles);
      } else if (workspaceId) {
        const draft = loadHomeLayoutDraft(workspaceId);
        if (draft?.length) setQuickTiles(draft);
      }
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

  const enterEditMode = useCallback(() => {
    setQuickTilesBaseline(quickTiles.map((t) => ({ ...t })));
    setSaveError(null);
    setEditMode(true);
  }, [quickTiles]);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    setEditingTileKey(null);
  }, []);

  const saveLayout = useCallback(async () => {
    if (!workspaceId?.trim()) {
      saveHomeLayoutDraft('local', quickTiles);
      exitEditMode();
      return;
    }
    setSaveBusy(true);
    setSaveError(null);
    saveHomeLayoutDraft(workspaceId, quickTiles);
    const res = await saveDashboardHomeTiles(workspaceId, quickTiles);
    setSaveBusy(false);
    if (!res.ok) {
      setSaveError(res.error || 'Save failed — kept local draft');
      return;
    }
    if (res.tiles?.length) {
      setQuickTiles(res.tiles);
      setQuickTilesBaseline(res.tiles);
    }
    exitEditMode();
  }, [workspaceId, quickTiles, exitEditMode]);

  const resetLayout = useCallback(() => {
    setQuickTiles(quickTilesBaseline.map((t) => ({ ...t })));
    setEditingTileKey(null);
  }, [quickTilesBaseline]);

  const updateTile = useCallback((tileKey: string, patch: Partial<DashboardHomeTile>) => {
    setQuickTiles((prev) =>
      prev.map((t) => (t.tile_key === tileKey ? { ...t, ...patch } : t)),
    );
  }, []);

  const editingTile = useMemo(
    () => quickTiles.find((t) => t.tile_key === editingTileKey) || null,
    [quickTiles, editingTileKey],
  );

  const quickGrid = useMemo(
    () => quickTiles.filter((t) => t.is_enabled).sort((a, b) => a.sort_order - b.sort_order),
    [quickTiles],
  );

  const openConnectCard = useCallback(
    (card: ConnectCard) => {
      const slug = card.connectSlug.toLowerCase();
      const registrySlug = slug === 'cloudflare' ? 'cloudflare_oauth' : `${slug}_oauth`;
      if (
        connectedSlugs.has(slug) ||
        connectedSlugs.has(registrySlug) ||
        (slug === 'github' && connectedSlugs.has('github'))
      ) {
        navigate('/dashboard/settings/integrations');
        return;
      }
      window.location.href = `/api/integrations/${encodeURIComponent(slug)}/connect`;
    },
    [connectedSlugs, navigate],
  );

  return (
    <main className={`iam-home ${editMode ? 'iam-home-edit-mode' : ''}`} aria-label="Dashboard home">
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

        <section className="iam-home-section iam-home-section--quick" aria-labelledby="quick-starts-title">
          <div className="iam-section-head">
            <div>
              <h2 id="quick-starts-title">Quick starts</h2>
              <p>iOS-style app icons — tap Customize to remaster.</p>
            </div>
            <div className="iam-section-actions">
              {!editMode ? (
                <button type="button" className="iam-section-icon-btn" onClick={enterEditMode} title="Customize tiles">
                  <Pencil size={14} strokeWidth={1.75} aria-hidden />
                  <span>Customize</span>
                </button>
              ) : null}
              <button type="button" onClick={() => navigate('/dashboard/agent')}>See all</button>
            </div>
          </div>
          {editMode ? (
            <div className="iam-home-edit-banner">
              <span>
                <strong>Edit mode</strong> — tap an icon to change artwork, title, and destination.
              </span>
              <div className="iam-home-edit-actions">
                <button type="button" onClick={resetLayout}>Reset</button>
                <button type="button" onClick={exitEditMode}>Cancel</button>
                <button type="button" className="primary" disabled={saveBusy} onClick={() => void saveLayout()}>
                  {saveBusy ? 'Saving…' : 'Save layout'}
                </button>
              </div>
            </div>
          ) : null}
          {saveError ? <p className="iam-home-customize-error">{saveError}</p> : null}
          <div className="iam-app-icon-grid">
            {quickGrid.map((tile) => (
              <AppIcon
                key={tile.id || tile.tile_key}
                title={tile.title}
                imageUrl={tile.image_url}
                size="lg"
                subtitle={tile.cta_label}
                editable={editMode}
                editActive={editMode && editingTileKey === tile.tile_key}
                onPress={() => {
                  if (editMode) {
                    setEditingTileKey(tile.tile_key);
                    return;
                  }
                  navigate(tile.path);
                }}
                onEdit={() => setEditingTileKey(tile.tile_key)}
              />
            ))}
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
          <div className="iam-app-icon-grid">
            {CONNECT_CARDS.map((item) => {
              const slug = item.connectSlug.toLowerCase();
              const registrySlug = slug === 'cloudflare' ? 'cloudflare_oauth' : `${slug}_oauth`;
              const connected =
                connectedSlugs.has(slug) ||
                connectedSlugs.has(registrySlug) ||
                (slug === 'github' && connectedSlugs.has('github'));
              const issue =
                integrationIssues.get(registrySlug) ||
                integrationIssues.get(slug) ||
                null;
              return (
                <AppIcon
                  key={item.id}
                  title={item.title}
                  iconSlug={item.iconSlug}
                  size="lg"
                  status={issue}
                  subtitle={issue ? (issue === 'error' ? 'Reconnect' : 'Issue') : connected ? 'Connected' : 'Connect'}
                  onPress={() => openConnectCard(item)}
                />
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

      {editingTile ? (
        <HomeTileEditor
          tile={editingTile}
          workspaceId={workspaceId}
          onChange={(next) => updateTile(editingTile.tile_key, next)}
          onClose={() => setEditingTileKey(null)}
          onReset={() => {
            const base = quickTilesBaseline.find((t) => t.tile_key === editingTile.tile_key);
            if (base) updateTile(editingTile.tile_key, { ...base });
          }}
        />
      ) : null}
    </main>
  );
}

export default DashboardHome;
