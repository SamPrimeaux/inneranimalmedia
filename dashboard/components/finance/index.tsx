// dashboard/components/finance/index.tsx
// Finance dashboard page — SPA module, route: /dashboard/finance
// Visual reference: OpenAI platform usage dashboard

import React, { useState, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { TabId } from './types';
import { TAB_LABELS } from './constants';
import {
  useFinanceSummary,
  useSpendByModel,
  useSpendByDay,
  useFinanceBudgets,
  useSpendAlerts,
  useTransactions,
} from './hooks/useFinanceData';
import { SpendOverview } from './panels/SpendOverview';
import { SpendByModelChart } from './panels/SpendByModelChart';
import { SpendByDayChart } from './panels/SpendByDayChart';
import { TransactionsTable } from './panels/TransactionsTable';
import { CsvImportZone } from './panels/CsvImportZone';
import { AlertFeed } from './panels/AlertFeed';
import { BudgetManager } from './panels/BudgetManager';

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-white/[0.06]', className)} />;
}

function LoadingGrid() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-48" />)}
      </div>
    </div>
  );
}

// ── Tabs config ───────────────────────────────────────────────────────────────
const TABS: TabId[] = ['by-model', 'by-day', 'transactions', 'import', 'alerts'];

// ── Main component ────────────────────────────────────────────────────────────
export default function FinanceDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('by-model');

  const summary    = useFinanceSummary();
  const byModel    = useSpendByModel();
  const byDay      = useSpendByDay();
  const budgetsRes = useFinanceBudgets();
  const alertsRes  = useSpendAlerts();
  const txnsRes    = useTransactions();

  const alertCount =
    alertsRes.status === 'ok' ? alertsRes.data.alerts.length : 0;

  const handleTxnRefresh = useCallback(() => {
    if (txnsRes.status === 'ok' || txnsRes.status === 'error') {
      (txnsRes as any).refetch?.();
    }
  }, [txnsRes]);

  const handleAlertRefresh = useCallback(() => {
    (alertsRes as any).refetch?.();
  }, [alertsRes]);

  const handleBudgetRefresh = useCallback(() => {
    (budgetsRes as any).refetch?.();
  }, [budgetsRes]);

  const isLoading = summary.status === 'loading' || summary.status === 'idle';

  return (
    <div className="min-h-screen bg-[#071318] text-white">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Finance</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Spend ledger · AI cost tracking · Bank transactions
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date range label (read-only for now; hook into date picker as phase 2) */}
          <div className="flex items-center gap-1.5 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300">
            <span className="opacity-60">📅</span>
            <span>
              {new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' – '}
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <button
            onClick={() => {
              (summary as any).refetch?.();
              (byModel as any).refetch?.();
              (byDay as any).refetch?.();
            }}
            className="p-1.5 text-slate-500 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"
            title="Refresh"
          >
            ↺
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="px-6 py-6 space-y-6">
        {/* KPI strip */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : summary.status === 'error' ? (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-5 py-4 text-sm text-rose-400">
            Failed to load summary: {summary.message}
          </div>
        ) : (
          <SpendOverview
            summary={summary.data}
            budgets={budgetsRes.status === 'ok' ? budgetsRes.data.budgets : []}
            alertCount={alertCount}
          />
        )}

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-0 border-b border-white/[0.06]">
          {TABS.map((tab) => {
            const isAlerts = tab === 'alerts';
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'relative px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5',
                  activeTab === tab
                    ? 'text-white'
                    : 'text-slate-500 hover:text-slate-300'
                )}
              >
                {TAB_LABELS[tab]}
                {isAlerts && alertCount > 0 && (
                  <span className="text-[9px] font-bold bg-amber-500 text-black rounded-full px-1.5 py-0.5 min-w-[16px] text-center leading-none">
                    {alertCount}
                  </span>
                )}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-violet-500 rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ─────────────────────────────────────────────────── */}

        {activeTab === 'by-model' && (
          <>
            {byModel.status === 'loading' || byModel.status === 'idle' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-48" />)}
              </div>
            ) : byModel.status === 'error' ? (
              <div className="text-rose-400 text-sm">{byModel.message}</div>
            ) : (
              <SpendByModelChart data={byModel.data} />
            )}
          </>
        )}

        {activeTab === 'by-day' && (
          <>
            {byDay.status === 'loading' || byDay.status === 'idle' ? (
              <Skeleton className="h-96" />
            ) : byDay.status === 'error' ? (
              <div className="text-rose-400 text-sm">{byDay.message}</div>
            ) : (
              <SpendByDayChart data={byDay.data} />
            )}
          </>
        )}

        {activeTab === 'transactions' && (
          <>
            {txnsRes.status === 'loading' || txnsRes.status === 'idle' ? (
              <Skeleton className="h-80" />
            ) : txnsRes.status === 'error' ? (
              <div className="text-rose-400 text-sm">{txnsRes.message}</div>
            ) : (
              <TransactionsTable
                transactions={txnsRes.data.transactions}
                onRefresh={handleTxnRefresh}
              />
            )}
          </>
        )}

        {activeTab === 'import' && (
          <CsvImportZone onSuccess={handleTxnRefresh} />
        )}

        {activeTab === 'alerts' && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">
            {/* Alert feed */}
            <div>
              {alertsRes.status === 'loading' || alertsRes.status === 'idle' ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
                </div>
              ) : alertsRes.status === 'error' ? (
                <div className="text-rose-400 text-sm">{alertsRes.message}</div>
              ) : (
                <AlertFeed
                  alerts={alertsRes.data.alerts}
                  onRefresh={handleAlertRefresh}
                />
              )}
            </div>

            {/* Budget manager lives alongside alerts (same "ops" zone) */}
            <div>
              {budgetsRes.status === 'loading' || budgetsRes.status === 'idle' ? (
                <Skeleton className="h-64" />
              ) : budgetsRes.status === 'error' ? (
                <div className="text-rose-400 text-sm">{budgetsRes.message}</div>
              ) : (
                <BudgetManager
                  budgets={budgetsRes.data.budgets}
                  onRefresh={handleBudgetRefresh}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
