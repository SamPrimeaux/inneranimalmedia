import React from 'react';
import { CalendarInsightsPayload, TasksInsightsPayload, fmtMinutes } from './ops-desk-types';

type Props = {
  insights: CalendarInsightsPayload | null;
  tasksInsights: TasksInsightsPayload | null;
  insightsMode: 'week' | 'month';
  onInsightsModeChange: (mode: 'week' | 'month') => void;
  weekLabel: string;
  donutGradient: (breakdown: Record<string, number>) => string;
  remainingMins: number;
  trackingActive?: boolean;
};

export function CollaborateTasksInsights({
  insights,
  tasksInsights,
  insightsMode,
  onInsightsModeChange,
  weekLabel,
  donutGradient,
  remainingMins,
  trackingActive = false,
}: Props) {
  const breakdown = insights?.insights.breakdown_minutes || {};
  const trackedToday = tasksInsights?.today_minutes || 0;
  const byProject = tasksInsights?.by_project || [];
  const byTask = tasksInsights?.by_task || [];

  return (
    <aside className="colab-cal-right colab-tasks-insights">
      <div className="colab-cal-insights-head">
        <div>
          <div className="colab-cal-insights-date">{weekLabel}</div>
          <div className="colab-cal-insights-title">Time insights</div>
        </div>
        {trackingActive ? (
          <span className="colab-tasks-tracking-pill" title="Tracking active time while you work">
            Live
          </span>
        ) : null}
      </div>

      <div className="colab-cal-switch">
        <button type="button" className={insightsMode === 'week' ? 'active' : ''} onClick={() => onInsightsModeChange('week')}>
          Week
        </button>
        <button type="button" className={insightsMode === 'month' ? 'active' : ''} onClick={() => onInsightsModeChange('month')}>
          Month
        </button>
      </div>

      <div className="colab-tasks-insights-today">
        <span>Today tracked</span>
        <strong>{fmtMinutes(trackedToday)}</strong>
      </div>

      <div className="colab-cal-donut" style={{ background: donutGradient(breakdown) }} />

      <div className="colab-cal-breakdown">
        <div className="colab-cal-break-row">
          <span className="colab-cal-dot focus" />
          <span>Focus time</span>
          <strong>{fmtMinutes(breakdown.focus || 0)}</strong>
        </div>
        <div className="colab-cal-break-row">
          <span className="colab-cal-dot tasks" />
          <span>Tasks</span>
          <strong>{fmtMinutes(breakdown.task || 0)}</strong>
        </div>
        <div className="colab-cal-break-row">
          <span className="colab-cal-dot one" />
          <span>1:1 meetings</span>
          <strong>{fmtMinutes(breakdown.one_on_one || 0)}</strong>
        </div>
        <div className="colab-cal-break-row">
          <span className="colab-cal-dot guests" />
          <span>Meetings with 3+ guests</span>
          <strong>{fmtMinutes(breakdown.multi_guest || 0)}</strong>
        </div>
        <div className="colab-cal-break-row">
          <span className="colab-cal-dot remaining" />
          <span>Remaining work time</span>
          <strong>{fmtMinutes(remainingMins)}</strong>
        </div>
      </div>

      <div className="colab-cal-rule" />

      <div className="colab-cal-subhead">
        <h3>By project</h3>
      </div>
      {byProject.length === 0 ? (
        <p className="colab-tasks-insights-empty">No project time logged today yet.</p>
      ) : (
        byProject.slice(0, 8).map((row) => (
          <div key={row.project_id} className="colab-cal-cal-row">
            <span>{row.name || row.project_id}</span>
            <span>{fmtMinutes(row.minutes)}</span>
          </div>
        ))
      )}

      <div className="colab-cal-rule" />

      <div className="colab-cal-subhead">
        <h3>By task</h3>
      </div>
      {byTask.length === 0 ? (
        <p className="colab-tasks-insights-empty">Select a task or schedule work to see task time.</p>
      ) : (
        byTask.slice(0, 6).map((row) => (
          <div key={row.todo_id || row.title} className="colab-cal-cal-row">
            <span>{row.title}</span>
            <span>{fmtMinutes(row.minutes)}</span>
          </div>
        ))
      )}
    </aside>
  );
}
