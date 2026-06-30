import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Lightbulb, Loader2, NotebookPen, Users } from 'lucide-react';
import {
  createTodo,
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
import { collaborateDeepLink, type CollaborateRailPanel } from '../../lib/collaborate/collaborateRailNav';

function isOpenTodo(todo: AgentTodo) {
  const s = String(todo.status || '').toLowerCase();
  return s !== 'done' && s !== 'completed' && s !== 'cancelled';
}

function isKeepTodo(todo: AgentTodo) {
  const cat = String(todo.category || '').toLowerCase();
  return cat === 'keep' || String(todo.project_key || '').toLowerCase() === 'keep';
}

type Props = {
  panel: CollaborateRailPanel;
};

export function CollaborateRailPanels({ panel }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [todos, setTodos] = useState<AgentTodo[]>([]);
  const [people, setPeople] = useState<CalendarPerson[]>([]);
  const [peopleQ, setPeopleQ] = useState('');
  const [keepDraft, setKeepDraft] = useState('');
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

  const keepNotes = useMemo(() => todos.filter(isOpenTodo), [todos]);

  const taskNotes = useMemo(() => todos.filter(isOpenTodo), [todos]);

  const saveKeepNote = async () => {
    const text = keepDraft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await createTodo({ title: text, category: 'Keep', notes: text });
      setKeepDraft('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save note');
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
      setError(e instanceof Error ? e.message : 'Could not update task');
    } finally {
      setSaving(false);
    }
  };

  const openFull = () => navigate(collaborateDeepLink(panel));

  if (loading && panel === 'calendar' && events.length === 0) {
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
          <button type="button" className="lib-rail-open-btn lib-rail-open-btn--inline" onClick={openFull}>
            Open calendar
          </button>
        </div>
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
            value={keepDraft}
            onChange={(e) => setKeepDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveKeepNote();
            }}
          />
        </label>
        {keepNotes.length === 0 ? (
          <div className="lib-rail-empty compact">
            <Lightbulb size={36} strokeWidth={1.5} className="lib-rail-empty-icon lib-rail-empty-icon--keep" />
            <p>No keep notes yet</p>
          </div>
        ) : (
          <ul className="lib-rail-note-list">
            {keepNotes.map((todo) => (
              <li key={todo.id}>
                <button type="button" className="lib-rail-note-card" onClick={() => void completeTodo(todo)}>
                  <strong>{todo.title}</strong>
                  {todo.notes && todo.notes !== todo.title ? <span>{todo.notes}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="lib-rail-open-btn" onClick={openFull}>
          Open in Collaborate
        </button>
      </div>
    );
  }

  if (panel === 'notes') {
    return (
      <div className="lib-rail-panel-body">
        <div className="lib-rail-panel-subhead">
          <NotebookPen size={16} strokeWidth={1.75} />
          <span>Notes</span>
        </div>
        <label className="lib-rail-note-input">
          <NotebookPen size={16} strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Add a note…"
            value={keepDraft}
            onChange={(e) => setKeepDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void (async () => {
                  const text = keepDraft.trim();
                  if (!text || saving) return;
                  setSaving(true);
                  try {
                    await createTodo({ title: text, category: 'Notes', notes: text });
                    setKeepDraft('');
                    await reload();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not save note');
                  } finally {
                    setSaving(false);
                  }
                })();
              }
            }}
          />
        </label>
        {taskNotes.length === 0 ? (
          <div className="lib-rail-empty compact">
            <NotebookPen size={36} strokeWidth={1.5} className="lib-rail-empty-icon lib-rail-empty-icon--notes" />
            <p>No tasks yet</p>
          </div>
        ) : (
          <ul className="lib-rail-note-list">
            {taskNotes.map((todo) => {
              const due = formatTodoDue(todo.due_date);
              const body = todo.description || todo.notes;
              return (
                <li key={todo.id}>
                  <div className="lib-rail-note-card static">
                    <strong>{todo.title}</strong>
                    {body ? <span>{body}</span> : null}
                    {due ? (
                      <span className="lib-rail-note-meta">
                        <Clock size={12} strokeWidth={1.75} /> {due}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <button type="button" className="lib-rail-open-btn" onClick={openFull}>
          Open tasks
        </button>
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
      <button type="button" className="lib-rail-open-btn" onClick={openFull}>
        Open in Collaborate
      </button>
    </div>
  );
}
