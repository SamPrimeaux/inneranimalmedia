import { useMemo } from 'react';
import { CalendarPlus, ChevronRight } from 'lucide-react';
import { AgentTodo, ProjectRow, formatTodoDue, todoListName } from './ops-desk-types';

function isOpenTodo(todo: AgentTodo) {
  const s = String(todo.status || '').toLowerCase();
  return s !== 'done' && s !== 'completed' && s !== 'cancelled';
}

function dueSortKey(todo: AgentTodo) {
  const raw = todo.due_date?.trim();
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

type Props = {
  todos: AgentTodo[];
  projects: ProjectRow[];
  onSelectTask: (id: string) => void;
  onScheduleTask: (todo: AgentTodo) => void | Promise<void>;
  onOpenTasksView: () => void;
  onClose: () => void;
};

export function CollaborateActiveTasksPanel({
  todos,
  projects,
  onSelectTask,
  onScheduleTask,
  onOpenTasksView,
  onClose,
}: Props) {
  const projectNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name || p.id);
    return map;
  }, [projects]);

  const openTodos = useMemo(() => {
    const rows = todos.filter(isOpenTodo);
    rows.sort((a, b) => {
      const dueDiff = dueSortKey(a) - dueSortKey(b);
      if (dueDiff !== 0) return dueDiff;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
    return rows;
  }, [todos]);

  return (
    <aside className="colab-cal-right">
      <div className="colab-cal-insights-head">
        <div>
          <div className="colab-cal-insights-date">{openTodos.length} open</div>
          <div className="colab-cal-insights-title">Active tasks</div>
        </div>
        <button type="button" className="colab-cal-icon-btn colab-cal-insights-close" aria-label="Close active tasks" onClick={onClose}>
          ×
        </button>
      </div>

      <p className="colab-cal-active-tasks-lead">
        Pending work across your lists and projects. Open a task for details or schedule it on the calendar.
      </p>

      {openTodos.length === 0 ? (
        <div className="colab-cal-active-tasks-empty">
          <p>No open tasks right now.</p>
          <button type="button" className="colab-cal-outline-btn" onClick={onOpenTasksView}>
            Go to Tasks
          </button>
        </div>
      ) : (
        <ul className="colab-cal-active-tasks-list">
          {openTodos.map((todo) => {
            const due = formatTodoDue(todo.due_date);
            const list = todoListName(todo);
            const projectId = todo.project_id || todo.project_key || null;
            const projectName = projectId ? projectNames.get(projectId) : null;
            return (
              <li key={todo.id} className="colab-cal-active-task-row">
                <button type="button" className="colab-cal-active-task-main" onClick={() => onSelectTask(todo.id)}>
                  <span className="colab-cal-active-task-title">{todo.title || 'Untitled task'}</span>
                  <span className="colab-cal-active-task-meta">
                    {[projectName, list !== 'My Tasks' ? list : null, due ? `Due ${due}` : null].filter(Boolean).join(' · ')}
                  </span>
                </button>
                <div className="colab-cal-active-task-actions">
                  <button
                    type="button"
                    className="colab-cal-icon-btn"
                    title="Schedule on calendar"
                    aria-label={`Schedule ${todo.title || 'task'} on calendar`}
                    onClick={() => void onScheduleTask(todo)}
                  >
                    <CalendarPlus size={16} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="colab-cal-icon-btn"
                    title="Open in Tasks"
                    aria-label={`Open ${todo.title || 'task'} in Tasks`}
                    onClick={() => onSelectTask(todo.id)}
                  >
                    <ChevronRight size={16} strokeWidth={1.75} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {openTodos.length > 0 ? (
        <button type="button" className="colab-cal-outline-btn colab-cal-active-tasks-all" onClick={onOpenTasksView}>
          View all in Tasks
        </button>
      ) : null}
    </aside>
  );
}
