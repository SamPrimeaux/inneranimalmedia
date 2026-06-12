import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import type { ArtifactRecord } from '../../api/artifacts';
import { fetchArtifacts, fetchArtifactFilters, purgeWorkspaceArtifacts } from '../../api/artifacts';
import { ArtifactCategoryPicker } from '../../components/library/ArtifactCategoryPicker';
import { ArtifactHomeCard } from '../../components/library/ArtifactHomeCard';
import { ArtifactFilters } from '../../components/library/ArtifactFilters';
import { ArtifactPreviewPanel } from '../../components/library/ArtifactPreviewPanel';
import { continueArtifactInChat, isCodeArtifact, openArtifactInBuilder } from '../../lib/artifactChat';

function toOpts(rows: { value: string; count: number }[]) {
  return (rows || []).map((r) => ({
    value: r.value ?? '',
    label: `${r.value || '—'} (${r.count})`,
  }));
}

export default function LibraryPage() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [validation, setValidation] = useState('');
  const [visibility, setVisibility] = useState('');
  const [source, setSource] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
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
  const [purging, setPurging] = useState(false);
  const [filterMeta, setFilterMeta] = useState<{
    artifact_type: { value: string; count: number }[];
    artifact_status: { value: string; count: number }[];
    validation_status: { value: string; count: number }[];
    visibility: { value: string; count: number }[];
    source: { value: string; count: number }[];
  } | null>(null);

  const hasActiveFilters = Boolean(type || status || validation || visibility || source);

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
    const t = setTimeout(() => setToast(null), 2800);
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

  const openArtifact = (a: ArtifactRecord) => {
    setSelected(a);
    setPanelOpen(true);
  };

  const runLibraryPurge = async () => {
    if (purging) return;
    const ok = window.confirm(
      'Delete ALL artifacts in this workspace from D1 and R2? This cannot be undone. Superadmin only.',
    );
    if (!ok) return;
    setPurging(true);
    try {
      const preview = await purgeWorkspaceArtifacts({ dry_run: true });
      if (!preview.ok) {
        setToast(preview.error || 'Purge not allowed');
        return;
      }
      const n = preview.d1_rows ?? preview.d1_rows_deleted ?? 0;
      const r2 = preview.r2_keys_planned ?? preview.r2_keys_deleted ?? 0;
      const go = window.confirm(`Remove ${n} library rows and ${r2} R2 objects?`);
      if (!go) return;
      const out = await purgeWorkspaceArtifacts({ dry_run: false });
      if (!out.ok) {
        setToast(out.error || 'Purge failed');
        return;
      }
      setArtifacts([]);
      setTotal(0);
      setKpis(null);
      setSelected(null);
      setPanelOpen(false);
      setToast(`Cleared ${out.d1_rows_deleted ?? 0} artifacts`);
      void load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Purge failed');
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <style>{`
        .iam-lib-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          padding: 8px 12px; border-radius: 10px; font-size: 13px; min-height: 40px;
          border: 1px solid var(--dashboard-border);
          background: transparent; color: var(--text-primary);
          touch-action: manipulation;
        }
        .iam-lib-btn:hover { background: var(--bg-hover); }
        .iam-lib-btn--primary {
          border-color: color-mix(in srgb, var(--solar-green) 50%, var(--dashboard-border));
          color: var(--solar-green);
          background: color-mix(in srgb, var(--solar-green) 8%, transparent);
        }
        .iam-lib-btn--ghost { border-color: transparent; opacity: 0.9; }
        .iam-lib-select {
          font-size: 14px; padding: 10px 12px; border-radius: 10px; min-height: 44px;
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
        .iam-artifact-skel {
          border-radius: 12px; border: 1px solid var(--dashboard-border);
          background: linear-gradient(90deg, var(--dashboard-panel) 0%, var(--bg-hover) 50%, var(--dashboard-panel) 100%);
          background-size: 200% 100%; animation: iam-artifact-shimmer 1.2s ease-in-out infinite;
        }
        @keyframes iam-artifact-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
      `}</style>

      <div className="shrink-0 border-b border-[var(--dashboard-border)] px-4 sm:px-6 py-4 sm:py-5 bg-[var(--dashboard-canvas)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] tracking-tight">Artifacts</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xl">
              Build something new or pick up where you left off — chat stays on this page.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:shrink-0">
            <button
              type="button"
              className="iam-lib-btn iam-lib-btn--primary w-full sm:w-auto"
              onClick={() => setCategoryOpen(true)}
            >
              <Plus size={18} /> New artifact
            </button>
            <button type="button" className="iam-lib-btn w-full sm:w-auto" onClick={() => void load()}>
              <RefreshCw size={18} /> Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
            aria-hidden
          />
          <input
            className="iam-lib-select w-full pl-9"
            placeholder="Search artifacts…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search artifacts"
          />
        </div>

        <button
          type="button"
          className="mt-3 flex w-full sm:w-auto items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] py-2 touch-manipulation"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          <SlidersHorizontal size={14} />
          Advanced filters
          {hasActiveFilters ? (
            <span className="rounded-full bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] px-2 py-0.5 text-[10px]">
              active
            </span>
          ) : null}
          <ChevronDown size={14} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>

        {showAdvanced ? (
          <div className="mt-2 space-y-4 pb-1">
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
            {kpis ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                {[
                  ['Total', kpis.total_artifacts],
                  ['Draft', kpis.draft],
                  ['Approved / Pub', kpis.approved_published_deployed],
                  ['Passed', kpis.passed_validation],
                  ['Failed', kpis.untested_or_failed],
                ].map(([label, val]) => (
                  <div
                    key={String(label)}
                    className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-3 py-2"
                  >
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
                    <div className="text-base sm:text-lg font-semibold text-[var(--text-primary)] tabular-nums">{val}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="rounded-xl border border-[var(--solar-red)]/35 bg-[var(--solar-red)]/5 p-4">
              <div className="text-sm font-medium text-[var(--text-primary)]">Clean slate</div>
              <p className="text-xs text-[var(--text-muted)] mt-1 max-w-lg">
                Wipe every artifact in this workspace (D1 + R2) to preview the empty-state build flow. Superadmin only.
              </p>
              <button
                type="button"
                className="iam-lib-btn mt-3 w-full sm:w-auto border-[var(--solar-red)]/50 text-[var(--solar-red)]"
                disabled={purging}
                onClick={() => void runLibraryPurge()}
              >
                {purging ? 'Purging…' : 'Clear workspace library'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
        {err ? (
          <div className="max-w-lg rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] p-5">
            <div className="text-sm font-medium text-[var(--text-primary)]">Could not load artifacts</div>
            <div className="text-xs text-[var(--text-muted)] mt-2 break-all font-mono">{endpoint}</div>
            <div className="text-sm text-[var(--solar-red)] mt-2">{err}</div>
            <button type="button" className="iam-lib-btn mt-4" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : loading && artifacts.length === 0 ? (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="iam-artifact-skel aspect-[4/3] w-full" />
            ))}
          </div>
        ) : !loading && artifacts.length === 0 ? (
          <div className="max-w-md py-12 sm:py-16 text-center mx-auto px-2">
            <div className="text-lg font-medium text-[var(--text-primary)]">No artifacts yet</div>
            <p className="text-sm text-[var(--text-muted)] mt-2">
              Tap New artifact to pick a category — Agent Sam will start on this page.
            </p>
            <button type="button" className="iam-lib-btn iam-lib-btn--primary mt-6 w-full sm:w-auto" onClick={() => setCategoryOpen(true)}>
              <Plus size={18} /> New artifact
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
              {artifacts.map((a) => (
                <ArtifactHomeCard key={a.id || a.r2_key} artifact={a} onOpen={() => openArtifact(a)} />
              ))}
            </div>
            {!loading && total > artifacts.length ? (
              <div className="text-center text-[11px] text-[var(--text-muted)] mt-6">
                Showing {artifacts.length} of {total} — open advanced filters to narrow the list.
              </div>
            ) : null}
          </>
        )}
      </div>

      <ArtifactCategoryPicker
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        onStarted={(title) => setToast(`Starting ${title} — chat opened`)}
      />

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
        onContinueInChat={
          selected
            ? () => {
                continueArtifactInChat(selected);
                setPanelOpen(false);
                setToast('Continuing in chat');
              }
            : undefined
        }
        onOpenInBuilder={
          selected && isCodeArtifact(selected)
            ? () => {
                openArtifactInBuilder(selected);
                setPanelOpen(false);
                setToast('Opening in builder');
              }
            : undefined
        }
      />

      {toast ? (
        <div
          className="fixed left-1/2 z-[80] -translate-x-1/2 px-4 py-2.5 rounded-xl bg-[var(--dashboard-panel)] border border-[var(--dashboard-border)] text-sm shadow-lg max-w-[min(92vw,360px)] text-center"
          style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px) + 56px)' }}
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
