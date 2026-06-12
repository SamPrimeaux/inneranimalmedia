import React, { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Zap, Eye, Pencil, Clock, Database, RefreshCw, ExternalLink,
  Search, ChevronRight, TrendingUp, TrendingDown, AlertCircle,
  AlertTriangle, BarChart2, ListFilter, Table2, Activity,
} from 'lucide-react';

import styles from './DatabasesTab.module.css';
import {
  useDatabasesObservability,
  formatCompact,
  formatTrend,
  formatQueryMs,
  formatRelativeSeen,
  type DatabasesSurface,
  type DatabasesRange,
  type DatabasesQueryRow,
  type KpiMetric,
} from './useDatabasesObservability';

type LatencyKey = 'p50' | 'p95' | 'p99';

function chartColors(surface: DatabasesSurface) {
  if (surface === 'cloudflare') {
    return {
      primary: '#9b8afb',
      secondary: '#6c8fff',
      grid: 'rgba(0,0,0,0.06)',
      axis: 'rgba(0,0,0,0.35)',
      tooltip: { bg: '#ffffff', border: 'rgba(0,0,0,0.1)', title: '#6b6b80', body: '#1a1a2e' },
    };
  }
  return {
    primary: '#00d37e',
    secondary: '#3ecf8e',
    grid: 'rgba(255,255,255,0.06)',
    axis: 'rgba(255,255,255,0.25)',
    tooltip: { bg: '#1c1c1c', border: 'rgba(255,255,255,0.1)', title: '#7a7a8a', body: '#ededed' },
  };
}

