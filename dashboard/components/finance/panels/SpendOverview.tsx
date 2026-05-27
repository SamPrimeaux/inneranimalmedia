// dashboard/components/finance/panels/SpendOverview.tsx
// Top KPI strip: monthly burn / budget %, prior delta, token count, alert badge
// Visual reference: OpenAI platform right sidebar (budget bar, sparklines)

import React from 'react';
import {
  LineChart, Line, ResponsiveContainer, Tooltip,
} from 'recharts';
import { cn } from '../../../lib/utils';
import { FinanceSummary, FinanceBudget } from '../types';
import { fmt } from '../constants';

interface Props {
  summary: FinanceSummary;
  budgets: FinanceBudget[];
  alertCount: number;
}

function Sparkline({ data, color = '#7c6df0' }: { data: number[]; color?: string }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={points}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{ display: 'none' }}
          cursor={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  sparkData?: number[];
  sparkColor?: string;
  progress?: number; // 0–1
  progressOver?: boolean;
  badge?: number;
}

function StatCard({
  label, value, sub, subColor, sparkData, sparkColor, progress, progressOver, badge,
}: StatCardProps) {
  return (
    <div className="bg-[#0d2128] border border-white/[0.06] rounded-xl p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        {badge !== undefined && badge > 0 && (
          <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 rounded-full px-2 py-0.5 border border-amber-500/30">
            {badge}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold text-white tracking-tight leading-none">{value}</div>
          {sub && (
            <div className={cn('text-xs mt-1 font-medium', subColor ?? 'text-slate-400')}>{sub}</div>
          )}
        </div>
        {sparkData && sparkData.length > 1 && (
          <div className="w-24 shrink-0">
            <Sparkline data={sparkData} color={sparkColor} />
          </div>
        )}
      </div>

      {progress !== undefined && (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                progressOver ? 'bg-orange-500' : 'bg-violet-500'
              )}
              style={{ width: `${Math.min(progress * 100, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>spent</span>
            <span className={progressOver ? 'text-orange-400 font-semibold' : ''}>
              {fmt.pct(progress * 100)} of budget
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function SpendOverview({ summary, budgets, alertCount }: Props) {
  const monthBudget = budgets.find((b) => b.budget_type === 'monthly' && !b.model_filter);
  const burnRatio = monthBudget
    ? summary.month_out / monthBudget.target_usd
    : undefined;

  const delta = summary.month_out - summary.prior_month_out;
  const deltaSign = delta >= 0 ? '+' : '';
  const deltaColor = delta <= 0 ? 'text-emerald-400' : 'text-rose-400';

  const monthly = Array.isArray(summary.monthly) ? summary.monthly : [];
  const spendLedger = summary.spend_ledger?.entries ?? [];
  const aiSpendRows = summary.ai_spend?.rows ?? [];
  const aiSpendTotal = summary.ai_spend?.total_usd ?? summary.ai_spend_total ?? 0;
  const aiSpendCount = summary.ai_spend?.count ?? 0;
  const monthlySpend = monthly.map((m) => m.expenses);
  const monthlyIncome = monthly.map((m) => m.income);
  const aiSparkData = aiSpendRows.map((e: any) => e.total_usd ?? e.amount_usd ?? 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {/* Monthly burn */}
      <StatCard
        label="May Spend"
        value={monthBudget
          ? `${fmt.usd(summary.month_out)} / ${fmt.usd(monthBudget.target_usd)}`
          : fmt.usd(summary.month_out)
        }
        sub={`${deltaSign}${fmt.usd(delta)} vs last month`}
        subColor={deltaColor}
        sparkData={monthlySpend}
        sparkColor={burnRatio !== undefined && burnRatio > 1 ? '#f97316' : '#7c6df0'}
        progress={burnRatio}
        progressOver={burnRatio !== undefined && burnRatio > 1}
      />

      {/* Total tokens (proxy: request count from summary) */}
      <StatCard
        label="Total Tokens"
        value={fmt.num(
          spendLedger.reduce((acc, r) => acc + (r.amount_usd * 1_000_000 / 0.002), 0)
        )}
        sub="est. from spend_ledger"
        sparkData={monthlySpend}
        sparkColor="#38bdf8"
      />

      {/* AI spend */}
      <StatCard
        label="AI Spend"
        value={fmt.usd(aiSpendTotal)}
        sub={`${aiSpendCount} model${aiSpendCount !== 1 ? 's' : ''} active`}
        sparkData={aiSparkData}
        sparkColor="#e07d54"
      />

      {/* Income / net */}
      <StatCard
        label="Net (Month)"
        value={fmt.usd(summary.month_net)}
        sub={`In: ${fmt.usd(summary.month_in)}`}
        subColor={summary.month_net >= 0 ? 'text-emerald-400' : 'text-rose-400'}
        sparkData={monthlyIncome}
        sparkColor="#4ade80"
        badge={alertCount}
      />
    </div>
  );
}
