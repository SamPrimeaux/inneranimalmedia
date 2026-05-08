import { jsonResponse } from '../../../core/auth.js';

export function parseRange(url) {
  const raw = String(url?.searchParams?.get('range') || '7d').toLowerCase();
  if (raw === '24h') return '24h';
  if (raw === '30d') return '30d';
  if (raw === 'all') return 'all';
  return '7d';
}

export function analyticsResponse({
  ok = true,
  backend = 'mixed',
  range = '7d',
  summary = {},
  series = [],
  breakdowns = [],
  rows = [],
  warnings = [],
  status = 200,
}) {
  return jsonResponse(
    {
      ok,
      backend,
      range,
      generated_at: Date.now(),
      summary,
      series,
      breakdowns,
      rows,
      warnings,
    },
    status,
  );
}

