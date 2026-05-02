/**
 * RAG API — OpenAI embeddings + Supabase (Hyperdrive/pgvector) + R2 (S3-compatible).
 * No AI Search, Vectorize, or Workers AI embedding models on this path.
 */
import { AwsClient } from 'aws4fetch';
import { jsonResponse } from '../core/responses.js';
import { getAuthUser, fetchAuthUserTenantId } from '../core/auth.js';

export const RAG_CHUNK_MAX_CHARS = 600;
export const RAG_CHUNK_OVERLAP = 80;
export const RAG_EMBED_BATCH_SIZE = 32;
export const RAG_COMPACT_MAX_MSG_CHARS = 800;
export const RAG_COMPACT_HOURS = 48;

// ── small utilities (kept for callers / chunking) ─────────────────────────────

export function sanitizeUnifiedRagLike(q) {
  return String(q || '').slice(0, 120).replace(/[%_\[\]^]/g, ' ').trim();
}

export function unifiedRagContentHash(s) {
  const t = String(s || '').trim().replace(/\s+/g, ' ').slice(0, 600);
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return String(h);
}

export function unifiedRagRecency01(ts) {
  const now = Math.floor(Date.now() / 1000);
  let sec = 0;
  if (!ts) return 0.5;
  if (typeof ts === 'number') {
    sec = ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
  } else {
    const parsed = Date.parse(String(ts));
    if (Number.isNaN(parsed)) return 0.5;
    sec = Math.floor(parsed / 1000);
  }
  const ageDays = Math.max(0, (now - sec) / 86400);
  return Math.max(0, Math.min(1, 1 - Math.min(ageDays, 365) / 365));
}

export function unifiedRagCosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

