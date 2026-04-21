/**
 * API Layer: Agent Sam Reasoning Engine
 * Handles all /api/agent/* routes.
 *
 * Key notes:
 *  - All model resolution uses agent_model_registry (not ai_models)
 *  - No hardcoded model strings — always resolved from DB
 *  - Tool definitions loaded per-request via classifyIntent + loadToolsForRequest
 *  - Approval gate wired for high-risk tool calls
 *  - Telemetry written per request via writeTelemetry
 *  - Tool execution delegated to src/tools/builtin/index.js
 */
import { chatWithAnthropic }                            from '../integrations/anthropic.js';
import { dispatchStream }                              from '../core/provider.js';
import { unifiedRagSearch }                             from './rag.js';
import { writeTelemetry }                               from './telemetry.js';
import { jsonResponse }                                 from '../core/responses.js';
import { getAuthUser, getSession,
         isIngestSecretAuthorized,
         tenantIdFromEnv, projectIdFromEnv }            from '../core/auth.js';
import { notifySam }                                    from '../core/notifications.js';
import { getAgentMetadata, logSkillInvocation,
         getActivePromptByWeight, getPromptMetadata }   from './agentsam.js';
import { classifyIntent, loadToolsForRequest,
         validateToolCall }                             from '../core/tools.js';
import { dispatchToolCall }                             from '../tools/builtin/index.js';

// ─── Request-scoped Context Loaders ──────────────────────────────────────────

