// dashboard/components/finance/panels/SpendByDayChart.tsx
// Stacked area chart — spend by day, coloured by provider

import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { SpendByDayData } from '../types';
import { fmt, PROVIDER_COLORS } from '../constants';

interface Props {
  data: SpendByDayData;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-[#0a1a22] border border-white/10 rounded-xl px-4 py-3 text-xs shadow-2xl min-w-[160px]">
      <div className="text-slate-400 mb-2 font-medium">{fmt.date(label)}</div>
      {[...payload].reverse().map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-slate-300 capitalize">{p.dataKey}</span>
          </div>
          <span className="text-white font-semibold">{fmt.usd(p.value)}</span>
        </div>
      ))}
      <div className="border-t border-white/10 mt-2 pt-2 flex justify-between">
        <span className="text-slate-400">Total</span>
        <span className="text-white font-bold">{fmt.usd(total)}</span>
      </div>
    </div>
  );
};

export function SpendByDayChart({ data }: Props) {
  const { chartData, providers } = useMemo(() => {
    // Build one row per date, columns per provider
    const dateMap: Record<string, Record<string, number>> = {};
    data.rows.forEach((r) => {
      if (!dateMap[r.date]) dateMap[r.date] = {};
      dateMap[r.date][r.provider_slug] = (dateMap[r.date][r.provider_slug] ?? 0) + r.total_usd;
    });

    // Fill last 30 days
    const chartData: Array<Record<string, unknown>> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const row: Record<string, unknown> = { date: key };
      data.providers.forEach((p) => { row[p] = dateMap[key]?.[p] ?? 0; });
      chartData.push(row);
    }

    return { chartData, providers: data.providers };
  }, [data]);

  if (providers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
        <div className="text-4xl opacity-30">◈</div>
        <p className="text-sm">No spend data for the last 30 days.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0d2128] border border-white/[0.06] rounded-xl p-6">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">Spend by Day</h3>
        <p className="text-xs text-slate-500 mt-0.5">Last 30 days, stacked by provider</p>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            {providers.map((p) => (
              <linearGradient key={p} id={`grad-${p}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PROVIDER_COLORS[p] ?? '#7c6df0'} stopOpacity={0.3} />
                <stop offset="95%" stopColor={PROVIDER_COLORS[p] ?? '#7c6df0'} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => v.slice(5)} // MM-DD
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v: number) => fmt.usd(v, true)}
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '11px', color: '#94a3b8', paddingTop: '12px' }}
            formatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
          />
          {providers.map((p, i) => (
            <Area
              key={p}
              type="monotone"
              dataKey={p}
              stackId="1"
              stroke={PROVIDER_COLORS[p] ?? '#7c6df0'}
              fill={`url(#grad-${p})`}
              strokeWidth={i === providers.length - 1 ? 2 : 1}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
