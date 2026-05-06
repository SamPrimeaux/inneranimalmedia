#!/usr/bin/env node
/**
 * List R2 bucket objects (rclone) and optionally upsert D1 r2_object_inventory.
 * D1 upserts are batched into SQL files (chunked INSERT … ON CONFLICT) — not one wrangler call per object.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/inventory-r2-bucket.mjs --bucket inneranimalmedia
 *   ./scripts/with-cloudflare-env.sh node scripts/inventory-r2-bucket.mjs --bucket autorag --upsert-d1
 */
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import pathMod from 'path';
import { fileURLToPath } from 'url';
import {
  repoRootDefault,
  loadEnvCloudflare,
  escapeSqlString,
  rcloneLsJson,
  isProtectedObjectKey,
} from './lib/r2-inventory-core.mjs';

const __dirname = pathMod.dirname(fileURLToPath(import.meta.url));
const root = repoRootDefault;
const wrapper = pathMod.join(root, 'scripts', 'with-cloudflare-env.sh');

/** Rows per INSERT batch (limits SQL payload size for remote D1 execute). */
const UPSERT_BATCH_SIZE = Number(process.env.R2_INVENTORY_UPSERT_BATCH_SIZE || 75);

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (name, def = '') => {
    const i = a.indexOf(name);
    return i >= 0 && a[i + 1] ? a[i + 1] : def;
  };
  return {
    bucket: get('--bucket', ''),
    upsertD1: a.includes('--upsert-d1'),
    tenantId: get('--tenant-id', process.env.TENANT_ID || 'tenant_sam_primeaux'),
    workspaceId: get('--workspace-id', process.env.WORKSPACE_ID || 'ws_inneranimalmedia'),
    projectId: get('--project-id', process.env.DOCUMENTS_PROJECT_ID || 'inneranimalmedia'),
    deployId: get('--deploy-id', ''),
    editedBy: get('--edited-by', process.env.DEPLOYED_BY || 'sam_primeaux'),
  };
}

function runD1SqlFile(sqlPath) {
  execFileSync(wrapper, ['npx', 'wrangler', 'd1', 'execute', 'inneranimalmedia-business', '--remote', '-c', 'wrangler.production.toml', '--file', sqlPath], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function buildUpsertSql(o, rows, now, deployEsc, tid, ws, pid, editor) {
  const valueLines = [];
  for (const row of rows) {
    const key = String(row.Path || '').replace(/^\/+/, '');
    if (!key || key.endsWith('/')) continue;
    const sz = Number(row.Size || 0);
    const prot = isProtectedObjectKey(key) ? 1 : 0;
    const reason = prot ? escapeSqlString('protected_prefix') : '';
    const dep = o.deployId ? `'${deployEsc}'` : 'NULL';

    valueLines.push(
      `(
      '${escapeSqlString(o.bucket)}',
      '${escapeSqlString(key)}',
      ${sz},
      '${tid}',
      '${ws}',
      '${pid}',
      'active',
      ${dep},
      ${dep},
      '${escapeSqlString(now)}',
      '${escapeSqlString(now)}',
      ${prot},
      ${prot ? `'${reason}'` : 'NULL'},
      '${editor}',
      '${escapeSqlString(now)}'
    )`,
    );
  }

  if (!valueLines.length) return '';

  return `INSERT INTO r2_object_inventory (
      bucket_name, object_key, size_bytes,
      tenant_id, workspace_id, project_id,
      status, deploy_id, last_seen_deploy_id, last_seen_at, first_seen_at,
      protected, protected_reason, edited_by, inventoried_at
    ) VALUES
${valueLines.join(',\n')}
    ON CONFLICT(bucket_name, object_key) DO UPDATE SET
      size_bytes = excluded.size_bytes,
      tenant_id = excluded.tenant_id,
      workspace_id = excluded.workspace_id,
      project_id = excluded.project_id,
      status = 'active',
      deploy_id = excluded.deploy_id,
      last_seen_deploy_id = excluded.last_seen_deploy_id,
      last_seen_at = excluded.last_seen_at,
      protected = excluded.protected,
      protected_reason = excluded.protected_reason,
      edited_by = excluded.edited_by,
      inventoried_at = excluded.inventoried_at,
      first_seen_at = COALESCE(r2_object_inventory.first_seen_at, excluded.first_seen_at);`;
}

function main() {
  loadEnvCloudflare(root);
  const o = parseArgs();
  if (!o.bucket) {
    console.error('Usage: --bucket <name>');
    process.exit(1);
  }

  const listed = rcloneLsJson(root, o.bucket);
  let bytes = 0;
  for (const row of listed) {
    bytes += Number(row.Size || 0);
  }
  console.log(JSON.stringify({ bucket: o.bucket, object_count: listed.length, total_bytes: bytes }, null, 2));

  if (!o.upsertD1) return;

  const t0 = Date.now();
  const now = new Date().toISOString();
  const deployEsc = o.deployId ? escapeSqlString(o.deployId) : '';
  const tid = escapeSqlString(o.tenantId);
  const ws = escapeSqlString(o.workspaceId);
  const pid = escapeSqlString(o.projectId);
  const editor = escapeSqlString(o.editedBy);

  const objectRows = listed.filter((row) => {
    const key = String(row.Path || '').replace(/^\/+/, '');
    return key && !key.endsWith('/');
  });

  let upserted = 0;
  let batchIdx = 0;
  const batches = chunk(objectRows, UPSERT_BATCH_SIZE);

  for (const part of batches) {
    const sql = buildUpsertSql(o, part, now, deployEsc, tid, ws, pid, editor);
    if (!sql) continue;
    const tmp = pathMod.join(tmpdir(), `iam-r2-inv-${process.pid}-${Date.now()}-${batchIdx}.sql`);
    batchIdx += 1;
    try {
      writeFileSync(tmp, sql, 'utf8');
      runD1SqlFile(tmp);
      upserted += part.filter((r) => {
        const k = String(r.Path || '').replace(/^\/+/, '');
        return k && !k.endsWith('/');
      }).length;
    } catch (e) {
      console.warn('[inventory] batch upsert failed', batchIdx, String(e?.message || e).slice(0, 200));
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  const elapsed_ms = Date.now() - t0;
  const summary = {
    bucket: o.bucket,
    object_count: objectRows.length,
    upsert_count: upserted,
    batch_count: batches.length,
    batch_size: UPSERT_BATCH_SIZE,
    elapsed_ms,
  };
  console.log(JSON.stringify({ phase: 'r2_inventory_upsert_summary', ...summary }, null, 2));
  console.log(
    `[r2-inventory] summary object_count=${objectRows.length} upsert_count=${upserted} batches=${batches.length} elapsed_ms=${elapsed_ms}`,
  );
  console.log(`[r2-inventory] end objects=${objectRows.length} upserted=${upserted} elapsed_ms=${elapsed_ms}`);
}

main();
