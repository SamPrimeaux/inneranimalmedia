import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Share2,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteProject,
  fetchProjectsList,
  setProjectPinned,
  updateProject,
  type OverviewProject,
} from '../../api/projects';
import { ProjectShareModal } from '../../components/projects/ProjectShareModal';
import { AppIcon } from '../../components/ui/AppIcon';
import { cfImageVariants, projectAccentHue, projectInitials } from '../../src/lib/projectBranding';
import { useWorkspace } from '../../src/context/WorkspaceContext';

// ─── types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  description?: string;
  status?: string;
  status_raw?: string;
  priority?: string;
  priority_num?: number;
  project_type?: string;
  health?: number;
  progress?: number;
  activeTasks?: number;
  totalTasks?: number;
  chat_project_id?: string | null;
  cover_image_url?: string | null;
  dueDate?: string;
  workspace_id?: string | null;
  owner_user_id?: string | null;
  updated_at?: string | null;
  is_pinned?: boolean;
}

function fromOverviewRow(p: OverviewProject & { owner_user_id?: string | null; updated_at?: string | null }): Project {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status_raw || p.status,
    status_raw: p.status_raw,
    priority: p.priority,
    priority_num: p.priority_num,
    project_type: p.project_type,
    health: p.health,
    progress: p.progress,
    activeTasks: p.activeTasks,
    totalTasks: p.totalTasks,
    chat_project_id: p.chat_project_id,
    cover_image_url: p.cover_image_url,
    dueDate: p.dueDate,
    workspace_id: p.workspace_id,
    owner_user_id: p.owner_user_id ?? null,
    updated_at: p.updated_at ?? null,
    is_pinned: p.is_pinned === true,
  };
}

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  production: '#4ade80',
  active:     '#4ade80',
  development:'#22d3ee',
  design:     '#22d3ee',
  staging:    '#fbbf24',
  review:     '#fbbf24',
  discovery:  '#94a3b8',
  planning:   '#94a3b8',
  blocked:    '#f87171',
  archived:   '#475569',
  complete:   '#475569',
};

const STATUS_LABELS: Record<string, string> = {
  production: 'Production',
  active:     'Active',
  development:'In Development',
  design:     'Design',
  staging:    'Staging',
  review:     'Review',
  discovery:  'Discovery',
  planning:   'Planning',
  blocked:    'Blocked',
  archived:   'Archived',
  complete:   'Complete',
};

type TabFilter = 'recent' | 'shared' | 'starred' | 'completed';

const TABS: { key: TabFilter; label: string }[] = [
  { key: 'recent',    label: 'Recent' },
  { key: 'shared',    label: 'Shared' },
  { key: 'starred',   label: 'Starred' },
  { key: 'completed', label: 'Completed' },
];

function isCompletedStatus(p: Project): boolean {
  const s = String(p.status_raw || p.status || '').toLowerCase();
  return s === 'complete' || s === 'archived';
}

function parseUpdatedTs(raw?: string | null): number {
  if (!raw) return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  const ms = Date.parse(String(raw));
  return Number.isNaN(ms) ? 0 : ms;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// ─── skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="pj-card pj-card--visual pj-card--skeleton" aria-hidden="true">
      <div className="pj-card-media pj-card-media--skel" />
    </div>
  );
}

// ─── card menu ───────────────────────────────────────────────────────────────