async function loadModeConfig(env, modeSlug) {
  const slug = modeSlug || 'ask';
  const defaults = { slug, temperature: 0.7, auto_run: 0, max_tool_calls: 15, system_prompt_fragment: null, context_strategy: 'standard' };
  if (!env.DB) return defaults;

  const cacheKey = `mode_cfg:${slug}`;
  if (env.KV) {
    try {
      const cached = await env.KV.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (_) {}
  }

  try {
    const row = await env.DB.prepare(
      `SELECT slug, display_name, temperature, auto_run, max_tool_calls,
              system_prompt_fragment, context_strategy, tool_policy_json,
              model_preference, gate_model, gate_reasoning_effort,
              escalation_model, escalation_threshold
       FROM agent_mode_configs WHERE slug = ? AND is_active = 1 LIMIT 1`
    ).bind(slug).first();
    const config = row || defaults;
    if (env.KV) env.KV.put(cacheKey, JSON.stringify(config), { expirationTtl: 300 }).catch(() => {});
    return config;
  } catch (_) { return defaults; }
}

async function loadUserPolicy(env, userId, workspaceId = '') {
  const defaults = { auto_run_mode: 'allowlist', mcp_tools_protection: 1, file_deletion_protection: 1, external_file_protection: 1 };
  if (!env.DB || !userId) return defaults;
  try {
    const row = await env.DB.prepare(
      `SELECT auto_run_mode, mcp_tools_protection, file_deletion_protection, external_file_protection
       FROM agentsam_user_policy WHERE user_id = ? AND workspace_id = ? LIMIT 1`
    ).bind(userId, workspaceId || '').first();
    return row || defaults;
  } catch (_) { return defaults; }
}

async function resolveDefaultModel(env) {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT model_key FROM agent_model_registry
       WHERE role IN ('agent', 'chat')
         AND supports_function_calling = 1
       ORDER BY input_cost_per_1m ASC LIMIT 1`
    ).first();
    return row?.model_key || null;
  } catch (_) { return null; }
}

// ─── Approval Gate ────────────────────────────────────────────────────────────

function needsApproval(validationResult, modeConfig, userPolicy) {
  if (!validationResult.allowed) return false;
  if (!validationResult.requiresConfirmation) return false;
  if (modeConfig.auto_run === 1 && userPolicy.auto_run_mode === 'auto') return false;
  return true;
}

async function createApprovalRequest(env, opts) {
  const { tenantId, sessionId, userId, toolName, toolArgs, toolCallId, riskLevel, rationale } = opts;
  const proposalId  = 'prop_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const toolCallRow = 'mtc_'  + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const now         = Math.floor(Date.now() / 1000);
  const expiresAt   = now + 3600;
  if (!env.DB) return proposalId;
  const argsStr = typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs || {});
  try {
    await env.DB.prepare(
      `INSERT INTO agent_command_proposals
       (id, tenant_id, agent_session_id, proposed_by, command_source, command_name,
        command_text, filled_template, rationale, risk_level, tool, status,
        requires_confirmation, expires_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`
    ).bind(
      proposalId, tenantId, sessionId, 'agent-sam', 'agent_generated',
      toolName, `${toolName}(${argsStr.slice(0, 500)})`, argsStr,
      rationale || `Tool call requires approval: ${toolName}`,
      riskLevel || 'medium', toolName, 'pending', expiresAt, now, now
    ).run();
    await env.DB.prepare(
      `INSERT INTO mcp_tool_calls
       (id, tenant_id, session_id, tool_name, tool_category, input_schema,
        status, approval_gate_id, invoked_by, invoked_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,'awaiting_approval',?,?,datetime('now'),datetime('now'),datetime('now'))`
    ).bind(
      toolCallRow, tenantId, sessionId, toolName, 'builtin',
      argsStr.slice(0, 10000), proposalId, userId || 'agent-sam', toolCallId || null
    ).run().catch(() => {});
  } catch (e) { console.warn('[agent] createApprovalRequest:', e?.message); }
  return proposalId;
}

async function auditToolDecision(env, opts) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO agent_audit_log (id, tenant_id, actor_role_id, event_type, message, metadata_json)
       VALUES (?, ?, 'agent-sam', ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), opts.tenantId || 'system', opts.eventType, opts.message,
      JSON.stringify({ tool: opts.toolName, reason: opts.reason, risk: opts.riskLevel })
    ).run();
  } catch (_) {}
}

// ─── SSE Tool Loop ────────────────────────────────────────────────────────────

async function runAgentToolLoop(env, ctx, emit, params) {
  const {
    messages, tools, systemPrompt, modelKey,
    temperature, maxToolCalls,
    mode, modeConfig, userPolicy,
    sessionId, tenantId, userId,
  } = params;

  const conversationMessages = [...messages];
  let toolCallsUsed = 0;
  let totalUsage    = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let turnCount     = 0;

  while (turnCount < 10) {
    turnCount++;
    let stream;
    try {
      // Provider resolved from ai_models.api_platform — no hardcoding
      stream = await dispatchStream(env, null, {
        modelKey,
        systemPrompt,
        messages:        conversationMessages,
        tools,
        reasoningEffort: modeConfig?.gate_reasoning_effort || null,
        temperature,
      });
    } catch (e) {
      emit('error', { message: 'Model call failed', detail: e.message });
      break;
    }

    const pendingToolCalls = [];
    let stopReason = null, turnUsage = null;
    const assistantContent = [];

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_start') {
        if (chunk.content_block?.type === 'thinking') emit('thinking_start', {});
        if (chunk.content_block?.type === 'tool_use') {
          pendingToolCalls.push({ id: chunk.content_block.id, name: chunk.content_block.name, _args: '' });
          assistantContent.push({ type: 'tool_use', id: chunk.content_block.id, name: chunk.content_block.name, input: {} });
        }
        if (chunk.content_block?.type === 'text') assistantContent.push({ type: 'text', text: '' });
      }
      if (chunk.type === 'content_block_delta') {
        const delta = chunk.delta;
        if (delta.type === 'text_delta') {
          const last = assistantContent.findLast(b => b.type === 'text');
          if (last) last.text += delta.text;
          emit('text', { text: delta.text });
        }
        if (delta.type === 'thinking_delta') emit('thinking', { text: delta.thinking });
        if (delta.type === 'input_json_delta') {
          const call = pendingToolCalls.findLast(c => !c._done);
          if (call) call._args += delta.partial_json;
        }
        if (delta.type === 'signature_delta') emit('signature', { signature: delta.signature });
      }
      if (chunk.type === 'content_block_stop') {
        const call = pendingToolCalls.findLast(c => !c._done);
        if (call) {
          call._done = true;
          try { call.input = JSON.parse(call._args || '{}'); } catch { call.input = {}; }
          const blk = assistantContent.find(b => b.type === 'tool_use' && b.id === call.id);
          if (blk) blk.input = call.input;
        }
      }
      if (chunk.type === 'message_start' && chunk.message?.id) emit('id', { id: chunk.message.id });
      if (chunk.type === 'message_delta') {
        if (chunk.usage) turnUsage = chunk.usage;
        if (chunk.delta?.stop_reason) stopReason = chunk.delta.stop_reason;
      }
    }

    if (turnUsage) {
      totalUsage.input_tokens                += turnUsage.input_tokens                || 0;
      totalUsage.output_tokens               += turnUsage.output_tokens               || 0;
      totalUsage.cache_read_input_tokens     += turnUsage.cache_read_input_tokens     || 0;
      totalUsage.cache_creation_input_tokens += turnUsage.cache_creation_input_tokens || 0;
    }

    conversationMessages.push({ role: 'assistant', content: assistantContent });
    if (!pendingToolCalls.length || stopReason === 'end_turn') break;

    const toolResults = [];
    for (const call of pendingToolCalls) {
      if (toolCallsUsed >= maxToolCalls) {
        emit('tool_blocked', { tool: call.name, reason: 'max_tool_calls_reached' });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: 'Tool call limit reached.' });
        continue;
      }
      const validation = await validateToolCall(env, mode, call.name);
      if (!validation.allowed) {
        await auditToolDecision(env, { tenantId, toolName: call.name, eventType: 'tool_blocked', message: `Blocked: ${call.name} — ${validation.reason}`, riskLevel: 'blocked', reason: validation.reason });
        emit('tool_blocked', { tool: call.name, reason: validation.reason });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: `Tool not available in ${mode} mode: ${validation.reason}` });
        continue;
      }
      if (needsApproval(validation, modeConfig, userPolicy)) {
        const proposalId = await createApprovalRequest(env, { tenantId, sessionId, userId, toolName: call.name, toolArgs: call.input, toolCallId: call.id, riskLevel: validation.riskLevel, rationale: `Agent requested ${call.name} (${validation.riskLevel} risk)` });
        notifySam(env, { subject: `Approval required: ${call.name}`, body: `Tool: ${call.name}\nRisk: ${validation.riskLevel}\nArgs: ${JSON.stringify(call.input||{}).slice(0,500)}\n\nApprove: ${(env.IAM_ORIGIN||'').replace(/\/$/,'')}/dashboard/overview?proposal=${proposalId}`, category: 'approval' }).catch(() => {});
        emit('approval_required', { proposal_id: proposalId, tool_name: call.name, tool_args: call.input, risk_level: validation.riskLevel, message: 'This action requires your approval.' });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: `Awaiting approval (proposal_id: ${proposalId}).` });
        continue;
      }
      toolCallsUsed++;
      emit('tool_call', { tool: call.name, args: call.input });
      await auditToolDecision(env, { tenantId, toolName: call.name, eventType: 'tool_executed', message: `Executing: ${call.name}`, riskLevel: validation.riskLevel, reason: 'allowed' });
      let toolOutput = '';
      try {
        const execResult = await dispatchToolCall(env, call.name, call.input, { sessionId, tenantId, userId });
        toolOutput = typeof execResult === 'string' ? execResult : JSON.stringify(execResult);
      } catch (e) {
        toolOutput = `Tool execution failed: ${e.message}`;
        emit('tool_error', { tool: call.name, error: e.message });
      }
      emit('tool_result', { tool: call.name, output: toolOutput.slice(0, 2000) });
      toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: toolOutput });
      if (env.DB) {
        env.DB.prepare(
          `INSERT OR IGNORE INTO mcp_tool_calls
           (id, tenant_id, session_id, tool_name, tool_category, input_schema,
            output, status, invoked_by, invoked_at, completed_at, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,'completed',?,datetime('now'),datetime('now'),datetime('now'),datetime('now'))`
        ).bind('mtc_' + crypto.randomUUID().replace(/-/g,'').slice(0,16), tenantId, sessionId, call.name, 'builtin', JSON.stringify(call.input||{}), toolOutput.slice(0,50000), userId||'agent-sam').run().catch(() => {});
      }
    }
    if (toolResults.length) conversationMessages.push({ role: 'user', content: toolResults });
    if (stopReason === 'end_turn') break;
  }

  if (totalUsage.input_tokens || totalUsage.output_tokens) {
    ctx.waitUntil?.(writeTelemetry(env, {
      sessionId, tenantId, provider: 'anthropic', model: modelKey,
      inputTokens: totalUsage.input_tokens, outputTokens: totalUsage.output_tokens,
      cacheReadTokens: totalUsage.cache_read_input_tokens,
      cacheWriteTokens: totalUsage.cache_creation_input_tokens,
      toolCallCount: toolCallsUsed, success: true,
    }));
  }

  emit('done', { tool_calls_used: toolCallsUsed, turns: turnCount });
}

// ─── SSE Chat Handler ─────────────────────────────────────────────────────────

export async function agentChatSseHandler(env, request, ctx, session) {
  const contentType = request.headers.get('content-type') || '';
  let body = {};
  
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
    // Attach files if any
    const files = formData.getAll('files');
    if (files.length) body.files = files;
  } else {
    body = await request.json().catch(() => ({}));
  }

  const message = (body.message || '').trim();
  if (!message) return jsonResponse({ error: 'message required' }, 400);

  const sessionId     = body.conversationId || body.session_id || body.sessionId || null;
  const requestedMode = String(body.mode || 'ask').toLowerCase();
  const tenantId      = session?.tenant_id || tenantIdFromEnv(env);
  const userId        = session?.user_id || null;
  const workspaceId   = body.workspace_id || '';

  const [modeConfig, userPolicy, intentResult, agentMeta] = await Promise.all([
    loadModeConfig(env, requestedMode),
    loadUserPolicy(env, userId, workspaceId),
    classifyIntent(env, message),
    body.agentId ? getAgentMetadata(env, body.agentId) : Promise.resolve(null),
  ]);

  const { tools: dbTools } = await loadToolsForRequest(env, requestedMode, intentResult.intent, { limit: modeConfig.max_tool_calls || 20, includeSchemas: true });
  const tools = dbTools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema || { type: 'object', properties: {} } }));

  let modelKey = modeConfig.model_preference || body.model || null;
  if (!modelKey) {
    const agentModel = agentMeta?.model_policy?.model_key;
    modelKey = agentModel || await resolveDefaultModel(env);
  }

  const ragResult    = await unifiedRagSearch(env, message, { topK: modeConfig.context_strategy === 'minimal' ? 3 : 8 });
  const ragContext   = (ragResult.matches || []).join('\n\n');
  const basePrompt   = agentMeta?.system_prompt || 'You are Agent Sam, an autonomous AI coding and operations assistant for Inner Animal Media.';
  const modeFragment = modeConfig.system_prompt_fragment ? `\n\n${modeConfig.system_prompt_fragment}` : '';
  const contextBlock = ragContext ? `\n\nRelevant context:\n${ragContext}` : '';
  const systemPrompt = basePrompt + modeFragment + contextBlock;

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();

  const emit = (type, payload) => {
    try { writer.write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`)); } catch (_) {}
  };

  emit('context', { intent: intentResult.intent, mode: requestedMode, model: modelKey, tool_count: tools.length });

  ;(async () => {
    try {
      await runAgentToolLoop(env, ctx, emit, {
        messages: body.messages || [{ role: 'user', content: message }],
        tools, systemPrompt, modelKey,
        temperature:  modeConfig.temperature || 0.7,
        maxToolCalls: modeConfig.max_tool_calls || 20,
        mode: requestedMode, modeConfig, userPolicy,
        sessionId, tenantId, userId,
      });
    } catch (e) {
      emit('error', { message: 'Agent loop failed', detail: e.message });
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'Connection':                  'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function handleAgentApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  // ── /api/agent/models ─────────────────────────────────────────────────────
  if (path === '/api/agent/models') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const provider = url.searchParams.get('provider') || null;
    const role     = url.searchParams.get('role') || null;
    try {
      let sql = `SELECT id, model_key, provider, display_name, role, cost_tier,
                        input_cost_per_1m, output_cost_per_1m, cached_input_cost_per_1m,
                        cache_write_cost_per_1m, cache_read_cost_per_1m,
                        batch_input_cost_per_1m, batch_output_cost_per_1m,
                        context_window, supports_function_calling,
                        supports_vision, supports_reasoning, supports_batch,
                        strengths, best_for, charge_type, charge_unit
                 FROM agent_model_registry WHERE 1=1`;
      const params = [];
      if (provider) { sql += ' AND provider = ?'; params.push(provider); }
      if (role)     { sql += ' AND role = ?';     params.push(role); }
      sql += ' ORDER BY provider, role, input_cost_per_1m ASC';
      const stmt = params.length ? env.DB.prepare(sql).bind(...params) : env.DB.prepare(sql);
      const { results } = await stmt.all();
      return jsonResponse(results || []);
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── /api/agent/modes ──────────────────────────────────────────────────────
  if (path === '/api/agent/modes' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const { results } = await env.DB.prepare(
        `SELECT slug, display_name AS label, description, color_hex AS color, icon,
                temperature, auto_run, max_tool_calls
         FROM agent_mode_configs WHERE is_active = 1 ORDER BY sort_order`
      ).all();
      return jsonResponse(results || []);
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── /api/agent/commands ───────────────────────────────────────────────────
  if (path === '/api/agent/commands' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = tenantIdFromEnv(env);
    try {
      const query = tenantId
        ? env.DB.prepare(`SELECT slug, description FROM agent_commands WHERE tenant_id = ? AND COALESCE(status,'active') = 'active' ORDER BY slug`).bind(tenantId)
        : env.DB.prepare(`SELECT slug, description FROM agent_commands WHERE COALESCE(status,'active') = 'active' ORDER BY slug`);
      const { results } = await query.all();
      return jsonResponse(results || []);
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── /api/agent/session/mode ───────────────────────────────────────────────
  if (path === '/api/agent/session/mode' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const body           = await request.json().catch(() => ({}));
    const mode           = String(body.mode || '').toLowerCase().trim();
    const conversationId = String(body.conversation_id || body.session_id || '');
    if (!conversationId) return jsonResponse({ error: 'conversation_id required' }, 400);
    if (!env.SESSION_CACHE) return jsonResponse({ error: 'SESSION_CACHE not configured' }, 503);
    await env.SESSION_CACHE.put(`session_mode:${conversationId}`, JSON.stringify({ mode, updated_at: Date.now() }), { expirationTtl: 86400 * 14 });
    return jsonResponse({ mode, persisted: true });
  }

  // ── /api/agent/problems ───────────────────────────────────────────────────
  if (path === '/api/agent/problems' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const checkedAt = new Date().toISOString();
    let mcp_tool_errors = [], audit_failures = [], worker_errors = [];
    try { const q = await env.DB.prepare(`SELECT id, tool_name, status, error_message, session_id, created_at FROM mcp_tool_calls WHERE lower(COALESCE(status,'')) IN ('error','failed') OR (error_message IS NOT NULL AND length(trim(error_message)) > 0) ORDER BY created_at DESC LIMIT 50`).all(); mcp_tool_errors = q.results || []; } catch (_) {}
    try { const q = await env.DB.prepare(`SELECT id, event_type, message, created_at, metadata_json FROM agent_audit_log WHERE lower(COALESCE(event_type,'')) LIKE '%fail%' OR lower(COALESCE(event_type,'')) LIKE '%error%' OR lower(COALESCE(event_type,'')) LIKE '%denied%' ORDER BY created_at DESC LIMIT 25`).all(); audit_failures = q.results || []; } catch (_) {}
    try { const q = await env.DB.prepare(`SELECT rowid as id, path, method, status_code, error_message, created_at FROM worker_analytics_errors ORDER BY created_at DESC LIMIT 20`).all(); worker_errors = q.results || []; } catch (_) {}
    return jsonResponse({ checked_at: checkedAt, mcp_tool_errors, audit_failures, worker_errors });
  }

  // ── /api/agent/notifications ──────────────────────────────────────────────
  if (path === '/api/agent/notifications' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const recipientId = String(authUser.id || '').trim();
    if (!recipientId) return jsonResponse({ notifications: [] });
    try {
      const { results } = await env.DB.prepare(`SELECT id, subject, message, status, created_at FROM notifications WHERE recipient_id = ? AND read_at IS NULL ORDER BY created_at DESC LIMIT 20`).bind(recipientId).all();
      return jsonResponse({ notifications: results || [] });
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  const notifReadMatch = path.match(/^\/api\/agent\/notifications\/([^/]+)\/read$/);
  if (notifReadMatch && method === 'PATCH') {
    const nid      = decodeURIComponent(notifReadMatch[1] || '').trim();
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const recipientId = String(authUser.id || '').trim();
    const upd = await env.DB.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND recipient_id = ?`).bind(nid, recipientId).run();
    if (!(upd.meta?.changes ?? 0)) return jsonResponse({ error: 'Not found' }, 404);
    return jsonResponse({ ok: true, id: nid });
  }

  // ── /api/agent/keyboard-shortcuts ────────────────────────────────────────
  if (path === '/api/agent/keyboard-shortcuts' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const { results } = await env.DB.prepare(`SELECT * FROM keyboard_shortcuts ORDER BY sort_order ASC, id ASC`).all();
    return jsonResponse({ shortcuts: results || [] });
  }

  const kbMatch = path.match(/^\/api\/agent\/keyboard-shortcuts\/([^/]+)$/);
  if (kbMatch && method === 'PATCH') {
    const rowId    = decodeURIComponent(kbMatch[1] || '').trim();
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const body    = await request.json().catch(() => ({}));
    const en      = body.is_enabled;
    const turnOn  = en === true || en === 1 || en === '1';
    const turnOff = en === false || en === 0 || en === '0';
    if (!turnOn && !turnOff) return jsonResponse({ error: 'is_enabled required' }, 400);
    const existing = await env.DB.prepare(`SELECT id, is_system FROM keyboard_shortcuts WHERE id = ?`).bind(rowId).first();
    if (!existing) return jsonResponse({ error: 'Not found' }, 404);
    if (Number(existing.is_system) === 1) return jsonResponse({ error: 'System shortcut cannot be disabled' }, 403);
    await env.DB.prepare(`UPDATE keyboard_shortcuts SET is_enabled = ? WHERE id = ?`).bind(turnOn ? 1 : 0, rowId).run();
    return jsonResponse({ ok: true });
  }

  // ── /api/agent/context-picker/catalog ────────────────────────────────────
  if (path === '/api/agent/context-picker/catalog' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ tables: [], workflows: [], commands: [], memory_keys: [], workspaces: [] });
    const tenantId = tenantIdFromEnv(env);
    let tables = [], workflows = [], commands = [], memory_keys = [], workspaces = [];
    await Promise.allSettled([
      env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().then(r => { tables = (r.results||[]).map(x=>x.name); }),
      env.DB.prepare(`SELECT id, name FROM ai_workflow_pipelines ORDER BY COALESCE(name,id) LIMIT 100`).all().then(r => { workflows = r.results||[]; }),
      tenantId ? env.DB.prepare(`SELECT slug, name, category FROM agent_commands WHERE tenant_id = ? AND COALESCE(status,'active')='active' ORDER BY category, name LIMIT 200`).bind(tenantId).all().then(r => { commands = r.results||[]; }) : Promise.resolve(),
      tenantId ? env.DB.prepare(`SELECT key FROM agent_memory_index WHERE tenant_id = ? ORDER BY COALESCE(importance_score,0) DESC LIMIT 150`).bind(tenantId).all().then(r => { memory_keys = (r.results||[]).map(x=>x.key); }) : Promise.resolve(),
      env.DB.prepare(`SELECT id, name FROM workspaces WHERE id LIKE 'ws_%' ORDER BY name LIMIT 50`).all().then(r => { workspaces = r.results||[]; }),
    ]);
    return jsonResponse({ tables, workflows, commands, memory_keys, workspaces });
  }

  // ── /api/agent/memory/list ────────────────────────────────────────────────
  if (path === '/api/agent/memory/list' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ items: [] });
    const tenantId = tenantIdFromEnv(env);
    if (!tenantId) return jsonResponse({ items: [] });
    const { results } = await env.DB.prepare(`SELECT key, memory_type, importance_score FROM agent_memory_index WHERE tenant_id = ? ORDER BY COALESCE(importance_score,0) DESC LIMIT 200`).bind(tenantId).all().catch(() => ({ results: [] }));
    return jsonResponse({ items: (results||[]).filter(r=>r.key) });
  }

  // ── /api/agent/memory/sync ────────────────────────────────────────────────
  if (path === '/api/agent/memory/sync' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = tenantIdFromEnv(env);
    if (!tenantId) return jsonResponse({ error: 'TENANT_ID not configured' }, 503);
    const { results } = await env.DB.prepare(`SELECT key, value, memory_type, importance_score FROM agent_memory_index WHERE tenant_id = ? ORDER BY importance_score DESC LIMIT 20`).bind(tenantId).all().catch(() => ({ results: [] }));
    return jsonResponse({ ok: true, rows: results || [] });
  }

  // ── /api/agent/db/tables ──────────────────────────────────────────────────
  if (path === '/api/agent/db/tables' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ tables: [] });
    const { results } = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().catch(() => ({ results: [] }));
    return jsonResponse({ tables: (results||[]).map(r=>r.name) });
  }

  // ── /api/agent/db/query-history ──────────────────────────────────────────
  if (path === '/api/agent/db/query-history') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ history: [] });
    if (method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT id, query_sql, executed_at, row_count, status FROM agent_db_query_history WHERE user_id = ? ORDER BY executed_at DESC LIMIT 50`).bind(String(authUser.id)).all().catch(() => ({ results: [] }));
      return jsonResponse({ history: results || [] });
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      await env.DB.prepare(`INSERT INTO agent_db_query_history (id, user_id, query_sql, status, row_count, executed_at) VALUES (?,?,?,?,?,unixepoch())`).bind(crypto.randomUUID(), String(authUser.id), String(body.query_sql||'').slice(0,10000), String(body.status||'success'), Number(body.row_count||0)).run().catch(() => {});
      return jsonResponse({ ok: true });
    }
  }

  // ── /api/agent/db/snippets ────────────────────────────────────────────────
  if (path === '/api/agent/db/snippets') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ snippets: [] });
    if (method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT id, name, query_sql, created_at FROM agent_db_snippets WHERE user_id = ? ORDER BY name ASC`).bind(String(authUser.id)).all().catch(() => ({ results: [] }));
      return jsonResponse({ snippets: results || [] });
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!body.name || !body.query_sql) return jsonResponse({ error: 'name and query_sql required' }, 400);
      const id = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO agent_db_snippets (id, user_id, name, query_sql, created_at) VALUES (?,?,?,?,unixepoch())`).bind(id, String(authUser.id), String(body.name).slice(0,200), String(body.query_sql).slice(0,50000)).run();
      return jsonResponse({ ok: true, id });
    }
  }

  // ── /api/agent/git/status ─────────────────────────────────────────────────
  if (path === '/api/agent/git/status' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const workerName = projectIdFromEnv(env) || 'unknown';
    try {
      const row = await env.DB.prepare(`SELECT d.git_hash, d.version, d.timestamp, g.repo_full_name, g.default_branch FROM deployments d LEFT JOIN github_repositories g ON g.cloudflare_worker_name = ? WHERE d.worker_name = ? AND d.status = 'success' ORDER BY d.timestamp DESC LIMIT 1`).bind(workerName, workerName).first();
      return jsonResponse({ branch: row?.default_branch || 'main', git_hash: row?.git_hash || null, worker_name: workerName, repo_full_name: row?.repo_full_name || null, sync_last_at: row?.timestamp || null });
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── /api/agent/git/sync ───────────────────────────────────────────────────
  if (path === '/api/agent/git/sync' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const body       = await request.json().catch(() => ({}));
    const tenantId   = tenantIdFromEnv(env);
    if (!tenantId) return jsonResponse({ error: 'TENANT_ID not configured' }, 503);
    const proposalId = 'prop_' + crypto.randomUUID().replace(/-/g,'').slice(0,16);
    const now        = Math.floor(Date.now() / 1000);
    const proposedBy = String(authUser.email || authUser.id || 'user').slice(0,200);
    const iamOrigin  = (env.IAM_ORIGIN || '').replace(/\/$/,'');
    await env.DB.prepare(`INSERT INTO agent_command_proposals (id, tenant_id, agent_session_id, proposed_by, command_source, command_name, command_text, filled_template, rationale, risk_level, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(proposalId, tenantId, body.session_id||null, proposedBy, 'dashboard', 'git_sync_workflow', 'GitHub sync workflow', 'GitHub sync workflow', 'User requested Git sync from dashboard.', 'medium', 'pending', now, now).run();
    notifySam(env, { subject: 'Git sync proposal pending', body: `Proposal: ${proposalId}\nApprove: ${iamOrigin}/dashboard/overview?proposal=${proposalId}`, category: 'proposal' }, ctx);
    return jsonResponse({ ok: true, proposal_id: proposalId, risk_level: 'medium' });
  }

  // ── /api/agent/boot ───────────────────────────────────────────────────────
  if (path === '/api/agent/boot') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const batch = await env.DB.batch([
        env.DB.prepare(`SELECT id, name, role_name, mode, thinking_mode, effort FROM agentsam_ai WHERE status='active' ORDER BY sort_order, name`),
        env.DB.prepare(`SELECT id, service_name, service_type, endpoint_url, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name`),
        env.DB.prepare(`SELECT id, model_key, provider, display_name, role, cost_tier, input_cost_per_1m, output_cost_per_1m, context_window, supports_function_calling, supports_vision, supports_reasoning FROM agent_model_registry ORDER BY provider, role, input_cost_per_1m ASC`),
        env.DB.prepare(`SELECT id, session_type, status, started_at FROM agent_sessions WHERE status='active' ORDER BY updated_at DESC LIMIT 20`),
      ]);
      return jsonResponse({ agents: batch[0]?.results||[], mcp_services: batch[1]?.results||[], models: batch[2]?.results||[], sessions: batch[3]?.results||[] });
    } catch (e) { return jsonResponse({ error: e.message }, 500); }
  }

  // ── /api/agent/conversations/search ──────────────────────────────────────
  if (path === '/api/agent/conversations/search' && method === 'GET') {
    if (!env.DB) return jsonResponse([]);
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return jsonResponse([]);
    const like = `%${q.replace(/%/g,'\\%').replace(/_/g,'\\_')}%`;
    const { results } = await env.DB.prepare(`SELECT id, COALESCE(name,title,'') as title FROM agent_conversations WHERE name LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 20`).bind(like,like).all().catch(() => ({ results: [] }));
    return jsonResponse((results||[]).map(r=>({ id: r.id, title: r.title||'New Conversation' })));
  }

  // ── /api/agent/sessions/:id/messages ─────────────────────────────────────
  const sessMessagesMatch = path.match(/^\/api\/agent\/sessions\/([^/]+)\/messages$/);
  if (sessMessagesMatch && method === 'GET') {
    const convId = decodeURIComponent(sessMessagesMatch[1] || '').trim();
    if (!convId) return jsonResponse({ error: 'session id required' }, 400);
    if (env.AGENT_SESSION) {
      try {
        const doId = env.AGENT_SESSION.idFromName(convId);
        const stub = env.AGENT_SESSION.get(doId);
        const lim  = url.searchParams.get('limit') || '100';
        const resp = await stub.fetch(new Request(`https://do/history?limit=${encodeURIComponent(lim)}`));
        const rows = await resp.json().catch(() => []);
        return jsonResponse(Array.isArray(rows) ? rows : (rows.messages || []));
      } catch (_) {}
    }
    if (!env.DB) return jsonResponse([]);
    const { results } = await env.DB.prepare(
      `SELECT role, content, created_at FROM agent_messages
       WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 200`
    ).bind(convId).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  // ── /api/agent/sessions PATCH /:id ───────────────────────────────────────
  const sessionPatchMatch = path.match(/^\/api\/agent\/sessions\/([^/]+)$/);
  if (sessionPatchMatch && method === 'PATCH') {
    const convId = sessionPatchMatch[1];
    const body   = await request.json().catch(() => ({}));
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    await env.DB.prepare(`UPDATE mcp_agent_sessions SET status = ?, last_activity = ?, updated_at = unixepoch() WHERE conversation_id = ?`).bind(String(body.status||'completed'), new Date().toISOString(), convId).run().catch(() => {});
    return jsonResponse({ success: true });
  }

  // ── /api/agent/sessions ───────────────────────────────────────────────────
  if (path === '/api/agent/sessions') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    if (method === 'POST') {
      const body   = await request.json().catch(() => ({}));
      const id     = crypto.randomUUID();
      const now    = Math.floor(Date.now() / 1000);
      const name   = (typeof body.name === 'string' && body.name.trim()) ? body.name.trim() : 'New Conversation';
      const r2Key  = `agent-sessions/${id}/context.json`;
      const sessCtx = JSON.stringify({ session_id: id, name, created_at: Date.now(), message_count: 0, messages: [] });
      if (env.R2) await env.R2.put(r2Key, sessCtx, { httpMetadata: { contentType: 'application/json' } }).catch(() => {});
      if (env.SESSION_CACHE) await env.SESSION_CACHE.put(`sess_ctx:${id}`, sessCtx, { expirationTtl: 86400 }).catch(() => {});
      const tenantId = tenantIdFromEnv(env);
      await env.DB.prepare(`INSERT INTO agent_sessions (id, tenant_id, name, session_type, status, state_json, r2_key, started_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(id, tenantId || 'system', name, body.session_type||'chat', 'active', '{}', r2Key, now, now).run();
      return jsonResponse({ id, status: 'active' });
    }
    const tenantId = tenantIdFromEnv(env);
    const { results } = await env.DB.prepare(`SELECT s.id, s.session_type, s.status, s.started_at, COALESCE(s.name,ac.name,ac.title,'New Conversation') as name, (SELECT COUNT(*) FROM agent_messages am WHERE am.conversation_id = s.id) as message_count FROM agent_sessions s LEFT JOIN agent_conversations ac ON ac.id = s.id WHERE s.tenant_id = ? ORDER BY s.updated_at DESC LIMIT 50`).bind(tenantId || 'system').all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  // ── /api/agent/workspace/:id ──────────────────────────────────────────────
  const workspaceMatch = path.match(/^\/api\/agent\/workspace\/([^/]+)$/);
  if (workspaceMatch) {
    const wsId = decodeURIComponent(workspaceMatch[1] || '').trim();
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    // ── /api/agent/workspace/:id ────────────────────────────────────────────
    // ── /api/agent/workspace/:id ────────────────────────────────────────────
    if (method === 'GET') {
      try {
        const userId = String(authUser?.id || 'anonymous').trim();
        const tid    = String(authUser?.tenant_id || tenantIdFromEnv(env) || 'system').trim();
        const uwsId  = `uws:${tid}:${userId}:${wsId}`;

        // Attempt retrieval from both tables
        const [globalWs, personalWs] = await Promise.all([
          env.DB.prepare(`SELECT * FROM workspaces WHERE id = ? OR handle = ? LIMIT 1`).bind(wsId, wsId).first().catch(() => null),
          env.DB.prepare(`SELECT state_json FROM agent_workspace_state WHERE id = ?`).bind(uwsId).first().catch(() => null)
        ]);
        
        const row = globalWs || (personalWs ? { id: wsId, state_json: personalWs.state_json, name: 'Personal' } : null);
        if (!row) return jsonResponse({ error: 'Workspace not found' }, 404);
        
        const safeJson = (v) => { 
          if (!v) return {}; 
          if (typeof v === 'object' && v !== null) return v;
          try { return JSON.parse(v); } catch(e) { return {}; }
        };

        return jsonResponse({
          id: row.id,
          name: row.name || 'Workspace',
          environment: row.environment || 'local',
          status: row.status || 'active',
          settings: safeJson(row.settings_json),
          state:    safeJson(row.state_json)
        });
      } catch (e) { 
        return jsonResponse({ error: `Fetch error: ${e.message}` }, 500); 
      }
    }

    if (method === 'PUT') {
      try {
        const body    = await request.json().catch(() => ({}));
        const state   = body.state || body.state_json;
        const stateStr = typeof state === 'string' ? state : JSON.stringify(state || {});
        
        const userId = String(authUser?.id || 'anonymous').trim();
        const tid    = String(authUser?.tenant_id || tenantIdFromEnv(env) || 'system').trim();
        const uwsId  = `uws:${tid}:${userId}:${wsId}`;

        // Attempt update in both locations (idempotent for the relevant table)
        try {
          if (env.DB) {
            const results = await Promise.allSettled([
              env.DB.prepare(`UPDATE workspaces SET state_json = ?, updated_at = datetime('now') WHERE id = ?`)
                .bind(stateStr, wsId).run(),
              env.DB.prepare(`UPDATE agent_workspace_state SET state_json = ?, updated_at = unixepoch() WHERE id = ?`)
                .bind(stateStr, uwsId).run()
            ]);
            console.log('[agent] workspace update results:', results.map(r => r.status));
          }
        } catch (dbErr) {
          console.warn('[agent] non-critical workspace update failure:', dbErr.message);
        }
        
        return jsonResponse({ ok: true, id: wsId });
      } catch (e) { 
        console.error('[agent] workspace PUT error:', e.stack);
        return jsonResponse({ error: e.message }, 500); 
      }
    }
  }

  // ── /api/agent/terminal/config-status ────────────────────────────────────
  if (path === '/api/agent/terminal/config-status' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ terminal_configured: false });
    try {
      const row = await env.DB.prepare(
        `SELECT id, tunnel_url, shell, cwd, cols, rows
         FROM terminal_sessions
         WHERE user_id = ? AND status = 'active'
           AND tunnel_url IS NOT NULL AND tunnel_url != ''
         ORDER BY updated_at DESC LIMIT 1`
      ).bind(String(authUser.id)).first().catch(() => null);
      if (!row) return jsonResponse({ terminal_configured: false });
      return jsonResponse({
        terminal_configured: true,
        tunnel_url: row.tunnel_url,
        shell:      row.shell || 'bash',
        cwd:        row.cwd   || '~',
        cols:       row.cols  || 220,
        rows:       row.rows  || 50,
      });
    } catch (e) {
      return jsonResponse({ terminal_configured: false, error: e.message });
    }
  }

  // ── /api/agent/propose ────────────────────────────────────────────────────
  if (path === '/api/agent/propose' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const body        = await request.json().catch(() => ({}));
    const commandText = String(body.command_text || body.command || '').trim();
    if (!commandText) return jsonResponse({ error: 'command_text required' }, 400);
    const tenantId   = tenantIdFromEnv(env);
    if (!tenantId) return jsonResponse({ error: 'TENANT_ID not configured' }, 503);
    const proposalId = 'prop_' + crypto.randomUUID().replace(/-/g,'').slice(0,16);
    const now        = Math.floor(Date.now() / 1000);
    const iamOrigin  = (env.IAM_ORIGIN || '').replace(/\/$/,'');
    await env.DB.prepare(`INSERT INTO agent_command_proposals (id, tenant_id, agent_session_id, proposed_by, command_source, command_name, command_text, filled_template, rationale, risk_level, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(proposalId, tenantId, body.session_id||null, 'agent-sam', 'agent_generated', String(body.command_name||'proposed').slice(0,200), commandText, commandText, String(body.rationale||'Agent proposed command').slice(0,8000), 'medium', 'pending', now, now).run();
    notifySam(env, { subject: `Proposal pending: ${commandText.slice(0,80)}`, body: `ID: ${proposalId}\nApprove: ${iamOrigin}/dashboard/overview?proposal=${proposalId}`, category: 'proposal' }, ctx);
    return jsonResponse({ ok: true, proposal_id: proposalId });
  }

  // ── /api/agent/proposals/pending ─────────────────────────────────────────
  if (path === '/api/agent/proposals/pending' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse([]);
    const { results } = await env.DB.prepare(`SELECT * FROM agent_command_proposals WHERE status = 'pending' ORDER BY created_at DESC`).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  const propApproveMatch = path.match(/^\/api\/agent\/proposals\/([^/]+)\/approve$/);
  if (propApproveMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const propId   = propApproveMatch[1];
    const row      = await env.DB.prepare(`SELECT id, tool FROM agent_command_proposals WHERE id = ?`).bind(propId).first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const approver = String(authUser.email || authUser.id).slice(0,200);
    const now      = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`UPDATE agent_command_proposals SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?`).bind(approver, now, now, propId).run();
    return jsonResponse({ ok: true, proposal_id: propId });
  }

  const propDenyMatch = path.match(/^\/api\/agent\/proposals\/([^/]+)\/deny$/);
  if (propDenyMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const propId   = propDenyMatch[1];
    const body     = await request.json().catch(() => ({}));
    const row      = await env.DB.prepare(`SELECT id FROM agent_command_proposals WHERE id = ?`).bind(propId).first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const denier   = String(authUser.email || authUser.id).slice(0,200);
    const now      = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`UPDATE agent_command_proposals SET status='denied', denied_by=?, denied_at=?, denial_reason=?, updated_at=? WHERE id=?`).bind(denier, now, String(body.denial_reason||'').slice(0,4000), now, propId).run();
    return jsonResponse({ ok: true, proposal_id: propId, status: 'denied' });
  }

  // ── /api/agent/workflows/trigger ─────────────────────────────────────────
  if (path === '/api/agent/workflows/trigger' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const body         = await request.json().catch(() => ({}));
    const workflowName = String(body.workflow_name || '').trim();
    if (!workflowName) return jsonResponse({ error: 'workflow_name required' }, 400);
    const tenantId     = tenantIdFromEnv(env);
    if (!tenantId) return jsonResponse({ error: 'TENANT_ID not configured' }, 503);
    const runId        = 'wfr_' + crypto.randomUUID().replace(/-/g,'').slice(0,16);
    await env.DB.prepare(`INSERT INTO workflow_runs (id, tenant_id, workflow_id, workflow_name, trigger_source, triggered_by, status, input_data, created_at, updated_at) VALUES (?,?,?,?,'api','agent-sam','pending',?,datetime('now'),datetime('now'))`).bind(runId, tenantId, body.workflow_id||null, workflowName, body.input_data ? JSON.stringify(body.input_data) : null).run();
    return jsonResponse({ ok: true, run_id: runId, status: 'pending' });
  }

  // ── /api/agent/rag/query ──────────────────────────────────────────────────
  if (path === '/api/agent/rag/query' && method === 'POST') {
    const body  = await request.json().catch(() => ({}));
    const query = (body.query || body.q || '').trim();
    if (!query) return jsonResponse({ error: 'query required', matches: [], results: [], count: 0 }, 400);
    const out = await unifiedRagSearch(env, query, { topK: body.top_k || 8 });
    return jsonResponse({ matches: out.matches||[], results: out.results||[], count: out.count||0 });
  }

  // ── /api/agent/workers-ai/image ───────────────────────────────────────────
  if (path === '/api/agent/workers-ai/image' && method === 'POST') {
    if (!env.AI) return jsonResponse({ error: 'Workers AI not configured' }, 503);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body   = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);
    const modelRow = await env.DB.prepare(`SELECT model_key FROM agent_model_registry WHERE provider='workers_ai' AND role='image' ORDER BY input_cost_per_1m ASC LIMIT 1`).first().catch(() => null);
    const model    = modelRow?.model_key;
    if (!model) return jsonResponse({ error: 'No active Workers AI image model in agent_model_registry' }, 503);
    try {
      const result = await env.AI.run(model, { prompt });
      const bytes  = result instanceof ArrayBuffer ? new Uint8Array(result) : result;
      return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── /api/agent/do-history ─────────────────────────────────────────────────
  if (path === '/api/agent/do-history' && method === 'GET') {
    const session = await getSession(env, request).catch(() => null);
    if (!session?.user_id) return jsonResponse({ error: 'Unauthorized' }, 401);
    const convId = url.searchParams.get('conversation_id');
    if (!convId) return jsonResponse({ error: 'conversation_id required' }, 400);
    if (!env.AGENT_SESSION) return jsonResponse({ error: 'AGENT_SESSION not configured' }, 503);
    const doId = env.AGENT_SESSION.idFromName(String(convId));
    const stub = env.AGENT_SESSION.get(doId);
    const lim  = url.searchParams.get('limit') || '50';
    const resp = await stub.fetch(new Request(`https://do/history?limit=${encodeURIComponent(lim)}`));
    return new Response(resp.body, { status: resp.status, headers: { 'Content-Type': 'application/json' } });
  }

  // ── /api/agent/telemetry ──────────────────────────────────────────────────
  if (path === '/api/agent/telemetry') {
    if (!env.DB) return jsonResponse([]);
    const { results } = await env.DB.prepare(`SELECT provider, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, COUNT(*) as total_calls FROM agent_telemetry WHERE created_at > unixepoch('now','-7 days') GROUP BY provider`).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  // ── /api/agent/cicd ───────────────────────────────────────────────────────
  if (path === '/api/agent/cicd') {
    if (!env.DB) return jsonResponse([]);
    const { results } = await env.DB.prepare(`SELECT r.id, r.worker_name, r.environment, r.status, r.git_branch, r.git_commit_sha, r.queued_at, r.completed_at, COUNT(e.id) AS activity_count FROM cicd_runs r LEFT JOIN cicd_events e ON e.webhook_event_id = r.id GROUP BY r.id ORDER BY r.queued_at DESC LIMIT 50`).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  // ── /api/agent/mcp ────────────────────────────────────────────────────────
  if (path === '/api/agent/mcp') {
    if (!env.DB) return jsonResponse([]);
    const { results } = await env.DB.prepare(`SELECT id, service_name, service_type, endpoint_url, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name`).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  // ── /api/agent/bootstrap ──────────────────────────────────────────────────
  if (path === '/api/agent/bootstrap' && method === 'GET') {
    const session = await getSession(env, request).catch(() => null);
    return handleAgentBootstrapRequest(request, env, ctx, session);
  }

  // ── /api/agent/chat ───────────────────────────────────────────────────────
  if (path === '/api/agent/chat' && method === 'POST') {
    const ingestBypass = isIngestSecretAuthorized(request, env);
    let session = null;
    if (!ingestBypass) {
      session = await getSession(env, request);
      if (!session?.user_id) return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return agentChatSseHandler(env, request, ctx, session);
  }

  return jsonResponse({ error: 'Agent route not found', path }, 404);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function handleAgentBootstrapRequest(request, env, ctx, session) {
  try {
    const userId   = session?.user_id || 'system';
    const cacheKey = `bootstrap_${userId}`;
    if (env.DB) {
      const cached = await env.DB.prepare(`SELECT compiled_context FROM ai_compiled_context_cache WHERE context_hash = ? AND (expires_at IS NULL OR expires_at > unixepoch())`).bind(cacheKey).first().catch(() => null);
      if (cached?.compiled_context) {
        return new Response(cached.compiled_context, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });
      }
    }
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let dailyLog = '', yesterdayLog = '', schemaMemory = '', todayTodo = '';
    if (env.R2) {
      const fetchR2 = async k => { const o = await env.R2.get(k); return o ? await o.text() : ''; };
      [dailyLog, yesterdayLog, schemaMemory, todayTodo] = await Promise.all([
        fetchR2(`memory/daily/${today}.md`),
        fetchR2(`memory/daily/${yesterday}.md`),
        fetchR2('memory/schema-and-records.md'),
        fetchR2('memory/today-todo.md'),
      ]);
    }
    if (!todayTodo && env.DB) {
      const row = await env.DB.prepare(`SELECT value FROM agent_memory_index WHERE key = 'today_todo' AND tenant_id = ?`).bind(session?.tenant_id || 'system').first().catch(() => null);
      if (row?.value) todayTodo = String(row.value);
    }
    const context = { daily_log: dailyLog || null, yesterday_log: yesterdayLog || null, schema_and_records_memory: schemaMemory || null, today_todo: todayTodo || null, date: today };
    if (env.DB && ctx?.waitUntil) {
      ctx.waitUntil(
        env.DB.prepare(`INSERT INTO ai_compiled_context_cache (id, context_hash, context_type, compiled_context, source_context_ids_json, token_count, tenant_id, created_at, last_accessed_at, expires_at) VALUES (?,?,'bootstrap',?,'[]',0,?,unixepoch(),unixepoch(),unixepoch()+1800) ON CONFLICT(context_hash) DO UPDATE SET compiled_context=excluded.compiled_context, expires_at=excluded.expires_at, last_accessed_at=unixepoch()`).bind(cacheKey, cacheKey, JSON.stringify(context), session?.tenant_id || 'system').run().catch(() => {})
      );
    }
    return jsonResponse(context);
  } catch (e) {
    return jsonResponse({ error: String(e.message || e) }, 500);
  }
}
