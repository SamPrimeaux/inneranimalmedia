import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Code2,
  FileText,
  FolderOpen,
  Globe,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  deleteProject,
  fetchProjectsList,
  setProjectPinned,
  updateProject,
  type OverviewProject,
} from '../../api/projects';

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
  is_pinned?: boolean;
}

function fromOverviewRow(p: OverviewProject): Project {
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
    completedTasks: p.completedTasks,
    chat_project_id: p.chat_project_id,
    cover_image_url: p.cover_image_url,
    dueDate: p.dueDate,
    workspace_id: p.workspace_id,
    is_pinned: p.is_pinned === true,
  };
}

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  production: 'var(--solar-green, #4ade80)',
  active:     'var(--solar-green, #4ade80)',
  development:'var(--solar-cyan, #22d3ee)',
  design:     'var(--solar-cyan, #22d3ee)',
  staging:    'var(--solar-yellow, #fbbf24)',
  review:     'var(--solar-yellow, #fbbf24)',
  discovery:  'var(--color-muted, #94a3b8)',
  planning:   'var(--color-muted, #94a3b8)',
  blocked:    '#f87171',
  archived:   'var(--color-muted, #94a3b8)',
  complete:   'var(--color-muted, #94a3b8)',
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

const TYPE_ICONS: Record<string, React.ReactNode> = {
  'saas-product':   <Zap size={13} />,
  'internal-tool':  <Layers size={13} />,
  'dashboard':      <SlidersHorizontal size={13} />,
  'landing-page':   <Globe size={13} />,
  'e-commerce':     <Globe size={13} />,
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function relativeDate(raw?: string): string {
  if (!raw) return '';
  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) return raw;
  const diff = Date.now() - ts;
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return mo === 1 ? '1 month ago' : `${mo} months ago`;
}

function priorityColor(p?: string): string {
  if (p === 'P0') return '#f87171';
  if (p === 'P1') return 'var(--solar-yellow, #fbbf24)';
  if (p === 'P2') return 'var(--solar-cyan, #22d3ee)';
  return 'var(--color-muted, #94a3b8)';
}

// ─── skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="proj-card proj-card--skeleton">
      <div className="proj-card-header">
        <div className="skel skel-title" />
        <div className="skel skel-badge" />
      </div>
      <div className="skel skel-desc" />
      <div className="skel skel-desc skel-desc--short" />
      <div className="proj-card-footer">
        <div className="skel skel-chip" />
        <div className="skel skel-time" />
      </div>
    </div>
  );
}

// ─── side panel ──────────────────────────────────────────────────────────────

