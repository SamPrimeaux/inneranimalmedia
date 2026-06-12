import { useCallback, useEffect, useMemo, useState } from 'react';

export type DatabasesDs = 'all' | 'd1' | 'supabase';
export type DatabasesRange = '1h' | '24h' | '7d' | '30d';

export type DatabasesWarning = {
  code: string;
  message: string;
  severity?: string;
};

export type KpiMetric = {
  value: number;
  valueMs?: number;
  trendPct: number;
  dir: 'up' | 'down' | 'neutral';
  wired: boolean;
};

export type MiniStat = {
  key: string;
  label: string;
  value: string | null;
  status?: string | null;
  wired: boolean;
};

export type HealthCard = {
  status: string;
  lines: string[];
  wired: boolean;
  badge?: string;
};

export type DatabasesSummaryPayload = {
  ok: boolean;
  range: string;
  summary?: { state?: string; ds?: string; errorRatePct?: number };
  wired?: {
    kpis?: boolean;
    miniStats?: boolean;
    healthCards?: boolean;
    envFilter?: boolean;
  };
  kpis?: {
    queries?: KpiMetric;
    rowsRead?: KpiMetric;
    rowsWritten?: KpiMetric;
    p95?: KpiMetric;
    errors?: KpiMetric;
  };
  miniStats?: MiniStat[];
  healthCards?: {
    d1?: HealthCard;
    hyperdrive?: HealthCard;
    supabase?: HealthCard;
    lastEvents?: HealthCard;
  };
  warnings?: DatabasesWarning[];
  section_notices?: string[];
};

export type DatabasesQueryRow = {
  fingerprint: string;
  tool_name: string;
  datasource: 'd1' | 'supabase';
  call_count: number;
  runtime_pct: number;
  avg_ms: number;
  p50_ms: number;
  p99_ms: number;
  rows_read: number;
  rows_per_run: number;
  errors: number;
  last_seen: number | null;
};

export type DatabasesQueriesPayload = {
  ok: boolean;
  range: string;
  queries?: DatabasesQueryRow[];
  wired?: boolean;
  warnings?: DatabasesWarning[];
};

export type TimeseriesBreakdown = {
  key: string;
  labels: string[];
  total?: { d1: number[]; supabase: number[] };
  reads?: { d1: number[]; supabase: number[] };
  writes?: { d1: number[]; supabase: number[] };
  errors?: { d1: number[]; supabase: number[] };
  p50?: number[];
  p95?: number[];
  p99?: number[];
  headlineMs?: { p50: number; p95: number; p99: number };
  ratePct?: number;
  d1?: number[];
  supabase?: number[];
};

export type DatabasesTimeseriesPayload = {
  ok: boolean;
  range: string;
  breakdowns?: TimeseriesBreakdown[];
  warnings?: DatabasesWarning[];
};

export type HotTable = { name: string; val: string; ds: 'd1' | 'supabase' };