function timingSafeEqualUtf8(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

async function hmacSha256HexFromUtf8Key(secretUtf8, messageUtf8) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretUtf8),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(messageUtf8));
  return [...new Uint8Array(sig)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

async function verifySupabaseWebhookSignature(secret, rawBody, sigHeader) {
  if (!secret || !sigHeader) return false;
  const trimmed = String(sigHeader).trim();
  const got = trimmed.replace(/^sha256=/i, '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(got)) return false;
  const expectedHex = (await hmacSha256HexFromUtf8Key(secret, rawBody)).toLowerCase();
  return timingSafeEqualUtf8(expectedHex, got);
}

function ragAgentId(env) {
  return String(env.RAG_AGENT_ID || '').trim();
}

function ragDocumentsProjectId(env) {
  return String(env.RAG_DOCUMENTS_PROJECT_ID || '').trim();
}

function ragEmbeddingModel(env) {
  return String(env.RAG_OPENAI_EMBEDDING_MODEL || '').trim();
}

function ragEmbeddingDims(env) {
  const n = Number(String(env.RAG_EMBEDDING_DIMENSIONS ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function r2AutoragBucketName(env) {
  return String(env.R2_AUTORAG_BUCKET_NAME || '').trim();
}

function openaiEmbeddingsBaseUrl(env) {
  const b = String(env.OPENAI_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (!b) throw new Error('OPENAI_API_BASE_URL not configured');
  return b;
}

function verifyInternalSecret(request, env) {
  const secret = env.INTERNAL_API_SECRET;
  if (!secret || typeof secret !== 'string') return false;
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const header = (request.headers.get('X-Internal-Secret') || '').trim();
  const token = bearer || header;
  return token === secret;
}

function resolveAutoragFolder(env, metadata) {
  const prefixes = String(env.RAG_AUTORAG_FOLDER_PREFIXES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const fallback = prefixes[0] || 'knowledge/';
  const folder = metadata && metadata.folder != null ? String(metadata.folder) : '';
  const normalized = folder.endsWith('/') ? folder : folder ? `${folder}/` : '';
  if (normalized && prefixes.includes(normalized)) return normalized;
  return fallback;
}

function safeObjectSuffix(source) {
  const s = String(source || 'doc')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 200);
  return s || 'doc';
}

function r2AwsClient(env) {
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  return new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  });
}

function parseListKeys(xml) {
  const keys = [];
  const re = /<Key>([^<]*)<\/Key>/g;
  let m;
  while ((m = re.exec(xml))) keys.push(m[1]);
  return keys;
}

function parseListTruncated(xml) {
  return /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
}

function parseNextContinuationToken(xml) {
  const m = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/);
  return m ? m[1] : '';
}

async function r2ListAllObjectKeys(env) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const bucket = r2AutoragBucketName(env);
  const client = r2AwsClient(env);
  if (!accountId || !bucket || !client) throw new Error('R2 list: missing account, bucket name, or credentials');
  const keys = [];
  let token = '';
  do {
    const q = new URLSearchParams({ 'list-type': '2' });
    if (token) q.set('continuation-token', token);
    const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}?${q}`;
    const res = await client.fetch(url);
    if (!res.ok) throw new Error(`R2 ListObjects failed: ${res.status}`);
    const xml = await res.text();
    keys.push(...parseListKeys(xml));
    const truncated = parseListTruncated(xml);
    token = truncated ? parseNextContinuationToken(xml) : '';
  } while (token);
  return keys;
}

function encodeS3ObjectKey(key) {
  return String(key)
    .split('/')
    .filter((seg) => seg.length > 0)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

async function r2GetObjectText(env, key) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const bucket = r2AutoragBucketName(env);
  const client = r2AwsClient(env);
  if (!accountId || !bucket || !client) throw new Error('R2 get: missing account, bucket name, or credentials');
  const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeS3ObjectKey(key)}`;
  const res = await client.fetch(url);
  if (!res.ok) throw new Error(`R2 GetObject failed: ${res.status}`);
  return await res.text();
}

async function r2PutObjectText(env, key, bodyText) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const bucket = r2AutoragBucketName(env);
  const client = r2AwsClient(env);
  if (!accountId || !bucket || !client) throw new Error('R2 put: missing account, bucket name, or credentials');
  const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeS3ObjectKey(key)}`;
  const res = await client.fetch(url, {
    method: 'PUT',
    body: bodyText,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
  if (!res.ok) throw new Error(`R2 PutObject failed: ${res.status}`);
}

async function openaiCreateEmbedding(env, inputText) {
  const apiKey = env.OPENAI_API_KEY;
  const model = ragEmbeddingModel(env);
  const dims = ragEmbeddingDims(env);
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  if (!model) throw new Error('RAG_OPENAI_EMBEDDING_MODEL not configured');
  if (!Number.isFinite(dims)) throw new Error('RAG_EMBEDDING_DIMENSIONS not configured');
  const base = openaiEmbeddingsBaseUrl(env);
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: inputText,
      dimensions: dims,
    }),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI embeddings: non-JSON response (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI embeddings HTTP ${res.status}`);
  }
  const vec = data?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error('OpenAI embeddings: missing vector');
  return vec;
}

function vectorLiteral(vec) {
  return `[${vec.join(',')}]`;
}

