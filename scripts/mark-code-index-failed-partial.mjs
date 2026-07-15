#!/usr/bin/env node
/**
 * Mark a runtime CODE reindex as failed_partial — experimental corpus only; not promoted.
 * Preserves checkpoint evidence under .scratch/ and writes a D1 vectorize_sync_log receipt.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/mark-code-index-failed-partial.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/mark-code-index-failed-partial.mjs --job=cidx_src_reindex_v1
 */
import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_SRC_RUNTIME_JOB_ID,
  patchCodeIndexJob,
} from './lib/code-index-job-d1.mjs';
import {
  buildReceiptDetails,
  createRunId,
  resolveGitCommitSha,
  writeVectorizeSyncReceipt,
} from './lib/rag-ingest-protocol.mjs';
import { checkpointPath } from './lib/code-reindex-checkpoint.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const jobArg = process.argv.find((a) => a.startsWith('--job='));
const JOB_ID = (jobArg?.slice('--job='.length) || process.env.CODE_INDEX_JOB_ID || DEFAULT_SRC_RUNTIME_JOB_ID).trim();
const SCRIPT_KEY = 'reindex_runtime_code';
const VECTORIZE_INDEX = 'agentsam-codebase-oai3large-1536';
const WORKSPACE_KEY = 'ws_inneranimalmedia';
const WORKSPACE_UUID = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac';

const cpPath = checkpointPath(ROOT, SCRIPT_KEY, null);
let checkpoint = null;
if (existsSync(cpPath)) {
  try {
    checkpoint = JSON.parse(readFileSync(cpPath, 'utf8'));
  } catch {
    checkpoint = null;
  }
}

const done = checkpoint?.done && typeof checkpoint.done === 'object' ? checkpoint.done : {};
const failed = checkpoint?.failed && typeof checkpoint.failed === 'object' ? checkpoint.failed : {};
const indexedCount = Object.keys(done).length;
const failedCount = Object.keys(failed).length;
const chunksTotal = Number(checkpoint?.chunksTotal) || 0;
const fileCount = Number(checkpoint?.fileCount) || 911;
const pinnedSha = checkpoint?.gitCommitSha || resolveGitCommitSha(ROOT);
const headSha = resolveGitCommitSha(ROOT);
const runId = createRunId();
const now = new Date().toISOString();

const reason =
  'failed_partial: incomplete runtime reindex abandoned — experimental corpus only; not promoted. ' +
  `checkpoint ${indexedCount}/${fileCount} files, ~${chunksTotal} chunks; mixed commits / unstable Supabase+Vectorize; do not treat as AgentSam authoritative code layer.`;

if (checkpoint) {
  checkpoint.status = 'failed_partial';
  checkpoint.lastError = reason.slice(0, 500);
  checkpoint.failedPartialAt = now;
  checkpoint.failedPartialRunId = runId;
  checkpoint.headShaAtAbandon = headSha;
  const tmp = `${cpPath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  renameSync(tmp, cpPath);
  console.log(`checkpoint → failed_partial (${cpPath})`);
} else {
  console.warn(`no checkpoint at ${cpPath}`);
}

const evidencePath = join(ROOT, '.scratch', 'code-reindex-failed-partial-evidence.json');
const evidence = {
  recorded_at: now,
  status: 'failed_partial',
  promoted: false,
  experimental_corpus_only: true,
  job_id: JOB_ID,
  script_key: SCRIPT_KEY,
  run_id: runId,
  pinned_git_commit_sha: pinnedSha,
  head_git_commit_sha: headSha,
  eligible_count: fileCount,
  indexed_count: indexedCount,
  failed_count: failedCount,
  chunks_total: chunksTotal,
  checkpoint_path: cpPath,
  reason,
  next: [
    'Do not resume this 911-file checkpoint as authoritative.',
    'Prefer hybrid rg/fs + symbol search; treat vectors as retrieval accelerator.',
    'Next index: focused stable corpus from a pinned commit, then atomic promote after verify.',
  ],
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(`evidence → ${evidencePath}`);

if (process.env.SKIP_CODE_INDEX_JOB !== '1') {
  patchCodeIndexJob(JOB_ID, {
    status: 'failed_partial',
    indexed_file_count: indexedCount,
    chunk_count: chunksTotal,
    failed_file_count: failedCount,
    progress_percent: fileCount ? Math.min(99, Math.round((indexedCount / fileCount) * 100)) : 0,
    last_error: reason.slice(0, 500),
    finished_at: now,
    completed_at: now,
    triggered_by: 'mark-code-index-failed-partial',
  });
  console.log(`D1 agentsam_code_index_job: ${JOB_ID} → failed_partial`);
}

const details = buildReceiptDetails({
  run_id: runId,
  script_key: SCRIPT_KEY,
  git_commit_sha: pinnedSha,
  workspace_id: WORKSPACE_KEY,
  workspace_uuid: WORKSPACE_UUID,
  vectorize_index: VECTORIZE_INDEX,
  lane: 'code',
  binding: 'AGENTSAM_VECTORIZE_CODE',
  embed_model: 'text-embedding-3-large',
  embed_dims: 1536,
  repo: 'SamPrimeaux/inneranimalmedia',
  branch: 'main',
  files_indexed: indexedCount,
  files_skipped: 0,
  chunks_embedded: chunksTotal,
  files_missing: Math.max(0, fileCount - indexedCount),
  files_deleted: 0,
  status: 'failed_partial',
  error: reason,
  extra: {
    promoted: false,
    experimental_corpus_only: true,
    eligible_count: fileCount,
    indexed_count: indexedCount,
    head_git_commit_sha: headSha,
    abandon_reason: 'operator_failed_partial',
    evidence_path: '.scratch/code-reindex-failed-partial-evidence.json',
  },
});

writeVectorizeSyncReceipt({
  root: ROOT,
  chunk_id: `run:${SCRIPT_KEY}`,
  vectorize_index: VECTORIZE_INDEX,
  status: 'failed_partial',
  details,
  dryRun: false,
});
writeVectorizeSyncReceipt({
  root: ROOT,
  chunk_id: `run:${SCRIPT_KEY}:failed_partial:${runId}`,
  vectorize_index: VECTORIZE_INDEX,
  status: 'failed_partial',
  details,
  dryRun: false,
});
console.log(`D1 vectorize_sync_log receipt written (failed_partial)`);
console.log(`done — ${reason.slice(0, 160)}…`);
