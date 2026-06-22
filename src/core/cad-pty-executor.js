/**
 * Dispatch Design Studio CAD jobs to ExecOS GCP (iam-tunnel VM).
 * OpenSCAD + Blender run on terminal.inneranimalmedia.com — not in Worker isolate.
 */
import { resolveMoviemodeRepoRootForSession, resolvePtyTenantIdForUser } from './pty-workspace-paths.js';
import { finalizeCadJobComplete } from './cad-job-complete.js';
import { runExecOsCommand, probeExecOsCadHealth, resolveCadExecCwd } from './execos-fabric.js';

const CAD_EXEC_TIMEOUT_MS = 600_000;
const RUNNER_HOST = 'execos-gcp';

/**
 * @param {any} env
 * @param {string} jobId
 */
async function loadCadJob(env, jobId) {
  if (!env?.DB) return null;
  return env.DB.prepare(`SELECT * FROM agentsam_cad_jobs WHERE id = ? LIMIT 1`).bind(jobId).first();
}

/**
 * @param {any} env
 * @param {string} jobId
 * @param {Record<string, unknown>} patch
 */
async function patchCadJob(env, jobId, patch) {
  if (!env?.DB) return;
  await env.DB.prepare(
    `UPDATE agentsam_cad_jobs SET
       status = COALESCE(?, status),
       runner_host = COALESCE(?, runner_host),
       progress_pct = COALESCE(?, progress_pct),
       started_at = COALESCE(?, started_at),
       error = ?,
       error_code = ?,
       updated_at = unixepoch()
     WHERE id = ?`,
  )
    .bind(
      patch.status ?? null,
      patch.runner_host ?? null,
      patch.progress_pct != null ? Number(patch.progress_pct) : null,
      patch.started_at ?? null,
      patch.error ?? null,
      patch.error_code ?? null,
      jobId,
    )
    .run();
}

/**
 * Resolve inneranimalmedia repo on ExecOS GCP for CAD toolchain scripts.
 * @param {any} env
 * @param {{ userId: string, tenantId?: string|null, workspaceId: string }} ctx
 */
export async function resolveCadRepoOnPty(env, ctx) {
  const uid = String(ctx.userId || '').trim();
  const wid = String(ctx.workspaceId || '').trim();
  if (!uid || !wid) return null;

  let tid = String(ctx.tenantId || '').trim();
  if (!tid) {
    tid = String((await resolvePtyTenantIdForUser(env, null, uid)) || '').trim();
  }
  if (!tid) return null;

  const fromSession = await resolveMoviemodeRepoRootForSession(env, {
    tenantId: tid,
    userId: uid,
    workspaceId: wid,
  });
  const repoRoot = fromSession?.repoRoot || resolveCadExecCwd(env);
  return { repoRoot, workspaceRoot: fromSession?.workspaceRoot, source: fromSession?.source || 'execos_default' };
}

/**
 * Execute one CAD job on ExecOS GCP (OpenSCAD / Blender pipeline).
 * @param {any} env
 * @param {any} ctx
 * @param {string} jobId
 * @param {{ userId: string, tenantId?: string|null, workspaceId: string }} auth
 */
export async function dispatchCadJobToPty(env, ctx, jobId, auth) {
  const id = String(jobId || '').trim();
  if (!id) return { ok: false, error: 'job_id_required' };

  const job = await loadCadJob(env, id);
  if (!job) return { ok: false, error: 'job_not_found' };

  const engine = String(job.engine || '').toLowerCase();
  if (!['openscad', 'blender'].includes(engine)) {
    return { ok: false, error: 'exec_engine_not_supported', engine };
  }

  const resolved = await resolveCadRepoOnPty(env, auth);
  const repoRoot = resolved?.repoRoot || resolveCadExecCwd(env);
  if (!repoRoot) {
    await finalizeCadJobComplete(env, ctx, {
      job_id: id,
      status: 'failed',
      error: 'ExecOS workspace not resolved — clone inneranimalmedia on iam-tunnel GCP VM.',
      error_code: 'execos_workspace_unresolved',
      runner_host: RUNNER_HOST,
    });
    return { ok: false, error: 'execos_workspace_unresolved' };
  }

  const startedAt = Math.floor(Date.now() / 1000);
  await patchCadJob(env, id, {
    status: 'running',
    runner_host: RUNNER_HOST,
    progress_pct: 5,
    started_at: startedAt,
    error: null,
    error_code: null,
  });

  const cmd = [
    'set -euo pipefail',
    './scripts/with-cloudflare-env.sh node scripts/designstudio/cad-job-runner.mjs --once',
    `--job-id=${JSON.stringify(id)}`,
  ].join(' ');

  const res = await runExecOsCommand(env, {
    command: cmd,
    cwd: repoRoot,
    target: 'gcp',
    timeout_ms: CAD_EXEC_TIMEOUT_MS,
  });

  const fresh = await loadCadJob(env, id);
  if (fresh && String(fresh.status) === 'done') {
    return {
      ok: true,
      job_id: id,
      status: 'done',
      dispatch: 'execos',
      resolution: res.resolution,
      runner_host: RUNNER_HOST,
    };
  }

  if (!res.ok || (res.exit_code != null && res.exit_code !== 0)) {
    if (fresh && String(fresh.status) !== 'done') {
      const errText = String(res.stderr || res.stdout || res.error || 'execos_exec_failed').slice(0, 2000);
      await finalizeCadJobComplete(env, ctx, {
        job_id: id,
        status: 'failed',
        error: errText,
        error_code: 'execos_exec_failed',
        runner_host: RUNNER_HOST,
      });
    }
    return {
      ok: false,
      job_id: id,
      error: res.stderr || res.error || 'execos_exec_failed',
      exit_code: res.exit_code,
      resolution: res.resolution,
    };
  }

  return {
    ok: true,
    job_id: id,
    status: fresh?.status || 'running',
    dispatch: 'execos',
    resolution: res.resolution,
    runner_host: RUNNER_HOST,
  };
}

/** @deprecated alias */
export const dispatchCadJobToExecOs = dispatchCadJobToPty;

/**
 * Probe ExecOS GCP + CAD toolchain health.
 * @param {any} env
 */
export async function probeCadComputeHealth(env) {
  return probeExecOsCadHealth(env);
}
