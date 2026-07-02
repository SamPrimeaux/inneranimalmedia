import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Code2,
  ExternalLink,
  FileText,
  FolderOpen,
  Github,
  Globe,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  X,
  Zap,
} from 'lucide-react';

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

// ─── project card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  isActive,
  onClick,
}: {
  project: Project;
  isActive: boolean;
  onClick: () => void;
}) {
  const statusColor = STATUS_COLORS[project.status ?? ''] ?? 'var(--color-muted)';

  return (
    <button
      type="button"
      className={`proj-card${isActive ? ' proj-card--active' : ''}`}
      onClick={onClick}
      aria-pressed={isActive}
    >
      <div className="proj-card-header">
        <span className="proj-card-name">{project.name}</span>
        <span className="proj-card-status" style={{ color: statusColor }}>
          <span className="proj-status-dot" style={{ background: statusColor }} />
          {STATUS_LABELS[project.status ?? ''] ?? project.status_raw ?? ''}
        </span>
      </div>
      {project.description && (
        <p className="proj-card-desc">{project.description}</p>
      )}
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
    </button>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newBusy, setNewBusy] = useState(false);
  const [sortBy, setSortBy] = useState<'priority' | 'updated' | 'name'>('priority');
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/projects', { credentials: 'same-origin' });
      const data = r.ok ? await r.json() : {};
      const rows: Project[] = Array.isArray(data.projects)
        ? data.projects
        : Array.isArray(data)
          ? data
          : [];
      setProjects(rows.filter((p) => p.status !== 'archived'));
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
            (p.project_type ?? '').toLowerCase().includes(q),
        )
      : [...projects];

    list.sort((a, b) => {
      if (sortBy === 'priority') return (b.priority_num ?? 0) - (a.priority_num ?? 0);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0; // updated handled server-side
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

  return (
    <div className="proj-root">
      <style>{PROJECTS_CSS}</style>

      {/* ── main column ── */}
      <div className={`proj-main${activeProject ? ' proj-main--narrow' : ''}`}>
        {/* header */}
        <header className="proj-header">
          <div className="proj-header-top">
            <h1 className="proj-header-title">Projects</h1>
            <div className="proj-header-actions">
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
                  onClick={() => navigate(`/dashboard/projects/${encodeURIComponent(p.id)}`)}
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
  max-width: 780px;
  margin-left: auto;
  margin-right: auto;
  width: 100%;
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

/* grid */
.proj-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
@media (max-width: 620px) {
  .proj-grid { grid-template-columns: 1fr; }
}

/* card */
.proj-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid var(--dashboard-border);
  background: var(--dashboard-panel, rgba(255,255,255,0.03));
  text-align: left;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
  min-height: 110px;
  color: inherit;
}
.proj-card:hover {
  background: var(--bg-hover, rgba(255,255,255,0.06));
  border-color: rgba(255,255,255,0.12);
}
.proj-card--active {
  border-color: var(--solar-cyan, #22d3ee) !important;
  box-shadow: 0 0 0 1px var(--solar-cyan, #22d3ee);
  background: rgba(34,211,238,0.04) !important;
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
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
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
