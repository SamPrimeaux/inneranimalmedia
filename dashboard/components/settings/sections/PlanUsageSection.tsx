import React from 'react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { Toggle, formatPlanLabel } from '../settingsUi';

export type PlanUsageSectionProps = { data: SettingsPanelModel };

function formatInvoiceWhen(ts: number | null | undefined) {
  if (ts == null || !Number.isFinite(Number(ts))) return '—';
  return new Date(Number(ts) * 1000).toLocaleDateString();
}

function parseEligiblePlanIds(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.map((x: unknown) => String(x)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function couponsForPlan(planId: string, coupons: any[] | undefined): any[] {
  if (!Array.isArray(coupons) || !planId) return [];
  const out: any[] = [];
  for (const c of coupons) {
    const ids = parseEligiblePlanIds(c?.eligible_plan_ids);
    if (ids.length === 0 || ids.includes(planId)) out.push(c);
  }
  return out;
}

export function PlanUsageSection({ data }: PlanUsageSectionProps) {
  const u = data.usageData;
  const sub = data.activeSubscription;
  const subStatus = sub?.status != null ? String(sub.status).toLowerCase() : '';
  const paidActive =
    !!sub &&
    sub.plan_id &&
    String(sub.plan_id) !== 'free' &&
    ['active', 'trialing', 'past_due'].includes(subStatus);
  const highlightPlanId = paidActive ? String(sub.plan_id) : 'free';

  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
        Plan &amp; Usage
      </h2>

      {data.billingPlansError ? (
        <div className="text-[11px] text-[var(--color-danger)]">{data.billingPlansError}</div>
      ) : null}
      {(data.billingPlansLoading || data.subscriptionLoading) && !data.billingPlans?.length ? (
        <div className="text-[12px] text-[var(--text-muted)]">Loading plans…</div>
      ) : null}
      {Array.isArray(data.billingPlans) && data.billingPlans.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold text-[var(--text-main)]">Plans</div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.billingPlans.map((plan: any) => {
              const id = String(plan.id ?? '');
              const isHighlight = id === highlightPlanId;
              const isFree = id === 'free';
              const showUpgrade = !isFree && (highlightPlanId === 'free' || id !== highlightPlanId);
              return (
                <div
                  key={id || plan.display_name}
                  className={`rounded-2xl border bg-[var(--bg-panel)] p-4 flex flex-col gap-2 ${
                    isHighlight
                      ? 'border-2 border-[var(--solar-cyan)]'
                      : 'border border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="text-[14px] font-semibold text-[var(--text-main)]">
                    {String(plan.display_name ?? plan.name ?? id)}
                  </div>
                  {plan.tagline ? (
                    <div className="text-[11px] text-[var(--text-muted)]">{String(plan.tagline)}</div>
                  ) : null}
                  <div className="text-[10px] text-[var(--text-muted)] font-mono space-y-0.5">
                    {plan.monthly_token_limit != null ? (
                      <div>Tokens / mo: {Number(plan.monthly_token_limit).toLocaleString()}</div>
                    ) : null}
                    {plan.daily_request_limit != null ? (
                      <div>Requests / day: {Number(plan.daily_request_limit).toLocaleString()}</div>
                    ) : null}
                  </div>
                  {(() => {
                    const cc = couponsForPlan(id, data.billingCoupons);
                    if (!cc.length) return null;
                    return (
                      <div className="mt-2 flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-2">
                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                          Offers
                        </div>
                        {cc.map((c: any) => (
                          <div key={String(c.id ?? c.stripe_coupon_id)} className="text-[10px] text-[var(--text-main)]">
                            {Number(c.requires_verification) === 1 ? (
                              <span className="text-[var(--text-muted)]">
                                Contact us for nonprofit pricing{c?.name ? ` (${String(c.name)})` : ''}
                              </span>
                            ) : (
                              <span>
                                <span className="font-semibold">{String(c.name ?? 'Discount')}</span>
                                {c.percent_off != null ? (
                                  <span className="text-[var(--text-muted)]">
                                    {' '}
                                    — {Number(c.percent_off)}% off
                                    {c.duration === 'repeating' && c.duration_in_months
                                      ? ` for ${Number(c.duration_in_months)} mo`
                                      : c.duration === 'forever'
                                        ? ' ongoing'
                                        : ''}
                                  </span>
                                ) : null}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="mt-auto pt-2 flex flex-wrap gap-2">
                    {isHighlight ? (
                      <span className="text-[10px] uppercase tracking-widest text-[var(--solar-cyan)] font-bold">
                        Current
                      </span>
                    ) : null}
                    {showUpgrade ? (
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)] text-[var(--bg-app)] text-[11px] font-semibold"
                        onClick={() => void data.startCheckout(id, plan.billing_period || 'monthly')}
                      >
                        Upgrade
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {paidActive ? (
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)]"
                onClick={() => void data.openBillingPortal()}
              >
                Manage billing
              </button>
            ) : null}
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)]"
              onClick={() => void data.loadBillingInvoices()}
            >
              View invoices
            </button>
          </div>
          {data.billingInvoicesLoading ? (
            <div className="text-[11px] text-[var(--text-muted)]">Loading invoices…</div>
          ) : null}
          {data.billingInvoicesError ? (
            <div className="text-[11px] text-[var(--color-danger)]">{data.billingInvoicesError}</div>
          ) : null}
          {Array.isArray(data.billingInvoices) && data.billingInvoices.length > 0 ? (
            <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
              <div className="grid grid-cols-12 gap-0 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                <div className="col-span-3">Date</div>
                <div className="col-span-2">Amount</div>
                <div className="col-span-3">Status</div>
                <div className="col-span-4 text-right">PDF</div>
              </div>
              {data.billingInvoices.map((inv: any) => (
                <div
                  key={String(inv.id)}
                  className="grid grid-cols-12 gap-0 px-3 py-2 border-b border-[var(--border-subtle)] text-[11px] items-center"
                >
                  <div className="col-span-3 text-[var(--text-muted)]">
                    {formatInvoiceWhen(inv.period_end ?? inv.period_start)}
                  </div>
                  <div className="col-span-2 font-mono text-[var(--text-main)]">
                    ${(Number(inv.amount_paid || 0) / 100).toFixed(2)}
                  </div>
                  <div className="col-span-3">
                    <span className="px-2 py-0.5 rounded text-[10px] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                      {String(inv.status || '—')}
                    </span>
                  </div>
                  <div className="col-span-4 text-right">
                    {inv.invoice_pdf ? (
                      <a
                        href={inv.invoice_pdf}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-[var(--solar-cyan)] hover:underline"
                      >
                        Download PDF
                      </a>
                    ) : inv.hosted_invoice_url ? (
                      <a
                        href={inv.hosted_invoice_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-[var(--solar-cyan)] hover:underline"
                      >
                        View invoice
                      </a>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {data.usageError ? (
        <div className="text-[11px] text-[var(--color-danger)]">{data.usageError}</div>
      ) : null}
      {data.usageLoading && !u ? (
        <div className="text-[12px] text-[var(--text-muted)]">Loading usage…</div>
      ) : null}
      {u && (
        <>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Period: {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            {(() => {
              const summary = Array.isArray(u.summary) ? u.summary : [];
              const total = summary.reduce((acc: number, r: any) => acc + Number(r.cost_usd || 0), 0);
              const input = summary.reduce((acc: number, r: any) => acc + Number(r.input_tokens || 0), 0);
              const output = summary.reduce((acc: number, r: any) => acc + Number(r.output_tokens || 0), 0);
              const calls = summary.reduce((acc: number, r: any) => acc + Number(r.call_count || 0), 0);
              return (
                <>
                  <div className="mt-2 text-[26px] font-semibold text-[var(--solar-cyan)]">
                    ${total.toFixed(2)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="text-[10px] px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                      {input.toLocaleString()} input
                    </span>
                    <span className="text-[10px] px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                      {output.toLocaleString()} output
                    </span>
                    <span className="text-[10px] px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                      {calls.toLocaleString()} calls
                    </span>
                  </div>
                </>
              );
            })()}
            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
              <div className="grid grid-cols-6 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                <div className="col-span-2">Model</div>
                <div className="col-span-1">Provider</div>
                <div className="col-span-1">Input</div>
                <div className="col-span-1">Output</div>
                <div className="col-span-1 text-right">Cost</div>
              </div>
              {(Array.isArray(u.summary) ? u.summary : []).map((r: any, i: number) => (
                <div
                  key={`${r.model_used || i}`}
                  className="grid grid-cols-6 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] text-[11px] items-center"
                >
                  <div className="col-span-2 text-[var(--text-main)] truncate">
                    {String(r.model_used || '—')}
                  </div>
                  <div className="col-span-1 text-[var(--text-muted)]">{String(r.provider || '—')}</div>
                  <div className="col-span-1 text-[10px] text-[var(--text-muted)] font-mono">
                    {Number(r.input_tokens || 0).toLocaleString()}
                  </div>
                  <div className="col-span-1 text-[10px] text-[var(--text-muted)] font-mono">
                    {Number(r.output_tokens || 0).toLocaleString()}
                  </div>
                  <div className="col-span-1 text-right text-[10px] text-[var(--text-muted)] font-mono">
                    ${Number(r.cost_usd || 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold text-[var(--text-main)]">Spend Ledger</div>
              <div className="flex items-center gap-2">
                <select
                  value={data.usageProvider}
                  onChange={(e) => {
                    data.setUsageProvider(e.target.value);
                    data.setUsagePage(1);
                    void data.loadUsage(1, e.target.value, data.usageModel);
                  }}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px]"
                >
                  <option value="">All providers</option>
                  {Array.from(
                    new Set(
                      (Array.isArray(u.summary) ? u.summary : [])
                        .map((x: any) => String(x.provider || ''))
                        .filter(Boolean),
                    ),
                  ).map((p: string) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  value={data.usageModel}
                  onChange={(e) => {
                    data.setUsageModel(e.target.value);
                    data.setUsagePage(1);
                    void data.loadUsage(1, data.usageProvider, e.target.value);
                  }}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px]"
                >
                  <option value="">All models</option>
                  {Array.from(
                    new Set(
                      (Array.isArray(u.summary) ? u.summary : [])
                        .map((x: any) => String(x.model_used || ''))
                        .filter(Boolean),
                    ),
                  ).map((m: string) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
              <div className="grid grid-cols-6 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                <div className="col-span-1">Date</div>
                <div className="col-span-2">Model</div>
                <div className="col-span-1">Provider</div>
                <div className="col-span-1">Tokens</div>
                <div className="col-span-1 text-right">Cost</div>
              </div>
              {(Array.isArray(u.ledger) ? u.ledger : []).map((r: any, i: number) => (
                <div
                  key={String(r.id || i)}
                  className="grid grid-cols-6 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] text-[11px] items-center"
                >
                  <div className="col-span-1 text-[10px] text-[var(--text-muted)]">
                    {r.created_at ? new Date(String(r.created_at)).toLocaleDateString() : '—'}
                  </div>
                  <div className="col-span-2 text-[var(--text-main)] truncate">{String(r.model_used || '—')}</div>
                  <div className="col-span-1 text-[var(--text-muted)]">{String(r.provider || '—')}</div>
                  <div className="col-span-1 text-[10px] text-[var(--text-muted)] font-mono">
                    {Number(r.input_tokens || 0) + Number(r.output_tokens || 0)}
                  </div>
                  <div className="col-span-1 text-right text-[10px] text-[var(--text-muted)] font-mono">
                    ${Number(r.cost_usd || 0).toFixed(4)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]"
                onClick={() => {
                  const p = Math.max(1, data.usagePage - 1);
                  data.setUsagePage(p);
                  void data.loadUsage(p, data.usageProvider, data.usageModel);
                }}
              >
                Prev
              </button>
              <div className="text-[11px] text-[var(--text-muted)]">Page {data.usagePage}</div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]"
                onClick={() => {
                  const p = data.usagePage + 1;
                  data.setUsagePage(p);
                  void data.loadUsage(p, data.usageProvider, data.usageModel);
                }}
              >
                Next
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
              <div className="text-[12px] font-semibold text-[var(--text-main)]">Budget</div>
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-[11px]">
                  <span className="text-[var(--text-muted)]">Monthly Limit (USD)</span>
                  <input
                    value={data.budgetMonthlyLimit}
                    onChange={(e) => data.setBudgetMonthlyLimit(e.target.value)}
                    onBlur={() => {
                      void (async () => {
                        try {
                          await data.patchProfile([
                            {
                              setting_key: 'budget.monthly_limit_usd',
                              setting_value: String(data.budgetMonthlyLimit || ''),
                            },
                          ]);
                        } catch (e) {
                          data.setUsageError(e instanceof Error ? e.message : 'Save failed');
                        }
                      })();
                    }}
                    className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono"
                    inputMode="decimal"
                  />
                </label>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-[var(--text-muted)]">Hard stop when limit reached</div>
                  <Toggle
                    on={data.budgetHardStop}
                    onChange={(v) => {
                      data.setBudgetHardStop(v);
                      void data
                        .patchProfile([
                          { setting_key: 'budget.hard_stop', setting_value: v ? 'true' : 'false' },
                        ])
                        .catch(() => data.setBudgetHardStop(!v));
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
              <div className="text-[12px] font-semibold text-[var(--text-main)]">Billing</div>
              <div className="mt-3 text-[11px] text-[var(--text-muted)]">
                Plan:{' '}
                <span className="text-[var(--text-main)] font-mono">{formatPlanLabel(data.profilePlan)}</span>
              </div>
              <div className="mt-2 text-[10px] text-[var(--text-muted)]">
                Use Manage billing or Upgrade above for Stripe checkout and the customer portal.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
