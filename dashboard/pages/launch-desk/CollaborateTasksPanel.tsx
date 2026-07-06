import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  ChevronDown,
  Clock,
  ExternalLink,
  FolderKanban,
  List,
  MoreVertical,
  PlusCircle,
  Star,
  Trash2,
} from 'lucide-react';
import { loadUserTaskLists, saveUserTaskList } from '../../src/lib/collaborate/userTaskLists';
import {
  AgentTodo,
  ProjectRow,
  createTodo,
  deleteTodo,
  formatTodoDue,
  isMyTasksTodo,
  isTodoStarred,
  patchTodo,
  toSqlDatetime,
  todoListName,
} from './ops-desk-types';

export type TasksNavView = 'starred' | 'list';

type Props = {
  todos: AgentTodo[];
  loading: boolean;
  navView: TasksNavView;
  activeList: string;
  onNavViewChange: (view: TasksNavView) => void;
  onActiveListChange: (list: string) => void;
  onReload: () => Promise<void>;
  onSchedule?: (todo: AgentTodo) => void;
  composing?: boolean;
  onComposingChange?: (open: boolean) => void;
  projectId?: string | null;
  projects?: ProjectRow[];
  selectedTaskId?: string | null;
  onSelectedTaskChange?: (id: string | null) => void;
};

function isOpen(todo: AgentTodo) {
  const s = String(todo.status || '').toLowerCase();
  return s !== 'done' && s !== 'completed' && s !== 'cancelled';
}

export function CollaborateTasksSidebar({
  todos,
  navView,
  activeList,
  onNavViewChange,
  onActiveListChange,
  onCreateClick,
  onClientWorkClick,
}: Pick<Props, 'todos' | 'navView' | 'activeList' | 'onNavViewChange' | 'onActiveListChange'> & {
  onReload?: () => Promise<void>;
  onCreateClick?: () => void;
  onClientWorkClick?: () => void;
}) {
  const [newListName, setNewListName] = useState('');
  const [showNewList, setShowNewList] = useState(false);
  const [userLists, setUserLists] = useState<string[]>(() => loadUserTaskLists());

  useEffect(() => {
    setUserLists(loadUserTaskLists());
  }, [todos.length, activeList]);

  const openTodos = useMemo(() => todos.filter(isOpen), [todos]);
  const starredCount = useMemo(() => openTodos.filter(isTodoStarred).length, [openTodos]);

  const lists = useMemo(() => {
    const names = new Set<string>(['My Tasks', ...userLists]);
    const counts = new Map<string, number>();
    for (const name of names) counts.set(name, 0);
    for (const t of openTodos) {
      const name = todoListName(t);
      if (!names.has(name)) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => {
      if (a === 'My Tasks') return -1;
      if (b === 'My Tasks') return 1;
      return a.localeCompare(b);
    });
  }, [openTodos, userLists]);

  const submitNewList = () => {
    const name = newListName.trim();
    if (!name || name === 'My Tasks') return;
    saveUserTaskList(name);
    setUserLists(loadUserTaskLists());
    onActiveListChange(name);
    onNavViewChange('list');
    setNewListName('');
    setShowNewList(false);
    onCreateClick?.();
  };

  return (
    <>
      <button
        type="button"
        className="colab-cal-create-btn"
        onClick={() => {
          if (navView === 'starred') onNavViewChange('list');
          onActiveListChange('My Tasks');
          onCreateClick?.();
        }}
      >
        <span className="colab-cal-create-plus">+</span>
        <span>Create</span>
      </button>

      <button
        type="button"
        className={`colab-tasks-nav-item${navView === 'list' && activeList === 'My Tasks' ? ' active' : ''}`}
        onClick={() => {
          onActiveListChange('My Tasks');
          onNavViewChange('list');
        }}
      >
        <span className="colab-tasks-nav-icon" aria-hidden>
          <CheckSquare size={16} strokeWidth={1.75} />
        </span>
        <span>My Tasks</span>
        <span className="colab-tasks-nav-count">{lists.find(([n]) => n === 'My Tasks')?.[1] ?? 0}</span>
      </button>

      <button
        type="button"
        className={`colab-tasks-nav-item${navView === 'starred' ? ' active' : ''}`}
        onClick={() => onNavViewChange('starred')}
      >
        <span className="colab-tasks-nav-icon" aria-hidden>
          <Star size={16} strokeWidth={1.75} />
        </span>
        <span>Starred</span>
        {starredCount > 0 && <span className="colab-tasks-nav-count">{starredCount}</span>}
      </button>

      {onClientWorkClick ? (
        <button type="button" className="colab-tasks-nav-item" onClick={onClientWorkClick}>
          <span className="colab-tasks-nav-icon" aria-hidden>
            <FolderKanban size={16} strokeWidth={1.75} />
          </span>
          <span>Client work</span>
        </button>
      ) : null}

      {userLists.length > 0 ? (
        <>
          <div className="colab-tasks-lists-head">
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
            <span>My lists</span>
          </div>
          {lists
            .filter(([name]) => name !== 'My Tasks')
            .map(([name, count]) => (
              <button
                key={name}
                type="button"
                className={`colab-tasks-nav-item${navView === 'list' && activeList === name ? ' active' : ''}`}
                onClick={() => {
                  onActiveListChange(name);
                  onNavViewChange('list');
                }}
              >
                <span className="colab-tasks-nav-icon" aria-hidden>
                  <List size={16} strokeWidth={1.75} />
                </span>
                <span>{name}</span>
                <span className="colab-tasks-nav-count">{count}</span>
              </button>
            ))}
        </>
      ) : null}

      {showNewList ? (
        <div style={{ padding: '0 16px 12px' }}>
          <input
            className="colab-tasks-inline-due"
            style={{ width: '100%' }}
            placeholder="List name"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNewList();
              if (e.key === 'Escape') setShowNewList(false);
            }}
            autoFocus
          />
        </div>
      ) : (
        <button type="button" className="colab-tasks-new-list" onClick={() => setShowNewList(true)}>
          + Create new list
        </button>
      )}
    </>
  );
}

