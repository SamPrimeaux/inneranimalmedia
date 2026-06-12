import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, LayoutGrid, List, Plus } from 'lucide-react';
import type { ArtifactRecord } from '../../api/artifacts';
import { fetchArtifacts, fetchArtifactFilters } from '../../api/artifacts';
import { ArtifactGrid } from '../../components/library/ArtifactGrid';
import { ArtifactFilters } from '../../components/library/ArtifactFilters';
import { ArtifactPreviewPanel } from '../../components/library/ArtifactPreviewPanel';

function toOpts(rows: { value: string; count: number }[]) {
  return (rows || []).map((r) => ({
    value: r.value ?? '',
    label: `${r.value || '—'} (${r.count})`,
  }));
}

export default function LibraryPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [validation, setValidation] = useState('');
  const [visibility, setVisibility] = useState('');
  const [source, setSource] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<{
    total_artifacts: number;
    draft: number;
    approved_published_deployed: number;
    passed_validation: number;
    untested_or_failed: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState('/api/agent/artifacts');
  const [selected, setSelected] = useState<ArtifactRecord | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [filterMeta, setFilterMeta] = useState<{
    artifact_type: { value: string; count: number }[];
    artifact_status: { value: string; count: number }[];
    validation_status: { value: string; count: number }[];
    visibility: { value: string; count: number }[];
    source: { value: string; count: number }[];
  } | null>(null);

  const loadFilters = useCallback(async () => {
    try {
      const f = await fetchArtifactFilters();
      if (f.ok && f.filters) setFilterMeta(f.filters);
    } catch {
      /* optional */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const qs = new URLSearchParams();
    qs.set('limit', '80');
    qs.set('offset', '0');
    if (q.trim()) qs.set('q', q.trim());
    if (type) qs.set('type', type);
    if (status) qs.set('status', status);
    if (validation) qs.set('validation', validation);
    if (visibility) qs.set('visibility', visibility);
    if (source) qs.set('source', source);
    const ep = `/api/agent/artifacts?${qs.toString()}`;
    setEndpoint(ep);
    try {
      const data = await fetchArtifacts({
        limit: 80,
        offset: 0,
        q: q.trim() || undefined,
        type: type || undefined,
        status: status || undefined,
        validation: validation || undefined,
        visibility: visibility || undefined,
        source: source || undefined,
      });
      if (!data.ok) {
        setErr(data.error || 'Request failed');
        setArtifacts([]);
        setTotal(0);
      } else {
        setArtifacts(data.artifacts || []);
        setTotal(data.total ?? 0);
        setKpis(data.kpis ?? null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setArtifacts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, type, status, validation, visibility, source]);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 220);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const typeOptions = useMemo(() => toOpts(filterMeta?.artifact_type || []), [filterMeta]);
  const statusOptions = useMemo(() => toOpts(filterMeta?.artifact_status || []), [filterMeta]);
  const validationOptions = useMemo(() => toOpts(filterMeta?.validation_status || []), [filterMeta]);
  const visibilityOptions = useMemo(() => toOpts(filterMeta?.visibility || []), [filterMeta]);
  const sourceOptions = useMemo(() => toOpts(filterMeta?.source || []), [filterMeta]);

  const onFilterChange = (k: 'type' | 'status' | 'validation' | 'visibility' | 'source', v: string) => {
    if (k === 'type') setType(v);
    if (k === 'status') setStatus(v);
    if (k === 'validation') setValidation(v);
    if (k === 'visibility') setVisibility(v);
    if (k === 'source') setSource(v);
  };

  const clearFilters = () => {
    setType('');
    setStatus('');
    setValidation('');
    setVisibility('');
    setSource('');
    setQ('');
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <style>{`
        .iam-lib-card {
          display: block;
          padding: 14px;
          border-radius: 12px;
          border: 1px solid var(--dashboard-border);
          background: var(--dashboard-panel);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .iam-lib-card:hover { border-color: color-mix(in srgb, var(--solar-cyan) 35%, var(--dashboard-border)); }
        .iam-lib-card--list { padding: 12px 14px; }
        .iam-lib-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 10px; border-radius: 8px; font-size: 11px;
          border: 1px solid var(--dashboard-border);
          background: transparent; color: var(--text-primary);
        }
        .iam-lib-btn:hover { background: var(--bg-hover); }
        .iam-lib-btn--primary { border-color: color-mix(in srgb, var(--solar-green) 50%, var(--dashboard-border)); color: var(--solar-green); }
        .iam-lib-btn--ghost { border-color: transparent; opacity: 0.85; }
        .iam-lib-select {
          font-size: 13px; padding: 8px 10px; border-radius: 8px;
          border: 1px solid var(--dashboard-border);
          background: var(--dashboard-canvas); color: var(--text-primary);
        }
        .iam-lib-badge {
          display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px;
          font-size: 10px; font-weight: 500; letter-spacing: 0.02em;
        }
        .iam-lib-badge--type { background: color-mix(in srgb, var(--solar-cyan) 12%, transparent); color: var(--solar-cyan); }
        .iam-lib-badge--neutral { background: color-mix(in srgb, var(--text-muted) 15%, transparent); color: var(--text-muted); }
        .iam-lib-badge--muted { background: color-mix(in srgb, var(--text-muted) 20%, transparent); color: var(--text-muted); }
        .iam-lib-badge--cyan { background: color-mix(in srgb, var(--solar-cyan) 18%, transparent); color: var(--solar-cyan); }
        .iam-lib-badge--green { background: color-mix(in srgb, var(--solar-green) 18%, transparent); color: var(--solar-green); }
        .iam-lib-badge--violet { background: color-mix(in srgb, #a78bfa 22%, transparent); color: #c4b5fd; }
        .iam-lib-badge--red { background: color-mix(in srgb, #f87171 20%, transparent); color: #fca5a5; }
        .iam-lib-badge--amber { background: color-mix(in srgb, #fbbf24 18%, transparent); color: #fcd34d; }
        .iam-lib-badge--orange { background: color-mix(in srgb, #fb923c 18%, transparent); color: #fdba74; }
      `}</style>

      <div className="shrink-0 border-b border-[var(--dashboard-border)] px-6 py-5 bg-[var(--dashboard-canvas)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">Artifacts</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl">
              Saved outputs from Agent Sam, workflows, and creative tools — scoped to your workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="iam-lib-btn iam-lib-btn--primary" onClick={() => navigate('/dashboard/agent')}>
              <Plus size={16} /> New artifact
            </button>
            <button type="button" className="iam-lib-btn" onClick={() => void load()}>
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              type="button"
              className={`iam-lib-btn ${viewMode === 'grid' ? 'ring-1 ring-[var(--solar-cyan)]' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={`iam-lib-btn ${viewMode === 'list' ? 'ring-1 ring-[var(--solar-cyan)]' : ''}`}
              onClick={() => setViewMode('list')}
              title="List"
            >
              <List size={16} />
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col lg:flex-row lg:items-center gap-3">
          <input
            className="iam-lib-select flex-1 max-w-xl"
            placeholder="Search name, type, source, R2 key…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search artifacts"
          />
        </div>
        <div className="mt-4">
          <ArtifactFilters
            type={type}
            status={status}
            validation={validation}
            visibility={visibility}
            source={source}
            typeOptions={typeOptions}
            statusOptions={statusOptions}
            validationOptions={validationOptions}
            visibilityOptions={visibilityOptions}
            sourceOptions={sourceOptions}
            onChange={onFilterChange}
            onClear={clearFilters}
          />
        </div>

        {kpis ? (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              ['Total', kpis.total_artifacts],
              ['Draft', kpis.draft],
              ['Approved / Pub / Deploy', kpis.approved_published_deployed],
              ['Passed validation', kpis.passed_validation],
              ['Untested / Failed', kpis.untested_or_failed],
            ].map(([label, val]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-3 py-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
                <div className="text-lg font-semibold text-[var(--text-primary)] tabular-nums">{val}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {err ? (
          <div className="max-w-lg rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] p-5">
            <div className="text-sm font-medium text-[var(--text-primary)]">Could not load artifacts</div>
            <div className="text-xs text-[var(--text-muted)] mt-2 break-all font-mono">{endpoint}</div>
            <div className="text-sm text-[var(--solar-red)] mt-2">{err}</div>
            <button type="button" className="iam-lib-btn mt-4" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : !loading && artifacts.length === 0 ? (
          <div className="max-w-md py-16 text-center mx-auto">
            <div className="text-lg font-medium text-[var(--text-primary)]">No artifacts yet</div>
            <p className="text-sm text-[var(--text-muted)] mt-2">
              Start in Agent or Create — new artifacts will show up here for this workspace.
            </p>
          </div>
        ) : (
          <ArtifactGrid
            artifacts={artifacts}
            loading={loading}
            selectedId={selected?.id ?? null}
            viewMode={viewMode}
            onSelect={(a) => {
              setSelected(a);
              setPanelOpen(true);
            }}
            onDetails={(a) => {
              setSelected(a);
              setPanelOpen(true);
            }}
            onCopied={(msg) => setToast(msg)}
          />
        )}

        {!loading && total > artifacts.length ? (
          <div className="text-center text-[11px] text-[var(--text-muted)] mt-4">
            Showing {artifacts.length} of {total} — refine filters or raise limit in API for full export.
          </div>
        ) : null}
      </div>

      <ArtifactPreviewPanel
        artifact={selected}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onPatched={(a) => {
          setSelected(a);
          setArtifacts((prev) => prev.map((x) => (x.id === a.id ? a : x)));
          void load();
        }}
        onToast={(msg) => setToast(msg)}
      />

      {toast ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 rounded-lg bg-[var(--dashboard-panel)] border border-[var(--dashboard-border)] text-sm shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
