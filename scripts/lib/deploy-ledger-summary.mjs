/**
 * Shared deploy digest line + metrics for build_deploy_events (output_summary + metadata_jsonb.deploy_metrics).
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  repoRoot,
  DEPLOY_PIPELINE_STATS_FILE,
  DEPLOY_ROUTE_STATS_FILE,
  DEPLOY_CODEBASE_INDEX_STATS_FILE,
} from './supabase-deploy-paths.mjs';

export function readJsonFile(path, fallback = {}) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export function shortSha(sha) {
  if (!sha || typeof sha !== 'string') return 'unknown';
  const s = sha.trim();
  if (s.length <= 7) return s || 'unknown';
  return s.slice(0, 7);
}

function pickStr(v, fallback = 'unknown') {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v);
}

function boolOrNull(v) {
  if (v === undefined || v === null) return null;
  return Boolean(v);
}

/**
 * @param {object} opts
 * @param {'passed'|'failed'} opts.status
 * @param {object} [opts.deployCtx]
 * @param {object} [opts.worker]
 * @param {object} [opts.evalRes]
 * @param {object} [opts.pipeline]
 * @param {object} [opts.routeStats]
 * @param {object} [opts.codebaseStats]
 * @param {string} [opts.failedStep]
 * @param {string} [opts.errorKey]
 * @param {number} opts.durationMs
 */
export function buildOutputSummaryLine(opts) {
  const {
    status,
    deployCtx = {},
    worker = {},
    evalRes = {},
    pipeline = {},
    routeStats = {},
    codebaseStats = {},
    failedStep,
    errorKey,
    durationMs,
  } = opts;

  const commit = shortSha(worker.git_commit_sha || deployCtx.git_commit_sha);
  const branch = pickStr(worker.git_branch || deployCtx.git_branch, 'unknown');
  const env = pickStr(deployCtx.environment || process.env.DEPLOY_ENV, 'unknown');

  const total_ms = Number.isFinite(durationMs) ? Math.max(0, Math.floor(durationMs)) : 'unknown';
  const build_ms =
    pipeline.build_ms != null ? pipeline.build_ms : worker.build_ms != null ? worker.build_ms : 'unknown';
  const wrangler_ms =
    worker.wrangler_duration_ms != null ? worker.wrangler_duration_ms : 'unknown';

  const health =
    evalRes.health_ok === true ? 'true' : evalRes.health_ok === false ? 'false' : 'unknown';
  const rag_smoke =
    evalRes.semantic_smoke_ok === true
      ? 'true'
      : evalRes.semantic_smoke_ok === false
        ? 'false'
        : 'unknown';

  const semantic_strict_src =
    evalRes.semantic_strict !== undefined
      ? evalRes.semantic_strict
      : evalRes.metrics_json?.semantic_strict;
  const semantic_strict =
    semantic_strict_src === true ? 'true' : semantic_strict_src === false ? 'false' : 'unknown';

  const r2_sync = pickStr(worker.r2_sync_status, 'unknown');
  const r2_reconcile = pickStr(worker.r2_reconcile_status, 'unknown');
  const codebase_index = pickStr(codebaseStats.codebase_index_status || pipeline.codebase_index_status, 'unknown');
  const notify = pickStr(worker.notify_status, 'unknown');

  const parts = [
    `status=${status}`,
    `commit=${commit}`,
    `branch=${branch}`,
    `env=${env}`,
    `total_ms=${total_ms}`,
    `build_ms=${build_ms}`,
    `wrangler_ms=${wrangler_ms}`,
    `health=${health}`,
    `rag_smoke=${rag_smoke}`,
    `semantic_strict=${semantic_strict}`,
    `r2_sync=${r2_sync}`,
    `r2_reconcile=${r2_reconcile}`,
    `codebase_index=${codebase_index}`,
    `notify=${notify}`,
  ];

  if (status === 'failed') {
    if (failedStep) parts.push(`failed_step=${pickStr(failedStep, 'unknown')}`);
    if (errorKey) parts.push(`error=${pickStr(errorKey, 'unknown')}`);
  }

  return parts.join('; ');
}

export function buildDeployMetrics({
  durationMs,
  deployCtx = {},
  worker = {},
  evalRes = {},
  pipeline = {},
  routeStats = {},
  codebaseStats = {},
}) {
  return {
    total_ms: Number.isFinite(durationMs) ? Math.max(0, Math.floor(durationMs)) : null,
    build_ms: numOrNull(pipeline.build_ms ?? worker.build_ms),
    wrangler_ms: numOrNull(worker.wrangler_duration_ms),
    r2_sync_ms: numOrNull(worker.r2_sync_ms),
    codebase_index_ms: numOrNull(codebaseStats.codebase_index_ms ?? pipeline.codebase_index_ms),
    route_count: numOrNull(routeStats.route_count),
    object_count: numOrNull(worker.r2_manifest_object_count),
    byte_count: numOrNull(worker.r2_manifest_total_bytes),
    health: boolOrNull(evalRes.health_ok),
    rag_smoke: boolOrNull(evalRes.semantic_smoke_ok),
    semantic_strict: boolOrNull(
      evalRes.semantic_strict !== undefined
        ? evalRes.semantic_strict
        : evalRes.metrics_json?.semantic_strict,
    ),
    r2_sync_status: worker.r2_sync_status ?? null,
    r2_reconcile_status: worker.r2_reconcile_status ?? null,
    codebase_index_status:
      codebaseStats.codebase_index_status ?? pipeline.codebase_index_status ?? null,
    notify_status: worker.notify_status ?? null,
  };
}

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function loadAuxiliaryDeployStats(root = repoRoot()) {
  const pipeline = readJsonFile(resolve(root, DEPLOY_PIPELINE_STATS_FILE), {});
  const routeStats = readJsonFile(resolve(root, DEPLOY_ROUTE_STATS_FILE), {});
  const codebaseStats = readJsonFile(resolve(root, DEPLOY_CODEBASE_INDEX_STATS_FILE), {});
  return { pipeline, routeStats, codebaseStats };
}
