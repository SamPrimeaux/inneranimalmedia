// dashboard/components/finance/constants.ts

export const API = {
  summary:       '/api/finance/summary',
  spendByModel:  '/api/finance/spend-by-model',
  spendByDay:    '/api/finance/spend-by-day',
  budgets:       '/api/finance/budgets',
  alerts:        '/api/finance/alerts',
  resolveAlert:  (id: number) => `/api/finance/alerts/${id}/resolve`,
  transactions:  '/api/finance/transactions',
  importCsv:     '/api/finance/import-csv',
  health:        '/api/finance/health',
} as const;

// Provider → display color (matches OpenAI purple palette shifted to IAM teal)
export const PROVIDER_COLORS: Record<string, string> = {
  openai:      '#7c6df0',
  anthropic:   '#e07d54',
  workers_ai:  '#38bdf8',
  google:      '#4ade80',
  groq:        '#facc15',
  unknown:     '#6b7280',
};

// Model key highlight rules (orange = over-spend risk)
export const HOT_MODEL_PATTERNS = [/codex/i, /5[_-]?4/i, /o3/i, /o4/i];

export function isHotModel(modelKey: string): boolean {
  return HOT_MODEL_PATTERNS.some((re) => re.test(modelKey));
}

export const SEVERITY_COLORS: Record<string, string> = {
  info:     '#38bdf8',
  warning:  '#f59e0b',
  critical: '#ef4444',
};

// ── Formatters ────────────────────────────────────────────────────────────────
export const fmt = {
  usd: (n: number, compact = false): string => {
    if (compact && Math.abs(n) >= 1000) {
      return '$' + (n / 1000).toFixed(1) + 'k';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  },
  num: (n: number): string =>
    new Intl.NumberFormat('en-US').format(Math.round(n)),
  pct: (n: number): string => `${Math.round(n)}%`,
  date: (iso: string): string =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  month: (yyyyMm: string): string => {
    const [y, m] = yyyyMm.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', {
      month: 'short', year: 'numeric',
    });
  },
};

// Current calendar month as YYYY-MM
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const TAB_LABELS: Record<string, string> = {
  'by-model':     'By Model',
  'by-day':       'By Day',
  'transactions': 'Transactions',
  'import':       'Import CSV',
  'alerts':       'Alerts',
};
