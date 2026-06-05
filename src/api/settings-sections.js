/**
 * API Service: Data-Backed Settings Sections
 *
 * Provides normalized read-only `GET /api/settings/{section}` endpoints for the
 * Settings panel. Each endpoint returns the shape:
 *
 *   {
 *     ok: boolean,
 *     generated_at: number,
 *     section: string,
 *     summary: Record<string, unknown>,
 *     rows: T[],
 *     warnings: Array<{ code, message, severity, table?, provider?, suggestedAction? }>,
 *     actions?: Array<{ key, label, enabled, reasonDisabled? }>,
 *     providers?: Array<ProviderConnectionState>,
 *   }
 *
 * Rules:
 * - Use existing D1 tables only. No schema creation.
 * - If a source table is missing, append a SOURCE_TABLE_NOT_FOUND warning and return empty rows.
 * - Never expose secret values. Token / key columns are stripped or masked.
 * - Disabled actions must include reasonDisabled.
 */

import { getAuthUser, jsonResponse } from '../core/auth.js';
import { resolveIntegrationUserId } from '../core/integration-user-id.js';

const TEXT_MASK = '************';

function nowIso() {
  return new Date().toISOString();
}

function unixSeconds() {
  return Math.floor(Date.now() / 1000);
}

/** True iff a D1 table exists. Result cached per-request via the passed map. */
async function tableExists(db, name, cache) {
  if (cache && cache.has(name)) return cache.get(name);
  let exists = false;
  try {
    const row = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`)
      .bind(name)
      .first();
    exists = !!row;
  } catch (_) {
    exists = false;
  }
  if (cache) cache.set(name, exists);
  return exists;
}

/** Defensive table query that returns [] and pushes a warning if the table is missing. */
async function safeQueryAll(db, table, sql, binds, warnings, cache) {
  const ok = await tableExists(db, table, cache);
  if (!ok) {
    warnings.push({
      code: 'SOURCE_TABLE_NOT_FOUND',
      message: `The expected table ${table} was not found, so its rows are not shown yet.`,
      severity: 'info',
      table,
    });
    return [];
  }
  try {
    const stmt = db.prepare(sql);
    const res = binds && binds.length ? await stmt.bind(...binds).all() : await stmt.all();
    return Array.isArray(res?.results) ? res.results : [];
  } catch (e) {
    warnings.push({
      code: 'SOURCE_QUERY_FAILED',
      message: `Query against ${table} failed: ${e?.message || String(e)}`,
      severity: 'warn',
      table,
    });
    return [];
  }
}

async function safeFirst(db, table, sql, binds, warnings, cache) {
  const ok = await tableExists(db, table, cache);
  if (!ok) {
    warnings.push({
      code: 'SOURCE_TABLE_NOT_FOUND',
      message: `The expected table ${table} was not found, so its rows are not shown yet.`,
      severity: 'info',
      table,
    });
    return null;
  }
  try {
    const stmt = db.prepare(sql);
    const row = binds && binds.length ? await stmt.bind(...binds).first() : await stmt.first();
    return row || null;
  } catch (e) {
    warnings.push({
      code: 'SOURCE_QUERY_FAILED',
      message: `Query against ${table} failed: ${e?.message || String(e)}`,
      severity: 'warn',
      table,
    });
    return null;
  }
}

function stripSecretFields(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const lk = k.toLowerCase();
    if (
      lk.includes('token') ||
      lk.includes('secret') ||
      lk.includes('api_key') ||
      lk.includes('apikey') ||
      lk.includes('refresh') ||
      lk.includes('access_key') ||
      lk.includes('client_secret') ||
      lk.includes('encrypted_value') ||
      lk === 'value'
    ) {
      out[k] = v == null ? null : TEXT_MASK;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function envelope(section, body) {
  return {
    ok: true,
    generated_at: Date.now(),
    section,
    summary: body.summary || {},
    rows: body.rows || [],
    warnings: body.warnings || [],
    actions: body.actions || [],
    providers: body.providers || undefined,
  };
}

// ─── Section: CI/CD ──────────────────────────────────────────────────────────
async function getCicd(env) {
  const warnings = [];
  const cache = new Map();
  const db = env.DB;

  const scripts = await safeQueryAll(
    db,
    'agentsam_scripts',
    `SELECT id, name, language, kind, is_active, owner_user_id, last_run_at, created_at, updated_at
     FROM agentsam_scripts ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 200`,
    [],
    warnings,
    cache,
  );

  const recentRuns = await safeQueryAll(
    db,
    'agentsam_script_runs',
    `SELECT id, script_id, status, exit_code, started_at, finished_at, duration_ms, triggered_by
     FROM agentsam_script_runs ORDER BY started_at DESC LIMIT 50`,
    [],
    warnings,
    cache,
  );

  const cicdRuns = await safeQueryAll(
    db,
    'cicd_pipeline_runs',
    `SELECT run_id, env, status, branch, commit_hash, triggered_at, completed_at, notes
     FROM cicd_pipeline_runs ORDER BY COALESCE(completed_at, triggered_at) DESC LIMIT 25`,
    [],
    warnings,
    cache,
  );

  const deploymentHealth = await safeQueryAll(
    db,
    'agentsam_deployment_health',
    `SELECT environment, status, last_checked_at, latency_ms, error_rate_pct, notes
     FROM agentsam_deployment_health ORDER BY last_checked_at DESC LIMIT 10`,
    [],
    warnings,
    cache,
  );

  const dashboardVersions = await safeQueryAll(
    db,
    'dashboard_versions',
    `SELECT version, deployed_at, git_sha, environment, deployed_by, notes
     FROM dashboard_versions ORDER BY deployed_at DESC LIMIT 10`,
    [],
    warnings,
    cache,
  );

  const activeScripts = scripts.filter((s) => Number(s.is_active) === 1).length;
  const recentFailures = recentRuns.filter(
    (r) => String(r.status || '').toLowerCase() === 'failed',
  ).length;
  const recentSuccesses = recentRuns.filter(
    (r) => String(r.status || '').toLowerCase() === 'passed' ||
           String(r.status || '').toLowerCase() === 'success',
  ).length;

  return envelope('cicd', {
    summary: {
      total_scripts: scripts.length,
      active_scripts: activeScripts,
      recent_runs: recentRuns.length,
      recent_failures: recentFailures,
      recent_successes: recentSuccesses,
      latest_dashboard_version: dashboardVersions[0]?.version || null,
      latest_deployed_at: dashboardVersions[0]?.deployed_at || cicdRuns[0]?.completed_at || null,
    },
    rows: scripts,
    warnings,
    actions: [
      {
        key: 'run_smoke',
        label: 'Run smoke pipeline',
        enabled: false,
        reasonDisabled:
          'Run is disabled here because the approval-gated runner is configured under /api/cicd, not Settings.',
      },
      {
        key: 'rollback',
        label: 'Rollback last deploy',
        enabled: false,
        reasonDisabled: 'Rollback is disabled because no safe rollback workflow is wired yet.',
      },
    ],
    extra: {
      recent_runs: recentRuns,
      cicd_pipeline_runs: cicdRuns,
      deployment_health: deploymentHealth,
      dashboard_versions: dashboardVersions,
    },
  });
}

// ─── Section: Network ────────────────────────────────────────────────────────
async function getNetwork(env, authUser, workspaceId) {
  const warnings = [];
  const cache = new Map();
  const db = env.DB;
  const wsId = workspaceId || '';

  const fetchAllowlist = await safeQueryAll(
    db,
    'agentsam_fetch_domain_allowlist',
    wsId
      ? `SELECT host, scope, notes, created_at FROM agentsam_fetch_domain_allowlist WHERE workspace_id = ? OR workspace_id IS NULL ORDER BY host`
      : `SELECT host, scope, notes, created_at FROM agentsam_fetch_domain_allowlist ORDER BY host LIMIT 200`,
    wsId ? [wsId] : [],
    warnings,
    cache,
  );

  const trustedOrigins = await safeQueryAll(
    db,
    'agentsam_browser_trusted_origin',
    `SELECT origin, scope, notes, created_at FROM agentsam_browser_trusted_origin ORDER BY origin LIMIT 200`,
    [],
    warnings,
    cache,
  );

  const workspaceDomains = await safeQueryAll(
    db,
    'workspace_domains',
    wsId
      ? `SELECT workspace_id, domain, status, verified_at, created_at FROM workspace_domains WHERE workspace_id = ? ORDER BY domain`
      : `SELECT workspace_id, domain, status, verified_at, created_at FROM workspace_domains ORDER BY workspace_id, domain LIMIT 200`,
    wsId ? [wsId] : [],
    warnings,
    cache,
  );

  const integrationEndpoints = await safeQueryAll(
    db,
    'integration_registry',
    `SELECT slug, display_name, base_url, auth_type, is_active FROM integration_registry ORDER BY display_name LIMIT 200`,
    [],
    warnings,
    cache,
  );

  return envelope('network', {
    summary: {
      fetch_allowlist_count: fetchAllowlist.length,
      trusted_origins_count: trustedOrigins.length,
      workspace_domains_count: workspaceDomains.length,
      integration_endpoints_count: integrationEndpoints.length,
      worker_base_url: env.WORKER_BASE_URL || null,
    },
    rows: workspaceDomains,
    warnings,
    actions: [
      {
        key: 'add_domain',
        label: 'Add workspace domain',
        enabled: false,
        reasonDisabled:
          'Add domain is disabled because no validated /api/settings/network/domains endpoint is wired yet.',
      },
      {
        key: 'add_trusted_origin',
        label: 'Add trusted origin',
        enabled: false,
        reasonDisabled:
          'Add trusted origin is disabled until a validation endpoint is wired.',
      },
    ],
    extra: {
      fetch_allowlist: fetchAllowlist,
      trusted_origins: trustedOrigins,
      integration_endpoints: integrationEndpoints,
    },
  });
}

// ─── Section: Notifications ──────────────────────────────────────────────────
async function getNotifications(env, authUser) {
  const warnings = [];
  const cache = new Map();
  const db = env.DB;

  warnings.push({
    code: 'NOTIFICATION_PREFS_TABLE_MISSING',
    message:
      'Notification preference storage is not connected yet. Toggles below mirror your profile settings until a dedicated table is wired.',
    severity: 'warn',
    suggestedAction: 'Schema for a notification preferences table is intentionally deferred this sprint.',
  });

  const recentErrors = await safeQueryAll(
    db,
    'agentsam_error_log',
    `SELECT id, severity, source, error_message AS message, created_at FROM agentsam_error_log ORDER BY created_at DESC LIMIT 25`,
    [],
    warnings,
    cache,
  );

  const escalations = await safeQueryAll(
    db,
    'agentsam_escalation',
    `SELECT id, model_attempted, chain_index, succeeded, error_message, created_at FROM agentsam_escalation ORDER BY created_at DESC LIMIT 25`,
    [],
    warnings,
    cache,
  );

  const approvals = await safeQueryAll(
    db,
    'agentsam_approval_queue',
    `SELECT id, tool_name, user_id, status, action_summary, created_at
     FROM agentsam_approval_queue ORDER BY created_at DESC LIMIT 25`,
    [],
    warnings,
    cache,
  );

  const webhookEvents = await safeQueryAll(
    db,
    'agentsam_webhook_events',
    `SELECT id, source, event_type, status, created_at FROM agentsam_webhook_events ORDER BY created_at DESC LIMIT 25`,
    [],
    warnings,
    cache,
  );

  const integrationEvents = await safeQueryAll(
    db,
    'integration_events',
    `SELECT id, slug, event_type, severity, created_at FROM integration_events ORDER BY created_at DESC LIMIT 25`,
    [],
    warnings,
    cache,
  );

  return envelope('notifications', {
    summary: {
      recent_errors: recentErrors.length,
      open_escalations: escalations.filter((e) => String(e.status || '').toLowerCase() === 'open').length,
      pending_approvals: approvals.filter((a) => String(a.status || '').toLowerCase() === 'pending').length,
      recent_webhook_events: webhookEvents.length,
      recent_integration_events: integrationEvents.length,
    },
    rows: [],
    warnings,
    actions: [
      {
        key: 'save_preferences',
        label: 'Save notification preferences',
        enabled: true,
        reasonDisabled: undefined,
      },
      {
        key: 'send_test_notification',
        label: 'Send test notification',
        enabled: false,
        reasonDisabled:
          'Send test is disabled because no test-notification dispatcher endpoint is wired yet.',
      },
    ],
    extra: {
      errors: recentErrors,
      escalations,
      approvals,
      webhook_events: webhookEvents,
      integration_events: integrationEvents,
    },
  });
}

// ─── Section: Docs ───────────────────────────────────────────────────────────
async function getDocs(env, authUser, workspaceId) {
  const warnings = [];
  const cache = new Map();
  const db = env.DB;
  const wsId = workspaceId || '';

  const cmsPages = await safeQueryAll(
    db,
    'cms_pages',
    wsId
      ? `SELECT id, slug, title, status, updated_at FROM cms_pages WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 50`
      : `SELECT id, slug, title, status, updated_at FROM cms_pages ORDER BY updated_at DESC LIMIT 50`,
    wsId ? [wsId] : [],
    warnings,
    cache,
  );

  const ruleDocs = await safeQueryAll(
    db,
    'agentsam_rules_document',
    `SELECT id, title, scope, is_active, updated_at FROM agentsam_rules_document
      WHERE (workspace_id = ? OR workspace_id IS NULL)
        AND (user_id = ? OR user_id IS NULL)
      ORDER BY COALESCE(updated_at, id) DESC LIMIT 50`,
    [wsId, String(authUser?.id || '')],
    warnings,
    cache,
  );

  const projectContext = await safeQueryAll(
    db,
    'agentsam_project_context',
    `SELECT id, scope_type, scope_id, kind, updated_at FROM agentsam_project_context ORDER BY COALESCE(updated_at, id) DESC LIMIT 25`,
    [],
    warnings,
    cache,
  );

  const cmsAssets = await safeFirst(
    db,
    'cms_assets',
    `SELECT COUNT(*) AS n FROM cms_assets`,
    [],
    warnings,
    cache,
  );

  const r2Inventory = await safeFirst(
    db,
    'r2_object_inventory',
    `SELECT COUNT(*) AS n FROM r2_object_inventory`,
    [],
    warnings,
    cache,
  );

  return envelope('docs', {
    summary: {
      cms_pages_count: cmsPages.length,
      rule_documents_count: ruleDocs.length,
      project_context_entries: projectContext.length,
      cms_assets_total: Number(cmsAssets?.n || 0),
      r2_object_inventory_total: Number(r2Inventory?.n || 0),
      knowledge_graph_status: 'supabase',
      knowledge_graph_note:
        'Supabase tables documents / knowledge_edges / semantic_search_log power retrieval; not enumerated here for size.',
    },
    rows: cmsPages,
    warnings,
    actions: [
      {
        key: 'reingest_docs',
        label: 'Re-ingest documentation',
        enabled: false,
        reasonDisabled:
          'Re-ingest is disabled because no safe doc-ingest endpoint is wired in this dashboard yet.',
      },
    ],
    extra: {
      rule_documents: ruleDocs,
      project_context: projectContext,
    },
  });
}

// ─── Section: GitHub ─────────────────────────────────────────────────────────
async function getGithub(env, authUser, workspaceId) {
  const warnings = [];
  const cache = new Map();
  const db = env.DB;
  const userId = (await resolveIntegrationUserId(env, authUser)) || String(authUser?.id || '').trim();
  const wsFilter = workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : null;

  const connections = await safeQueryAll(
    db,
    'integration_connections',
    `SELECT id, provider_key, status, account_label, resource_label, last_synced_at, created_at, updated_at
     FROM integration_connections WHERE user_id = ? AND provider_key IN ('github','github_app') ORDER BY updated_at DESC LIMIT 20`,
    [userId],
    warnings,
    cache,
  );

  const oauthTokens = await safeQueryAll(
    db,
    'user_oauth_tokens',
    `SELECT provider, account_label, scope, created_at, updated_at, expires_at
     FROM user_oauth_tokens WHERE user_id = ? AND provider IN ('github','github_app') ORDER BY updated_at DESC LIMIT 20`,
    [userId],
    warnings,
    cache,
  );

  const oauthSafe = oauthTokens.map((row) => ({
    provider: row.provider,
    account_label: row.account_label,
    scope: row.scope,
    created_at: row.created_at,
    updated_at: row.updated_at,
    expires_at: row.expires_at,
  }));

  const indexJobSql = wsFilter
    ? `SELECT id, repo_full_name, status, started_at, finished_at, indexed_files
       FROM agentsam_code_index_job WHERE user_id = ? AND workspace_id = ?
       ORDER BY COALESCE(finished_at, started_at) DESC LIMIT 10`
    : `SELECT id, repo_full_name, status, started_at, finished_at, indexed_files
       FROM agentsam_code_index_job WHERE user_id = ?
       ORDER BY COALESCE(finished_at, started_at) DESC LIMIT 10`;
  const indexJobBinds = wsFilter ? [userId, wsFilter] : [userId];

  const indexJobs = await safeQueryAll(
    db,
    'agentsam_code_index_job',
    indexJobSql,
    indexJobBinds,
    warnings,
    cache,
  );

  const auditLog = await safeQueryAll(
    db,
    'integration_audit_log',
    `SELECT id, provider, action, status, created_at
     FROM integration_audit_log
     WHERE user_id = ? AND provider IN ('github','github_app')
     ORDER BY created_at DESC LIMIT 25`,
    [userId],
    warnings,
    cache,
  );

  const connected = connections.find(
    (c) => String(c.status || '').toLowerCase() === 'connected',
  );
  const provider = {
    provider: 'github',
    status: connected ? 'connected' : connections.length ? 'degraded' : 'not_connected',
    accountLabel: connected?.account_label || connections[0]?.account_label || null,
    resourceLabel: connected?.resource_label || connections[0]?.resource_label || null,
    lastCheckedAt: connected?.last_synced_at || connections[0]?.updated_at || null,
    capabilities: ['repo:read', 'codebase:index', 'webhooks:receive'],
    warnings: [],
  };

  return envelope('github', {
    summary: {
      connection_status: provider.status,
      connection_count: connections.length,
      oauth_token_count: oauthTokens.length,
      latest_index_job_status: indexJobs[0]?.status || null,
      latest_index_job_at: indexJobs[0]?.finished_at || indexJobs[0]?.started_at || null,
    },
    rows: connections,
    warnings,
    providers: [provider],
    actions: [
      {
        key: 'connect_github',
        label: connected ? 'Reconnect GitHub' : 'Connect GitHub',
        enabled: true,
      },
      {
        key: 'reindex_codebase',
        label: 'Re-index codebase',
        enabled: false,
        reasonDisabled:
          'Re-index is disabled because no safe re-index trigger endpoint is wired here yet.',
      },
    ],
    extra: {
      oauth_tokens: oauthSafe,
      code_index_jobs: indexJobs,
      audit_log: auditLog,
    },
  });
}

// ─── Section: Themes ─────────────────────────────────────────────────────────
async function getThemesStatus(env, authUser, workspaceId) {
  const warnings = [];
  const cache = new Map();
  const db = env.DB;
  const userId = String(authUser?.id || '').trim();
  const wsId = workspaceId || '';

  const themes = await safeQueryAll(
    db,
    'cms_themes',
    `SELECT id, slug, display_name, scope, preview_url, is_default, created_at, updated_at
     FROM cms_themes ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 50`,
    [],
    warnings,
    cache,
  );

  const userPref = await safeFirst(
    db,
    'cms_theme_preferences',
    `SELECT user_id, workspace_id, theme_id, scope, updated_at FROM cms_theme_preferences WHERE user_id = ? LIMIT 1`,
    [userId],
    warnings,
    cache,
  );

  const wsPref =
    wsId && (await tableExists(db, 'cms_theme_preferences', cache))
      ? await safeFirst(
          db,
          'cms_theme_preferences',
          `SELECT user_id, workspace_id, theme_id, scope, updated_at FROM cms_theme_preferences WHERE workspace_id = ? AND scope IN ('workspace','global') ORDER BY updated_at DESC LIMIT 1`,
          [wsId],
          warnings,
          cache,
        )
      : null;

  return envelope('themes', {
    summary: {
      theme_count: themes.length,
      user_theme_id: userPref?.theme_id || null,
      workspace_theme_id: wsPref?.theme_id || null,
      scope: userPref?.scope || wsPref?.scope || 'user',
    },
    rows: themes,
    warnings,
    actions: [
      {
        key: 'save_theme',
        label: 'Save theme preference',
        enabled: true,
      },
    ],
  });
}

// ─── Section: Hooks ──────────────────────────────────────────────────────────
async function getHooksStatus(env) {
  const warnings = [];
  const cache = new Map();
  const db = env.DB;

  const hooks = await safeQueryAll(
    db,
    'agentsam_hook',
    `SELECT id, trigger, command, provider, is_active, created_at, updated_at FROM agentsam_hook ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 100`,
    [],
    warnings,
    cache,
  );

  const executions = await safeQueryAll(
    db,
    'agentsam_hook_execution',
    `SELECT id, hook_id, status, started_at, finished_at, exit_code FROM agentsam_hook_execution ORDER BY started_at DESC LIMIT 50`,
    [],
    warnings,
    cache,
  );

  const cronRuns = await safeQueryAll(
    db,
    'agentsam_cron_runs',
    `SELECT id, job_name, status, started_at, finished_at, duration_ms FROM agentsam_cron_runs ORDER BY started_at DESC LIMIT 20`,
    [],
    warnings,
    cache,
  );

  const compaction = await safeQueryAll(
    db,
    'agentsam_compaction_events',
    `SELECT id, provider, model_key, tokens_before, tokens_after,
            COALESCE(tokens_saved, tokens_before - tokens_after) AS tokens_saved,
            cost_saved_usd, compaction_strategy, summary_text, compacted_at,
            agent_id, workspace_id, user_id, metadata_json
     FROM agentsam_compaction_events ORDER BY compacted_at DESC LIMIT 20`,
    [],
    warnings,
    cache,
  );

  const webhookWeekly = await safeQueryAll(
    db,
    'agentsam_webhook_weekly',
    `SELECT week, total_events, succeeded, failed FROM agentsam_webhook_weekly ORDER BY week DESC LIMIT 8`,
    [],
    warnings,
    cache,
  );

  return envelope('hooks', {
    summary: {
      hook_count: hooks.length,
      active_hooks: hooks.filter((h) => Number(h.is_active) === 1).length,
      recent_executions: executions.length,
      recent_failures: executions.filter((e) => Number(e.exit_code) !== 0 && e.exit_code != null).length,
      latest_cron_run: cronRuns[0]?.started_at || null,
      latest_compaction: compaction[0]?.compacted_at || null,
    },
    rows: hooks,
    warnings,
    extra: {
      executions,
      cron_runs: cronRuns,
      compaction_events: compaction,
      webhook_weekly: webhookWeekly,
    },
  });
}

// ─── Section: Plan & Usage status ────────────────────────────────────────────
async function getBillingStatus(env, authUser, workspaceId) {
  const warnings = [];
  const cache = new Map();
  const db = env.DB;
  const wsId = workspaceId || '';
  const userId = String(authUser?.id || '').trim();

  const plans = await safeQueryAll(
    db,
    'billing_plans',
    `SELECT id, display_name, monthly_token_limit, daily_request_limit, monthly_price_usd FROM billing_plans ORDER BY monthly_price_usd ASC, id ASC LIMIT 25`,
    [],
    warnings,
    cache,
  );

  const subscription = await safeFirst(
    db,
    'agentsam_subscription_registry',
    `SELECT user_id, workspace_id, plan_id, status, started_at, current_period_end FROM agentsam_subscription_registry WHERE user_id = ? ORDER BY started_at DESC LIMIT 1`,
    [userId],
    warnings,
    cache,
  );

  const dailyRollups = await safeQueryAll(
    db,
    'agentsam_usage_rollups_daily',
    wsId
      ? `SELECT day, total_tokens, total_cost_usd, request_count FROM agentsam_usage_rollups_daily WHERE workspace_id = ? ORDER BY day DESC LIMIT 30`
      : `SELECT day, total_tokens, total_cost_usd, request_count FROM agentsam_usage_rollups_daily ORDER BY day DESC LIMIT 30`,
    wsId ? [wsId] : [],
    warnings,
    cache,
  );

  const wsUsage = await safeFirst(
    db,
    'workspace_usage_metrics',
    wsId
      ? `SELECT workspace_id, period_start, period_end, total_tokens, total_cost_usd FROM workspace_usage_metrics WHERE workspace_id = ? ORDER BY period_end DESC LIMIT 1`
      : `SELECT workspace_id, period_start, period_end, total_tokens, total_cost_usd FROM workspace_usage_metrics ORDER BY period_end DESC LIMIT 1`,
    wsId ? [wsId] : [],
    warnings,
    cache,
  );

  return envelope('billing', {
    summary: {
      plan_count: plans.length,
      subscription_status: subscription?.status || null,
      subscription_plan: subscription?.plan_id || null,
      latest_daily_cost_usd: Number(dailyRollups[0]?.total_cost_usd ?? 0),
      latest_daily_tokens: Number(dailyRollups[0]?.total_tokens ?? 0),
      workspace_period_cost_usd: Number(wsUsage?.total_cost_usd ?? 0),
      workspace_period_tokens: Number(wsUsage?.total_tokens ?? 0),
    },
    rows: plans,
    warnings,
    extra: {
      daily_rollups: dailyRollups,
      workspace_usage: wsUsage,
      subscription,
    },
  });
}

// ─── Section: Tools status ───────────────────────────────────────────────────
async function getToolsStatus(env, authUser, workspaceId) {
  const warnings = [];
  const cache = new Map();
  const db = env.DB;
  const wsId = workspaceId || '';

  const servers = await safeQueryAll(
    db,
    'agentsam_mcp_servers',
    `SELECT id, name, endpoint_url, status, transport, last_seen_at FROM agentsam_mcp_servers ORDER BY name LIMIT 50`,
    [],
    warnings,
    cache,
  );

  const tools = await safeQueryAll(
    db,
    'agentsam_tools',
    `SELECT id, tool_key, json_extract(handler_config, '$.server_key') AS server_key, risk_level, is_active AS is_enabled, updated_at FROM agentsam_tools ORDER BY tool_key LIMIT 200`,
    [],
    warnings,
    cache,
  );

  const allowlist = await safeQueryAll(
    db,
    'agentsam_mcp_allowlist',
    wsId
      ? `SELECT tool_key, scope, notes, created_at FROM agentsam_mcp_allowlist WHERE workspace_id = ? OR workspace_id IS NULL ORDER BY tool_key`
      : `SELECT tool_key, scope, notes, created_at FROM agentsam_mcp_allowlist ORDER BY tool_key LIMIT 200`,
    wsId ? [wsId] : [],
    warnings,
    cache,
  );

  const recentExec = await safeQueryAll(
    db,
    'agentsam_mcp_tool_execution',
    `SELECT id, tool_key, status, latency_ms, created_at FROM agentsam_mcp_tool_execution ORDER BY created_at DESC LIMIT 25`,
    [],
    warnings,
    cache,
  );

  const stats = await safeQueryAll(
    db,
    'agentsam_tool_stats_compacted',
    `SELECT tool_key, total_calls, success_calls, failure_calls, avg_latency_ms, updated_at FROM agentsam_tool_stats_compacted ORDER BY total_calls DESC LIMIT 25`,
    [],
    warnings,
    cache,
  );

  const fetchAllow = await safeQueryAll(
    db,
    'agentsam_fetch_domain_allowlist',
    `SELECT host, scope, notes FROM agentsam_fetch_domain_allowlist ORDER BY host LIMIT 100`,
    [],
    warnings,
    cache,
  );

  const cmdAllow = await safeQueryAll(
    db,
    'agentsam_command_allowlist',
    `SELECT command, scope, notes FROM agentsam_command_allowlist ORDER BY command LIMIT 100`,
    [],
    warnings,
    cache,
  );

  return envelope('tools', {
    summary: {
      server_count: servers.length,
      tool_count: tools.length,
      allowlisted_tool_count: allowlist.length,
      fetch_allowlist_count: fetchAllow.length,
      command_allowlist_count: cmdAllow.length,
      recent_tool_executions: recentExec.length,
      recent_failures: recentExec.filter((r) => String(r.status || '').toLowerCase() === 'error' || String(r.status || '').toLowerCase() === 'failed').length,
    },
    rows: servers,
    warnings,
    extra: {
      tools,
      allowlist,
      command_allowlist: cmdAllow,
      fetch_allowlist: fetchAllow,
      executions: recentExec,
      stats,
    },
  });
}

// ─── Section: Storage status ─────────────────────────────────────────────────
async function getStorageStatus(env, authUser, workspaceId) {
  const warnings = [];
  const cache = new Map();
  const db = env.DB;
  const wsId = workspaceId || '';
  const userId = String(authUser?.id || '').trim();

  const r2Buckets = await safeQueryAll(
    db,
    'r2_buckets',
    `SELECT name, region, created_at FROM r2_buckets ORDER BY name LIMIT 100`,
    [],
    warnings,
    cache,
  );

  const r2Summary = await safeQueryAll(
    db,
    'r2_bucket_summary',
    `SELECT bucket_name, object_count, total_size_bytes, updated_at FROM r2_bucket_summary ORDER BY total_size_bytes DESC LIMIT 50`,
    [],
    warnings,
    cache,
  );

  const policies = await safeQueryAll(
    db,
    'storage_policies',
    `SELECT id, scope, scope_id, policy_kind, value, updated_at FROM storage_policies ORDER BY updated_at DESC LIMIT 50`,
    [],
    warnings,
    cache,
  );

  const userPrefs = await safeFirst(
    db,
    'user_storage_preferences',
    `SELECT user_id, default_provider, ui_preferences_json, updated_at FROM user_storage_preferences WHERE user_id = ? LIMIT 1`,
    [userId],
    warnings,
    cache,
  );

  const projectStorage = await safeQueryAll(
    db,
    'project_storage',
    wsId
      ? `SELECT project_id, provider, resource_label, size_bytes, updated_at FROM project_storage WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 50`
      : `SELECT project_id, provider, resource_label, size_bytes, updated_at FROM project_storage ORDER BY updated_at DESC LIMIT 50`,
    wsId ? [wsId] : [],
    warnings,
    cache,
  );

  const vectorIndexes = await safeQueryAll(
    db,
    'vectorize_index_registry',
    `SELECT display_name, binding_name, dimensions, metric, is_active,
            stored_vectors, last_indexed_at
     FROM vectorize_index_registry
     ORDER BY display_name LIMIT 50`,
    [],
    warnings,
    cache,
  );

  // Provider connection states
  const cloudflareConnected = r2Buckets.length > 0 || r2Summary.length > 0;
  const cloudflareProvider = {
    provider: 'cloudflare',
    status: cloudflareConnected ? 'connected' : 'unknown',
    accountLabel: env.CF_ACCOUNT_LABEL || null,
    resourceLabel: r2Buckets.length ? `${r2Buckets.length} R2 buckets` : null,
    lastCheckedAt: r2Summary[0]?.updated_at || null,
    capabilities: ['r2', 'kv', 'd1', 'workers_ai', 'vectorize'],
    warnings: [],
  };

  const supabaseProvider = {
    provider: 'supabase',
    status: env.SUPABASE_URL ? 'connected' : 'not_connected',
    accountLabel: null,
    resourceLabel: env.SUPABASE_URL ? 'documents / codebase_* tables' : null,
    lastCheckedAt: null,
    capabilities: ['postgres', 'rag', 'auth', 'storage'],
    warnings: env.SUPABASE_URL
      ? []
      : [
          {
            code: 'SUPABASE_URL_MISSING',
            message: 'SUPABASE_URL is not set in this environment.',
            severity: 'warn',
          },
        ],
  };

  const oauthRows = await safeQueryAll(
    db,
    'user_oauth_tokens',
    `SELECT provider, account_label, updated_at FROM user_oauth_tokens WHERE user_id = ? AND provider IN ('google','google_drive','github')`,
    [userId],
    warnings,
    cache,
  );
  const driveRow = oauthRows.find((r) =>
    ['google_drive', 'google'].includes(String(r.provider || '').toLowerCase()),
  );
  const githubRow = oauthRows.find((r) => String(r.provider || '').toLowerCase() === 'github');

  const driveProvider = {
    provider: 'google_drive',
    status: driveRow ? 'connected' : 'not_connected',
    accountLabel: driveRow?.account_label || null,
    lastCheckedAt: driveRow?.updated_at || null,
    capabilities: ['files:read'],
    warnings: [],
  };

  const githubProvider = {
    provider: 'github',
    status: githubRow ? 'connected' : 'not_connected',
    accountLabel: githubRow?.account_label || null,
    lastCheckedAt: githubRow?.updated_at || null,
    capabilities: ['repo:read'],
    warnings: [],
  };

  return envelope('storage', {
    summary: {
      r2_bucket_count: r2Buckets.length,
      r2_object_count_total: r2Summary.reduce((acc, r) => acc + Number(r.object_count || 0), 0),
      r2_size_bytes_total: r2Summary.reduce((acc, r) => acc + Number(r.total_size_bytes || 0), 0),
      vector_index_count: vectorIndexes.length,
      project_storage_rows: projectStorage.length,
      default_provider: userPrefs?.default_provider || null,
    },
    rows: r2Summary,
    warnings,
    providers: [cloudflareProvider, supabaseProvider, driveProvider, githubProvider],
    actions: [
      {
        key: 'refresh_inventory',
        label: 'Refresh inventory',
        enabled: false,
        reasonDisabled:
          'Refresh inventory is disabled because no safe refresh-inventory endpoint is wired here yet.',
      },
      {
        key: 'cleanup_review',
        label: 'Open cleanup review',
        enabled: true,
      },
    ],
    extra: {
      buckets: r2Buckets,
      policies,
      vector_indexes: vectorIndexes,
      project_storage: projectStorage,
      user_prefs: userPrefs,
    },
  });
}

// ─── Section: Integrations status ────────────────────────────────────────────
async function getIntegrationsStatus(env, authUser) {
  const warnings = [];
  const cache = new Map();
  const db = env.DB;
  const userId = String(authUser?.id || '').trim();

  const catalog = await safeQueryAll(
    db,
    'integration_catalog',
    `SELECT id, slug, display_name, category, auth_type, capabilities, is_published FROM integration_catalog ORDER BY display_name LIMIT 100`,
    [],
    warnings,
    cache,
  );

  const connections = await safeQueryAll(
    db,
    'integration_connections',
    `SELECT id, provider_key, status, account_label, resource_label, last_synced_at, created_at, updated_at FROM integration_connections WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100`,
    [userId],
    warnings,
    cache,
  );

  const healthChecks = await safeQueryAll(
    db,
    'integration_health_checks',
    `SELECT slug, status, latency_ms, error_message, checked_at FROM integration_health_checks ORDER BY checked_at DESC LIMIT 50`,
    [],
    warnings,
    cache,
  );

  const events = await safeQueryAll(
    db,
    'integration_events',
    `SELECT id, slug, event_type, severity, created_at FROM integration_events ORDER BY created_at DESC LIMIT 25`,
    [],
    warnings,
    cache,
  );

  const PROVIDERS = [
    'cloudflare',
    'supabase',
    'google_drive',
    'github',
    'openai',
    'anthropic',
    'google_ai',
    'workers_ai',
    'resend',
  ];

  const providers = PROVIDERS.map((slug) => {
    const conn = connections.find((c) => String(c.provider_key || '').toLowerCase().includes(slug));
    const health = healthChecks.find((h) => String(h.slug || '').toLowerCase() === slug);
    const status = conn
      ? String(conn.status || '').toLowerCase() || 'connected'
      : health
        ? String(health.status || '').toLowerCase()
        : 'not_connected';
    return {
      provider: slug,
      status,
      accountLabel: conn?.account_label || null,
      resourceLabel: conn?.resource_label || null,
      lastCheckedAt: health?.checked_at || conn?.last_synced_at || conn?.updated_at || null,
      capabilities: [],
      warnings: [],
    };
  });

  return envelope('integrations', {
    summary: {
      catalog_count: catalog.length,
      connection_count: connections.length,
      connected_count: connections.filter((c) => String(c.status || '').toLowerCase() === 'connected').length,
      recent_health_checks: healthChecks.length,
      recent_events: events.length,
    },
    rows: connections,
    warnings,
    providers,
    extra: {
      catalog,
      health_checks: healthChecks,
      events,
    },
  });
}

// ─── Public dispatcher ───────────────────────────────────────────────────────
/**
 * Dispatcher for normalized data-backed status endpoints under /api/settings/*.
 * Returns null if the path is not handled, so the legacy dispatcher continues.
 */
export async function handleSettingsSectionStatusApi(request, env, authUser, url, pathLower, method) {
  if (method !== 'GET') return null;
  if (!env?.DB) return null;
  if (!authUser) return null;

  const wsParam = url.searchParams.get('workspace_id');
  const workspaceId = wsParam != null && String(wsParam).trim() !== '' ? String(wsParam).trim() : null;

  try {
    if (pathLower === '/api/settings/cicd') return jsonResponse(await getCicd(env));
    if (pathLower === '/api/settings/network')
      return jsonResponse(await getNetwork(env, authUser, workspaceId));
    if (pathLower === '/api/settings/notifications')
      return jsonResponse(await getNotifications(env, authUser));
    if (pathLower === '/api/settings/docs')
      return jsonResponse(await getDocs(env, authUser, workspaceId));
    if (pathLower === '/api/settings/github') return jsonResponse(await getGithub(env, authUser, workspaceId));
    if (pathLower === '/api/settings/themes/status')
      return jsonResponse(await getThemesStatus(env, authUser, workspaceId));
    if (pathLower === '/api/settings/hooks/status') return jsonResponse(await getHooksStatus(env));
    if (pathLower === '/api/settings/billing/status')
      return jsonResponse(await getBillingStatus(env, authUser, workspaceId));
    if (pathLower === '/api/settings/tools/status')
      return jsonResponse(await getToolsStatus(env, authUser, workspaceId));
    if (pathLower === '/api/settings/storage/status')
      return jsonResponse(await getStorageStatus(env, authUser, workspaceId));
    if (pathLower === '/api/settings/integrations/status')
      return jsonResponse(await getIntegrationsStatus(env, authUser));
  } catch (e) {
    return jsonResponse(
      {
        ok: false,
        section: pathLower,
        error: e?.message || String(e),
        warnings: [
          {
            code: 'SECTION_HANDLER_FAILED',
            message: `Section handler crashed: ${e?.message || String(e)}`,
            severity: 'critical',
          },
        ],
      },
      500,
    );
  }

  return null;
}

// Suppress unused export warnings for helpers that are exported for tests.
export { stripSecretFields, tableExists, safeQueryAll, safeFirst };
