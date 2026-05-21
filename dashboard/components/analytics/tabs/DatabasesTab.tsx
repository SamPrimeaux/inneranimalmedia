import { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Zap, Eye, Pencil, Clock, AlertCircle, Database,
  RefreshCw, ExternalLink, Search, ChevronRight,
  TrendingUp, TrendingDown, Activity, AlertTriangle,
  BarChart2, ListFilter, Table2, Cloud, CheckCircle,
  CloudLightning, CircleAlert,
} from 'lucide-react';

import styles from './DatabasesTab.module.css';
import {
  queryRows, largestTables, mostReadTables, mostWrittenTables,
  largeObjects, timelineEvents,
  type QueryRow,
} from './mockDatabasesObservability';
import {
  useDatabasesObservability,
  formatCompact,
  formatTrend,
  type DatabasesDs,
  type DatabasesRange,
  type HotTable,
  type KpiMetric,
  type MiniStat,
} from './useDatabasesObservability';

// ── recharts color tokens (canvas cannot use CSS vars) ─────────────────────
const C = {
  d1:      '#5b7fff',
  sup:     '#3dbc8c',
  err:     '#e05555',
  warn:    '#f0a050',
  grid:    'rgba(255,255,255,0.04)',
  axis:    'rgba(255,255,255,0.18)',
  tooltip: { bg: '#1a1a1e', border: 'rgba(255,255,255,0.1)', title: '#7a7a8a', body: '#e8e8ec' },
};

const tooltipStyle = {
  contentStyle: { background: C.tooltip.bg, border: `1px solid ${C.tooltip.border}`, borderRadius: 6, fontSize: 11 },
  labelStyle: { color: C.tooltip.title, fontSize: 10 },
  itemStyle: { color: C.tooltip.body },
};

// ── small helpers ──────────────────────────────────────────────────────────
type Env = 'production' | 'staging';
type ChartSeries = 'total' | 'reads' | 'writes' | 'errors';
type LatencyKey = 'p50' | 'p95' | 'p99';

function SectionNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className={styles.sectionNotice}>
      <AlertCircle size={12} />
      <span>{message}</span>
    </div>
  );
}