export type DatabasesTablesPayload = {
  ok: boolean;
  range: string;
  summary?: {
    ds?: string;
    counts?: { d1?: number; supabase?: number | null; total?: number };
    wired?: { hotTables?: boolean };
  };
  breakdowns?: Array<{
    key: string;
    largest?: HotTable[];
    mostRead?: HotTable[];
    mostWritten?: HotTable[];
  }>;
  warnings?: DatabasesWarning[];
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function formatCompact(n: number): string {
  const v = Number(n) || 0;
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

export function formatTrend(pct: number, dir: string): string {
  const sign = dir === 'down' ? '−' : dir === 'up' ? '+' : '';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

export function formatQueryMs(ms: number): string {
  const v = Number(ms) || 0;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${Math.round(v)}ms`;
}

export function formatRelativeSeen(epochSec: number | null): string {
  if (!epochSec) return '—';
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - epochSec);
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

function labelForBucket(raw: string, range: DatabasesRange): string {
  if (range === '1h') {
    const epoch = Number(raw) * 300;
    if (!Number.isFinite(epoch)) return raw;
    const d = new Date(epoch * 1000);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }
  return raw;
}

export function useDatabasesObservability(ds: DatabasesDs, range: DatabasesRange) {
  const [summary, setSummary] = useState<DatabasesSummaryPayload | null>(null);
  const [timeseries, setTimeseries] = useState<DatabasesTimeseriesPayload | null>(null);
  const [tables, setTables] = useState<DatabasesTablesPayload | null>(null);
  const [queries, setQueries] = useState<DatabasesQueriesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ range, ds });
    const [s, t, tbl, qry] = await Promise.all([
      fetchJson<DatabasesSummaryPayload>(`/api/analytics/databases/summary?${q}`),
      fetchJson<DatabasesTimeseriesPayload>(`/api/analytics/databases/timeseries?${q}`),
      fetchJson<DatabasesTablesPayload>(`/api/analytics/databases/tables?${q}`),
      fetchJson<DatabasesQueriesPayload>(`/api/analytics/databases/queries?${q}`),
    ]);
    setSummary(s);
    setTimeseries(t);
    setTables(tbl);
    setQueries(qry);
    if (!s && !t && !tbl && !qry) setError('Could not load database analytics.');
    setLoading(false);
  }, [ds, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const alertWarnings = useMemo(() => {
    const codes = new Set<string>();
    const out: DatabasesWarning[] = [];
    for (const w of [
      ...(summary?.warnings ?? []),
      ...(timeseries?.warnings ?? []),
      ...(tables?.warnings ?? []),
      ...(queries?.warnings ?? []),
    ]) {
      if (codes.has(w.code)) continue;
      const sev = String(w.severity || 'info').toLowerCase();
      if (sev !== 'warn' && sev !== 'error') continue;
      codes.add(w.code);
      out.push(w);
    }
    return out;
  }, [summary, timeseries, tables, queries]);

  const warnings = useMemo(() => {
    const codes = new Set<string>();
    const out: DatabasesWarning[] = [];
    for (const w of [
      ...(summary?.warnings ?? []),
      ...(timeseries?.warnings ?? []),
      ...(tables?.warnings ?? []),
      ...(queries?.warnings ?? []),
    ]) {
      if (codes.has(w.code)) continue;
      codes.add(w.code);
      out.push(w);
    }
    return out;
  }, [summary, timeseries, tables, queries]);

  const sectionNotices = useMemo(() => {
    const notices = [...(summary?.section_notices ?? [])];
    for (const w of warnings) {
      if (w.code.startsWith('SECTION_')) notices.push(w.message);
    }
    return notices;
  }, [summary, warnings]);

  const queryPerformance = useMemo(() => ({
    wired: Boolean(queries?.wired && (queries?.queries?.length ?? 0) > 0),
    rows: queries?.queries ?? [],
  }), [queries]);

  const hero = useMemo(() => {
    const b = timeseries?.breakdowns?.find((x) => x.key === 'hero');
    if (!b?.labels?.length) return null;
    const labels = b.labels.map((l) => labelForBucket(l, range));
    return {
      labels,
      total: { d1: b.total?.d1 ?? [], supabase: b.total?.supabase ?? [] },
      reads: { d1: b.reads?.d1 ?? [], supabase: b.reads?.supabase ?? [] },
      writes: { d1: b.writes?.d1 ?? [], supabase: b.writes?.supabase ?? [] },
      errors: { d1: b.errors?.d1 ?? [], supabase: b.errors?.supabase ?? [] },
    };
  }, [timeseries, range]);

  const latency = useMemo(() => {
    const b = timeseries?.breakdowns?.find((x) => x.key === 'latency');
    if (!b?.labels?.length) return null;
    return {
      labels: b.labels.map((l) => labelForBucket(l, range)),
      p50: b.p50 ?? [],
      p95: b.p95 ?? [],
      p99: b.p99 ?? [],
      headlineMs: b.headlineMs ?? { p50: 0, p95: 0, p99: 0 },
    };
  }, [timeseries, range]);

  const errorChart = useMemo(() => {
    const b = timeseries?.breakdowns?.find((x) => x.key === 'errorChart');
    if (!b?.labels?.length) return null;
    return {
      labels: b.labels.map((l) => labelForBucket(l, range)),
      ratePct: b.ratePct ?? summary?.summary?.errorRatePct ?? 0,
      d1: b.d1 ?? [],
      supabase: b.supabase ?? [],
    };
  }, [timeseries, summary, range]);

  const live = useMemo(
    () => ({
      kpis: Boolean(summary?.wired?.kpis && summary?.kpis?.queries?.wired),
      charts: Boolean(hero && (hero.total.d1.some((v) => v > 0) || hero.total.supabase.some((v) => v > 0))),
      miniStats: Boolean(summary?.wired?.miniStats),
      healthCards: Boolean(summary?.wired?.healthCards),
    }),
    [summary, hero],
  );

  const sectionWarnings = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of warnings) {
      if (w.code.startsWith('SECTION_')) map.set(w.code, w.message);
    }
    return map;
  }, [warnings]);

  const hotTables = useMemo(() => {
    const b = tables?.breakdowns?.find((x) => x.key === 'hotTables');
    const wired = Boolean(tables?.summary?.wired?.hotTables);
    return {
      wired,
      largest: b?.largest ?? [],
      mostRead: b?.mostRead ?? [],
      mostWritten: b?.mostWritten ?? [],
      counts: tables?.summary?.counts,
    };
  }, [tables]);

  return {
    summary,
    timeseries,
    tables,
    queries,
    queryPerformance,
    hero,
    latency,
    errorChart,
    hotTables,
    loading,
    error,
    warnings,
    alertWarnings,
    sectionNotices,
    sectionWarnings,
    live,
    refresh: load,
  };
}
