import React, { useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { McpWorkflowListItem } from '../workflowTypes';

type Props = {
  items: McpWorkflowListItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSyncCatalog: () => void;
  onSelectByKey: (workflowKey: string) => void;
};

export function WorkflowMcpView({
  items,
  loading,
  error,
  onRefresh,
  onSyncCatalog,
  onSelectByKey,
}: Props) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (w) =>
        (w.display_name || w.name || '').toLowerCase().includes(needle) ||
        (w.workflow_key || '').toLowerCase().includes(needle) ||
        (w.category || '').toLowerCase().includes(needle),
    );
  }, [items, q]);

  return (
    <div className="wf-drawer-body" style={{ padding: 12 }}>
      <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
        <button type="button" className="wf-btn primary" onClick={onSyncCatalog}>
          Sync MCP catalog
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button type="button" className="wf-btn" onClick={onRefresh}>
            <RefreshCw size={12} /> Reload
          </button>
          <button
            type="button"
            className="wf-btn"
            disabled
            title="Filter to graph_mode workflows — use cards below"
          >
            Graph mode
          </button>
        </div>
      </div>
      <input
        placeholder="Search MCP workflows…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{
          width: '100%',
          height: 34,
          borderRadius: 10,
          border: '1px solid var(--wf-border)',
          marginBottom: 10,
          padding: '0 10px',
          fontSize: 12,
        }}
      />
      {error && <p style={{ fontSize: 11, color: 'var(--wf-danger)' }}>{error}</p>}
      {loading ? (
        <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--wf-muted)' }}>
          <Loader2 size={14} className="animate-spin" /> Loading agentsam_mcp_workflows…
        </div>
      ) : (
        filtered.map((w) => {
          const runs = Number(w.run_count ?? 0);
          const success = Number(w.success_count ?? 0);
          const rate = runs > 0 ? `${Math.round((success / runs) * 100)}%` : 'Not measured yet';
          const graph = Number(w.graph_mode) === 1;
          return (
            <button
              key={w.id}
              type="button"
              className="wf-library-card"
              onClick={() => onSelectByKey(w.workflow_key)}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--wf-accent-soft)',
                  color: 'var(--wf-accent)',
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" width={16} height={16} aria-hidden>
                  <path d="M8 8h8v8H8z" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{w.display_name || w.name || w.workflow_key}</div>
                <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--wf-muted)' }}>
                  {w.description || 'MCP catalog row'}
                </p>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  <span className="wf-tag accent">MCP</span>
                  {graph && <span className="wf-tag success">graph</span>}
                  {w.category && <span className="wf-tag">{w.category}</span>}
                  {w.subagent_slug && <span className="wf-tag">{w.subagent_slug}</span>}
                </div>
                <div style={{ fontSize: 10, color: 'var(--wf-muted)', marginTop: 6 }}>
                  Success: {rate} · Runs: {runs || '0'} · Tool health: {w.status || 'unknown'}
                </div>
              </div>
            </button>
          );
        })
      )}
      {!loading && !filtered.length && (
        <div className="wf-empty">No MCP workflow rows for this workspace scope.</div>
      )}
    </div>
  );
}
