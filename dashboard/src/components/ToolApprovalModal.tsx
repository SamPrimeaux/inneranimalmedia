import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

type Approval = {
  id: string;
  tool_name: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  preview_sql?: string;
  preview_command?: string;
  server_display_name?: string;
  is_mcp_server: boolean;
  queue_count: number;
};

const BACKOFF_MS = [5000, 15000, 45000];
const RECENT_PENDING_MS = 120_000;

type ToolApprovalModalProps = {
  workspaceId?: string | null;
  agentRunId?: string | null;
  toolExecutionActive?: boolean;
};

function shouldPollApprovals(opts: {
  pathname: string;
  hasVisibleApproval: boolean;
  workspaceId: string;
  agentRunId: string | null;
  toolExecutionActive: boolean;
  recentPending: boolean;
}): boolean {
  const { pathname, hasVisibleApproval, workspaceId, agentRunId, toolExecutionActive, recentPending } = opts;
  if (!workspaceId) return false;
  if (hasVisibleApproval) return true;
  if (toolExecutionActive) return true;
  if (agentRunId) return true;
  if (recentPending) return true;
  const p = pathname.toLowerCase();
  return p.includes('/dashboard/agent');
}

export function ToolApprovalModal({
  workspaceId = null,
  agentRunId = null,
  toolExecutionActive = false,
}: ToolApprovalModalProps) {
  const location = useLocation();
  const [approval, setApproval] = useState<Approval | null>(null);
  const approvalRef = useRef<Approval | null>(null);
  approvalRef.current = approval;

  const [expanded, setExpanded] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [pollStopped401, setPollStopped401] = useState(false);

  const backoffRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPendingSignalRef = useRef(0);

  const ws = typeof workspaceId === 'string' ? workspaceId.trim() : '';

  useEffect(() => {
    let cancelled = false;

    const clearTimer = () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    async function run() {
      if (cancelled) return;
      if (pollStopped401) return;
      if (!ws) {
        kick(30_000);
        return;
      }
      if (document.hidden) {
        kick(8000);
        return;
      }
      const recentPending = Date.now() - lastPendingSignalRef.current < RECENT_PENDING_MS;
      if (
        !shouldPollApprovals({
          pathname: location.pathname,
          hasVisibleApproval: approvalRef.current != null,
          workspaceId: ws,
          agentRunId: agentRunId ?? null,
          toolExecutionActive,
          recentPending,
        })
      ) {
        kick(45_000);
        return;
      }
      try {
        const runQ = agentRunId?.trim() ? `&run_id=${encodeURIComponent(agentRunId.trim())}` : '';
        const r = await fetch(
          `/api/agent/approval/pending?workspace_id=${encodeURIComponent(ws)}${runQ}`,
          { credentials: 'same-origin' },
        );
        if (r.status === 401) {
          setPollStopped401(true);
          return;
        }
        if (r.status === 400) {
          kick(20_000);
          return;
        }
        if (!r.ok) {
          const i = Math.min(backoffRef.current, BACKOFF_MS.length - 1);
          backoffRef.current = Math.min(backoffRef.current + 1, BACKOFF_MS.length - 1);
          kick(BACKOFF_MS[i]);
          return;
        }
        backoffRef.current = 0;
        const d = (await r.json()) as { approval?: Approval | null; pending_count?: number };
        const pc = typeof d.pending_count === 'number' ? d.pending_count : d.approval?.queue_count ?? 0;
        if (pc > 0) lastPendingSignalRef.current = Date.now();
        if (!cancelled) setApproval(d.approval ?? null);
        kick(4000);
      } catch {
        const i = Math.min(backoffRef.current, BACKOFF_MS.length - 1);
        backoffRef.current = Math.min(backoffRef.current + 1, BACKOFF_MS.length - 1);
        kick(BACKOFF_MS[i]);
      }
    }

    function kick(delay: number) {
      clearTimer();
      timerRef.current = window.setTimeout(run, delay);
    }

    const onVis = () => {
      if (!document.hidden && !pollStopped401) kick(4000);
    };
    document.addEventListener('visibilitychange', onVis);
    backoffRef.current = 0;
    kick(4000);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      clearTimer();
    };
  }, [location.pathname, pollStopped401, ws, agentRunId, toolExecutionActive]);

  if (!approval) return null;

  const isHighRisk = approval.risk_level === 'high' || approval.risk_level === 'critical';
  const canExecute = !isHighRisk || confirmText === 'CONFIRM';
  const preview = approval.preview_sql || approval.preview_command || '';

  async function respond(action: 'approved' | 'denied') {
    setLoading(true);
    await fetch(`/api/agent/approval/${approval!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: action }),
    });
    setApproval(null);
    setConfirmText('');
    setLoading(false);
  }

  return (
    <div
      style={{
        backdropFilter: 'blur(12px)',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        padding: '14px 16px',
        maxWidth: '300px',
        width: '100%',
        marginTop: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <i className="ti ti-plug" aria-hidden="true" style={{ fontSize: 16, color: 'var(--color-text-secondary)' }} />
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', flex: 1 }}>
          {approval.server_display_name ?? 'Agent Sam'}
        </span>
        {approval.queue_count > 1 && (
          <span
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '999px',
              fontSize: 10,
              padding: '2px 6px',
            }}
          >
            +{approval.queue_count - 1} pending
          </span>
        )}
      </div>

      <p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 6px', color: 'var(--color-text-primary)' }}>
        {approval.tool_name.replace(/_/g, ' ')}?
      </p>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
        {approval.description}
      </p>

      <span
        style={{
          borderRadius: '999px',
          fontSize: 10,
          padding: '2px 8px',
          fontWeight: 600,
          ...(approval.risk_level === 'high' || approval.risk_level === 'critical'
            ? {
                background: 'rgba(239,68,68,0.15)',
                color: '#f87171',
                border: '1px solid rgba(239,68,68,0.3)',
              }
            : approval.risk_level === 'medium'
              ? {
                  background: 'rgba(234,179,8,0.15)',
                  color: '#fbbf24',
                  border: '1px solid rgba(234,179,8,0.3)',
                }
              : {
                  background: 'rgba(34,197,94,0.15)',
                  color: '#4ade80',
                  border: '1px solid rgba(34,197,94,0.3)',
                }),
        }}
      >
        {approval.risk_level.toUpperCase()}
      </span>

      {preview && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setExpanded((e) => !e)}
            style={{
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Preview {expanded ? '▲' : '▼'}
          </button>
          {expanded && (
            <pre
              style={{
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                maxHeight: '64px',
                overflow: 'hidden',
                padding: '8px 10px',
                marginTop: 6,
                color: 'var(--color-text-primary)',
              }}
            >
              {preview.split('\n').slice(0, 8).join('\n')}
            </pre>
          )}
        </div>
      )}

      {isHighRisk && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 12,
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 8,
            padding: '6px 10px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span style={{ color: '#4ade80', fontFamily: 'var(--font-mono)', fontSize: 12 }}>$</span>
          <input
            placeholder="type CONFIRM to enable"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              color: '#e2e8f0',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              flex: 1,
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          onClick={() => respond('denied')}
          disabled={loading}
          style={{
            flex: 1,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--color-text-secondary)',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          Deny
        </button>
        <button
          onClick={() => respond('approved')}
          disabled={!canExecute || loading}
          style={{
            flex: 1,
            ...(isHighRisk
              ? {
                  background: 'rgba(239,68,68,0.2)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#f87171',
                }
              : {
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#e2e8f0',
                }),
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            cursor: canExecute && !loading ? 'pointer' : 'not-allowed',
            opacity: canExecute && !loading ? 1 : 0.4,
          }}
        >
          {isHighRisk ? 'Execute (high risk)' : 'Execute'}
        </button>
      </div>

      {approval.is_mcp_server && (
        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 10, marginBottom: 0 }}>
          No PII sent to external tools.
        </p>
      )}
    </div>
  );
}
