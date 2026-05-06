#!/usr/bin/env node
/**
 * Delete R2 objects that are eligible per D1 inventory (stale + prune_after passed).
 * Default: --dry-run only. Requires bucket + tenant + workspace + project scope.
 *
 * Usage:
 *   node scripts/prune-r2-orphans.mjs --dry-run --bucket inneranimalmedia \
 *     --tenant-id tenant_sam_primeaux --workspace-id ws_inneranimalmedia --project-id inneranimalmedia
 *   node scripts/prune-r2-orphans.mjs --apply --bucket inneranimalmedia ... --force-protected  # dangerous
 */
import { execFileSync } from 'child_process';
import pathMod from 'path';
import { fileURLToPath } from 'url';
import {
  repoRootDefault,
  loadEnvCloudflare,
  escapeSqlString,
  isProtectedObjectKey,
} from './lib/r2-inventory-core.mjs';

const root = repoRootDefault;
const wrapper = pathMod.join(repoRootDefault, 'scripts', 'with-cloudflare-env.sh');

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (name, def = '') => {
    const i = a.indexOf(name);
    return i >= 0 && a[i + 1] ? a[i + 1] : def;
  };
  return {
    bucket: get('--bucket', ''),
    tenantId: get('--tenant-id', ''),
    workspaceId: get('--workspace-id', ''),
    projectId: get('--project-id', ''),
    dryRun: !a.includes('--apply'),
    forceProtected: a.includes('--force-protected'),
  };
}

function runD1Json(sql) {
  const raw = execFileSync(
    pathMod.join(root, 'scripts', 'with-cloudflare-env.sh'),
    ['npx', 'wrangler', 'd1', 'execute', 'inneranimalmedia-business', '--remote', '-c', 'wrangler.production.toml', '--json', '--command', sql],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const parsed = JSON.parse(raw.trim());
  return parsed[0]?.results ?? parsed.results ?? [];
}

function runD1(sql) {
  execFileSync(
    pathMod.join(root, 'scripts', 'with-cloudflare-env.sh'),
    ['npx', 'wrangler', 'd1', 'execute', 'inneranimalmedia-business', '--remote', '-c', 'wrangler.production.toml', '--command', sql],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
}

function rcloneDeleteObject(bucket, key) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const keyId = process.env.R2_ACCESS_KEY_ID;
  const secret = process.env.R2_SECRET_ACCESS_KEY;
  if (!account || !keyId || !secret) {
    throw new Error('Missing R2 credentials');
  }
  const endpoint = `https://${account}.r2.cloudflarestorage.com`;
  const remotePath = `:s3:${bucket}/${key}`;
  execFileSync(
    'rclone',
    [
      'deletefile',
      remotePath,
      '--s3-provider',
      'Cloudflare',
      '--s3-access-key-id',
      keyId,
      '--s3-secret-access-key',
      secret,
      '--s3-endpoint',
      endpoint,
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
}

function main() {
  loadEnvCloudflare(root);
  const o = parseArgs();
  if (!o.bucket || !o.tenantId || !o.workspaceId || !o.projectId) {
    console.error('Required: --bucket --tenant-id --workspace-id --project-id');
    process.exit(1);
  }

  const tid = escapeSqlString(o.tenantId);
  const ws = escapeSqlString(o.workspaceId);
  const pid = escapeSqlString(o.projectId);
  const b = escapeSqlString(o.bucket);

  const rows = runD1Json(
    `SELECT object_key, status, prune_after, protected FROM r2_object_inventory
     WHERE bucket_name = '${b}' AND tenant_id = '${tid}' AND workspace_id = '${ws}' AND project_id = '${pid}'
       AND status IN ('stale','orphaned')
       AND COALESCE(protected,0) = 0
       AND (prune_after IS NOT NULL AND datetime(prune_after) <= datetime('now'))`,
  );

  /** @type {{ object_key: string }[]} */
  const eligible = [];
  for (const row of rows) {
    const key = String(row.object_key || '');
    if (!key) continue;
    if (!o.forceProtected && isProtectedObjectKey(key)) continue;
    eligible.push({ object_key: key });
  }

  console.log(
    JSON.stringify(
      {
        mode: o.dryRun ? 'dry-run' : 'apply',
        bucket: o.bucket,
        eligible_delete: eligible.length,
        sample: eligible.slice(0, 15).map((x) => x.object_key),
      },
      null,
      2,
    ),
  );

  if (o.dryRun) {
    console.log('\nDry-run only. Pass --apply to delete R2 objects and mark rows deleted in D1.');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const { object_key } of eligible) {
    try {
      rcloneDeleteObject(o.bucket, object_key);
      runD1(
        `UPDATE r2_object_inventory SET status = 'deleted', inventoried_at = datetime('now') WHERE bucket_name = '${b}' AND tenant_id = '${tid}' AND workspace_id = '${ws}' AND project_id = '${pid}' AND object_key = '${escapeSqlString(object_key)}'`,
      );
      ok += 1;
    } catch (e) {
      console.warn('delete failed', object_key, String(e?.message || e).slice(0, 200));
      fail += 1;
    }
  }
  console.log(`Deleted ${ok} objects (${fail} failures).`);
}

main();
