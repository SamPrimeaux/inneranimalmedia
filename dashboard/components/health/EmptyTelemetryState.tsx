import React from 'react';

type Props = {
  title: string;
  hint?: string;
  children?: React.ReactNode;
};

export const EmptyTelemetryState: React.FC<Props> = ({ title, hint, children }) => (
  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 text-[13px] text-[var(--text-muted)]">
    <div className="font-medium text-[var(--text)] mb-1">{title}</div>
    {hint ? <p className="leading-relaxed mb-2">{hint}</p> : null}
    {children}
  </div>
);
