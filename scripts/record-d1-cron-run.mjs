#!/usr/bin/env node
/**
 * Log maintenance jobs to D1 agentsam_cron_runs (remote).
 * No hardcoded tenant/workspace — pass via env or flags.
 *
 * Modes: --start | --complete | --fail | --skip (one required)
 */
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'crypto';
import { repoRoot } from './lib/supabase-deploy-paths.mjs';
import { loadDotEnvCloudflare } from './lib/supabase-deploy-context.mjs';
import {
  escapeSqlLiteral,
  hasCloudflareToken,
  pragmaTableInfo,
  runD1Query,
  runD1Exec,
  sqlString,
  sqlInt,
} from './lib/d1-deploy-record.mjs';

function randSuffix() {
  return randomBytes(6).toString('hex');
}

function parseArgs(argv) {
  const flags = new Map();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) {
      flags.set(a.slice(2, eq), a.slice(eq + 1));
    } else {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags.set(key, next);
        i += 1;
      } else {
        flags.set(key, '1');
      }
    }
  }
  return flags;
}

function safeJsonParse(s, fb = {}) {
  try {
    if (!s || typeof s !== 'string') return fb;
    return JSON.parse(s);
  } catch {
    return fb;
  }
}

function mergeMetadata(existingStr, patchObj) {
  let base = {};
  try {
    base = JSON.parse(existingStr || '{}');
  } catch {
    base = {};
  }
  return JSON.stringify({ ...base, ...(patchObj && typeof patchObj === 'object' ? patchObj : {}) });
}

function cronTableMissingWarn() {
  console.warn('[cron-run] agentsam_cron_runs table missing or unreachable — skipping ledger row');
}

export async function d1CronRunStart(repoRoot, o) {
  if (!hasCloudflareToken()) return { skipped: true, reason: 'no_cf_token' };
  const cols = pragmaTableInfo(repoRoot, 'agentsam_cron_runs');
  if (!cols.size) {
    cronTableMissingWarn();
    return { skipped: true, reason: 'no_table' };
  }

  const id = o.cronRunId || `acr_${Date.now()}_${randSuffix()}`;
  const jobName = String(o.jobName ?? '').trim();
  if (!jobName) throw new Error('job_name required');

  const cronExpression = o.cronExpression != null ? String(o.cronExpression) : null;
  const tenantId = String(o.tenantId ?? '').trim();
  const workspaceId = String(o.workspaceId ?? '').trim();
  let meta = {};
  if (o.metadataJson != null) {
    meta =
      typeof o.metadataJson === 'object' && !Array.isArray(o.metadataJson)
        ? o.metadataJson
        : safeJsonParse(String(o.metadataJson));
  }

  const parts = [];
  const vals = [];
  const add = (c, v) => {
    if (!cols.has(c)) return;
    parts.push(c);
    vals.push(v);
  };

  add('id', sqlString(id));
  add('job_name', sqlString(jobName));
  add('cron_expression', cronExpression ? sqlString(cronExpression) : 'NULL');
  add('status', sqlString('running'));
  add('tenant_id', tenantId ? sqlString(tenantId) : 'NULL');
  add('workspace_id', workspaceId ? sqlString(workspaceId) : 'NULL');
  add('started_at', 'unixepoch()');
  if (cols.has('metadata_json')) add('metadata_json', sqlString(JSON.stringify(meta)));

  if (!parts.length) return { skipped: true, reason: 'no_columns' };

  await runD1Exec(
    repoRoot,
    `INSERT INTO agentsam_cron_runs (${parts.join(', ')}) VALUES (${vals.join(', ')})`,
  );
  return { id, startedAtMs: Date.now() };
}

async function readRow(repoRoot, id) {
  const q = `SELECT started_at, metadata_json FROM agentsam_cron_runs WHERE id = '${escapeSqlLiteral(id)}' LIMIT 1`;
  const rows = runD1Query(repoRoot, q);
  return rows[0] || null;
}

