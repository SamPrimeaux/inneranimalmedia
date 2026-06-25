import React, { useMemo, useState } from 'react';
import {
  AgentTodo,
  createTodo,
  formatTodoDue,
  isTodoStarred,
  patchTodo,
  toSqlDatetime,
  todoListName,
} from './ops-desk-types';

export type TasksNavView = 'all' | 'starred' | 'list';

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
}: Pick<Props, 'todos' | 'navView' | 'activeList' | 'onNavViewChange' | 'onActiveListChange'> & {
  onReload?: () => Promise<void>;
  onCreateClick?: () => void;
}) {
  const [newListName, setNewListName] = useState('');
  const [showNewList, setShowNewList] = useState(false);

  const openTodos = useMemo(() => todos.filter(isOpen), [todos]);
  const starredCount = useMemo(() => openTodos.filter(isTodoStarred).length, [openTodos]);

  const lists = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of openTodos) {
      const name = todoListName(t);
      map.set(name, (map.get(name) || 0) + 1);
    }
    if (!map.has('My Tasks')) map.set('My Tasks', 0);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [openTodos]);

  const submitNewList = () => {
    const name = newListName.trim();
    if (!name) return;
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
          onNavViewChange(navView === 'list' ? 'list' : 'all');
          onCreateClick?.();
        }}
      >
        <span className="colab-cal-create-plus">+</span>
        <span>Create</span>
      </button>

      <button
        type="button"
        className={`colab-tasks-nav-item${navView === 'all' ? ' active' : ''}`}
        onClick={() => onNavViewChange('all')}
      >
        <span className="colab-tasks-nav-icon">☑</span>
        <span>All tasks</span>
      </button>
      <button
        type="button"
        className={`colab-tasks-nav-item${navView === 'starred' ? ' active' : ''}`}
        onClick={() => onNavViewChange('starred')}
      >
        <span className="colab-tasks-nav-icon">★</span>
        <span>Starred</span>
        {starredCount > 0 && <span className="colab-tasks-nav-count">{starredCount}</span>}
      </button>

      <div className="colab-tasks-lists-head">
        <span>▾</span>
        <span>Lists</span>
      </div>
      {lists.map(([name, count]) => (
        <button
          key={name}
          type="button"
          className={`colab-tasks-nav-item${navView === 'list' && activeList === name ? ' active' : ''}`}
          onClick={() => {
            onActiveListChange(name);
            onNavViewChange('list');
          }}
        >
          <span className="colab-tasks-nav-icon">☰</span>
          <span>{name}</span>
          <span className="colab-tasks-nav-count">{count}</span>
        </button>
      ))}

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

export function CollaborateTasksMain({
  todos,
  loading,
  navView,
  activeList,
  onReload,
  onSchedule,
  composing = false,
  onComposingChange,
}: Props) {
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftDue, setDraftDue] = useState('');
  const [saving, setSaving] = useState(false);
  const [dueEditId, setDueEditId] = useState<string | null>(null);
  const [dueDraft, setDueDraft] = useState('');

  const openTodos = useMemo(() => todos.filter(isOpen), [todos]);

  const filtered = useMemo(() => {
    if (navView === 'starred') return openTodos.filter(isTodoStarred);
    if (navView === 'list') return openTodos.filter((t) => todoListName(t) === activeList);
    return openTodos;
  }, [openTodos, navView, activeList]);

  const listTitle = navView === 'starred' ? 'Starred' : navView === 'list' ? activeList : 'All tasks';

  const completeTask = async (todo: AgentTodo) => {
    setSaving(true);
    try {
      await patchTodo(todo.id, { status: 'done' });
      await onReload();
    } finally {
      setSaving(false);
    }
  };

  const toggleStar = async (todo: AgentTodo) => {
    setSaving(true);
    try {
      await patchTodo(todo.id, { starred: !isTodoStarred(todo) });
      await onReload();
    } finally {
      setSaving(false);
    }
  };

  const saveNewTask = async () => {
    const title = draftTitle.trim();
    if (!title) return;
    setSaving(true);
    try {
      await createTodo({
        title,
        description: draftNotes.trim() || undefined,
        due_date: draftDue ? toSqlDatetime(draftDue) : undefined,
        category: navView === 'list' ? activeList : 'My Tasks',
      });
      setDraftTitle('');
      setDraftNotes('');
      setDraftDue('');
      onComposingChange?.(false);
      await onReload();
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

  return (
    <section className="colab-tasks-main">
      <div className="colab-tasks-main-inner">
        <div className="colab-tasks-list-head">
          <h2 className="colab-tasks-list-title">{listTitle}</h2>
          <button type="button" className="colab-cal-icon-btn" aria-label="List options">
            ⋮
          </button>
        </div>

        <div className="colab-tasks-add-row">
          {!composing ? (
            <button type="button" className="colab-tasks-add-btn" onClick={() => onComposingChange?.(true)}>
              <span className="colab-tasks-add-icon">⊕</span>
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
                  placeholder="Details"
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
          <div className="colab-tasks-empty">No tasks here yet.</div>
        ) : (
          filtered.map((todo) => {
            const due = formatTodoDue(todo.due_date);
            const body = todo.description || todo.notes;
            return (
              <div key={todo.id} className="colab-tasks-item">
                <button
                  type="button"
                  className="colab-tasks-check"
                  aria-label="Mark complete"
                  disabled={saving}
                  onClick={() => void completeTask(todo)}
                />
                <div>
                  <div className="colab-tasks-item-title">{todo.title}</div>
                  {body ? <div className="colab-tasks-item-desc">{body}</div> : null}
                  {dueEditId === todo.id ? (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
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
                      <span>🕒</span>
                      <span>{due}</span>
                      {onSchedule ? (
                        <button type="button" className="colab-cal-text-btn" style={{ padding: 0, marginLeft: 4 }} onClick={() => void onSchedule(todo)}>
                          ↗
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="colab-cal-text-btn"
                      style={{ marginTop: 8 }}
                      onClick={() => {
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
                  onClick={() => void toggleStar(todo)}
                >
                  ★
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
