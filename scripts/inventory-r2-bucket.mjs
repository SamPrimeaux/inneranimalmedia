#!/usr/bin/env node
/**
 * List R2 bucket objects (rclone) and optionally upsert D1 r2_object_inventory.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/inventory-r2-bucket.mjs --bucket inneranimalmedia
 *   ./scripts/with-cloudflare-env.sh node scripts/inventory-r2-bucket.mjs --bucket autorag --upsert-d1
 */
import { execFileSync } from 'child_process';
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

function runD1Command(sql) {
  execFileSync(wrapper, ['npx', 'wrangler', 'd1', 'execute', 'inneranimalmedia-business', '--remote', '-c', 'wrangler.production.toml', '--command', sql], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
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

  const now = new Date().toISOString();
  const deployEsc = o.deployId ? escapeSqlString(o.deployId) : '';
  const tid = escapeSqlString(o.tenantId);
  const ws = escapeSqlString(o.workspaceId);
  const pid = escapeSqlString(o.projectId);
  const editor = escapeSqlString(o.editedBy);

  let n = 0;
  for (const row of listed) {
    const key = String(row.Path || '').replace(/^\/+/, '');
    if (!key || key.endsWith('/')) continue;
    const sz = Number(row.Size || 0);
    const prot = isProtectedObjectKey(key) ? 1 : 0;
    const reason = prot ? escapeSqlString('protected_prefix') : '';
    const dep = o.deployId ? `'${deployEsc}'` : 'NULL';

    const sql = `INSERT INTO r2_object_inventory (
      bucket_name, object_key, size_bytes,
      tenant_id, workspace_id, project_id,
      status, deploy_id, last_seen_deploy_id, last_seen_at, first_seen_at,
      protected, protected_reason, edited_by, inventoried_at
    ) VALUES (
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
    )
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
    try {
      runD1Command(sql);
      n += 1;
    } catch (e) {
      console.warn('[inventory] upsert failed for key', key, String(e?.message || e).slice(0, 120));
    }
  }
  console.log(`Upserted ${n} rows into r2_object_inventory (best-effort per row).`);
}

main();
