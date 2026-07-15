/**
 * Update D1 agentsam_code_index_job while local reindex scripts run.
 * Uses wrangler remote execute (same plane as dashboard Settings → Jobs).
 *
 * Env:
 *   CODE_INDEX_JOB_ID   — override job id (default: cidx_src_reindex_v1 for src/runtime,
 *                         cidx_ws_inneranimalmedia for dashboard agent reindex)
 *   SKIP_CODE_INDEX_JOB=1 — disable writes
 */
import { d1Query, sqlQuote } from './d1-remote.mjs';

export const DEFAULT_SRC_RUNTIME_JOB_ID = 'cidx_src_reindex_v1';
export const DEFAULT_DASHBOARD_JOB_ID = 'cidx_ws_inneranimalmedia';

/**
 * @param {{ srcBatch1?: boolean, runtime?: boolean }} flags
 */
export function resolveCodeIndexJobId(flags = {}) {
  const fromEnv = (process.env.CODE_INDEX_JOB_ID || '').trim();
  if (fromEnv) return fromEnv;
  if (flags.srcBatch1 || flags.runtime) return DEFAULT_SRC_RUNTIME_JOB_ID;
  return DEFAULT_DASHBOARD_JOB_ID;
}

/**
 * @param {string} jobId
 * @param {Record<string, string | number | null | undefined>} patch
 */
export function patchCodeIndexJob(jobId, patch) {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (!entries.length) return;
  const setSql = entries
    .map(([k, v]) => `${k} = ${sqlQuote(v)}`)
    .concat([`updated_at = datetime('now')`])
    .join(', ');
  d1Query(
    `UPDATE agentsam_code_index_job SET ${setSql} WHERE id = ${sqlQuote(jobId)}`,
  );
}

/**
 * @param {{
 *   jobId: string,
 *   triggeredBy: string,
 *   fileCount: number,
 *   sourcePath?: string | null,
 *   repoFullName?: string,
 *   vectorBackend?: string,
 *   progressEvery?: number,
 *   resume?: boolean,
 *   initialIndexed?: number,
 *   initialChunks?: number,
 *   initialFailed?: number,
 * }} opts
 */
export function createCodeIndexJobTracker(opts) {
  const jobId = opts.jobId;
  const fileCount = Math.max(0, Number(opts.fileCount) || 0);
  const progressEvery = Math.max(1, Number(opts.progressEvery) || (fileCount > 50 ? 10 : 1));
  let indexed = Math.max(0, Number(opts.initialIndexed) || 0);
  let chunks = Math.max(0, Number(opts.initialChunks) || 0);
  let failed = Math.max(0, Number(opts.initialFailed) || 0);
  let lastProgressAt = indexed;

  function progressPercent() {
    if (!fileCount) return 100;
    return Math.min(100, Math.round((indexed / fileCount) * 100));
  }

  function markRunning() {
    const resume = Boolean(opts.resume) && indexed > 0;
    patchCodeIndexJob(jobId, {
      status: 'running',
      triggered_by: resume ? `${opts.triggeredBy}:resume` : opts.triggeredBy,
      file_count: fileCount,
      indexed_file_count: indexed,
      chunk_count: chunks,
      failed_file_count: failed,
      progress_percent: progressPercent(),
      last_error: null,
      ...(resume ? {} : { started_at: new Date().toISOString() }),
      completed_at: null,
      finished_at: null,
      last_sync_at: null,
      repo_full_name: opts.repoFullName || 'SamPrimeaux/inneranimalmedia',
      vector_backend: opts.vectorBackend || 'supabase_pgvector',
      source_type: 'github',
      ...(opts.sourcePath != null ? { source_path: opts.sourcePath } : {}),
    });
    console.log(
      `D1 agentsam_code_index_job: ${jobId} → running${resume ? ' (resume)' : ''} (indexed=${indexed}/${fileCount}, chunks=${chunks})`,
    );
  }

  function flushProgress(force = false) {
    if (!force && indexed - lastProgressAt < progressEvery && indexed < fileCount) return;
    lastProgressAt = indexed;
    patchCodeIndexJob(jobId, {
      status: 'running',
      indexed_file_count: indexed,
      chunk_count: chunks,
      failed_file_count: failed,
      progress_percent: progressPercent(),
    });
  }

  /**
   * @param {{ chunksAdded?: number, failed?: boolean }} [step]
   */
  function tick(step = {}) {
    indexed += 1;
    if (step.failed) failed += 1;
    chunks += Math.max(0, Number(step.chunksAdded) || 0);
    flushProgress(false);
  }

  function complete() {
    const now = new Date().toISOString();
    patchCodeIndexJob(jobId, {
      status: 'completed',
      indexed_file_count: indexed,
      chunk_count: chunks,
      failed_file_count: failed,
      progress_percent: 100,
      last_error: null,
      completed_at: now,
      finished_at: now,
      last_sync_at: now,
    });
    console.log(
      `D1 agentsam_code_index_job: ${jobId} → completed (files=${indexed}, chunks=${chunks}, failed=${failed})`,
    );
  }

  /** Leave job idle so another process can resume without looking “failed”. */
  function interrupt(reason = 'interrupted') {
    const msg = String(reason).slice(0, 500);
    try {
      patchCodeIndexJob(jobId, {
        status: 'idle',
        triggered_by: 'resume',
        indexed_file_count: indexed,
        chunk_count: chunks,
        failed_file_count: failed,
        progress_percent: progressPercent(),
        last_error: msg,
      });
      console.warn(`D1 agentsam_code_index_job: ${jobId} → idle (${msg})`);
    } catch (e) {
      console.error('D1 job interrupt patch error:', e?.message || e);
    }
  }

  /**
   * @param {unknown} err
   */
  function fail(err) {
    const msg = String(err?.message || err).slice(0, 500);
    const now = new Date().toISOString();
    try {
      patchCodeIndexJob(jobId, {
        status: 'failed',
        indexed_file_count: indexed,
        chunk_count: chunks,
        failed_file_count: failed,
        progress_percent: progressPercent(),
        last_error: msg,
        finished_at: now,
        completed_at: now,
      });
      console.error(`D1 agentsam_code_index_job: ${jobId} → failed: ${msg}`);
    } catch (e) {
      console.error('D1 job fail patch error:', e?.message || e);
    }
  }

  /**
   * Incomplete / untrusted corpus — do not promote. Distinct from hard `failed`.
   * @param {unknown} err
   */
  function failPartial(err) {
    const msg = String(err?.message || err).slice(0, 500);
    const now = new Date().toISOString();
    try {
      patchCodeIndexJob(jobId, {
        status: 'failed_partial',
        indexed_file_count: indexed,
        chunk_count: chunks,
        failed_file_count: failed,
        progress_percent: Math.min(99, progressPercent()),
        last_error: msg,
        finished_at: now,
        completed_at: now,
      });
      console.error(`D1 agentsam_code_index_job: ${jobId} → failed_partial: ${msg}`);
    } catch (e) {
      console.error('D1 job fail_partial patch error:', e?.message || e);
    }
  }

  return { jobId, markRunning, tick, complete, fail, failPartial, interrupt, flushProgress };
}
