/**
 * Slim time insights rail for /dashboard/mail — shares collaborate data lanes.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarInsightsPayload,
  TasksInsightsPayload,
  fetchInsights,
  fetchTasksInsights,
  fmtMinutes,
  postActivityHeartbeat,
  postActivityStop,
  postManualTimeEntry,
  fetchProjects,
  ProjectRow,
} from '../../../pages/launch-desk/ops-desk-types';
import '../../../pages/launch-desk/collaborate-calendar.css';

function donutGradient(breakdown: Record<string, number>) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  const stops: string[] = [];
  const colors: Record<string, string> = {
    focus: '#1a73e8',
    tasks: '#34a853',
    one_on_one: '#fbbc04',
    guests: '#ea4335',
  };
  for (const [key, mins] of Object.entries(breakdown)) {
    const pct = (mins / total) * 100;
    const color = colors[key] || '#9aa0a6';
    stops.push(`${color} ${acc}% ${acc + pct}%`);
    acc += pct;
  }
  if (!stops.length) return 'conic-gradient(#e8eaed 0% 100%)';
  return `conic-gradient(${stops.join(', ')})`;
}

export function MailTimeInsightsPanel() {
  const anchor = useMemo(() => new Date(), []);
  const [insights, setInsights] = useState<CalendarInsightsPayload | null>(null);
  const [tasksInsights, setTasksInsights] = useState<TasksInsightsPayload | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [trackingActive, setTrackingActive] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [cal, tasks, prows] = await Promise.all([
        fetchInsights(anchor),
        fetchTasksInsights(anchor),
        fetchProjects(),
      ]);
      setInsights(cal);
      setTasksInsights(tasks);
      setProjects(prows);
    } catch {
      /* non-fatal */
    }
  }, [anchor]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    const beat = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        await postActivityHeartbeat({ surface: 'mail' });
        if (!cancelled) setTrackingActive(true);
      } catch {
        if (!cancelled) setTrackingActive(false);
      }
    };
    const stop = () => {
      void postActivityStop().catch(() => {});
    };
    void beat();
    const id = window.setInterval(() => void beat(), 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void beat();
      else stop();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      stop();
    };
  }, []);

  const breakdown = insights?.insights.breakdown_minutes || {};
  const trackedToday = tasksInsights?.today_minutes || 0;
  const agentInferred = tasksInsights?.agent_inferred_minutes || 0;
  const displayToday =
    trackedToday > 0
      ? trackedToday
      : tasksInsights?.combined_today_minutes || agentInferred;
  const usageRollup = tasksInsights?.usage_rollup;
  const byProject = tasksInsights?.by_project || [];

  const weekStart = useMemo(() => {
    const d = new Date(anchor);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }, [anchor]);
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekStart]);
  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const logQuick = async () => {
    const pid = projects[0]?.id;
    if (!pid) return;
    await postManualTimeEntry({ project_id: pid, minutes: 15, note: 'Mail triage' });
    await reload();
  };

  return (
    <aside className="colab-cal-right colab-tasks-insights mail-time-insights">
      <div className="colab-cal-insights-head">
        <div>
          <div className="colab-cal-insights-date">{weekLabel}</div>
          <div className="colab-cal-insights-title">Time insights</div>
        </div>
        {trackingActive ? (
          <span className="colab-tasks-tracking-pill" title="Tracking while Mail is open">
            Live
          </span>
        ) : null}
      </div>

      <div className="colab-tasks-insights-today">
        <span>Today tracked</span>
        <strong>{fmtMinutes(displayToday)}</strong>
      </div>
      {agentInferred > 0 && trackedToday === 0 ? (
        <div className="colab-tasks-insights-lanes">
          <div className="colab-tasks-insights-lane">
            <span>Agent sessions</span>
            <strong>{fmtMinutes(agentInferred)}</strong>
          </div>
        </div>
      ) : null}
      {usageRollup?.cost_usd != null && Number(usageRollup.cost_usd) > 0 ? (
        <div className="colab-tasks-insights-usage">
          <span>AI spend today</span>
          <strong>${Number(usageRollup.cost_usd).toFixed(2)}</strong>
        </div>
      ) : null}

      <div className="colab-cal-donut" style={{ background: donutGradient(breakdown) }} />

      <div className="colab-cal-breakdown">
        <div className="colab-cal-break-row">
          <span className="colab-cal-dot focus" />
          <span>Focus time</span>
          <span>{fmtMinutes(breakdown.focus || 0)}</span>
        </div>
        <div className="colab-cal-break-row">
          <span className="colab-cal-dot tasks" />
          <span>Tasks</span>
          <span>{fmtMinutes(breakdown.tasks || 0)}</span>
        </div>
      </div>

      <div className="colab-tasks-section">
        <div className="colab-tasks-section-head">By project</div>
        {byProject.length ? (
          byProject.slice(0, 6).map((p) => (
            <div key={p.project_id} className="colab-cal-break-row">
              <span>{p.name}</span>
              <span>{fmtMinutes(p.minutes)}</span>
            </div>
          ))
        ) : (
          <p className="colab-tasks-insights-empty">No project time logged today yet.</p>
        )}
      </div>

      <button type="button" className="colab-cal-outline-btn colab-tasks-manual-time-btn" onClick={() => void logQuick()}>
        Log 15m mail triage
      </button>
    </aside>
  );
}