function ProjectSidePanel({
  project,
  onClose,
  onChat,
  allProjects,
}: {
  project: Project;
  onClose: () => void;
  onChat: (p: Project) => void;
  allProjects: Project[];
}) {
  const statusColor = STATUS_COLORS[project.status ?? ''] ?? 'var(--color-muted)';
  const pct = Math.min(100, Math.max(0, project.progress ?? 0));

  return (
    <aside className="proj-panel" role="complementary" aria-label="Project details">
      <div className="proj-panel-header">
        <div className="proj-panel-title-row">
          <h2 className="proj-panel-title">{project.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="proj-panel-close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="proj-panel-meta">
          <span className="proj-panel-status" style={{ color: statusColor }}>
            <span className="proj-status-dot" style={{ background: statusColor }} />
            {STATUS_LABELS[project.status ?? ''] ?? project.status_raw ?? 'Unknown'}
          </span>
          {project.priority && (
            <span className="proj-panel-badge" style={{ color: priorityColor(project.priority) }}>
              {project.priority}
            </span>
          )}
        </div>
      </div>

      <div className="proj-panel-body">
        {/* description */}
        {project.description && (
          <section className="proj-panel-section">
            <p className="proj-panel-desc">{project.description}</p>
          </section>
        )}

        {/* progress */}
        {(project.totalTasks ?? 0) > 0 && (
          <section className="proj-panel-section">
            <div className="proj-panel-label">Progress</div>
            <div className="proj-progress-wrap">
              <div className="proj-progress-bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="proj-progress-text">
              {project.activeTasks ?? 0} open · {project.totalTasks ?? 0} total
            </div>
          </section>
        )}

        {/* quick actions */}
        <section className="proj-panel-section">
          <div className="proj-panel-label">Quick actions</div>
          <div className="proj-panel-actions">
            <button
              type="button"
              className="proj-action-btn"
              onClick={() => onChat(project)}
            >
              <MessageSquare size={14} />
              Open in Agent
            </button>
            <button type="button" className="proj-action-btn">
              <FileText size={14} />
              Instructions
            </button>
            <button type="button" className="proj-action-btn">
              <BookOpen size={14} />
              Memory
            </button>
            <button type="button" className="proj-action-btn">
              <FolderOpen size={14} />
              Files
            </button>
          </div>
        </section>

        {/* type / workspace */}
        <section className="proj-panel-section">
          <div className="proj-panel-kv">
            {project.project_type && (
              <div className="proj-panel-kv-row">
                <span className="proj-panel-kv-key">Type</span>
                <span className="proj-panel-kv-val">{project.project_type}</span>
              </div>
            )}
            {project.dueDate && project.dueDate !== '—' && (
              <div className="proj-panel-kv-row">
                <span className="proj-panel-kv-key">Due</span>
                <span className="proj-panel-kv-val">{project.dueDate}</span>
              </div>
            )}
            {project.health != null && (
              <div className="proj-panel-kv-row">
                <span className="proj-panel-kv-key">Health</span>
                <span
                  className="proj-panel-kv-val"
                  style={{
                    color:
                      project.health >= 70
                        ? 'var(--solar-green, #4ade80)'
                        : project.health >= 40
                          ? 'var(--solar-yellow, #fbbf24)'
                          : '#f87171',
                  }}
                >
                  {project.health}%
                </span>
              </div>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}

// ─── card menu ───────────────────────────────────────────────────────────────

function ProjectCardMenu({
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  return (
    <div className="proj-card-menu" ref={ref}>
      <button
        type="button"
        className="proj-card-menu-trigger"
        aria-label={`Settings for ${project.name}`}
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {isOpen && (
        <div className="proj-card-menu-dropdown" role="menu">
          <button type="button" className="proj-card-menu-item" role="menuitem" onClick={(e) => { e.stopPropagation(); onStar(); }}>
            <Star size={14} fill={project.is_pinned ? 'currentColor' : 'none'} />
            {project.is_pinned ? 'Unstar' : 'Star'}
          </button>
          <button type="button" className="proj-card-menu-item" role="menuitem" onClick={(e) => { e.stopPropagation(); onRename(); }}>
            <Pencil size={14} />
            Rename
          </button>
          <button type="button" className="proj-card-menu-item" role="menuitem" onClick={(e) => { e.stopPropagation(); onShare(); }}>
            <Share2 size={14} />
            Share
          </button>
          <button
            type="button"
            className="proj-card-menu-item proj-card-menu-item--danger"
            role="menuitem"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── project card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  isActive,
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
  isActive: boolean;
  menuOpen: boolean;
  onOpen: () => void;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  onStar: () => void;
  onRename: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const statusColor = STATUS_COLORS[project.status ?? ''] ?? 'var(--color-muted)';

  return (
    <div className={`proj-card-wrap${isActive ? ' proj-card-wrap--active' : ''}${project.status === 'archived' ? ' proj-card-wrap--archived' : ''}`}>
      <ProjectCardMenu
        project={project}
        isOpen={menuOpen}
        onToggle={onMenuToggle}
        onClose={onMenuClose}
        onStar={onStar}
        onRename={onRename}
        onShare={onShare}
        onDelete={onDelete}
      />
      <div
        className={`proj-card${isActive ? ' proj-card--active' : ''}${project.is_pinned ? ' proj-card--pinned' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={isActive}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        <div className="proj-card-header">
          <span className="proj-card-name">
            {project.is_pinned && (
              <Star size={12} className="proj-card-star" fill="currentColor" aria-hidden />
            )}
            {project.name}
          </span>
          <span className="proj-card-status" style={{ color: statusColor }}>
            <span className="proj-status-dot" style={{ background: statusColor }} />
            {STATUS_LABELS[project.status ?? ''] ?? project.status_raw ?? ''}
          </span>
        </div>
        <p className="proj-card-desc">{project.description || 'No description'}</p>
        <div className="proj-card-footer">
          <span className="proj-card-type">
            {TYPE_ICONS[project.project_type ?? ''] ?? <Code2 size={12} />}
            {project.project_type ?? 'project'}
          </span>
          {project.priority && (
            <span className="proj-card-priority" style={{ color: priorityColor(project.priority) }}>
              {project.priority}
            </span>
          )}
        </div>
        {project.workspace_id && (
          <span className="proj-card-workspace" title={project.workspace_id}>
            {project.workspace_id.replace(/^ws_/, '')}
          </span>
        )}
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newBusy, setNewBusy] = useState(false);
  const [sortBy, setSortBy] = useState<'priority' | 'updated' | 'name'>('priority');
  /** Default tenant-wide + archived so cleanup grid shows every row immediately. */
  const [workspaceOnly, setWorkspaceOnly] = useState(false);
  const [hideArchived, setHideArchived] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchProjectsList({
        scope: workspaceOnly ? 'workspace' : 'tenant',
        includeArchived: !hideArchived,
      });
      if (!res.ok) {
        setProjects([]);
        return;
      }
      setProjects(res.projects.map(fromOverviewRow));
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceOnly, hideArchived]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const activeProject = useMemo(
    () => (activeId ? projects.find((p) => p.id === activeId) ?? null : null),
    [activeId, projects],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.description ?? '').toLowerCase().includes(q) ||
            (p.project_type ?? '').toLowerCase().includes(q) ||
            (p.workspace_id ?? '').toLowerCase().includes(q),
        )
      : [...projects];

    list.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (sortBy === 'priority') return (b.priority_num ?? 0) - (a.priority_num ?? 0);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });

    return list;
  }, [projects, query, sortBy]);

  const openChat = (p: Project) => {
    const cid = p.chat_project_id || p.id;
    window.location.href = `/dashboard/chats?project=${encodeURIComponent(cid)}`;
  };

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
      if (r.ok) {
        setCreating(false);
        setNewName('');
        setNewDesc('');
        await load();
      }
    } finally {
      setNewBusy(false);
    }
  };

  const handleStar = async (p: Project) => {
    setMenuOpenId(null);
    const next = !p.is_pinned;
    setProjects((prev) => prev.map((row) => (row.id === p.id ? { ...row, is_pinned: next } : row)));
    const res = await setProjectPinned(p.id, next);
    if (!res.ok) {
      setToast(res.error || 'Failed to update star');
      await load();
    }
  };

  const openRename = (p: Project) => {
    setMenuOpenId(null);
    setRenameTarget(p);
    setRenameValue(p.name);
  };

  const submitRename = async () => {
    if (!renameTarget || renameBusy) return;
    const name = renameValue.trim();
    if (!name) return;
    setRenameBusy(true);
    try {
      const res = await updateProject(renameTarget.id, { name });
      if (res.ok) {
        setRenameTarget(null);
        setRenameValue('');
        await load();
        setToast('Project renamed');
      } else {
        setToast(res.error || 'Rename failed');
      }
    } finally {
      setRenameBusy(false);
    }
  };

  const handleShare = async (p: Project) => {
    setMenuOpenId(null);
    const url = `${window.location.origin}/dashboard/projects/${encodeURIComponent(p.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast('Link copied to clipboard');
    } catch {
      setToast(url);
    }
  };

  const openDelete = (p: Project) => {
    setMenuOpenId(null);
    setDeleteTarget(p);
  };

  const submitDelete = async (hard = false) => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await deleteProject(deleteTarget.id, { hard });
      if (res.ok) {
        setDeleteTarget(null);
        if (activeId === deleteTarget.id) setActiveId(null);
        await load();
        setToast(hard ? 'Project permanently deleted' : 'Project archived');
      } else {
        setToast(res.error || 'Delete failed');
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="proj-root">
      <style>{PROJECTS_CSS}</style>

      {/* ── main column ── */}
      <div className={`proj-main${activeProject ? ' proj-main--narrow' : ''}`}>
        {/* header */}
        <header className="proj-header">
          <div className="proj-header-top">
            <h1 className="proj-header-title">
              Projects
              {!loading && (
                <span className="proj-header-count">{filtered.length}</span>
              )}
            </h1>
            <div className="proj-header-actions">
              <button
                type="button"
                className={`proj-btn proj-filter-toggle${workspaceOnly ? ' proj-filter-toggle--on' : ''}`}
                onClick={() => setWorkspaceOnly((v) => !v)}
                title="Limit to active workspace only"
              >
                This workspace only
              </button>
              <button
                type="button"
                className={`proj-btn proj-filter-toggle${hideArchived ? ' proj-filter-toggle--on' : ''}`}
                onClick={() => setHideArchived((v) => !v)}
              >
                Hide archived
              </button>

              {/* sort */}
              <select
                className="proj-btn proj-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                aria-label="Sort projects"
              >
                <option value="priority">Sort by Priority</option>
                <option value="name">Sort by Name</option>
                <option value="updated">Sort by Updated</option>
              </select>

              <button
                type="button"
                className="proj-btn proj-btn--primary"
                onClick={() => setCreating(true)}
              >
                <Plus size={14} />
                New project
              </button>
            </div>
          </div>

          {/* search */}
          <div className="proj-search-wrap">
            <Search size={15} className="proj-search-icon" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects..."
              className="proj-search-input"
            />
          </div>
        </header>

        {/* new project inline form */}
        {creating && (
          <div className="proj-create-form">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name"
              className="proj-create-input"
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
              className="proj-create-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createProject();
                if (e.key === 'Escape') { setCreating(false); setNewName(''); setNewDesc(''); }
              }}
            />
            <div className="proj-create-actions">
              <button
                type="button"
                className="proj-btn proj-btn--primary"
                disabled={!newName.trim() || newBusy}
                onClick={() => void createProject()}
              >
                {newBusy ? 'Creating…' : 'Create project'}
              </button>
              <button
                type="button"
                className="proj-btn"
                onClick={() => { setCreating(false); setNewName(''); setNewDesc(''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* grid */}
        <div className="proj-body">
          {loading ? (
            <div className="proj-grid">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : !filtered.length ? (
            <div className="proj-empty">
              <FolderOpen size={36} className="proj-empty-icon" />
              <p className="proj-empty-text">
                {query ? 'No projects match your search.' : 'No projects yet. Create one to get started.'}
              </p>
            </div>
          ) : (
            <div className="proj-grid">
              {filtered.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  isActive={false}
                  menuOpen={menuOpenId === p.id}
                  onOpen={() => navigate(`/dashboard/projects/${encodeURIComponent(p.id)}`)}
                  onMenuToggle={() => setMenuOpenId((cur) => (cur === p.id ? null : p.id))}
                  onMenuClose={() => setMenuOpenId(null)}
                  onStar={() => void handleStar(p)}
                  onRename={() => openRename(p)}
                  onShare={() => void handleShare(p)}
                  onDelete={() => openDelete(p)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── side panel ── */}
      {activeProject && (
        <ProjectSidePanel
          project={activeProject}
          onClose={() => setActiveId(null)}
          onChat={openChat}
          allProjects={projects}
        />
      )}

      {renameTarget && (
        <div className="proj-modal-backdrop" role="presentation" onClick={() => !renameBusy && setRenameTarget(null)}>
          <div className="proj-modal" role="dialog" aria-labelledby="proj-rename-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="proj-rename-title" className="proj-modal-title">Rename project</h2>
            <input
              autoFocus
              type="text"
              className="proj-create-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRename();
                if (e.key === 'Escape') setRenameTarget(null);
              }}
            />
            <div className="proj-create-actions">
              <button type="button" className="proj-btn proj-btn--primary" disabled={!renameValue.trim() || renameBusy} onClick={() => void submitRename()}>
                {renameBusy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="proj-btn" disabled={renameBusy} onClick={() => setRenameTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="proj-modal-backdrop" role="presentation" onClick={() => !deleteBusy && setDeleteTarget(null)}>
          <div className="proj-modal" role="dialog" aria-labelledby="proj-delete-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="proj-delete-title" className="proj-modal-title">Delete project</h2>
            <p className="proj-modal-body">
              <strong>{deleteTarget.name}</strong>
              {deleteTarget.workspace_id && (
                <span className="proj-modal-meta"> · {deleteTarget.workspace_id}</span>
              )}
            </p>
            <p className="proj-modal-hint">
              Archive hides it from the grid. Permanent delete removes the D1 row and Supabase mirror.
            </p>
            <div className="proj-create-actions">
              <button type="button" className="proj-btn" disabled={deleteBusy} onClick={() => void submitDelete(false)}>
                {deleteBusy ? 'Working…' : 'Archive'}
              </button>
              <button type="button" className="proj-btn proj-btn--danger" disabled={deleteBusy} onClick={() => void submitDelete(true)}>
                Delete permanently
              </button>
              <button type="button" className="proj-btn" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="proj-toast" role="status">{toast}</div>}
    </div>
  );
}

// ─── scoped CSS ───────────────────────────────────────────────────────────────

const PROJECTS_CSS = `
/* root layout */
.proj-root {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  background: var(--dashboard-canvas);
  color: var(--color-main, #e2e8f0);
  overflow: hidden;
}

/* main column */
.proj-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
}
.proj-main--narrow {
  /* panel visible — body keeps scrolling */
}

/* centered column like chats */
.proj-header,
.proj-create-form,
.proj-body {
  max-width: 1180px;
  margin-left: auto;
  margin-right: auto;
  width: 100%;
}
.proj-header-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-muted, #94a3b8);
  border: 1px solid var(--dashboard-border);
  vertical-align: middle;
}

/* header */
.proj-header {
  flex-shrink: 0;
  padding: 32px 24px 0;
}
.proj-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.proj-header-title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
}
.proj-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* buttons */
.proj-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
  background: transparent;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s;
  white-space: nowrap;
}
.proj-btn:hover:not(:disabled) { background: var(--bg-hover); }
.proj-btn:disabled { opacity: 0.4; cursor: default; }
.proj-btn--primary {
  background: var(--bg-elevated, rgba(255,255,255,0.08));
  border-color: transparent;
  font-weight: 500;
}
.proj-btn--primary:hover:not(:disabled) { background: var(--bg-hover); }
.proj-sort-select {
  background: transparent;
  padding: 5px 10px;
  font-size: 12px;
  color: var(--color-muted, #94a3b8);
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
  cursor: pointer;
  outline: none;
}
.proj-sort-select option { background: var(--bg-elevated, #1e2130); }

/* search */
.proj-search-wrap {
  position: relative;
  padding-bottom: 20px;
}
.proj-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-muted, #94a3b8);
  pointer-events: none;
  margin-top: -10px;
}
.proj-search-input {
  width: 100%;
  padding: 8px 12px 8px 36px;
  border-radius: 10px;
  border: 1px solid var(--dashboard-border);
  background: var(--dashboard-panel, rgba(255,255,255,0.04));
  color: inherit;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.proj-search-input:focus {
  border-color: var(--solar-cyan, #22d3ee);
  box-shadow: 0 0 0 3px rgba(34,211,238,0.15);
}
.proj-search-input::placeholder { color: var(--color-muted, #94a3b8); }

/* create form */
.proj-create-form {
  padding: 0 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.proj-create-input {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
  background: var(--dashboard-panel, rgba(255,255,255,0.04));
  color: inherit;
  font-size: 14px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.proj-create-input:focus { border-color: var(--solar-cyan, #22d3ee); }
.proj-create-input::placeholder { color: var(--color-muted, #94a3b8); }
.proj-create-actions { display: flex; gap: 8px; }

/* body */
.proj-body {
  flex: 1;
  padding: 4px 24px 40px;
}

/* grid — equal-height cards */
.proj-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  grid-auto-rows: 176px;
  gap: 12px;
}
@media (max-width: 620px) {
  .proj-grid {
    grid-template-columns: 1fr;
    grid-auto-rows: 168px;
  }
}

/* card wrap + menu (always visible) */
.proj-card-wrap {
  position: relative;
  height: 100%;
  min-height: 0;
}
.proj-card-wrap--archived .proj-card {
  opacity: 0.72;
}
.proj-card-wrap--archived .proj-card-desc {
  color: var(--color-muted, #64748b);
}
.proj-card-menu {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
}
.proj-card-menu-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
  background: var(--bg-elevated, rgba(15, 23, 42, 0.92));
  color: var(--color-main, #e2e8f0);
  cursor: pointer;
  opacity: 1;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.proj-card-menu-trigger:hover,
.proj-card-menu-trigger[aria-expanded="true"] {
  background: var(--bg-hover, rgba(255,255,255,0.12));
  color: inherit;
  border-color: rgba(255,255,255,0.18);
}
.proj-card-menu-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 156px;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--dashboard-border);
  background: var(--bg-elevated, #1a1f2e);
  box-shadow: 0 12px 32px rgba(0,0,0,0.45);
  z-index: 20;
}
.proj-card-menu-item {
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
}
.proj-card-menu-item:hover { background: var(--bg-hover); }
.proj-card-menu-item--danger { color: #f87171; }
.proj-card-menu-item--danger:hover { background: rgba(248,113,113,0.12); }
.proj-card-star {
  display: inline-block;
  vertical-align: -2px;
  margin-right: 4px;
  color: var(--solar-yellow, #fbbf24);
}
.proj-card-workspace {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: var(--color-muted, #94a3b8);
  opacity: 0.55;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proj-filter-toggle--on {
  border-color: var(--solar-cyan, #22d3ee);
  color: var(--solar-cyan, #22d3ee);
  background: rgba(34,211,238,0.08);
}
.proj-btn--danger {
  border-color: rgba(248,113,113,0.35);
  color: #f87171;
}
.proj-btn--danger:hover:not(:disabled) { background: rgba(248,113,113,0.12); }

/* modals + toast */
.proj-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0,0,0,0.55);
}
.proj-modal {
  width: min(420px, 100%);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--dashboard-border);
  background: var(--bg-elevated, #1a1f2e);
  box-shadow: 0 20px 48px rgba(0,0,0,0.45);
}
.proj-modal-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
}
.proj-modal-body {
  margin: 0 0 8px;
  font-size: 14px;
}
.proj-modal-meta {
  color: var(--color-muted, #94a3b8);
  font-size: 12px;
}
.proj-modal-hint {
  margin: 0 0 16px;
  font-size: 12px;
  color: var(--color-muted, #94a3b8);
  line-height: 1.5;
}
.proj-toast {
  position: fixed;
  bottom: 72px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1300;
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid var(--dashboard-border);
  background: var(--bg-elevated, #1a1f2e);
  font-size: 13px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  pointer-events: none;
}

/* card */
.proj-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 14px 44px 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--dashboard-border);
  background: var(--dashboard-panel, rgba(255,255,255,0.03));
  text-align: left;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
  color: inherit;
  box-sizing: border-box;
  outline: none;
}
.proj-card:hover {
  background: var(--bg-hover, rgba(255,255,255,0.06));
  border-color: rgba(255,255,255,0.12);
}
.proj-card:focus-visible {
  border-color: var(--solar-cyan, #22d3ee);
  box-shadow: 0 0 0 2px rgba(34,211,238,0.25);
}
.proj-card-wrap--active .proj-card {
  border-color: var(--solar-cyan, #22d3ee) !important;
  box-shadow: 0 0 0 1px var(--solar-cyan, #22d3ee);
  background: rgba(34,211,238,0.04) !important;
}
@media (max-width: 620px) {
  .proj-card-menu-trigger { opacity: 1; }
}
.proj-card--active {
  border-color: var(--solar-cyan, #22d3ee) !important;
  box-shadow: 0 0 0 1px var(--solar-cyan, #22d3ee);
  background: rgba(34,211,238,0.04) !important;
}
.proj-card--pinned {
  border-color: rgba(251, 191, 36, 0.25);
}
.proj-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.proj-card-name {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
  flex: 1;
  min-width: 0;
}
.proj-card-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
}
.proj-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.proj-card-desc {
  font-size: 12px;
  color: var(--color-muted, #94a3b8);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  flex: 1;
  min-height: 2.9em;
}
.proj-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 4px;
}
.proj-card-type {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--color-muted, #94a3b8);
}
.proj-card-priority {
  font-size: 11px;
  font-weight: 600;
}

/* skeleton */
.proj-card--skeleton {
  cursor: default;
  pointer-events: none;
}
.skel {
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--dashboard-border) 25%,
    rgba(255,255,255,0.06) 50%,
    var(--dashboard-border) 75%
  );
  background-size: 200% 100%;
  animation: proj-shimmer 1.4s ease-in-out infinite;
}
@keyframes proj-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.skel-title { height: 14px; width: 60%; margin-bottom: 4px; }
.skel-badge { height: 12px; width: 24%; }
.skel-desc { height: 11px; width: 90%; margin-top: 8px; }
.skel-desc--short { width: 65%; }
.skel-chip { height: 11px; width: 22%; margin-top: 12px; }
.skel-time { height: 11px; width: 18%; margin-top: 12px; }

/* empty */
.proj-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 64px 24px;
  text-align: center;
}
.proj-empty-icon { color: var(--color-muted, #94a3b8); opacity: 0.4; }
.proj-empty-text { font-size: 14px; color: var(--color-muted, #94a3b8); max-width: 280px; }

/* ── side panel ── */
.proj-panel {
  width: 300px;
  min-width: 300px;
  max-width: 300px;
  border-left: 1px solid var(--dashboard-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--dashboard-panel, rgba(255,255,255,0.02));
  flex-shrink: 0;
}
.proj-panel-header {
  padding: 20px 18px 14px;
  border-bottom: 1px solid var(--dashboard-border);
  flex-shrink: 0;
}
.proj-panel-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.proj-panel-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  line-height: 1.3;
}
.proj-panel-close {
  flex-shrink: 0;
  padding: 4px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-muted, #94a3b8);
  cursor: pointer;
  transition: background 0.1s;
}
.proj-panel-close:hover { background: var(--bg-hover); color: inherit; }
.proj-panel-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.proj-panel-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
}
.proj-panel-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid currentColor;
  opacity: 0.8;
}
.proj-panel-body {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 24px;
}
.proj-panel-section {
  padding: 14px 18px 0;
}
.proj-panel-desc {
  font-size: 13px;
  color: var(--color-muted, #94a3b8);
  line-height: 1.6;
  margin: 0;
}
.proj-panel-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-muted, #94a3b8);
  opacity: 0.6;
  margin-bottom: 8px;
}
/* progress */
.proj-progress-wrap {
  height: 4px;
  border-radius: 2px;
  background: var(--dashboard-border);
  overflow: hidden;
  margin-bottom: 4px;
}
.proj-progress-bar {
  height: 100%;
  border-radius: 2px;
  background: var(--solar-cyan, #22d3ee);
  transition: width 0.3s;
}
.proj-progress-text {
  font-size: 11px;
  color: var(--color-muted, #94a3b8);
}
/* actions */
.proj-panel-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.proj-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s;
  text-align: left;
}
.proj-action-btn:hover { background: var(--bg-hover); }
/* kv */
.proj-panel-kv { display: flex; flex-direction: column; gap: 8px; }
.proj-panel-kv-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.proj-panel-kv-key { font-size: 12px; color: var(--color-muted, #94a3b8); }
.proj-panel-kv-val { font-size: 12px; text-align: right; }
`;