export async function d1CronRunComplete(repoRoot, o) {
  if (!hasCloudflareToken()) return { skipped: true };
  const cols = pragmaTableInfo(repoRoot, 'agentsam_cron_runs');
  if (!cols.size) {
    cronTableMissingWarn();
    return { skipped: true };
  }

  const id = String(o.cronRunId ?? '').trim();
  if (!id) throw new Error('cron_run_id required');

  const row = await readRow(repoRoot, id);
  const startedAtSec = row?.started_at != null ? Number(row.started_at) : Math.floor(Date.now() / 1000);
  const completedAtSec = Math.floor(Date.now() / 1000);
  const durationMs = Math.max(0, (completedAtSec - startedAtSec) * 1000);

  let metaStr = '{}';
  if (cols.has('metadata_json') && row?.metadata_json != null) {
    metaStr = String(row.metadata_json);
  }
  const merged = mergeMetadata(metaStr, o.metadataPatch ?? {});

  const sets = [`status=${sqlString('completed')}`, `completed_at=unixepoch()`, `duration_ms=${sqlInt(durationMs)}`];
  if (cols.has('rows_read')) sets.push(`rows_read=${sqlInt(o.rowsRead ?? 0)}`);
  if (cols.has('rows_written')) sets.push(`rows_written=${sqlInt(o.rowsWritten ?? 0)}`);
  if (cols.has('metadata_json')) sets.push(`metadata_json=${sqlString(merged)}`);

  await runD1Exec(repoRoot, `UPDATE agentsam_cron_runs SET ${sets.join(', ')} WHERE id=${sqlString(id)}`);
  return { durationMs };
}

export async function d1CronRunFail(repoRoot, o) {
  if (!hasCloudflareToken()) return { skipped: true };
  const cols = pragmaTableInfo(repoRoot, 'agentsam_cron_runs');
  if (!cols.size) {
    cronTableMissingWarn();
    return { skipped: true };
  }

  const id = String(o.cronRunId ?? '').trim();
  if (!id) throw new Error('cron_run_id required');

  const row = await readRow(repoRoot, id);
  const startedAtSec = row?.started_at != null ? Number(row.started_at) : Math.floor(Date.now() / 1000);
  const completedAtSec = Math.floor(Date.now() / 1000);
  const durationMs = Math.max(0, (completedAtSec - startedAtSec) * 1000);

  let metaStr = '{}';
  if (cols.has('metadata_json') && row?.metadata_json != null) {
    metaStr = String(row.metadata_json);
  }
  const merged = mergeMetadata(metaStr, { ...(o.metadataPatch || {}), error: true });

  const msg = String(o.errorMessage ?? 'unknown_error').slice(0, 4000);
  const sets = [
    `status=${sqlString('failed')}`,
    `completed_at=unixepoch()`,
    `duration_ms=${sqlInt(durationMs)}`,
    `error_message=${sqlString(msg)}`,
  ];
  if (cols.has('rows_read')) sets.push(`rows_read=${sqlInt(o.rowsRead ?? 0)}`);
  if (cols.has('rows_written')) sets.push(`rows_written=${sqlInt(o.rowsWritten ?? 0)}`);
  if (cols.has('metadata_json')) sets.push(`metadata_json=${sqlString(merged)}`);

  await runD1Exec(repoRoot, `UPDATE agentsam_cron_runs SET ${sets.join(', ')} WHERE id=${sqlString(id)}`);
  return { durationMs };
}