function CtrlGroup<T extends string>({
  options, value, onChange,
}: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className={styles.ctrlGroup}>
      {options.map(o => (
        <button
          key={o}
          className={`${styles.ctrlBtn} ${value === o ? styles.ctrlBtnActive : ''}`}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function IconBtn({ onClick, title, children }: { onClick?: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button className={styles.iconBtn} onClick={onClick} title={title} aria-label={title}>
      {children}
    </button>
  );
}

function DsBadge({ ds }: { ds: 'd1' | 'supabase' }) {
  return (
    <span className={`${styles.dsBadge} ${ds === 'd1' ? styles.dsBadgeD1 : styles.dsBadgeSupabase}`}>
      {ds}
    </span>
  );
}

// ── Sparkline (recharts LineChart, axes off) ───────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const pts = data.map((v, i) => ({ i, v }));
  return (
    <div className={styles.kpiSpark} style={{ width: 90, height: 36 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── KPI strip ─────────────────────────────────────────────────────────────
const kpiIcons: Record<string, React.ReactNode> = {
  queries:     <Zap size={12} />,
  rowsRead:    <Eye size={12} />,
  rowsWritten: <Pencil size={12} />,
  p95:         <Clock size={12} />,
  errors:      <AlertCircle size={12} />,
};

const sparkColors: Record<string, string> = {
  queries:     C.d1,
  rowsRead:    C.sup,
  rowsWritten: C.warn,
  p95:         C.d1,
  errors:      C.err,
};

const KPI_DEFS: { id: string; label: string; metricKey: 'queries' | 'rowsRead' | 'rowsWritten' | 'p95' | 'errors' }[] = [
  { id: 'queries', label: 'Total queries', metricKey: 'queries' },
  { id: 'rowsRead', label: 'Rows read', metricKey: 'rowsRead' },
  { id: 'rowsWritten', label: 'Rows written', metricKey: 'rowsWritten' },
  { id: 'p95', label: 'P95 latency', metricKey: 'p95' },
  { id: 'errors', label: 'Errors', metricKey: 'errors' },
];

function kpiDisplay(id: string, m?: KpiMetric, spark?: number[]): { value: string; trend: string; dir: 'up' | 'down' | 'neutral'; spark: number[] } {
  if (!m?.wired) {
    return { value: '—', trend: '—', dir: 'neutral', spark: spark ?? [] };
  }
  if (id === 'p95') {
    return {
      value: `${(m.valueMs ?? m.value ?? 0).toFixed(m.valueMs && m.valueMs < 10 ? 2 : 0)}ms`,
      trend: formatTrend(m.trendPct, m.dir),
      dir: m.dir,
      spark: spark ?? [],
    };
  }
  return {
    value: formatCompact(m.value),
    trend: formatTrend(m.trendPct, m.dir),
    dir: m.dir,
    spark: spark ?? [],
  };
}

function KpiStrip({
  kpis,
  miniStats,
  sparks,
  loading,
}: {
  kpis?: {
    queries?: KpiMetric;
    rowsRead?: KpiMetric;
    rowsWritten?: KpiMetric;
    p95?: KpiMetric;
    errors?: KpiMetric;
  };
  miniStats?: MiniStat[];
  sparks: Record<string, number[]>;
  loading: boolean;
}) {
  return (
    <>
      <div className={styles.kpiGrid}>
        {KPI_DEFS.map(def => {
          const m = kpis?.[def.metricKey];
          const d = kpiDisplay(def.id, m, sparks[def.id]);
          const trendClass =
            d.dir === 'up' ? styles.trendUp : d.dir === 'down' ? styles.trendDown : styles.trendNeutral;
          return (
            <div key={def.id} className={styles.kpiCard}>
              <div className={styles.kpiLabel}>
                {kpiIcons[def.id]}
                {def.label}
              </div>
              <div className={styles.kpiValue}>{loading ? '…' : d.value}</div>
              <div className={styles.kpiMeta}>
                <span className={trendClass}>
                  {d.dir === 'up' ? <TrendingUp size={10} /> : d.dir === 'down' ? <TrendingDown size={10} /> : null}
                  {loading ? '…' : d.trend}
                </span>
                <span style={{ color: 'var(--db-text-dim)', fontSize: 11 }}>vs prev period</span>
              </div>
              {d.spark.length > 0 ? <Sparkline data={d.spark} color={sparkColors[def.id]} /> : null}
            </div>
          );
        })}
      </div>

      <div className={styles.miniGrid}>
        {(miniStats ?? []).map(s => (
          <div key={s.key} className={styles.miniStat}>
            <div className={styles.miniLabel}>{s.label}</div>
            <div
              className={`${styles.miniVal} ${s.status === 'healthy' ? styles.miniValHealthy : ''} ${!s.wired ? styles.miniValDim : ''}`}
            >
              {loading ? '…' : s.value ?? '—'}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Hero chart ────────────────────────────────────────────────────────────
function HeroChart({
  hero,
  loading,
  live,
}: {
  hero: ReturnType<typeof useDatabasesObservability>['hero'];
  loading: boolean;
  live: boolean;
}) {
  const [series, setSeries] = useState<ChartSeries>('total');

  const data = useMemo(() => {
    if (!hero?.labels?.length) return [];
    const src =
      series === 'reads' ? hero.reads
        : series === 'writes' ? hero.writes
          : series === 'errors' ? hero.errors
            : hero.total;
    return hero.labels.map((h, i) => ({
      h,
      D1: src.d1[i] ?? 0,
      Supabase: src.supabase[i] ?? 0,
    }));
  }, [hero, series]);

  return (
    <div className={styles.chartPanel}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitle}>
          <BarChart2 size={14} />
          Query volume over time
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <CtrlGroup
            options={['total', 'reads', 'writes', 'errors'] as ChartSeries[]}
            value={series}
            onChange={setSeries}
          />
          <div className={styles.legend}>
            <span><span className={styles.legendDot} style={{ background: C.d1 }} />D1</span>
            <span><span className={styles.legendDot} style={{ background: C.sup }} />Supabase</span>
          </div>
        </div>
      </div>
      <div className={styles.chartBody}>
        {!live && !loading ? (
          <div className={styles.chartEmpty}>No query volume in this window yet.</div>
        ) : null}
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.length ? data : [{ h: '—', D1: 0, Supabase: 0 }]} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="0" stroke={C.grid} vertical={false} />
            <XAxis dataKey="h" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} interval={3} />
            <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} width={36} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="D1"       stackId="s" fill={C.d1}  fillOpacity={0.8} radius={[0, 0, 0, 0]} />
            <Bar dataKey="Supabase" stackId="s" fill={C.sup} fillOpacity={0.7} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Latency chart ─────────────────────────────────────────────────────────
function LatencyChart({
  latency,
  loading,
  live,
}: {
  latency: ReturnType<typeof useDatabasesObservability>['latency'];
  loading: boolean;
  live: boolean;
}) {
  const [key, setKey] = useState<LatencyKey>('p50');

  const series = key === 'p95' ? latency?.p95 : key === 'p99' ? latency?.p99 : latency?.p50;
  const data = useMemo(() => {
    if (!latency?.labels?.length || !series?.length) return [];
    return latency.labels.map((h, i) => ({ h, ms: series[i] ?? 0 }));
  }, [latency, series]);

  const display = latency?.headlineMs?.[key] ?? 0;

  return (
    <div className={styles.chartPanel}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitle}><Activity size={14} /> Query latency</div>
        <CtrlGroup options={['p50', 'p95', 'p99'] as LatencyKey[]} value={key} onChange={setKey} />
      </div>
      <div className={styles.chartBody}>
        <div className={styles.latencyHero}>
          {loading ? '…' : live ? `${display < 10 ? display.toFixed(2) : Math.round(display)} ms` : '—'}
          <span className={styles.latencyHeroLabel}>{key.toUpperCase()}</span>
        </div>
        {!live && !loading ? (
          <div className={styles.chartEmpty}>Latency needs database tool_call_log or OTLP spans.</div>
        ) : null}
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={data.length ? data : [{ h: '—', ms: 0 }]} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke={C.grid} vertical={false} />
            <XAxis dataKey="h" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.2)' }} tickLine={false} axisLine={false} interval={5} />
            <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.2)' }} tickLine={false} axisLine={false} width={36} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v} ms`, key.toUpperCase()]} />
            <Line type="monotone" dataKey="ms" stroke={C.d1} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Error rate chart ───────────────────────────────────────────────────────
function ErrorChart({
  errorChart,
  loading,
  live,
}: {
  errorChart: ReturnType<typeof useDatabasesObservability>['errorChart'];
  loading: boolean;
  live: boolean;
}) {
  const errData = useMemo(() => {
    if (!errorChart?.labels?.length) return [];
    return errorChart.labels.map((h, i) => ({
      h,
      D1: errorChart.d1[i] ?? 0,
      Supabase: errorChart.supabase[i] ?? 0,
    }));
  }, [errorChart]);

  const rateStr =
    errorChart && live
      ? `${errorChart.ratePct < 0.01 ? '<0.01' : errorChart.ratePct.toFixed(2)}%`
      : '—';

  return (
    <div className={styles.chartPanel}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitle}><AlertTriangle size={14} /> Error rate / failed queries</div>
        <span style={{ fontSize: 11, color: 'var(--db-text-muted)' }}>by datasource</span>
      </div>
      <div className={styles.chartBody}>
        <div className={styles.latencyHero} style={{ color: 'var(--db-status-error, #e05555)' }}>
          {loading ? '…' : rateStr}
          <span className={styles.latencyHeroLabel}>error rate</span>
        </div>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={errData.length ? errData : [{ h: '—', D1: 0, Supabase: 0 }]} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke={C.grid} vertical={false} />
            <XAxis dataKey="h" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.2)' }} tickLine={false} axisLine={false} interval={5} />
            <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.2)' }} tickLine={false} axisLine={false} width={24} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="D1"       stackId="e" fill={C.err}  fillOpacity={0.7} radius={[0,0,0,0]} />
            <Bar dataKey="Supabase" stackId="e" fill={C.warn} fillOpacity={0.6} radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Query performance table ────────────────────────────────────────────────
function QueryTable() {
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() =>
    queryRows.filter(r => r.fp.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  const toggleExpand = useCallback((fp: string) => {
    setExpanded(prev => prev === fp ? null : fp);
  }, []);

  return (
    <div className={styles.queryWrap}>
      <div className={styles.queryTableHeader}>
        <div className={styles.chartTitle}><ListFilter size={14} /> Query performance</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className={styles.searchWrap}>
            <Search size={13} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search queries..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search query fingerprints"
            />
          </div>
          <IconBtn title="Refresh"><RefreshCw size={13} /></IconBtn>
        </div>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.queryTable}>
          <thead>
            <tr>
              <th style={{ width: 340 }}>Query fingerprint</th>
              <th>% runtime</th>
              <th>Count</th>
              <th>Total</th>
              <th>P50</th>
              <th>P99</th>
              <th>Rows read</th>
              <th>Rows/run</th>
              <th>Datasource</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <>
                <tr
                  key={row.fp}
                  className={styles.queryRow}
                  onClick={() => toggleExpand(row.fp)}
                >
                  <td>
                    <div className={styles.queryFp}>
                      <ChevronRight
                        size={12}
                        className={`${styles.expandIcon} ${expanded === row.fp ? styles.expandIconOpen : ''}`}
                      />
                      {row.fp}
                    </div>
                  </td>
                  <td>
                    <div className={styles.runtimeBarWrap}>
                      <div className={styles.runtimeBar}>
                        <div
                          className={styles.runtimeBarFill}
                          style={{ width: `${Math.min(row.pct * 4, 100)}%` }}
                        />
                      </div>
                      <span className={styles.mono}>{row.pct}%</span>
                    </div>
                  </td>
                  <td className={styles.mono}>{row.count.toLocaleString()}</td>
                  <td className={styles.mono}>{row.total}</td>
                  <td className={styles.mono}>{row.p50}</td>
                  <td className={styles.mono}>{row.p99}</td>
                  <td className={styles.mono}>{row.rowsRead}</td>
                  <td className={styles.mono}>{row.rpr}</td>
                  <td><DsBadge ds={row.ds} /></td>
                  <td className={styles.monoMuted}>{row.lastSeen}</td>
                </tr>

                {expanded === row.fp && (
                  <tr key={`${row.fp}-exp`}>
                    <td colSpan={10} className={styles.expandedTd}>
                      <div className={styles.expandedContent}>
                        <div className={styles.expandedLabel}>Normalized SQL</div>
                        <pre className={styles.expandedSql}>{row.fullSql}</pre>
                        <div className={styles.expandedActions}>
                          <a
                            href={`/dashboard/database?tab=sql&q=${encodeURIComponent(row.fullSql)}`}
                            className={styles.actionBtn}
                          >
                            <ExternalLink size={11} /> Open in Database Studio
                          </a>
                          <button className={styles.actionBtn}>
                            <Activity size={11} /> View EXPLAIN plan
                          </button>
                          <button className={styles.actionBtn}>
                            <ListFilter size={11} /> Recent errors
                          </button>
                          <button className={`${styles.actionBtn} ${styles.actionBtnWarn}`}>
                            Affected tables: {row.ds === 'd1'
                              ? 'agentsam_agent_run, auth_users'
                              : 'public.documents, public.codebase_chunks'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.tableFoot}>
        <span>Showing 1–{filtered.length} of 200</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <IconBtn title="Previous page"><ChevronRight size={12} style={{ transform: 'rotate(180deg)' }} /></IconBtn>
          <IconBtn title="Next page"><ChevronRight size={12} /></IconBtn>
        </div>
      </div>
    </div>
  );
}

// ── Hot table list ─────────────────────────────────────────────────────────
function HotTableList({
  title, icon, tables, emptyLabel = 'No tables for this filter',
}: { title: string; icon: React.ReactNode; tables: HotTable[]; emptyLabel?: string }) {
  return (
    <div className={styles.tableList}>
      <div className={styles.tableListHeader}>{icon} {title}</div>
      {tables.length === 0 ? (
        <div className={styles.emptyState} style={{ padding: '12px 10px', fontSize: 11 }}>
          {emptyLabel}
        </div>
      ) : (
        tables.map(t => (
          <div
            key={`${t.ds}:${t.name}`}
            className={styles.tableRow}
            onClick={() => window.location.href =
              `/dashboard/database?source=${t.ds}&table=${encodeURIComponent(t.name)}&tab=data`}
          >
            <span className={styles.tableRowName}>{t.name}</span>
            <DsBadge ds={t.ds} />
            <span className={styles.tableRowVal}>{t.val}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────
const tlDotClass: Record<string, string> = {
  ok:   styles.tlDotOk,
  err:  styles.tlDotErr,
  warn: styles.tlDotWarn,
  info: styles.tlDotInfo,
};

// ── Main component ────────────────────────────────────────────────────────
export default function DatabasesTab() {
  const [ds, setDs] = useState<DatabasesDs>('all');
  const [range, setRange] = useState<DatabasesRange>('24h');
  const [env, setEnv] = useState<Env>('production');
  const [spinning, setSpinning] = useState(false);

  const obs = useDatabasesObservability(ds, range);

  const handleRefresh = useCallback(() => {
    setSpinning(true);
    void obs.refresh().finally(() => setSpinning(false));
  }, [obs]);

  const sparks = useMemo(() => {
    const q = obs.hero?.total.d1.map((v, i) => v + (obs.hero?.total.supabase[i] ?? 0)) ?? [];
    const rr = obs.hero?.reads.d1 ?? [];
    const rw = obs.hero?.writes.d1 ?? [];
    const err = obs.hero?.errors.d1 ?? [];
    return {
      queries: q,
      rowsRead: rr,
      rowsWritten: rw,
      p95: obs.latency?.p50 ?? [],
      errors: err,
    };
  }, [obs.hero, obs.latency]);

  const topWarnings = obs.warnings.filter((w) => !w.code.startsWith('SECTION_'));
  const envWarning = topWarnings.find((w) => w.code === 'ENV_FILTER_NOT_WIRED');

  const hot = obs.hotTables;
  const largestDisplay = hot.wired ? hot.largest : largestTables;
  const mostReadDisplay = hot.wired ? hot.mostRead : mostReadTables;
  const mostWrittenDisplay = hot.wired ? hot.mostWritten : mostWrittenTables;

  const inventoryCaption = useMemo(() => {
    const c = hot.counts;
    if (!c) return null;
    const parts: string[] = [];
    if (c.d1 != null && c.d1 > 0) parts.push(`${c.d1} D1 tables`);
    if (c.supabase != null && c.supabase > 0) parts.push(`${c.supabase} Postgres tables`);
    return parts.length ? parts.join(' · ') : null;
  }, [hot.counts]);

  const d1StorageTableCount =
    hot.counts?.d1 != null ? String(hot.counts.d1) : '—';

  return (
    <div className={styles['analytics-databases']}>

      {(obs.error || topWarnings.length > 0) && (
        <div className={styles.mockBanner}>
          <AlertCircle size={13} />
          <span>
            {obs.error ? (
              <strong>{obs.error}</strong>
            ) : (
              <>
                <strong>Live telemetry (P0).</strong>{' '}
                {topWarnings.slice(0, 2).map((w) => w.message).join(' ')}
                {obs.live.kpis ? ' KPIs and charts use D1 OTLP + tool_call_log.' : ' Waiting for database activity in this window.'}
              </>
            )}
          </span>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className={styles.filterBar}>
        <CtrlGroup options={['all', 'd1', 'supabase'] as DatabasesDs[]} value={ds} onChange={setDs} />
        <CtrlGroup options={['1h', '24h', '7d', '30d'] as DatabasesRange[]} value={range} onChange={setRange} />
        <CtrlGroup options={['production', 'staging'] as Env[]} value={env} onChange={setEnv} />
        <IconBtn onClick={handleRefresh} title="Refresh data">
          <RefreshCw size={13} style={{ transform: spinning ? 'rotate(360deg)' : 'none', transition: spinning ? 'transform 0.8s linear' : 'none' }} />
        </IconBtn>
        <a href="/dashboard/database" className={styles.ctaBtn}>
          <Table2 size={13} /> Open Database Studio
        </a>
      </div>
      {env !== 'production' ? (
        <div className={styles.sectionNotice}>
          <AlertCircle size={12} />
          <span>Environment filter not wired — showing all telemetry in range.</span>
        </div>
      ) : null}

      {/* ── KPI strip ── */}
      <KpiStrip
        kpis={obs.summary?.kpis}
        miniStats={obs.summary?.miniStats}
        sparks={sparks}
        loading={obs.loading}
      />

      {/* ── Hero chart ── */}
      <HeroChart hero={obs.hero} loading={obs.loading} live={obs.live.charts} />

      {/* ── Latency + Errors ── */}
      <div className={styles.twoCol}>
        <LatencyChart latency={obs.latency} loading={obs.loading} live={obs.live.charts} />
        <ErrorChart errorChart={obs.errorChart} loading={obs.loading} live={obs.live.charts} />
      </div>

      {/* ── Query table ── */}
      <SectionNotice message={obs.sectionWarnings.get('SECTION_QUERY_TABLE_NOT_WIRED')} />
      <QueryTable />

      {/* ── Hot tables ── */}
      <div>
        <div className={styles.sectionTitle}>
          Hot tables
          {inventoryCaption ? (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: 'var(--db-text-muted)' }}>
              {inventoryCaption}
            </span>
          ) : null}
        </div>
        <div className={styles.hotGrid}>
          <HotTableList
            title="Largest"
            icon={<Database size={11} />}
            tables={largestDisplay}
            emptyLabel={hot.wired ? 'No size data (dbstat/pg_stat)' : 'Loading table inventory…'}
          />
          <HotTableList
            title="Most read"
            icon={<Eye size={11} />}
            tables={mostReadDisplay}
            emptyLabel={hot.wired ? 'No read signal in this window' : 'Loading read ranks…'}
          />
          <HotTableList
            title="Most written"
            icon={<Pencil size={11} />}
            tables={mostWrittenDisplay}
            emptyLabel={hot.wired ? 'No write signal in this window' : 'Loading write ranks…'}
          />
        </div>

        {/* Schema health */}
        <div className={styles.schemaGrid}>
          <div className={styles.tableList}>
            <div className={styles.tableListHeader} style={{ color: 'var(--db-status-degraded)' }}>
              <AlertCircle size={11} /> No primary key
            </div>
            {['agentsam_raw_events', 'cf_log_ingest_tmp'].map(t => (
              <div key={t} className={styles.tableRow}>
                <span className={styles.tableRowName}>{t}</span>
                <span className={`${styles.healthBadge} ${styles.healthBadgeWarn}`}>warn</span>
              </div>
            ))}
          </div>
          <div className={styles.tableList}>
            <div className={styles.tableListHeader} style={{ color: 'var(--db-status-degraded)' }}>
              <AlertCircle size={11} /> Missing indexes
            </div>
            {['agentsam_execution_steps', 'agentsam_tool_call_log'].map(t => (
              <div key={t} className={styles.tableRow}>
                <span className={styles.tableRowName}>{t}</span>
                <span className={`${styles.healthBadge} ${styles.healthBadgeWarn}`}>warn</span>
              </div>
            ))}
          </div>
          <div className={styles.tableList}>
            <div className={styles.tableListHeader}><ExternalLink size={11} /> FK issues</div>
            <div className={styles.emptyState}>
              <CheckCircle size={16} style={{ color: 'var(--db-status-healthy)' }} />
              No foreign key issues detected
            </div>
          </div>
        </div>
      </div>

      {/* ── Storage & capacity ── */}
      <div>
        <div className={styles.sectionTitle}>Storage &amp; capacity</div>
        <SectionNotice message={obs.sectionWarnings.get('SECTION_STORAGE_NOT_WIRED')} />
        <div className={styles.storageGrid}>
          {/* D1 */}
          <div className={styles.chartPanel}>
            <div className={styles.chartHeader}>
              <div className={styles.chartTitle}><CloudLightning size={14} /> D1 storage</div>
              <span style={{ fontSize: 11, color: 'var(--db-text-muted)' }}>inneranimalmedia-business</span>
            </div>
            <div className={styles.chartBody}>
              <div className={styles.storageMetaRow}>
                {[['Used', '52.1 MB'], ['Tables', d1StorageTableCount], ['Max', '2 GB']].map(([l, v]) => (
                  <div key={l} className={styles.storageMetaItem}>
                    <div className={styles.storageMetaLabel}>{l}</div>
                    <div className={styles.storageMetaVal}>{v}</div>
                  </div>
                ))}
              </div>
              <div className={styles.storageBar}>
                <div className={styles.storageBarFill} style={{ width: '2.6%' }} />
              </div>
              <div className={styles.storageBarLabel}>2.6% of 2 GB limit used</div>
            </div>
          </div>

          {/* Supabase */}
          <div className={styles.chartPanel}>
            <div className={styles.chartHeader}>
              <div className={styles.chartTitle}><Database size={14} /> Supabase database</div>
              <span style={{ fontSize: 11, color: 'var(--db-text-muted)' }}>dpmuvynqixblxsilnlut</span>
            </div>
            <div className={styles.chartBody}>
              <div className={styles.storageMetaRow}>
                {[['Disk used', '422 MB'], ['Provisioned', '8 GB'], ['Connections', '18']].map(([l, v]) => (
                  <div key={l} className={styles.storageMetaItem}>
                    <div className={styles.storageMetaLabel}>{l}</div>
                    <div className={styles.storageMetaVal}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--db-text-muted)', marginBottom: 8 }}>Large objects</div>
              {largeObjects.map(o => (
                <div key={o.name} className={styles.largeObjectRow}>
                  <span className={styles.largeObjectName}>{o.name}</span>
                  <span className={styles.largeObjectSize}>{o.size}</span>
                  <span className={styles.largeObjectPct}>{o.pct}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Health & incidents ── */}
      <div>
        <div className={styles.sectionTitle}>Health &amp; incidents</div>
        <div className={styles.healthGrid}>
          {(
            [
              {
                key: 'd1' as const,
                icon: <CloudLightning size={13} style={{ color: 'var(--db-accent)' }} />,
                name: 'D1',
                card: obs.summary?.healthCards?.d1,
              },
              {
                key: 'hyperdrive' as const,
                icon: <Cloud size={13} style={{ color: 'var(--db-accent-3)' }} />,
                name: 'Hyperdrive',
                card: obs.summary?.healthCards?.hyperdrive,
              },
              {
                key: 'supabase' as const,
                icon: <Database size={13} style={{ color: 'var(--db-accent-2)' }} />,
                name: 'Supabase Postgres',
                card: obs.summary?.healthCards?.supabase,
              },
              {
                key: 'lastEvents' as const,
                icon: <CircleAlert size={13} />,
                name: 'Last events',
                card: obs.summary?.healthCards?.lastEvents,
              },
            ]
          ).map(({ key, icon, name, card }) => {
            const status = card?.status ?? 'unknown';
            const statusClass =
              status === 'healthy'
                ? styles.statusLabelHealthy
                : status === 'error'
                  ? styles.statusLabelError
                  : styles.statusLabelDegraded;
            return (
              <div key={key} className={styles.healthCard}>
                <div className={styles.healthCardTop}>
                  <div className={styles.healthCardName}>{icon} {name}</div>
                  {card?.badge ? (
                    <span className={`${styles.healthBadge} ${styles.healthBadgeHealthy}`}>{card.badge}</span>
                  ) : (
                    <span className={`${styles.statusLabel} ${statusClass}`}>{status}</span>
                  )}
                </div>
                <div className={styles.healthCardBody}>
                  {(card?.lines ?? ['Not wired']).map((l) => (
                    <div key={l}>{l}</div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Recent events ── */}
      <div>
        <div className={styles.sectionTitle}>Recent database events</div>
        <SectionNotice message={obs.sectionWarnings.get('SECTION_EVENTS_NOT_WIRED')} />
        <div className={styles.timeline}>
          {timelineEvents.map((e, i) => (
            <div key={i} className={styles.timelineItem}>
              <span className={styles.tlTime}>{e.time}</span>
              <span className={styles.tlDesc}>
                <span className={`${styles.tlDot} ${tlDotClass[e.kind]}`} />
                {e.label} &mdash; <span className={styles.tlDetail}>{e.detail}</span>
              </span>
              <span className={styles.tlMeta}>{e.meta}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
