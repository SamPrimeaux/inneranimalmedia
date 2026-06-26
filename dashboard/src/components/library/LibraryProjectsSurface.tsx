import { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, FolderPlus, Info, MoreVertical, Plus, X } from 'lucide-react';
import type { OverviewProject } from '../../../api/projects';
import { fetchProjectsOverview } from '../../../api/projects';
import type { KanbanTask } from '../../../api/kanban';
import { fetchKanbanTasks } from '../../../api/kanban';
import NewProjectModal from '../../../components/projects/NewProjectModal';
import { useWorkspace } from '../../context/WorkspaceContext';
import WorkspaceKanban from '../kanban/WorkspaceKanban';

type Props = {
  onToast?: (msg: string) => void;
  initialProjectId?: string | null;
  onProjectChange?: (projectId: string | null) => void;
};

function formatModified(project: OverviewProject): string {
  if (project.lastDeploy) {
    const d = new Date(project.lastDeploy);
    if (!Number.isNaN(d.getTime())) {
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }
  if (project.dueDate) return project.dueDate;
  return '—';
}

function sourceCount(project: OverviewProject): number {
  const tasks = project.totalTasks ?? project.activeTasks + project.completedTasks;
  let n = tasks > 0 ? 1 : 0;
  if (project.domain) n += 1;
  if (project.tags?.length) n += 1;
  return n || 0;
}

function ProjectSourcesPanel({ projectId }: { projectId: string }) {
  const { workspaceId } = useWorkspace();
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await fetchKanbanTasks({ projectId, workspaceId });
      if (!cancelled) {
        setTasks(res.ok ? res.tasks || [] : []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, workspaceId]);

  return (
    <div className="lib-project-sources">
      {loading ? <p className="lib-project-muted">Loading sources…</p> : null}
      {!loading && tasks.length === 0 ? (
        <div className="lib-project-sources-empty">
          <div className="lib-project-sources-illustration" aria-hidden />
          <p>Add kanban tasks, artifacts, and linked workspace assets to this project.</p>
          <button type="button" className="lib-connect-action primary">
            Add
          </button>
        </div>
      ) : (
        <ul className="lib-project-source-list">
          {tasks.map((t) => (
            <li key={t.id}>
              <strong>{t.title}</strong>
              <span>{t.priority || 'open'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectDetail({
  project,
  onClose,
}: {
  project: OverviewProject;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'sources' | 'history' | 'kanban'>('sources');

  return (
    <div className="lib-project-detail">
      <header className="lib-project-detail-head">
        <div className="lib-project-detail-title">
          <span className="lib-project-folder-icon" aria-hidden>
            <FolderPlus size={18} />
          </span>
          <h2>{project.name}</h2>
        </div>
        <div className="lib-project-detail-actions">
          <a className="lib-connect-action" href={`/dashboard/collaborate?project=${encodeURIComponent(project.id)}`}>
            Open in Collaborate
          </a>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close project">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="lib-project-detail-body">
        <aside className="lib-project-detail-side">
          <div className="lib-project-detail-tabs">
            <button
              type="button"
              className={tab === 'sources' ? 'active' : ''}
              onClick={() => setTab('sources')}
            >
              Project sources
            </button>
            <button
              type="button"
              className={tab === 'history' ? 'active' : ''}
              onClick={() => setTab('history')}
            >
              History
            </button>
            <button
              type="button"
              className={tab === 'kanban' ? 'active' : ''}
              onClick={() => setTab('kanban')}
            >
              Kanban
            </button>
          </div>
          {tab === 'sources' ? <ProjectSourcesPanel projectId={project.id} /> : null}
          {tab === 'history' ? (
            <div className="lib-project-history">
              <p className="lib-project-muted">Recent activity</p>
              <ul>
                <li>
                  <strong>{project.activeTasks} open</strong> · {project.blockedTasks} blocked tasks
                </li>
                {project.lastDeploy ? (
                  <li>
                    Last deploy · {new Date(project.lastDeploy).toLocaleString()}
                  </li>
                ) : null}
                {project.stage ? (
                  <li>
                    Stage · {project.stage}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </aside>

        <section className="lib-project-detail-main">
          {tab === 'kanban' ? (
            <div className="lib-project-kanban-wrap">
              <WorkspaceKanban workspaceId={project.workspace_id} />
            </div>
          ) : (
            <>
              <h3>Ask questions about your project</h3>
              <p className="lib-project-muted">
                Add tasks and link artifacts to get deeper insights from Agent Sam on{' '}
                <strong>{project.name}</strong>.
              </p>
              <div className="lib-project-meta-grid">
                <div>
                  <span>Client</span>
                  <strong>{project.client || project.client_name || '—'}</strong>
                </div>
                <div>
                  <span>Owner</span>
                  <strong>{project.owner || 'me'}</strong>
                </div>
                <div>
                  <span>Health</span>
                  <strong>{project.health}%</strong>
                </div>
                <div>
                  <span>Progress</span>
                  <strong>{project.progress}%</strong>
                </div>
                <div>
                  <span>Type</span>
                  <strong>{project.project_type || '—'}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{project.status}</strong>
                </div>
              </div>
              {project.description ? (
                <p className="lib-project-description">{project.description}</p>
              ) : null}
              {project.tags?.length ? (
                <div className="lib-project-tags">
                  {project.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export function LibraryProjectsSurface({ onToast, initialProjectId, onProjectChange }: Props) {
  const { workspaceId, workspaces, loading: workspaceLoading } = useWorkspace();
  const [query, setQuery] = useState('');
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof fetchProjectsOverview>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialProjectId || null);
  const [sortAsc, setSortAsc] = useState(true);

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
    if (!workspaceLoading || overview) return;
    const t = window.setTimeout(() => {
      if (!overview) void refresh();
    }, 4000);
    return () => window.clearTimeout(t);
  }, [workspaceLoading, overview, refresh]);

  useEffect(() => {
    if (initialProjectId) setSelectedId(initialProjectId);
  }, [initialProjectId]);

  const projects = overview?.projects || [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q
      ? projects.filter((p) =>
          [p.name, p.client, p.owner, p.stage, ...(p.tags || [])].join(' ').toLowerCase().includes(q),
        )
      : projects;
    list = [...list].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [projects, query, sortAsc]);

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

  if (selected) {
    return <ProjectDetail project={selected} onClose={closeProject} />;
  }

  return (
    <div className="lib-projects-surface">
      <div className="lib-projects-head">
        <div className="lib-projects-title-row">
          <h1>Projects</h1>
          <button type="button" className="icon-btn" title="About projects" aria-label="About projects">
            <Info size={16} />
          </button>
        </div>
        {workspaceLabel ? (
          <p className="lib-project-muted">Workspace · {workspaceLabel}</p>
        ) : null}
        <button type="button" className="lib-projects-create-btn" onClick={() => setModalOpen(true)}>
          <Plus size={18} />
          Create a project
        </button>
      </div>

      {error ? <div className="lib-error">{error}</div> : null}

      <div className="lib-projects-toolbar">
        <button type="button" className="filter" aria-label="Filter projects">
          <Filter size={14} />
          Filter
        </button>
        <input
          className="lib-projects-search"
          placeholder="Search projects"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="lib-projects-table-wrap">
        <table className="lib-projects-table">
          <thead>
            <tr>
              <th>
                <button type="button" className="lib-projects-sort" onClick={() => setSortAsc((v) => !v)}>
                  Name {sortAsc ? '↑' : '↓'}
                </button>
              </th>
              <th>Sources</th>
              <th>Owner</th>
              <th>Date modified</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {loading && !projects.length ? (
              <tr>
                <td colSpan={5} className="lib-project-muted">
                  Loading projects…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="lib-project-muted">
                  No projects yet. Create one to curate sources, tasks, and artifacts.
                </td>
              </tr>
            ) : null}
            {filtered.map((project) => (
              <tr key={project.id}>
                <td>
                  <button type="button" className="lib-projects-name-btn" onClick={() => openProject(project.id)}>
                    <span className="lib-project-folder-icon" aria-hidden>
                      <FolderPlus size={16} />
                    </span>
                    {project.name}
                  </button>
                </td>
                <td>{sourceCount(project) || '—'}</td>
                <td>
                  <span className="lib-projects-owner">
                    <span className="lib-projects-owner-avatar">{project.owner?.[0]?.toUpperCase() || 'M'}</span>
                    {project.owner || 'me'}
                  </span>
                </td>
                <td>{formatModified(project)}</td>
                <td>
                  <button type="button" className="icon-btn" aria-label={`More actions for ${project.name}`}>
                    <MoreVertical size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultWorkspaceId={workspaceId}
        onCreated={() => {
          setModalOpen(false);
          onToast?.('Project created');
          void refresh();
        }}
      />
    </div>
  );
}
