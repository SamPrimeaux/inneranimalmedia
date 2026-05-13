import React, { useCallback, useEffect, useState } from 'react';
import type { AnalyticsLayoutResponse } from '../types';

type Props = { layout: AnalyticsLayoutResponse | null };

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800/90 bg-slate-950/45 overflow-hidden">
      <header className="border-b border-slate-800/80 px-3 py-2">
        <h3 className="text-[13px] font-semibold text-slate-100">{title}</h3>
      </header>
      <div className="p-3 text-[12px] text-slate-300">{children}</div>
    </section>
  );
}

function severityStyle(s: string) {
  if (s === 'critical') return 'border-rose-800/60 bg-rose-950/30 text-rose-100';
  if (s === 'warn') return 'border-amber-800/50 bg-amber-950/25 text-amber-100';
  return 'border-slate-800/60 bg-slate-950/30 text-slate-200';
}

export default function AdvisorsTab(_props: Props) {
  const [main, setMain] = useState<Record<string, unknown> | null>(null);
  const [gr, setGr] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      getJson<Record<string, unknown>>('/api/analytics/advisors?range=7d'),
      getJson<Record<string, unknown>>('/api/analytics/advisors/guardrails?range=7d'),
    ]);
    setMain(a);
    setGr(b);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const findings = (main?.rows as { severity?: string; title?: string; detail?: string; code?: string }[]) || [];
  const grRows = (gr?.rows as Record<string, unknown>[]) || [];
  const counts = (main?.summary as { counts?: Record<string, number> })?.counts;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-sm font-semibold text-slate-100">Advisors · what to fix next</div>
        <div className="text-[11px] text-slate-500">
          Merges D1 error log signals, deployment / dashboard drift heuristics, and live guardrail events — diagnostic
          first.
        </div>
      </div>

      {counts ? (
        <div className="flex flex-wrap gap-2 font-mono text-[10px] text-slate-500">
          <span className="rounded bg-slate-900/80 px-2 py-0.5">critical:{counts.critical ?? 0}</span>
          <span className="rounded bg-slate-900/80 px-2 py-0.5">warn:{counts.warnings ?? 0}</span>
          <span className="rounded bg-slate-900/80 px-2 py-0.5">info:{counts.info ?? 0}</span>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Critical findings & warnings">
          <div className="space-y-2 max-h-[480px] overflow-auto">
            {findings.map((f, i) => (
              <div key={i} className={`rounded border p-2 text-[11px] ${severityStyle(String(f.severity || 'info'))}`}>
                <div className="font-semibold">{String(f.title || f.code || 'finding')}</div>
                <div className="mt-1 text-[11px] opacity-90 whitespace-pre-wrap break-words">{String(f.detail || '')}</div>
              </div>
            ))}
            {!findings.length ? <div className="text-slate-500">No advisor findings in this pass.</div> : null}
          </div>
        </Section>

        <Section title="Guardrail events (D1)">
          <div className="max-h-[480px] overflow-auto font-mono text-[10px] text-slate-400 space-y-1">
            {grRows.slice(0, 40).map((row, i) => (
              <pre key={i} className="whitespace-pre-wrap break-all">
                {JSON.stringify(row).slice(0, 420)}
              </pre>
            ))}
            {!grRows.length ? <div className="text-slate-500">No guardrail rows.</div> : null}
          </div>
        </Section>
      </div>
    </div>
  );
}
