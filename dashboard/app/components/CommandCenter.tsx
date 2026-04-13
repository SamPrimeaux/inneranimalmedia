import React, { useEffect, useState, useMemo } from 'react';
import { 
  LayoutGrid, TrendingUp, Zap, ShieldAlert, 
  Workflow, Milestone, AlertCircle, CheckCircle2, 
  Activity, Clock, DollarSign
} from 'lucide-react';

interface CommandCenterData {
  spend_history: { d: string; cost: number }[];
  model_reliability: { model_used: string; status: string; count: number }[];
  tool_reliability: { tool_name: string; status: string; count: number }[];
  roadmap: { plan: string; total: number; completed: number }[];
  cicd: { d: string; status: string; count: number }[];
}

export const CommandCenter: React.FC = () => {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/overview/command-center');
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Derived metrics
  const stats = useMemo(() => {
    if (!data) return null;
    
    const total30dSpend = data.spend_history.reduce((acc, curr) => acc + curr.cost, 0);
    
    // Model Pass Rate
    const modelTotals: Record<string, { total: number; pass: number }> = {};
    data.model_reliability.forEach(row => {
      if (!modelTotals[row.model_used]) modelTotals[row.model_used] = { total: 0, pass: 0 };
      modelTotals[row.model_used].total += row.count;
      if (row.status === 'completed' || row.status === 'success') modelTotals[row.model_used].pass += row.count;
    });
    
    const overallModelPassRate = Object.values(modelTotals).reduce((acc, m) => acc + m.pass, 0) / 
                                Object.values(modelTotals).reduce((acc, m) => acc + m.total, 0) || 0;

    // Tool Pass Rate
    const toolTotals: Record<string, { total: number; pass: number }> = {};
    data.tool_reliability.forEach(row => {
      if (!toolTotals[row.tool_name]) toolTotals[row.tool_name] = { total: 0, pass: 0 };
      toolTotals[row.tool_name].total += row.count;
      if (row.status === 'success' || row.status === 'completed') toolTotals[row.tool_name].pass += row.count;
    });

    const activeSprints = data.roadmap.length;

    return { total30dSpend, overallModelPassRate, activeSprints };
  }, [data]);

  if (loading) return (
    <div className="flex items-center justify-center h-full text-muted animate-pulse font-mono">
      INITIALIZING TELEMETRY STACK...
    </div>
  );

  if (error) return (
    <div className="p-8 text-solar-red font-mono bg-solar-base03 border border-solar-red/20 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle size={20} />
        <span className="font-bold">TELEMETRY_FAILURE_CRITICAL</span>
      </div>
      <p className="opacity-80">{error}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-y-auto no-scrollbar bg-app">
      {/* Header Section */}
      <div className="flex flex-col gap-1">
        <h1 className="text-sm font-mono tracking-[0.2em] text-cyan-400 font-black italic uppercase">
          Command Center
        </h1>
        <p className="text-[10px] font-mono text-muted uppercase opacity-60">
          Operational Health & Deep Telemetry // System Version v2026.04.13
        </p>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiTile 
          label="AI SPEND (30D)" 
          value={`$${stats?.total30dSpend.toFixed(2)}`} 
          icon={<DollarSign size={16} />} 
          trend="+12% VS LAST"
        />
        <KpiTile 
          label="AGENT SUCCESS" 
          value={`${(stats?.overallModelPassRate || 0 * 100).toFixed(1)}%`} 
          icon={<Zap size={16} />} 
          status={(stats?.overallModelPassRate || 0) < 0.2 ? 'critical' : 'warning'}
        />
        <KpiTile 
          label="ACTIVE SPRINTS" 
          value={stats?.activeSprints || 0} 
          icon={<Milestone size={16} />} 
        />
        <KpiTile 
          label="PLATFORM STATUS" 
          value="OPERATIONAL" 
          icon={<Activity size={16} />} 
          status="good"
        />
      </div>

      {/* Main Visuals Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Spend Area Chart (2/3 width) */}
        <div className="lg:col-span-2 bg-panel border border-border-subtle rounded-lg p-5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-[10px] font-mono tracking-widest text-muted uppercase">Daily Spend Distribution</h3>
            <div className="flex items-center gap-2 text-[10px] text-muted font-mono">
              <span className="w-2 h-2 rounded-full bg-cyan-500"></span> AI COMPUTE
            </div>
          </div>
          <div className="h-48 w-full mt-2">
            <SimpleAreaChart data={data?.spend_history || []} />
          </div>
        </div>

        {/* Roadmap Progress (1/3 width) */}
        <div className="bg-panel border border-border-subtle rounded-lg p-5 flex flex-col gap-4">
          <h3 className="text-[10px] font-mono tracking-widest text-muted uppercase">Sprint Roadmap</h3>
          <div className="flex flex-col gap-4 overflow-y-auto max-h-[300px] no-scrollbar">
            {data?.roadmap.map((plan, i) => (
              <RoadmapItem 
                key={i} 
                name={plan.plan} 
                percent={Math.round((plan.completed / plan.total) * 100) || 0}
              />
            ))}
          </div>
        </div>

      </div>

      {/* Reliability Wall */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
        <div className="bg-panel border border-border-subtle rounded-lg p-5">
          <h3 className="text-[10px] font-mono tracking-widest text-muted uppercase mb-4">Model Reliability (7D)</h3>
          <div className="grid grid-cols-1 gap-3">
             {Object.entries(groupBy(data?.model_reliability || [], 'model_used')).map(([name, rows]: [string, any]) => (
                <ReliabilityEntry key={name} name={name} rows={rows} />
             ))}
          </div>
        </div>

        <div className="bg-panel border border-border-subtle rounded-lg p-5">
          <h3 className="text-[10px] font-mono tracking-widest text-muted uppercase mb-4">MCP Tool Integrity</h3>
          <div className="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto no-scrollbar">
             {Object.entries(groupBy(data?.tool_reliability || [], 'tool_name')).slice(0, 10).map(([name, rows]: [string, any]) => (
                <ReliabilityEntry key={name} name={name} rows={rows} isTool />
             ))}
          </div>
        </div>
      </div>

    </div>
  );
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

const KpiTile = ({ label, value, icon, trend, status }: any) => {
  const statusColors = {
    good: 'text-solar-green',
    warning: 'text-solar-yellow',
    critical: 'text-solar-red',
    default: 'text-cyan-400'
  };
  const colorClass = status ? statusColors[status as keyof typeof statusColors] : statusColors.default;

  return (
    <div className="bg-panel border border-border-subtle rounded-lg p-4 flex flex-col gap-1 transition-all hover:border-cyan-500/30 group">
      <div className="flex items-center gap-2 text-muted uppercase text-[9px] font-mono tracking-tighter opacity-70">
        {icon} {label}
      </div>
      <div className={`text-xl font-mono font-black italic tracking-tight ${colorClass}`}>
        {value}
      </div>
      {trend && <div className="text-[8px] font-mono text-solar-green opacity-60">{trend}</div>}
    </div>
  );
};

const RoadmapItem = ({ name, percent }: { name: string; percent: number }) => (
  <div className="flex flex-col gap-1">
    <div className="flex justify-between text-[10px] font-mono text-muted uppercase tracking-tight">
      <span className="truncate max-w-[150px]">{name}</span>
      <span>{percent}%</span>
    </div>
    <div className="h-1 bg-solar-base03 rounded-full overflow-hidden border border-white/5">
      <div 
        className="h-full bg-cyan-500 transition-all duration-1000 ease-out" 
        style={{ width: `${percent}%` }}
      />
    </div>
  </div>
);

const ReliabilityEntry = ({ name, rows, isTool }: { name: string; rows: any[]; isTool?: boolean }) => {
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  const success = rows.find(r => r.status === 'success' || r.status === 'completed')?.count || 0;
  const rate = (success / total) * 100;
  
  return (
    <div className="flex flex-col gap-1 px-3 py-2 bg-solar-base03/50 border border-white/5 rounded">
      <div className="flex justify-between items-center text-[10px] font-mono">
        <span className={`truncate ${isTool ? 'text-muted' : 'text-solar-base1'} max-w-[200px]`}>{name}</span>
        <span className={rate < 50 ? 'text-solar-red' : 'text-solar-green'}>{rate.toFixed(0)}%</span>
      </div>
      <div className="h-0.5 bg-black/20 overflow-hidden">
        <div 
          className={`h-full transition-all duration-700 ${rate < 50 ? 'bg-solar-red' : 'bg-solar-green'}`} 
          style={{ width: `${rate}%` }}
        />
      </div>
    </div>
  );
};

const SimpleAreaChart = ({ data }: { data: { d: string; cost: number }[] }) => {
  if (data.length === 0) return <div className="flex items-center justify-center h-full text-muted font-mono text-xs">NO_DATA_STREAM</div>;

  const max = Math.max(...data.map(d => d.cost)) || 1;
  const width = 1000;
  const height = 200;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (d.cost / max) * height;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full preserve-3d" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M ${points}`} fill="none" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M ${areaPoints}`} fill="url(#spendGradient)" />
      {/* Target markers */}
      {data.map((d, i) => (
        <circle 
          key={i} 
          cx={(i / (data.length - 1)) * width} 
          cy={height - (d.cost / max) * height} 
          r="2" 
          fill="#2dd4bf" 
          className="opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
        />
      ))}
    </svg>
  );
};

function groupBy(arr: any[], key: string) {
  return arr.reduce((acc, curr) => {
    (acc[curr[key]] = acc[curr[key]] || []).push(curr);
    return acc;
  }, {} as Record<string, any[]>);
}
