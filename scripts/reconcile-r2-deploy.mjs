#!/usr/bin/env node
/**
 * Compare a local deploy manifest to D1 r2_object_inventory: activate manifest keys, mark missing as stale.
 * Does not delete R2 objects. Use scripts/prune-r2-orphans.mjs for deletion (separate, gated).
 *
 * Usage:
 *   node scripts/reconcile-r2-deploy.mjs --manifest analytics/deploys/deploy_x/r2-manifest.json \
 *     --bucket inneranimalmedia --deploy-id deploy_x --apply-stale --dry-run
 */
import { readFileSync, existsSync } from 'fs';
import pathMod from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import {
  repoRootDefault,
  loadEnvCloudflare,
  escapeSqlString,
  isProtectedObjectKey,
} from './lib/r2-inventory-core.mjs';

const root = repoRootDefault;
const __dirname = pathMod.dirname(fileURLToPath(import.meta.url));
const wrapper = pathMod.join(root, 'scripts', 'with-cloudflare-env.sh');

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (name, def = '') => {
    const i = a.indexOf(name);
    return i >= 0 && a[i + 1] ? a[i + 1] : def;
  };
  return {
    manifest: get('--manifest', ''),
    bucket: get('--bucket', ''),
    deployId: get('--deploy-id', ''),
    tenantId: get('--tenant-id', process.env.TENANT_ID || 'tenant_sam_primeaux'),
    workspaceId: get('--workspace-id', process.env.WORKSPACE_ID || 'ws_inneranimalmedia'),
    projectId: get('--project-id', process.env.DOCUMENTS_PROJECT_ID || 'inneranimalmedia'),
    dryRun: a.includes('--dry-run'),
    applyStale: a.includes('--apply-stale'),
    recordManifest: a.includes('--record-manifest'),
    graceDays: Number(get('--grace-days', '14')) || 14,
  };
}

