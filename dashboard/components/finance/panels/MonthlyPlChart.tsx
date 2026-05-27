import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { MonthlyPlRow } from '../types';
import { fmt } from '../constants';

interface Props {
  rows: MonthlyPlRow[];
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function MonthlyPlChart({ rows }: Props) {
  const data = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    return list.map((r) => ({
      label: monthLabel(r.year, r.month),
      income: Number(r.total_income) || 0,
      expenses: Number(r.total_expenses) || 0,
      net: Number(r.net_cashflow) || 0,
    }));
  }, [rows]);

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-panel)] px-4 py-10 text-center text-sm text-[color:var(--dashboard-muted)]">
        No monthly summaries yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-panel)] p-4">
      <h3 className="text-sm font-semibold text-[color:var(--dashboard-text)]">Monthly P&amp;L</h3>
      <p className="text-xs text-[color:var(--dashboard-muted)] mt-0.5 mb-4">financial_monthly_summaries (last 6 months)</p>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--dashboard-border) 55%, transparent)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--dashboard-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'var(--dashboard-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt.usd(Number(v), true)} width={52} />
          <Tooltip
            formatter={(v: number, name: string) => [fmt.usd(Number(v)), name]}
            contentStyle={{
              background: 'var(--dashboard-panel)',
              border: '1px solid var(--dashboard-border)',
              fontSize: 11,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: 'var(--dashboard-muted)' }} />
          <Bar dataKey="income" name="Income" fill="var(--color-success-strong)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="expenses" name="Expenses" fill="var(--color-danger-strong)" radius={[3, 3, 0, 0]} />
          <Line type="monotone" dataKey="net" name="Net" stroke="var(--accent-secondary)" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
