/**
 * POST /api/internal/embed-codebase-chunks-backfill
 * Backfill NULL embeddings / token_count on public.codebase_chunks via embed-on-ingest.
 * (backfill-embeddings does not list codebase_chunks in its TABLE_CONTENT_MAP.)
 *
 * Table columns (18): id, snapshot_id, file_id, workspace_id, tenant_id, file_path,
 * chunk_index, chunk_type, content, embedding, line_start, line_end, symbol_name,
 * language, metadata, embed_model, created_at, token_count.
 */
import { jsonResponse, verifyInternalApiSecret, getAuthUser } from '../core/auth.js';
import { isHyperdriveUsable, runHyperdriveQuery } from '../core/hyperdrive-query.js';
import { supabasePatchJson } from './health/supabaseRest.js';

/** Target embed model for codebase_chunks (OpenAI @ 1024 dims — see CODEBASE_RAG_MODEL_MIGRATION.md). */
const CODEBASE_CHUNK_EMBED_MODEL_DEFAULT = 'text-embedding-3-large';

/** @param {any} env */
function codebaseChunkEmbedModelFromEnv(env, embedResult) {
  const fromResult = pickEmbedModelFromEmbedResult(embedResult);
  if (fromResult) return fromResult;
  const fromEnv = env?.RAG_OPENAI_EMBEDDING_MODEL && String(env.RAG_OPENAI_EMBEDDING_MODEL).trim();
  return fromEnv || CODEBASE_CHUNK_EMBED_MODEL_DEFAULT;
}

/** Rough token estimate (~4 chars per token). */
function approxTokenCount(content) {
  const s = String(content ?? '');
  if (!s) return 0;
  return Math.ceil(s.length / 4);
}

