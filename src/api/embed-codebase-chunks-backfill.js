/**
 * POST /api/internal/embed-codebase-chunks-backfill
 * Backfill NULL embeddings on public.codebase_chunks via embed-on-ingest Edge Function.
 * (backfill-embeddings does not list codebase_chunks in its TABLE_CONTENT_MAP.)
 */
import { jsonResponse, verifyInternalApiSecret, getAuthUser } from '../core/auth.js';
import { isHyperdriveUsable, runHyperdriveQuery } from '../core/hyperdrive-query.js';

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
    `SELECT id, tenant_id, workspace_id, snapshot_id, file_path, chunk_index, content,
            token_count, chunk_type, language
     FROM public.codebase_chunks
     WHERE embedding IS NULL
     ORDER BY created_at ASC NULLS LAST
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
      message: 'No codebase_chunks rows with NULL embedding',
      processed: 0,
      succeeded: 0,
    });
  }

  const results = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    for (const row of chunk) {
      const record = {
        id: row.id,
        tenant_id: row.tenant_id,
        workspace_id: row.workspace_id,
        snapshot_id: row.snapshot_id,
        file_path: row.file_path,
        chunk_index: row.chunk_index,
        content: row.content,
        token_count: row.token_count,
        chunk_type: row.chunk_type,
        language: row.language,
      };
      const out = await invokeEmbedOnIngest(env, record);
      results.push({ id: row.id, ...out });
    }
    if (i + batchSize < rows.length && delayMs > 0) await sleep(delayMs);
  }

  const succeeded = results.filter((r) => r.ok).length;
  const remaining = await runHyperdriveQuery(
    env,
    `SELECT COUNT(*)::int AS c FROM public.codebase_chunks WHERE embedding IS NULL`,
    [],
  );

  return jsonResponse({
    ok: true,
    processed: rows.length,
    succeeded,
    failed: rows.length - succeeded,
    remaining_null_embedding: Number(remaining.rows?.[0]?.c ?? 0) || 0,
    results: results.slice(0, 15),
    hint: 'Create Database Webhook codebase_chunks INSERT → embed-on-ingest for forward path',
  });
}
