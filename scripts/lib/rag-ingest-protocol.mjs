/**
 * RAG ingest protocol — shared guards for reindex/ingest scripts.
 * Law: Git/R2/D1 = canonical source; Supabase + Vectorize = rebuildable mirrors.
 */
import { randomUUID, createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { join } from 'path';

/** @typedef {object} LaneContract */
/** @typedef {object} IngestReceiptDetails */

export const LANE_CONTRACTS = Object.freeze({
  code: Object.freeze({
    lane: 'code',
    binding: 'AGENTSAM_VECTORIZE_CODE',
    vectorize_index: 'agentsam-codebase-oai3large-1536',
    embed_model: 'text-embedding-3-large',
    embed_dims: 1536,
    supabase_chunks_table: 'agentsam.agentsam_codebase_chunks_oai3large_1536',
    supabase_files_table: 'agentsam.agentsam_codebase_files_oai3large_1536',
  }),
  documents: Object.freeze({
    lane: 'documents',
    binding: 'AGENTSAM_VECTORIZE_DOCUMENTS',
    vectorize_index: 'agentsam-documents-oai3large-1536',
    embed_model: 'text-embedding-3-large',
    embed_dims: 1536,
    supabase_table: 'agentsam.agentsam_documents_oai3large_1536',
  }),
  memory: Object.freeze({
    lane: 'memory',
    binding: 'AGENTSAM_VECTORIZE_MEMORY',
    vectorize_index: 'agentsam-memory-oai3large-1536',
    embed_model: 'text-embedding-3-large',
    embed_dims: 1536,
    supabase_table: 'agentsam.agentsam_memory_oai3large_1536',
  }),
  schema: Object.freeze({
    lane: 'schema',
    binding: 'AGENTSAM_VECTORIZE_SCHEMA',
    vectorize_index: 'agentsam-schema-oai3large-1536',
    embed_model: 'text-embedding-3-large',
    embed_dims: 1536,
    supabase_table: 'agentsam.agentsam_database_schema_oai3large_1536',
  }),
  // NOTE: deep_archive (agentsam_deep_archive_oai3large_3072) is intentionally
  // excluded from LANE_CONTRACTS. Cloudflare Vectorize does not offer a 3072-dim
  // index tier, so this lane is Supabase pgvector-only by design — there is no
  // Vectorize mirror for assertLaneContract()/writeVectorizeSyncReceipt() to guard.
  // If/when a Vectorize tier supports 3072d, add a contract here and start logging
  // receipts the same way the other four lanes do.
});

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function createRunId() {
  return randomUUID();
}

/**
 * @param {string} [cwd]
 * @returns {string}
 */
export function resolveGitCommitSha(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * @param {number} status
 */
export function isRetryableHttpStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Transient network / undici failures (no HTTP status) that should back off.
 * @param {unknown} err
 */
export function isRetryableNetworkError(err) {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  const causeCode = String(err?.cause?.code || '');
  if (err?.retryable === true) return true;
  if (/fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EADDRNOTAVAIL|socket hang up|UND_ERR_/i.test(msg)) {
    return true;
  }
  return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'EADDRNOTAVAIL'].includes(code || causeCode);
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ maxAttempts?: number, baseDelayMs?: number, maxDelayMs?: number, label?: string }} [opts]
 * @returns {Promise<T>}
 */
export async function withRetryBackoff(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const maxDelayMs = opts.maxDelayMs ?? 30_000;
  const label = opts.label ?? 'operation';
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable =
        err?.retryable === true ||
        (typeof err?.status === 'number' && isRetryableHttpStatus(err.status)) ||
        (err?.status == null && isRetryableNetworkError(err));
      if (!retryable || attempt >= maxAttempts) throw err;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * 250);
      console.warn(`  [retry] ${label} attempt ${attempt}/${maxAttempts} — ${err.message}; wait ${delay + jitter}ms`);
      await sleep(delay + jitter);
    }
  }
  throw lastErr;
}

/**
 * @param {LaneContract} contract
 */
export function assertLaneContract(contract) {
  const required = ['lane', 'binding', 'vectorize_index', 'embed_model', 'embed_dims'];
  for (const key of required) {
    if (contract[key] == null || contract[key] === '') {
      throw new Error(`Lane contract missing ${key}`);
    }
  }
  if (!Number.isInteger(contract.embed_dims) || contract.embed_dims <= 0) {
    throw new Error(`Lane contract invalid embed_dims: ${contract.embed_dims}`);
  }
}

/**
 * @param {object} p
 * @returns {IngestReceiptDetails}
 */
