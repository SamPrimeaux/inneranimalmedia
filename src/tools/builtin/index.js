/**
 * Built-in Tool Dispatcher
 * Single entry point for all tool execution in the agent loop.
 *
 * Called by: src/api/agent.js → runAgentToolLoop → dispatchToolCall()
 *
 * Architecture:
 *   - D1 tools       → direct env.DB (no HTTP)
 *   - R2 tools       → S3-compatible API via env.R2_ACCESS_KEY_ID + env.R2_SECRET_ACCESS_KEY
 *   - Telemetry      → direct env.DB → mcp_tool_calls
 *   - Time/reasoning → pure computation
 *   - Context/RAG    → env.DB + env.AI inline
 *   - Everything else → selfFetch() proxy to internal API layer
 *
 * Rules:
 *   - No hardcoded model strings — all models come from params or env
 *   - No hardcoded agent IDs — all agent references come from params or ctx
 *   - No hardcoded bucket map — R2 uses S3-compatible API, any bucket by name
 *   - No hardcoded origins — all come from env.IAM_ORIGIN / env.SANDBOX_ORIGIN
 *   - No hardcoded tenant IDs — all tenant context comes from ctx
 *   - R2 full-access is superadmin only — enforced per handler via ctx.role
 */


import { chunkMarkdown } from '../../api/rag.js';
import { embed }         from '../../integrations/workers-ai.js';
import { handlers }      from '../integrations/puppeteer-handlers.js';
// ─── Internal Fetch Helper ────────────────────────────────────────────────────

async function selfFetch(env, path, method = 'POST', body = null) {
  const origin = (env.IAM_ORIGIN || env.SANDBOX_ORIGIN || '').replace(/\/$/, '');
  if (!origin) return { error: 'IAM_ORIGIN not configured — cannot proxy tool call' };
  try {
    const res = await fetch(`${origin}${path}`, {
      method,
      headers: {
        'Content-Type':    'application/json',
        'X-Ingest-Secret': env.INGEST_SECRET || '',
      },
      body: body ? JSON.stringify(body) : null,
    });
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) return { error: data.error || `HTTP ${res.status} from ${path}` };
    return data;
  } catch (e) {
    return { error: `Tool proxy failed (${path}): ${e.message}` };
  }
}

// ─── R2 S3-Compatible Client ──────────────────────────────────────────────────
//
// Uses Cloudflare R2's S3-compatible API with SigV4 signing via Web Crypto.
// Endpoint: https://<account_id>.r2.cloudflarestorage.com
//
// Credentials: env.R2_ACCESS_KEY_ID + env.R2_SECRET_ACCESS_KEY
// Account:     env.CLOUDFLARE_ACCOUNT_ID
// Access gated to superadmin role only — enforced per handler.

function assertSuperAdmin(ctx) {
  return ctx?.role === 'superadmin';
}

function r2AuthError() {
  return { error: 'R2 full-access requires superadmin role' };
}

async function hmacSha256(key, data) {
  const k = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data)));
}

async function sha256Hex(data) {
  const buf  = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function r2SignedRequest(env, path, method = 'GET', body = null, contentType = 'application/octet-stream') {
  const accessKey = env.R2_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_ACCESS_KEY;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!accessKey || !secretKey || !accountId) {
    throw new Error('R2 credentials not configured (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CLOUDFLARE_ACCOUNT_ID)');
  }

  const region   = 'auto';
  const service  = 's3';
  const host     = `${accountId}.r2.cloudflarestorage.com`;
  const endpoint = `https://${host}`;
  const now      = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStamp = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';

  const bodyBytes   = body
    ? new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body))
    : new Uint8Array(0);
  const payloadHash = await sha256Hex(bodyBytes);

  const headers = {
    'host':                 host,
    'x-amz-date':           timeStamp,
    'x-amz-content-sha256': payloadHash,
  };
  if (body) headers['content-type'] = contentType;

  const sortedKeys       = Object.keys(headers).sort();
  const signedHeaders    = sortedKeys.join(';');
  const canonicalHeaders = sortedKeys.map(k => `${k}:${headers[k]}`).join('\n') + '\n';

  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope  = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign     = ['AWS4-HMAC-SHA256', timeStamp, credentialScope, await sha256Hex(canonicalRequest)].join('\n');

  const kDate    = await hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion  = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const reqHeaders = { ...headers, 'Authorization': authHeader };
  delete reqHeaders['host'];

  return fetch(`${endpoint}${path}`, {
    method,
    headers: reqHeaders,
    body: body ? bodyBytes : undefined,
  });
}

async function r2ListAllBuckets(env) {
  const res  = await r2SignedRequest(env, '/', 'GET');
  const text = await res.text();
  return [...text.matchAll(/<Name>([^<]+)<\/Name>/g)].map(m => m[1]);
}

// ─── Direct D1 Handlers ───────────────────────────────────────────────────────

