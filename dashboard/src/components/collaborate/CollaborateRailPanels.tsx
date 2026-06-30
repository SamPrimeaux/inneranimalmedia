import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock, Lightbulb, Loader2, NotebookPen, Pencil, Trash2, Users } from 'lucide-react';
import {
  createCalendarEvent,
  createTodo,
  deleteTodo,
  fetchDayEvents,
  fetchPeople,
  fetchTodos,
  fmtTime,
  formatTodoDue,
  parseEventDate,
  patchTodo,
  type AgentTodo,
  type CalEvent,
  type CalendarPerson,
} from '../../../pages/launch-desk/ops-desk-types';
import type { CollaborateRailPanel } from '../../lib/collaborate/collaborateRailNav';

function isOpenTodo(todo: AgentTodo) {
  const s = String(todo.status || '').toLowerCase();
  return s !== 'done' && s !== 'completed' && s !== 'cancelled';
}

type Props = {
  panel: CollaborateRailPanel;
};

function defaultMeetingWindow() {
  const start = new Date();
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
  return { start: fmt(start), end: fmt(end) };
}

export function CollaborateRailPanels({ panel }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [todos, setTodos] = useState<AgentTodo[]>([]);
  const [people, setPeople] = useState<CalendarPerson[]>([]);
  const [peopleQ, setPeopleQ] = useState('');
  const [draft, setDraft] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (panel === 'calendar') {
        const rows = await fetchDayEvents(new Date());
        setEvents(rows);
      } else if (panel === 'keep') {
        const rows = await fetchTodos({ category: 'Keep' });
        setTodos(rows);
      } else if (panel === 'notes') {
        const rows = await fetchTodos({ category: 'Notes' });
        setTodos(rows);
      } else if (panel === 'contacts') {
        const rows = await fetchPeople(peopleQ);
        setPeople(rows);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [panel, peopleQ]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (panel !== 'contacts') return;
    const t = window.setTimeout(() => void reload(), 220);
    return () => window.clearTimeout(t);
  }, [peopleQ, panel, reload]);

  const openTodos = useMemo(() => todos.filter(isOpenTodo), [todos]);

  const saveDraft = async (category: string) => {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await createTodo({ title: text, category, notes: text });
      setDraft('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const completeTodo = async (todo: AgentTodo) => {
    setSaving(true);
    try {
      await patchTodo(todo.id, { status: 'done' });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update');
    } finally {
      setSaving(false);
    }
  };

  const removeTodo = async (todo: AgentTodo) => {
    if (!window.confirm('Delete this item?')) return;
    setSaving(true);
    try {
      await deleteTodo(todo.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (todo: AgentTodo) => {
    setEditingId(todo.id);
    setEditTitle(todo.title || '');
    setEditNotes(todo.notes || todo.description || '');
  };

  const saveEdit = async () => {
    if (!editingId || saving) return;
    setSaving(true);
    try {
      await patchTodo(editingId, {
        title: editTitle.trim(),
        notes: editNotes.trim(),
      });
      setEditingId(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const createMeeting = async () => {
    const title = meetingTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      const { start, end } = defaultMeetingWindow();
      await createCalendarEvent({
        title,
        start_datetime: start,
        end_datetime: end,
        event_type: 'meeting',
      });
      setMeetingTitle('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create meeting');
    } finally {
      setSaving(false);
    }
  };

  if (loading && panel === 'calendar' && events.length === 0 && !meetingTitle) {
    return (
      <div className="lib-rail-panel-body lib-rail-panel-loading">
        <Loader2 size={22} className="lib-rail-spin" strokeWidth={1.75} />
        <span>Loading calendar…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lib-rail-panel-body">
        <p className="lib-rail-panel-error">{error}</p>
        <button type="button" className="lib-rail-open-btn" onClick={() => void reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (panel === 'calendar') {
    const now = new Date();
    return (
      <div className="lib-rail-panel-body lib-rail-panel-body--calendar">
        <div className="lib-rail-cal-head">
          <strong>{now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
        </div>
        <label className="lib-rail-note-input">
          <Clock size={16} strokeWidth={1.75} />
          <input
            type="text"
            placeholder="New meeting title…"
            value={meetingTitle}
            onChange={(e) => setMeetingTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createMeeting();
            }}
          />
        </label>
        <button
          type="button"
          className="lib-rail-open-btn primary"
          disabled={!meetingTitle.trim() || saving}
          onClick={() => void createMeeting()}
        >
          Schedule 30 min
        </button>
        {events.length === 0 ? (
          <div className="lib-rail-empty compact">
            <Clock size={32} strokeWidth={1.5} className="lib-rail-empty-icon lib-rail-empty-icon--notes" />
            <p>No events today</p>
          </div>
        ) : (
          <ul className="lib-rail-event-list">
            {events.map((ev) => {
              const start = parseEventDate(ev.start_datetime);
              return (
                <li key={ev.id}>
                  <strong>{ev.title || 'Untitled'}</strong>
                  <span>{Number.isNaN(start.getTime()) ? '—' : fmtTime(start)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  if (panel === 'keep') {
    return (
      <div className="lib-rail-panel-body">
        <label className="lib-rail-note-input">
          <Lightbulb size={16} strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Take a note…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveDraft('Keep');
            }}
          />
        </label>
        {openTodos.length === 0 ? (
          <div className="lib-rail-empty compact">
            <Lightbulb size={36} strokeWidth={1.5} className="lib-rail-empty-icon lib-rail-empty-icon--keep" />
            <p>No keep notes yet</p>
          </div>
        ) : (
          <ul className="lib-rail-note-list">
            {openTodos.map((todo) => (
              <li key={todo.id} className="lib-rail-note-row">
                {editingId === todo.id ? (
                  <div className="lib-rail-note-edit">
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    <textarea value={editNotes} rows={2} onChange={(e) => setEditNotes(e.target.value)} />
                    <div className="lib-rail-note-actions">
                      <button type="button" className="lib-rail-icon-btn" onClick={() => void saveEdit()} aria-label="Save">
                        <Check size={14} />
                      </button>
                      <button type="button" className="lib-rail-icon-btn" onClick={() => setEditingId(null)} aria-label="Cancel">
                        ×
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button type="button" className="lib-rail-note-card" onClick={() => void completeTodo(todo)}>
                      <strong>{todo.title}</strong>
                      {todo.notes && todo.notes !== todo.title ? <span>{todo.notes}</span> : null}
                    </button>
                    <div className="lib-rail-note-actions">
                      <button type="button" className="lib-rail-icon-btn" aria-label="Edit" onClick={() => startEdit(todo)}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" className="lib-rail-icon-btn danger" aria-label="Delete" onClick={() => void removeTodo(todo)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (panel === 'notes') {
    return (
      <div className="lib-rail-panel-body">
        <div className="lib-rail-panel-subhead">
          <NotebookPen size={16} strokeWidth={1.75} />
          <span>Notes & tasks</span>
        </div>
        <label className="lib-rail-note-input">
          <NotebookPen size={16} strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Add a note…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveDraft('Notes');
            }}
          />
        </label>
        {openTodos.length === 0 ? (
          <div className="lib-rail-empty compact">
            <NotebookPen size={36} strokeWidth={1.5} className="lib-rail-empty-icon lib-rail-empty-icon--notes" />
            <p>No notes yet</p>
          </div>
        ) : (
          <ul className="lib-rail-note-list">
            {openTodos.map((todo) => {
              const due = formatTodoDue(todo.due_date);
              const body = todo.description || todo.notes;
              return (
                <li key={todo.id} className="lib-rail-note-row">
                  {editingId === todo.id ? (
                    <div className="lib-rail-note-edit">
                      <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                      <textarea value={editNotes} rows={2} onChange={(e) => setEditNotes(e.target.value)} />
                      <div className="lib-rail-note-actions">
                        <button type="button" className="lib-rail-icon-btn" onClick={() => void saveEdit()} aria-label="Save">
                          <Check size={14} />
                        </button>
                        <button type="button" className="lib-rail-icon-btn" onClick={() => setEditingId(null)} aria-label="Cancel">
                          ×
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="lib-rail-note-card static">
                        <strong>{todo.title}</strong>
                        {body ? <span>{body}</span> : null}
                        {due ? (
                          <span className="lib-rail-note-meta">
                            <Clock size={12} strokeWidth={1.75} /> {due}
                          </span>
                        ) : null}
                      </div>
                      <div className="lib-rail-note-actions">
                        <button type="button" className="lib-rail-icon-btn" aria-label="Complete" onClick={() => void completeTodo(todo)}>
                          <Check size={14} />
                        </button>
                        <button type="button" className="lib-rail-icon-btn" aria-label="Edit" onClick={() => startEdit(todo)}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="lib-rail-icon-btn danger" aria-label="Delete" onClick={() => void removeTodo(todo)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="lib-rail-panel-body">
      <label className="lib-rail-note-input">
        <Users size={16} strokeWidth={1.75} />
        <input
          type="search"
          placeholder="Search people…"
          value={peopleQ}
          onChange={(e) => setPeopleQ(e.target.value)}
        />
      </label>
      {people.length === 0 ? (
        <div className="lib-rail-empty compact">
          <Users size={36} strokeWidth={1.5} className="lib-rail-empty-icon lib-rail-empty-icon--contacts" />
          <p>No people found</p>
        </div>
      ) : (
        <ul className="lib-rail-people-list">
          {people.slice(0, 12).map((p) => (
            <li key={p.email || p.id || p.display_name}>
              <strong>{p.display_name || p.email || 'Unknown'}</strong>
              {p.email ? <span>{p.email}</span> : null}
              {p.role ? <span className="lib-rail-note-meta">{p.role}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
