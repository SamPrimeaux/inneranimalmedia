/**
 * Code indexer — D1 agentsam_code_index_job → GitHub → chunk → embed → Supabase + Vectorize.
 * Lane: code_semantic_search / AGENTSAM_VECTORIZE_CODE / agentsam_codebase_chunks_oai3large_1536
 */
import { createAgentsamEmbedding } from './agentsam-vectorize.js';
import { resolveAgentsamEmbeddingSpecForDimensions } from './agentsam-vectorize-index.js';
import { resolveTextEmbeddingRoute } from './embedding-routes.js';
import { runHyperdriveQuery, isHyperdriveUsable } from './hyperdrive-query.js';
import { resolveSupabaseWorkspaceId } from './rag-lanes.js';
import {
  getAdminGithubToken,
  getUserGithubToken,
  resolveGitHubAppInstallationToken,
} from '../integrations/github.js';
import { getSuperadminAuthIds } from './auth.js';

const CODE_BINDING = 'AGENTSAM_VECTORIZE_CODE';
const CHUNKS_TABLE = 'agentsam_codebase_chunks_oai3large_1536';
const EMBED_SPEC = resolveAgentsamEmbeddingSpecForDimensions(1536);
const CHUNK_TARGET_CHARS = 1600; // ~400 tokens
const CHUNK_OVERLAP_CHARS = 200; // ~50 tokens
const EMBED_BATCH = 20;
const MAX_FILES_PER_RUN = 25;
const MAX_FILE_BYTES = 250 * 1024;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.wrangler', '.git', 'build', 'coverage', '.next']);
const ALLOWED_EXT = new Set(['.js', '.ts', '.tsx', '.jsx', '.md']);

/** @param {string} path */
function isIndexablePath(path) {
  const p = String(path || '').replace(/\\/g, '/');
  if (!p || p.includes('..')) return false;
  const parts = p.split('/');
  for (const seg of parts) {
    if (SKIP_DIRS.has(seg)) return false;
  }
  const dot = p.lastIndexOf('.');
  if (dot < 0) return false;
  return ALLOWED_EXT.has(p.slice(dot).toLowerCase());
}

/** @param {string} text */
function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text ?? '').length / 4));
}

/**
 * Split content into overlapping chunks on line boundaries.
 * @param {string} content
 * @returns {string[]}
 */
