// dashboard/components/finance/types.ts
// All shapes aligned to GET /api/finance/* response JSON

export type TabId = 'by-model' | 'by-day' | 'transactions' | 'import' | 'alerts';

// ── /api/finance/summary ──────────────────────────────────────────────────────
export interface FinanceSummary {
  month_in: number;
  month_out: number;
  month_net: number;
  prior_month_out: number;
  prior_month_in: number;
  tech_spend: number;
  ai_spend_total: number;
  alert_count: number;
  monthly: MonthlyBucket[];
  by_category: CategoryBucket[];
  accounts: FinancialAccount[];
  spend_ledger: { total: number; entries: SpendLedgerEntry[]; by_provider: any[] };
  ai_spend: { total_usd: number; count: number; rows: AiSpendEntry[] };
}

export interface MonthlyBucket {
  month: string; // 'YYYY-MM'
  income: number;
  expenses: number;
  net: number;
}

export interface CategoryBucket {
  category: string;
  total: number;
  count: number;
}

export interface FinancialAccount {
  id: number;
  name: string;
  type: string;
  balance: number;
  currency: string;
}

export interface SpendLedgerEntry {
  model_key: string;
  provider_slug: string;
  amount_usd: number;
  period: string;
}

export interface AiSpendEntry {
  model_key: string;
  total_usd: number;
  request_count: number;
}

// ── /api/finance/spend-by-model ───────────────────────────────────────────────
export interface SpendByModelRow {
  model_key: string;
  provider_slug: string;
  total_usd: number;
  request_count: number;
  day: string; // YYYY-MM-DD, present when daily=true
}

export interface SpendByModelData {
  rows: SpendByModelRow[];
  models: string[]; // unique model_keys
}

// ── /api/finance/spend-by-day ─────────────────────────────────────────────────
export interface SpendByDayRow {
  date: string; // YYYY-MM-DD
  provider_slug: string;
  total_usd: number;
  request_count: number;
}

export interface SpendByDayData {
  rows: SpendByDayRow[];
  providers: string[];
  dates: string[];
}

// ── /api/finance/budgets ──────────────────────────────────────────────────────
export interface FinanceBudget {
  id: number;
  tenant_id: string;
  workspace_id: string | null;
  budget_name: string;
  budget_type: 'monthly' | 'weekly' | 'daily' | 'total';
  target_usd: number;
  actual_usd: number;
  period: string; // YYYY-MM
  model_filter: string | null;
  provider_filter: string | null;
  notes: string | null;
  created_at: string;
}

// ── /api/finance/alerts ───────────────────────────────────────────────────────
export interface SpendAlert {
  id: number;
  tenant_id: string;
  workspace_id: string | null;
  alert_type: string;
  provider_slug: string | null;
  threshold_usd: number;
  actual_usd: number;
  period: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  resolved: 0 | 1;
  resolved_at: string | null;
  created_at: string;
}

// ── /api/finance/transactions ─────────────────────────────────────────────────
export interface Transaction {
  id: number;
  tenant_id: string;
  workspace_id: string | null;
  account_id: number | null;
  category_id: number | null;
  amount: number;
  direction: 'in' | 'out';
  description: string;
  merchant: string | null;
  transaction_date: string;
  source: string;
  category_name?: string;
  account_name?: string;
}

// ── UI-only ───────────────────────────────────────────────────────────────────
export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
}