function CardMenu({
  project,
  isOpen,
  onToggle,
  onClose,
  onStar,
  onRename,
  onShare,
  onDelete,
}: {
  project: Project;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onStar: () => void;
  onRename: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  return (
    <div className="pj-menu" ref={ref}>
      <button
        type="button"
        className="pj-menu-btn"
        aria-label={`Options for ${project.name}`}
        aria-expanded={isOpen}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
      >
        <MoreHorizontal size={15} />
      </button>
      {isOpen && (
        <div className="pj-menu-drop" role="menu">
          <button type="button" role="menuitem" className="pj-menu-item" onClick={(e) => { e.stopPropagation(); onStar(); }}>
            <Star size={13} fill={project.is_pinned ? 'currentColor' : 'none'} />
            {project.is_pinned ? 'Unstar' : 'Star'}
          </button>
          <button type="button" role="menuitem" className="pj-menu-item" onClick={(e) => { e.stopPropagation(); onRename(); }}>
            <Pencil size={13} /> Rename
          </button>
          <button type="button" role="menuitem" className="pj-menu-item" onClick={(e) => { e.stopPropagation(); onShare(); }}>
            <Share2 size={13} /> Share / Invite
          </button>
          <div className="pj-menu-divider" />
          <button type="button" role="menuitem" className="pj-menu-item pj-menu-item--danger" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── project app icon tile (floating icon — not a cover card) ─────────────────

function ProjectAppIconTile({
  project,
  menuOpen,
  onOpen,
  onMenuToggle,
  onMenuClose,
  onStar,
  onRename,
  onShare,
  onDelete,
}: {
  project: Project;
  menuOpen: boolean;
  onOpen: () => void;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  onStar: () => void;
  onRename: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const cover = cfImageVariants(project.cover_image_url);
  const accentHue = projectAccentHue(project.id);
  const fallbackBg = `hsl(${accentHue} 52% 42%)`;
  const subtitle =
    STATUS_LABELS[project.status ?? ''] ??
    project.project_type ??
    'project';

  return (
    <div
      className={`pj-app-icon-cell${project.status === 'archived' ? ' pj-app-icon-cell--archived' : ''}`}
    >
      <AppIcon
        title={project.name}
        subtitle={subtitle}
        imageUrl={cover.src}
        backgroundColor={fallbackBg}
        presentation="app"
        size="lg"
        onPress={onOpen}
      />
      {project.is_pinned ? (
        <span className="pj-app-icon-pin" aria-label="Starred">
          <Star size={10} fill="currentColor" />
        </span>
      ) : null}
      <CardMenu
        project={project}
        isOpen={menuOpen}
        onToggle={onMenuToggle}
        onClose={onMenuClose}
        onStar={onStar}
        onRename={onRename}
        onShare={onShare}
        onDelete={onDelete}
      />
    </div>
  );
}

// Legacy visual card — kept for reference; grid uses ProjectAppIconTile.
function ProjectCard({
  project,
  menuOpen,
  onOpen,
  onMenuToggle,
  onMenuClose,
  onStar,
  onRename,
  onShare,
  onDelete,
}: {
  project: Project;
  menuOpen: boolean;
  onOpen: () => void;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  onStar: () => void;
  onRename: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const statusColor = STATUS_COLORS[project.status ?? ''] ?? '#94a3b8';
  const pct = Math.min(100, Math.max(0, project.progress ?? 0));
  const cover = cfImageVariants(project.cover_image_url);
  const accentHue = projectAccentHue(project.id);
  const initials = projectInitials(project.name);

  return (
    <div
      className={`pj-card pj-card--visual${project.status === 'archived' ? ' pj-card--archived' : ''}${project.is_pinned ? ' pj-card--pinned' : ''}`}
    >
      <div
        className="pj-card-media"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }}}
        aria-label={`Open ${project.name}`}
        style={!cover.src ? { background: `linear-gradient(145deg, hsl(${accentHue} 42% 22%), hsl(${accentHue} 28% 12%))` } : undefined}
      >
        {cover.src ? (
          <img
            src={cover.src}
            srcSet={cover.srcSet}
            alt=""
            className="pj-card-media-img"
            draggable={false}
            loading="lazy"
          />
        ) : (
          <div className="pj-card-media-fallback" aria-hidden>
            <span className="pj-card-media-initials">{initials}</span>
          </div>
        )}

        <div className="pj-card-scrim" aria-hidden />

        <div className="pj-card-overlay">
          <div className="pj-card-overlay-top">
            <span className="pj-card-status-pill" style={{ borderColor: statusColor, color: statusColor }}>
              {STATUS_LABELS[project.status ?? ''] ?? project.status_raw ?? 'Project'}
            </span>
            {project.is_pinned ? (
              <span className="pj-card-star-badge" aria-label="Starred">
                <Star size={11} fill="currentColor" />
              </span>
            ) : null}
          </div>

          <div className="pj-card-overlay-body">
            <div className="pj-card-name">{project.name}</div>
            <div className="pj-card-type">{project.project_type || 'project'}</div>
            <div className="pj-card-progress-wrap">
              <div className="pj-card-progress-track">
                <div
                  className="pj-card-progress-fill"
                  style={{ width: pct > 0 ? `${pct}%` : '0%' }}
                />
              </div>
              <span className="pj-card-progress-pct">{pct}%</span>
            </div>
          </div>
        </div>

        <CardMenu
          project={project}
          isOpen={menuOpen}
          onToggle={onMenuToggle}
          onClose={onMenuClose}
          onStar={onStar}
          onRename={onRename}
          onShare={onShare}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const { sessionUserId } = useWorkspace();
  const [activeTab, setActiveTab] = useState<TabFilter>('recent');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newBusy, setNewBusy] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [shareTarget, setShareTarget] = useState<Project | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchProjectsList({
        scope: 'tenant',
        includeArchived: true,
      });
      if (!res.ok) { setProjects([]); return; }
      setProjects(res.projects.map(fromOverviewRow));
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...projects];

    if (activeTab === 'starred') {
      list = list.filter((p) => p.is_pinned);
    } else if (activeTab === 'completed') {
      list = list.filter((p) => isCompletedStatus(p));
    } else if (activeTab === 'shared') {
      list = list.filter((p) => {
        const owner = p.owner_user_id ? String(p.owner_user_id).trim() : '';
        return owner && sessionUserId && owner !== sessionUserId;
      });
    } else {
      list = list.filter((p) => !isCompletedStatus(p));
    }

    if (q) {
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.project_type ?? '').toLowerCase().includes(q) ||
        (p.workspace_id ?? '').toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => {
      if (activeTab === 'recent') {
        const tb = parseUpdatedTs(b.updated_at);
        const ta = parseUpdatedTs(a.updated_at);
        if (tb !== ta) return tb - ta;
      }
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return (b.priority_num ?? 0) - (a.priority_num ?? 0);
    });

    return list;
  }, [projects, query, activeTab, sessionUserId]);

  const createProject = async () => {
    const name = newName.trim();
    if (!name || newBusy) return;
    setNewBusy(true);
    try {
      const r = await fetch('/api/projects', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: newDesc.trim() || null }),
      });
      if (r.ok) { setCreating(false); setNewName(''); setNewDesc(''); await load(); }
    } finally { setNewBusy(false); }
  };

  const handleStar = async (p: Project) => {
    setMenuOpenId(null);
    const next = !p.is_pinned;
    setProjects((prev) => prev.map((row) => (row.id === p.id ? { ...row, is_pinned: next } : row)));
    const res = await setProjectPinned(p.id, next);
    if (!res.ok) { setToast(res.error || 'Failed to update star'); await load(); }
  };

  const openRename = (p: Project) => { setMenuOpenId(null); setRenameTarget(p); setRenameValue(p.name); };

  const submitRename = async () => {
    if (!renameTarget || renameBusy) return;
    const name = renameValue.trim();
    if (!name) return;
    setRenameBusy(true);
    try {
      const res = await updateProject(renameTarget.id, { name });
      if (res.ok) { setRenameTarget(null); setRenameValue(''); await load(); setToast('Project renamed'); }
      else setToast(res.error || 'Rename failed');
    } finally { setRenameBusy(false); }
  };

  const openShare  = (p: Project) => { setMenuOpenId(null); setShareTarget(p); };
  const openDelete = (p: Project) => { setMenuOpenId(null); setDeleteTarget(p); };

  const submitDelete = async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await deleteProject(deleteTarget.id);
      if (res.ok) { setDeleteTarget(null); await load(); setToast('Project deleted'); }
      else setToast(res.error || 'Delete failed');
    } finally { setDeleteBusy(false); }
  };

  return (
    <div className="pj-root">
      <style>{PROJECTS_CSS}</style>

      <header className="pj-header">
        <div className="pj-header-top">
          <h1 className="pj-title">Projects</h1>
          <div className="pj-header-actions">
            <button
              type="button"
              className="pj-search-btn"
              aria-label="Search projects"
              onClick={() => {
                const wrap = searchRef.current?.parentElement;
                if (wrap) wrap.classList.add('pj-search-wrap--visible');
                searchRef.current?.focus();
              }}
            >
              <Search size={16} />
            </button>
            <button type="button" className="pj-new-btn" onClick={() => setCreating(true)}>
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="pj-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              className={`pj-tab${activeTab === t.key ? ' pj-tab--active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={`pj-search-wrap${query ? ' pj-search-wrap--visible' : ''}`}>
          <Search size={14} className="pj-search-icon" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects..."
            className="pj-search-input"
            onFocus={(e) => e.currentTarget.parentElement?.classList.add('pj-search-wrap--visible')}
            onBlur={(e) => {
              if (!query) e.currentTarget.parentElement?.classList.remove('pj-search-wrap--visible');
            }}
          />
          {query && (
            <button type="button" className="pj-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>
      </header>

      {creating && (
        <div className="pj-create-bar">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            className="pj-create-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createProject();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); setNewDesc(''); }
            }}
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="pj-create-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createProject();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); setNewDesc(''); }
            }}
          />
          <div className="pj-create-actions">
            <button
              type="button"
              className="pj-btn pj-btn--primary"
              disabled={!newName.trim() || newBusy}
              onClick={() => void createProject()}
            >
              {newBusy ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              className="pj-btn"
              onClick={() => { setCreating(false); setNewName(''); setNewDesc(''); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="pj-body">
        {loading ? (
          <div className="pj-grid">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : !filtered.length ? (
          <div className="pj-empty">
            <FolderOpen size={32} className="pj-empty-icon" />
            <p className="pj-empty-text">
              {query
                ? 'No projects match your search.'
                : activeTab === 'starred'
                  ? 'Star a project to see it here.'
                  : activeTab === 'completed'
                    ? 'No completed projects yet.'
                    : activeTab === 'shared'
                      ? 'No shared projects yet.'
                      : 'No projects yet.'}
            </p>
            {!query && activeTab === 'recent' && (
              <button type="button" className="pj-btn pj-btn--primary" onClick={() => setCreating(true)}>
                <Plus size={14} /> New project
              </button>
            )}
          </div>
        ) : (
          <div className="pj-app-icon-grid iam-app-icon-grid">
            {filtered.map((p) => (
              <ProjectAppIconTile
                key={p.id}
                project={p}
                menuOpen={menuOpenId === p.id}
                onOpen={() => navigate(`/dashboard/projects/${encodeURIComponent(p.id)}`)}
                onMenuToggle={() => setMenuOpenId((cur) => (cur === p.id ? null : p.id))}
                onMenuClose={() => setMenuOpenId(null)}
                onStar={() => void handleStar(p)}
                onRename={() => openRename(p)}
                onShare={() => openShare(p)}
                onDelete={() => openDelete(p)}
              />
            ))}
          </div>
        )}
      </div>

      {renameTarget && (
        <div className="pj-modal-backdrop" role="presentation" onClick={() => !renameBusy && setRenameTarget(null)}>
          <div className="pj-modal" role="dialog" aria-labelledby="pj-rename-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="pj-rename-title" className="pj-modal-title">Rename project</h2>
            <input
              autoFocus
              type="text"
              className="pj-create-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submitRename(); if (e.key === 'Escape') setRenameTarget(null); }}
            />
            <div className="pj-create-actions">
              <button type="button" className="pj-btn pj-btn--primary" disabled={!renameValue.trim() || renameBusy} onClick={() => void submitRename()}>
                {renameBusy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="pj-btn" disabled={renameBusy} onClick={() => setRenameTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="pj-modal-backdrop" role="presentation" onClick={() => !deleteBusy && setDeleteTarget(null)}>
          <div className="pj-modal" role="dialog" aria-labelledby="pj-delete-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="pj-delete-title" className="pj-modal-title">Delete "{deleteTarget.name}"?</h2>
            <p className="pj-modal-hint">This permanently removes the project and all associated data. This cannot be undone.</p>
            <div className="pj-create-actions">
              <button type="button" className="pj-btn pj-btn--danger" disabled={deleteBusy} onClick={() => void submitDelete()}>
                {deleteBusy ? 'Deleting…' : 'Delete project'}
              </button>
              <button type="button" className="pj-btn" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <ProjectShareModal
        project={shareTarget ? { id: shareTarget.id, name: shareTarget.name } : null}
        onClose={() => setShareTarget(null)}
        onToast={setToast}
      />

      {toast && <div className="pj-toast" role="status">{toast}</div>}
    </div>
  );
}

// ─── scoped CSS ───────────────────────────────────────────────────────────────

const PROJECTS_CSS = `
.pj-root {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  background: var(--dashboard-canvas);
  color: var(--color-main, #e2e8f0);
  overflow-y: auto;
}

.pj-header {
  flex-shrink: 0;
  padding: 28px 16px 0;
  max-width: 980px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.pj-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.pj-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
  line-height: 1;
}

.pj-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pj-search-btn,
.pj-new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--dashboard-border);
  background: transparent;
  color: var(--color-main, #e2e8f0);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.pj-search-btn:hover,
.pj-new-btn:hover {
  background: var(--bg-hover, rgba(255,255,255,0.08));
  border-color: rgba(255,255,255,0.18);
}

.pj-new-btn {
  background: var(--color-main, #e2e8f0);
  color: var(--dashboard-canvas, #0d1117);
  border-color: transparent;
}

.pj-new-btn:hover {
  background: #fff;
  color: #0d1117;
}

.pj-tabs {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  margin-bottom: 16px;
  padding-bottom: 2px;
}

.pj-tabs::-webkit-scrollbar { display: none; }

.pj-tab {
  flex-shrink: 0;
  padding: 7px 14px;
  border-radius: 20px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-muted, #94a3b8);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.pj-tab:hover {
  background: var(--bg-hover, rgba(255,255,255,0.06));
  color: var(--color-main, #e2e8f0);
}

.pj-tab--active {
  background: var(--bg-elevated, rgba(255,255,255,0.1));
  border-color: rgba(255,255,255,0.14);
  color: var(--color-main, #e2e8f0);
  font-weight: 600;
}

.pj-search-wrap {
  position: relative;
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-height 0.2s ease, opacity 0.15s ease, margin 0.2s ease;
  margin-bottom: 0;
}

.pj-search-wrap--visible {
  max-height: 48px;
  opacity: 1;
  margin-bottom: 12px;
}

.pj-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-muted, #94a3b8);
  pointer-events: none;
}

.pj-search-input {
  width: 100%;
  padding: 9px 36px 9px 34px;
  border-radius: 10px;
  border: 1px solid var(--dashboard-border);
  background: var(--dashboard-panel, rgba(255,255,255,0.04));
  color: inherit;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.pj-search-input:focus { border-color: rgba(255,255,255,0.25); }
.pj-search-input::placeholder { color: var(--color-muted, #94a3b8); }

.pj-search-clear {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: var(--bg-hover, rgba(255,255,255,0.1));
  color: var(--color-muted, #94a3b8);
  cursor: pointer;
}

.pj-create-bar {
  max-width: 980px;
  margin: 0 auto 16px;
  padding: 0 16px;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pj-create-input {
  padding: 9px 12px;
  border-radius: 9px;
  border: 1px solid var(--dashboard-border);
  background: var(--dashboard-panel, rgba(255,255,255,0.04));
  color: inherit;
  font-size: 14px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.pj-create-input:focus { border-color: rgba(255,255,255,0.3); }
.pj-create-input::placeholder { color: var(--color-muted, #94a3b8); }
.pj-create-actions { display: flex; gap: 8px; }

.pj-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
  background: transparent;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s;
  white-space: nowrap;
}

.pj-btn:hover:not(:disabled) { background: var(--bg-hover); }
.pj-btn:disabled { opacity: 0.4; cursor: default; }

.pj-btn--primary {
  background: var(--color-main, #e2e8f0);
  color: var(--dashboard-canvas, #0d1117);
  border-color: transparent;
  font-weight: 600;
}

.pj-btn--primary:hover:not(:disabled) { background: #fff; }

.pj-btn--danger {
  border-color: rgba(248,113,113,0.4);
  color: #f87171;
}

.pj-btn--danger:hover:not(:disabled) { background: rgba(248,113,113,0.12); }

.pj-body {
  flex: 1;
  padding: 0 16px 40px;
  max-width: 980px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.pj-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.pj-app-icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  gap: 20px 16px;
  max-width: 720px;
}

.pj-app-icon-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pj-app-icon-cell--archived {
  opacity: 0.55;
}

.pj-app-icon-cell .pj-menu {
  position: absolute;
  top: -4px;
  right: -2px;
  z-index: 2;
}

.pj-app-icon-pin {
  position: absolute;
  top: 2px;
  left: 50%;
  margin-left: 28px;
  color: var(--solar-cyan, #38bdf8);
  pointer-events: none;
}

@media (max-width: 540px) {
  .pj-grid { grid-template-columns: 1fr; gap: 12px; }
  .pj-header { padding: 16px 12px 0; }
  .pj-body { padding: 0 12px 32px; max-width: none; }
  .pj-title { font-size: 26px; }
  .pj-tabs { gap: 6px; margin-bottom: 12px; }
  .pj-tab { padding: 6px 12px; font-size: 13px; }

  /* List-row cards (mockup: thumb | meta | menu) */
  .pj-card--visual {
    aspect-ratio: auto;
    min-height: 0;
    border-radius: 14px;
  }

  .pj-card--visual:hover,
  .pj-card--visual:focus-within {
    transform: none;
    box-shadow: none;
  }

  .pj-card-media {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr) 36px;
    grid-template-rows: auto;
    gap: 0 12px;
    align-items: center;
    min-height: 0;
    height: auto;
    padding: 12px;
    background: var(--dashboard-panel, rgba(255,255,255,0.04));
  }

  .pj-card-media-img {
    position: relative;
    inset: auto;
    grid-column: 1;
    grid-row: 1 / span 2;
    width: 84px;
    height: 84px;
    border-radius: 12px;
    object-fit: cover;
    align-self: center;
  }

  .pj-card-media-fallback {
    position: relative;
    inset: auto;
    grid-column: 1;
    grid-row: 1 / span 2;
    width: 84px;
    height: 84px;
    border-radius: 12px;
    align-self: center;
  }

  .pj-card-media-initials { font-size: 1.35rem; }

  .pj-card--visual:hover .pj-card-media-img,
  .pj-card--visual:focus-within .pj-card-media-img {
    transform: none;
  }

  .pj-card-scrim { display: none; }

  .pj-card-overlay {
    position: relative;
    inset: auto;
    grid-column: 2;
    grid-row: 1 / span 2;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0;
    min-width: 0;
  }

  .pj-card-overlay-top {
    position: relative;
    top: auto;
    left: auto;
    right: auto;
    margin-bottom: 4px;
    opacity: 1;
    transform: none;
  }

  .pj-card-overlay-body {
    opacity: 1;
    transform: none;
  }

  .pj-card-status-pill {
    font-size: 9px;
    padding: 2px 7px;
    background: rgba(255,255,255,0.06);
  }

  .pj-card-star-badge { display: none; }

  .pj-card-name {
    font-size: 16px;
    font-weight: 650;
    color: inherit;
    text-shadow: none;
    -webkit-line-clamp: 2;
  }

  .pj-card-type {
    font-size: 13px;
    color: var(--color-muted, #94a3b8);
    margin: 2px 0 10px;
    text-transform: none;
  }

  .pj-card-progress-wrap { gap: 10px; }

  .pj-card-progress-track {
    height: 4px;
    background: rgba(148,163,184,0.22);
  }

  .pj-card-progress-fill {
    background: #fb7185;
  }

  .pj-card-progress-pct {
    font-size: 13px;
    color: var(--color-muted, #94a3b8);
    min-width: 36px;
  }

  .pj-card .pj-menu {
    position: relative;
    top: auto;
    right: auto;
    grid-column: 3;
    grid-row: 1;
    align-self: start;
    justify-self: end;
    pointer-events: auto;
  }

  .pj-menu-btn {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    border: 1px solid var(--dashboard-border);
    background: transparent;
    color: inherit;
    backdrop-filter: none;
  }

  .pj-menu-btn:hover,
  .pj-menu-btn[aria-expanded="true"] {
    background: var(--bg-hover);
  }

  .pj-card--skeleton .pj-card-media {
    display: block;
    min-height: 108px;
    padding: 0;
  }

  .pj-card--skeleton .pj-card-media--skel {
    min-height: 108px;
    width: 100%;
    border-radius: 14px;
  }
}

.pj-card {
  border-radius: 16px;
  border: 1px solid var(--dashboard-border);
  background: var(--dashboard-panel, rgba(255,255,255,0.03));
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.pj-card--visual {
  aspect-ratio: 4 / 5;
  min-height: 240px;
}

.pj-card--visual:hover,
.pj-card--visual:focus-within {
  border-color: rgba(255,255,255,0.18);
  box-shadow: 0 10px 32px rgba(0,0,0,0.35);
  transform: translateY(-2px);
}

.pj-card--archived { opacity: 0.65; }
.pj-card--pinned { border-color: rgba(251,191,36,0.35); }

.pj-card-media {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
  cursor: pointer;
  overflow: hidden;
  display: block;
}

.pj-card-media:focus-visible {
  outline: 2px solid rgba(255,255,255,0.45);
  outline-offset: -2px;
}

.pj-card-media--skel {
  min-height: 280px;
  background: linear-gradient(110deg, rgba(255,255,255,0.04) 8%, rgba(255,255,255,0.09) 18%, rgba(255,255,255,0.04) 33%);
  background-size: 200% 100%;
  animation: pj-shimmer 1.4s ease-in-out infinite;
}

.pj-card-media-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.45s ease;
}

.pj-card--visual:hover .pj-card-media-img,
.pj-card--visual:focus-within .pj-card-media-img {
  transform: scale(1.05);
}

.pj-card-media-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pj-card-media-initials {
  font-size: 2.4rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: rgba(255,255,255,0.82);
  text-shadow: 0 2px 24px rgba(0,0,0,0.35);
}

.pj-card-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0,0,0,0.08) 0%,
    rgba(0,0,0,0.02) 38%,
    rgba(0,0,0,0.55) 100%
  );
  pointer-events: none;
  transition: opacity 0.25s ease;
}

.pj-card-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 12px;
  pointer-events: none;
}

.pj-card-overlay-top {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.pj-card-overlay-body {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.pj-card--visual:hover .pj-card-overlay-top,
.pj-card--visual:focus-within .pj-card-overlay-top,
.pj-card--visual:hover .pj-card-overlay-body,
.pj-card--visual:focus-within .pj-card-overlay-body {
  opacity: 1;
  transform: translateY(0);
}

@media (hover: none) {
  .pj-card-overlay-top,
  .pj-card-overlay-body {
    opacity: 1;
    transform: none;
  }
  .pj-card-scrim {
    background: linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.72) 100%);
  }
}

.pj-card-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid currentColor;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(6px);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.pj-card-star-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  color: #fbbf24;
  backdrop-filter: blur(4px);
}

.pj-card .pj-menu {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 4;
  pointer-events: auto;
}

.pj-card-name {
  font-size: 15px;
  font-weight: 650;
  line-height: 1.25;
  color: #fff;
  text-shadow: 0 1px 12px rgba(0,0,0,0.45);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pj-card-type {
  font-size: 11px;
  color: rgba(255,255,255,0.78);
  letter-spacing: 0.02em;
  margin: 2px 0 8px;
  text-transform: capitalize;
}

.pj-card-progress-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pj-card-progress-track {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: rgba(255,255,255,0.18);
  overflow: hidden;
}

.pj-card-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: rgba(255,255,255,0.88);
  transition: width 0.4s ease;
}

.pj-card-progress-pct {
  font-size: 11px;
  color: rgba(255,255,255,0.85);
  font-variant-numeric: tabular-nums;
  min-width: 28px;
  text-align: right;
  flex-shrink: 0;
}

.pj-menu {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
}

.pj-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(0,0,0,0.55);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: background 0.12s;
}

.pj-menu-btn:hover,
.pj-menu-btn[aria-expanded="true"] {
  background: rgba(0,0,0,0.75);
}

.pj-menu-drop {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 162px;
  padding: 4px;
  border-radius: 11px;
  border: 1px solid var(--dashboard-border);
  background: var(--bg-elevated, #151b27);
  box-shadow: 0 16px 40px rgba(0,0,0,0.5);
  z-index: 20;
}

.pj-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}

.pj-menu-item:hover { background: var(--bg-hover); }
.pj-menu-item--danger { color: #f87171; }
.pj-menu-item--danger:hover { background: rgba(248,113,113,0.12); }

.pj-menu-divider {
  height: 1px;
  background: var(--dashboard-border);
  margin: 3px 6px;
}

.pj-card--skeleton { pointer-events: none; }

.pj-card-cover--skel {
  aspect-ratio: 16/9;
  background: linear-gradient(90deg, var(--dashboard-border) 25%, rgba(255,255,255,0.06) 50%, var(--dashboard-border) 75%);
  background-size: 200% 100%;
  animation: pj-shimmer 1.4s ease-in-out infinite;
}

@keyframes pj-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skel {
  border-radius: 4px;
  background: linear-gradient(90deg, var(--dashboard-border) 25%, rgba(255,255,255,0.06) 50%, var(--dashboard-border) 75%);
  background-size: 200% 100%;
  animation: pj-shimmer 1.4s ease-in-out infinite;
}

.skel-title { height: 14px; width: 55%; }
.skel-sub   { height: 11px; width: 35%; margin-bottom: 6px; }
.skel-bar   { height: 3px; width: 100%; border-radius: 2px; }
.skel-avatar { height: 24px; width: 24px; border-radius: 50%; }

.pj-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 72px 24px;
  text-align: center;
}

.pj-empty-icon { color: var(--color-muted, #94a3b8); opacity: 0.3; }
.pj-empty-text { font-size: 14px; color: var(--color-muted, #94a3b8); max-width: 240px; line-height: 1.5; }

.pj-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0,0,0,0.6);
}

.pj-modal {
  width: min(400px, 100%);
  padding: 22px;
  border-radius: 14px;
  border: 1px solid var(--dashboard-border);
  background: var(--bg-elevated, #151b27);
  box-shadow: 0 24px 56px rgba(0,0,0,0.5);
}

.pj-modal-title {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 600;
}

.pj-modal-hint {
  margin: 0 0 18px;
  font-size: 13px;
  color: var(--color-muted, #94a3b8);
  line-height: 1.55;
}

.pj-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1300;
  padding: 10px 18px;
  border-radius: 999px;
  border: 1px solid var(--dashboard-border);
  background: var(--bg-elevated, #151b27);
  font-size: 13px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  pointer-events: none;
  white-space: nowrap;
}

@media (min-width: 768px) {
  .pj-header { padding: 36px 24px 0; }
  .pj-body { padding: 0 24px 48px; }
  .pj-create-bar {
    padding: 0 24px;
    flex-direction: row;
    align-items: flex-start;
  }
  .pj-create-bar .pj-create-input { flex: 1; }
  .pj-create-bar .pj-create-actions { flex-shrink: 0; }
  .pj-title { font-size: 32px; }
}
`;