async function withPg(env, fn) {
  const cs = env.HYPERDRIVE?.connectionString;
  if (!cs) throw new Error('HYPERDRIVE not configured');
  const { Client } = await import('pg');
  const client = new Client({ connectionString: cs });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function upsertDocument(env, { source, title, content, embedding, projectId, metadata }) {
  const vecLit = vectorLiteral(embedding);
  const metaJson = JSON.stringify(metadata ?? {});

  return withPg(env, async (client) => {
    const tryWithMeta = async () => {
      const sel = await client.query(
        `SELECT id FROM public.documents WHERE source = $1 AND project_id = $2 LIMIT 1`,
        [source, projectId]
      );
      if (sel.rows?.length) {
        await client.query(
          `UPDATE public.documents SET title = $3, content = $4, embedding = $5::vector, metadata = $6::jsonb, updated_at = now()
           WHERE source = $1 AND project_id = $2`,
          [source, projectId, title, content, vecLit, metaJson]
        );
      } else {
        await client.query(
          `INSERT INTO public.documents (source, title, content, embedding, project_id, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4::vector, $5, $6::jsonb, now(), now())`,
          [source, title, content, vecLit, projectId, metaJson]
        );
      }
    };
    const tryBasic = async () => {
      const sel = await client.query(
        `SELECT id FROM public.documents WHERE source = $1 AND project_id = $2 LIMIT 1`,
        [source, projectId]
      );
      if (sel.rows?.length) {
        await client.query(
          `UPDATE public.documents SET title = $3, content = $4, embedding = $5::vector WHERE source = $1 AND project_id = $2`,
          [source, projectId, title, content, vecLit]
        );
      } else {
        await client.query(
          `INSERT INTO public.documents (source, title, content, embedding, project_id, created_at)
           VALUES ($1, $2, $3, $4::vector, $5, now())`,
          [source, title, content, vecLit, projectId]
        );
      }
    };
    try {
      await tryWithMeta();
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('metadata') || msg.includes('updated_at')) {
        await tryBasic();
      } else {
        throw e;
      }
    }
  });
}

async function documentSourceExists(env, source, projectId) {
  return withPg(env, async (client) => {
    const res = await client.query(
      `SELECT 1 FROM public.documents WHERE source = $1 AND project_id = $2 LIMIT 1`,
      [source, projectId]
    );
    return (res.rows || []).length > 0;
  });
}