const DB_HANDLERS = {
  async d1_query({ sql, params = [] }, env) {
    if (!env.DB) return { error: 'D1 binding (env.DB) not configured' };
    if (!sql)    return { error: 'sql required' };
    if (/\b(drop\s+table|truncate\s+table)\b/i.test(sql)) return { error: 'Blocked: destructive DDL requires manual approval' };
    try {
      const { results, meta } = await env.DB.prepare(sql).bind(...params).all();
      return { success: true, results: results || [], row_count: (results || []).length, meta };
    } catch (e) { return { error: `D1 query failed: ${e.message}` }; }
  },

  async d1_write({ sql, params = [] }, env) {
    if (!env.DB) return { error: 'D1 binding (env.DB) not configured' };
    if (!sql)    return { error: 'sql required' };
    if (/\b(drop\s+table|truncate\s+table)\b/i.test(sql)) return { error: 'Blocked: DROP TABLE/TRUNCATE require manual approval' };
    try {
      const result = await env.DB.prepare(sql).bind(...params).run();
      return { success: true, changes: result.meta?.changes ?? 0 };
    } catch (e) { return { error: `D1 write failed: ${e.message}` }; }
  },

  async d1_batch_write({ queries }, env) {
    if (!env.DB)                return { error: 'D1 binding not configured' };
    if (!Array.isArray(queries)) return { error: 'queries array required' };
    for (const q of queries) {
      if (/\b(drop\s+table|truncate\s+table)\b/i.test(q.sql || '')) {
        return { error: 'Blocked: batch contains DDL that requires manual approval' };
      }
    }
    try {
      const stmts   = queries.map(q => env.DB.prepare(q.sql).bind(...(q.params || [])));
      const results = await env.DB.batch(stmts);
      return { success: true, results };
    } catch (e) { return { error: `D1 batch failed: ${e.message}` }; }
  },
};

// ─── R2 Handlers (S3-compatible, superadmin only) ────────────────────────────

const R2_HANDLERS = {
  async r2_list_buckets(params, env, ctx) {
    if (!assertSuperAdmin(ctx)) return r2AuthError();
    try {
      const buckets = await r2ListAllBuckets(env);
      return { buckets, count: buckets.length };
    } catch (e) { return { error: `R2 list buckets failed: ${e.message}` }; }
  },

  async r2_list({ bucket, prefix = '', limit = 100 }, env, ctx) {
    if (!assertSuperAdmin(ctx)) return r2AuthError();
    if (!bucket) return { error: 'bucket required' };
    try {
      const qs = new URLSearchParams({ 'list-type': '2', 'max-keys': String(Math.min(limit, 1000)) });
      if (prefix) qs.set('prefix', prefix);
      const res  = await r2SignedRequest(env, `/${bucket}?${qs.toString()}`, 'GET');
      const text = await res.text();
      const keys     = [...text.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]);
      const sizes    = [...text.matchAll(/<Size>([^<]+)<\/Size>/g)].map(m => parseInt(m[1]));
      const truncated = text.includes('<IsTruncated>true</IsTruncated>');
      const objects   = keys.map((key, i) => ({ key, size: sizes[i] ?? 0 }));
      return { objects, count: objects.length, truncated };
    } catch (e) { return { error: `R2 list failed: ${e.message}` }; }
  },

  async r2_read({ bucket, key }, env, ctx) {
    if (!assertSuperAdmin(ctx)) return r2AuthError();
    if (!bucket) return { error: 'bucket required' };
    if (!key)    return { error: 'key required' };
    try {
      const res = await r2SignedRequest(env, `/${bucket}/${key}`, 'GET');
      if (res.status === 404) return { error: `Object not found: ${key}` };
      if (!res.ok) return { error: `R2 read failed: HTTP ${res.status}` };
      const ct   = res.headers.get('content-type') || 'application/octet-stream';
      const text = ct.startsWith('text') || ct.includes('json') || ct.includes('javascript') || ct.includes('xml')
        ? await res.text()
        : `[binary: ${ct}]`;
      return { key, bucket, content: text, content_type: ct };
    } catch (e) { return { error: `R2 read failed: ${e.message}` }; }
  },

  async r2_write({ bucket, key, body, content_type = 'text/plain' }, env, ctx) {
    if (!assertSuperAdmin(ctx)) return r2AuthError();
    if (!bucket)      return { error: 'bucket required' };
    if (!key)         return { error: 'key required' };
    if (body == null) return { error: 'body required' };
    try {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      const res  = await r2SignedRequest(env, `/${bucket}/${key}`, 'PUT', data, content_type);
      if (!res.ok) return { error: `R2 write failed: HTTP ${res.status}` };
      return { success: true, key, bucket };
    } catch (e) { return { error: `R2 write failed: ${e.message}` }; }
  },

  async r2_delete({ bucket, key }, env, ctx) {
    if (!assertSuperAdmin(ctx)) return r2AuthError();
    if (!bucket) return { error: 'bucket required' };
    if (!key)    return { error: 'key required' };
    try {
      const res = await r2SignedRequest(env, `/${bucket}/${key}`, 'DELETE');
      if (!res.ok && res.status !== 204) return { error: `R2 delete failed: HTTP ${res.status}` };
      return { success: true, deleted: key, bucket };
    } catch (e) { return { error: `R2 delete failed: ${e.message}` }; }
  },

  async r2_search({ bucket, prefix = '', query }, env, ctx) {
    if (!assertSuperAdmin(ctx)) return r2AuthError();
    if (!bucket) return { error: 'bucket required' };
    if (!query)  return { error: 'query required' };
    try {
      const listed = await R2_HANDLERS.r2_list({ bucket, prefix, limit: 1000 }, env, ctx);
      if (listed.error) return listed;
      const q       = query.toLowerCase();
      const matches = (listed.objects || []).filter(o => o.key.toLowerCase().includes(q));
      return { matches, count: matches.length };
    } catch (e) { return { error: `R2 search failed: ${e.message}` }; }
  },

  async r2_bucket_summary(params, env, ctx) {
    if (!assertSuperAdmin(ctx)) return r2AuthError();
    try {
      const buckets = await r2ListAllBuckets(env);
      const summary = [];
      for (const name of buckets) {
        try {
          const listed     = await R2_HANDLERS.r2_list({ bucket: name, limit: 1000 }, env, ctx);
          const totalBytes = (listed.objects || []).reduce((s, o) => s + (o.size || 0), 0);
          summary.push({ bucket: name, object_count: (listed.objects || []).length, total_bytes: totalBytes });
        } catch (_) { summary.push({ bucket: name, error: 'Access failed' }); }
      }
      return { buckets: summary };
    } catch (e) { return { error: `R2 bucket summary failed: ${e.message}` }; }
  },

  async get_r2_url({ bucket, key }, env, ctx) {
    if (!assertSuperAdmin(ctx)) return r2AuthError();
    if (!key) return { error: 'key required' };
    const origin = (env.IAM_ORIGIN || '').replace(/\/$/, '');
    return { url: `${origin}/api/storage/r2/serve?bucket=${encodeURIComponent(bucket || '')}&key=${encodeURIComponent(key)}` };
  },
};

