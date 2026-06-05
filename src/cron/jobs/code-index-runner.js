/**
 * 1 AM maintenance — run pending agentsam_code_index_job rows.
 */
import { runPendingCodeIndexJob } from '../../core/code-indexer.js';

/**
 * @param {any} env
 */
export async function runCodeIndexCronStep(env) {
  const out = await runPendingCodeIndexJob(env, { cpuBudgetMs: 20_000 });
  if (out.skipped) {
    return { ok: true, skipped: true, reason: out.reason, rowsWritten: 0, rowsRead: 0 };
  }
  return {
    ok: out.ok !== false,
    job_id: out.job_id,
    complete: out.complete,
    chunks_written: out.chunks_written ?? 0,
    rowsWritten: Number(out.chunks_written) || 0,
    rowsRead: Number(out.files_processed_this_run) || 0,
    metadata: out,
  };
}
