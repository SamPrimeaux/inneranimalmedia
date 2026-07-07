import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle, Clock, ExternalLink, FolderKanban, Star, Trash2, X } from 'lucide-react';
import {
  AgentTodo,
  ProjectRow,
  formatTodoDue,
  isTodoStarred,
  parseTodoTags,
  toSqlDatetime,
} from './ops-desk-types';

type Props = {
  task: AgentTodo;
  projects: ProjectRow[];
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    description: string | null;
    project_id: string | null;
    due_date: string | null;
  }) => Promise<void>;
  onComplete: () => Promise<void>;
  onDelete: () => Promise<void>;
  onSchedule?: () => void;
  onToggleStar?: () => Promise<void>;
};

function taskBody(todo: AgentTodo) {
  return [todo.description, todo.notes].filter(Boolean).join('\n\n').trim();
}

function fmtMetaDate(raw: string | null | undefined) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CollaborateTaskFocus({
  task,
  projects,
  saving = false,
  onClose,
  onSave,
  onComplete,
  onDelete,
  onSchedule,
  onToggleStar,
}: Props) {
  const [title, setTitle] = useState(task.title || '');
  const [body, setBody] = useState(taskBody(task));
  const [projectId, setProjectId] = useState(task.project_id || task.project_key || '');
  const [dueLocal, setDueLocal] = useState(() => {
    if (!task.due_date) return '';
    const d = new Date(task.due_date);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  useEffect(() => {
    setTitle(task.title || '');
    setBody(taskBody(task));
    setProjectId(task.project_id || task.project_key || '');
    if (!task.due_date) {
      setDueLocal('');
      return;
    }
    const d = new Date(task.due_date);
    if (Number.isNaN(d.getTime())) {
      setDueLocal('');
      return;
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    setDueLocal(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }, [task]);

  const projectName = useMemo(
    () => projects.find((p) => p.id === projectId)?.name || projectId || null,
    [projects, projectId],
  );

  const tags = parseTodoTags(task.tags);
  const starred = isTodoStarred(task);
  const dueLabel = formatTodoDue(task.due_date);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    await onSave({
      title: trimmedTitle,
      description: body.trim() || null,
      project_id: projectId.trim() || null,
      due_date: dueLocal ? toSqlDatetime(dueLocal) : null,
    });
  };

  return (
    <div className="colab-task-focus" role="dialog" aria-modal="true" aria-labelledby="colab-task-focus-title">
      <div className="colab-task-focus-top">
        <button type="button" className="colab-cal-icon-btn colab-task-focus-close" aria-label="Close task" onClick={onClose}>
          <X size={22} strokeWidth={1.75} />
        </button>
        <div className="colab-task-focus-top-actions">
          {onToggleStar ? (
            <button
              type="button"
              className={`colab-tasks-star${starred ? ' on' : ''}`}
              aria-label={starred ? 'Unstar task' : 'Star task'}
              disabled={saving}
              onClick={() => void onToggleStar()}
            >
              <Star size={20} strokeWidth={1.75} fill={starred ? 'currentColor' : 'none'} />
            </button>
          ) : null}
          <button type="button" className="colab-cal-save-btn" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="colab-task-focus-scroll">
        <div className="colab-task-focus-inner">
          <input
            id="colab-task-focus-title"
            className="colab-task-focus-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
          />

          <div className="colab-task-focus-meta">
            {task.category ? (
              <span className="colab-tasks-meta-pill">{task.category}</span>
            ) : null}
            {task.status ? (
              <span className="colab-tasks-meta-pill muted">{task.status}</span>
            ) : null}
            {task.priority ? (
              <span className="colab-tasks-meta-pill muted">{task.priority}</span>
            ) : null}
            {dueLabel ? (
              <span className="colab-tasks-meta-pill">
                <Clock size={14} strokeWidth={1.75} aria-hidden />
                {dueLabel}
              </span>
            ) : null}
            {projectName ? (
              <span className="colab-tasks-meta-pill">
                <FolderKanban size={14} strokeWidth={1.75} aria-hidden />
                {projectName}
              </span>
            ) : null}
          </div>

          {tags.length > 0 ? (
            <div className="colab-task-focus-tags">
              {tags.map((tag) => (
                <span key={tag} className="colab-tasks-project-tag">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <section className="colab-task-focus-section">
            <label className="colab-task-focus-label" htmlFor="colab-task-focus-body">
              Documentation
            </label>
            <p className="colab-task-focus-hint">
              Full context for you and Agent Sam — acceptance criteria, links, client notes, implementation steps.
            </p>
            <textarea
              id="colab-task-focus-body"
              className="colab-task-focus-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe what done looks like, paste URLs, list sub-steps, capture client feedback…"
              rows={14}
            />
          </section>

          {task.agent_instructions ? (
            <section className="colab-task-focus-section colab-task-focus-section--muted">
              <h3 className="colab-task-focus-label">Agent instructions</h3>
              <pre className="colab-task-focus-pre">{task.agent_instructions}</pre>
            </section>
          ) : null}

          <section className="colab-task-focus-section colab-task-focus-fields">
            <label className="colab-task-focus-field">
              <span>Due date & time</span>
              <input type="datetime-local" className="colab-tasks-inline-due" value={dueLocal} onChange={(e) => setDueLocal(e.target.value)} />
            </label>
            <label className="colab-task-focus-field">
              <span>Project</span>
              <select className="colab-tasks-project-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {(task.created_at || task.updated_at || task.linked_route) && (
            <section className="colab-task-focus-section colab-task-focus-audit">
              {task.created_at ? <div>Created {fmtMetaDate(task.created_at)}</div> : null}
              {task.updated_at ? <div>Updated {fmtMetaDate(task.updated_at)}</div> : null}
              {task.linked_route ? (
                <a className="colab-cal-text-btn" href={task.linked_route}>
                  <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
                  Open linked route
                </a>
              ) : null}
            </section>
          )}

          <div className="colab-task-focus-actions">
            {onSchedule ? (
              <button type="button" className="colab-cal-outline-btn" disabled={saving} onClick={onSchedule}>
                <Calendar size={16} strokeWidth={1.75} aria-hidden />
                Schedule on calendar
              </button>
            ) : null}
            <button type="button" className="colab-cal-outline-btn" disabled={saving} onClick={() => void onComplete()}>
              <CheckCircle size={16} strokeWidth={1.75} aria-hidden />
              Mark complete
            </button>
            <button type="button" className="colab-cal-outline-btn danger" disabled={saving} onClick={() => void onDelete()}>
              <Trash2 size={16} strokeWidth={1.75} aria-hidden />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