// ─── Telemetry Handlers ───────────────────────────────────────────────────────

const TELEMETRY_HANDLERS = {
  async telemetry_log({ tool_name, status, error: errMsg }, env, ctx) {
    if (!env.DB) return { error: 'DB not configured' };
    try {
      await env.DB.prepare(
        `INSERT INTO mcp_tool_calls
         (id, tenant_id, session_id, tool_name, tool_category, status, error_message, invoked_at, created_at, updated_at)
         VALUES (?, 'system', ?, ?, 'builtin', ?, ?, datetime('now'), datetime('now'), datetime('now'))`
      ).bind(
        'mtc_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
        ctx?.sessionId || 'unknown',
        tool_name || 'unknown',
        status || 'completed',
        errMsg || null
      ).run();
      return { success: true };
    } catch (e) { return { error: `Telemetry log failed: ${e.message}` }; }
  },

  async telemetry_query({ tool_name, limit = 10 }, env) {
    if (!env.DB) return { error: 'DB not configured' };
    try {
      const query = tool_name && tool_name !== '*'
        ? env.DB.prepare(`SELECT id, tool_name, status, error_message, invoked_at FROM mcp_tool_calls WHERE tool_name = ? ORDER BY created_at DESC LIMIT ?`).bind(tool_name, Math.min(limit, 100))
        : env.DB.prepare(`SELECT id, tool_name, status, error_message, invoked_at FROM mcp_tool_calls ORDER BY created_at DESC LIMIT ?`).bind(Math.min(limit, 100));
      const { results } = await query.all();
      return { results: results || [] };
    } catch (e) { return { error: `Telemetry query failed: ${e.message}` }; }
  },

  async telemetry_stats(params, env) {
    if (!env.DB) return { error: 'DB not configured' };
    try {
      const { results } = await env.DB.prepare(
        `SELECT tool_name, COUNT(*) as count,
                SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as successes
         FROM mcp_tool_calls GROUP BY tool_name ORDER BY count DESC LIMIT 50`
      ).all();
      return { stats: results || [] };
    } catch (e) { return { error: `Stats failed: ${e.message}` }; }
  },
};

// ─── Time Handlers (pure computation) ────────────────────────────────────────

const TIME_HANDLERS = {
  time_now({ timezone } = {}) {
    const now = new Date();
    try {
      const local = timezone ? now.toLocaleString('en-US', { timeZone: timezone }) : now.toISOString();
      return { utc: now.toISOString(), local, unix: Math.floor(now.getTime() / 1000), timezone: timezone || 'UTC' };
    } catch (_) { return { utc: now.toISOString(), unix: Math.floor(now.getTime() / 1000) }; }
  },

  time_convert({ timestamp, from_tz, to_tz }) {
    try {
      const d   = new Date(typeof timestamp === 'number' && timestamp < 1e11 ? timestamp * 1000 : timestamp);
      const out = d.toLocaleString('en-US', { timeZone: to_tz || 'UTC' });
      return { input: String(timestamp), converted: out, timezone: to_tz || 'UTC' };
    } catch (e) { return { error: e.message }; }
  },

  time_diff({ start, end }) {
    try {
      const a   = new Date(start);
      const b   = new Date(end || Date.now());
      const ms  = Math.abs(b - a);
      const sec = Math.floor(ms / 1000);
      return { ms, seconds: sec, minutes: Math.floor(sec / 60), hours: Math.floor(sec / 3600), days: Math.floor(sec / 86400) };
    } catch (e) { return { error: e.message }; }
  },

  time_parse({ expression }) {
    try {
      const d = new Date(expression);
      if (isNaN(d.getTime())) return { error: 'Could not parse date expression' };
      return { iso: d.toISOString(), unix: Math.floor(d.getTime() / 1000) };
    } catch (e) { return { error: e.message }; }
  },
};

