/**
 * Home “Recent activity” — last N routing decisions from D1 (ground truth).
 * GET /api/agent/routing/recent
 */
import { useEffect, useState } from 'react';
import './RoutingRecentActivity.css';

type RoutingDecision = {
  id: string;
  task_type: string | null;
  matched_by: string | null;
  is_match: boolean;
  confidence: number | null;
  model_key: string | null;
  provider: string | null;
  routing_arm_id: string | null;
  reason: string | null;
  message_excerpt: string | null;
  latency_ms: number | null;
  conversation_id: string | null;
  workspace_id: string | null;
  created_at: string | number | null;
};

function relativeTime(raw: string | number | null): string {
  if (raw == null) return '';
  let t: number;
  if (typeof raw === 'number') {
    t = raw < 1e12 ? raw * 1000 : raw;
  } else {
    const n = Number(raw);
    if (Number.isFinite(n) && String(raw).trim() !== '' && !String(raw).includes('-')) {
      t = n < 1e12 ? n * 1000 : n;
    } else {
      t = Date.parse(raw);
    }
  }
  if (!Number.isFinite(t)) return '';
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function shortModel(key: string | null): string {
  if (!key) return '—';
  const k = key.replace(/^models\//, '');
  if (k.length <= 28) return k;
  return `${k.slice(0, 26)}…`;
}

export function RoutingRecentActivity() {
  const [rows, setRows] = useState<RoutingDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/agent/routing/recent?limit=8', {
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as { decisions?: RoutingDecision[]; error?: string };
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setRows(Array.isArray(data.decisions) ? data.decisions : []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="iam-routing-recent">
      {loading ? (
        <p className="iam-routing-recent__empty">Loading routing decisions…</p>
      ) : error ? (
        <p className="iam-routing-recent__empty">Couldn’t load activity ({error}).</p>
      ) : rows.length === 0 ? (
        <p className="iam-routing-recent__empty">No routing decisions yet this session.</p>
      ) : (
        <ul className="iam-routing-recent__list">
          {rows.map((r) => (
            <li key={r.id} className="iam-routing-recent__row">
              <div className="iam-routing-recent__main">
                <span className="iam-routing-recent__task">{r.task_type || 'unknown'}</span>
                <span className="iam-routing-recent__model" title={r.model_key || undefined}>
                  {shortModel(r.model_key)}
                </span>
                {r.matched_by ? (
                  <span className="iam-routing-recent__match">{r.matched_by}</span>
                ) : null}
              </div>
              {r.message_excerpt ? (
                <p className="iam-routing-recent__excerpt">{r.message_excerpt}</p>
              ) : null}
              <div className="iam-routing-recent__meta">
                <time dateTime={r.created_at != null ? String(r.created_at) : undefined}>
                  {relativeTime(r.created_at)}
                </time>
                {r.latency_ms != null ? <span>{r.latency_ms}ms</span> : null}
                {r.confidence != null ? (
                  <span>{Math.round(Number(r.confidence) * 100)}%</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
