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
  kpis = undefined,
  workflowRunsOverTime = undefined,
  latestExecutionWaterfall = undefined,
  errorInbox = undefined,
  modelLeaderboard = undefined,
  costLatencyScatter = undefined,
  tokensOverTime = undefined,
  codebaseOverview = undefined,
  ragHealth = undefined,
  deployments = undefined,
  sourceStatus = undefined,
  meta = undefined,
  status = 200,
}) {
  const body = {
    ok,
    backend,
    range,
    generated_at: Date.now(),
    summary,
    series,
    breakdowns,
    rows,
    warnings,
  };
  if (kpis !== undefined) body.kpis = kpis;
  if (workflowRunsOverTime !== undefined) body.workflowRunsOverTime = workflowRunsOverTime;
  if (latestExecutionWaterfall !== undefined) body.latestExecutionWaterfall = latestExecutionWaterfall;
  if (errorInbox !== undefined) body.errorInbox = errorInbox;
  if (modelLeaderboard !== undefined) body.modelLeaderboard = modelLeaderboard;
  if (costLatencyScatter !== undefined) body.costLatencyScatter = costLatencyScatter;
  if (tokensOverTime !== undefined) body.tokensOverTime = tokensOverTime;
  if (codebaseOverview !== undefined) body.codebaseOverview = codebaseOverview;
  if (ragHealth !== undefined) body.ragHealth = ragHealth;
  if (deployments !== undefined) body.deployments = deployments;
  if (sourceStatus !== undefined) body.sourceStatus = sourceStatus;
  if (meta !== undefined) body.meta = meta;
  return jsonResponse(body, status);
}

