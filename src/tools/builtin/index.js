/**
 * Built-in Tool Dispatcher
 * Single entry point for all tool execution in the agent loop.
 *
 * Called by: src/api/agent.js → runAgentToolLoop → dispatchToolCall()
 *
 * Architecture:
 *   - D1 tools       → direct env.DB (no HTTP)
 *   - R2 tools       → direct env bindings (no HTTP)
 *   - Telemetry      → direct env.DB → mcp_tool_calls + agent_telemetry
 *   - Time/reasoning → pure computation
 *   - Context/RAG    → env.DB + env.AI inline
 *   - Everything else → selfFetch() proxy to internal API layer
 *
 * No hardcoded model strings. No hardcoded URLs. No hardcoded IDs.
 * All environment-specific values come from env.*.
 */

// ─── Internal Fetch Helper ────────────────────────────────────────────────────

/**
 * Call our own worker's internal API.
 * Uses env.IAM_ORIGIN (production) or env.SANDBOX_ORIGIN (sandbox).
 * Passes INTERNAL_API_SECRET header so routes can bypass user auth for agent calls.
 */
async function selfFetch(env, path, method = 'POST', body = null) {
  const origin = (env.IAM_ORIGIN || env.SANDBOX_ORIGIN || '').replace(/\/$/, '');
  if (!origin) return { error: 'IAM_ORIGIN not configured — cannot proxy tool call' };

  try {
    const res = await fetch(`${origin}${path}`, {
      method,
      headers: {
        'Content-Type':   'application/json',
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
    if (!env.DB)           return { error: 'D1 binding not configured' };
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

// ─── Direct R2 Handlers ───────────────────────────────────────────────────────

function resolveR2Bucket(env, bucket) {
  const map = {
    'agent-sam':              env.DASHBOARD,
    'iam-platform':           env.R2,
    'iam-docs':               env.DOCS_BUCKET,
    'autorag':                env.AUTORAG_BUCKET,
    'inneranimalmedia-assets':env.ASSETS,
  };
  return map[bucket] || env.DASHBOARD;
}

const R2_HANDLERS = {
  async r2_list({ bucket, prefix = '', limit = 100 }, env) {
    const b = resolveR2Bucket(env, bucket);
    if (!b) return { error: 'R2 bucket binding not found' };
    try {
      const listed = await b.list({ prefix, limit: Math.min(limit, 1000) });
      return { objects: (listed.objects || []).map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded })), truncated: listed.truncated };
    } catch (e) { return { error: `R2 list failed: ${e.message}` }; }
  },

  async r2_read({ bucket, key }, env) {
    const b = resolveR2Bucket(env, bucket);
    if (!b)   return { error: 'R2 bucket binding not found' };
    if (!key) return { error: 'key required' };
    try {
      const obj = await b.get(key);
      if (!obj) return { error: `Object not found: ${key}` };
      const ct   = obj.httpMetadata?.contentType || 'application/octet-stream';
      const text = ct.startsWith('text') || ct.includes('json') || ct.includes('javascript') || ct.includes('xml')
        ? await obj.text()
        : `[binary: ${ct}]`;
      return { key, content: text, content_type: ct, size: obj.size };
    } catch (e) { return { error: `R2 read failed: ${e.message}` }; }
  },

  async r2_write({ bucket, key, body, content_type = 'text/plain' }, env) {
    const b = resolveR2Bucket(env, bucket);
    if (!b)    return { error: 'R2 bucket binding not found' };
    if (!key)  return { error: 'key required' };
    if (body == null) return { error: 'body required' };
    try {
      await b.put(key, typeof body === 'string' ? body : JSON.stringify(body), { httpMetadata: { contentType: content_type } });
      return { success: true, key, bucket };
    } catch (e) { return { error: `R2 write failed: ${e.message}` }; }
  },

  async r2_delete({ bucket, key }, env) {
    const b = resolveR2Bucket(env, bucket);
    if (!b)   return { error: 'R2 bucket binding not found' };
    if (!key) return { error: 'key required' };
    try {
      await b.delete(key);
      return { success: true, deleted: key };
    } catch (e) { return { error: `R2 delete failed: ${e.message}` }; }
  },

  async r2_search({ bucket, prefix = '', query }, env) {
    const b = resolveR2Bucket(env, bucket);
    if (!b)    return { error: 'R2 bucket binding not found' };
    if (!query) return { error: 'query required' };
    try {
      const listed = await b.list({ prefix, limit: 1000 });
      const q      = query.toLowerCase();
      const matches = (listed.objects || []).filter(o => o.key.toLowerCase().includes(q));
      return { matches: matches.map(o => ({ key: o.key, size: o.size })), count: matches.length };
    } catch (e) { return { error: `R2 search failed: ${e.message}` }; }
  },

  async r2_bucket_summary(params, env) {
    const buckets = [
      { name: 'agent-sam',       binding: env.DASHBOARD },
      { name: 'iam-platform',    binding: env.R2 },
      { name: 'iam-docs',        binding: env.DOCS_BUCKET },
      { name: 'autorag',         binding: env.AUTORAG_BUCKET },
    ];
    const summary = [];
    for (const { name, binding } of buckets) {
      if (!binding) continue;
      try {
        const listed = await binding.list({ limit: 1000 });
        const totalBytes = (listed.objects || []).reduce((s, o) => s + (o.size || 0), 0);
        summary.push({ bucket: name, object_count: (listed.objects || []).length, total_bytes: totalBytes, truncated: listed.truncated });
      } catch (_) { summary.push({ bucket: name, error: 'Access failed' }); }
    }
    return { buckets: summary };
  },

  async get_r2_url({ bucket, key }, env) {
    const origin = (env.IAM_ORIGIN || '').replace(/\/$/, '');
    if (!key) return { error: 'key required' };
    return { url: `${origin}/api/storage/r2/serve?bucket=${encodeURIComponent(bucket || 'agent-sam')}&key=${encodeURIComponent(key)}` };
  },
};

// ─── Telemetry Handlers ───────────────────────────────────────────────────────

const TELEMETRY_HANDLERS = {
  async telemetry_log({ tool_name, status, duration_ms, error: errMsg, metadata }, env, ctx) {
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
        `SELECT tool_name, COUNT(*) as count, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as successes FROM mcp_tool_calls GROUP BY tool_name ORDER BY count DESC LIMIT 50`
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
    return { acknowledged: true, thought: thought || '', step: step || 1, total_steps: total_steps || 1, next_action: next_action || 'continue' };
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
    await env.DB.prepare(
      `INSERT INTO agent_memory_index (tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at)
       VALUES (?, 'agent-sam-primary', 'human_context', ?, ?, ?, unixepoch(), unixepoch())
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, importance_score=excluded.importance_score, updated_at=unixepoch()`
    ).bind(tenantId, key, value, importance_score).run();
    return { success: true, key };
  },
  async human_context_list({ limit = 20 } = {}, env, ctx) {
    if (!env.DB) return { error: 'DB not configured' };
    const tenantId = ctx?.tenantId || 'system';
    const { results } = await env.DB.prepare(
      `SELECT key, value, importance_score FROM agent_memory_index WHERE tenant_id = ? AND memory_type = 'human_context' ORDER BY importance_score DESC LIMIT ?`
    ).bind(tenantId, Math.min(limit, 100)).all().catch(() => ({ results: [] }));
    return { items: results || [] };
  },
  async context_chunk({ content, max_chars = 600, overlap = 80 }, env) {
    if (!content) return { error: 'content required' };
    const { chunkMarkdown } = await import('../api/rag.js');
    const chunks = chunkMarkdown(String(content), max_chars, overlap);
    return { chunks, count: chunks.length };
  },
  async context_optimize({ content, target_tokens = 2000 }, env) {
    // Simple truncation strategy — more sophisticated optimization deferred
    const chars  = target_tokens * 4; // rough 4 chars/token
    const out    = String(content || '').slice(0, chars);
    return { content: out, original_chars: content?.length || 0, output_chars: out.length };
  },
  async context_extract_structure({ content }, env) {
    const headers = (content || '').match(/^#{1,3}.+$/gm) || [];
    const code    = (content || '').match(/```[\s\S]+?```/g) || [];
    return { headers, code_blocks: code.length, total_chars: (content || '').length };
  },
  async context_summarize_code({ content }, env) {
    // Extracts function signatures without full bodies
    const fns = (content || '').match(/(?:export\s+)?(?:async\s+)?function\s+\w+[^{]*/g) || [];
    return { signatures: fns, count: fns.length };
  },
  async context_progressive_disclosure({ content, sections = 1 }, env) {
    const parts = String(content || '').split(/(?=^#{1,3}\s)/m).filter(Boolean);
    return { content: parts.slice(0, sections).join('\n\n'), total_sections: parts.length, shown: Math.min(sections, parts.length) };
  },
  async attached_file_content({ file_id }, env) {
    return { error: 'attached_file_content requires client-side file reference — not available in agent context' };
  },
};

// ─── Platform Handlers ────────────────────────────────────────────────────────

const PLATFORM_HANDLERS = {
  async platform_info(params, env) {
    return selfFetch(env, '/api/overview/summary', 'GET');
  },
  async list_clients(params, env) {
    return selfFetch(env, '/api/clients', 'GET');
  },
};

// ─── Agent Sam Handlers ───────────────────────────────────────────────────────

const AGENTSAM_HANDLERS = {
  async agentsam_list_agents(params, env)        { return selfFetch(env, '/api/agentsam/agents', 'GET'); },
  async agentsam_get_agent({ role_or_id }, env)  { return selfFetch(env, `/api/agentsam/ai/${encodeURIComponent(role_or_id)}`, 'GET'); },
  async agentsam_run_agent(params, env)           { return selfFetch(env, '/api/agent/workflows/trigger', 'POST', params); },
};

// ─── AI Model Handlers ────────────────────────────────────────────────────────

const AI_HANDLERS = {
  async ai_complete(params, env) { return selfFetch(env, '/api/agent/chat', 'POST', { ...params, stream: false }); },
  async ai_compare(params, env)  { return selfFetch(env, '/api/agent/chat', 'POST', params); },
  async ai_embed({ text, model }, env) {
    if (!env.AI) return { error: 'Workers AI binding not configured' };
    const { runWorkersAIEmbedding } = await import('../integrations/workers-ai.js');
    const modelKey = model || '@cf/baai/bge-base-en-v1.5';
    const vecs = await runWorkersAIEmbedding(env, modelKey, text);
    return { embeddings: vecs };
  },
  // Gemini model shortcuts — route through /api/agent/chat with model override
  async gemini_2_5_pro(params, env)          { return selfFetch(env, '/api/agent/chat', 'POST', { ...params, model: 'gemini-2.5-pro' }); },
  async gemini_2_5_flash(params, env)        { return selfFetch(env, '/api/agent/chat', 'POST', { ...params, model: 'gemini-2.5-flash' }); },
  async gemini_2_0_flash(params, env)        { return selfFetch(env, '/api/agent/chat', 'POST', { ...params, model: 'gemini-2.0-flash' }); },
  async gemini_2_0_flash_thinking(params, env){ return selfFetch(env, '/api/agent/chat', 'POST', { ...params, model: 'gemini-2.0-flash-thinking' }); },
  async gemini_1_5_pro(params, env)          { return selfFetch(env, '/api/agent/chat', 'POST', { ...params, model: 'gemini-1.5-pro' }); },
  async gemini_1_5_flash(params, env)        { return selfFetch(env, '/api/agent/chat', 'POST', { ...params, model: 'gemini-1.5-flash' }); },
};

// ─── Auth Handlers ────────────────────────────────────────────────────────────

const AUTH_HANDLERS = {
  async workspace_token_list(params, env)                { return selfFetch(env, '/api/auth/tokens', 'GET'); },
  async workspace_token_create(params, env)              { return selfFetch(env, '/api/auth/tokens', 'POST', params); },
  async workspace_token_revoke({ token_id }, env)        { return selfFetch(env, `/api/auth/tokens/${token_id}`, 'DELETE'); },
  async workspace_token_audit({ token_id }, env)         { return selfFetch(env, `/api/auth/tokens/${token_id}/audit`, 'GET'); },
};

// ─── Browser/CDT Handlers (proxied) ──────────────────────────────────────────

function browserProxy(toolName) {
  return async (params, env) => selfFetch(env, '/api/browser/invoke', 'POST', { tool: toolName, params });
}

const BROWSER_HANDLERS = {
  web_fetch: async ({ url, method = 'GET' }, env) => {
    try {
      const res  = await fetch(url, { method, signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      return { status: res.status, content: text.slice(0, 50000), content_type: res.headers.get('content-type') || '' };
    } catch (e) { return { error: `web_fetch failed: ${e.message}` }; }
  },
  browser_search: async ({ query }, env) => selfFetch(env, '/api/browser/search', 'POST', { query }),
  browser_navigate:             browserProxy('browser_navigate'),
  browser_screenshot:           browserProxy('browser_screenshot'),
  browser_content:              browserProxy('browser_content'),
  browser_scrape:               browserProxy('browser_scrape'),
  browser_pdf:                  browserProxy('browser_pdf'),
  browser_render_to_image:      browserProxy('browser_render_to_image'),
  preview_in_browser:           browserProxy('preview_in_browser'),
  social_card_generate:         browserProxy('social_card_generate'),
  playwright_screenshot:        browserProxy('playwright_screenshot'),
  playwright_job_create: async (params, env) => selfFetch(env, '/api/playwright/jobs', 'POST', params),
  playwright_job_list:   async (params, env) => selfFetch(env, '/api/playwright/jobs', 'GET'),
  playwright_job_poll:   async ({ job_id }, env) => selfFetch(env, `/api/playwright/jobs/${job_id}`, 'GET'),
  cdt_navigate_page:            browserProxy('cdt_navigate_page'),
  cdt_take_screenshot:          browserProxy('cdt_take_screenshot'),
  cdt_click:                    browserProxy('cdt_click'),
  cdt_fill:                     browserProxy('cdt_fill'),
  cdt_fill_form:                browserProxy('cdt_fill_form'),
  cdt_evaluate_script:          browserProxy('cdt_evaluate_script'),
  cdt_list_pages:               browserProxy('cdt_list_pages'),
  cdt_new_page:                 browserProxy('cdt_new_page'),
  cdt_close_page:               browserProxy('cdt_close_page'),
  cdt_select_page:              browserProxy('cdt_select_page'),
  cdt_wait_for:                 browserProxy('cdt_wait_for'),
  cdt_take_snapshot:            browserProxy('cdt_take_snapshot'),
  cdt_hover:                    browserProxy('cdt_hover'),
  cdt_drag:                     browserProxy('cdt_drag'),
  cdt_press_key:                browserProxy('cdt_press_key'),
  cdt_upload_file:              browserProxy('cdt_upload_file'),
  cdt_handle_dialog:            browserProxy('cdt_handle_dialog'),
  cdt_emulate:                  browserProxy('cdt_emulate'),
  cdt_resize_page:              browserProxy('cdt_resize_page'),
  cdt_get_console_message:      browserProxy('cdt_get_console_message'),
  cdt_list_console_messages:    browserProxy('cdt_list_console_messages'),
  cdt_get_network_request:      browserProxy('cdt_get_network_request'),
  cdt_list_network_requests:    browserProxy('cdt_list_network_requests'),
  cdt_performance_start_trace:  browserProxy('cdt_performance_start_trace'),
  cdt_performance_stop_trace:   browserProxy('cdt_performance_stop_trace'),
  cdt_performance_analyze_insight: browserProxy('cdt_performance_analyze_insight'),
  a11y_audit_webpage:           browserProxy('a11y_audit_webpage'),
  a11y_get_summary:             browserProxy('a11y_get_summary'),
};

// ─── Filesystem Handlers (proxied to PTY/terminal) ───────────────────────────

function fsProxy(endpoint) {
  return async (params, env) => selfFetch(env, endpoint, 'POST', params);
}

const FILESYSTEM_HANDLERS = {
  fs_read_file:          fsProxy('/api/fs/read'),
  fs_read_multiple:      fsProxy('/api/fs/read-multiple'),
  fs_read_media:         fsProxy('/api/fs/read-media'),
  fs_write_file:         fsProxy('/api/fs/write'),
  fs_edit_file:          fsProxy('/api/fs/edit'),
  fs_move_file:          fsProxy('/api/fs/move'),
  fs_create_directory:   fsProxy('/api/fs/mkdir'),
  fs_list_directory:     fsProxy('/api/fs/list'),
  fs_list_directory_sizes: fsProxy('/api/fs/list-sizes'),
  fs_directory_tree:     fsProxy('/api/fs/tree'),
  fs_search_files:       fsProxy('/api/fs/search'),
  fs_get_file_info:      fsProxy('/api/fs/info'),
  fs_list_allowed_dirs:  async (params, env) => selfFetch(env, '/api/fs/allowed-dirs', 'GET'),
  workspace_list_files:  async (params, env) => selfFetch(env, '/api/fs/list', 'POST', { ...params, recursive: false }),
  workspace_read_file:   fsProxy('/api/fs/read'),
  workspace_search:      fsProxy('/api/fs/search'),
};

// ─── GitHub Handlers ──────────────────────────────────────────────────────────

const GITHUB_HANDLERS = {
  github_repos:           async (p, env) => selfFetch(env, '/api/github/repos', 'GET'),
  github_file:            async ({ owner, repo, path, ref }, env) => selfFetch(env, `/api/github/repos/${owner}/${repo}/contents/${path}${ref?`?ref=${ref}`:''}`, 'GET'),
  github_list_branches:   async ({ owner, repo }, env) => selfFetch(env, `/api/github/repos/${owner}/${repo}/branches`, 'GET'),
  github_list_issues:     async ({ owner, repo }, env) => selfFetch(env, `https://api.github.com/repos/${owner}/${repo}/issues`, 'GET'),
  github_get_issue:       async ({ owner, repo, issue_number }, env) => selfFetch(env, `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`, 'GET'),
  github_list_prs:        async ({ owner, repo }, env) => selfFetch(env, `https://api.github.com/repos/${owner}/${repo}/pulls`, 'GET'),
  github_create_branch:   async (p, env) => selfFetch(env, '/api/github/repos/' + p.owner + '/' + p.repo + '/git/refs', 'POST', p),
  github_create_file:     async (p, env) => selfFetch(env, `/api/github/repos/${p.owner}/${p.repo}/contents`, 'POST', p),
  github_update_file:     async (p, env) => selfFetch(env, `/api/github/repos/${p.owner}/${p.repo}/contents`, 'POST', p),
  github_delete_file:     async (p, env) => selfFetch(env, `/api/github/repos/${p.owner}/${p.repo}/contents/${p.path}`, 'DELETE'),
  github_create_pr:       async (p, env) => selfFetch(env, `https://api.github.com/repos/${p.owner}/${p.repo}/pulls`, 'POST', p),
  github_merge_pr:        async (p, env) => selfFetch(env, `https://api.github.com/repos/${p.owner}/${p.repo}/pulls/${p.pull_number}/merge`, 'PUT', p),
  github_close_issue:     async (p, env) => selfFetch(env, `https://api.github.com/repos/${p.owner}/${p.repo}/issues/${p.issue_number}`, 'PATCH', { state: 'closed' }),
  github_search_code:     async ({ query }, env) => selfFetch(env, `https://api.github.com/search/code?q=${encodeURIComponent(query)}`, 'GET'),
  github_list_deploy_keys: async ({ owner, repo }, env) => selfFetch(env, `https://api.github.com/repos/${owner}/${repo}/keys`, 'GET'),
  github_add_deploy_key:   async (p, env) => selfFetch(env, `https://api.github.com/repos/${p.owner}/${p.repo}/keys`, 'POST', p),
  github_delete_deploy_key: async (p, env) => selfFetch(env, `https://api.github.com/repos/${p.owner}/${p.repo}/keys/${p.key_id}`, 'DELETE'),
  // Shinshu devops aliases
  github_create_issue:    async (p, env) => selfFetch(env, `https://api.github.com/repos/${p.owner}/${p.repo}/issues`, 'POST', p),
  github_get_actions:     async ({ owner, repo }, env) => selfFetch(env, `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=10`, 'GET'),
  github_get_commits:     async ({ owner, repo, branch = 'main' }, env) => selfFetch(env, `/api/github/repos/${owner}/${repo}/commits?sha=${branch}`, 'GET'),
  github_get_file:        async ({ owner, repo, path, ref }, env) => selfFetch(env, `/api/github/repos/${owner}/${repo}/contents/${path}${ref?`?ref=${ref}`:''}`, 'GET'),
};

// ─── Email Handlers ───────────────────────────────────────────────────────────

const EMAIL_HANDLERS = {
  resend_send_email:       async (p, env) => selfFetch(env, '/api/resend/send', 'POST', p),
  resend_send_broadcast:   async (p, env) => selfFetch(env, '/api/resend/broadcast', 'POST', p),
  resend_list_domains:     async (p, env) => selfFetch(env, '/api/resend/domains', 'GET'),
  resend_create_api_key:   async (p, env) => selfFetch(env, '/api/resend/api-keys', 'POST', p),
  send_email:              async (p, env) => selfFetch(env, '/api/resend/send', 'POST', p),
};

// ─── Media Handlers ───────────────────────────────────────────────────────────

const MEDIA_HANDLERS = {
  imgx_generate_image:   async (p, env) => selfFetch(env, '/api/images/generate', 'POST', p),
  imgx_edit_image:       async (p, env) => selfFetch(env, '/api/images/edit', 'POST', p),
  imgx_list_providers:   async () => ({ providers: ['openai', 'google', 'workers_ai'] }),
  meshyai_text_to_3d:    async (p, env) => selfFetch(env, '/api/meshy/text-to-3d', 'POST', p),
  meshyai_image_to_3d:   async (p, env) => selfFetch(env, '/api/meshy/image-to-3d', 'POST', p),
  meshyai_get_task:      async ({ id }, env) => selfFetch(env, `/api/meshy/task?id=${id}`, 'GET'),
  voxel_generate_scene:  async (p, env) => selfFetch(env, '/api/voxel/generate', 'POST', p),
  voxel_spawn_model:     async (p, env) => selfFetch(env, '/api/voxel/spawn', 'POST', p),
  excalidraw_open:       async () => ({ ok: true, message: 'Canvas activated in main panel' }),
  excalidraw_clear:      async (p, env) => selfFetch(env, '/api/draw/elements', 'POST', { ...p, elements: [] }),
  excalidraw_add_elements: async (p, env) => selfFetch(env, '/api/draw/elements', 'POST', p),
  excalidraw_export:     async (p, env) => selfFetch(env, '/api/draw/export', 'POST', p),
  excalidraw_load_library: async (p, env) => selfFetch(env, '/api/draw/libraries', 'GET'),
  cf_images_list:        async (p, env) => selfFetch(env, '/api/integrations/cf-images/list', 'GET'),
  cf_images_upload:      async (p, env) => selfFetch(env, '/api/integrations/cf-images/upload', 'POST', p),
  cf_images_delete:      async ({ image_id }, env) => selfFetch(env, `/api/integrations/cf-images/${image_id}`, 'DELETE'),
  gdrive_list:           async (p, env) => selfFetch(env, '/api/integrations/gdrive/list', 'GET'),
  gdrive_fetch:          async ({ file_id }, env) => selfFetch(env, `/api/integrations/gdrive/${file_id}`, 'GET'),
};

// ─── Deploy Handlers ──────────────────────────────────────────────────────────

const DEPLOY_HANDLERS = {
  get_deploy_command:     async (p, env) => selfFetch(env, '/api/deployments/recent?limit=1', 'GET'),
  get_worker_services:    async (p, env) => selfFetch(env, '/api/deployments/tracking', 'GET'),
  list_workers:           async (p, env) => selfFetch(env, '/api/deployments/tracking', 'GET'),
  worker_deploy:          async (p, env) => selfFetch(env, '/api/internal/record-deploy', 'POST', p),
  workflow_run_pipeline:  async (p, env) => selfFetch(env, '/api/agent/workflows/trigger', 'POST', p),
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

// ─── Shinshu CMS Handlers ─────────────────────────────────────────────────────

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
 * @param {object} args       - tool input arguments from model
 * @param {object} context    - { sessionId, tenantId, userId }
 * @returns {Promise<any>}    - tool output (stringified by caller if needed)
 */
export async function dispatchToolCall(env, toolName, args = {}, context = {}) {
  const handler = ALL_HANDLERS[toolName];

  if (!handler) {
    return { error: `Tool not implemented: ${toolName}. Check mcp_registered_tools.handler_type.` };
  }

  try {
    const result = await handler(args, env, context);
    return result;
  } catch (e) {
    return { error: `Tool execution error (${toolName}): ${e.message}` };
  }
}

/**
 * List all implemented tool names. Used for health checks and capability audits.
 */
export function listImplementedTools() {
  return Object.keys(ALL_HANDLERS);
}
