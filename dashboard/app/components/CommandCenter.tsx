import React, { useEffect, useState, useMemo } from 'react';
import { 
  DollarSign, Zap, Cloud, Users, AlertOctagon, CheckCircle,
  MoreVertical, ArrowUpRight, ArrowDownRight, Activity as ActivityIcon,
  Server, ShieldCheck, Globe, Code, Layers
} from 'lucide-react';
import { 
  Sparkline, CircularGauge, HybridBarLineChart, DonutChart 
} from './DashboardCharts';

interface CommandCenterData {
  spend_history: { d: string; cost: number }[];
  model_reliability: { model_used: string; status: string; count: number }[];
  tool_reliability: { tool_name: string; status: string; count: number }[];
  roadmap: { plan: string; total: number; completed: number }[];
  cicd: { d: string; status: string; count: number }[];
  spark_spend: { d: string; cost: number }[];
  spark_errors: { d: string; count: number }[];
  worker_deploys: { id: string; version: string; status: string; environment: string; reliability: number }[];
}

export const CommandCenter: React.FC = () => {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/overview/command-center')
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, []);

  // Hybrid chart data mapping
  const hybridData = useMemo(() => {
    if (!data) return [];
    return data.spend_history.map(day => ({
      d: day.d,
      total: day.cost * 1.4, // Total = AI + estimated Infra
      ai: day.cost
    }));
  }, [data]);

  if (loading) return <div className="p-8 text-muted animate-pulse font-mono uppercase tracking-widest text-center mt-20">Syncing Telemetry...</div>;

  return (
    <div className="flex flex-col gap-5 p-6 h-full bg-app overflow-y-auto no-scrollbar font-sans text-white/90">
      
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-1">
        <div className="flex flex-col">
          <h1 className="text-xl font-black italic tracking-tighter uppercase text-white">Command Center</h1>
          <span className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Global Status // LIVE // 0x4F92</span>
        </div>
        <div className="flex gap-2">
           <StatusPill label="Worker-API" status="healthy" />
           <StatusPill label="D1-Pool" status="healthy" />
        </div>
      </div>

      {/* ─── Top KPI Row (6 Cards) ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Monthly Spend" value="$943" trend="+16%" data={[40, 35, 45, 60, 55, 70, 85]} color="#3a9fe8" />
        <KpiCard label="AI Spend" value="$227" trend="-3%" data={[80, 75, 70, 65, 60, 62, 58]} color="#2dd4bf" />
        <KpiCard label="Infra Spend" value="$659" trend="+8%" data={[30, 32, 35, 40, 45, 50, 55]} color="#7c83d4" />
        <KpiCard label="Active Agents" value="6" data={[4, 5, 5, 6, 6, 6, 6]} color="#e6ac00" />
        <KpiCard label="Errors" value="6" data={[10, 8, 12, 5, 7, 9, 6]} color="#e63333" />
        <KpiCard label="Deploy Rate" value="98%" data={[95, 96, 94, 98, 97, 98, 98]} color="#a3b800" />
      </div>

      {/* ─── Middle Section ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Main Chart (2/3) */}
        <div className="lg:col-span-2 bg-panel/50 border border-white/5 rounded-xl p-5 backdrop-blur-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-white/70">AI + Infra Spend Over Time</h2>
            <div className="flex gap-2 text-[9px] font-mono">
              <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5">7D</span>
              <span className="px-2 py-0.5 rounded border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 font-bold">30D</span>
              <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5">3M</span>
            </div>
          </div>
          <div className="h-64 mt-4">
            <HybridBarLineChart data={hybridData} />
          </div>
        </div>

        {/* Sidebar Health (1/3) */}
        <div className="flex flex-col gap-5">
          <div className="bg-panel/50 border border-white/5 rounded-xl p-5">
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-white/70 mb-4">Activity</h2>
            <div className="flex items-end gap-2 mb-1">
              <span className="text-2xl font-black italic">348</span>
              <span className="text-[10px] text-muted mb-1 uppercase">Agent runs / this month</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-6">
              <div className="h-full bg-cyan-500 w-[65%]" />
            </div>

            <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-white/70 mb-4">System Health</h2>
            <div className="flex justify-around items-center pt-2">
               <CircularGauge percent={94} size={70} strokeWidth={6} label="Reliability" />
               <CircularGauge percent={82} size={70} strokeWidth={6} color="#e6ac00" label="Resource" />
               <CircularGauge percent={98} size={70} strokeWidth={6} color="#a3b800" label="Uptime" />
            </div>
          </div>

          <div className="bg-solar-red/5 border border-solar-red/20 rounded-xl p-4 flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-black italic text-solar-red">6 API Errors</span>
              <span className="text-[9px] font-mono text-solar-red/70 uppercase">Spike detected in latency</span>
            </div>
            <AlertOctagon size={24} className="text-solar-red" />
          </div>
        </div>

      </div>

      {/* ─── Bottom Section ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pb-8">
        
        {/* Worker Tablet (2/3) */}
        <div className="lg:col-span-2 bg-panel/50 border border-white/5 rounded-xl p-5 overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-white/70">Worker Deploys</h2>
            <button className="text-[10px] text-muted hover:text-white uppercase font-mono">View History</button>
          </div>
          <table className="w-full text-left font-mono text-[11px]">
            <thead>
              <tr className="border-b border-white/5 text-muted uppercase">
                <th className="pb-3 font-normal">Worker</th>
                <th className="pb-3 font-normal text-center">Reliability</th>
                <th className="pb-3 font-normal text-center">Status</th>
                <th className="pb-3 font-normal text-right">Environment</th>
              </tr>
            </thead>
            <tbody>
              {data?.worker_deploys.map((dep, i) => (
                <tr key={i} className="border-b border-white/2 hover:bg-white/2 transition-colors">
                  <td className="py-3 flex items-center gap-2">
                    <Server size={12} className="text-cyan-500" />
                    <span className="font-bold">{dep.id.slice(0, 10)}</span>
                    <span className="text-[9px] opacity-40">({dep.version})</span>
                  </td>
                  <td className="py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                       <span className={dep.reliability < 90 ? 'text-solar-yellow' : 'text-solar-green'}>{dep.reliability}%</span>
                    </div>
                  </td>
                  <td className="py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold ${
                      dep.status === 'success' ? 'bg-solar-green/20 text-solar-green' : 'bg-solar-yellow/20 text-solar-yellow'
                    }`}>
                      {dep.status === 'success' ? 'Works' : 'Desay'}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <span className="text-muted opacity-80 uppercase tracking-tighter">{dep.environment}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* CI/CD Donut (1/3) */}
        <div className="bg-panel/50 border border-white/5 rounded-xl p-5 flex flex-col items-center">
          <div className="w-full flex justify-between items-center mb-6">
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-white/70">Resource Usage</h2>
            <Workflow size={14} className="text-muted" />
          </div>
          <DonutChart items={[
            { label: 'AI Tooling', value: 45, color: '#3a9fe8' },
            { label: 'Infra', value: 25, color: '#2dd4bf' },
            { label: 'Storage', value: 20, color: '#7c83d4' },
            { label: 'Base', value: 10, color: '#555555' },
          ]} />
          <div className="w-full mt-6 grid grid-cols-2 gap-2">
             <DonutLegend label="AI Tooling" color="#3a9fe8" percent="45%" />
             <DonutLegend label="Infra Usage" color="#2dd4bf" percent="25%" />
             <DonutLegend label="Storage" color="#7c83d4" percent="20%" />
             <DonutLegend label="Base Cache" color="#555555" percent="10%" />
          </div>
        </div>

      </div>

    </div>
  );
};

// ─── Local UI Helpers ───────────────────────────────────────────────────────

const KpiCard = ({ label, value, trend, data, color }: any) => (
  <div className="bg-panel/50 border border-white/5 rounded-xl p-4 flex flex-col gap-1 transition-all hover:bg-white/5 cursor-default relative overflow-hidden group">
    <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
       <ArrowUpRight size={12} className="text-muted" />
    </div>
    <div className="flex items-center gap-2 text-muted uppercase text-[9px] font-mono tracking-tighter opacity-80 mb-2">
      {label}
    </div>
    <div className="flex items-end justify-between">
       <div className="flex flex-col">
          <span className="text-xl font-black italic tracking-tighter">{value}</span>
          {trend && (
            <span className={`text-[9px] font-mono font-bold flex items-center gap-0.5 ${trend.startsWith('+') ? 'text-solar-green' : 'text-solar-red'}`}>
               {trend.startsWith('+') ? <ArrowUpRight size={8} /> : <ArrowDownRight size={8} />}
               {trend}
            </span>
          )}
       </div>
       <div className="-mb-2 -mr-2 opacity-60 group-hover:opacity-100 transition-all">
          <Sparkline data={data} color={color} width={60} height={20} />
       </div>
    </div>
  </div>
);

const StatusPill = ({ label, status }: { label: string; status: string }) => (
  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/5 font-mono text-[9px] uppercase">
    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${status === 'healthy' ? 'bg-solar-green' : 'bg-solar-red'}`} />
    <span className="opacity-70">{label}</span>
  </div>
);

const DonutLegend = ({ label, color, percent }: any) => (
  <div className="flex items-center justify-between gap-2 px-2 py-1 bg-white/2 rounded">
    <div className="flex items-center gap-1.5 overflow-hidden">
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[8px] font-mono text-muted uppercase truncate">{label}</span>
    </div>
    <span className="text-[9px] font-mono font-bold">{percent}</span>
  </div>
);
