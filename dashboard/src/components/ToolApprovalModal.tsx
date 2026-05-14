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
  return pathname.toLowerCase().includes('/dashboard/agent');
}

// Theme-aware CSS variable lookup.
// Walks the IAM theme var chain: mg (moon-glass) → solar → color-* → last-resort.
// Add new themes here by prepending their var names — no hardcoded hex anywhere.
function tv(...chain: string[]): string {
  // Build nested var() chain: var(--a, var(--b, var(--c, fallback)))
  return chain.reduceRight((acc, cur) =>
    cur.startsWith('#') || cur.startsWith('rgba') || cur.startsWith('rgb')
      ? acc ? `var(${acc}, ${cur})` : cur  // last item is the raw fallback
      : acc ? `var(${cur}, ${acc})` : `var(${cur})`
  );
}

// Semantic tokens — resolved at paint time from :root CSS vars injected by cms_themes
const T = {
  shell:        tv('--mg-shell-bg',       '--solar-bg-app',      '--color-bg-app',      '--bg-app',      '#0f1923'),
  panel:        tv('--mg-panel',          '--solar-bg-panel',    '--color-bg-panel',    '--bg-panel',    '#1a2332'),
  border:       tv('--mg-border',         '--solar-border',      '--color-border',      '--border',      '#2a3547'),
  textPrimary:  tv('--mg-text',           '--solar-text',        '--color-text-primary','--text-main',   '#f0f4f8'),
  textSecond:   tv('--mg-text-secondary', '--solar-text-muted',  '--color-text-secondary','--text-muted','#94a3b8'),
  textThird:    tv('--color-text-tertiary','--text-subtle',      '#64748b'),
  accent:       tv('--mg-accent',         '--solar-blue',        '--color-accent',      '--accent',      '#4f8cff'),
  mono:         tv('--font-mono',         'monospace'),
  // Risk — semantic, not decorative. These follow the theme's danger/warn/success tokens.
  danger:       tv('--color-danger',      '--solar-red',         '#f87171'),
  dangerBg:     tv('--color-danger-bg',   'rgba(239,68,68,0.15)'),
  dangerBorder: tv('--color-danger-border','rgba(239,68,68,0.3)'),
  warn:         tv('--color-warn',        '--solar-yellow',      '#fbbf24'),
  warnBg:       tv('--color-warn-bg',     'rgba(234,179,8,0.15)'),
  warnBorder:   tv('--color-warn-border', 'rgba(234,179,8,0.3)'),
  ok:           tv('--color-success',     '--solar-green',       '#4ade80'),
  okBg:         tv('--color-success-bg',  'rgba(34,197,94,0.12)'),
  okBorder:     tv('--color-success-border','rgba(34,197,94,0.3)'),
  indigo:       tv('--color-indigo',      '--solar-indigo',      '#a5b4fc'),
  indigoBg:     tv('--color-indigo-bg',   'rgba(99,102,241,0.1)'),
  indigoBorder: tv('--color-indigo-border','rgba(99,102,241,0.25)'),
} as const;

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
  const [loading, setLoading] = useState(false);
  const [allowlistLoading, setAllowlistLoading] = useState(false);
  const [allowlistDone, setAllowlistDone] = useState(false);
  const [pollStopped401, setPollStopped401] = useState(false);

  const backoffRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPendingSignalRef = useRef(0);

  const ws = typeof workspaceId === 'string' ? workspaceId.trim() : '';

  useEffect(() => {
    let cancelled = false;
    const clearTimer = () => {
      if (timerRef.current != null) { clearTimeout(timerRef.current); timerRef.current = null; }
    };

    async function run() {
      if (cancelled || pollStopped401) return;
      if (!ws) { kick(30_000); return; }
      if (document.hidden) { kick(8000); return; }
      const recentPending = Date.now() - lastPendingSignalRef.current < RECENT_PENDING_MS;
      if (!shouldPollApprovals({
        pathname: location.pathname,
        hasVisibleApproval: approvalRef.current != null,
        workspaceId: ws,
        agentRunId: agentRunId ?? null,
        toolExecutionActive,
        recentPending,
      })) { kick(45_000); return; }
      try {
        const runQ = agentRunId?.trim() ? `&run_id=${encodeURIComponent(agentRunId.trim())}` : '';
        const r = await fetch(
          `/api/agent/approval/pending?workspace_id=${encodeURIComponent(ws)}${runQ}`,
          { credentials: 'same-origin' },
        );
        if (r.status === 401) { setPollStopped401(true); return; }
        if (r.status === 400) { kick(20_000); return; }
        if (!r.ok) {
          const i = Math.min(backoffRef.current, BACKOFF_MS.length - 1);
          backoffRef.current = Math.min(backoffRef.current + 1, BACKOFF_MS.length - 1);
          kick(BACKOFF_MS[i]); return;
        }
        backoffRef.current = 0;
        const d = (await r.json()) as { approval?: Approval | null; pending_count?: number };
        const pc = typeof d.pending_count === 'number' ? d.pending_count : d.approval?.queue_count ?? 0;
        if (pc > 0) lastPendingSignalRef.current = Date.now();
        if (!cancelled) { setApproval(d.approval ?? null); setAllowlistDone(false); }
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

    const onVis = () => { if (!document.hidden && !pollStopped401) kick(4000); };
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
  const preview = approval.preview_sql || approval.preview_command || '';
  const cmdLabel = preview.length > 46 ? preview.slice(0, 44) + '…' : preview;

  const risk = isHighRisk
    ? { color: T.danger,  bg: T.dangerBg,  border: T.dangerBorder }
    : approval.risk_level === 'medium'
      ? { color: T.warn,  bg: T.warnBg,    border: T.warnBorder }
      : { color: T.ok,    bg: T.okBg,      border: T.okBorder };

  async function respond(action: 'approved' | 'denied') {
    setLoading(true);
    await fetch(`/api/agent/approval/${approval!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ status: action }),
    });
    setApproval(null);
    setLoading(false);
  }

  async function addToAllowlistAndRun() {
    if (!preview) { respond('approved'); return; }
    setAllowlistLoading(true);
    try {
      await fetch('/api/agent/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ command: preview, workspace_id: ws }),
      });
      setAllowlistDone(true);
    } catch { /* fire-and-forget — still run */ }
    setAllowlistLoading(false);
    respond('approved');
  }

  return (
    <div style={{
      backdropFilter: 'blur(12px)',
      background: T.panel,
      border: `1px solid ${T.border}`,
      borderRadius: '16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      padding: '14px 16px',
      maxWidth: '300px',
      width: '100%',
      marginTop: '1rem',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <i className="ti ti-plug" aria-hidden="true" style={{ fontSize: 16, color: T.textSecond }} />
        <span style={{ fontSize: 13, color: T.textSecond, flex: 1 }}>
          {approval.server_display_name ?? 'Agent Sam'}
        </span>
        {approval.queue_count > 1 && (
          <span style={{
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${T.border}`,
            borderRadius: '999px',
            fontSize: 10,
            padding: '2px 6px',
            color: T.textSecond,
          }}>
            +{approval.queue_count - 1} pending
          </span>
        )}
      </div>

      {/* Tool name */}
      <p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 6px', color: T.textPrimary }}>
        {approval.tool_name.replace(/_/g, ' ')}?
      </p>

      {/* Description */}
      <p style={{ fontSize: 13, color: T.textSecond, margin: '0 0 10px', lineHeight: 1.5 }}>
        {approval.description}
      </p>

      {/* Risk badge */}
      <span style={{
        borderRadius: '999px',
        fontSize: 10,
        padding: '2px 8px',
        fontWeight: 600,
        background: risk.bg,
        color: risk.color,
        border: `1px solid ${risk.border}`,
      }}>
        {approval.risk_level.toUpperCase()}
      </span>

      {/* Expandable preview */}
      {preview && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ fontSize: 12, color: T.textThird, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Preview {expanded ? '▲' : '▼'}
          </button>
          {expanded && (
            <pre style={{
              background: T.shell,
              border: `1px solid ${T.border}`,
              borderRadius: '8px',
              fontSize: 11,
              fontFamily: T.mono,
              maxHeight: '80px',
              overflow: 'auto',
              padding: '8px 10px',
              marginTop: 6,
              color: T.textPrimary,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {preview}
            </pre>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>

        {/* ▶ Run */}
        <button
          onClick={() => respond('approved')}
          disabled={loading}
          style={{
            width: '100%',
            background: risk.bg,
            border: `1px solid ${risk.border}`,
            color: risk.color,
            borderRadius: 8,
            padding: '7px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            letterSpacing: '0.02em',
          }}
        >
          <span style={{ fontSize: 10 }}>▶</span> Run
        </button>

        {/* + Allow always */}
        {preview && (
          <button
            onClick={addToAllowlistAndRun}
            disabled={allowlistLoading || loading}
            title={`Always allow: ${preview}`}
            style={{
              width: '100%',
              background: allowlistDone ? T.indigoBg : 'transparent',
              border: `1px solid ${T.indigoBorder}`,
              color: T.indigo,
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 11,
              cursor: (allowlistLoading || loading) ? 'not-allowed' : 'pointer',
              opacity: (allowlistLoading || loading) ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              overflow: 'hidden',
            }}
          >
            <span style={{ flexShrink: 0 }}>{allowlistDone ? '✓' : '+'}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {allowlistDone ? 'Added to allowlist' : `Allow always: ${cmdLabel}`}
            </span>
          </button>
        )}

        {/* Deny */}
        <button
          onClick={() => respond('denied')}
          disabled={loading}
          style={{
            width: '100%',
            background: 'transparent',
            border: `1px solid ${T.border}`,
            color: T.textThird,
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          Deny
        </button>
      </div>

      {approval.is_mcp_server && (
        <p style={{ fontSize: 11, color: T.textThird, marginTop: 10, marginBottom: 0 }}>
          No PII sent to external tools.
        </p>
      )}
    </div>
  );
}