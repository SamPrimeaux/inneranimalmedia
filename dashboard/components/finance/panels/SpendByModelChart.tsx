// dashboard/components/finance/panels/SpendByModelChart.tsx
// Grid of model cards with mini bar charts — matches OpenAI "Spend categories" tab layout

import React, { useMemo } from 'react';
import {
  BarChart, Bar, ResponsiveContainer, Tooltip, XAxis,
} from 'recharts';
import { cn } from '../../../lib/utils';
import { SpendByModelData } from '../types';
import { fmt, isHotModel, PROVIDER_COLORS } from '../constants';

interface Props {
  data: SpendByModelData;
}

interface ModelCardProps {
  modelKey: string;
  providerSlug: string;
  totalUsd: number;
  requestCount: number;
  dailySeries: Array<{ day: string; total_usd: number }>;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="bg-[#0a1a22] border border-white/10 rounded-lg px-3 py-2 text-xs text-white shadow-xl">
      <div className="text-slate-400">{payload[0].payload.day}</div>
      <div className="font-semibold">{fmt.usd(payload[0].value)}</div>
    </div>
  );
};

function ModelCard({ modelKey, providerSlug, totalUsd, requestCount, dailySeries }: ModelCardProps) {
  const hot = isHotModel(modelKey);
  const color = hot ? '#f97316' : (PROVIDER_COLORS[providerSlug] ?? '#7c6df0');
  const shortKey = modelKey.length > 22 ? modelKey.slice(0, 22) + '…' : modelKey;

  // Fill sparse days with zero
  const filled = useMemo(() => {
    const days: Record<string, number> = {};
    dailySeries.forEach((d) => { days[d.day] = d.total_usd; });
    const all: Array<{ day: string; v: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      all.push({ day: key.slice(5), v: days[key] ?? 0 });
    }
    return all;
  }, [dailySeries]);

  return (
    <div
      className={cn(
        'bg-[#0d2128] border rounded-xl p-4 flex flex-col gap-3 hover:border-white/20 transition-colors group',
        hot ? 'border-orange-500/30 hover:border-orange-500/50' : 'border-white/[0.06]'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {hot && (
              <span className="text-[9px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded px-1.5 py-0.5 uppercase tracking-wide shrink-0">
                Hot
              </span>
            )}
            <span className="text-[11px] font-mono text-slate-300 truncate block" title={modelKey}>
              {shortKey}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <div
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: color }}
            />
            <span className="text-[10px] text-slate-500 capitalize">{providerSlug}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-semibold text-white leading-none">{fmt.usd(totalUsd)}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{fmt.num(requestCount)} req</div>
        </div>
      </div>

      {/* Mini bar chart */}
      <div className="h-16">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filled} barCategoryGap="20%">
            <XAxis dataKey="day" hide />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="v" fill={color} opacity={0.85} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Date range label */}
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>30d ago</span>
        <span>today</span>
      </div>
    </div>
  );
}

export function SpendByModelChart({ data }: Props) {
  // Aggregate rows per model
  const byModel = useMemo(() => {
    const map: Record<string, {
      modelKey: string;
      providerSlug: string;
      totalUsd: number;
      requestCount: number;
      daily: Array<{ day: string; total_usd: number }>;
    }> = {};

    data.rows.forEach((r) => {
      if (!map[r.model_key]) {
        map[r.model_key] = {
          modelKey: r.model_key,
          providerSlug: r.provider_slug,
          totalUsd: 0,
          requestCount: 0,
          daily: [],
        };
      }
      map[r.model_key].totalUsd += r.total_usd;
      map[r.model_key].requestCount += r.request_count;
      if (r.day) {
        map[r.model_key].daily.push({ day: r.day, total_usd: r.total_usd });
      }
    });

    return Object.values(map).sort((a, b) => b.totalUsd - a.totalUsd);
  }, [data.rows]);

  if (byModel.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
        <div className="text-4xl opacity-30">◈</div>
        <p className="text-sm">No model spend recorded in the last 30 days.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
      {byModel.map((m) => (
        <ModelCard
          key={m.modelKey}
          modelKey={m.modelKey}
          providerSlug={m.providerSlug}
          totalUsd={m.totalUsd}
          requestCount={m.requestCount}
          dailySeries={m.daily}
        />
      ))}
    </div>
  );
}
