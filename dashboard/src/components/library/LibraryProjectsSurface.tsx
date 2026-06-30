import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Plus, Search, Star } from 'lucide-react';
import type { OverviewProject } from '../../../api/projects';
import { fetchProjectsOverview } from '../../../api/projects';
import NewProjectModal from '../../../components/projects/NewProjectModal';
import { useWorkspace } from '../../context/WorkspaceContext';
import { LibraryProjectDetail } from './LibraryProjectDetail';

type Props = {
  onToast?: (msg: string) => void;
  initialProjectId?: string | null;
  onProjectChange?: (projectId: string | null) => void;
};

function formatUpdated(project: OverviewProject): string {
  if (project.lastDeploy && project.lastDeploy !== '—') return project.lastDeploy;
  if (project.dueDate && project.dueDate !== '—') return project.dueDate;
  return 'Recently';
}

function projectDescription(project: OverviewProject): string {
  const d = project.description?.trim();
  if (d) return d;
  const stage = project.stage?.trim();
  if (stage) return stage;
  const client = project.client_name || project.client;
  if (client) return `Client · ${client}`;
  return 'No description yet.';
}

export function LibraryProjectsSurface({ onToast, initialProjectId, onProjectChange }: Props) {
  const { workspaceId, workspaces, loading: workspaceLoading } = useWorkspace();
  const [query, setQuery] = useState('');
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof fetchProjectsOverview>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialProjectId || null);
  const [starred, setStarred] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProjectsOverview(workspaceId);
      if (!data.ok) {
        setError(data.error || 'Failed to load projects');
        setOverview(null);
      } else {
        setOverview(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceLoading) return;
    void refresh();
  }, [workspaceId, workspaceLoading, refresh]);

  useEffect(() => {
    if (initialProjectId) setSelectedId(initialProjectId);
  }, [initialProjectId]);

  const projects = overview?.projects || [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      [p.name, p.description, p.client, p.client_name, ...(p.tags || [])].join(' ').toLowerCase().includes(q),
    );
  }, [projects, query]);

  const selected = selectedId ? projects.find((p) => p.id === selectedId) : null;

  const workspaceLabel = useMemo(() => {
    if (!workspaceId) return null;
    return workspaces.find((w) => w.id === workspaceId)?.name || workspaceId;
  }, [workspaceId, workspaces]);

  const openProject = (id: string) => {
    setSelectedId(id);
    onProjectChange?.(id);
  };

  const closeProject = () => {
    setSelectedId(null);
    onProjectChange?.(null);
  };

  const toggleStar = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (selected) {
    return (
      <LibraryProjectDetail
        project={selected}
        onBack={closeProject}
        onToast={onToast}
        onRefresh={() => void refresh()}
      />
    );
  }

  return (
    <div className="lib-proj-grid-surface">
      <div className="lib-proj-grid-head">
        <div>
          <h1>Projects</h1>
          {workspaceLabel ? <p className="lib-project-muted">Workspace · {workspaceLabel}</p> : null}
        </div>
        <button type="button" className="lib-proj-btn primary" onClick={() => setModalOpen(true)}>
          <Plus size={16} strokeWidth={2} />
          New project
        </button>
      </div>

      {error ? <div className="lib-error">{error}</div> : null}

      <div className="lib-proj-grid-search">
        <Search size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
        />
      </div>

      {loading && !projects.length ? (
        <p className="lib-project-muted lib-proj-grid-empty">Loading projects…</p>
      ) : null}

      <div className="lib-proj-grid">
        {filtered.map((p) => (
          <button key={p.id} type="button" className="lib-proj-grid-card" onClick={() => openProject(p.id)}>
            <div className="lib-proj-grid-card-top">
              <h3>{p.name}</h3>
              {starred.has(p.id) ? (
                <Star size={14} className="lib-proj-star" fill="currentColor" />
              ) : (
                <button
                  type="button"
                  className="lib-proj-star-btn"
                  aria-label="Star project"
                  onClick={(e) => toggleStar(p.id, e)}
                >
                  <Star size={14} />
                </button>
              )}
            </div>
            <p className="lib-proj-grid-card-desc">{projectDescription(p)}</p>
            <p className="lib-proj-grid-card-meta">Updated {formatUpdated(p)}</p>
          </button>
        ))}
      </div>

      {!loading && filtered.length === 0 ? (
        <p className="lib-project-muted lib-proj-grid-empty">
          {query.trim() ? `No projects match "${query.trim()}"` : 'No projects yet. Create one to organize chats and artifacts.'}
        </p>
      ) : null}

      <NewProjectModal
        open={modalOpen}
        variant="compact"
        onClose={() => setModalOpen(false)}
        defaultWorkspaceId={workspaceId}
        onCreated={(createdId) => {
          setModalOpen(false);
          onToast?.('Project created');
          void refresh().then(() => {
            if (createdId) openProject(createdId);
          });
        }}
      />
    </div>
  );
}

export default LibraryProjectsSurface;
