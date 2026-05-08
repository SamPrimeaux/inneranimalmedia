#!/usr/bin/env node
/**
 * Run a shell command and record start/finish in agentsam_script_runs (remote D1).
 * Usage:
 *   node scripts/run-with-agentsam-script-telemetry.mjs \
 *     --script-id script_connor_r2_prune \
 *     [--workspace-id ws_inneranimalmedia] \
 *     [--trigger-source cicd|manual|github_push|scheduled|agent_sam|cursor] \
 *     [--triggered-by deploy-full] \
 *     -- npm run r2:prune:apply
 *
 * Env: CLOUDFLARE_API_TOKEN (via .env.cloudflare / with-cloudflare-env). TRIGGER_SOURCE, RUN_GROUP_ID optional.
 */
import { spawnSync } from 'child_process';
import { repoRoot } from './lib/supabase-deploy-paths.mjs';
import {
  gitFull,
  hasCloudflareToken,
  runD1Exec,
  runD1Query,
  sqlString,
} from './lib/d1-deploy-record.mjs';

const VALID_TRIGGERS = new Set(['agent_sam', 'cursor', 'manual', 'github_push', 'scheduled', 'cicd']);

function parseArgs(argv) {
  const dash = argv.indexOf('--');
  const flagPart = dash >= 0 ? argv.slice(0, dash) : argv;
  const cmdPart = dash >= 0 ? argv.slice(dash + 1) : [];

  const out = {
    scriptId: '',
    workspaceId: 'ws_inneranimalmedia',
    triggerSource: '',
    triggeredBy: 'cli',
    environment: 'production',
    command: cmdPart.join(' ').trim(),
  };

  for (let i = 0; i < flagPart.length; i++) {
    const a = flagPart[i];
    if (a.startsWith('--script-id=')) out.scriptId = a.slice('--script-id='.length).trim();
    else if (a === '--script-id' && flagPart[i + 1]) out.scriptId = String(flagPart[++i]).trim();
    else if (a.startsWith('--workspace-id=')) out.workspaceId = a.slice('--workspace-id='.length).trim();
    else if (a === '--workspace-id' && flagPart[i + 1]) out.workspaceId = String(flagPart[++i]).trim();
    else if (a.startsWith('--trigger-source=')) out.triggerSource = a.slice('--trigger-source='.length).trim();
    else if (a === '--trigger-source' && flagPart[i + 1]) out.triggerSource = String(flagPart[++i]).trim();
    else if (a.startsWith('--triggered-by=')) out.triggeredBy = a.slice('--triggered-by='.length).trim();
    else if (a === '--triggered-by' && flagPart[i + 1]) out.triggeredBy = String(flagPart[++i]).trim();
    else if (a.startsWith('--environment=')) out.environment = a.slice('--environment='.length).trim();
    else if (a === '--environment' && flagPart[i + 1]) out.environment = String(flagPart[++i]).trim();
  }

  const ts = String(process.env.TRIGGER_SOURCE ?? out.triggerSource ?? 'manual').trim() || 'manual';
  out.triggerSource = VALID_TRIGGERS.has(ts) ? ts : 'manual';

  return out;
}

async function main() {
  const root = repoRoot();
  const cfg = parseArgs(process.argv.slice(2));

  if (!cfg.scriptId) {
    console.error('[agentsam-script-telemetry] missing --script-id');
    process.exit(2);
  }
  if (!cfg.command) {
    console.error('[agentsam-script-telemetry] missing command after --');
    process.exit(2);
  }

  const cicdRunId = String(process.env.RUN_GROUP_ID ?? '').trim() || null;
  const gitSha = gitFull(root);
  const gitBranch = String(process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || 'main').trim() || 'main';

  if (!hasCloudflareToken()) {
    console.warn('[agentsam-script-telemetry] CLOUDFLARE_API_TOKEN unset — running command without D1 telemetry');
    const r = spawnSync('sh', ['-c', cfg.command], { cwd: root, stdio: 'inherit', env: process.env });
    process.exit(r.status ?? 1);
  }

  const insertSql = `INSERT INTO agentsam_script_runs (
    script_id, workspace_id, triggered_by, trigger_source,
    cicd_run_id, git_commit_sha, git_branch, environment,
    status, started_at
  ) VALUES (
    ${sqlString(cfg.scriptId)},
    ${sqlString(cfg.workspaceId)},
    ${sqlString(cfg.triggeredBy)},
    ${sqlString(cfg.triggerSource)},
    ${cicdRunId ? sqlString(cicdRunId) : 'NULL'},
    ${sqlString(gitSha)},
    ${sqlString(gitBranch)},
    ${sqlString(cfg.environment)},
    'running',
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  ) RETURNING id`;

  let runId = null;
  try {
    const rows = runD1Query(root, insertSql);
    runId = rows[0]?.id != null ? String(rows[0].id) : null;
  } catch (e) {
    console.warn('[agentsam-script-telemetry] INSERT failed', e?.message ?? e);
  }

  const started = Date.now();
  const result = spawnSync('sh', ['-c', cfg.command], { cwd: root, stdio: 'inherit', env: process.env });
  const durationMs = Date.now() - started;
  const exitCode = result.status === null ? 1 : result.status;
  const finStatus = exitCode === 0 ? 'passed' : 'failed';

  if (runId) {
    const updateSql = `UPDATE agentsam_script_runs SET
      status = ${sqlString(finStatus)},
      exit_code = ${Number(exitCode)},
      duration_ms = ${Number(durationMs)},
      output_summary = NULL,
      error_message = ${exitCode === 0 ? 'NULL' : sqlString(`exit code ${exitCode}`)},
      completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ${sqlString(runId)}`;
    try {
      await runD1Exec(root, updateSql);
    } catch (e) {
      console.warn('[agentsam-script-telemetry] UPDATE failed', e?.message ?? e);
    }
  }

  process.exit(exitCode);
}

main().catch((e) => {
  console.error('[agentsam-script-telemetry]', e);
  process.exit(1);
});
