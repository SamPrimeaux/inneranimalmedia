import React from 'react';

type Props = { score: number; label?: string };

export const HealthScoreCard: React.FC<Props> = ({ score, label = 'Health score' }) => {
  const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (s / 100) * c;
  const color =
    s >= 80 ? 'var(--solar-green, #22c55e)' : s >= 50 ? 'var(--solar-amber, #f59e0b)' : 'var(--solar-red, #ef4444)';

  return (
    <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
      <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <svg width={140} height={140} viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border-subtle)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="66" textAnchor="middle" fill="var(--text)" fontSize="28" fontWeight="600">
          {s}
        </text>
      </svg>
    </div>
  );
};