async function logSemanticSearch(env, row) {
  try {
    await withPg(env, async (client) => {
      await client.query(
        `INSERT INTO public.semantic_search_log (
          search_fn, tenant_id, query_preview, match_threshold, match_count_requested,
          match_count_returned, top_similarity, avg_similarity, sources_hit
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          row.search_fn,
          row.tenant_id,
          row.query_preview,
          row.match_threshold,
          row.match_count_requested,
          row.match_count_returned,
          row.top_similarity,
          row.avg_similarity,
          JSON.stringify(Array.isArray(row.sources_hit) ? row.sources_hit : []),
        ]
      );
    });
  } catch (e) {
    console.warn('[rag] semantic_search_log:', e?.message ?? e);
  }
}

async function d1RagIngestLog(env, { source, status, chunks }) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO rag_ingest_log (object_key, status, chunk_count, triggered_by) VALUES (?,?,?,?)`
    )
      .bind(String(source || '').slice(0, 2000), status, Number(chunks) || 0, 'rag_ingest')
      .run();
  } catch (e) {
    console.warn('[rag] rag_ingest_log:', e?.message ?? e);
  }
}

function normalizeSearchRow(row, origin) {
  const similarity = Number(row.similarity ?? row.score ?? 0);
  const text =
    row.content ||
    row.summary ||
    row.body ||
    row.text ||
    '';
  const source = row.source || row.source_type || origin;
  return {
    id: row.id ?? row.session_id ?? null,
    content: text,
    source,
    title: row.title ?? null,
    similarity,
    _origin: origin,
  };
}

function mergeDedupeSort(rows) {
  const byHash = new Map();
  for (const r of rows) {
    const h = unifiedRagContentHash(r.content || JSON.stringify(r));
    const prev = byHash.get(h);
    if (!prev || r.similarity > prev.similarity) byHash.set(h, r);
  }
  return Array.from(byHash.values()).sort((a, b) => b.similarity - a.similarity);
}

/**
 * Internal unified search (Hyperdrive RPCs + OpenAI embed).
 */
export async function runUnifiedRagQuery(env, { query, tenantId, threshold, limit, includeSessions }) {
  const agentId = ragAgentId(env);
  if (!agentId) {
    return { results: [], error: 'RAG_AGENT_ID not configured' };
  }
  const q = String(query || '').trim();
  if (!q) return { results: [], error: 'empty query' };

  const vec = await openaiCreateEmbedding(env, q);
  const vecLit = vectorLiteral(vec);

  const lim = Math.min(Math.max(1, limit || 10), 50);
  const thr = typeof threshold === 'number' ? threshold : 0.7;

  const ctxP = withPg(env, async (client) => {
    const res = await client.query(
      `SELECT * FROM public.search_all_context($1::vector, $2::float, $3::int, $4::text)`,
      [vecLit, thr, lim, agentId]
    );
    return res.rows || [];
  });

  const sessP =
    includeSessions && tenantId
      ? withPg(env, async (client) => {
          const res = await client.query(
            `SELECT * FROM public.match_session_summaries($1::vector, $2::text, $3::text, $4::float, $5::int)`,
            [vecLit, tenantId, agentId, thr, 5]
          );
          return res.rows || [];
        })
      : Promise.resolve([]);

  const [ctxRows, sessRows] = await Promise.all([ctxP, sessP]);
  const merged = [
    ...(ctxRows || []).map((r) => normalizeSearchRow(r, 'context')),
    ...(sessRows || []).map((r) => normalizeSearchRow(r, 'session')),
  ];
  const results = mergeDedupeSort(merged);
  return { results, embeddingDims: vec.length };
}

/**
 * Agent-facing RAG (replaces Vectorize / D1 chunk leg).
 */
export async function unifiedRagSearch(env, query, opts = {}) {
  const q = String(query || '').trim();
  if (!q || !env.HYPERDRIVE?.connectionString || !env.OPENAI_API_KEY) {
    return { matches: [], results: [], count: 0, _error: 'missing_bindings' };
  }
  const topK = Math.min(Math.max(1, opts.topK || 8), 24);
  const _t0 = Date.now();
  const tenantId = opts.tenantId != null && String(opts.tenantId).trim() !== '' ? String(opts.tenantId).trim() : null;
  const { results, error } = await runUnifiedRagQuery(env, {
    query: q,
    tenantId,
    threshold: 0.7,
    limit: Math.max(topK, 10),
    includeSessions: true,
  });
  if (error) {
    return { matches: [], results: [], count: 0, _error: error };
  }
  const sliced = results.slice(0, topK);
  return {
    matches: sliced.map((x) => {
      const tag = x.source ? `[${x.source}] ` : '';
      return `${tag}${x.content || ''}`.trim();
    }),
    results: sliced.map((x) => ({
      text: x.content,
      source: x.id,
      source_type: x._origin === 'session' ? 'supabase_session_summaries' : `supabase_${x.source || 'context'}`,
      score: Math.round(x.similarity * 1000) / 1000,
    })),
    count: sliced.length,
    _meta: { duration_ms: Date.now() - _t0 },
  };
}

export function chunkMarkdown(text, maxChars = RAG_CHUNK_MAX_CHARS, overlap = RAG_CHUNK_OVERLAP) {
  const chunks = [];
  const sections = text.split(/(?=^##?\s)/m).map((s) => s.trim()).filter(Boolean);
  for (const section of sections) {
    if (section.length <= maxChars) {
      chunks.push(section);
      continue;
    }
    let start = 0;
    while (start < section.length) {
      const end = Math.min(start + maxChars, section.length);
      const slice = section.slice(start, end);
      if (slice.trim()) chunks.push(slice.trim());
      start = end - (end < section.length ? overlap : 0);
    }
  }
  return chunks.length ? chunks : [text.slice(0, maxChars)];
}

export async function compactAgentChatsToR2(env) {
  if (!env.DB || !env.R2) return { error: 'DB or R2 missing' };
  const cutoff = Math.floor(Date.now() / 1000) - RAG_COMPACT_HOURS * 3600;
  const out = await env.DB.prepare(`SELECT conversation_id, role, content FROM agent_messages WHERE created_at < ?`)
    .bind(cutoff)
    .all();
  const rows = out?.results || [];
  return { conversations_compacted: rows.length };
}

/**
 * POST /api/rag/ingest | /api/rag/search | /api/rag/sync | /api/search (POST)
 */
export async function handleRagApi(request, url, env, _ctx) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    if (path === '/api/search' && method === 'POST') {
      return handleRagSearchRoute(request, env);
    }
    if (path === '/api/rag/ingest' && method === 'POST') {
      return handleRagIngest(request, env);
    }
    if (path === '/api/rag/search' && method === 'POST') {
      return handleRagSearchRoute(request, env);
    }
    if (path === '/api/rag/sync' && method === 'POST') {
      return handleRagSync(request, env);
    }
    return jsonResponse({ error: 'Not found' }, 404);
  } catch (e) {
    console.warn('[rag]', e?.message ?? e);
    return jsonResponse({ error: e?.message || 'RAG error' }, 500);
  }
}

async function handleRagIngest(request, env) {
  const rawBody = await request.text();
  const sig =
    request.headers.get('x-supabase-signature') || request.headers.get('X-Supabase-Signature') || '';
  const isWebhook = !!sig;
  if (isWebhook) {
    const secret = env.SUPABASE_WEBHOOK_SECRET;
    if (!secret || !(await verifySupabaseWebhookSignature(secret, rawBody, sig))) {
      return jsonResponse({ error: 'Invalid webhook signature' }, 401);
    }
  } else {
    const user = await getAuthUser(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const record = body.record || body;
  const content = String(record.content ?? body.content ?? '').trim();
  const source = String(record.source ?? body.source ?? '').trim();
  const title = String(record.title ?? body.title ?? (source || 'untitled')).slice(0, 500);
  const metadata =
    typeof record.metadata === 'object' && record.metadata !== null
      ? record.metadata
      : typeof body.metadata === 'object' && body.metadata !== null
        ? body.metadata
        : {};

  if (!content || !source) {
    return jsonResponse({ error: 'content and source required' }, 400);
  }

  const projectId = ragDocumentsProjectId(env);
  if (!projectId) return jsonResponse({ error: 'RAG_DOCUMENTS_PROJECT_ID not configured' }, 503);

  const dims = ragEmbeddingDims(env);
  if (!Number.isFinite(dims)) return jsonResponse({ error: 'RAG_EMBEDDING_DIMENSIONS not configured' }, 503);

  try {
    const embedding = await openaiCreateEmbedding(env, content);
    await upsertDocument(env, { source, title, content, embedding, projectId, metadata });

    const folder = resolveAutoragFolder(env, metadata);
    const r2Key = `${folder}${safeObjectSuffix(source)}.txt`;
    try {
      await r2PutObjectText(env, r2Key, content);
    } catch (e) {
      console.warn('[rag] R2 put skipped:', e?.message ?? e);
    }

    await d1RagIngestLog(env, { source, status: 'success', chunks: 1 });

    return jsonResponse({ ok: true, source, dims: embedding.length });
  } catch (e) {
    await d1RagIngestLog(env, { source, status: `error:${String(e?.message || e).slice(0, 80)}`, chunks: 0 });
    throw e;
  }
}

async function handleRagSearchRoute(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const query = String(body.query || '').trim();
  if (!query) return jsonResponse({ error: 'query required' }, 400);

  const threshold = typeof body.threshold === 'number' ? body.threshold : 0.7;
  const limit = typeof body.limit === 'number' ? body.limit : 10;
  const includeSessions = !!body.include_sessions;
  let tenantId = String(body.tenant_id || '').trim() || null;
  if (!tenantId && user.tenant_id) tenantId = String(user.tenant_id).trim();
  if (!tenantId && user.id) {
    const fromDb = await fetchAuthUserTenantId(env, user.id);
    if (fromDb) tenantId = fromDb;
  }

  const { results, error: searchErr } = await runUnifiedRagQuery(env, {
    query,
    tenantId,
    threshold,
    limit,
    includeSessions,
  });
  if (searchErr) return jsonResponse({ error: searchErr }, searchErr === 'empty query' ? 400 : 503);

  const sims = results.map((r) => r.similarity).filter((n) => Number.isFinite(n));
  const topSim = sims.length ? Math.max(...sims) : null;
  const avgSim = sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : null;
  const sourcesHit = [...new Set(results.map((r) => String(r.source || '')).filter(Boolean))];

  await logSemanticSearch(env, {
    search_fn: 'unified',
    tenant_id: tenantId,
    query_preview: query.slice(0, 100),
    match_threshold: threshold,
    match_count_requested: limit,
    match_count_returned: results.length,
    top_similarity: topSim,
    avg_similarity: avgSim,
    sources_hit: sourcesHit,
  });

  return jsonResponse({
    ok: true,
    results,
    count: results.length,
    query_preview: query.slice(0, 100),
  });
}

async function handleRagSync(request, env) {
  if (!verifyInternalSecret(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const projectId = ragDocumentsProjectId(env);
  if (!projectId) return jsonResponse({ error: 'RAG_DOCUMENTS_PROJECT_ID not configured' }, 503);

  let keys;
  try {
    keys = await r2ListAllObjectKeys(env);
  } catch (e) {
    return jsonResponse({ ok: false, error: e?.message || 'list failed' }, 500);
  }

  const synced = [];
  const skipped = [];
  const errors = [];

  const pending = [];
  for (const key of keys) {
    if (!key || key.endsWith('/')) continue;
    pending.push(key);
  }

  const batchSize = 10;
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (sourceKey) => {
        try {
          const exists = await documentSourceExists(env, sourceKey, projectId);
          if (exists) {
            skipped.push(sourceKey);
            return;
          }
          const text = await r2GetObjectText(env, sourceKey);
          const embedding = await openaiCreateEmbedding(env, text);
          const title = sourceKey.split('/').pop() || sourceKey;
          await upsertDocument(env, {
            source: sourceKey,
            title,
            content: text,
            embedding,
            projectId,
            metadata: { folder: sourceKey.includes('/') ? `${sourceKey.slice(0, sourceKey.lastIndexOf('/') + 1)}` : 'knowledge/' },
          });
          synced.push(sourceKey);
          await d1RagIngestLog(env, { source: sourceKey, status: 'success', chunks: 1 });
        } catch (e) {
          errors.push({ key: sourceKey, error: e?.message || String(e) });
        }
      })
    );
  }

  return jsonResponse({ ok: true, synced: synced.length, skipped: skipped.length, errors });
}

/**
 * POST /api/agent/memory/sync — Supabase webhook: embed new/updated rows.
 */
export async function handleAgentMemorySync(request, env) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  const rawBody = await request.text();
  const sig =
    request.headers.get('x-supabase-signature') || request.headers.get('X-Supabase-Signature') || '';
  const secret = env.SUPABASE_WEBHOOK_SECRET;
  if (!secret || !(await verifySupabaseWebhookSignature(secret, rawBody, sig))) {
    return jsonResponse({ error: 'Invalid webhook signature' }, 401);
  }

  let body;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const record = body.record || body;
  const id = record.id;
  const content = String(record.content || '').trim();
  if (!id || !content) {
    return jsonResponse({ error: 'record.id and record.content required' }, 400);
  }

  const emb = record.embedding;
  const needsEmbedding =
    emb == null || (Array.isArray(emb) && emb.length === 0) || (typeof emb === 'string' && !emb.trim());

  if (!needsEmbedding) {
    await d1RagIngestLog(env, { source: `agent_memory:${id}`, status: 'skipped_has_embedding', chunks: 0 });
    return jsonResponse({ ok: true });
  }

  try {
    const embedding = await openaiCreateEmbedding(env, content);
    const vecLit = vectorLiteral(embedding);
    await withPg(env, async (client) => {
      await client.query(`UPDATE public.agent_memory SET embedding = $1::vector WHERE id = $2::uuid`, [
        vecLit,
        id,
      ]);
    });
    await d1RagIngestLog(env, { source: `agent_memory:${id}`, status: 'success', chunks: 1 });
    return jsonResponse({ ok: true });
  } catch (e) {
    await d1RagIngestLog(env, {
      source: `agent_memory:${id}`,
      status: `error:${String(e?.message || e).slice(0, 80)}`,
      chunks: 0,
    });
    return jsonResponse({ error: e?.message || 'sync failed' }, 500);
  }
}