/** @param {unknown} result */
function pickEmbeddingFromEmbedResult(result) {
  if (!result || typeof result !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (result);
  const emb = r.embedding ?? r.vector ?? r.values;
  if (Array.isArray(emb) && emb.length > 0) return emb;
  const data = r.data;
  if (data && typeof data === 'object') {
    const d = /** @type {Record<string, unknown>} */ (data);
    if (Array.isArray(d.embedding) && d.embedding.length > 0) return d.embedding;
  }
  return null;
}

/** @param {any} env */
function supabaseFunctionsBase(env) {
  const raw = env?.SUPABASE_URL;
  if (!raw || !String(raw).trim()) return null;
  return `${String(raw).trim().replace(/\/$/, '')}/functions/v1`;
}

/** @param {any} env */
function serviceRoleKey(env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  return key && String(key).trim() ? String(key).trim() : null;
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} record
 */
async function invokeEmbedOnIngest(env, record) {
  const base = supabaseFunctionsBase(env);
  const key = serviceRoleKey(env);
  if (!base || !key) return { ok: false, error: 'supabase_not_configured' };

  const body = {
    type: 'INSERT',
    table: 'codebase_chunks',
    schema: 'public',
    record,
  };
  const webhookSecret = env?.SUPABASE_WEBHOOK_SECRET && String(env.SUPABASE_WEBHOOK_SECRET).trim();
  if (webhookSecret) body.secret = webhookSecret;

  try {
    const res = await fetch(`${base}/embed-on-ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 500) };
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { ok: true, status: res.status, result: json };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @param {unknown} result */
function pickEmbedModelFromEmbedResult(result) {
  if (!result || typeof result !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (result);
  const m = r.embed_model ?? r.model ?? r.embedding_model;
  if (typeof m === 'string' && m.trim()) return m.trim();
  const data = r.data;
  if (data && typeof data === 'object') {
    const d = /** @type {Record<string, unknown>} */ (data);
    if (typeof d.embed_model === 'string' && d.embed_model.trim()) return d.embed_model.trim();
  }
  return null;
}


/** @param {Record<string, unknown>} row */
function buildEmbedIngestRecord(row, token_count) {
  const record = {
    id: row.id,
    tenant_id: row.tenant_id,
    workspace_id: row.workspace_id,
    snapshot_id: row.snapshot_id,
    file_path: row.file_path,
    chunk_index: row.chunk_index,
    content: row.content,
    token_count,
  };
  if (row.file_id != null) record.file_id = row.file_id;
  if (row.chunk_type != null) record.chunk_type = row.chunk_type;
  if (row.language != null) record.language = row.language;
  return record;
}

/**
 * @param {Request} request
 * @param {any} env
 */
export async function handleEmbedCodebaseChunksBackfill(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const internalOk = verifyInternalApiSecret(request, env);
  if (!internalOk) {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!isHyperdriveUsable(env)) {
    return jsonResponse({ ok: false, error: 'hyperdrive_not_configured' }, 503);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const limit = Math.min(100, Math.max(1, Number(body.limit) || 25));
  const batchSize = Math.min(10, Math.max(1, Number(body.batch_size) || 5));
  const delayMs = Math.max(0, Number(body.delay_ms) || 500);

  const pending = await runHyperdriveQuery(
    env,
    `SELECT id, tenant_id, workspace_id, snapshot_id, file_id, file_path, chunk_index,
            chunk_type, content, language, token_count, embed_model,
            (embedding IS NULL) AS needs_embedding
     FROM public.codebase_chunks
     WHERE embedding IS NULL OR token_count IS NULL
     ORDER BY (embedding IS NULL) DESC, created_at ASC NULLS LAST
     LIMIT $1`,
    [limit],
  );

  if (!pending.ok) {
    return jsonResponse({ ok: false, error: pending.error || 'query_failed' }, 500);
  }

  const rows = pending.rows || [];
  if (!rows.length) {
    return jsonResponse({
      ok: true,
      message: 'No codebase_chunks rows need embedding or token_count backfill',
      processed: 0,
      succeeded: 0,
    });
  }

  const results = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    for (const row of chunk) {
      const token_count = approxTokenCount(row.content);
      const needsEmbedding = row.needs_embedding === true || row.needs_embedding === 't';

      /** @type {Record<string, unknown>} */
      const patch = { token_count };
      let embedStatus = null;

      if (needsEmbedding) {
        const out = await invokeEmbedOnIngest(env, buildEmbedIngestRecord(row, token_count));
        if (!out.ok) {
          results.push({ id: row.id, ...out });
          continue;
        }
        embedStatus = out.status;
        const embedding = pickEmbeddingFromEmbedResult(out.result);
        if (embedding) patch.embedding = embedding;
        if (!row.embed_model) patch.embed_model = codebaseChunkEmbedModelFromEnv(env, out.result);
      } else if (!row.embed_model) {
        patch.embed_model = codebaseChunkEmbedModelFromEnv(env, null);
      }

      const patchOut = await supabasePatchJson(env, 'codebase_chunks', 'id', String(row.id), patch);
      results.push({
        id: row.id,
        ok: patchOut.ok,
        embed: embedStatus,
        patch_status: patchOut.status,
        token_count,
        token_count_only: !needsEmbedding,
        patched_embedding: Boolean(patch.embedding),
        error: patchOut.ok ? undefined : patchOut.data,
      });
    }
    if (i + batchSize < rows.length && delayMs > 0) await sleep(delayMs);
  }

  const succeeded = results.filter((r) => r.ok === true).length;
  const remaining = await runHyperdriveQuery(
    env,
    `SELECT
       COUNT(*) FILTER (WHERE embedding IS NULL)::int AS null_embedding,
       COUNT(*) FILTER (WHERE token_count IS NULL)::int AS null_token_count
     FROM public.codebase_chunks`,
    [],
  );
  const rem = remaining.rows?.[0] ?? {};

  return jsonResponse({
    ok: true,
    processed: rows.length,
    succeeded,
    failed: rows.length - succeeded,
    remaining_null_embedding: Number(rem.null_embedding ?? 0) || 0,
    remaining_null_token_count: Number(rem.null_token_count ?? 0) || 0,
    results: results.slice(0, 15),
    hint: 'Create Database Webhook codebase_chunks INSERT → embed-on-ingest for forward path',
  });
}
