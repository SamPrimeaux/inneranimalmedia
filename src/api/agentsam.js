/**
 * API Layer: Agent Sam Capability Layer
 *
 * Owns: agent registry, skill management, prompt A/B testing,
 *       fetch allowlist, policy enforcement, invocation auditing,
 *       subagent profiles, routing rules, gorilla XP.
 *
 * Tables: agentsam_ai, agentsam_skill, agentsam_skill_invocation,
 *         agentsam_subagent_profile, ai_prompts_library,
 *         agentsam_fetch_domain_allowlist, agentsam_rules_document,
 *         agentsam_hook, model_routing_rules, gorilla_xp
 */
import { jsonResponse }                 from '../core/responses.js';
import { getAuthUser, tenantIdFromEnv } from '../core/auth.js';

// ─── Policy Constants ─────────────────────────────────────────────────────────

export const AGENTSAM_ALLOWED_POLICY_COLS = new Set([
  'auto_run_mode', 'browser_protection', 'mcp_tools_protection',
  'file_deletion_protection', 'external_file_protection',
  'default_agent_location', 'text_size', 'auto_clear_chat',
  'submit_with_mod_enter', 'max_tab_count', 'queue_messages_mode',
  'usage_summary_mode', 'agent_autocomplete', 'web_search_enabled',
  'auto_accept_web_search', 'web_fetch_enabled', 'hierarchical_ignore',
  'ignore_symlinks', 'inline_diffs', 'jump_next_diff_on_accept',
  'auto_format_on_agent_finish', 'legacy_terminal_tool',
  'toolbar_on_selection', 'auto_parse_links', 'themed_diff_backgrounds',
  'terminal_hint', 'terminal_preview_box', 'collapse_auto_run_commands',
  'voice_submit_keyword', 'commit_attribution', 'pr_attribution', 'settings_json',
]);