export function buildReceiptDetails(p) {
  return {
    run_id: p.run_id,
    script_key: p.script_key,
    git_commit_sha: p.git_commit_sha,
    workspace_id: p.workspace_id,
    workspace_uuid: p.workspace_uuid ?? null,
    vectorize_index: p.vectorize_index,
    lane: p.lane ?? null,
    binding: p.binding ?? null,
    embed_model: p.embed_model ?? null,
    embed_dims: p.embed_dims ?? null,
    repo: p.repo ?? null,
    branch: p.branch ?? 'main',
    files_indexed: p.files_indexed ?? 0,
    files_skipped: p.files_skipped ?? 0,
    chunks_embedded: p.chunks_embedded ?? 0,
    files_missing: p.files_missing ?? 0,
    files_deleted: p.files_deleted ?? 0,
    errors: p.errors ?? 0,
    status: p.status ?? 'ok',
    error: p.error ? String(p.error).slice(0, 500) : null,
    finished_at: new Date().toISOString(),
    ...(p.extra && typeof p.extra === 'object' ? p.extra : {}),
  };
}

function sqlEscapeJson(obj) {
  return JSON.stringify(obj).replace(/'/g, "''");
}

/**
 * @param {object} opts
 * @param {string} opts.root
 * @param {string} opts.chunk_id
 * @param {string} opts.vectorize_index
 * @param {string} [opts.status]
 * @param {IngestReceiptDetails} opts.details
 * @param {boolean} [opts.dryRun]
 */
export function writeVectorizeSyncReceipt(opts) {
  const { root, chunk_id, vectorize_index, status = 'ok', details, dryRun = false } = opts;
  const detailsJson = sqlEscapeJson(details);
  const chunkEsc = String(chunk_id).replace(/'/g, "''");
  const indexEsc = String(vectorize_index).replace(/'/g, "''");
  const statusEsc = String(status).replace(/'/g, "''");

  const sql = `INSERT INTO vectorize_sync_log (chunk_id, vectorize_index, status, synced_at, details_json)
    VALUES ('${chunkEsc}', '${indexEsc}', '${statusEsc}', unixepoch(), '${detailsJson}')
    ON CONFLICT (chunk_id) DO UPDATE SET
      vectorize_index = '${indexEsc}',
      status = '${statusEsc}',
      synced_at = unixepoch(),
      details_json = '${detailsJson}'`;

  if (dryRun) {
    console.log(`  [dry-run] D1 receipt ${chunk_id}: ${JSON.stringify(details).slice(0, 200)}…`);
    return;
  }

  const wrapper = join(root, 'scripts', 'with-cloudflare-env.sh');
  execFileSync(
    wrapper,
    [
      'npx',
      'wrangler',
      'd1',
      'execute',
      'inneranimalmedia-business',
      '--remote',
      '-c',
      'wrangler.production.toml',
      '--json',
      '--command',
      sql,
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
}

/**
 * @param {{ apiKey: string, text: string, model: string, dims: number }} p
 */
export async function openaiEmbedSingle(p) {
  const truncated = p.text.length > 32_000 ? p.text.slice(0, 32_000) : p.text;
  return withRetryBackoff(
    async () => {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${p.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: p.model,
          input: truncated,
          dimensions: p.dims,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(`OpenAI embed HTTP ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
        err.status = res.status;
        err.retryable = isRetryableHttpStatus(res.status);
        throw err;
      }
      const vec = json?.data?.[0]?.embedding;
      if (!Array.isArray(vec) || vec.length !== p.dims) {
        throw new Error(`Unexpected embed shape: length=${vec?.length} expected=${p.dims}`);
      }
      return vec;
    },
    { label: 'openai-embed' },
  );
}

/**
 * @param {{ apiKey: string, texts: string[], model: string, dims: number }} p
 */
export async function openaiEmbedBatch(p) {
  const inputs = p.texts.map((t) => (t.length > 32_000 ? t.slice(0, 32_000) : t));
  return withRetryBackoff(
    async () => {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${p.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: p.model,
          input: inputs,
          dimensions: p.dims,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(`OpenAI embed batch HTTP ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
        err.status = res.status;
        err.retryable = isRetryableHttpStatus(res.status);
        throw err;
      }
      const data = [...(json.data || [])].sort((a, b) => a.index - b.index);
      return data.map((d) => {
        if (!Array.isArray(d.embedding) || d.embedding.length !== p.dims) {
          throw new Error(`Unexpected batch embed shape at index ${d.index}`);
        }
        return d.embedding;
      });
    },
    { label: 'openai-embed-batch' },
  );
}

/**
 * @param {{ accountId: string, token: string, index: string, vectors: object[], dryRun?: boolean }} p
 */
export async function vectorizeUpsertNdjson(p) {
  if (!p.vectors.length) return;
  if (p.dryRun) return;

  const url = `https://api.cloudflare.com/client/v4/accounts/${p.accountId}/vectorize/v2/indexes/${p.index}/upsert`;
  const ndjson = p.vectors
    .map((v) => JSON.stringify({ id: v.id, values: v.values, metadata: v.metadata }))
    .join('\n');

  await withRetryBackoff(
    async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${p.token}`,
          'Content-Type': 'application/x-ndjson',
        },
        body: ndjson,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        const err = new Error(`Vectorize upsert HTTP ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
        err.status = res.status;
        err.retryable = isRetryableHttpStatus(res.status);
        throw err;
      }
    },
    { label: 'vectorize-upsert' },
  );
}

/**
 * @param {{ accountId: string, token: string, index: string, ids: string[], dryRun?: boolean }} p
 */
export async function vectorizeDeleteByIds(p) {
  if (!p.ids.length) return 0;
  if (p.dryRun) {
    console.log(`  [dry-run] would delete ${p.ids.length} vector(s) from ${p.index}`);
    return p.ids.length;
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${p.accountId}/vectorize/v2/indexes/${p.index}/delete-by-ids`;
  let deleted = 0;

  for (let i = 0; i < p.ids.length; i += 100) {
    const batch = p.ids.slice(i, i + 100);
    await withRetryBackoff(
      async () => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${p.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ids: batch }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
          const err = new Error(`Vectorize delete HTTP ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
          err.status = res.status;
          err.retryable = isRetryableHttpStatus(res.status);
          throw err;
        }
      },
      { label: 'vectorize-delete' },
    );
    deleted += batch.length;
  }
  return deleted;
}

/**
 * Prune codebase mirror rows + Vectorize ids for paths not in approved set.
 * Only run after a successful full reindex (all source files present).
 *
 * @param {object} p
 * @param {import('pg').Client} p.client
 * @param {string} p.workspaceUuid
 * @param {ReadonlySet<string>} p.approvedPaths
 * @param {string} p.accountId
 * @param {string} p.token
 * @param {string} p.vectorizeIndex
 * @param {boolean} [p.dryRun]
 * @returns {Promise<{ deletedFiles: string[], deletedChunks: number, deletedVectors: number }>}
 */
export async function pruneCodebaseMirrorMissingPaths(p) {
  const res = await p.client.query(
    `SELECT file_path FROM agentsam.agentsam_codebase_files_oai3large_1536
     WHERE workspace_id = $1::uuid`,
    [p.workspaceUuid],
  );
  const stalePaths = res.rows.map((r) => r.file_path).filter((fp) => !p.approvedPaths.has(fp));
  if (!stalePaths.length) {
    return { deletedFiles: [], deletedChunks: 0, deletedVectors: 0 };
  }

  let deletedChunks = 0;
  let deletedVectors = 0;
  const deletedFiles = [];

  for (const filePath of stalePaths) {
    const chunkRes = await p.client.query(
      `SELECT id::text AS id FROM agentsam.agentsam_codebase_chunks_oai3large_1536
       WHERE workspace_id = $1::uuid AND file_path = $2`,
      [p.workspaceUuid, filePath],
    );
    const ids = chunkRes.rows.map((r) => r.id);

    if (p.dryRun) {
      console.log(`  [dry-run] prune ${filePath} (${ids.length} chunks)`);
      deletedFiles.push(filePath);
      deletedChunks += ids.length;
      deletedVectors += ids.length;
      continue;
    }

    if (ids.length) {
      deletedVectors += await vectorizeDeleteByIds({
        accountId: p.accountId,
        token: p.token,
        index: p.vectorizeIndex,
        ids,
      });
      await p.client.query(
        `DELETE FROM agentsam.agentsam_codebase_chunks_oai3large_1536
         WHERE workspace_id = $1::uuid AND file_path = $2`,
        [p.workspaceUuid, filePath],
      );
      deletedChunks += ids.length;
    }

    await p.client.query(
      `DELETE FROM agentsam.agentsam_codebase_files_oai3large_1536
       WHERE workspace_id = $1::uuid AND file_path = $2`,
      [p.workspaceUuid, filePath],
    );
    deletedFiles.push(filePath);
    console.log(`  pruned: ${filePath} (${ids.length} chunks)`);
  }

  return { deletedFiles, deletedChunks, deletedVectors };
}

export function contentHash(str) {
  return createHash('sha256').update(String(str ?? ''), 'utf8').digest('hex');
}