function CtrlGroup<T extends string>({
  options, labels, value, onChange,
}: { options: T[]; labels?: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <div className={styles.ctrlGroup} role="tablist">
      {options.map(o => (
        <button
          key={o}
          type="button"
          role="tab"
          aria-selected={value === o}
          className={`${styles.ctrlBtn} ${value === o ? styles.ctrlBtnActive : ''}`}
          onClick={() => onChange(o)}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

function IconBtn({ onClick, title, children }: { onClick?: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={styles.iconBtn} onClick={onClick} title={title} aria-label={title}>
      {children}
    </button>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const pts = data.map((v, i) => ({ i, v }));
  if (!pts.length) return null;
  return (
    <div className={styles.kpiSpark}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type KpiDef = { id: string; label: string; key: keyof NonNullable<ReturnType<typeof useDatabasesObservability>['overview']>['kpis'] };

const CF_KPIS: KpiDef[] = [
  { id: 'queries', label: 'Total queries', key: 'queries' },
  { id: 'rowsRead', label: 'Rows read', key: 'rowsRead' },
  { id: 'rowsWritten', label: 'Rows written', key: 'rowsWritten' },
  { id: 'storage', label: 'Storage used', key: 'storage' },
  { id: 'tables', label: 'Tables', key: 'tables' },
];

const SB_KPIS: KpiDef[] = [
  { id: 'connections', label: 'Connections', key: 'connections' },
  { id: 'storage', label: 'Database size', key: 'storage' },
  { id: 'tables', label: 'Tables', key: 'tables' },
  { id: 'queries', label: 'Agent queries', key: 'queries' },
  { id: 'p95', label: 'P95 latency', key: 'p95' },
];

function kpiDisplay(def: KpiDef, m?: KpiMetric, spark?: number[]): { value: string; trend: string; dir: 'up' | 'down' | 'neutral' } {
  if (!m?.wired) return { value: '—', trend: '—', dir: 'neutral' };
  if (def.id === 'storage' && m.valueLabel) {
    return { value: m.valueLabel, trend: formatTrend(m.trendPct, m.dir), dir: m.dir };
  }
  if (def.id === 'p95') {
    const ms = m.valueMs ?? m.value ?? 0;
    return {
      value: formatQueryMs(ms),
      trend: formatTrend(m.trendPct, m.dir),
      dir: m.dir,
    };
  }
  return {
    value: formatCompact(m.value),
    trend: formatTrend(m.trendPct, m.dir),
    dir: m.dir,
  };
}

function KpiGrid({
  defs, kpis, sparks, loading, surface,
}: {
  defs: KpiDef[];
  kpis?: ReturnType<typeof useDatabasesObservability>['overview'] extends infer O ? O extends { kpis?: infer K } ? K : never : never;
  sparks: Record<string, number[]>;
  loading: boolean;
  surface: DatabasesSurface;
}) {
  const color = chartColors(surface).primary;
  return (
    <div className={styles.kpiGrid}>
      {defs.map(def => {
        const m = kpis?.[def.key as keyof typeof kpis] as KpiMetric | undefined;
        const d = kpiDisplay(def, m, sparks[def.id.replace('connections', 'queries')]);
        const trendClass =
          d.dir === 'up' ? styles.trendUp : d.dir === 'down' ? styles.trendDown : styles.trendNeutral;
        return (
          <div key={def.id} className={styles.kpiCard}>
            <div className={styles.kpiLabel}>{def.label}</div>
            <div className={styles.kpiValue}>{loading ? '…' : d.value}</div>
            <div className={styles.kpiMeta}>
              <span className={trendClass}>
                {d.dir === 'up' ? <TrendingUp size={10} /> : d.dir === 'down' ? <TrendingDown size={10} /> : null}
                {loading ? '…' : d.trend}
              </span>
              <span className={styles.kpiMetaHint}>vs prev period</span>
            </div>
            {sparks[def.id === 'connections' ? 'queries' : def.id]?.length ? (
              <Sparkline data={sparks[def.id === 'connections' ? 'queries' : def.id]} color={color} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function BarPanel({
  title, data, dataKey, loading, empty, surface, height = 200,
}: {
  title: string;
  data: { h: string; v: number }[];
  dataKey?: string;
  loading: boolean;
  empty?: string;
  surface: DatabasesSurface;
  height?: number;
}) {
  const C = chartColors(surface);
  const key = dataKey ?? 'v';
  const hasData = data.some(d => (d as Record<string, number>)[key] > 0);
  const tooltipStyle = {
    contentStyle: { background: C.tooltip.bg, border: `1px solid ${C.tooltip.border}`, borderRadius: 8, fontSize: 11 },
    labelStyle: { color: C.tooltip.title, fontSize: 10 },
    itemStyle: { color: C.tooltip.body },
  };
  return (
    <div className={styles.chartPanel}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitle}><BarChart2 size={14} /> {title}</div>
      </div>
      <div className={styles.chartBody}>
        {!loading && !hasData && empty ? (
          <div className={styles.chartEmpty}>{empty}</div>
        ) : null}
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data.length ? data : [{ h: '—', v: 0 }]} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="0" stroke={C.grid} vertical={false} />
            <XAxis dataKey="h" tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={false} width={36} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey={key} fill={C.primary} fillOpacity={0.85} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LatencyPanel({
  charts, loading, live, surface,
}: {
  charts: ReturnType<typeof useDatabasesObservability>['charts'];
  loading: boolean;
  live: boolean;
  surface: DatabasesSurface;
}) {
  const [key, setKey] = useState<LatencyKey>('p50');
  const C = chartColors(surface);
  const series =
    key === 'p95' ? charts?.latencyP95 : key === 'p99' ? charts?.latencyP99 : charts?.latencyP50;
  const data = useMemo(() => {
    if (!charts?.labels?.length || !series?.length) return [];
    return charts.labels.map((h, i) => ({ h, ms: series[i] ?? 0 }));
  }, [charts, series]);
  const headline = charts?.headlineMs?.[key] ?? 0;
  const tooltipStyle = {
    contentStyle: { background: C.tooltip.bg, border: `1px solid ${C.tooltip.border}`, borderRadius: 8, fontSize: 11 },
    labelStyle: { color: C.tooltip.title, fontSize: 10 },
    itemStyle: { color: C.tooltip.body },
  };
  return (
    <div className={styles.chartPanel}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitle}><Activity size={14} /> Query latency</div>
        <CtrlGroup options={['p50', 'p95', 'p99'] as LatencyKey[]} value={key} onChange={setKey} />
      </div>
      <div className={styles.chartBody}>
        <div className={styles.latencyHero}>
          {loading ? '…' : live ? formatQueryMs(headline) : '—'}
          <span className={styles.latencyHeroLabel}>{key.toUpperCase()}</span>
        </div>
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={data.length ? data : [{ h: '—', ms: 0 }]} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke={C.grid} vertical={false} />
            <XAxis dataKey="h" tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={false} width={36} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [formatQueryMs(v), key.toUpperCase()]} />
            <Line type="monotone" dataKey="ms" stroke={C.primary} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function QueryTable({
  rows, wired, loading, onRefresh, surface,
}: {
  rows: DatabasesQueryRow[];
  wired: boolean;
  loading: boolean;
  onRefresh?: () => void;
  surface: DatabasesSurface;
}) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const filtered = useMemo(
    () => rows.filter(r => r.fingerprint.toLowerCase().includes(search.toLowerCase())),
    [rows, search],
  );

  return (
    <div className={styles.queryWrap}>
      <div className={styles.queryTableHeader}>
        <div className={styles.chartTitle}><ListFilter size={14} /> Queries</div>
        <div className={styles.queryTableActions}>
          <div className={styles.searchWrap}>
            <Search size={13} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              type="search"
              placeholder="Search queries…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search queries"
            />
          </div>
          <IconBtn onClick={onRefresh} title="Refresh"><RefreshCw size={13} /></IconBtn>
        </div>
      </div>
      {!wired && !loading ? (
        <div className={styles.emptyState}>
          {surface === 'cloudflare'
            ? 'No query insights in this window yet.'
            : 'No Hyperdrive agent activity in this window yet.'}
        </div>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.queryTable}>
            <thead>
              <tr>
                <th>Query</th>
                <th>% runtime</th>
                <th>Count</th>
                <th>Total</th>
                <th>P50</th>
                <th>P99</th>
                <th>Rows read</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const totalMs = row.avg_ms * row.call_count;
                return (
                  <React.Fragment key={row.fingerprint}>
                    <tr className={styles.queryRow} onClick={() => setExpanded(expanded === row.fingerprint ? null : row.fingerprint)}>
                      <td>
                        <div className={styles.queryFp}>
                          <ChevronRight size={12} className={`${styles.expandIcon} ${expanded === row.fingerprint ? styles.expandIconOpen : ''}`} />
                          {row.fingerprint}
                        </div>
                      </td>
                      <td className={styles.mono}>{row.runtime_pct}%</td>
                      <td className={styles.mono}>{row.call_count.toLocaleString()}</td>
                      <td className={styles.mono}>{formatQueryMs(totalMs)}</td>
                      <td className={styles.mono}>{formatQueryMs(row.p50_ms)}</td>
                      <td className={styles.mono}>{formatQueryMs(row.p99_ms)}</td>
                      <td className={styles.mono}>{formatCompact(row.rows_read)}</td>
                    </tr>
                    {expanded === row.fingerprint ? (
                      <tr>
                        <td colSpan={7} className={styles.expandedTd}>
                          <pre className={styles.expandedSql}>{row.fingerprint}</pre>
                          <a href={`/dashboard/database?tab=sql&q=${encodeURIComponent(row.fingerprint)}`} className={styles.actionBtn}>
                            <ExternalLink size={11} /> Explore Data
                          </a>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StoragePanel({
  storage, surface, loading, databaseName,
}: {
  storage: ReturnType<typeof useDatabasesObservability>['storage'];
  surface: DatabasesSurface;
  loading: boolean;
  databaseName?: string;
}) {
  const pct = storage.pctUsed ?? 0;
  return (
    <div className={styles.chartPanel}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitle}>
          <Database size={14} />
          {surface === 'cloudflare' ? 'D1 storage' : 'Database size'}
        </div>
        {databaseName ? <span className={styles.chartSubtitle}>{databaseName}</span> : null}
      </div>
      <div className={styles.chartBody}>
        <div className={styles.storageMetaRow}>
          <div className={styles.storageMetaItem}>
            <div className={styles.storageMetaLabel}>Used</div>
            <div className={styles.storageMetaVal}>{loading ? '…' : storage.usedLabel ?? '—'}</div>
          </div>
          <div className={styles.storageMetaItem}>
            <div className={styles.storageMetaLabel}>Limit</div>
            <div className={styles.storageMetaVal}>{storage.limitLabel ?? '—'}</div>
          </div>
          {storage.connections != null ? (
            <div className={styles.storageMetaItem}>
              <div className={styles.storageMetaLabel}>Connections</div>
              <div className={styles.storageMetaVal}>{storage.connections}</div>
            </div>
          ) : null}
          {storage.tableCount != null ? (
            <div className={styles.storageMetaItem}>
              <div className={styles.storageMetaLabel}>Tables</div>
              <div className={styles.storageMetaVal}>{storage.tableCount}</div>
            </div>
          ) : null}
        </div>
        <div className={styles.storageBarTrack}>
          <div className={styles.storageBarFill} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        {storage.largeObjects?.length ? (
          <div className={styles.largeObjects}>
            <div className={styles.sectionTitle}>Large objects</div>
            {storage.largeObjects.map(obj => (
              <div key={obj.name} className={styles.largeObjectRow}>
                <span className={styles.largeObjectName}>{obj.name}</span>
                <span className={styles.mono}>{obj.size}</span>
                <span className={styles.monoMuted}>{obj.pct}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function DatabasesTab() {
  const [surface, setSurface] = useState<DatabasesSurface>('cloudflare');
  const [range, setRange] = useState<DatabasesRange>('24h');
  const [spinning, setSpinning] = useState(false);

  const obs = useDatabasesObservability(surface, range);
  const kpiDefs = surface === 'cloudflare' ? CF_KPIS : SB_KPIS;

  const handleRefresh = useCallback(() => {
    setSpinning(true);
    void obs.refresh().finally(() => setSpinning(false));
  }, [obs]);

  const chartData = useMemo(() => {
    const c = obs.charts;
    if (!c?.labels?.length) return { total: [], read: [], write: [], rowsRead: [], rowsWritten: [] };
    return {
      total: c.labels.map((h, i) => ({ h, v: c.totalQueries[i] ?? 0 })),
      read: c.labels.map((h, i) => ({ h, v: c.readQueries[i] ?? 0 })),
      write: c.labels.map((h, i) => ({ h, v: c.writeQueries[i] ?? 0 })),
      rowsRead: c.labels.map((h, i) => ({ h, v: c.rowsRead[i] ?? 0 })),
      rowsWritten: c.labels.map((h, i) => ({ h, v: c.rowsWritten[i] ?? 0 })),
    };
  }, [obs.charts]);

  return (
    <div
      className={styles['analytics-databases']}
      data-surface={surface}
    >
      {obs.error ? (
        <div className={styles.alertBanner} role="alert">
          <AlertCircle size={13} />
          <span><strong>{obs.error}</strong></span>
        </div>
      ) : null}

      {obs.alertWarnings.length > 0 ? (
        <div className={styles.alertBanner} role="alert">
          <AlertTriangle size={13} />
          <span>
            <strong>Telemetry degraded.</strong>{' '}
            {obs.alertWarnings.slice(0, 2).map(w => w.message).join(' ')}
          </span>
        </div>
      ) : null}

      <div className={styles.filterBar}>
        <CtrlGroup
          options={['cloudflare', 'supabase'] as DatabasesSurface[]}
          labels={{ cloudflare: 'Cloudflare', supabase: 'Supabase' }}
          value={surface}
          onChange={setSurface}
        />
        <CtrlGroup options={['1h', '24h', '7d', '30d'] as DatabasesRange[]} value={range} onChange={setRange} />
        <IconBtn onClick={handleRefresh} title="Refresh data">
          <RefreshCw
            size={13}
            style={{
              transform: spinning ? 'rotate(360deg)' : 'none',
              transition: spinning ? 'transform 0.8s linear' : 'none',
            }}
          />
        </IconBtn>
        <a href="/dashboard/database" className={styles.ctaBtn}>
          <Table2 size={13} /> Explore Data
        </a>
      </div>

      {obs.database?.name && surface === 'cloudflare' ? (
        <div className={styles.surfaceMeta}>{obs.database.name}</div>
      ) : null}

      <KpiGrid
        defs={kpiDefs}
        kpis={obs.overview?.kpis}
        sparks={obs.sparks}
        loading={obs.loading}
        surface={surface}
      />

      <BarPanel
        title="Total queries"
        data={chartData.total}
        loading={obs.loading}
        surface={surface}
        empty="No query volume in this window yet."
      />

      <div className={styles.chartGrid2}>
        <BarPanel
          title="Read queries"
          data={chartData.read}
          loading={obs.loading}
          surface={surface}
          height={160}
        />
        <BarPanel
          title="Write queries"
          data={chartData.write}
          loading={obs.loading}
          surface={surface}
          height={160}
        />
      </div>

      <div className={styles.chartGrid2}>
        <LatencyPanel
          charts={obs.charts}
          loading={obs.loading}
          live={obs.live.charts}
          surface={surface}
        />
        <BarPanel
          title={surface === 'cloudflare' ? 'Rows read' : 'Query volume'}
          data={surface === 'cloudflare' ? chartData.rowsRead : chartData.total}
          loading={obs.loading}
          surface={surface}
          height={160}
        />
      </div>

      <QueryTable
        rows={obs.queryPerformance.rows}
        wired={obs.queryPerformance.wired}
        loading={obs.loading}
        onRefresh={handleRefresh}
        surface={surface}
      />

      <div className={styles.chartGrid2}>
        <StoragePanel
          storage={obs.storage}
          surface={surface}
          loading={obs.loading}
          databaseName={obs.database?.name}
        />
        {surface === 'cloudflare' ? (
          <BarPanel
            title="Rows written"
            data={chartData.rowsWritten}
            loading={obs.loading}
            surface={surface}
            height={160}
          />
        ) : (
          <BarPanel
            title="Rows written"
            data={chartData.rowsWritten}
            loading={obs.loading}
            surface={surface}
            height={160}
          />
        )}
      </div>
    </div>
  );
}
