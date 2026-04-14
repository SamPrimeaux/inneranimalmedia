import React, { useEffect, useState } from 'react';
import { Activity, Zap, GitBranch, CheckCircle } from 'lucide-react';

interface OverviewData {
  tasks_completed:   number;
  deploys_total:     number;
  agent_calls_total: number;
  platform_health:   Record<string, unknown>;
}

export const Overview: React.FC = () => {
  const [data,    setData]    = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/overview/stats', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <span className="text-[11px] font-mono text-[var(--text-muted)]">Loading...</span>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-full">
      <span className="text-[11px] font-mono text-red-400">Overview unavailable: {error}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-5 p-6 h-full bg-[var(--bg-app)] overflow-y-auto text-[var(--text-main)]">
      <div className="flex flex-col gap-1 mb-2">
        <h1 className="text-xl font-black italic tracking-tighter uppercase text-white">
          Overview
        </h1>
        <span className="text-[10px] font-mono opacity-50 uppercase tracking-widest">
          Platform Analytics
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<CheckCircle size={16} />}
          label="Tasks Completed"
          value={data?.tasks_completed ?? 0}
          color="#2dd4bf"
        />
        <StatCard
          icon={<GitBranch size={16} />}
          label="Total Deploys"
          value={data?.deploys_total ?? 0}
          color="#3a9fe8"
        />
        <StatCard
          icon={<Zap size={16} />}
          label="Agent Calls"
          value={data?.agent_calls_total ?? 0}
          color="#a3b800"
        />
        <StatCard
          icon={<Activity size={16} />}
          label="Platform Health"
          value={Object.keys(data?.platform_health ?? {}).length > 0 ? 'OK' : '—'}
          color="#e6ac00"
          isText
        />
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  icon:    React.ReactNode;
  label:   string;
  value:   number | string;
  color:   string;
  isText?: boolean;
}> = ({ icon, label, value, color, isText }) => (
  <div className="bg-[var(--bg-panel)]/50 border border-white/5 rounded-xl p-5 flex flex-col gap-3">
    <div className="flex items-center gap-2" style={{ color }}>
      {icon}
      <span className="text-[9px] font-mono uppercase tracking-widest opacity-70">{label}</span>
    </div>
    <span className={`font-black italic tracking-tighter ${isText ? 'text-lg' : 'text-3xl'}`}>
      {typeof value === 'number' ? value.toLocaleString() : value}
    </span>
  </div>
);

export default Overview;
