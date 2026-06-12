import { useCallback, useEffect, useMemo, useState } from 'react';

export type DatabasesSurface = 'cloudflare' | 'supabase';
export type DatabasesRange = '1h' | '24h' | '7d' | '30d';

/** @deprecated use DatabasesSurface */
export type DatabasesDs = 'all' | 'd1' | 'supabase';

export type DatabasesWarning = {
  code: string;
  message: string;
  severity?: string;
};

export type KpiMetric = {
  value: number;
  valueMs?: number;
  valueLabel?: string | null;
  trendPct: number;
  dir: 'up' | 'down' | 'neutral';
  wired: boolean;
};

export type CapacityMetric = {
  usedBytes?: number | null;
  limitBytes: number;
  usedLabel?: string | null;
  limitLabel: string;
  pctUsed?: number | null;
  level?: 'ok' | 'watch' | 'action' | 'critical' | 'unknown';
  subtitle?: string | null;
  subtitleOk?: boolean;
  retentionAt?: number | null;
  retentionOk?: boolean | null;
  autovacuumAt?: number | null;
  connectionsUsed?: number | null;
  connectionsMax?: number | null;
  hyperdriveStatus?: string | null;
  hyperdriveLatencyMs?: number | null;
  wired?: boolean;
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
  rows_written?: number;
  rows_per_run: number;
  errors: number;
  last_seen: number | null;
};

export type HotTable = { name: string; val: string; ds: 'd1' | 'supabase' };

export type LargeObjectRow = { name: string; size: string; pct: string };

export type StorageBreakdown = {
  usedBytes?: number | null;
  limitBytes?: number;
  usedLabel?: string | null;
  limitLabel?: string;
  pctUsed?: number | null;
  tableCount?: number | null;
  connections?: number | null;
  largeObjects?: LargeObjectRow[];
  wired?: boolean;
};

export type SchemaHealthPayload = {
  noPrimaryKey?: Array<{ name: string; ds?: string; severity?: string }>;
  missingIndexes?: Array<{ name: string; ds?: string; severity?: string }>;
  fkIssues?: Array<{ name?: string; table_name?: string; conname?: string }>;
  wired?: boolean;
};

export type DatabasesOverviewPayload = {
  ok: boolean;
  surface?: DatabasesSurface;
  range: string;
  wired?: boolean;
  database?: { id: string; name: string };
  summary?: { state?: string; surface?: string };
  kpis?: {
    queries?: KpiMetric;
    rowsRead?: KpiMetric;
    rowsWritten?: KpiMetric;
    storage?: KpiMetric;
    tables?: KpiMetric;
    connections?: KpiMetric;
    p95?: KpiMetric;
    errors?: KpiMetric;
  };
  capacity?: CapacityMetric;
  charts?: {
    labels: string[];
    totalQueries: number[];
    readQueries: number[];
    writeQueries: number[];
    rowsRead: number[];
    rowsWritten: number[];
    latencyP50: number[];
    latencyP95: number[];
    latencyP99: number[];
    headlineMs: { p50: number; p95: number; p99: number };
  };
  queries?: DatabasesQueryRow[];
  storage?: StorageBreakdown;
  hotTables?: {
    largest?: HotTable[];
    mostRead?: HotTable[];
    mostWritten?: HotTable[];
  };
  schemaHealth?: SchemaHealthPayload;
  health?: { hyperdrive?: string; latencyMs?: number | null };
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
  if (v < 10) return `${v.toFixed(2)}ms`;
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

export function useDatabasesObservability(surface: DatabasesSurface, range: DatabasesRange) {
  const [overview, setOverview] = useState<DatabasesOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ range, surface });
    const data = await fetchJson<DatabasesOverviewPayload>(
      `/api/analytics/databases/overview?${q}`,
    );
    setOverview(data);
    if (!data) setError('Could not load database analytics.');
    setLoading(false);
  }, [surface, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const alertWarnings = useMemo(() => {
    const codes = new Set<string>();
    const out: DatabasesWarning[] = [];
    for (const w of overview?.warnings ?? []) {
      if (codes.has(w.code)) continue;
      const sev = String(w.severity || 'info').toLowerCase();
      if (sev !== 'warn' && sev !== 'error') continue;
      codes.add(w.code);
      out.push(w);
    }
    return out;
  }, [overview]);

  const warnings = useMemo(() => overview?.warnings ?? [], [overview]);

  const charts = overview?.charts;
  const hasChartData = Boolean(
    charts?.totalQueries?.some((v) => v > 0) ||
      charts?.readQueries?.some((v) => v > 0) ||
      charts?.writeQueries?.some((v) => v > 0),
  );

  const sparks = useMemo(
    () => ({
      queries: charts?.totalQueries ?? [],
      rowsRead: charts?.rowsRead ?? [],
      rowsWritten: charts?.rowsWritten ?? [],
      p95: charts?.latencyP95 ?? [],
    }),
    [charts],
  );

  return {
    overview,
    summary: overview,
    charts,
    sparks,
    capacity: overview?.capacity ?? null,
    queryPerformance: {
      wired: Boolean(overview?.queries?.length),
      rows: overview?.queries ?? [],
    },
    storage: overview?.storage ?? { wired: false },
    hotTables: overview?.hotTables ?? { largest: [], mostRead: [], mostWritten: [] },
    schemaHealth: overview?.schemaHealth ?? { wired: false },
    health: overview?.health,
    database: overview?.database,
    loading,
    error,
    warnings,
    alertWarnings,
    live: {
      kpis: Boolean(overview?.wired && overview?.kpis?.queries?.wired),
      charts: hasChartData,
    },
    refresh: load,
  };
}
