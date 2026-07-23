#!/usr/bin/env node
/**
 * deploy-trail-gate.mjs — hard production deploy trail gate.
 * Exit 0 only when deployments + dashboard_versions + deployment_health are complete
 * for this git SHA, with every required column populated and changed_files non-empty.
 */
import { d1Query, sqlQuote } from './lib/d1-remote.mjs';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './lib/load-env-cloudflare.mjs';

const gitRef = String(process.argv[2] || process.env.GIT_HASH || '').trim();
const MAX_WAIT_MS = Number(process.env.DEPLOY_TRAIL_GATE_WAIT_MS || 120_000);
const POLL_MS = Number(process.env.DEPLOY_TRAIL_GATE_POLL_MS || 5_000);

const DEPLOYMENTS_REQUIRED = [
  'id',
  'timestamp',
  'version',
  'git_hash',
  'changed_files',
  'description',
  'status',
  'deployed_by',
  'environment',
  'deploy_duration_ms',
  'rollback_from',
  'notes',
  'created_at',
  'deploy_time_seconds',
  'worker_name',
  'triggered_by',
  'tenant_id',
  'workspace_id',
  'project_id',
  'run_group_id',
  'metadata_json',
];

const DASHBOARD_REQUIRED = [
  'id',
  'page_name',
  'version',
  'file_hash',
  'file_size',
  'r2_path',
  'local_backup_path',
  'description',
  'is_locked',
  'is_production',
  'screenshot_url',
  'created_at',
  'locked_at',
  'locked_by',
  'metadata_json',
  'environment',
  'git_commit',
  'session_tag',
  'is_active',
  'build_pipeline',
  'deployed_at',
];

function fail(msg) {
  console.error(`❌ DEPLOY TRAIL GATE FAILED: ${msg}`);
  console.error(`   git_ref=${gitRef}`);
  try {
    spawnSync(
      process.execPath,
      [
        `${REPO_ROOT}/scripts/notify-ops.mjs`,
        '--severity=critical',
        `--message=Deploy trail incomplete for ${gitRef}: ${msg}`,
      ],
      {
        cwd: REPO_ROOT,
        env: process.env,
        stdio: 'inherit',
      },
    );
  } catch {
    /* notify best-effort */
  }
  process.exit(1);
}

function resolveHashes(ref) {
  const full =
    spawnSync('git', ['-C', REPO_ROOT, 'rev-parse', ref], { encoding: 'utf8' }).stdout?.trim() ||
    ref;
  const short =
    spawnSync('git', ['-C', REPO_ROOT, 'rev-parse', '--short=12', ref], { encoding: 'utf8' })
      .stdout?.trim() || full.slice(0, 12);
  const short7 = full.slice(0, 7);
  return { full, short, short7, raw: ref };
}

function missingCols(row, required) {
  if (!row) return required.slice();
  const out = [];
  for (const k of required) {
    const v = row[k];
    if (v === null || v === undefined) out.push(k);
  }
  return out;
}

