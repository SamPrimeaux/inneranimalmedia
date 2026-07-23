#!/usr/bin/env node
/**
 * deploy-trail-gate.mjs — hard production deploy trail gate.
 * Exit 0 only when deployments + dashboard_versions + deployment_health are complete
 * for this git SHA, with every required column populated and changed_files non-empty.
 */
import { d1Query, sqlQuote } from './lib/d1-remote.mjs';
import { loadEnvCloudflare, REPO_ROOT } from './lib/load-env-cloudflare.mjs';
import { spawnSync } from 'node:child_process';

loadEnvCloudflare(REPO_ROOT);

const gitRef = String(process.argv[2] || process.env.GIT_HASH || '').trim();
const MAX_WAIT_MS = Number(process.env.DEPLOY_TRAIL_GATE_WAIT_MS || 90_000);
const POLL_MS = Number(process.env.DEPLOY_TRAIL_GATE_POLL_MS || 3_000);

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
      { cwd: REPO_ROOT, env: process.env, stdio: 'inherit' },
    );
  } catch {
    /* best-effort */
  }
  process.exit(1);
}

function resolveHashes(ref) {
  const fullProc = spawnSync('git', ['-C', REPO_ROOT, 'rev-parse', ref], { encoding: 'utf8' });
  const full = (fullProc.stdout || '').trim() || ref;
  if (!/^[0-9a-f]{40}$/i.test(full)) {
    fail(`git ref must resolve to full 40-char SHA (got: '${full}') — no short-hash gate matching`);
  }
  // Legacy LIKE helpers only to locate old bad rows; acceptance still requires 40-char storage.
  const prefix12 = full.slice(0, 12);
  const prefix7 = full.slice(0, 7);
  return { full: full.toLowerCase(), prefix12, prefix7, raw: ref };
}

function isFullSha(v) {
  return /^[0-9a-f]{40}$/i.test(String(v || '').trim());
}

function missingCols(row, required) {
  if (!row) return required.slice();
  return required.filter((k) => row[k] === null || row[k] === undefined);
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

function safeQuery(label, sql) {
  try {
    return d1Query(sql);
  } catch (e) {
    console.error(`[deploy-trail-gate] ${label} query error: ${e?.message || e}`);
    return [];
  }
}

function checkOnce(hashes) {
  // Simple queries only — nested ORDER BY/LIMIT in IN() hung/emptied D1 on CF.
  // Prefix OR clauses locate legacy short-hash rows so we can fail them loudly.
  const dep =
    safeQuery(
      'deployments',
      `SELECT * FROM deployments
       WHERE git_hash = ${sqlQuote(hashes.full)}
          OR git_hash = ${sqlQuote(hashes.prefix12)}
          OR git_hash LIKE ${sqlQuote(hashes.prefix7 + '%')}
       ORDER BY rowid DESC LIMIT 1`,
    )[0] || null;

  const dashRows = safeQuery(
    'dashboard_versions',
    `SELECT * FROM dashboard_versions
     WHERE COALESCE(is_active, 0) = 1
       AND page_name IN ('agent', 'agent-css', 'agent-html')
       AND (
         git_commit = ${sqlQuote(hashes.full)}
         OR git_commit = ${sqlQuote(hashes.prefix12)}
         OR git_commit LIKE ${sqlQuote(hashes.prefix7 + '%')}
       )`,
  );

  let health = null;
  if (dep?.id) {
    health =
      safeQuery(
        'deployment_health',
        `SELECT id, status, deployment_id, checked_by, checked_at_unix
         FROM agentsam_deployment_health
         WHERE deployment_id = ${sqlQuote(dep.id)}
         ORDER BY rowid DESC LIMIT 1`,
      )[0] || null;
  }
  if (!health) {
    health =
      safeQuery(
        'deployment_health_recent',
        `SELECT id, status, deployment_id, checked_by, checked_at_unix
         FROM agentsam_deployment_health
         WHERE checked_by = 'post_deploy_record'
           AND checked_at_unix >= unixepoch() - 900
         ORDER BY checked_at_unix DESC LIMIT 1`,
      )[0] || null;
  }

  return { dep, dashRows, health };
}

if (!gitRef) fail('git hash required');

const hashes = resolveHashes(gitRef);
console.error(`[deploy-trail-gate] checking full=${hashes.full} (max ${MAX_WAIT_MS}ms)`);

const started = Date.now();
let last = { dep: null, dashRows: [], health: null };

while (Date.now() - started < MAX_WAIT_MS) {
  last = checkOnce(hashes);
  const depMiss = missingCols(last.dep, DEPLOYMENTS_REQUIRED);
  const shortHashFail =
    last.dep && !isFullSha(last.dep.git_hash)
      ? `deployments.git_hash not 40-char (got: '${last.dep.git_hash}')`
      : null;
  const shortCommitFails = (last.dashRows || [])
    .filter((r) => !isFullSha(r.git_commit))
    .map((r) => `${r.page_name}.git_commit='${r.git_commit}'`);
  const pages = new Set((last.dashRows || []).map((r) => r.page_name));
  const dashOk =
    pages.has('agent') && pages.has('agent-css') && pages.has('agent-html') && last.dashRows.length >= 3;
  const dashColMiss = [];
  for (const row of last.dashRows || []) {
    for (const c of missingCols(row, DASHBOARD_REQUIRED)) dashColMiss.push(`${row.page_name}.${c}`);
  }
  const healthOk = last.health && String(last.health.status) === 'healthy';
  const filesOk = changedFilesOk(last.dep?.changed_files);

  if (
    last.dep &&
    !shortHashFail &&
    shortCommitFails.length === 0 &&
    depMiss.length === 0 &&
    filesOk &&
    dashOk &&
    dashColMiss.length === 0 &&
    healthOk
  ) {
    console.error(
      `✅ Deploy trail complete for ${hashes.full}: deployments=${last.dep.id} changed_files_ok dashboard=${last.dashRows.length} health=${last.health.id}`,
    );
    process.exit(0);
  }

  // Short-hash rows are never "waiting" — they are immediate failures (script bypassed).
  if (shortHashFail || shortCommitFails.length) {
    fail(
      [
        shortHashFail,
        shortCommitFails.length ? `dashboard_versions short git_commit: ${shortCommitFails.join(',')}` : null,
      ]
        .filter(Boolean)
        .join('; '),
    );
  }

  const progress = {
    dep: last.dep?.id || null,
    filesOk,
    depMiss: depMiss.slice(0, 5),
    pages: [...pages],
    dashColMiss: dashColMiss.slice(0, 5),
    health: last.health?.status || null,
  };
  console.error(`[deploy-trail-gate] waiting… ${JSON.stringify(progress)}`);
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
  reasons.push(`dashboard_versions active pages=${[...pages].join(',') || 'none'}`);
}
for (const row of last.dashRows || []) {
  const m = missingCols(row, DASHBOARD_REQUIRED);
  if (m.length) reasons.push(`${row.page_name} null: ${m.join(',')}`);
}
if (!last.health || last.health.status !== 'healthy') {
  reasons.push(`deployment_health missing/unhealthy (${last.health?.status || 'MISSING'})`);
}

fail(`trail incomplete after ${MAX_WAIT_MS}ms — ${reasons.join('; ')}`);
