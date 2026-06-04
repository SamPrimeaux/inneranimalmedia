/**
 * Plan workbench — pinned plan sidebar with dynamic loading states + Monaco open.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, FileText, Play, RefreshCw, XCircle } from 'lucide-react';
import { usePlanTasksRealtime, type PlanTask } from '../../../src/hooks/usePlanTasksRealtime';
import { ChatPresenceIcon } from '../../../features/mode-presence/ChatPresenceIcon';
import type { ActiveFile } from '../../types';

export type PlanSummary = {
  id: string;
  title: string;
  status: string;
  tasks_total?: number | null;
  tasks_done?: number | null;
  tasks_blocked?: number | null;
  updated_at?: number | null;
};

export type PlanWorkbenchPanelProps = {
  workspaceId: string | null;
  activePlanId: string | null;
  onActivePlanChange?: (planId: string | null) => void;
  onOpenInEditor?: (file: ActiveFile) => void;
  onRunPlan?: (planId: string) => void;
  runPlanBusy?: boolean;
};

function mapTaskStatus(status: string): 'todo' | 'running' | 'done' | 'blocked' {
  if (status === 'in_progress') return 'running';
  if (status === 'done') return 'done';
  if (status === 'blocked') return 'blocked';
  return 'todo';
}

function presenceForPlan(loading: boolean, tasks: PlanTask[], runBusy: boolean) {
  if (runBusy) return 'task_stack' as const;
  if (loading) return 'mapping' as const;
  if (tasks.some((t) => t.status === 'in_progress')) return 'task_stack' as const;
  if (tasks.some((t) => t.status === 'blocked')) return 'failed' as const;
  if (tasks.length && tasks.every((t) => t.status === 'done')) return 'handoff_ready' as const;
  return 'mapping' as const;
}

export function PlanWorkbenchPanel({
  workspaceId,
  activePlanId,
  onActivePlanChange,
  onOpenInEditor,
  onRunPlan,
  runPlanBusy = false,
}: PlanWorkbenchPanelProps) {
  const { tasks, loading, error, refetch } = usePlanTasksRealtime(activePlanId);
  const [history, setHistory] = useState<PlanSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [planMarkdown, setPlanMarkdown] = useState<string | null>(null);
  const [markdownLoading, setMarkdownLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!workspaceId) return;
    setHistoryLoading(true);
    try {
      const q = new URLSearchParams({ workspace_id: workspaceId, limit: '12' });
      const r = await fetch(`/api/agentsam/plans?${q}`, { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { plans?: PlanSummary[] };
      setHistory(data.plans ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, activePlanId]);

  useEffect(() => {
    if (!activePlanId) {
      setPlanMarkdown(null);
      return;
    }
    let cancelled = false;
    setMarkdownLoading(true);
    void (async () => {
      try {
        const r = await fetch(`/api/agentsam/plans/${encodeURIComponent(activePlanId)}/tasks`, {
          credentials: 'same-origin',
        });
        if (!r.ok) throw new Error('tasks fetch failed');
        const data = (await r.json()) as { tasks?: PlanTask[] };
        const lines = (data.tasks ?? []).map((t, i) => {
          const mark =
            t.status === 'done' ? '[x]' : t.status === 'in_progress' ? '[>]' : t.status === 'blocked' ? '[!]' : '[ ]';
          return `${mark} ${i + 1}. ${t.title}${t.description ? ` — ${t.description}` : ''}`;
        });
        if (!cancelled) {
          setPlanMarkdown(`## Task List\n\n${lines.join('\n')}\n`);
        }
      } catch {
        if (!cancelled) setPlanMarkdown(null);
      } finally {
        if (!cancelled) setMarkdownLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activePlanId, tasks]);

  const progress = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [tasks]);

  const presence = presenceForPlan(loading, tasks, runPlanBusy);

  const patchPlanStatus = async (planId: string, status: 'abandoned' | 'complete') => {
    await fetch(`/api/agentsam/plans/${encodeURIComponent(planId)}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await loadHistory();
    if (status === 'abandoned' && planId === activePlanId) {
      onActivePlanChange?.(null);
    }
  };

  const openMarkdownInMonaco = () => {
    if (!planMarkdown || !activePlanId || !onOpenInEditor) return;
    onOpenInEditor({
      name: `plan-${activePlanId.slice(0, 12)}.md`,
      content: planMarkdown,
      originalContent: planMarkdown,
      language: 'markdown',
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--scene-bg)]/90 border-l border-[var(--dashboard-border)]">
      <div className="px-3 py-2.5 border-b border-[var(--dashboard-border)] flex items-center gap-2">
        <ChatPresenceIcon mode="plan" state={presence} size={18} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-[var(--dashboard-text)] truncate">Plan workbench</p>
          <p className="text-[10px] text-[var(--dashboard-muted)]">
            {activePlanId ? activePlanId.slice(0, 20) : 'No active plan'}
          </p>
        </div>
        <button
          type="button"
          title="Refresh"
          onClick={() => {
            void refetch();
            void loadHistory();
          }}
          className="p-1.5 rounded-md text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)]"
        >
          <RefreshCw size={14} className={loading || historyLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {activePlanId ? (
        <div className="px-3 py-2 border-b border-[var(--dashboard-border)]/60 space-y-2">
          <div className="h-1.5 rounded-full bg-[var(--dashboard-border)]/40 overflow-hidden">
            <div
              className="h-full bg-[var(--solar-cyan)] transition-all duration-500"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <p className="text-[10px] text-[var(--dashboard-muted)]">
            {progress.done}/{progress.total} tasks
            {error ? ` · ${error}` : ''}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {onRunPlan ? (
              <button
                type="button"
                disabled={runPlanBusy}
                onClick={() => onRunPlan(activePlanId)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-[var(--solar-cyan)] text-[var(--solar-base03)] disabled:opacity-45"
              >
                <Play size={12} className="fill-current" />
                Run
              </button>
            ) : null}
            {onOpenInEditor && planMarkdown ? (
              <button
                type="button"
                disabled={markdownLoading}
                onClick={openMarkdownInMonaco}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-[var(--dashboard-border)] text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)]"
              >
                <FileText size={12} />
                Open in editor
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void patchPlanStatus(activePlanId, 'complete')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-[var(--dashboard-border)] text-[var(--dashboard-muted)]"
            >
              <Archive size={12} />
              Archive
            </button>
            <button
              type="button"
              onClick={() => void patchPlanStatus(activePlanId, 'abandoned')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-[var(--dashboard-border)] text-red-400/90"
            >
              <XCircle size={12} />
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
        {loading && !tasks.length ? (
          <div className="flex items-center gap-2 px-2 py-3 text-[11px] text-[var(--dashboard-muted)]">
            <ChatPresenceIcon mode="plan" state="mapping" size={14} />
            Loading tasks…
          </div>
        ) : null}
        {tasks.map((t) => {
          const st = mapTaskStatus(t.status);
          return (
            <div
              key={t.id}
              className="flex items-start gap-2 px-2 py-1.5 rounded-lg text-[11px] text-[var(--dashboard-text)]"
            >
              <ChatPresenceIcon
                mode="plan"
                state={
                  st === 'running'
                    ? 'task_stack'
                    : st === 'done'
                      ? 'handoff_ready'
                      : st === 'blocked'
                        ? 'failed'
                        : 'mapping'
                }
                size={12}
                className="shrink-0 mt-0.5"
              />
              <span className="min-w-0 flex-1 break-words">{t.title}</span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-[var(--dashboard-border)] px-2 py-2 max-h-[40%] overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--dashboard-muted)] px-1 mb-1">
          Recent plans
        </p>
        {historyLoading ? (
          <div className="flex items-center gap-2 px-2 py-1 text-[10px] text-[var(--dashboard-muted)]">
            <ChatPresenceIcon mode="plan" state="mapping" size={12} />
            Loading history…
          </div>
        ) : null}
        {history.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onActivePlanChange?.(p.id)}
            className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] mb-0.5 ${
              p.id === activePlanId
                ? 'bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)]'
                : 'text-[var(--dashboard-muted)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <span className="block truncate font-medium">{p.title || p.id}</span>
            <span className="text-[10px] opacity-80">
              {p.status} · {p.tasks_done ?? 0}/{p.tasks_total ?? '?'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