export function chunkFileContent(content) {
  const text = String(content ?? '');
  if (!text.trim()) return [];
  if (text.length <= CHUNK_TARGET_CHARS) return [text];

  const lines = text.split('\n');
  const chunks = [];
  let buf = '';
  let bufLen = 0;

  const flush = () => {
    const slice = buf.trim();
    if (slice) chunks.push(slice);
    if (CHUNK_OVERLAP_CHARS > 0 && slice.length > CHUNK_OVERLAP_CHARS) {
      buf = slice.slice(-CHUNK_OVERLAP_CHARS);
      bufLen = buf.length;
    } else {
      buf = '';
      bufLen = 0;
    }
  };

  for (const line of lines) {
    const add = (buf ? '\n' : '') + line;
    if (bufLen + add.length > CHUNK_TARGET_CHARS && buf) {
      flush();
    }
    buf += (buf ? '\n' : '') + line;
    bufLen = buf.length;
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

/** @param {string} workspaceId @param {string} filePath @param {number} chunkIndex */
export async function buildCodeVectorizeId(workspaceId, filePath, chunkIndex) {
  const ws = String(workspaceId || '').trim().replace(/^ws_/, 'ws');
  const pathHash = await contentHash16(filePath);
  const idx = String(Number(chunkIndex) || 0).padStart(4, '0');
  return `code::${ws}::${pathHash}::${idx}`;
}

/** @param {string} text */
async function contentHash16(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

function vectorLiteral(embedding) {
  return `[${embedding.join(',')}]`;
}

/** @param {any} env */
async function loadJobColumns(env) {
  const cols = await env.DB.prepare(`PRAGMA table_info(agentsam_code_index_job)`)
    .all()
    .catch(() => ({ results: [] }));
  return new Set((cols.results || []).map((r) => String(r.name).toLowerCase()));
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} job
 */
async function resolveGithubTokenForJob(env, job) {
  const repo =
    (job.repo_full_name != null ? String(job.repo_full_name).trim() : '') ||
    (job.source_path != null ? String(job.source_path).trim() : '') ||
    'SamPrimeaux/inneranimalmedia';
  const owner = repo.includes('/') ? repo.split('/')[0] : 'SamPrimeaux';

  try {
    const app = await resolveGitHubAppInstallationToken(env, owner);
    if (app?.token) return { token: app.token, repo, mode: 'app' };
  } catch {
    /* fallback */
  }

  const userId = job.user_id != null ? String(job.user_id).trim() : '';
  if (userId) {
    const row = await getUserGithubToken(env, userId);
    if (row?.token) return { token: row.token, repo, mode: 'oauth' };
  }

  const { authIds } = await getSuperadminAuthIds(env);
  for (const uid of authIds) {
    const row = await getUserGithubToken(env, uid);
    if (row?.token) return { token: row.token, repo, mode: 'oauth' };
  }

  const pat = getAdminGithubToken(env);
  if (pat?.token) return { token: pat.token, repo, mode: pat.mode || 'pat' };

  throw new Error('github_token_unavailable');
}

/**
 * @param {string} token
 * @param {string} repo
 * @param {string} [branch]
 */
async function listRepoFiles(token, repo, branch = 'main') {
  const refRes = await fetch(
    `https://api.github.com/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'IAM-CodeIndexer',
      },
    },
  );
  if (!refRes.ok) {
    throw new Error(`github_ref_failed:${refRes.status}`);
  }
  const refJson = await refRes.json();
  const sha = refJson?.object?.sha;
  if (!sha) throw new Error('github_ref_sha_missing');

  const treeRes = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${sha}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'IAM-CodeIndexer',
      },
    },
  );
  if (!treeRes.ok) {
    throw new Error(`github_tree_failed:${treeRes.status}`);
  }
  const treeJson = await treeRes.json();
  const tree = Array.isArray(treeJson?.tree) ? treeJson.tree : [];
  return tree
    .filter((t) => t?.type === 'blob' && isIndexablePath(t.path))
    .map((t) => String(t.path))
    .sort();
}

/**
 * @param {string} token
 * @param {string} repo
 * @param {string} path
 * @param {string} [branch]
 */
async function fetchRepoFile(token, repo, path, branch = 'main') {
  const enc = path
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const qs = branch ? `?ref=${encodeURIComponent(branch)}` : '';
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${enc}${qs}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'IAM-CodeIndexer',
    },
  });
  if (!res.ok) {
    throw new Error(`github_file_failed:${res.status}:${path}`);
  }
  const data = await res.json();
  if (typeof data?.content === 'string' && data.encoding === 'base64') {
    const bin = atob(data.content.replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }
  return '';
}

/**
 * @param {any} env
 * @param {string} workspaceUuid
 * @param {string} d1WorkspaceId
 * @param {string} filePath
 */
async function deleteChunksForFile(env, workspaceUuid, filePath) {
  await runHyperdriveQuery(
    env,
    `DELETE FROM agentsam.${CHUNKS_TABLE}
      WHERE workspace_id = $1::uuid AND file_path = $2`,
    [workspaceUuid, filePath],
  );
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} row
 */
async function upsertChunkRow(env, row) {
  const sql = `
    INSERT INTO agentsam.${CHUNKS_TABLE} (
      id, workspace_id, file_path, content, chunk_index, token_count, embedding, metadata
    ) VALUES (
      $1::uuid, $2::uuid, $3, $4, $5, $6, $7::vector, $8::jsonb
    )`;
  const r = await runHyperdriveQuery(env, sql, [
    row.id,
    row.workspace_id,
    row.file_path,
    row.content,
    row.chunk_index,
    row.token_count,
    vectorLiteral(row.embedding),
    JSON.stringify(row.metadata || {}),
  ]);
  if (!r.ok) throw new Error(r.error || 'chunk_upsert_failed');
}

/**
 * @param {any} env
 * @param {{ id: string, embedding: number[], metadata: Record<string, unknown> }} item
 */
async function upsertCodeVector(env, item) {
  const binding = env?.[CODE_BINDING];
  if (!binding?.upsert) return { ok: false, skipped: 'no_binding' };
  const meta = { ...(item.metadata || {}), source: 'codebase' };
  for (const k of Object.keys(meta)) {
    const v = meta[k];
    if (v != null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
      meta[k] = JSON.stringify(v).slice(0, 500);
    }
  }
  await binding.upsert([{ id: item.id, values: item.embedding, metadata: meta }]);
  return { ok: true };
}

/**
 * @param {any} env
 * @param {number} storedVectors
 */
async function updateVectorizeRegistry(env, storedVectors) {
  if (!env?.DB) return;
  const cols = await env.DB.prepare(`PRAGMA table_info(vectorize_index_registry)`)
    .all()
    .catch(() => ({ results: [] }));
  const names = new Set((cols.results || []).map((r) => String(r.name).toLowerCase()));
  if (!names.has('stored_vectors')) return;

  const sets = ['stored_vectors = ?'];
  const binds = [Math.max(0, Math.floor(storedVectors))];
  if (names.has('last_indexed_at')) {
    sets.push("last_indexed_at = datetime('now')");
  }
  if (names.has('updated_at')) {
    sets.push("updated_at = datetime('now')");
  }
  await env.DB.prepare(
    `UPDATE vectorize_index_registry SET ${sets.join(', ')} WHERE binding_name = ?`,
  )
    .bind(...binds, CODE_BINDING)
    .run()
    .catch((e) => console.warn('[code-indexer] registry_update', e?.message ?? e));
}

/**
 * @param {any} env
 * @param {string} jobId
 * @param {Record<string, unknown>} patch
 * @param {Set<string>} cols
 */
async function patchJob(env, jobId, patch, cols) {
  const entries = Object.entries(patch).filter(([k]) => cols.has(k.toLowerCase()));
  if (!entries.length) return;
  const setSql = entries.map(([k]) => `${k} = ?`).join(', ');
  const binds = entries.map(([, v]) => v);
  if (cols.has('updated_at') && !patch.updated_at) {
    await env.DB.prepare(
      `UPDATE agentsam_code_index_job SET ${setSql}, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(...binds, jobId)
      .run();
  } else {
    await env.DB.prepare(`UPDATE agentsam_code_index_job SET ${setSql} WHERE id = ?`)
      .bind(...binds, jobId)
      .run();
  }
}

/**
 * @param {any} env
 * @param {string} [jobId]
 * @param {{ maxFiles?: number, startedAt?: number, cpuBudgetMs?: number }} [opts]
 */
export async function runCodeIndexJob(env, jobId, opts = {}) {
  if (!env?.DB) return { ok: false, error: 'no_db' };
  if (!isHyperdriveUsable(env)) return { ok: false, error: 'hyperdrive_unavailable' };

  const cols = await loadJobColumns(env);
  const startedAt = opts.startedAt ?? Date.now();
  const cpuBudgetMs = opts.cpuBudgetMs ?? 22_000;
  const maxFiles = opts.maxFiles ?? MAX_FILES_PER_RUN;

  const selectCols = ['id', 'workspace_id', 'status'];
  for (const c of [
    'user_id',
    'repo_full_name',
    'source_path',
    'branch',
    'file_count',
    'indexed_file_count',
    'chunk_count',
    'triggered_by',
  ]) {
    if (cols.has(c)) selectCols.push(c);
  }

  const job =
    jobId != null
      ? await env.DB.prepare(
          `SELECT ${selectCols.join(', ')} FROM agentsam_code_index_job WHERE id = ? LIMIT 1`,
        )
          .bind(String(jobId))
          .first()
      : await env.DB.prepare(
          `SELECT ${selectCols.join(', ')} FROM agentsam_code_index_job
           WHERE status = 'idle' ORDER BY rowid LIMIT 1`,
        ).first();

  if (!job?.id) return { ok: true, skipped: true, reason: 'no_idle_job' };

  const claim = await env.DB.prepare(
    `UPDATE agentsam_code_index_job SET status = 'running' WHERE id = ? AND status = 'idle'`,
  )
    .bind(job.id)
    .run();
  if (!claim?.meta?.changes) {
    return { ok: true, skipped: true, reason: 'job_not_idle', job_id: job.id };
  }

  const nowIso = new Date().toISOString();
  const runPatch = { status: 'running' };
  if (cols.has('started_at')) runPatch.started_at = nowIso;
  if (cols.has('last_error')) runPatch.last_error = null;
  await patchJob(env, job.id, runPatch, cols);

  const d1WorkspaceId = String(job.workspace_id || 'ws_inneranimalmedia').trim();
  const workspaceUuid = await resolveSupabaseWorkspaceId(env, d1WorkspaceId);
  if (!workspaceUuid) {
    await patchJob(
      env,
      job.id,
      {
        status: 'failed',
        last_error: 'workspace_uuid_unresolved',
        ...(cols.has('finished_at') ? { finished_at: nowIso } : {}),
        ...(cols.has('completed_at') ? { completed_at: nowIso } : {}),
      },
      cols,
    );
    return { ok: false, error: 'workspace_uuid_unresolved', job_id: job.id };
  }

  let gh;
  try {
    gh = await resolveGithubTokenForJob(env, job);
  } catch (e) {
    const msg = String(e?.message || e);
    await patchJob(
      env,
      job.id,
      {
        status: 'failed',
        last_error: msg,
        ...(cols.has('finished_at') ? { finished_at: nowIso } : {}),
        ...(cols.has('completed_at') ? { completed_at: nowIso } : {}),
      },
      cols,
    );
    return { ok: false, error: msg, job_id: job.id };
  }

  const branch = job.branch != null ? String(job.branch).trim() : 'main';
  let allFiles;
  try {
    allFiles = await listRepoFiles(gh.token, gh.repo, branch);
  } catch (e) {
    const msg = String(e?.message || e);
    await patchJob(
      env,
      job.id,
      {
        status: 'failed',
        last_error: msg,
        ...(cols.has('finished_at') ? { finished_at: nowIso } : {}),
        ...(cols.has('completed_at') ? { completed_at: nowIso } : {}),
      },
      cols,
    );
    return { ok: false, error: msg, job_id: job.id };
  }

  const offset = Number(job.indexed_file_count) || 0;
  const batchFiles = allFiles.slice(offset, offset + maxFiles);
  const priorChunks = Number(job.chunk_count) || 0;

  if (cols.has('file_count')) {
    await patchJob(env, job.id, { file_count: allFiles.length }, cols);
  }

  let fileErrors = 0;
  let filesOk = 0;
  let chunksWritten = 0;
  let filesProcessed = 0;
  const errors = [];

  try {
    for (const filePath of batchFiles) {
      if (Date.now() - startedAt > cpuBudgetMs) break;
      filesProcessed++;

      try {
        const raw = await fetchRepoFile(gh.token, gh.repo, filePath, branch);
        if (raw.length > MAX_FILE_BYTES) {
          filesOk++;
          continue;
        }
        const chunks = chunkFileContent(raw);
        await deleteChunksForFile(env, workspaceUuid, filePath);

        for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
          if (Date.now() - startedAt > cpuBudgetMs) break;
          const slice = chunks.slice(i, i + EMBED_BATCH);
          const embeddings = [];
          for (const text of slice) {
            const { embedding } = await createAgentsamEmbedding(env, text, {
              spec: EMBED_SPEC,
              userId: job.user_id != null ? String(job.user_id) : null,
            });
            embeddings.push(embedding);
          }

          for (let j = 0; j < slice.length; j++) {
            const chunkIndex = i + j;
            const content = slice[j];
            const vectorizeId = await buildCodeVectorizeId(d1WorkspaceId, filePath, chunkIndex);
            const rowId = crypto.randomUUID();
            const metadata = {
              workspace_id: d1WorkspaceId,
              workspace_uuid: workspaceUuid,
              file_path: filePath,
              chunk_index: chunkIndex,
              repo: gh.repo,
              branch,
              source: 'code-indexer',
              embedding_model: resolveTextEmbeddingRoute('code').model,
            };

            await upsertChunkRow(env, {
              id: rowId,
              workspace_id: workspaceUuid,
              file_path: filePath,
              content,
              chunk_index: chunkIndex,
              token_count: estimateTokens(content),
              embedding: embeddings[j],
              metadata,
            });

            await upsertCodeVector(env, {
              id: vectorizeId,
              embedding: embeddings[j],
              metadata,
            });
            chunksWritten++;
          }
        }
        filesOk++;
      } catch (e) {
        fileErrors++;
        errors.push({ file_path: filePath, error: String(e?.message || e) });
        console.warn('[code-indexer] file_error', filePath, e?.message ?? e);
      }
    }

    const newOffset = offset + filesProcessed;
    const complete = newOffset >= allFiles.length;
    const failRate = filesProcessed ? fileErrors / filesProcessed : 0;

    const totalChunks = priorChunks + chunksWritten;
    const finishPatch = {
      indexed_file_count: newOffset,
      chunk_count: totalChunks,
      progress_percent: allFiles.length
        ? Math.min(100, Math.round((newOffset / allFiles.length) * 100))
        : 100,
    };

    if (complete) {
      if (failRate > 0.5) {
        finishPatch.status = 'failed';
        finishPatch.last_error = `>${Math.round(failRate * 100)}% file errors`;
      } else {
        finishPatch.status = 'completed';
        finishPatch.last_error = null;
      }
      if (cols.has('finished_at')) finishPatch.finished_at = new Date().toISOString();
      if (cols.has('completed_at')) finishPatch.completed_at = new Date().toISOString();
      if (cols.has('last_sync_at')) finishPatch.last_sync_at = new Date().toISOString();
      await patchJob(env, job.id, finishPatch, cols);
      if (finishPatch.status === 'completed') {
        await updateVectorizeRegistry(env, totalChunks);
      }
    } else {
      finishPatch.status = 'idle';
      finishPatch.triggered_by = 'resume';
      await patchJob(env, job.id, finishPatch, cols);
    }

    return {
      ok: true,
      job_id: job.id,
      repo: gh.repo,
      complete,
      files_total: allFiles.length,
      files_processed_this_run: filesProcessed,
      files_ok: filesOk,
      file_errors: fileErrors,
      chunks_written: chunksWritten,
      chunk_count_total: totalChunks,
      resume_at_file: complete ? null : newOffset,
      errors: errors.slice(0, 5),
    };
  } catch (e) {
    const msg = String(e?.message || e);
    console.warn('[code-indexer] run_failed', job.id, msg);
    await patchJob(
      env,
      job.id,
      {
        status: 'idle',
        triggered_by: 'resume',
        last_error: msg.slice(0, 500),
      },
      cols,
    );
    return { ok: false, error: msg, job_id: job.id, chunks_written: chunksWritten };
  }
}

/**
 * Pick oldest idle job and run (cron / internal trigger).
 * @param {any} env
 * @param {{ cpuBudgetMs?: number }} [opts]
 */
export async function runPendingCodeIndexJob(env, opts = {}) {
  if (env?.DB) {
    await env.DB.prepare(
      `UPDATE agentsam_code_index_job
          SET status = 'idle', triggered_by = 'stale_recovery'
        WHERE status = 'running'
          AND updated_at < datetime('now', '-8 minutes')`,
    )
      .run()
      .catch(() => null);
  }
  return runCodeIndexJob(env, null, opts);
}