function TaskActionMenu({
  todo,
  onComplete,
  onEdit,
  onDelete,
  onSchedule,
  onClose,
}: {
  todo: AgentTodo;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSchedule?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  return (
    <div ref={ref} className="colab-tasks-action-menu" role="menu">
      <button type="button" role="menuitem" onClick={() => { onEdit(); onClose(); }}>
        Edit task
      </button>
      <button type="button" role="menuitem" onClick={() => { onComplete(); onClose(); }}>
        Mark complete
      </button>
      {onSchedule ? (
        <button type="button" role="menuitem" onClick={() => { onSchedule(); onClose(); }}>
          Schedule on calendar
        </button>
      ) : null}
      <button type="button" role="menuitem" className="danger" onClick={() => { onDelete(); onClose(); }}>
        Delete task
      </button>
    </div>
  );
}

export function CollaborateTasksMain({
  todos,
  loading,
  navView,
  activeList,
  onReload,
  onSchedule,
  composing = false,
  onComposingChange,
  onNavViewChange,
  onActiveListChange,
  projectId = null,
  projects = [],
  selectedTaskId = null,
  onSelectedTaskChange,
}: Props) {
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftDue, setDraftDue] = useState('');
  const [draftProjectId, setDraftProjectId] = useState(projectId || '');
  const [saving, setSaving] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [dueEditId, setDueEditId] = useState<string | null>(null);
  const [dueDraft, setDueDraft] = useState('');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editProjectId, setEditProjectId] = useState('');

  const openTodos = useMemo(() => todos.filter(isOpen), [todos]);

  const filtered = useMemo(() => {
    if (navView === 'starred') return openTodos.filter(isTodoStarred);
    if (activeList === 'My Tasks') return openTodos.filter(isMyTasksTodo);
    return openTodos.filter((t) => todoListName(t) === activeList);
  }, [openTodos, navView, activeList]);

  const selectedTask = useMemo(
    () => (selectedTaskId ? openTodos.find((t) => t.id === selectedTaskId) || null : null),
    [openTodos, selectedTaskId],
  );

  useEffect(() => {
    if (!selectedTask) {
      setEditTitle('');
      setEditNotes('');
      setEditProjectId('');
      return;
    }
    setEditTitle(selectedTask.title || '');
    setEditNotes(selectedTask.description || selectedTask.notes || '');
    setEditProjectId(selectedTask.project_id || selectedTask.project_key || '');
  }, [selectedTask]);

  const listTitle = navView === 'starred' ? 'Starred' : activeList;

  const completeTask = async (todo: AgentTodo) => {
    setSaving(true);
    try {
      await patchTodo(todo.id, { status: 'done' });
      if (selectedTaskId === todo.id) onSelectedTaskChange?.(null);
      await onReload();
    } finally {
      setSaving(false);
    }
  };

  const removeTask = async (todo: AgentTodo) => {
    if (!window.confirm(`Delete "${todo.title}"?`)) return;
    setSaving(true);
    try {
      await deleteTodo(todo.id);
      if (selectedTaskId === todo.id) onSelectedTaskChange?.(null);
      await onReload();
    } finally {
      setSaving(false);
    }
  };

  const toggleStar = async (todo: AgentTodo) => {
    setSaving(true);
    setComposeError(null);
    try {
      await patchTodo(todo.id, { starred: !isTodoStarred(todo) });
      await onReload();
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : 'Could not update star');
    } finally {
      setSaving(false);
    }
  };

  const saveNewTask = async () => {
    const title = draftTitle.trim();
    if (!title) return;
    setSaving(true);
    setComposeError(null);
    try {
      const category = navView === 'list' ? activeList : 'My Tasks';
      if (category !== 'My Tasks') saveUserTaskList(category);
      await createTodo({
        title,
        description: draftNotes.trim() || undefined,
        due_date: draftDue ? toSqlDatetime(draftDue) : undefined,
        category,
        ...(draftProjectId || projectId
          ? { project_id: draftProjectId || projectId || undefined, project_key: draftProjectId || projectId || undefined }
          : {}),
      });
      setDraftTitle('');
      setDraftNotes('');
      setDraftDue('');
      setDraftProjectId(projectId || '');
      onComposingChange?.(false);
      await onReload();
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : 'Could not create task');
    } finally {
      setSaving(false);
    }
  };

  const saveSelectedTask = async () => {
    if (!selectedTask) return;
    const title = editTitle.trim();
    if (!title) return;
    setSaving(true);
    setComposeError(null);
    try {
      await patchTodo(selectedTask.id, {
        title,
        description: editNotes.trim() || null,
        ...(editProjectId
          ? { project_id: editProjectId, project_key: editProjectId }
          : { project_id: null, project_key: null }),
      });
      await onReload();
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : 'Could not save task');
    } finally {
      setSaving(false);
    }
  };

  const saveDueDate = async (todo: AgentTodo) => {
    if (!dueDraft) return;
    setSaving(true);
    try {
      await patchTodo(todo.id, { due_date: toSqlDatetime(dueDraft) });
      setDueEditId(null);
      setDueDraft('');
      await onReload();
    } finally {
      setSaving(false);
    }
  };

  const openCompose = () => {
    if (navView === 'starred') {
      onNavViewChange?.('list');
      onActiveListChange?.('My Tasks');
    }
    onComposingChange?.(true);
  };

  const projectLabel = (id: string | null | undefined) => {
    if (!id) return null;
    return projects.find((p) => p.id === id)?.name || id;
  };

  return (
    <section className="colab-tasks-main">
      <div className="colab-tasks-main-inner">
        <div className="colab-tasks-list-head">
          <h2 className="colab-tasks-list-title">{listTitle}</h2>
          <button type="button" className="colab-cal-icon-btn" aria-label="List options">
            <MoreVertical size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="colab-tasks-section">
          <div className="colab-tasks-section-head">
            <FolderKanban size={16} strokeWidth={1.75} aria-hidden />
            <span>Project</span>
          </div>
          <p className="colab-tasks-section-hint">
            Connect tasks to a real project to track today&apos;s work in Time insights.
          </p>
          {composing ? (
            <select
              className="colab-tasks-project-select"
              value={draftProjectId}
              onChange={(e) => setDraftProjectId(e.target.value)}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : projectId ? (
            <div className="colab-tasks-meta-pill">{projectLabel(projectId)}</div>
          ) : (
            <div className="colab-tasks-meta-pill muted">Select a task to assign a project</div>
          )}
        </div>

        <div className="colab-tasks-add-row">
          {composeError ? <p className="colab-tasks-compose-error">{composeError}</p> : null}
          {!composing ? (
            <button type="button" className="colab-tasks-add-btn" onClick={openCompose}>
              <span className="colab-tasks-add-icon" aria-hidden>
                <PlusCircle size={18} strokeWidth={1.75} />
              </span>
              <span>Add a task</span>
            </button>
          ) : (
            <div className="colab-tasks-compose" style={{ gridColumn: '1 / -1', width: '100%' }}>
              <span className="colab-tasks-check" />
              <div>
                <input
                  placeholder="Title"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void saveNewTask();
                    }
                    if (e.key === 'Escape') onComposingChange?.(false);
                  }}
                  autoFocus
                />
                <textarea
                  placeholder="Details — or ask Agent Sam to turn ideas into tasks"
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                />
                <input
                  type="datetime-local"
                  className="colab-tasks-inline-due"
                  value={draftDue}
                  onChange={(e) => setDraftDue(e.target.value)}
                />
                <div className="colab-tasks-compose-actions">
                  <button type="button" className="colab-cal-save-btn" disabled={saving} onClick={() => void saveNewTask()}>
                    Save
                  </button>
                  <button type="button" className="colab-cal-text-btn" onClick={() => onComposingChange?.(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {loading && filtered.length === 0 ? (
          <div className="colab-tasks-empty">Loading tasks…</div>
        ) : filtered.length === 0 ? (
          <div className="colab-tasks-empty">No tasks here yet. Use Create or ask Agent Sam to add one.</div>
        ) : (
          filtered.map((todo) => {
            const due = formatTodoDue(todo.due_date);
            const body = todo.description || todo.notes;
            const proj = projectLabel(todo.project_id || todo.project_key);
            const selected = selectedTaskId === todo.id;
            return (
              <div
                key={todo.id}
                className={`colab-tasks-item${selected ? ' selected' : ''}`}
                onClick={() => onSelectedTaskChange?.(selected ? null : todo.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelectedTaskChange?.(selected ? null : todo.id);
                }}
                role="button"
                tabIndex={0}
              >
                <div className="colab-tasks-check-wrap" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="colab-tasks-check"
                    aria-label="Task actions"
                    disabled={saving}
                    onClick={() => setActionMenuId(actionMenuId === todo.id ? null : todo.id)}
                  />
                  {actionMenuId === todo.id ? (
                    <TaskActionMenu
                      todo={todo}
                      onComplete={() => void completeTask(todo)}
                      onEdit={() => onSelectedTaskChange?.(todo.id)}
                      onDelete={() => void removeTask(todo)}
                      onSchedule={onSchedule ? () => void onSchedule(todo) : undefined}
                      onClose={() => setActionMenuId(null)}
                    />
                  ) : null}
                </div>
                <div>
                  <div className="colab-tasks-item-title">{todo.title}</div>
                  {body ? <div className="colab-tasks-item-desc">{body}</div> : null}
                  {proj ? <div className="colab-tasks-project-tag">{proj}</div> : null}
                  {dueEditId === todo.id ? (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="datetime-local"
                        className="colab-tasks-inline-due"
                        value={dueDraft}
                        onChange={(e) => setDueDraft(e.target.value)}
                      />
                      <button type="button" className="colab-cal-save-btn" disabled={saving} onClick={() => void saveDueDate(todo)}>
                        Save
                      </button>
                    </div>
                  ) : due ? (
                    <div className="colab-tasks-meta-pill">
                      <Clock size={14} strokeWidth={1.75} aria-hidden />
                      <span>{due}</span>
                      {onSchedule ? (
                        <button
                          type="button"
                          className="colab-cal-text-btn"
                          style={{ padding: 0, marginLeft: 4 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onSchedule(todo);
                          }}
                        >
                          <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="colab-cal-text-btn"
                      style={{ marginTop: 8 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDueEditId(todo.id);
                        setDueDraft('');
                      }}
                    >
                      Add date/time
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className={`colab-tasks-star${isTodoStarred(todo) ? ' on' : ''}`}
                  aria-label={isTodoStarred(todo) ? 'Unstar' : 'Star'}
                  disabled={saving}
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleStar(todo);
                  }}
                >
                  <Star size={18} strokeWidth={1.75} fill={isTodoStarred(todo) ? 'currentColor' : 'none'} />
                </button>
              </div>
            );
          })
        )}

        {selectedTask ? (
          <div className="colab-tasks-detail">
            <div className="colab-tasks-detail-head">
              <h3>Task details</h3>
              <button type="button" className="colab-cal-text-btn" onClick={() => onSelectedTaskChange?.(null)}>
                Close
              </button>
            </div>
            <input
              className="colab-tasks-detail-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Title"
            />
            <textarea
              className="colab-tasks-detail-textarea"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Details"
            />
            <label className="colab-tasks-detail-label">
              Project
              <select
                className="colab-tasks-project-select"
                value={editProjectId}
                onChange={(e) => setEditProjectId(e.target.value)}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="colab-tasks-detail-actions">
              <button type="button" className="colab-cal-save-btn" disabled={saving} onClick={() => void saveSelectedTask()}>
                Save changes
              </button>
              <button type="button" className="colab-cal-outline-btn" disabled={saving} onClick={() => void completeTask(selectedTask)}>
                Mark complete
              </button>
              <button type="button" className="colab-cal-outline-btn danger" disabled={saving} onClick={() => void removeTask(selectedTask)}>
                <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