export function defaultAgentsamUserPolicy(userKey, workspaceId) {
  return {
    user_id:                     userKey,
    workspace_id:                workspaceId,
    auto_run_mode:               'allowlist',
    browser_protection:          0,
    mcp_tools_protection:        1,
    file_deletion_protection:    1,
    external_file_protection:    1,
    default_agent_location:      'pane',
    text_size:                   'default',
    auto_clear_chat:             0,
    submit_with_mod_enter:       0,
    max_tab_count:               5,
    queue_messages_mode:         'after_current',
    usage_summary_mode:          'auto',
    agent_autocomplete:          1,
    web_search_enabled:          1,
    auto_accept_web_search:      0,
    web_fetch_enabled:           1,
    hierarchical_ignore:         0,
    ignore_symlinks:             0,
    inline_diffs:                1,
    jump_next_diff_on_accept:    1,
    auto_format_on_agent_finish: 0,
    legacy_terminal_tool:        1,
    toolbar_on_selection:        1,
    auto_parse_links:            0,
    themed_diff_backgrounds:     1,
    terminal_hint:               1,
    terminal_preview_box:        1,
    collapse_auto_run_commands:  1,
    voice_submit_keyword:        'submit',
    commit_attribution:          1,
    pr_attribution:              1,
    settings_json:               null,
    updated_at:                  new Date().toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeParseJson(str) {
  if (!str) return {};
  try { return JSON.parse(str); } catch { return {}; }
}

function normalizeFetchHost(h) {
  let s = String(h || '').trim().replace(/^https?:\/\//i, '');
  const slash = s.indexOf('/');
  if (slash >= 0) s = s.slice(0, slash);
  return s.trim().toLowerCase();
}

const BUILTIN_FETCH_HOSTS = new Set(['claude.ai']);

// ─── Fetch Allowlist ──────────────────────────────────────────────────────────

/**
 * Check if a URL/host is allowed for agent fetch operations.
 * Built-in hosts always pass. Others checked against agentsam_fetch_domain_allowlist.
 */
export async function agentsamIsFetchHostAllowed(env, userKey, workspaceId, urlOrHost) {
  const host = normalizeFetchHost(urlOrHost);
  if (!host) return false;
  if (BUILTIN_FETCH_HOSTS.has(host)) return true;
  if (!env.DB) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT 1 AS ok FROM agentsam_fetch_domain_allowlist
       WHERE user_id = ?
         AND LOWER(TRIM(host)) = ?
         AND (
           TRIM(COALESCE(workspace_id,'')) = ''
           OR (LENGTH(TRIM(?)) > 0 AND workspace_id = ?)
         )
       LIMIT 1`
    ).bind(userKey, host, workspaceId || '', workspaceId || '').first();
    return !!row;
  } catch (_) { return false; }
}

// ─── Agent Registry ───────────────────────────────────────────────────────────

/**
 * Fetch a single active agent by role_name or id.
 * Parses all JSON policy fields into objects.
 */
export async function getAgentMetadata(env, roleOrId) {
  if (!env.DB)    return { error: 'DB not configured' };
  if (!roleOrId)  return { error: 'role_or_id required' };
  const row = await env.DB.prepare(
    `SELECT * FROM agentsam_ai WHERE (id = ? OR role_name = ?) AND status = 'active' LIMIT 1`
  ).bind(roleOrId, roleOrId).first().catch(() => null);
  if (!row) return { error: `Agent not found: ${roleOrId}` };
  return {
    ...row,
    model_policy:     safeParseJson(row.model_policy_json),
    cost_policy:      safeParseJson(row.cost_policy_json),
    memory_policy:    safeParseJson(row.memory_policy_json),
    tool_permissions: safeParseJson(row.tool_permissions_json),
  };
}

/**
 * Fetch all active agents ordered by sort_order.
 */
export async function getActiveAgents(env) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    `SELECT id, name, role_name, mode, thinking_mode, effort, status, sort_order, icon
     FROM agentsam_ai WHERE status = 'active' ORDER BY sort_order ASC, name ASC`
  ).all().catch(() => ({ results: [] }));
  return results || [];
}

// ─── Skills ───────────────────────────────────────────────────────────────────

export async function getAgentSkills(env) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    `SELECT * FROM agentsam_skill WHERE is_active = 1 ORDER BY sort_order ASC`
  ).all().catch(() => ({ results: [] }));
  return results || [];
}

/**
 * Log a skill invocation for auditing and spend-ledger calibration.
 */
export async function logSkillInvocation(env, data) {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT INTO agentsam_skill_invocation
     (skill_id, conversation_id, trigger_method, input_summary, success, error_message,
      duration_ms, model_used, tokens_in, tokens_out, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    data.skillId        || null,
    data.conversationId || null,
    data.triggerMethod  || 'auto',
    data.inputSummary   || null,
    data.success ? 1 : 0,
    data.errorMessage   || null,
    data.durationMs     || 0,
    data.modelUsed      || null,
    data.tokensIn       || 0,
    data.tokensOut      || 0,
    data.costUsd        || 0,
  ).run().catch(e => console.warn('[agentsam] logSkillInvocation:', e?.message));
}

// ─── Prompt A/B Testing ───────────────────────────────────────────────────────

/**
 * Weighted random selection of an active prompt by category.
 */
export async function getActivePromptByWeight(env, category) {
  if (!env.DB || !category) return null;
  const { results } = await env.DB.prepare(
    `SELECT * FROM ai_prompts_library WHERE category = ? AND is_active = 1`
  ).bind(category).all().catch(() => ({ results: [] }));
  const prompts = results || [];
  if (!prompts.length) return null;
  if (prompts.length === 1) return prompts[0];
  const totalWeight = prompts.reduce((s, p) => s + (p.weight || 100), 0);
  let rand = Math.random() * totalWeight;
  for (const p of prompts) {
    if (rand < (p.weight || 100)) return p;
    rand -= (p.weight || 100);
  }
  return prompts[0];
}

/**
 * Fetch prompt metadata by ID.
 * Used by agent.js for prompt context hydration.
 */
export async function getPromptMetadata(env, promptId) {
  if (!env.DB || !promptId) return null;
  const row = await env.DB.prepare(
    `SELECT * FROM ai_prompts_library WHERE id = ? LIMIT 1`
  ).bind(promptId).first().catch(() => null);
  return row || null;
}

// ─── Subagent Profiles ────────────────────────────────────────────────────────

/**
 * Fetch all active subagent profiles.
 */
export async function getSubagentProfiles(env) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    `SELECT * FROM agentsam_subagent_profile WHERE is_active = 1 ORDER BY name ASC`
  ).all().catch(() => ({ results: [] }));
  return results || [];
}

/**
 * Fetch a single subagent profile by name or id.
 */
export async function getSubagentProfile(env, nameOrId) {
  if (!env.DB || !nameOrId) return null;
  const row = await env.DB.prepare(
    `SELECT * FROM agentsam_subagent_profile WHERE (id = ? OR name = ?) AND is_active = 1 LIMIT 1`
  ).bind(nameOrId, nameOrId).first().catch(() => null);
  return row || null;
}

// ─── Routing Rules ────────────────────────────────────────────────────────────

/**
 * Fetch all active model routing rules.
 */
export async function getModelRoutingRules(env) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    `SELECT * FROM model_routing_rules WHERE is_active = 1 ORDER BY task_type ASC`
  ).all().catch(() => ({ results: [] }));
  return results || [];
}

// ─── Config ───────────────────────────────────────────────────────────────────

async function handleAgentSamConfig(url, env) {
  const workspaceId = url.searchParams.get('workspace_id') || null;
  let workspaceCdCommand = null;
  if (workspaceId && env.DB) {
    try {
      const row = await env.DB.prepare(
        `SELECT settings_json FROM workspace_settings WHERE workspace_id = ? LIMIT 1`
      ).bind(workspaceId).first();
      if (row?.settings_json) {
        const s = safeParseJson(row.settings_json);
        workspaceCdCommand = s.workspace_cd_command || null;
      }
    } catch (_) {}
  }
  return jsonResponse({
    workspace_cd_command: workspaceCdCommand,
    iam_origin:           env.IAM_ORIGIN     || null,
    sandbox_origin:       env.SANDBOX_ORIGIN || null,
    product_label:        env.VITE_PRODUCT_LABEL || 'Agent Sam',
  });
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function handleAgentSamApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

  const userId      = String(authUser.id || '').trim();
  const workspaceId = url.searchParams.get('workspace_id') || null;

  try {

    // ── Config ──────────────────────────────────────────────────────────────
    if (path === '/api/agentsam/config' && method === 'GET') {
      return handleAgentSamConfig(url, env);
    }

    // ── Agents ──────────────────────────────────────────────────────────────
    if (path === '/api/agentsam/agents' && method === 'GET') {
      return jsonResponse({ agents: await getActiveAgents(env) });
    }

    if (path.startsWith('/api/agentsam/ai') && method === 'GET') {
      const parts    = path.split('/');
      const roleOrId = parts[parts.length - 1];
      if (roleOrId && roleOrId !== 'ai') {
        return jsonResponse(await getAgentMetadata(env, roleOrId));
      }
      return jsonResponse({ agents: await getActiveAgents(env) });
    }

    // ── Skills ───────────────────────────────────────────────────────────────
    if (path === '/api/agentsam/skills' && method === 'GET') {
      return jsonResponse({ skills: await getAgentSkills(env) });
    }

    // ── Invocations ──────────────────────────────────────────────────────────
    if (path === '/api/agentsam/invocations' && method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
      const { results } = await env.DB.prepare(
        `SELECT * FROM agentsam_skill_invocation ORDER BY invoked_at DESC LIMIT ?`
      ).bind(limit).all();
      return jsonResponse({ invocations: results || [] });
    }

    if (path === '/api/agentsam/log-invocation' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      await logSkillInvocation(env, body);
      return jsonResponse({ ok: true });
    }

    // ── Prompts ──────────────────────────────────────────────────────────────
    if (path.startsWith('/api/agentsam/prompts') && method === 'GET') {
      const parts    = path.split('/');
      const category = parts[parts.length - 1];
      if (category && category !== 'prompts') {
        const prompt = await getActivePromptByWeight(env, category);
        return jsonResponse(prompt || { error: `No prompt found for category: ${category}` });
      }
      const { results } = await env.DB.prepare(
        `SELECT id, category, weight, is_active FROM ai_prompts_library ORDER BY category ASC`
      ).all();
      return jsonResponse({ prompts: results || [] });
    }

    // ── Subagents ─────────────────────────────────────────────────────────────
    if (path === '/api/agentsam/subagents' && method === 'GET') {
      return jsonResponse({ subagents: await getSubagentProfiles(env) });
    }

    if (path.startsWith('/api/agentsam/subagents/') && method === 'GET') {
      const nameOrId = decodeURIComponent(path.split('/').pop());
      const profile  = await getSubagentProfile(env, nameOrId);
      if (!profile) return jsonResponse({ error: `Subagent not found: ${nameOrId}` }, 404);
      return jsonResponse({ subagent: profile });
    }

    // ── Rules ────────────────────────────────────────────────────────────────
    if (path === '/api/agentsam/rules' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT * FROM agentsam_rules_document WHERE is_active = 1 ORDER BY priority ASC`
      ).all().catch(() => ({ results: [] }));
      return jsonResponse({ rules: results || [] });
    }

    // ── Hooks ────────────────────────────────────────────────────────────────
    if (path === '/api/agentsam/hooks' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT * FROM agentsam_hook WHERE is_active = 1 ORDER BY event_type ASC`
      ).all().catch(() => ({ results: [] }));
      return jsonResponse({ hooks: results || [] });
    }

    // ── Fetch Allowlist ──────────────────────────────────────────────────────
    if (path === '/api/agentsam/fetch-allowlist' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT * FROM agentsam_fetch_domain_allowlist WHERE user_id = ? ORDER BY host ASC`
      ).bind(userId).all();
      return jsonResponse({ allowed: results || [], builtin: [...BUILTIN_FETCH_HOSTS] });
    }

    if (path === '/api/agentsam/fetch-allowlist' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const host = normalizeFetchHost(body.host || '');
      if (!host) return jsonResponse({ error: 'host required' }, 400);
      await env.DB.prepare(
        `INSERT OR IGNORE INTO agentsam_fetch_domain_allowlist
         (user_id, host, workspace_id, trust_scope, created_at, updated_at)
         VALUES (?, ?, ?, 'persistent', datetime('now'), datetime('now'))`
      ).bind(userId, host, body.workspace_id || null).run();
      return jsonResponse({ ok: true, host });
    }

    const allowlistDelete = path.match(/^\/api\/agentsam\/fetch-allowlist\/(.+)$/);
    if (allowlistDelete && method === 'DELETE') {
      const host = normalizeFetchHost(decodeURIComponent(allowlistDelete[1]));
      await env.DB.prepare(
        `DELETE FROM agentsam_fetch_domain_allowlist WHERE user_id = ? AND LOWER(TRIM(host)) = ?`
      ).bind(userId, host).run();
      return jsonResponse({ ok: true });
    }

    // ── Routing Rules ────────────────────────────────────────────────────────
    if (path === '/api/agentsam/routing-rules' && method === 'GET') {
      return jsonResponse({ rules: await getModelRoutingRules(env) });
    }

    // ── Gorilla XP ───────────────────────────────────────────────────────────
    if (path === '/api/gorilla/xp' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT * FROM gorilla_xp WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`
      ).bind(userId).all();
      const total = (results || []).reduce((s, r) => s + (r.xp_awarded || 0), 0);
      return jsonResponse({ total, events: results || [] });
    }

    if (path === '/api/gorilla/xp' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { event_type, xp_awarded = 0, metadata } = body;
      if (!event_type) return jsonResponse({ error: 'event_type required' }, 400);
      await env.DB.prepare(
        `INSERT INTO gorilla_xp (user_id, event_type, xp_awarded, streak_day, metadata)
         VALUES (?, ?, ?, 0, ?)`
      ).bind(userId, event_type, xp_awarded, metadata ? JSON.stringify(metadata) : null).run();
      return jsonResponse({ ok: true, xp_awarded });
    }

    // ── /api/agentsam/browser/trust ───────────────────────────────────────────
    if (path === '/api/agentsam/browser/trust' && method === 'GET') {
      const origin = url.searchParams.get('origin') || '';
      if (!env.DB || !origin) return jsonResponse({ trusted: true });
      const tenantId = tenantIdFromEnv(env);
      const row = await env.DB.prepare(
        `SELECT trust_scope FROM agentsam_browser_trusted_origin
         WHERE origin = ? AND user_id = ? LIMIT 1`
      ).bind(origin, tenantId).first().catch(() => null);
      return jsonResponse({ trusted: !!row, scope: row?.trust_scope || null });
    }

    if (path === '/api/agentsam/browser/trust' && method === 'POST') {
      const body   = await request.json().catch(() => ({}));
      const origin = String(body.origin || '').trim();
      const scope  = String(body.scope  || 'session').trim();
      if (!env.DB || !origin) return jsonResponse({ ok: false, error: 'origin required' });
      const tenantId = tenantIdFromEnv(env);
      await env.DB.prepare(
        `INSERT OR REPLACE INTO agentsam_browser_trusted_origin
         (user_id, origin, trust_scope, created_at)
         VALUES (?, ?, ?, datetime('now'))`
      ).bind(tenantId, origin, scope).run().catch(() => {});
      return jsonResponse({ ok: true, origin, scope });
    }

    return jsonResponse({ error: 'Agent Sam route not found', path }, 404);

  } catch (e) {
    console.error('[agentsam]', e?.message ?? e);
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}
