#!/usr/bin/env node
/**
 * Cancel stale Supabase build_deploy_events (deploy_started + running past cutoff).
 * Optional D1 agentsam_cron_run ledger via record-d1-cron-run.mjs.
 *
 * Env: TENANT_ID, WORKSPACE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: TRIGGER_SOURCE, DEPLOY_SCRIPT_NAME (logged in cron metadata)
 */
import { loadDotEnvCloudflare } from './lib/supabase-deploy-context.mjs';
import { repoRoot } from './lib/supabase-deploy-paths.mjs';
import { gitShort } from './lib/d1-deploy-record.mjs';
import { finalizeStaleDeployEvents } from '../src/core/supabase-finalize-stale-deploy-events.js';
import {
  d1CronRunStart,
  d1CronRunComplete,
  d1CronRunFail,
} from './record-d1-cron-run.mjs';

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

function cronExprForMode(mode) {
  switch (mode) {
    case 'startup':
      return 'manual/startup';
    case 'post-deploy':
      return 'manual/post-deploy';
    case 'weekly-rollup':
      return '0 1 ? * SUN';
    default:
      return 'manual/cli';
  }
}

async function main() {
  const flags = parseArgs(process.argv);
  const root = repoRoot();
  loadDotEnvCloudflare(root);

  const mode = String(flags.get('mode') ?? 'manual').trim();
  let olderThanMinutes =
    flags.get('older-than-minutes') != null ? Number(flags.get('older-than-minutes')) : null;
  let olderThanHours =
    flags.get('older-than-hours') != null ? Number(flags.get('older-than-hours')) : null;

  if (!Number.isFinite(olderThanMinutes)) olderThanMinutes = null;
  if (!Number.isFinite(olderThanHours)) olderThanHours = null;

  if (olderThanMinutes == null && olderThanHours == null) {
    if (mode === 'weekly-rollup') olderThanHours = 24;
    else if (mode === 'post-deploy') olderThanMinutes = 15;
    else olderThanMinutes = 30;
  }

  let effectiveDryRun = true;
  if (flags.has('apply')) effectiveDryRun = false;
  if (flags.has('dry-run')) effectiveDryRun = true;

  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const tenantId = String(process.env.TENANT_ID ?? '').trim();
  const workspaceId = String(process.env.WORKSPACE_ID ?? '').trim();

  if (!supabaseUrl || !serviceKey || !tenantId || !workspaceId) {
    console.warn(
      '[finalize-stale] Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TENANT_ID, or WORKSPACE_ID — skip',
    );
    process.exit(0);
  }

  const commitShort = gitShort(root);
  const cutoffPreviewMs =
    olderThanHours != null
      ? Date.now() - olderThanHours * 3600000
      : Date.now() - (olderThanMinutes ?? 30) * 60000;

  let cronId = null;
  try {
    const cronMeta = {
      mode,
      cutoff_iso: new Date(cutoffPreviewMs).toISOString(),
      tenant_id: tenantId,
      workspace_id: workspaceId,
      trigger_source: String(process.env.TRIGGER_SOURCE ?? '').trim() || undefined,
      deploy_script_name: String(process.env.DEPLOY_SCRIPT_NAME ?? '').trim() || undefined,
      older_than_minutes: olderThanMinutes,
      older_than_hours: olderThanHours,
      dry_run: effectiveDryRun,
    };

    const started = await d1CronRunStart(root, {
      jobName: 'finalize_stale_deploy_events',
      cronExpression: cronExprForMode(mode),
      tenantId,
      workspaceId,
      metadataJson: cronMeta,
    });
    cronId = started?.id ?? null;
  } catch (e) {
    console.warn('[finalize-stale] cron start (non-fatal):', e?.message || e);
  }

  let result;
  try {
    result = await finalizeStaleDeployEvents({
      supabaseUrl,
      serviceKey,
      tenantId,
      workspaceId,
      mode,
      olderThanMinutes,
      olderThanHours,
      dryRun: effectiveDryRun,
      commitShort,
    });
  } catch (e) {
    try {
      if (cronId) {
        await d1CronRunFail(root, {
          cronRunId: cronId,
          errorMessage: String(e?.message || e),
        });
      }
    } catch {
      /* ignore */
    }
    console.warn('[finalize-stale] failed:', e?.message || e);
    process.exit(0);
  }

  console.log(
    JSON.stringify(
      {
        stale_found: result.stale_found,
        cancelled_count: result.cancelled_count,
        skipped_count: result.skipped_count,
        ids_cancelled: result.ids_cancelled,
        cutoff: result.cutoff_iso,
        mode,
      },
      null,
      2,
    ),
  );

  try {
    if (cronId) {
      await d1CronRunComplete(root, {
        cronRunId: cronId,
        rowsRead: result.stale_found ?? 0,
        rowsWritten: result.cancelled_count ?? 0,
        metadataPatch: {
          stale_found: result.stale_found,
          cancelled_count: result.cancelled_count,
          skipped_count: result.skipped_count,
          ids_cancelled: result.ids_cancelled,
          cutoff: result.cutoff_iso,
          mode,
        },
      });
    }
  } catch (e) {
    console.warn('[finalize-stale] cron complete (non-fatal):', e?.message || e);
  }

  process.exit(0);
}

main().catch((e) => {
  console.warn('[finalize-stale]', e?.message || e);
  process.exit(0);
});
