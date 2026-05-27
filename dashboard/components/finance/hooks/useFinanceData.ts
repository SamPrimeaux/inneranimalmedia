// dashboard/components/finance/hooks/useFinanceData.ts
// All fetch hooks for the finance dashboard. credentials:'include' always.

import { useState, useEffect, useCallback } from 'react';
import {
  FinanceSummary,
  SpendByModelData,
  SpendByDayData,
  FinanceBudget,
  SpendAlert,
  Transaction,
} from '../types';
import { API } from '../constants';

type FetchState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'error'; message: string };

function useFetch<T>(url: string, deps: unknown[] = []): FetchState<T> & { refetch: () => void } {
  const [state, setState] = useState<FetchState<T>>({ status: 'idle' });
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetch(url, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json() as Promise<T>;
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'ok', data });
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ status: 'error', message: e.message });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);

  return { ...state, refetch };
}

export function useFinanceSummary() {
  return useFetch<FinanceSummary>(API.summary);
}

export function useSpendByModel() {
  return useFetch<SpendByModelData>(API.spendByModel);
}

export function useSpendByDay() {
  return useFetch<SpendByDayData>(API.spendByDay);
}

export function useFinanceBudgets() {
  return useFetch<{ budgets: FinanceBudget[] }>(API.budgets);
}

export function useSpendAlerts() {
  return useFetch<{ alerts: SpendAlert[] }>(API.alerts);
}

export function useTransactions(limit = 200) {
  return useFetch<{ transactions: Transaction[] }>(
    `${API.transactions}?limit=${limit}`
  );
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function resolveAlert(id: number): Promise<void> {
  const r = await fetch(API.resolveAlert(id), {
    method: 'POST',
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`Resolve failed: ${r.status}`);
}

export async function createBudget(
  payload: Omit<FinanceBudget, 'id' | 'tenant_id' | 'workspace_id' | 'actual_usd' | 'created_at'>
): Promise<void> {
  const r = await fetch(API.budgets, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Create budget failed: ${r.status}`);
}

export async function importCsv(csv: string, filename: string): Promise<{ imported: number }> {
  const r = await fetch(API.importCsv, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv, filename }),
  });
  if (!r.ok) throw new Error(`Import failed: ${r.status}`);
  return r.json();
}

export async function addTransaction(
  payload: Omit<Transaction, 'id' | 'tenant_id' | 'workspace_id'>
): Promise<void> {
  const r = await fetch(API.transactions, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Add transaction failed: ${r.status}`);
}