function runD1(sql) {
  execFileSync(
    wrapper,
    ['npx', 'wrangler', 'd1', 'execute', 'inneranimalmedia-business', '--remote', '-c', 'wrangler.production.toml', '--command', sql],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
}

function runD1Json(sql) {
  const raw = execFileSync(
    wrapper,
    ['npx', 'wrangler', 'd1', 'execute', 'inneranimalmedia-business', '--remote', '-c', 'wrangler.production.toml', '--json', '--command', sql],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const parsed = JSON.parse(raw.trim());
  if (parsed?.[0]?.error || parsed?.error) {
    throw new Error(JSON.stringify(parsed?.[0]?.error || parsed?.error));
  }
  return parsed[0]?.results ?? parsed.results ?? [];
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function main() {
  loadEnvCloudflare(root);
  const o = parseArgs();
  if (!o.manifest || !existsSync(o.manifest)) {
    console.error('Missing --manifest path to r2-manifest.json');
    process.exit(1);
  }
  if (!o.bucket) {
    console.error('Missing --bucket');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(o.manifest, 'utf8'));
  const objects = Array.isArray(raw.objects) ? raw.objects : [];
  const manifestKeys = new Set(objects.map((x) => String(x.object_key || '').replace(/^\/+/, '')));
  const deployId = o.deployId || raw.deploy_id || 'unknown';
  const tid = escapeSqlString(o.tenantId);
  const ws = escapeSqlString(o.workspaceId);
  const pid = escapeSqlString(o.projectId);
  const b = escapeSqlString(o.bucket);
  const dep = escapeSqlString(deployId);

  /** @type {{ object_key: string, status?: string, protected?: number }[]} */
  const invRows = runD1Json(
    `SELECT object_key, status, protected FROM r2_object_inventory WHERE bucket_name = '${b}' AND tenant_id = '${tid}' AND workspace_id = '${ws}' AND project_id = '${pid}'`,
  );

  const inventoryKeys = new Set(invRows.map((r) => String(r.object_key || '')));
  const staleCandidates = [];
  for (const row of invRows) {
    const key = String(row.object_key || '');
    if (!key) continue;
    if (manifestKeys.has(key)) continue;
    if (Number(row.protected) === 1) continue;
    if (isProtectedObjectKey(key)) continue;
    staleCandidates.push(key);
  }

  let activate = 0;
  for (const obj of objects) {
    const key = String(obj.object_key || '').replace(/^\/+/, '');
    if (!key) continue;
    if (!inventoryKeys.has(key)) continue;
    activate += 1;
  }

  console.log(
    JSON.stringify(
      {
        bucket: o.bucket,
        deploy_id: deployId,
        manifest_objects: manifestKeys.size,
        inventory_rows: invRows.length,
        keys_to_mark_stale: staleCandidates.length,
        keys_overlapping_manifest: activate,
        dry_run: o.dryRun,
        apply_stale: o.applyStale,
      },
      null,
      2,
    ),
  );

  if (o.recordManifest && !o.dryRun) {
    const mid = escapeSqlString(`mf_${deployId}`);
    const summary = {
      deploy_id: deployId,
      manifest_path: o.manifest,
      object_count: manifestKeys.size,
      total_size_bytes: raw.total_size_bytes ?? null,
      bucket: o.bucket,
    };
    const mj = escapeSqlString(JSON.stringify(summary));
    runD1(
      `INSERT OR REPLACE INTO r2_deploy_manifests (id, tenant_id, workspace_id, project_id, bucket_name, deploy_id, manifest_json, object_count, total_size_bytes, status, applied_at)
       VALUES ('${mid}', '${tid}', '${ws}', '${pid}', '${b}', '${dep}', '${mj}', ${manifestKeys.size}, ${Number(raw.total_size_bytes || 0)}, 'applied', datetime('now'))`,
    );
    console.log(`Recorded manifest summary row ${mid}`);
  } else if (o.recordManifest && o.dryRun) {
    console.log('[dry-run] skip recording r2_deploy_manifests');
  }

  const pruneAfterExpr = `datetime('now', '+${o.graceDays} days')`;

  /** Activate manifest keys before stale pass */
  if (!o.dryRun && objects.length) {
    const keys = objects.map((x) => String(x.object_key || '').replace(/^\/+/, '')).filter(Boolean);
    for (const part of chunk(keys, 50)) {
      const inList = part.map((k) => `'${escapeSqlString(k)}'`).join(',');
      runD1(`UPDATE r2_object_inventory SET
        status = 'active',
        stale_since = NULL,
        prune_after = NULL,
        deploy_id = '${dep}',
        last_seen_deploy_id = '${dep}',
        last_seen_at = datetime('now')
        WHERE bucket_name = '${b}' AND tenant_id = '${tid}' AND workspace_id = '${ws}' AND project_id = '${pid}'
        AND object_key IN (${inList})`);
    }
    console.log('Marked manifest keys active / refreshed deploy metadata.');
  } else if (o.dryRun && objects.length) {
    console.log('[dry-run] would refresh', objects.length, 'manifest keys to active');
  }

  if (o.applyStale && staleCandidates.length) {
    for (const part of chunk(staleCandidates, 40)) {
      const inList = part.map((k) => `'${escapeSqlString(k)}'`).join(',');
      const sql = `UPDATE r2_object_inventory SET
        status = 'stale',
        stale_since = COALESCE(stale_since, datetime('now')),
        prune_after = ${pruneAfterExpr},
        last_seen_deploy_id = '${dep}'
        WHERE bucket_name = '${b}' AND tenant_id = '${tid}' AND workspace_id = '${ws}' AND project_id = '${pid}'
        AND object_key IN (${inList})
        AND COALESCE(protected,0) = 0`;
      if (o.dryRun) {
        console.log('[dry-run] would run stale UPDATE for', part.length, 'keys (sample):', part.slice(0, 5));
      } else {
        runD1(sql);
      }
    }
  }

  console.log('\nPrune recommendation: after grace period, run: npm run r2:prune:dry-run');
}

main();