// ─── Reasoning ────────────────────────────────────────────────────────────────

const REASONING_HANDLERS = {
  sequential_thinking({ thought, step, total_steps, next_action } = {}) {
    return {
      acknowledged: true,
      thought:      thought || '',
      step:         step || 1,
      total_steps:  total_steps || 1,
      next_action:  next_action || 'continue',
    };
  },
};

// ─── Context / RAG Handlers ───────────────────────────────────────────────────

const CONTEXT_HANDLERS = {
  async knowledge_search({ query, top_k = 8 }, env) {
    return selfFetch(env, '/api/rag/search', 'POST', { query, top_k });
  },
  async rag_search({ query, top_k = 8 }, env) {
    return selfFetch(env, '/api/rag/search', 'POST', { query, top_k });
  },
  async context_search({ query, top_k = 8 }, env) {
    return selfFetch(env, '/api/rag/search', 'POST', { query, top_k });
  },

  async human_context_add({ key, value, importance_score = 0.7 }, env, ctx) {
    if (!env.DB) return { error: 'DB not configured' };
    const tenantId = ctx?.tenantId || 'system';
    const agentId  = ctx?.agentId  || env.AGENT_CONFIG_ID || 'default';
    await env.DB.prepare(
      `INSERT INTO agent_memory_index
       (tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at)
       VALUES (?, ?, 'human_context', ?, ?, ?, unixepoch(), unixepoch())
       ON CONFLICT(key) DO UPDATE SET
         value=excluded.value,
         importance_score=excluded.importance_score,
         updated_at=unixepoch()`
    ).bind(tenantId, agentId, key, value, importance_score).run();
    return { success: true, key };
  },

  async human_context_list({ limit = 20 } = {}, env, ctx) {
    if (!env.DB) return { error: 'DB not configured' };
    const tenantId = ctx?.tenantId || 'system';
    const { results } = await env.DB.prepare(
      `SELECT key, value, importance_score FROM agent_memory_index
       WHERE tenant_id = ? AND memory_type = 'human_context'
       ORDER BY importance_score DESC LIMIT ?`
    ).bind(tenantId, Math.min(limit, 100)).all().catch(() => ({ results: [] }));
    return { items: results || [] };
  },

  async context_chunk({ content, max_chars = 600, overlap = 80 }, env) {
    if (!content) return { error: 'content required' };
    const chunks = chunkMarkdown(String(content), max_chars, overlap);
    return { chunks, count: chunks.length };
  },

  async context_optimize({ content, target_tokens = 2000 }) {
    const chars = target_tokens * 4;
    const out   = String(content || '').slice(0, chars);
    return { content: out, original_chars: content?.length || 0, output_chars: out.length };
  },

  async context_extract_structure({ content }) {
    const headers = (content || '').match(/^#{1,3}.+$/gm) || [];
    const code    = (content || '').match(/```[\s\S]+?```/g) || [];
    return { headers, code_blocks: code.length, total_chars: (content || '').length };
  },

  async context_summarize_code({ content }) {
    const fns = (content || '').match(/(?:export\s+)?(?:async\s+)?function\s+\w+[^{]*/g) || [];
    return { signatures: fns, count: fns.length };
  },

  async context_progressive_disclosure({ content, sections = 1 }) {
    const parts = String(content || '').split(/(?=^#{1,3}\s)/m).filter(Boolean);
    return {
      content:        parts.slice(0, sections).join('\n\n'),
      total_sections: parts.length,
      shown:          Math.min(sections, parts.length),
    };
  },

  async attached_file_content() {
    return { error: 'attached_file_content requires client-side file reference — not available in agent context' };
  },
};

// ─── Platform Handlers ────────────────────────────────────────────────────────

const PLATFORM_HANDLERS = {
  async platform_info(params, env) { return selfFetch(env, '/api/overview/summary', 'GET'); },
  async list_clients(params, env)  { return selfFetch(env, '/api/clients', 'GET'); },
};

// ─── Agent Sam Handlers ───────────────────────────────────────────────────────

const AGENTSAM_HANDLERS = {
  async agentsam_list_agents(params, env) {
    if (!env.DB) return { error: 'DB not configured' };
    const { results } = await env.DB.prepare(
      `SELECT id, name, role_name, status, mode, is_global, tenant_id, context_max_tokens, output_max_tokens
       FROM agentsam_ai WHERE status = 'active' ORDER BY sort_order ASC, name ASC`
    ).all().catch(() => ({ results: [] }));
    return { agents: results || [], count: (results || []).length };
  },

  async agentsam_get_agent({ role_or_id }, env) {
    if (!env.DB)     return { error: 'DB not configured' };
    if (!role_or_id) return { error: 'role_or_id required' };
    const { results } = await env.DB.prepare(
      `SELECT id, name, role_name, status, mode, is_global, tenant_id,
              system_prompt, model_policy_json, tool_permissions_json,
              context_max_tokens, output_max_tokens, thinking_mode, effort
       FROM agentsam_ai WHERE id = ? OR role_name = ? LIMIT 1`
    ).bind(role_or_id, role_or_id).all().catch(() => ({ results: [] }));
    const agent = results?.[0];
    if (!agent) return { error: `Agent not found: ${role_or_id}` };
    return { agent };
  },

  // Workflow trigger stays proxied — action handled by agent.js workflow layer
  async agentsam_run_agent(params, env) {
    return selfFetch(env, '/api/agent/workflows/trigger', 'POST', params);
  },
};

// ─── AI Model Handlers ────────────────────────────────────────────────────────

const AI_HANDLERS = {
  // All model routing goes through /api/agent/chat — model key must be in params.model
  async ai_complete(params, env)  { return selfFetch(env, '/api/agent/chat', 'POST', { ...params, stream: false }); },
  async ai_compare(params, env)   { return selfFetch(env, '/api/agent/chat', 'POST', params); },
  async ai_chat(params, env)      { return selfFetch(env, '/api/agent/chat', 'POST', params); },

  // Embedding — model key from params.model, fallback to env.DEFAULT_EMBED_MODEL
  async ai_embed({ text, model }, env) {
    if (!env.AI) return { error: 'Workers AI binding (env.AI) not configured' };
    const modelKey  = model || env.DEFAULT_EMBED_MODEL || '@cf/baai/bge-base-en-v1.5';
    const vecs      = await embed(env, text, modelKey);
    return { embeddings: vecs };
  },
};

// ─── Auth Handlers ────────────────────────────────────────────────────────────

const AUTH_HANDLERS = {
  async workspace_token_list(params, env)         { return selfFetch(env, '/api/auth/tokens', 'GET'); },
  async workspace_token_create(params, env)       { return selfFetch(env, '/api/auth/tokens', 'POST', params); },
  async workspace_token_revoke({ token_id }, env) { return selfFetch(env, `/api/auth/tokens/${token_id}`, 'DELETE'); },
  async workspace_token_audit({ token_id }, env)  { return selfFetch(env, `/api/auth/tokens/${token_id}/audit`, 'GET'); },
};

// ─── Browser / CDT Handlers ───────────────────────────────────────────────────

function browserProxy(toolName) {
  return async (params, env) => selfFetch(env, '/api/browser/invoke', 'POST', { tool: toolName, params });
}

const BROWSER_HANDLERS = {
  web_fetch: async ({ url, method = 'GET' }) => {
    try {
      const res  = await fetch(url, { method, signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      return { status: res.status, content: text.slice(0, 50000), content_type: res.headers.get('content-type') || '' };
    } catch (e) { return { error: `web_fetch failed: ${e.message}` }; }
  },
  browser_search:                  async ({ query }, env) => selfFetch(env, '/api/browser/search', 'POST', { query }),
  browser_navigate:                browserProxy('browser_navigate'),
  browser_screenshot:              browserProxy('browser_screenshot'),
  browser_content:                 browserProxy('browser_content'),
  browser_scrape:                  browserProxy('browser_scrape'),
  browser_pdf:                     browserProxy('browser_pdf'),
  browser_render_to_image:         browserProxy('browser_render_to_image'),
  preview_in_browser:              browserProxy('preview_in_browser'),
  social_card_generate:            browserProxy('social_card_generate'),
  playwright_screenshot:           browserProxy('playwright_screenshot'),
  playwright_job_create:           async (params, env) => selfFetch(env, '/api/playwright/jobs', 'POST', params),
  playwright_job_list:             async (params, env) => selfFetch(env, '/api/playwright/jobs', 'GET'),
  playwright_job_poll:             async ({ job_id }, env) => selfFetch(env, `/api/playwright/jobs/${job_id}`, 'GET'),
  cdt_navigate_page:               browserProxy('cdt_navigate_page'),
  cdt_take_screenshot:             browserProxy('cdt_take_screenshot'),
  cdt_click:                       browserProxy('cdt_click'),
  cdt_fill:                        browserProxy('cdt_fill'),
  cdt_fill_form:                   browserProxy('cdt_fill_form'),
  cdt_evaluate_script:             browserProxy('cdt_evaluate_script'),
  cdt_list_pages:                  browserProxy('cdt_list_pages'),
  cdt_new_page:                    browserProxy('cdt_new_page'),
  cdt_close_page:                  browserProxy('cdt_close_page'),
  cdt_select_page:                 browserProxy('cdt_select_page'),
  cdt_wait_for:                    browserProxy('cdt_wait_for'),
  cdt_take_snapshot:               browserProxy('cdt_take_snapshot'),
  cdt_hover:                       browserProxy('cdt_hover'),
  cdt_drag:                        browserProxy('cdt_drag'),
  cdt_press_key:                   browserProxy('cdt_press_key'),
  cdt_upload_file:                 browserProxy('cdt_upload_file'),
  cdt_handle_dialog:               browserProxy('cdt_handle_dialog'),
  cdt_emulate:                     browserProxy('cdt_emulate'),
  cdt_resize_page:                 browserProxy('cdt_resize_page'),
  cdt_get_console_message:         browserProxy('cdt_get_console_message'),
  cdt_list_console_messages:       browserProxy('cdt_list_console_messages'),
  cdt_get_network_request:         browserProxy('cdt_get_network_request'),
  cdt_list_network_requests:       browserProxy('cdt_list_network_requests'),
  cdt_performance_start_trace:     browserProxy('cdt_performance_start_trace'),
  cdt_performance_stop_trace:      browserProxy('cdt_performance_stop_trace'),
  cdt_performance_analyze_insight: browserProxy('cdt_performance_analyze_insight'),
  a11y_audit_webpage:              browserProxy('a11y_audit_webpage'),
  a11y_get_summary:                browserProxy('a11y_get_summary'),
};

// ─── Filesystem Handlers ──────────────────────────────────────────────────────

function fsProxy(endpoint) {
  return async (params, env) => selfFetch(env, endpoint, 'POST', params);
}

const FILESYSTEM_HANDLERS = {
  fs_read_file:             fsProxy('/api/fs/read'),
  fs_read_multiple:         fsProxy('/api/fs/read-multiple'),
  fs_read_media:            fsProxy('/api/fs/read-media'),
  fs_write_file:            fsProxy('/api/fs/write'),
  fs_edit_file:             fsProxy('/api/fs/edit'),
  fs_move_file:             fsProxy('/api/fs/move'),
  fs_create_directory:      fsProxy('/api/fs/mkdir'),
  fs_list_directory:        fsProxy('/api/fs/list'),
  fs_list_directory_sizes:  fsProxy('/api/fs/list-sizes'),
  fs_directory_tree:        fsProxy('/api/fs/tree'),
  fs_search_files:          fsProxy('/api/fs/search'),
  fs_get_file_info:         fsProxy('/api/fs/info'),
  fs_list_allowed_dirs:     async (params, env) => selfFetch(env, '/api/fs/allowed-dirs', 'GET'),
  workspace_list_files:     async (params, env) => selfFetch(env, '/api/fs/list', 'POST', { ...params, recursive: false }),
  workspace_read_file:      fsProxy('/api/fs/read'),
  workspace_search:         fsProxy('/api/fs/search'),
};

// ─── GitHub Handlers ──────────────────────────────────────────────────────────

const GITHUB_HANDLERS = {
  github_repos:             async (p, env) => selfFetch(env, '/api/github/repos', 'GET'),
  github_file:              async ({ owner, repo, path, ref }, env) => selfFetch(env, `/api/github/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ''}`, 'GET'),
  github_get_file:          async ({ owner, repo, path, ref }, env) => selfFetch(env, `/api/github/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ''}`, 'GET'),
  github_list_branches:     async ({ owner, repo }, env) => selfFetch(env, `/api/github/repos/${owner}/${repo}/branches`, 'GET'),
  github_list_issues:       async ({ owner, repo }, env) => selfFetch(env, `https://api.github.com/repos/${owner}/${repo}/issues`, 'GET'),
  github_get_issue:         async ({ owner, repo, issue_number }, env) => selfFetch(env, `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`, 'GET'),
  github_list_prs:          async ({ owner, repo }, env) => selfFetch(env, `https://api.github.com/repos/${owner}/${repo}/pulls`, 'GET'),
  github_create_branch:     async (p, env) => selfFetch(env, `/api/github/repos/${p.owner}/${p.repo}/git/refs`, 'POST', p),
  github_create_file:       async (p, env) => selfFetch(env, `/api/github/repos/${p.owner}/${p.repo}/contents`, 'POST', p),
  github_update_file:       async (p, env) => selfFetch(env, `/api/github/repos/${p.owner}/${p.repo}/contents`, 'POST', p),
  github_delete_file:       async (p, env) => selfFetch(env, `/api/github/repos/${p.owner}/${p.repo}/contents/${p.path}`, 'DELETE'),
  github_create_pr:         async (p, env) => selfFetch(env, `https://api.github.com/repos/${p.owner}/${p.repo}/pulls`, 'POST', p),
  github_merge_pr:          async (p, env) => selfFetch(env, `https://api.github.com/repos/${p.owner}/${p.repo}/pulls/${p.pull_number}/merge`, 'PUT', p),
  github_create_issue:      async (p, env) => selfFetch(env, `https://api.github.com/repos/${p.owner}/${p.repo}/issues`, 'POST', p),
  github_close_issue:       async (p, env) => selfFetch(env, `https://api.github.com/repos/${p.owner}/${p.repo}/issues/${p.issue_number}`, 'PATCH', { state: 'closed' }),
  github_search_code:       async ({ query }, env) => selfFetch(env, `https://api.github.com/search/code?q=${encodeURIComponent(query)}`, 'GET'),
  github_get_actions:       async ({ owner, repo }, env) => selfFetch(env, `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=10`, 'GET'),
  github_get_commits:       async ({ owner, repo, branch = 'main' }, env) => selfFetch(env, `/api/github/repos/${owner}/${repo}/commits?sha=${branch}`, 'GET'),
  github_list_deploy_keys:  async ({ owner, repo }, env) => selfFetch(env, `https://api.github.com/repos/${owner}/${repo}/keys`, 'GET'),
  github_add_deploy_key:    async (p, env) => selfFetch(env, `https://api.github.com/repos/${p.owner}/${p.repo}/keys`, 'POST', p),
  github_delete_deploy_key: async (p, env) => selfFetch(env, `https://api.github.com/repos/${p.owner}/${p.repo}/keys/${p.key_id}`, 'DELETE'),
};

// ─── Email Handlers ───────────────────────────────────────────────────────────

const EMAIL_HANDLERS = {
  resend_send_email:     async (p, env) => selfFetch(env, '/api/resend/send', 'POST', p),
  resend_send_broadcast: async (p, env) => selfFetch(env, '/api/resend/broadcast', 'POST', p),
  resend_list_domains:   async (p, env) => selfFetch(env, '/api/resend/domains', 'GET'),
  resend_create_api_key: async (p, env) => selfFetch(env, '/api/resend/api-keys', 'POST', p),
  send_email:            async (p, env) => selfFetch(env, '/api/resend/send', 'POST', p),
};

// ─── Media Handlers ───────────────────────────────────────────────────────────

const MEDIA_HANDLERS = {
  imgx_generate_image:     async (p, env) => selfFetch(env, '/api/images/generate', 'POST', p),
  imgx_edit_image:         async (p, env) => selfFetch(env, '/api/images/edit', 'POST', p),
  imgx_list_providers:     async () => ({ providers: ['openai', 'google', 'workers_ai'] }),
  meshyai_text_to_3d:      async (p, env) => selfFetch(env, '/api/meshy/text-to-3d', 'POST', p),
  meshyai_image_to_3d:     async (p, env) => selfFetch(env, '/api/meshy/image-to-3d', 'POST', p),
  meshyai_get_task:        async ({ id }, env) => selfFetch(env, `/api/meshy/task?id=${id}`, 'GET'),
  voxel_generate_scene:    async (p, env) => selfFetch(env, '/api/voxel/generate', 'POST', p),
  voxel_spawn_model:       async (p, env) => selfFetch(env, '/api/voxel/spawn', 'POST', p),
  excalidraw_open:         async () => ({ ok: true, message: 'Canvas activated in main panel' }),
  excalidraw_clear:        async (p, env) => selfFetch(env, '/api/draw/elements', 'POST', { ...p, elements: [] }),
  excalidraw_add_elements: async (p, env) => selfFetch(env, '/api/draw/elements', 'POST', p),
  excalidraw_export:       async (p, env) => selfFetch(env, '/api/draw/export', 'POST', p),
  excalidraw_load_library: async (p, env) => selfFetch(env, '/api/draw/libraries', 'GET'),
  cf_images_list:          async (p, env) => selfFetch(env, '/api/integrations/cf-images/list', 'GET'),
  cf_images_upload:        async (p, env) => selfFetch(env, '/api/integrations/cf-images/upload', 'POST', p),
  cf_images_delete:        async ({ image_id }, env) => selfFetch(env, `/api/integrations/cf-images/${image_id}`, 'DELETE'),
  gdrive_list:             async (p, env) => selfFetch(env, '/api/integrations/gdrive/list', 'GET'),
  gdrive_fetch:            async ({ file_id }, env) => selfFetch(env, `/api/integrations/gdrive/${file_id}`, 'GET'),
};

// ─── Deploy Handlers ──────────────────────────────────────────────────────────

const DEPLOY_HANDLERS = {
  get_deploy_command:    async (p, env) => selfFetch(env, '/api/deployments/recent?limit=1', 'GET'),
  get_worker_services:   async (p, env) => selfFetch(env, '/api/deployments/tracking', 'GET'),
  list_workers:          async (p, env) => selfFetch(env, '/api/deployments/tracking', 'GET'),
  worker_deploy:         async (p, env) => selfFetch(env, '/api/internal/record-deploy', 'POST', p),
  workflow_run_pipeline: async (p, env) => selfFetch(env, '/api/agent/workflows/trigger', 'POST', p),
};

// ─── Terminal Handlers ────────────────────────────────────────────────────────

const TERMINAL_HANDLERS = {
  terminal_execute: async ({ command, timeout_ms = 30000 }, env, ctx) => {
    return selfFetch(env, '/api/terminal/execute', 'POST', {
      command,
      timeout_ms,
      session_id: ctx?.sessionId || null,
    });
  },
};

// ─── Workflow Handlers ────────────────────────────────────────────────────────

const WORKFLOW_HANDLERS = {
  generate_daily_summary_email: async (p, env) => selfFetch(env, '/api/workflow/summary', 'POST', p),
  generate_execution_plan:      async (p, env) => selfFetch(env, '/api/workflow/plan', 'POST', p),
};

// ─── Shinshu CMS Handlers ────────────────────────────────────────────────────

const SHINSHU_HANDLERS = {
  shinshu_proxy:          async (p, env) => selfFetch(env, '/api/shinshu/proxy', 'POST', p),
  ss_list_pages:          async (p, env) => selfFetch(env, '/api/shinshu/pages', 'GET'),
  ss_get_page:            async ({ page_id }, env) => selfFetch(env, `/api/shinshu/pages/${page_id}`, 'GET'),
  ss_update_page_meta:    async (p, env) => selfFetch(env, `/api/shinshu/pages/${p.page_id}/meta`, 'PATCH', p),
  ss_list_content:        async (p, env) => selfFetch(env, '/api/shinshu/content', 'GET'),
  ss_update_content:      async (p, env) => selfFetch(env, `/api/shinshu/content/${p.content_id}`, 'PATCH', p),
  ss_bulk_update_content: async (p, env) => selfFetch(env, '/api/shinshu/content/bulk', 'POST', p),
  ss_list_site_pages:     async (p, env) => selfFetch(env, '/api/shinshu/nav', 'GET'),
  ss_update_site_page:    async (p, env) => selfFetch(env, `/api/shinshu/nav/${p.page_id}`, 'PATCH', p),
  ss_get_settings:        async (p, env) => selfFetch(env, '/api/shinshu/settings', 'GET'),
  ss_update_setting:      async (p, env) => selfFetch(env, '/api/shinshu/settings', 'PATCH', p),
  ss_search_knowledge:    async (p, env) => selfFetch(env, '/api/shinshu/knowledge/search', 'POST', p),
  ss_add_knowledge:       async (p, env) => selfFetch(env, '/api/shinshu/knowledge', 'POST', p),
  ss_schema_inspect:      async (p, env) => selfFetch(env, '/api/shinshu/schema', 'GET'),
  ss_list_r2_assets:      async (p, env) => selfFetch(env, '/api/shinshu/media', 'GET'),
};

// ─── File Conversion ──────────────────────────────────────────────────────────

const CONVERSION_HANDLERS = {
  cloudconvert_create_job: async (p, env) => selfFetch(env, '/api/integrations/cloudconvert/jobs', 'POST', p),
  cloudconvert_get_job:    async ({ job_id }, env) => selfFetch(env, `/api/integrations/cloudconvert/jobs/${job_id}`, 'GET'),
};

// ─── Complete Handler Registry ────────────────────────────────────────────────

const ALL_HANDLERS = {
  ...DB_HANDLERS,
  ...R2_HANDLERS,
  ...TELEMETRY_HANDLERS,
  ...TIME_HANDLERS,
  ...REASONING_HANDLERS,
  ...CONTEXT_HANDLERS,
  ...PLATFORM_HANDLERS,
  ...AGENTSAM_HANDLERS,
  ...AI_HANDLERS,
  ...AUTH_HANDLERS,
  ...BROWSER_HANDLERS,
  ...FILESYSTEM_HANDLERS,
  ...GITHUB_HANDLERS,
  ...EMAIL_HANDLERS,
  ...MEDIA_HANDLERS,
  ...DEPLOY_HANDLERS,
  ...TERMINAL_HANDLERS,
  ...WORKFLOW_HANDLERS,
  ...SHINSHU_HANDLERS,
  ...CONVERSION_HANDLERS,
};

// ─── Primary Export ───────────────────────────────────────────────────────────

/**
 * Dispatch a tool call by name with the given arguments.
 * Called by src/api/agent.js → runAgentToolLoop after validateToolCall() passes.
 *
 * @param {object} env
 * @param {string} toolName
 * @param {object} args     - tool input arguments from model
 * @param {object} context  - { sessionId, tenantId, userId, agentId, role }
 * @returns {Promise<any>}
 */
export async function dispatchToolCall(env, toolName, args = {}, context = {}) {
  // ── CDT / Puppeteer tools ─────────────────────────────────────────────────
  if (toolName.startsWith('cdt_')) {
    if (typeof handlers?.puppeteer?.[toolName] !== 'function') {
      return JSON.stringify({ ok: false, error: `CDT tool not implemented: ${toolName}` });
    }
    try {
      const result = await handlers.puppeteer[toolName](args, env);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (e) {
      return JSON.stringify({ ok: false, error: e.message, tool: toolName });
    }
  }

  const handler = ALL_HANDLERS[toolName];
  if (!handler) {
    return { error: `Tool not implemented: ${toolName}. Check mcp_registered_tools.handler_type.` };
  }
  try {
    return await handler(args, env, context);
  } catch (e) {
    return { error: `Tool execution error (${toolName}): ${e.message}` };
  }
}

/**
 * List all implemented tool names.
 * Used for health checks and capability audits only.
 * NOT used to build LLM tool definitions — that is handled in agent.js
 * via intent-filtered queries against agent_intent_patterns and agentsam_skill.
 */
export function listImplementedTools() {
  return Object.keys(ALL_HANDLERS);
}
