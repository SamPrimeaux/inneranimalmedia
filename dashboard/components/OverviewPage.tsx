import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

type ApiEnvelope<T> = { data?: T; generated_at?: number; error?: string; failed?: string[] };
type AnyRow = Record<string, any>;

type ProviderColorRow = {
  slug: string;
  primary_color: string;
  secondary_color?: string | null;
  text_on_color?: string | null;
  display_name?: string | null;
  category?: string | null;
};

function n(v: any): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function money(v: any) {
  return `$${n(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function money2(v: any) {
  return `$${n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDate(v: any) {
  if (!v) return 'n/a';
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 16) : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function relTime(v: any) {
  if (!v) return 'never';
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function duration(ms: any) {
  const x = n(ms);
  if (!x) return '0ms';
  if (x < 1000) return `${Math.round(x)}ms`;
  return `${Math.round(x / 1000)}s`;
}

async function getData<T>(url: string): Promise<ApiEnvelope<T>> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) return { data: {} as T, error: 'partial', failed: [url] };
  return res.json();
}

class PanelBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="ov-inlineNotice">Data unavailable</div>;
    return this.props.children;
  }
}

const IconDiamond = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M8 1L15 8L8 15L1 8Z" />
  </svg>
);
const IconCircle = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="8" cy="8" r="5.5" />
  </svg>
);
const IconList = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
    <rect x="2" y="3" width="12" height="1.5" rx="0.75" />
    <rect x="2" y="7" width="9" height="1.5" rx="0.75" />
    <rect x="2" y="11" width="10" height="1.5" rx="0.75" />
  </svg>
);
const IconClock = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5v3l2 1.5" />
  </svg>
);
const IconGrid = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </svg>
);
const IconCheck = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M3 8l3.5 3.5L13 4" />
  </svg>
);
const IconDatabase = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <ellipse cx="8" cy="5" rx="5" ry="2" />
    <path d="M3 5v6c0 1.1 2.24 2 5 2s5-.9 5-2V5" />
    <path d="M3 8c0 1.1 2.24 2 5 2s5-.9 5-2" />
  </svg>
);
const IconDoc = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M4 2h5l3 3v9H4z" />
    <path d="M9 2v3h3" />
  </svg>
);
const IconApi = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M2 8h3M11 8h3M6 5l-2 3 2 3M10 5l2 3-2 3" />
  </svg>
);
const IconDots = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="8" r="1.2" />
    <circle cx="8" cy="8" r="1.2" />
    <circle cx="13" cy="8" r="1.2" />
  </svg>
);
const IconClose = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M3 3l10 10M13 3L3 13" />
  </svg>
);
const IconArrow = ({ size = 10 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);

const ShortcutProjects = () => <IconGrid size={16} />;
const ShortcutTasks = () => <IconList size={16} />;
const ShortcutDatabase = () => <IconDatabase size={16} />;
const ShortcutLibrary = () => <IconDoc size={16} />;
const ShortcutDocs = () => <IconDoc size={16} />;
const ShortcutApi = () => <IconApi size={16} />;

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [providerColors, setProviderColors] = useState<Record<string, string>>({});
  const [providerMeta, setProviderMeta] = useState<Record<string, ProviderColorRow>>({});
  const [providerColorsLoading, setProviderColorsLoading] = useState(false);

  const [kpiLoading, setKpiLoading] = useState(true);
  const [financeLoading, setFinanceLoading] = useState(true);
  const [agentLoading, setAgentLoading] = useState(true);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [commandsLoading, setCommandsLoading] = useState(true);

  const [kpiError, setKpiError] = useState(false);
  const [financeError, setFinanceError] = useState(false);
  const [agentError, setAgentError] = useState(false);
  const [goalsError, setGoalsError] = useState(false);
  const [commandsError, setCommandsError] = useState(false);

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [tick, setTick] = useState(new Date());
  const [kpi, setKpi] = useState<any>({});
  const [finance, setFinance] = useState<any>({});
  const [agent, setAgent] = useState<any>({});
  const [goals, setGoals] = useState<any>({});
  const [commands, setCommands] = useState<any>({});
  const [activity, setActivity] = useState<any>({});

  const [spendPeriod, setSpendPeriod] = useState<14 | 30 | 90>(30);
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const neutral = '#94a3b8';
  const pc = useCallback((slug: string) => {
    const v = providerColors[slug];
    return v || neutral;
  }, [providerColors]);

  const fetchProviderColors = useCallback(async () => {
    setProviderColorsLoading(true);
    try {
      const res = await fetch('/api/provider-colors', { credentials: 'include' });
      const rows = await res.json().catch(() => ([]));
      const list: ProviderColorRow[] = Array.isArray(rows) ? rows : (rows?.provider_colors || rows?.data || rows?.colors || []);
      const by: Record<string, string> = {};
      const meta: Record<string, ProviderColorRow> = {};
      for (const r of list) {
        if (!r?.slug) continue;
        by[String(r.slug)] = String(r.primary_color || '').trim() || neutral;
        meta[String(r.slug)] = r;
      }
      setProviderColors(by);
      setProviderMeta(meta);
    } catch (_) {
      setProviderColors({});
      setProviderMeta({});
    } finally {
      setProviderColorsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setKpiLoading(true);
    setFinanceLoading(true);
    setAgentLoading(true);
    setGoalsLoading(true);
    setCommandsLoading(true);
    setKpiError(false);
    setFinanceError(false);
    setAgentError(false);
    setGoalsError(false);
    setCommandsError(false);

    const [k, f, a, g, c, act] = await Promise.all([
      getData<any>('/api/overview/kpi-strip').catch(() => ({ data: {}, error: 'partial' })),
      getData<any>(`/api/overview/finance-charts?period=${spendPeriod}`).catch(() => ({ data: {}, error: 'partial' })),
      getData<any>('/api/overview/agent-activity').catch(() => ({ data: {}, error: 'partial' })),
      getData<any>('/api/overview/goals-launch').catch(() => ({ data: {}, error: 'partial' })),
      getData<any>('/api/overview/commands-workflows').catch(() => ({ data: {}, error: 'partial' })),
      fetch('/api/overview/activity-strip', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
    ]);

    setKpi(k.data || {});
    setFinance(f.data || {});
    setAgent(a.data || {});
    setGoals(g.data || {});
    setCommands(c.data || {});
    setActivity(act || {});

    setKpiError(!!k.error);
    setFinanceError(!!f.error);
    setAgentError(!!a.error);
    setGoalsError(!!g.error);
    setCommandsError(!!c.error);

    setKpiLoading(false);
    setFinanceLoading(false);
    setAgentLoading(false);
    setGoalsLoading(false);
    setCommandsLoading(false);
    setLastRefresh(new Date());
  }, [spendPeriod]);

  useEffect(() => {
    fetchProviderColors();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) clearInterval(timer);
      if (typeof document !== 'undefined' && document.hidden) return;
      void load();
      timer = setInterval(load, 120_000);
    };
    start();
    const onVis = () => {
      if (document.hidden) {
        if (timer) clearInterval(timer);
        timer = null;
      } else start();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (timer) clearInterval(timer);
    };
  }, [fetchProviderColors, load]);

  const financeDaily = useMemo(() => {
    const byDay = new Map<string, AnyRow>();
    (finance.daily_by_provider || []).forEach((r: AnyRow) => {
      const row = byDay.get(r.day) || { day: String(r.day).slice(5) };
      row[r.provider] = n(r.total);
      byDay.set(r.day, row);
    });
    return [...byDay.values()];
  }, [finance.daily_by_provider]);

  const execData = useMemo(() => {
    const map = new Map<string, AnyRow>();
    (agent.executions_by_day || []).forEach((r: AnyRow) => {
      const row = map.get(r.day) || { day: String(r.day).slice(5) };
      row[r.execution_type || 'other'] = n(r.count);
      map.set(r.day, row);
    });
    return [...map.values()];
  }, [agent.executions_by_day]);

  const kpiCards = useMemo(() => {
    const cards = Array.isArray(kpi.cards) ? kpi.cards : [];
    const byKey: Record<string, AnyRow> = {};
    for (const c of cards) if (c?.key) byKey[String(c.key)] = c;
    return { cards, byKey };
  }, [kpi.cards]);

  const activeTimer = kpiCards.byKey?.hours_week?.active_timer || null;

  const workflowDonut = useMemo(() => {
    const h = commands.workflow_health || commands.workflow_health_summary || {};
    const ran = n(h.ran_once ?? h.run_at_least_once);
    const never = n(h.never_run);
    const failed = n(h.failed);
    const total = Math.max(1, ran + never + failed);
    return {
      rows: [
        { name: 'Completed', value: ran, color: pc('cursor_api') },
        { name: 'Never run', value: never, color: neutral },
        { name: 'Failed', value: failed, color: pc('openai_api') },
      ],
      percent: Math.round((ran / total) * 100),
      ran,
      never,
      failed,
      total,
    };
  }, [commands, pc]);

  const topProviders = useMemo(() => {
    const rows = Array.isArray(finance.top_providers) ? finance.top_providers : [];
    return rows.slice(0, 4);
  }, [finance.top_providers]);

  const shortcuts = useMemo(() => ([
    { label: 'Projects', icon: <ShortcutProjects />, to: '/dashboard/projects' },
    { label: 'Tasks', icon: <ShortcutTasks />, to: '/dashboard/tasks' },
    { label: 'D1 Studio', icon: <ShortcutDatabase />, to: '/dashboard/d1' },
    { label: 'Library', icon: <ShortcutLibrary />, to: '/dashboard/library' },
    { label: 'Docs', icon: <ShortcutDocs />, to: '/dashboard/docs' },
    { label: 'API Explorer', icon: <ShortcutApi />, to: '/dashboard/apiguide' },
  ]), []);

  const closeDrawer = useCallback(() => setActiveDrawer(null), []);

  const kpiAccent = useMemo(() => ({
    burn: pc('cloudflare'),
    ai: pc('anthropic_api'),
    infra: pc('cf_workers'),
    agents: 'var(--color-success)',
    hours: 'var(--color-warning)',
    mcp: pc('workers_ai'),
    tasks: 'var(--color-primary, var(--solar-blue))',
  }), [pc]);

  const SpendTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="ov-tooltip">
        <div className="ov-tooltipTitle">{label}</div>
        <div className="ov-tooltipRows">
          {payload.map((p: any) => {
            const key = String(p.dataKey || '');
            const slug =
              key === 'Anthropic' ? 'anthropic_api' :
              key === 'OpenAI' ? 'openai_api' :
              key === 'Cloudflare' ? 'cloudflare' :
              key === 'Cursor' ? 'cursor_api' :
              key;
            const dot = providerColorsLoading ? neutral : pc(slug);
            return (
              <div key={key} className="ov-tooltipRow">
                <span className="ov-dot" style={{ background: dot }} />
                <span className="ov-tooltipKey">{p.name || key}</span>
                <span className="ov-tooltipVal">{money2(p.value)}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [pc, providerColorsLoading]);

  return (
    <>
      <style>{`
        .ov-wrap{position:relative;font-family:var(--font-sans);color:var(--color-text-primary);font-weight:400}
        .ov-header{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px}
        .ov-title{display:flex;flex-direction:column;gap:3px}
        .ov-titleTop{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--color-text-secondary);font-weight:500}
        .ov-h1{margin:0;font-size:18px;line-height:1.2;font-weight:500;color:var(--color-text-primary)}
        .ov-sub{margin:0;font-size:12px;color:var(--color-text-secondary)}
        .ov-actions{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--color-text-secondary)}
        .ov-btn{border:.5px solid var(--color-border-tertiary);background:var(--color-background-primary);color:var(--color-text-primary);border-radius:10px;padding:8px 10px;display:inline-flex;align-items:center;gap:8px;font-weight:500}
        .ov-btn:disabled{opacity:.55;cursor:default}
        .ov-small{font-size:10px;color:var(--color-text-secondary)}

        .ov-kpiGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px}
        .ov-kpi{border:.5px solid var(--color-border-tertiary);background:var(--color-background-primary);border-radius:10px;padding:12px;min-height:112px;display:flex;flex-direction:column;gap:8px}
        .ov-kpiTop{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .ov-kpiLeft{display:flex;align-items:center;gap:8px;min-width:0}
        .ov-iconSq{width:18px;height:18px;border-radius:6px;display:grid;place-items:center;color:var(--color-background-primary);flex:0 0 auto}
        .ov-kpiLabel{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-text-secondary);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ov-kpiValueRow{display:flex;align-items:center;gap:8px}
        .ov-kpiValue{font-size:20px;font-weight:500;color:var(--color-text-primary);line-height:1.05}
        .ov-pulseDot{width:6px;height:6px;border-radius:999px;background:var(--color-success);animation:ovPulse 1.2s infinite}
        @keyframes ovPulse{50%{opacity:.35;transform:scale(.8)}}
        .ov-kpiSubRow{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .ov-kpiSub{font-size:10px;color:var(--color-text-secondary)}
        .ov-delta{font-size:10px;font-weight:500}
        .ov-deltaUp{color:var(--color-success)}
        .ov-deltaDown{color:var(--color-danger)}
        .ov-deltaFlat{color:var(--color-text-secondary)}
        .ov-spark{height:34px}

        .ov-mainGrid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:12px;margin-bottom:12px}
        .ov-bottomGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
        @media(max-width:640px){.ov-mainGrid{grid-template-columns:1fr}}
        @media(max-width:480px){
          .ov-kpiGrid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .ov-kpi{padding:10px}
          .ov-kpiValue{font-size:16px}
          .ov-bottomGrid{grid-template-columns:1fr}
        }
        @media(min-width:480px) and (max-width:768px){
          .ov-mainGrid{grid-template-columns:1fr}
          .ov-bottomGrid{grid-template-columns:repeat(2,minmax(0,1fr))}
        }

        .ov-card{border:.5px solid var(--color-border-tertiary);background:var(--color-background-primary);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;min-width:0}
        .ov-cardHead{padding:12px;border-bottom:.5px solid var(--color-border-tertiary);display:flex;align-items:center;justify-content:space-between;gap:10px}
        .ov-cardTitle{display:flex;align-items:center;gap:8px;font-weight:500;color:var(--color-text-primary);font-size:12px}
        .ov-cardBody{padding:12px;min-width:0}
        .ov-inlineNotice{font-size:12px;color:var(--color-text-secondary);padding:10px;border:.5px solid var(--color-border-tertiary);border-radius:10px;background:var(--color-background-primary)}
        .ov-link{background:transparent;border:0;color:var(--color-primary,var(--color-text-primary));font-size:11px;font-weight:500;padding:0;display:inline-flex;align-items:center;gap:6px;cursor:pointer}
        .ov-link:disabled{opacity:.6;cursor:default}

        .ov-toggle{display:inline-flex;gap:6px;background:var(--color-background-secondary);border:.5px solid var(--color-border-tertiary);border-radius:20px;padding:3px}
        .ov-toggle button{border:0;background:transparent;color:var(--color-text-secondary);font-size:11px;font-weight:500;padding:6px 10px;border-radius:20px;cursor:pointer}
        .ov-toggle button.active{background:var(--color-primary,var(--solar-blue));color:var(--color-background-primary)}

        .ov-tooltip{background:var(--color-background-primary);border:.5px solid var(--color-border-tertiary);border-radius:10px;padding:10px;min-width:200px}
        .ov-tooltipTitle{font-size:11px;font-weight:500;color:var(--color-text-primary);margin-bottom:6px}
        .ov-tooltipRows{display:flex;flex-direction:column;gap:6px}
        .ov-tooltipRow{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;color:var(--color-text-secondary)}
        .ov-tooltipKey{display:inline-flex;align-items:center;gap:8px}
        .ov-dot{width:10px;height:10px;border-radius:2px;display:inline-block}
        .ov-tooltipVal{font-variant-numeric:tabular-nums;color:var(--color-text-primary);font-weight:500}

        .ov-table{width:100%;border-collapse:collapse;font-size:11px}
        .ov-table th{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-text-secondary);font-weight:500;text-align:left;padding:8px 0;border-bottom:.5px solid var(--color-border-tertiary)}
        .ov-table td{padding:9px 0;border-bottom:.5px solid var(--color-border-tertiary);color:var(--color-text-primary);vertical-align:middle}

        .ov-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:500}
        .ov-pillDot{width:5px;height:5px;border-radius:999px}
        .ov-pillHealthy{background:var(--color-success-soft);color:var(--color-success-strong)}
        .ov-pillDegraded{background:var(--color-warning-soft);color:var(--color-warning-strong)}
        .ov-pillCritical{background:var(--color-danger-soft);color:var(--color-danger-strong)}
        .ov-pillActive{background:var(--color-info-soft);color:var(--color-info-strong)}

        .ov-batchRow{display:flex;align-items:center;gap:12px}
        .ov-batchLegend{display:flex;flex-direction:column;gap:8px}
        .ov-legendItem{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:10px;color:var(--color-text-secondary)}
        .ov-legendItem strong{font-weight:500;color:var(--color-text-primary)}
        .ov-centerPct{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
        .ov-centerPct strong{font-size:18px;font-weight:500;color:var(--color-text-primary);line-height:1}
        .ov-centerPct span{font-size:10px;color:var(--color-text-secondary)}

        .ov-topServices{display:flex;flex-direction:column}
        .ov-topRow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:.5px solid var(--color-border-tertiary)}
        .ov-topRow:last-child{border-bottom:0}
        .ov-topLeft{min-width:0}
        .ov-topName{font-size:11px;font-weight:500;color:var(--color-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ov-topSub{font-size:10px;color:var(--color-text-secondary);margin-top:2px}
        .ov-topAmt{font-size:12px;font-weight:500}

        .ov-shortcuts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
        .ov-shortcut{border:.5px solid var(--color-border-tertiary);background:var(--color-background-secondary);border-radius:7px;padding:7px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer}
        .ov-shortcut:hover{border-color:var(--color-border-focus);background:var(--color-background-secondary)}
        .ov-shortIcon{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;color:var(--color-background-primary)}
        .ov-shortLabel{font-size:9px;color:var(--color-text-secondary);font-weight:500;text-align:center}

        .ov-agentWidget{margin-top:10px;border:.5px solid var(--color-border-focus);background:var(--color-background-info);border-radius:8px;padding:9px;display:flex;align-items:center;gap:10px}
        .ov-avatar{width:30px;height:30px;border-radius:999px;background:var(--color-primary,var(--solar-blue));color:var(--color-background-primary);display:grid;place-items:center;font-size:10px;font-weight:500;flex:0 0 auto}
        .ov-agentMid{flex:1;min-width:0}
        .ov-agentName{font-size:11px;font-weight:500;color:var(--color-text-info)}
        .ov-agentSpend{font-size:14px;font-weight:500;color:var(--color-text-primary);margin-top:2px}
        .ov-bar{height:3px;border-radius:2px;background:var(--color-border-focus);overflow:hidden;margin-top:6px}
        .ov-barFill{height:100%;background:var(--color-primary,var(--solar-blue))}
        .ov-agentBtn{border:0;background:var(--color-primary,var(--solar-blue));color:var(--color-background-primary);border-radius:5px;padding:4px 9px;font-size:10px;font-weight:500;cursor:pointer;flex:0 0 auto}

        .ov-drawerScrim{position:absolute;inset:0;background:rgba(0,0,0,.12);z-index:9}
        .ov-drawer{position:absolute;top:0;right:0;bottom:0;width:360px;max-width:100%;background:var(--color-background-primary);border-left:.5px solid var(--color-border-tertiary);z-index:10;display:flex;flex-direction:column}
        .ov-drawerHead{padding:12px;border-bottom:.5px solid var(--color-border-tertiary);display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
        .ov-drawerTitle{display:flex;flex-direction:column;gap:3px;min-width:0}
        .ov-drawerTitle strong{font-size:12px;font-weight:500;color:var(--color-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ov-drawerTitle span{font-size:10px;color:var(--color-text-secondary)}
        .ov-drawerClose{border:0;background:transparent;color:var(--color-text-secondary);padding:6px;border-radius:8px;cursor:pointer}
        .ov-drawerBody{padding:12px;overflow:auto}
        @media(max-width:480px){
          .ov-drawer{left:0;right:0;top:auto;height:75%;width:auto;border-left:0;border-top:.5px solid var(--color-border-tertiary)}
        }
      `}</style>

      <div className="ov-wrap">
        <header className="ov-header">
          <div className="ov-title">
            <div className="ov-titleTop">
              <span className="ov-iconSq" style={{ background: pc('cf_workers') }} aria-hidden="true"><IconCircle size={12} /></span>
              Ops overview
            </div>
            <h1 className="ov-h1">Overview</h1>
            <p className="ov-sub">Live cost, health, and execution telemetry</p>
          </div>
          <div className="ov-actions">
            <span className="ov-small">Last refreshed: {lastRefresh ? lastRefresh.toLocaleTimeString() : ''}</span>
            <button className="ov-btn" onClick={() => { fetchProviderColors(); load(); }} disabled={kpiLoading && financeLoading && agentLoading && goalsLoading && commandsLoading}>
              <span className="ov-iconSq" style={{ background: pc('cloudflare') }} aria-hidden="true"><IconArrow size={12} /></span>
              Refresh
            </button>
          </div>
        </header>

        <section className="ov-kpiGrid">
          <KpiCard
            label="Monthly Burn"
            value={money2(kpi.monthly_burn)}
            sub="this month"
            delta={String(kpi.monthly_burn_delta ?? '')}
            deltaDir={String(kpi.monthly_burn_delta_dir || 'flat')}
            sparkData={kpi.monthly_burn_trend || kpiCards.byKey?.monthly_burn?.trend || []}
            accentColor={kpiAccent.burn}
            loading={kpiLoading}
            error={kpiError}
            icon={<IconDiamond />}
            onClick={() => setActiveDrawer('burn')}
          />
          <KpiCard
            label="AI Tooling"
            value={money2(kpi.ai_tooling_cost)}
            sub="subscriptions + API"
            delta={String(kpi.ai_tooling_delta ?? '')}
            deltaDir={String(kpi.ai_tooling_delta_dir || 'flat')}
            sparkData={kpi.ai_tooling_trend || kpiCards.byKey?.ai_tooling?.trend || []}
            accentColor={kpiAccent.ai}
            loading={kpiLoading}
            error={kpiError}
            icon={<IconDiamond />}
            onClick={() => setActiveDrawer('ai')}
          />
          <KpiCard
            label="Infra / Bills"
            value={money2(kpi.infra_cost)}
            sub="CF services and bills"
            delta={String(kpi.infra_cost_delta ?? '')}
            deltaDir={String(kpi.infra_cost_delta_dir || 'flat')}
            sparkData={kpi.infra_cost_trend || kpiCards.byKey?.infra?.trend || []}
            accentColor={kpiAccent.infra}
            loading={kpiLoading}
            error={kpiError}
            icon={<IconCircle />}
            onClick={() => setActiveDrawer('infra')}
          />
          <KpiCard
            label="Agent Calls"
            value={n(kpi.agent_calls).toLocaleString()}
            sub="this week"
            delta={String(kpi.agent_calls_delta ?? '')}
            deltaDir={String(kpi.agent_calls_delta_dir || 'flat')}
            sparkData={kpi.agent_calls_trend || kpiCards.byKey?.agent_calls?.trend || []}
            accentColor={kpiAccent.agents}
            loading={kpiLoading}
            error={kpiError}
            icon={<IconCheck />}
            onClick={() => setActiveDrawer('agents')}
          />
          <KpiCard
            label="Hours This Week"
            value={`${n(kpi.hours_this_week).toFixed(1)}h`}
            sub={activeTimer ? 'Timer running' : 'No active timer'}
            delta={String(kpi.hours_week_delta ?? '')}
            deltaDir={String(kpi.hours_week_delta_dir || 'flat')}
            sparkData={kpi.hours_week_trend || kpiCards.byKey?.hours_week?.trend || []}
            accentColor={kpiAccent.hours}
            loading={kpiLoading}
            error={kpiError}
            icon={<IconClock />}
            pulse={!!activeTimer}
            onClick={() => setActiveDrawer('hours')}
          />
          <KpiCard
            label="MCP Calls Today"
            value={n(kpi.mcp_calls_today).toLocaleString()}
            sub={`${Math.round(n(kpi.mcp_success_rate))}% success`}
            delta={String(kpi.mcp_calls_delta ?? '')}
            deltaDir={String(kpi.mcp_calls_delta_dir || 'flat')}
            sparkData={kpi.mcp_calls_trend || kpiCards.byKey?.mcp_calls?.trend || []}
            accentColor={kpiAccent.mcp}
            loading={kpiLoading}
            error={kpiError}
            icon={<IconGrid />}
            onClick={() => setActiveDrawer('mcp')}
          />
          <KpiCard
            label="Open Tasks"
            value={n(kpi.open_tasks).toLocaleString()}
            sub={`${n(kpi.blocked_tasks)} blocked`}
            delta={String(kpi.tasks_delta ?? '')}
            deltaDir={String(kpi.tasks_delta_dir || 'flat')}
            sparkData={kpi.tasks_trend || kpiCards.byKey?.open_tasks?.trend || []}
            accentColor={kpiAccent.tasks}
            loading={kpiLoading}
            error={kpiError}
            icon={<IconList />}
            subTone={n(kpi.blocked_tasks) > 0 ? 'danger' : 'muted'}
            onClick={() => setActiveDrawer('tasks')}
          />
        </section>

        <section className="ov-mainGrid">
          <div className="ov-card">
            <div className="ov-cardHead">
              <div className="ov-cardTitle">
                <span className="ov-iconSq" style={{ background: pc('anthropic_api') }} aria-hidden="true"><IconDiamond size={12} /></span>
                AI Spend
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="ov-toggle" role="tablist" aria-label="Spend period">
                  <button type="button" className={spendPeriod === 14 ? 'active' : ''} onClick={() => setSpendPeriod(14)}>14d</button>
                  <button type="button" className={spendPeriod === 30 ? 'active' : ''} onClick={() => setSpendPeriod(30)}>30d</button>
                  <button type="button" className={spendPeriod === 90 ? 'active' : ''} onClick={() => setSpendPeriod(90)}>90d</button>
                </div>
                <button className="ov-link" type="button" onClick={() => navigate('/dashboard/finance')}>
                  Detail <IconArrow />
                </button>
              </div>
            </div>
            <div className="ov-cardBody">
              {financeError ? <div className="ov-inlineNotice">Data unavailable</div> : (
                <div style={{ height: 170 }}>
                  <PanelBoundary>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={financeDaily}>
                        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: 'var(--color-text-secondary)' }} />
                        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: 'var(--color-text-secondary)' }} tickFormatter={(v) => money2(v)} />
                        <Tooltip content={<SpendTooltip />} />
                        <Area name="Anthropic" dataKey="anthropic" type="monotone" stroke={providerColorsLoading ? neutral : pc('anthropic_api')} fill={providerColorsLoading ? neutral : pc('anthropic_api')} fillOpacity={0.08} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        <Area name="OpenAI" dataKey="openai" type="monotone" stroke={providerColorsLoading ? neutral : pc('openai_api')} fill={providerColorsLoading ? neutral : pc('openai_api')} fillOpacity={0.06} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        <Area name="Cloudflare" dataKey="cloudflare" type="monotone" stroke={providerColorsLoading ? neutral : pc('cloudflare')} fill={providerColorsLoading ? neutral : pc('cloudflare')} fillOpacity={0.05} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        <Area name="Cursor" dataKey="cursor" type="monotone" stroke={providerColorsLoading ? neutral : pc('cursor_api')} fill={providerColorsLoading ? neutral : pc('cursor_api')} fillOpacity={0.04} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </PanelBoundary>
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
                {[
                  { slug: 'anthropic_api', label: providerMeta.anthropic_api?.display_name || 'Anthropic' },
                  { slug: 'openai_api', label: providerMeta.openai_api?.display_name || 'OpenAI' },
                  { slug: 'cloudflare', label: providerMeta.cloudflare?.display_name || 'Cloudflare' },
                  { slug: 'cursor_api', label: providerMeta.cursor_api?.display_name || 'Cursor' },
                ].map((it) => (
                  <div key={it.slug} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--color-text-secondary)' }}>
                    <span className="ov-dot" style={{ background: providerColorsLoading ? neutral : pc(it.slug) }} />
                    {it.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ov-card">
            <div className="ov-cardHead">
              <div className="ov-cardTitle">
                <span className="ov-iconSq" style={{ background: pc('cf_workers') }} aria-hidden="true"><IconCircle size={12} /></span>
                Worker Health
              </div>
              <button className="ov-link" type="button" onClick={() => navigate('/dashboard/health')}>
                View all <IconArrow />
              </button>
            </div>
            <div className="ov-cardBody">
              <PanelBoundary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <table className="ov-table" aria-label="Monthly comparison">
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Cost</th>
                          <th>vs budget</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(finance.monthly_comparison || []).slice(0, 3).map((r: AnyRow, idx: number) => {
                          const delta = n(r.vs_budget);
                          const tone = delta > 0 ? 'ov-deltaDown' : delta < 0 ? 'ov-deltaUp' : 'ov-deltaFlat';
                          return (
                            <tr key={idx}>
                              <td style={{ fontWeight: 500 }}>{String(r.month || '').slice(0, 7) || ''}</td>
                              <td>{money2(r.cost)}</td>
                              <td className={tone}>{delta === 0 ? '0' : `${delta > 0 ? '+' : ''}${money2(delta)}`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    {(kpi.worker_health || kpi.services || []).slice(0, 4).map((s: AnyRow, idx: number) => {
                      const status = String(s.status || s.health || 'unknown').toLowerCase();
                      const label = s.name || s.service || s.worker || `service_${idx + 1}`;
                      const stamp = relTime(s.updated_at || s.last_seen_at || s.last_health_check_at);
                      const pill =
                        status === 'healthy' || status === 'ok' ? 'ov-pillHealthy'
                          : status === 'degraded' || status === 'warn' ? 'ov-pillDegraded'
                            : status === 'critical' || status === 'error' ? 'ov-pillCritical'
                              : 'ov-pillActive';
                      const dotColor =
                        pill === 'ov-pillHealthy' ? 'var(--color-success-strong)'
                          : pill === 'ov-pillDegraded' ? 'var(--color-warning-strong)'
                            : pill === 'ov-pillCritical' ? 'var(--color-danger-strong)'
                              : 'var(--color-info-strong)';
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: idx === 3 ? 0 : '.5px solid var(--color-border-tertiary)' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 2 }}>{stamp}</div>
                          </div>
                          <span className={`ov-pill ${pill}`}>
                            <span className="ov-pillDot" style={{ background: dotColor }} />
                            {status === 'ok' ? 'Healthy' : status === 'warn' ? 'Degraded' : status === 'error' ? 'Critical' : status || 'Active'}
                          </span>
                        </div>
                      );
                    })}
                    {!((kpi.worker_health || kpi.services || []).length) && (
                      <div className="ov-inlineNotice">No health data</div>
                    )}
                  </div>
                </div>
              </PanelBoundary>
            </div>
          </div>
        </section>

        <section className="ov-bottomGrid">
          <div className="ov-card">
            <div className="ov-cardHead">
              <div className="ov-cardTitle">
                <span className="ov-iconSq" style={{ background: pc('cursor_api') }} aria-hidden="true"><IconGrid size={12} /></span>
                Batch Usage
              </div>
            </div>
            <div className="ov-cardBody">
              {commandsError ? <div className="ov-inlineNotice">Data unavailable</div> : (
                <div className="ov-batchRow">
                  <div style={{ position: 'relative', width: 88, height: 88, flex: '0 0 auto' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={workflowDonut.rows}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={30}
                          outerRadius={44}
                          paddingAngle={2}
                          isAnimationActive={false}
                        >
                          {workflowDonut.rows.map((r, idx) => <Cell key={idx} fill={providerColorsLoading ? neutral : r.color} stroke="transparent" />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="ov-centerPct">
                      <strong>{workflowDonut.percent}%</strong>
                      <span>run</span>
                    </div>
                  </div>
                  <div className="ov-batchLegend">
                    {workflowDonut.rows.map((r) => (
                      <div key={r.name} className="ov-legendItem">
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span className="ov-pillDot" style={{ width: 8, height: 8, background: providerColorsLoading ? neutral : r.color }} />
                          {r.name}
                        </span>
                        <strong>{n(r.value).toLocaleString()}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                <div>Total workflows: <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{workflowDonut.total}</span></div>
                <div style={{ color: workflowDonut.never > 0 ? 'var(--color-warning-strong,#d97706)' : 'var(--color-text-secondary)' }}>
                  Never triggered: <span style={{ fontWeight: 500, color: workflowDonut.never > 0 ? 'var(--color-warning-strong,#d97706)' : 'var(--color-text-primary)' }}>{workflowDonut.never}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="ov-card">
            <div className="ov-cardHead">
              <div className="ov-cardTitle">
                <span className="ov-iconSq" style={{ background: pc('cloudflare') }} aria-hidden="true"><IconDiamond size={12} /></span>
                Top Services
              </div>
              <button className="ov-link" type="button" onClick={() => navigate('/dashboard/finance')}>
                Show all <IconArrow />
              </button>
            </div>
            <div className="ov-cardBody">
              {financeError ? <div className="ov-inlineNotice">Data unavailable</div> : (
                <div className="ov-topServices">
                  {topProviders.map((p: AnyRow, idx: number) => {
                    const slug = String(p.provider || '').toLowerCase();
                    const display = providerMeta[slug]?.display_name || p.display_name || p.provider || '';
                    const amt = n(p.total);
                    const color = providerColorsLoading ? neutral : (providerColors[slug] || 'var(--color-success,#10b981)');
                    return (
                      <div key={idx} className="ov-topRow">
                        <div className="ov-topLeft">
                          <div className="ov-topName">{display}</div>
                          <div className="ov-topSub">Past 7 days · {money2(amt)}</div>
                        </div>
                        <div className="ov-topAmt" style={{ color }}>{`+${money2(amt)}`}</div>
                      </div>
                    );
                  })}
                  {topProviders.length === 0 && <div className="ov-inlineNotice">Data unavailable</div>}
                </div>
              )}
            </div>
          </div>

          <div className="ov-card">
            <div className="ov-cardHead">
              <div className="ov-cardTitle">
                <span className="ov-iconSq" style={{ background: pc('cf_d1') }} aria-hidden="true"><IconGrid size={12} /></span>
                Shortcuts
              </div>
            </div>
            <div className="ov-cardBody">
              <div className="ov-shortcuts">
                {shortcuts.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    className="ov-shortcut"
                    onClick={() => navigate(s.to)}
                  >
                    <span className="ov-shortIcon" style={{ background: pc('cursor_api') }} aria-hidden="true">{s.icon}</span>
                    <span className="ov-shortLabel">{s.label}</span>
                  </button>
                ))}
              </div>

              <div className="ov-agentWidget">
                <div className="ov-avatar">AS</div>
                <div className="ov-agentMid">
                  <div className="ov-agentName">Agent Sam</div>
                  <div className="ov-agentSpend">{money2(kpi.agent_sam_spend || 37)} / {money2(kpi.agent_sam_budget || 200)}</div>
                  <div className="ov-bar">
                    <div
                      className="ov-barFill"
                      style={{ width: `${Math.max(0, Math.min(100, (n(kpi.agent_sam_spend || 37) / Math.max(1, n(kpi.agent_sam_budget || 200))) * 100))}%` }}
                    />
                  </div>
                </div>
                <button type="button" className="ov-agentBtn" onClick={() => navigate('/dashboard/settings')}>
                  Set limit
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="ov-card" style={{ marginTop: 12 }}>
          <div className="ov-cardHead">
            <div className="ov-cardTitle">
              <span className="ov-iconSq" style={{ background: pc('github') }} aria-hidden="true"><IconList size={12} /></span>
              Active Projects
            </div>
          </div>
          <div className="ov-cardBody">
            <PanelBoundary>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {(activity.projects?.top || []).map((p: AnyRow, idx: number) => {
                  const status = String(p.status || 'active');
                  return (
                    <div key={idx} className="ov-card" style={{ borderRadius: 10 }}>
                      <div className="ov-cardBody">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || ''}</div>
                            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 3 }}>
                              Hours: {n(p.hours || p.hours_this_week || 0).toFixed ? n(p.hours || p.hours_this_week || 0).toFixed(1) : n(p.hours || p.hours_this_week || 0)} · Last deploy: {relTime(p.last_deploy_at)}
                            </div>
                          </div>
                          <span className="ov-pill ov-pillActive">
                            <span className="ov-pillDot" style={{ background: 'var(--color-info-strong)' }} />
                            {status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PanelBoundary>
          </div>
        </section>

        {activeDrawer && (
          <>
            <button type="button" className="ov-drawerScrim" aria-label="Close details" onClick={closeDrawer} />
            <aside className="ov-drawer" aria-label="Details">
              <div className="ov-drawerHead">
                <div className="ov-drawerTitle">
                  <strong>
                    {activeDrawer === 'burn' ? 'Monthly Burn' :
                      activeDrawer === 'ai' ? 'AI Tooling' :
                        activeDrawer === 'infra' ? 'Infra / Bills' :
                          activeDrawer === 'agents' ? 'Agent Calls' :
                            activeDrawer === 'hours' ? 'Hours This Week' :
                              activeDrawer === 'mcp' ? 'MCP Calls Today' :
                                'Open Tasks'}
                  </strong>
                  <span>{new Date(tick).toLocaleString()}</span>
                </div>
                <button type="button" className="ov-drawerClose" onClick={closeDrawer} aria-label="Close">
                  <IconClose />
                </button>
              </div>
              <div className="ov-drawerBody">
                <PanelBoundary>
                  {activeDrawer === 'burn' || activeDrawer === 'ai' || activeDrawer === 'infra' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ height: 180 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={financeDaily}>
                            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: 'var(--color-text-secondary)' }} />
                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: 'var(--color-text-secondary)' }} tickFormatter={(v) => money2(v)} />
                            <Tooltip content={<SpendTooltip />} />
                            <Area name="Anthropic" dataKey="anthropic" type="monotone" stroke={providerColorsLoading ? neutral : pc('anthropic_api')} fill={providerColorsLoading ? neutral : pc('anthropic_api')} fillOpacity={0.08} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                            <Area name="OpenAI" dataKey="openai" type="monotone" stroke={providerColorsLoading ? neutral : pc('openai_api')} fill={providerColorsLoading ? neutral : pc('openai_api')} fillOpacity={0.06} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                            <Area name="Cloudflare" dataKey="cloudflare" type="monotone" stroke={providerColorsLoading ? neutral : pc('cloudflare')} fill={providerColorsLoading ? neutral : pc('cloudflare')} fillOpacity={0.05} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                            <Area name="Cursor" dataKey="cursor" type="monotone" stroke={providerColorsLoading ? neutral : pc('cursor_api')} fill={providerColorsLoading ? neutral : pc('cursor_api')} fillOpacity={0.04} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <table className="ov-table" aria-label="Provider breakdown">
                        <thead>
                          <tr>
                            <th>Provider</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topProviders.map((p: AnyRow, idx: number) => {
                            const slug = String(p.provider || '').toLowerCase();
                            return (
                              <tr key={idx}>
                                <td>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    <span className="ov-dot" style={{ background: providerColorsLoading ? neutral : pc(slug) }} />
                                    {providerMeta[slug]?.display_name || p.provider || ''}
                                  </span>
                                </td>
                                <td style={{ fontWeight: 500 }}>{money2(p.total)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : activeDrawer === 'agents' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ height: 180 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={execData}>
                            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: 'var(--color-text-secondary)' }} />
                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: 'var(--color-text-secondary)' }} />
                            <Tooltip />
                            <Bar dataKey="shell" stackId="a" fill={providerColorsLoading ? neutral : pc('cf_workers')} />
                            <Bar dataKey="edit" stackId="a" fill={providerColorsLoading ? neutral : pc('cursor_api')} />
                            <Bar dataKey="tool" stackId="a" fill={providerColorsLoading ? neutral : pc('workers_ai')} />
                            <Bar dataKey="other" stackId="a" fill={neutral} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="ov-inlineNotice">Data unavailable</div>
                    </div>
                  ) : activeDrawer === 'hours' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="ov-inlineNotice">
                        {activeTimer ? 'Timer running' : 'No active timer'}
                      </div>
                      {!activeTimer && (
                        <button className="ov-btn" type="button" onClick={() => fetch('/api/timers/start', { method: 'POST', credentials: 'include' }).then(() => load())}>
                          Start timer
                        </button>
                      )}
                    </div>
                  ) : activeDrawer === 'mcp' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="ov-inlineNotice">Data unavailable</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="ov-inlineNotice">Data unavailable</div>
                    </div>
                  )}
                </PanelBoundary>
              </div>
            </aside>
          </>
        )}
      </div>
    </>
  );
};

const Sparkline: React.FC<{ values?: number[]; color: string }> = ({ values, color }) => {
  const data = (values || []).map((value, i) => ({ i, value }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};

const KpiCard: React.FC<{
  label: string;
  value: string;
  sub: string;
  delta?: string;
  deltaDir?: 'up' | 'down' | 'flat' | string;
  sparkData?: number[];
  accentColor: string;
  icon: React.ReactNode;
  onClick: () => void;
  pulse?: boolean;
  loading?: boolean;
  error?: boolean;
  subTone?: 'muted' | 'danger';
}> = ({ label, value, sub, delta, deltaDir, sparkData, accentColor, icon, onClick, pulse, loading, error, subTone }) => {
  const dir = String(deltaDir || 'flat');
  const deltaClass = dir === 'up' ? 'ov-deltaUp' : dir === 'down' ? 'ov-deltaDown' : 'ov-deltaFlat';
  const safeValue = loading ? '' : value;
  const subColor = subTone === 'danger' ? 'var(--color-danger)' : 'var(--color-text-secondary)';
  return (
    <button type="button" className="ov-kpi" onClick={onClick} style={{ cursor: 'pointer' }} aria-label={label}>
      <div className="ov-kpiTop">
        <div className="ov-kpiLeft">
          <span className="ov-iconSq" style={{ background: accentColor }} aria-hidden="true">{icon}</span>
          <div className="ov-kpiLabel">{label}</div>
        </div>
        <span style={{ color: 'var(--color-text-secondary)' }} aria-hidden="true"><IconDots /></span>
      </div>
      <div className="ov-kpiValueRow">
        {pulse && <span className="ov-pulseDot" aria-hidden="true" />}
        <div className="ov-kpiValue">{safeValue}</div>
      </div>
      <div className="ov-kpiSubRow">
        <div className="ov-kpiSub" style={{ color: subColor }}>{error ? 'Data unavailable' : sub}</div>
        <div className={`ov-delta ${deltaClass}`}>{delta || ''}</div>
      </div>
      <div className="ov-spark">
        <PanelBoundary>
          <Sparkline values={sparkData || []} color={accentColor} />
        </PanelBoundary>
      </div>
    </button>
  );
};
