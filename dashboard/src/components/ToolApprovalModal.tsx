import { useState, useEffect } from 'react';

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

export function ToolApprovalModal() {
  const [approval, setApproval] = useState<Approval | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const poll = setInterval(async () => {
      const r = await fetch('/api/agent/approval/pending');
      if (r.ok) { const d = await r.json(); setApproval(d.approval ?? null); }
    }, 3000);
    return () => clearInterval(poll);
  }, []);

  if (!approval) return null;

  const isHighRisk = approval.risk_level === 'high' || approval.risk_level === 'critical';
  const canExecute = !isHighRisk || confirmText === 'CONFIRM';
  const preview = approval.preview_sql || approval.preview_command || '';

  async function respond(action: 'approved' | 'denied') {
    setLoading(true);
    await fetch(`/api/agent/approval/${approval!.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: action }) });
    setApproval(null);
    setConfirmText('');
    setLoading(false);
  }

  const riskColor: Record<string, string> = {
    low: 'var(--color-text-success)', medium: 'var(--color-text-warning)',
    high: 'var(--color-text-danger)', critical: 'var(--color-text-danger)',
  };
  const riskBg: Record<string, string> = {
    low: 'var(--color-background-success)', medium: 'var(--color-background-warning)',
    high: 'var(--color-background-danger)', critical: 'var(--color-background-danger)',
  };

  return (
    <div style={{ border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-lg)', padding: '1rem 1.25rem', background: 'var(--color-background-primary)', marginTop: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <i className="ti ti-plug" aria-hidden="true" style={{ fontSize: 16, color: 'var(--color-text-secondary)' }} />
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', flex: 1 }}>{approval.server_display_name ?? 'Agent Sam'}</span>
        {approval.queue_count > 1 && <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', color: 'var(--color-text-tertiary)' }}>+{approval.queue_count - 1} pending</span>}
      </div>

      <p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 6px', color: 'var(--color-text-primary)' }}>{approval.tool_name.replace(/_/g, ' ')}?</p>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>{approval.description}</p>

      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--border-radius-md)', background: riskBg[approval.risk_level], color: riskColor[approval.risk_level], fontWeight: 500 }}>{approval.risk_level.toUpperCase()}</span>

      {preview && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setExpanded(e => !e)} style={{ fontSize: 12, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Preview {expanded ? '▲' : '▼'}
          </button>
          {expanded && <pre style={{ fontSize: 11, fontFamily: 'var(--font-mono)', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: 10, marginTop: 6, overflowX: 'auto', maxHeight: 160, color: 'var(--color-text-primary)' }}>{preview.split('\n').slice(0, 8).join('\n')}</pre>}
        </div>
      )}

      {isHighRisk && (
        <div style={{ marginTop: 12 }}>
          <input placeholder='type CONFIRM to enable' value={confirmText} onChange={e => setConfirmText(e.target.value)} style={{ width: '100%', fontSize: 13 }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={() => respond('denied')} disabled={loading} style={{ flex: 1, fontSize: 13 }}>Deny</button>
        <button onClick={() => respond('approved')} disabled={!canExecute || loading}
          style={{ flex: 1, fontSize: 13, background: isHighRisk ? 'var(--color-background-danger)' : 'var(--color-text-primary)', color: isHighRisk ? 'var(--color-text-danger)' : 'var(--color-background-primary)', border: 'none', borderRadius: 'var(--border-radius-md)', cursor: canExecute ? 'pointer' : 'not-allowed', opacity: canExecute ? 1 : 0.4 }}>
          {isHighRisk ? 'Execute (high risk)' : 'Execute'}
        </button>
      </div>

      {approval.is_mcp_server && <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 10, marginBottom: 0 }}>No PII sent to external tools.</p>}
    </div>
  );
}