function changedFilesOk(raw) {
  if (raw == null) return false;
  const s = String(raw).trim();
  if (!s || s === '[]' || s === 'MISSING' || s === 'null') return false;
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return s.length > 2;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function checkOnce(hashes) {
  const likeFull = `${hashes.full}%`;
  const likeShort = `${hashes.short}%`;
  const like7 = `${hashes.short7}%`;
  const likeRaw = `${hashes.raw}%`;

  const deployments = d1Query(
    `SELECT * FROM deployments
     WHERE git_hash = ${sqlQuote(hashes.full)}
        OR git_hash = ${sqlQuote(hashes.short)}
        OR git_hash = ${sqlQuote(hashes.short7)}
        OR git_hash = ${sqlQuote(hashes.raw)}
        OR git_hash LIKE ${sqlQuote(likeFull)}
        OR git_hash LIKE ${sqlQuote(likeShort)}
        OR git_hash LIKE ${sqlQuote(like7)}
        OR git_hash LIKE ${sqlQuote(likeRaw)}
     ORDER BY rowid DESC
     LIMIT 5`,
  );
  const dep = deployments[0] || null;

  const dashRows = d1Query(
    `SELECT * FROM dashboard_versions
     WHERE COALESCE(is_active, 0) = 1
       AND (
         git_commit = ${sqlQuote(hashes.full)}
         OR git_commit = ${sqlQuote(hashes.short)}
         OR git_commit = ${sqlQuote(hashes.short7)}
         OR git_commit LIKE ${sqlQuote(likeFull)}
         OR git_commit LIKE ${sqlQuote(likeShort)}
         OR git_commit LIKE ${sqlQuote(like7)}
       )
       AND page_name IN ('agent', 'agent-css', 'agent-html')`,
  );

  const health = d1Query(
    `SELECT id, status, deployment_id, checked_by, checked_at_unix
     FROM agentsam_deployment_health
     WHERE status = 'healthy'
       AND (
         deployment_id IN (
           SELECT id FROM deployments
           WHERE git_hash = ${sqlQuote(hashes.full)}
              OR git_hash = ${sqlQuote(hashes.short)}
              OR git_hash LIKE ${sqlQuote(likeFull)}
              OR git_hash LIKE ${sqlQuote(likeShort)}
           ORDER BY rowid DESC LIMIT 5
         )
         OR checked_at_unix >= unixepoch() - 900
       )
     ORDER BY COALESCE(checked_at_unix, 0) DESC
     LIMIT 1`,
  )[0];

  return { dep, dashRows, health };
}

if (!gitRef) fail('git hash required');

const hashes = resolveHashes(gitRef);
console.log(
  `[deploy-trail-gate] checking trail for full=${hashes.full} short=${hashes.short} (max ${MAX_WAIT_MS}ms)…`,
);

const started = Date.now();
let last = { dep: null, dashRows: [], health: null };

while (Date.now() - started < MAX_WAIT_MS) {
  last = checkOnce(hashes);
  const depMiss = missingCols(last.dep, DEPLOYMENTS_REQUIRED);
  const pages = new Set((last.dashRows || []).map((r) => r.page_name));
  const dashOk =
    pages.has('agent') && pages.has('agent-css') && pages.has('agent-html') && last.dashRows.length >= 3;
  let dashColMiss = [];
  for (const row of last.dashRows || []) {
    dashColMiss = dashColMiss.concat(
      missingCols(row, DASHBOARD_REQUIRED).map((c) => `${row.page_name}.${c}`),
    );
  }
  const healthOk = last.health && String(last.health.status) === 'healthy';
  const filesOk = changedFilesOk(last.dep?.changed_files);

  if (last.dep && depMiss.length === 0 && filesOk && dashOk && dashColMiss.length === 0 && healthOk) {
    console.log(
      `✅ Deploy trail complete for ${hashes.full}: deployments id=${last.dep.id} changed_files=${String(last.dep.changed_files).slice(0, 120)}… dashboard_versions=${last.dashRows.length} health=${last.health.id}`,
    );
    process.exit(0);
  }

  await sleep(POLL_MS);
}

const depMiss = missingCols(last.dep, DEPLOYMENTS_REQUIRED);
const pages = new Set((last.dashRows || []).map((r) => r.page_name));
const reasons = [];
if (!last.dep) reasons.push('no deployments row for git hash');
else {
  if (depMiss.length) reasons.push(`deployments null columns: ${depMiss.join(',')}`);
  if (!changedFilesOk(last.dep.changed_files)) {
    reasons.push(`changed_files empty/missing (${String(last.dep.changed_files)})`);
  }
}
if (!(pages.has('agent') && pages.has('agent-css') && pages.has('agent-html'))) {
  reasons.push(`dashboard_versions active pages=${[...pages].join(',') || 'none'} (need agent+agent-css+agent-html)`);
}
for (const row of last.dashRows || []) {
  const m = missingCols(row, DASHBOARD_REQUIRED);
  if (m.length) reasons.push(`${row.page_name} null: ${m.join(',')}`);
}
if (!last.health || last.health.status !== 'healthy') {
  reasons.push(`deployment_health missing/unhealthy (${last.health?.status || 'MISSING'})`);
}

fail(`trail incomplete after ${MAX_WAIT_MS}ms — ${reasons.join('; ')}`);