export async function d1CronRunSkip(repoRoot, o) {
  if (!hasCloudflareToken()) return { skipped: true };
  const cols = pragmaTableInfo(repoRoot, 'agentsam_cron_runs');
  if (!cols.size) {
    cronTableMissingWarn();
    return { skipped: true };
  }

  const id = o.cronRunId || `acr_${Date.now()}_${randSuffix()}`;
  const jobName = String(o.jobName ?? '').trim();
  if (!jobName) throw new Error('job_name required');

  const cronExpression = o.cronExpression != null ? String(o.cronExpression) : null;
  const tenantId = String(o.tenantId ?? '').trim();
  const workspaceId = String(o.workspaceId ?? '').trim();
  const reason = String(o.errorMessage ?? 'skipped').slice(0, 4000);
  const meta = { ...(o.metadataJson || {}), skipped: true };

  const parts = [];
  const vals = [];
  const add = (c, v) => {
    if (!cols.has(c)) return;
    parts.push(c);
    vals.push(v);
  };

  add('id', sqlString(id));
  add('job_name', sqlString(jobName));
  add('cron_expression', cronExpression ? sqlString(cronExpression) : 'NULL');
  add('status', sqlString('skipped'));
  add('tenant_id', tenantId ? sqlString(tenantId) : 'NULL');
  add('workspace_id', workspaceId ? sqlString(workspaceId) : 'NULL');
  add('started_at', 'unixepoch()');
  add('completed_at', 'unixepoch()');
  add('duration_ms', '0');
  if (cols.has('error_message')) add('error_message', sqlString(reason));
  if (cols.has('metadata_json')) add('metadata_json', sqlString(JSON.stringify(meta)));

  if (!parts.length) return { skipped: true };

  await runD1Exec(
    repoRoot,
    `INSERT INTO agentsam_cron_runs (${parts.join(', ')}) VALUES (${vals.join(', ')})`,
  );
  return { id };
}

async function main() {
  const flags = parseArgs(process.argv);
  const root = repoRoot();
  loadDotEnvCloudflare(root);

  const tenantId = String(flags.get('tenant-id') ?? process.env.TENANT_ID ?? '').trim();
  const workspaceId = String(flags.get('workspace-id') ?? process.env.WORKSPACE_ID ?? '').trim();
  const jobName = String(flags.get('job-name') ?? '').trim();
  const cronExpression = flags.get('cron-expression') ?? null;
  const cronRunId = flags.get('cron-run-id') ?? null;
  const rowsRead = flags.get('rows-read');
  const rowsWritten = flags.get('rows-written');
  const errorMessage = flags.get('error-message') ?? null;
  const metadataJson = flags.get('metadata-json');

  const strict = process.env.CRON_STRICT_D1 === '1';

  try {
    if (flags.has('start')) {
      const meta = metadataJson ? safeJsonParse(metadataJson) : {};
      const out = await d1CronRunStart(root, {
        jobName,
        cronExpression,
        tenantId,
        workspaceId,
        cronRunId,
        metadataJson: meta,
      });
      if (out.id) console.log(out.id);
      process.exit(0);
    }

    if (flags.has('complete')) {
      await d1CronRunComplete(root, {
        cronRunId,
        rowsRead: rowsRead != null ? Number(rowsRead) : 0,
        rowsWritten: rowsWritten != null ? Number(rowsWritten) : 0,
        metadataPatch: metadataJson ? safeJsonParse(metadataJson) : {},
      });
      process.exit(0);
    }

    if (flags.has('fail')) {
      await d1CronRunFail(root, {
        cronRunId,
        errorMessage,
        rowsRead: rowsRead != null ? Number(rowsRead) : 0,
        rowsWritten: rowsWritten != null ? Number(rowsWritten) : 0,
        metadataPatch: metadataJson ? safeJsonParse(metadataJson) : {},
      });
      process.exit(0);
    }

    if (flags.has('skip')) {
      await d1CronRunSkip(root, {
        jobName,
        cronExpression,
        tenantId,
        workspaceId,
        cronRunId,
        errorMessage,
        metadataJson: metadataJson ? safeJsonParse(metadataJson) : {},
      });
      process.exit(0);
    }

    console.error('Usage: --start|--complete|--fail|--skip --job-name ... (see script header)');
    process.exit(2);
  } catch (e) {
    console.warn('[cron-run]', e?.message || e);
    if (strict) process.exit(1);
    process.exit(0);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
