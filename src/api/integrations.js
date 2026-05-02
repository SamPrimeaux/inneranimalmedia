// src/api/integrations.js
/**
 * API Service: Integrations Controller
 * Owns /api/integrations/* plus inbound provider webhooks.
 */
import { getAuthUser, isSamOnlyUser, jsonResponse, fallbackSystemTenantId } from '../core/auth.js';
import { ensureOauthTokenColumns } from './oauth.js';
import { recordWorkerAnalyticsError } from './telemetry.js';
import { handleIntegrationsConnectRoutes } from './integrations/connect.js';

const REGISTRY_SEED = [
    ['int_github', 'github', 'GitHub', 'source_control', 'oauth2', 'connected', 10, null],
    ['int_google_drive', 'google_drive', 'Google Drive', 'storage', 'oauth2', 'connected', 20, null],
    ['int_cloudflare_oauth', 'cloudflare_oauth', 'Cloudflare (OAuth)', 'deployment', 'oauth2', 'disconnected', 25, 'CLOUDFLARE_OAUTH_CLIENT_ID'],
    ['int_cloudflare_r2', 'cloudflare_r2', 'Cloudflare R2', 'storage', 'worker_binding', 'connected', 30, 'R2'],
    ['int_mcp', 'mcp_servers', 'MCP Servers', 'automation', 'api_key', 'connected', 40, null],
    ['int_resend', 'resend', 'Resend', 'communication', 'api_key', 'connected', 50, 'RESEND_API_KEY'],
    ['int_anthropic', 'anthropic', 'Anthropic', 'ai_provider', 'api_key', 'connected', 60, 'ANTHROPIC_API_KEY'],
    ['int_openai', 'openai', 'OpenAI', 'ai_provider', 'api_key', 'connected', 70, 'OPENAI_API_KEY'],
    ['int_google_ai', 'google_ai', 'Google AI', 'ai_provider', 'api_key', 'connected', 80, 'GOOGLE_AI_API_KEY'],
    ['int_bluebubbles', 'bluebubbles', 'BlueBubbles', 'communication', 'webhook', 'connected', 90, 'BLUEBUBBLES_WEBHOOK_SECRET'],
    ['int_cloudflare_images', 'cloudflare_images', 'Cloudflare Images', 'storage', 'worker_binding', 'connected', 100, 'CLOUDFLARE_IMAGES_ACCOUNT_HASH'],
    ['int_vectorize', 'vectorize', 'Vectorize', 'analytics', 'worker_binding', 'connected', 110, 'VECTORIZE'],
    ['int_hyperdrive', 'hyperdrive', 'Hyperdrive (Supabase)', 'database', 'worker_binding', 'connected', 120, 'HYPERDRIVE'],
    ['int_browser_rendering', 'browser_rendering', 'Browser Rendering', 'automation', 'worker_binding', 'connected', 130, 'MYBROWSER'],
    ['int_supabase', 'supabase', 'Supabase', 'database', 'api_key', 'connected', 140, 'SUPABASE_SERVICE_ROLE_KEY'],
    ['int_supabase_oauth', 'supabase_oauth', 'Supabase (OAuth)', 'database', 'oauth2', 'disconnected', 145, 'SUPABASE_OAUTH_CLIENT_ID'],
    ['int_cursor', 'cursor', 'Cursor', 'automation', 'api_key', 'connected', 150, 'CURSOR_API_KEY'],
    ['int_claude_code', 'claude_code', 'Claude Code', 'automation', 'api_key', 'disconnected', 160, 'CLAUDE_CODE_API_KEY'],
];

const OAUTH_PROVIDER_ALIASES = {
    github: 'github',
    google_drive: 'google_drive',
    google_gmail: 'google_gmail',
    cloudflare_oauth: 'cloudflare',
    supabase_oauth: 'supabase',
};

const PROVIDER_COLOR_SLUGS = {
    anthropic: 'anthropic_api',
    claude_code: 'claude_pro',
    cloudflare_images: 'cf_images',
    cloudflare_r2: 'cf_r2',
    cloudflare_oauth: 'cloudflare',
    cursor: 'cursor_api',
    github: 'github',
    google_ai: 'google_antigravity',
    google_drive: 'google_workspace',
    hyperdrive: 'supabase',
    mcp_servers: 'cf_workers',
    openai: 'openai_api',
    resend: 'resend',
    supabase: 'supabase',
    supabase_oauth: 'supabase',
    vectorize: 'workers_ai',
    browser_rendering: 'cf_workers',
    bluebubbles: 'bluebubbles',
    aws_s3: 'aws',
};

/**
 * Main switch-board for Integration webhooks.
 */
export async function handleIntegrationsRequest(request, envArg, ctxArg, authUserArg) {
    const { env, ctx, authUser: providedAuthUser } = normalizeArgs(envArg, ctxArg, authUserArg);
    const url = new URL(request.url);
    const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    // 1. BlueBubbles Webhook Gate
    if (pathLower === '/api/integrations/bluebubbles/webhook' && method === 'POST') {
        return handleBlueBubblesWebhook(request, env, ctx);
    }

    // 2. Resend General Webhook Hook
    if ((pathLower === '/api/integrations/resend/webhook' || pathLower === '/api/webhooks/resend') && method === 'POST') {
        const secret = request.headers.get('X-Resend-Webhook-Secret') || url.searchParams.get('secret');
        if (env.RESEND_WEBHOOK_SECRET && secret !== env.RESEND_WEBHOOK_SECRET) {
            return jsonResponse({ error: 'Invalid webhook secret' }, 403);
        }
        return handleResendWebhook(request, env, ctx);
    }

    // 3. Resend Inbound Email Hook (Explicit path)
    if (pathLower === '/api/email/inbound' && method === 'POST') {
        const secret = request.headers.get('X-Resend-Inbound-Secret') || url.searchParams.get('secret');
        if (env.RESEND_INBOUND_WEBHOOK_SECRET && secret !== env.RESEND_INBOUND_WEBHOOK_SECRET) {
            return jsonResponse({ error: 'Invalid inbound secret' }, 403);
        }
        return handleResendWebhook(request, env, ctx);
    }

    if (!pathLower.startsWith('/api/integrations')) return null;

    const authUser = providedAuthUser || await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    await ensureIntegrationTables(env, resolveTenantId(authUser, env));

    const connectRes = await handleIntegrationsConnectRoutes(
        request,
        env,
        ctx,
        authUser,
        url,
        pathLower,
        method,
    );
    if (connectRes) return connectRes;

    // ── GET /api/integrations (lightweight list) ─────────────────────────────
    if (method === 'GET' && pathLower === '/api/integrations') {
        const tenantId = resolveTenantId(authUser, env);
        try {
            const { results } = await env.DB.prepare(
                `SELECT id, tenant_id, provider_key, display_name, category, auth_type, status,
                        scopes_json, config_json, account_display, secret_binding_name,
                        last_sync_at, last_health_check_at, last_health_latency_ms, last_health_status,
                        is_enabled, sort_order, created_at, updated_at
                 FROM integration_registry
                 WHERE tenant_id = ? AND COALESCE(is_enabled, 1) = 1
                 ORDER BY sort_order ASC, display_name ASC`,
            ).bind(tenantId).all();
            const integrations = (results || []).filter(Boolean);
            return jsonResponse({ integrations, total: integrations.length });
        } catch (e) {
            return jsonResponse({ integrations: [], total: 0, error: String(e?.message || e) }, 200);
        }
    }

    if (method === 'GET' && pathLower === '/api/integrations/status') {
        return handleLegacyStatus(env, authUser);
    }
    if (method === 'GET' && pathLower === '/api/integrations/summary') {
        return handleSummary(env, authUser);
    }
    if (method === 'GET' && pathLower === '/api/integrations/events') {
        return handleEvents(env, authUser, url);
    }
    if (method === 'GET' && pathLower === '/api/integrations/webhooks') {
        return handleWebhooks(env, authUser);
    }
    if (method === 'GET' && pathLower === '/api/integrations/mcp-tools') {
        return handleMcpTools(env, authUser);
    }
    if (method === 'GET' && pathLower === '/api/integrations/api-keys') {
        return handleApiKeys(env, authUser);
    }
    if (method === 'POST' && pathLower === '/api/integrations/api-keys') {
        return handleCreateApiKey(env, authUser, request);
    }

    if (method === 'DELETE' && pathLower === '/api/integrations/supabase') {
        return handleSupabaseIntegrationDelete(env, authUser);
    }

    const actionMatch = pathLower.match(/^\/api\/integrations\/([^/]+)\/(test|sync|disconnect|settings|detail)$/);
    if (actionMatch) {
        const provider = normalizeProviderKey(actionMatch[1]);
        const action = actionMatch[2];
        if (action === 'detail' && method === 'GET') return handleProviderDetail(env, authUser, provider);
        if (action === 'test' && method === 'POST') return handleProviderTest(env, authUser, provider);
        if (action === 'sync' && method === 'POST') return handleProviderSync(env, authUser, provider);
        if (action === 'disconnect' && method === 'POST') return handleProviderDisconnect(env, authUser, provider);
        if (action === 'settings' && method === 'PATCH') return handleProviderSettings(env, authUser, provider, request);
    }

    const rotateMatch = pathLower.match(/^\/api\/integrations\/([^/]+)\/webhook\/rotate-secret$/);
    if (rotateMatch && method === 'POST') {
        return handleRotateWebhookSecret(env, authUser, normalizeProviderKey(rotateMatch[1]));
    }

    const legacy = await handleLegacyProviderBrowser(request, env, authUser, url, pathLower, method);
    if (legacy) return legacy;

    return jsonResponse({ error: 'Integration route not found', path: url.pathname }, 404);
}

function normalizeArgs(envArg, ctxArg, authUserArg) {
    if (envArg instanceof URL) {
        return { env: ctxArg, ctx: authUserArg, authUser: null };
    }
    return { env: envArg, ctx: ctxArg, authUser: authUserArg };
}

function resolveTenantId(authUser, env) {
    return authUser?.tenant_id || env?.TENANT_ID || fallbackSystemTenantId(env);
}

function integrationUserId(authUser) {
    return authUser?._session_user_id || authUser?.email || authUser?.id;
}

function normalizeProviderKey(provider) {
    const p = String(provider || '').trim().toLowerCase();
    if (p === 'gdrive' || p === 'google') return 'google_drive';
    if (p === 'r2') return 'cloudflare_r2';
    if (p === 'mcp') return 'mcp_servers';
    return p;
}

function colorSlugForProvider(providerKey) {
    const key = normalizeProviderKey(providerKey);
    return PROVIDER_COLOR_SLUGS[key] || key;
}

function parseJson(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
}

function epochToIso(value) {
    if (!value) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return new Date(n * 1000).toISOString();
}

async function ensureIntegrationTables(env, tenantId) {
    if (!env?.DB) return;
    await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS integration_registry (
            id TEXT PRIMARY KEY DEFAULT ('int_'||lower(hex(randomblob(8)))),
            tenant_id TEXT NOT NULL,
            provider_key TEXT NOT NULL,
            display_name TEXT NOT NULL,
            category TEXT NOT NULL CHECK(category IN ('source_control','storage','ai_provider','communication','database','analytics','payment','deployment','automation','other')),
            auth_type TEXT NOT NULL CHECK(auth_type IN ('oauth2','api_key','webhook','worker_binding','none')),
            status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('connected','disconnected','degraded','auth_expired','pending')),
            scopes_json TEXT DEFAULT '[]',
            config_json TEXT DEFAULT '{}',
            account_display TEXT,
            secret_binding_name TEXT,
            last_sync_at TEXT,
            last_health_check_at TEXT,
            last_health_latency_ms INTEGER,
            last_health_status TEXT,
            is_enabled INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 50,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(tenant_id, provider_key)
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS integration_health_checks (
            id TEXT PRIMARY KEY DEFAULT ('ihc_'||lower(hex(randomblob(8)))),
            tenant_id TEXT NOT NULL,
            provider_key TEXT NOT NULL,
            checked_at TEXT NOT NULL DEFAULT (datetime('now')),
            status TEXT NOT NULL CHECK(status IN ('ok','degraded','error','timeout')),
            latency_ms INTEGER,
            error_message TEXT,
            checked_by TEXT DEFAULT 'system',
            response_preview TEXT
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS integration_events (
            id TEXT PRIMARY KEY DEFAULT ('iev_'||lower(hex(randomblob(8)))),
            tenant_id TEXT NOT NULL,
            provider_key TEXT NOT NULL,
            event_type TEXT NOT NULL CHECK(event_type IN ('connected','disconnected','token_refreshed','sync_completed','health_check','test_run','webhook_received','error','settings_updated')),
            actor TEXT,
            message TEXT NOT NULL,
            metadata_json TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now'))
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_api_keys (
            id TEXT PRIMARY KEY DEFAULT ('uak_'||lower(hex(randomblob(8)))),
            tenant_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            key_name TEXT NOT NULL,
            key_preview TEXT,
            key_hash TEXT,
            is_active INTEGER DEFAULT 1,
            last_used_at TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )`),
    ]);
    for (const row of REGISTRY_SEED) {
        await env.DB.prepare(
            `INSERT OR IGNORE INTO integration_registry
             (id, tenant_id, provider_key, display_name, category, auth_type, status, sort_order, secret_binding_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(row[0], tenantId, row[1], row[2], row[3], row[4], row[5], row[6], row[7]).run();
    }
}

async function handleSummary(env, authUser) {
    if (!env?.DB) return jsonResponse({ providers: [], summary: emptySummary(), error: 'DB not configured' }, 503);
    const tenantId = resolveTenantId(authUser, env);
    const userId = integrationUserId(authUser);
    await ensureOauthTokenColumns(env.DB);
    const [registry, oauth, toolCounts, webhookCounts, allowlistCount, events, providerColors] = await Promise.all([
        env.DB.prepare(
            `SELECT r.*,
                    h.status AS health_status,
                    h.latency_ms,
                    h.checked_at AS latest_health_check_at,
                    h.error_message
             FROM integration_registry r
             LEFT JOIN integration_health_checks h ON h.provider_key = r.provider_key
              AND h.tenant_id = r.tenant_id
              AND h.id = (SELECT id FROM integration_health_checks
                          WHERE provider_key = r.provider_key AND tenant_id = r.tenant_id
                          ORDER BY checked_at DESC LIMIT 1)
             WHERE r.tenant_id = ? AND COALESCE(r.is_enabled, 1) = 1
             ORDER BY r.sort_order`
        ).bind(tenantId).all(),
        safeAll(env.DB, `SELECT provider, account_identifier, scope, expires_at, created_at, updated_at, metadata_json, workspace_id FROM user_oauth_tokens WHERE user_id = ?`, [userId]),
        getMcpToolCounts(env),
        getWebhookCounts(env),
        safeFirst(env.DB, `SELECT COUNT(*) AS count FROM agentsam_mcp_allowlist WHERE user_id = ?`, [userId]),
        safeAll(env.DB, `SELECT provider_key, event_type, message, actor, created_at FROM integration_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 25`, [tenantId]),
        loadProviderColors(env),
    ]);
    // Defensive: filter null rows to avoid frontend palette crashes.
    const providerColorsSafe = (providerColors.results || []).filter(Boolean);
    const colorBySlug = new Map(providerColorsSafe.map((row) => [String(row.slug || '').toLowerCase(), row]));

    const oauthByProvider = new Map();
    for (const token of oauth.results || []) {
        const key = normalizeProviderKey(token.provider);
        const account = token.account_identifier || token.provider;
        if (!oauthByProvider.has(key)) oauthByProvider.set(key, []);
        oauthByProvider.get(key).push({
            provider: token.provider,
            account_identifier: token.account_identifier || '',
            account_display: key === 'github' && account ? `github.com/${account}` : account,
            scopes: String(token.scope || '').split(/[,\s]+/).filter(Boolean),
            issued_at: epochToIso(token.created_at),
            expires_at: epochToIso(token.expires_at),
            status: oauthTokenStatus(token.expires_at),
            metadata_json: token.metadata_json || null,
            workspace_id: token.workspace_id || null,
        });
    }

    const providers = (registry.results || []).map((r) => {
        let regRow = r;
        if (r.provider_key === 'supabase_oauth') {
            regRow = {
                ...r,
                status: env.SUPABASE_OAUTH_CLIENT_ID ? r.status : 'disconnected',
                secret_binding_name: env.SUPABASE_OAUTH_CLIENT_ID ? r.secret_binding_name : null,
            };
        }
        let oauthAccounts = oauthByProvider.get(normalizeProviderKey(regRow.provider_key)) || [];
        if (regRow.provider_key === 'supabase_oauth' && oauthAccounts.length === 0) {
            oauthAccounts = oauthByProvider.get('supabase') || [];
        }
        let status = oauthAccounts.some((a) => a.status === 'expired') ? 'auth_expired' : regRow.status;
        if (oauthAccounts.length > 0 && status !== 'auth_expired') status = 'connected';
        const providerColorSlug = colorSlugForProvider(regRow.provider_key);
        return {
            ...regRow,
            status,
            provider_color_slug: providerColorSlug,
            provider_color: colorBySlug.get(providerColorSlug) || null,
            scopes: parseJson(r.scopes_json, []),
            config: parseJson(r.config_json, {}),
            oauth_account: oauthAccounts[0] || null,
            oauth_accounts: oauthAccounts,
            account_display: r.account_display || oauthAccounts[0]?.account_display || null,
            health: {
                status: r.health_status || r.last_health_status || null,
                latency_ms: r.latency_ms ?? r.last_health_latency_ms ?? null,
                checked_at: r.latest_health_check_at || r.last_health_check_at || null,
                error_message: r.error_message || null,
            },
            tool_count: toolCountForProvider(r.provider_key, toolCounts.byCategory),
        };
    });

    const summary = summarizeProviders(providers, toolCounts, webhookCounts);
    return jsonResponse({
        providers,
        oauth_tokens: oauth.results || [],
        mcp_tools: toolCounts,
        webhooks: webhookCounts,
        allowlist_count: Number(allowlistCount?.count || 0),
        recent_events: events.results || [],
        provider_colors: providerColorsSafe,
        provider_color_aliases: PROVIDER_COLOR_SLUGS,
        capabilities: resolveCapabilities(authUser),
        summary,
    });
}

async function loadProviderColors(env) {
    const withDisplayName = await safeAll(env.DB, `SELECT slug, display_name, primary_color, secondary_color, text_on_color, icon_slug, category FROM provider_colors ORDER BY category, display_name`, []);
    if (withDisplayName.results?.length) return withDisplayName;
    return safeAll(env.DB, `SELECT slug, css_var, color AS primary_color, color AS secondary_color, '#ffffff' AS text_on_color, slug AS icon_slug, 'other' AS category FROM provider_colors ORDER BY slug`, []);
}

function resolveCapabilities(authUser) {
    const parsed = parseJson(authUser?.capabilities_json, {});
    const isSuperadmin = authUser?.is_superadmin === 1 || authUser?.is_superadmin === true || authUser?.role === 'superadmin';
    return {
        is_superadmin: isSuperadmin,
        can_manage_mcp: isSuperadmin || parsed.can_manage_mcp !== false,
        can_manage_secrets: isSuperadmin || parsed.can_manage_secrets !== false,
    };
}

function emptySummary() {
    return { connected: 0, degraded: 0, auth_expired: 0, disconnected: 0, total_mcp_tools: 0, enabled_mcp_tools: 0, webhook_count: 0, active_webhooks: 0 };
}

function summarizeProviders(providers, toolCounts, webhookCounts) {
    const summary = emptySummary();
    for (const p of providers) {
        if (p.status === 'connected') summary.connected += 1;
        if (p.status === 'degraded') summary.degraded += 1;
        if (p.status === 'auth_expired') summary.auth_expired += 1;
        if (p.status === 'disconnected') summary.disconnected += 1;
    }
    summary.total_mcp_tools = toolCounts.total;
    summary.enabled_mcp_tools = toolCounts.enabled;
    summary.webhook_count = webhookCounts.total;
    summary.active_webhooks = webhookCounts.active;
    return summary;
}

function oauthTokenStatus(expiresAt) {
    if (!expiresAt) return 'connected';
    const exp = Number(expiresAt);
    if (!Number.isFinite(exp)) return 'connected';
    const now = Math.floor(Date.now() / 1000);
    if (exp < now) return 'expired';
    if (exp < now + 7 * 24 * 60 * 60) return 'expiring_soon';
    return 'connected';
}

async function getMcpToolCounts(env) {
    const total = await safeFirst(env.DB, `SELECT COUNT(*) AS total, SUM(CASE WHEN COALESCE(enabled, 0) = 1 THEN 1 ELSE 0 END) AS enabled FROM mcp_registered_tools`, []);
    const by = await safeAll(env.DB, `SELECT COALESCE(tool_category, 'uncategorized') AS category, COUNT(*) AS total, SUM(CASE WHEN COALESCE(enabled, 0) = 1 THEN 1 ELSE 0 END) AS enabled FROM mcp_registered_tools GROUP BY COALESCE(tool_category, 'uncategorized') ORDER BY category`, []);
    const byCategory = {};
    for (const row of by.results || []) byCategory[row.category] = { total: Number(row.total || 0), enabled: Number(row.enabled || 0) };
    return { total: Number(total?.total || 0), enabled: Number(total?.enabled || 0), by_category: by.results || [], byCategory };
}

function toolCountForProvider(providerKey, byCategory) {
    if (providerKey === 'mcp_servers') return Object.values(byCategory || {}).reduce((n, c) => n + Number(c.enabled || 0), 0);
    if (['github', 'google_drive', 'cloudflare_images'].includes(providerKey)) return byCategory?.integrations?.enabled || 0;
    if (providerKey === 'cloudflare_r2') return byCategory?.storage?.enabled || byCategory?.r2?.enabled || 0;
    return 0;
}

async function getWebhookCounts(env) {
    const endpoints = await safeFirst(env.DB, `SELECT COUNT(*) AS total, SUM(CASE WHEN COALESCE(is_active, 0) = 1 THEN 1 ELSE 0 END) AS active FROM webhook_endpoints`, []);
    const hooks = await safeFirst(env.DB, `SELECT COUNT(*) AS total, SUM(CASE WHEN COALESCE(is_active, 0) = 1 THEN 1 ELSE 0 END) AS active FROM agentsam_hook`, []);
    return {
        total: Number(endpoints?.total || 0) + Number(hooks?.total || 0),
        active: Number(endpoints?.active || 0) + Number(hooks?.active || 0),
        webhook_endpoints: Number(endpoints?.total || 0),
        agentsam_hooks: Number(hooks?.total || 0),
    };
}

async function handleProviderDetail(env, authUser, provider) {
    const tenantId = resolveTenantId(authUser, env);
    const userId = integrationUserId(authUser);
    const [registry, health, events, oauth, tools, providerColors] = await Promise.all([
        safeFirst(env.DB, `SELECT * FROM integration_registry WHERE tenant_id = ? AND provider_key = ? LIMIT 1`, [tenantId, provider]),
        safeAll(env.DB, `SELECT * FROM integration_health_checks WHERE tenant_id = ? AND provider_key = ? ORDER BY checked_at DESC LIMIT 5`, [tenantId, provider]),
        safeAll(env.DB, `SELECT * FROM integration_events WHERE tenant_id = ? AND provider_key = ? ORDER BY created_at DESC LIMIT 10`, [tenantId, provider]),
        safeAll(env.DB, `SELECT provider, account_identifier, scope, expires_at, created_at, updated_at FROM user_oauth_tokens WHERE user_id = ? AND provider = ?`, [userId, OAUTH_PROVIDER_ALIASES[provider] || provider]),
        safeAll(env.DB, `SELECT id, tool_name, tool_category, description, enabled FROM mcp_registered_tools WHERE (? = 'mcp_servers' OR tool_category = 'integrations') ORDER BY tool_category, tool_name LIMIT 100`, [provider]),
        loadProviderColors(env),
    ]);
    const colorSlug = colorSlugForProvider(provider);
    const colorBySlug = new Map((providerColors.results || []).map((row) => [String(row.slug || '').toLowerCase(), row]));
    return jsonResponse({
        provider: registry ? { ...registry, provider_color_slug: colorSlug, provider_color: colorBySlug.get(colorSlug) || null } : registry,
        health_checks: health.results || [],
        events: events.results || [],
        oauth_tokens: oauth.results || [],
        tools: tools.results || [],
        provider_colors: providerColors.results || [],
        provider_color_aliases: PROVIDER_COLOR_SLUGS,
    });
}

async function handleEvents(env, authUser, url) {
    const tenantId = resolveTenantId(authUser, env);
    const provider = normalizeProviderKey(url.searchParams.get('provider') || '');
    const eventType = String(url.searchParams.get('event_type') || '').trim();
    const args = [tenantId];
    let where = 'tenant_id = ?';
    if (provider) { where += ' AND provider_key = ?'; args.push(provider); }
    if (eventType) { where += ' AND event_type = ?'; args.push(eventType); }
    const rows = await env.DB.prepare(`SELECT * FROM integration_events WHERE ${where} ORDER BY created_at DESC LIMIT 100`).bind(...args).all();
    return jsonResponse({ events: rows.results || [] });
}

async function handleWebhooks(env, authUser) {
    const tenantId = resolveTenantId(authUser, env);
    const endpoints = await safeAll(env.DB, `SELECT id, source AS provider, slug AS name, endpoint_path AS endpoint_url, last_received_at AS last_triggered_at, total_received AS trigger_count, is_active FROM webhook_endpoints ORDER BY source, slug`, []);
    const hooks = await safeAll(env.DB, `SELECT id, provider, trigger AS name, external_id AS endpoint_url, created_at AS last_triggered_at, 0 AS trigger_count, is_active FROM agentsam_hook ORDER BY provider, trigger`, []);
    const rows = [...(endpoints.results || []), ...(hooks.results || [])].map((r) => ({ ...r, status: r.is_active ? 'active' : 'inactive' }));
    return jsonResponse({ webhooks: rows, tenant_id: tenantId });
}

async function handleMcpTools(env) {
    const rows = await safeAll(env.DB, `SELECT id, tool_name, tool_category, description, enabled, is_degraded FROM mcp_registered_tools ORDER BY tool_category, tool_name`, []);
    const counts = await getMcpToolCounts(env);
    return jsonResponse({ tools: rows.results || [], counts });
}

async function handleApiKeys(env, authUser) {
    const tenantId = resolveTenantId(authUser, env);
    const userId = integrationUserId(authUser);
    const [providers, userKeys] = await Promise.all([
        safeAll(env.DB, `SELECT provider_key, display_name, secret_binding_name, status, last_health_check_at, last_health_latency_ms FROM integration_registry WHERE tenant_id = ? AND auth_type = 'api_key' ORDER BY sort_order`, [tenantId]),
        safeAll(env.DB, `SELECT id, provider, key_name, key_preview, is_active, last_used_at, created_at FROM user_api_keys WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC`, [tenantId, userId]),
    ]);
    return jsonResponse({ providers: providers.results || [], user_api_keys: userKeys.results || [] });
}

async function handleCreateApiKey(env, authUser, request) {
    const tenantId = resolveTenantId(authUser, env);
    const userId = integrationUserId(authUser);
    const body = await request.json().catch(() => ({}));
    const provider = normalizeProviderKey(body.provider);
    const keyName = String(body.key_name || body.secret_name || '').trim();
    const keyPreview = String(body.key_preview || '').trim().slice(0, 12);
    if (!provider || !keyName) return jsonResponse({ error: 'provider and key_name required' }, 400);
    const id = `uak_${crypto.randomUUID()}`;
    await env.DB.prepare(
        `INSERT INTO user_api_keys (id, tenant_id, user_id, provider, key_name, key_preview, key_hash, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(id, tenantId, userId, provider, keyName, keyPreview, null).run();
    await recordIntegrationEvent(env, tenantId, provider, 'settings_updated', authUser.email || authUser.id, `Registered API key reference ${keyName}`, {});
    return jsonResponse({
        created: true,
        id,
        instructions: `Set via: npx wrangler secret put ${keyName} --name inneranimalmedia`,
    });
}

async function handleProviderTest(env, authUser, provider) {
    const tenantId = resolveTenantId(authUser, env);
    const started = Date.now();
    let result = { ok: false, status: 'error', error: null, account_info: null, response_preview: null };
    try {
        result = await runProviderHealthCheck(env, authUser, provider);
    } catch (e) {
        result = { ok: false, status: 'error', error: e?.message || String(e), account_info: null, response_preview: null };
    }
    const latency = Date.now() - started;
    const healthStatus = result.ok ? 'ok' : (result.status || 'error');
    await env.DB.batch([
        env.DB.prepare(`INSERT INTO integration_health_checks (tenant_id, provider_key, status, latency_ms, error_message, checked_by, response_preview) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .bind(tenantId, provider, healthStatus, latency, result.error || null, authUser.email || authUser.id || 'user', result.response_preview || null),
        env.DB.prepare(`UPDATE integration_registry SET last_health_check_at = datetime('now'), last_health_status = ?, last_health_latency_ms = ?, status = CASE WHEN ? = 'ok' THEN 'connected' ELSE 'degraded' END, updated_at = datetime('now') WHERE tenant_id = ? AND provider_key = ?`)
            .bind(healthStatus, latency, healthStatus, tenantId, provider),
    ]);
    await recordIntegrationEvent(env, tenantId, provider, 'health_check', authUser.email || authUser.id, result.ok ? 'Health check passed' : `Health check failed: ${result.error || healthStatus}`, { latency_ms: latency });
    return jsonResponse({ ok: result.ok, latency_ms: latency, error: result.error, account_info: result.account_info || null });
}

async function runProviderHealthCheck(env, authUser, provider) {
    const userId = integrationUserId(authUser);
    if (provider === 'github') {
        const token = await getIntegrationToken(env.DB, userId, 'github', '');
        if (!token) return { ok: false, status: 'error', error: 'GitHub OAuth token not found' };
        const res = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'IAM-Platform' } });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.ok ? 'ok' : 'error', error: res.ok ? null : data.message || res.statusText, account_info: data.login ? { login: data.login, html_url: data.html_url } : null, response_preview: JSON.stringify({ login: data.login, id: data.id }).slice(0, 500) };
    }
    if (provider === 'google_drive') {
        const token = await getIntegrationToken(env.DB, userId, 'google_drive', '');
        if (!token) return { ok: false, status: 'error', error: 'Google Drive OAuth token not found' };
        const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', { headers: { Authorization: `Bearer ${token.access_token}` } });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.ok ? 'ok' : 'error', error: res.ok ? null : data.error?.message || res.statusText, account_info: data.user || null, response_preview: JSON.stringify(data.user || data.error || {}).slice(0, 500) };
    }
    if (provider === 'anthropic') return testJsonFetch('https://api.anthropic.com/v1/messages', env.ANTHROPIC_API_KEY, { method: 'POST', headers: { 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY || '' }, body: JSON.stringify({ model: 'claude-3-5-haiku-latest', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }) });
    if (provider === 'openai') return testJsonFetch('https://api.openai.com/v1/models', env.OPENAI_API_KEY, { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY || ''}` } });
    if (provider === 'google_ai') return testJsonFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(env.GOOGLE_AI_API_KEY || '')}`, env.GOOGLE_AI_API_KEY, {});
    if (provider === 'resend') return testJsonFetch('https://api.resend.com/emails?limit=1', env.RESEND_API_KEY, { headers: { Authorization: `Bearer ${env.RESEND_API_KEY || ''}` } });
    if (provider === 'cloudflare_r2') {
        if (!env.R2?.list) return { ok: false, status: 'error', error: 'R2 binding not configured' };
        const list = await env.R2.list({ limit: 1 });
        return { ok: true, status: 'ok', account_info: { object_count_sample: list.objects?.length || 0 }, response_preview: JSON.stringify({ truncated: list.truncated, object_count_sample: list.objects?.length || 0 }) };
    }
    if (provider === 'mcp_servers') return testJsonFetch('https://mcp.inneranimalmedia.com/health', true, {});
    if (provider === 'vectorize') return { ok: !!env.VECTORIZE, status: env.VECTORIZE ? 'ok' : 'error', error: env.VECTORIZE ? null : 'VECTORIZE binding not configured', account_info: { binding: 'VECTORIZE' } };
    if (provider === 'hyperdrive') return { ok: !!env.HYPERDRIVE, status: env.HYPERDRIVE ? 'ok' : 'error', error: env.HYPERDRIVE ? null : 'HYPERDRIVE binding not configured', account_info: { binding: 'HYPERDRIVE' } };
    if (provider === 'browser_rendering') return { ok: !!env.MYBROWSER, status: env.MYBROWSER ? 'ok' : 'error', error: env.MYBROWSER ? null : 'MYBROWSER binding not configured' };
    return { ok: true, status: 'ok', account_info: { configured: true } };
}

async function testJsonFetch(url, requiredSecret, init) {
    if (!requiredSecret) return { ok: false, status: 'error', error: 'Required API key or binding is not configured' };
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.ok ? 'ok' : 'error', error: res.ok ? null : data.error?.message || data.message || res.statusText, response_preview: JSON.stringify(data).slice(0, 500) };
}

async function handleProviderSync(env, authUser, provider) {
    const tenantId = resolveTenantId(authUser, env);
    const changes = [];
    if (provider === 'github') {
        const token = await getIntegrationToken(env.DB, integrationUserId(authUser), 'github', '');
        if (token) {
            const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=10&affiliation=owner,collaborator,organization_member', { headers: { Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'IAM-Platform' } });
            changes.push({ github_repos_checked: res.ok });
        }
    } else if (provider === 'google_drive') {
        changes.push({ token_status: await oauthProviderConnected(env.DB, integrationUserId(authUser), 'google_drive') ? 'valid_row_present' : 'missing' });
    } else if (provider === 'mcp_servers') {
        const counts = await getMcpToolCounts(env);
        changes.push({ enabled_tools: counts.enabled, total_tools: counts.total });
    } else if (provider === 'vectorize') {
        const stats = await safeFirst(env.DB, `SELECT COUNT(*) AS indexes FROM vectorize_index_registry WHERE COALESCE(is_active, 1) = 1`, []);
        changes.push({ active_indexes: Number(stats?.indexes || 0) });
    } else if (provider === 'cloudflare_r2') {
        changes.push({ rollup_job: 'storage_rollup_bucket_summary' });
    }
    await env.DB.prepare(`UPDATE integration_registry SET last_sync_at = datetime('now'), updated_at = datetime('now') WHERE tenant_id = ? AND provider_key = ?`).bind(tenantId, provider).run();
    await recordIntegrationEvent(env, tenantId, provider, 'sync_completed', authUser.email || authUser.id, 'Integration sync completed', { changes });
    return jsonResponse({ synced: true, changes });
}

async function handleSupabaseIntegrationDelete(env, authUser) {
    if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const userId = integrationUserId(authUser);
    const tenantId = resolveTenantId(authUser, env);
    await env.DB.prepare(`DELETE FROM user_oauth_tokens WHERE user_id = ? AND provider = 'supabase'`).bind(userId).run();
    await env.DB.prepare(
        `UPDATE integration_registry SET status = 'disconnected', account_display = NULL, updated_at = datetime('now') WHERE tenant_id = ? AND provider_key = 'supabase_oauth'`,
    ).bind(tenantId).run();
    await recordIntegrationEvent(env, tenantId, 'supabase_oauth', 'disconnected', authUser.email || authUser.id, 'Supabase OAuth disconnected', {});
    return jsonResponse({ disconnected: true });
}

async function handleProviderDisconnect(env, authUser, provider) {
    const tenantId = resolveTenantId(authUser, env);
    if (!(await isSamOnlyUser(env, authUser))) return jsonResponse({ error: 'Superadmin required' }, 403);
    if (['github', 'google_drive', 'google_gmail'].includes(provider)) {
        await env.DB.prepare(`DELETE FROM user_oauth_tokens WHERE user_id = ? AND provider = ?`).bind(integrationUserId(authUser), provider).run();
    }
    await env.DB.prepare(`UPDATE integration_registry SET status = 'disconnected', updated_at = datetime('now') WHERE tenant_id = ? AND provider_key = ?`).bind(tenantId, provider).run();
    await recordIntegrationEvent(env, tenantId, provider, 'disconnected', authUser.email || authUser.id, 'Integration disconnected', {});
    return jsonResponse({ disconnected: true });
}

async function handleProviderSettings(env, authUser, provider, request) {
    const tenantId = resolveTenantId(authUser, env);
    const body = await request.json().catch(() => ({}));
    const row = await safeFirst(env.DB, `SELECT config_json, scopes_json FROM integration_registry WHERE tenant_id = ? AND provider_key = ?`, [tenantId, provider]);
    const config = { ...parseJson(row?.config_json, {}), ...(body.config_json || body.config || {}) };
    const scopes = body.scopes || body.scopes_json || parseJson(row?.scopes_json, []);
    const enabled = body.is_enabled == null ? null : (body.is_enabled ? 1 : 0);
    if (enabled == null) {
        await env.DB.prepare(`UPDATE integration_registry SET config_json = ?, scopes_json = ?, updated_at = datetime('now') WHERE tenant_id = ? AND provider_key = ?`)
            .bind(JSON.stringify(config), JSON.stringify(scopes), tenantId, provider).run();
    } else {
        await env.DB.prepare(`UPDATE integration_registry SET config_json = ?, scopes_json = ?, is_enabled = ?, updated_at = datetime('now') WHERE tenant_id = ? AND provider_key = ?`)
            .bind(JSON.stringify(config), JSON.stringify(scopes), enabled, tenantId, provider).run();
    }
    await recordIntegrationEvent(env, tenantId, provider, 'settings_updated', authUser.email || authUser.id, 'Integration settings updated', {});
    return jsonResponse({ updated: true });
}

async function handleRotateWebhookSecret(env, authUser, provider) {
    if (!(await isSamOnlyUser(env, authUser))) return jsonResponse({ error: 'Superadmin required' }, 403);
    const tenantId = resolveTenantId(authUser, env);
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const newSecret = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    if (env.KV?.put) await env.KV.put(`webhook_secret:${tenantId}:${provider}`, newSecret);
    const hash = await sha256Hex(newSecret);
    try {
        await env.DB.prepare(`UPDATE agentsam_hook SET auth_token = ? WHERE provider = ?`).bind(hash, provider).run();
    } catch (_) { /* older agentsam_hook schemas do not have auth_token */ }
    await recordIntegrationEvent(env, tenantId, provider, 'settings_updated', authUser.email || authUser.id, 'Webhook secret rotated', {});
    return jsonResponse({ rotated: true, new_secret: newSecret });
}

async function recordIntegrationEvent(env, tenantId, provider, eventType, actor, message, metadata) {
    try {
        await env.DB.prepare(
            `INSERT INTO integration_events (tenant_id, provider_key, event_type, actor, message, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(tenantId, provider, eventType, actor || null, message, JSON.stringify(metadata || {})).run();
    } catch (e) {
        console.warn('[integrations] event write failed', e?.message || e);
    }
}

async function safeAll(DB, sql, binds) {
    try { return await DB.prepare(sql).bind(...binds).all(); } catch (_) { return { results: [] }; }
}

async function safeFirst(DB, sql, binds) {
    try { return await DB.prepare(sql).bind(...binds).first(); } catch (_) { return null; }
}

async function handleLegacyStatus(env, authUser) {
    const userId = integrationUserId(authUser);
    const rows = await safeAll(env.DB, `SELECT provider, account_identifier FROM user_oauth_tokens WHERE user_id = ?`, [userId]);
    let google = false;
    let github = false;
    const githubAccounts = [];
    for (const r of rows.results || []) {
        if (r.provider === 'google_drive') google = true;
        if (r.provider === 'github') {
            github = true;
            if (r.account_identifier) githubAccounts.push({ account_identifier: r.account_identifier });
        }
    }
    return jsonResponse({ google, github, github_accounts: githubAccounts });
}

async function handleLegacyProviderBrowser(request, env, authUser, url, pathLower, method) {
    const userId = integrationUserId(authUser);
    const githubAccount = url.searchParams.get('account') || '';
    if (method === 'GET' && pathLower === '/api/integrations/gdrive/files') {
        const folderId = url.searchParams.get('folderId') || 'root';
        const tokenRow = await getIntegrationToken(env.DB, userId, 'google_drive', '');
        if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
        const driveUrl = new URL('https://www.googleapis.com/drive/v3/files');
        driveUrl.searchParams.set('q', `'${folderId}' in parents and trashed=false`);
        driveUrl.searchParams.set('fields', 'files(id,name,mimeType,size,modifiedTime)');
        driveUrl.searchParams.set('orderBy', 'name');
        const res = await fetch(driveUrl.toString(), { headers: { Authorization: `Bearer ${tokenRow.access_token}` } });
        return jsonResponse(await res.json(), res.ok ? 200 : res.status);
    }
    if (method === 'GET' && pathLower === '/api/integrations/gdrive/file') {
        const fileId = url.searchParams.get('fileId');
        const tokenRow = await getIntegrationToken(env.DB, userId, 'google_drive', '');
        if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${tokenRow.access_token}` } });
        return jsonResponse({ content: await res.text() }, res.ok ? 200 : res.status);
    }
    if (method === 'GET' && pathLower === '/api/integrations/gdrive/raw') {
        const fileId = url.searchParams.get('fileId');
        const tokenRow = await getIntegrationToken(env.DB, userId, 'google_drive', '');
        if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${tokenRow.access_token}` } });
        if (!res.ok) return jsonResponse({ error: res.statusText || 'Not found' }, res.status);
        return new Response(res.body, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' } });
    }
    if (method === 'GET' && pathLower === '/api/integrations/github/repos') {
        const tokenRow = await getIntegrationToken(env.DB, userId, 'github', githubAccount);
        if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
        const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member', { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
        return jsonResponse(await res.json(), res.ok ? 200 : res.status);
    }
    if (method === 'GET' && pathLower === '/api/integrations/github/files') {
        const repo = url.searchParams.get('repo');
        const filePath = url.searchParams.get('path') || '';
        const tokenRow = await getIntegrationToken(env.DB, userId, 'github', githubAccount);
        if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
        const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
        return jsonResponse(await res.json(), res.ok ? 200 : res.status);
    }
    if (method === 'GET' && pathLower === '/api/integrations/github/file') {
        const repo = url.searchParams.get('repo');
        const filePath = url.searchParams.get('path');
        const tokenRow = await getIntegrationToken(env.DB, userId, 'github', githubAccount);
        if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
        const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
        const data = await res.json();
        const content = atob((data.content || '').replace(/\n/g, ''));
        return jsonResponse({ content, sha: data.sha, name: data.name }, res.ok ? 200 : res.status);
    }
    if (method === 'GET' && pathLower === '/api/integrations/github/raw') {
        const repo = url.searchParams.get('repo');
        const filePath = url.searchParams.get('path');
        const tokenRow = await getIntegrationToken(env.DB, userId, 'github', githubAccount);
        if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
        const res = await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(repo)}/HEAD/${String(filePath || '').split('/').map((p) => encodeURIComponent(p)).join('/')}`, { headers: { Authorization: `token ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
        if (!res.ok) return jsonResponse({ error: res.statusText || 'Not found' }, res.status);
        return new Response(res.body, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' } });
    }
    return null;
}

async function getIntegrationToken(DB, userId, provider, accountId) {
    if (!DB || !userId) return null;
    if (provider === 'github' && !accountId) {
        return await safeFirst(DB, `SELECT access_token, refresh_token, expires_at, account_identifier FROM user_oauth_tokens WHERE user_id = ? AND provider = ? ORDER BY updated_at DESC LIMIT 1`, [userId, provider]);
    }
    return await safeFirst(DB, `SELECT access_token, refresh_token, expires_at, account_identifier FROM user_oauth_tokens WHERE user_id = ? AND provider = ? AND account_identifier = ? LIMIT 1`, [userId, provider, accountId || '']);
}

async function oauthProviderConnected(DB, userId, provider) {
    const row = await safeFirst(DB, `SELECT 1 AS ok FROM user_oauth_tokens WHERE user_id = ? AND provider = ? LIMIT 1`, [userId, provider]);
    return !!row;
}

/**
 * 🧱 handleBlueBubblesWebhook: Native Chat Brain Hub
 * Receives messages from BlueBubbles and triggers Agent Sam reasoning.
 */
async function handleBlueBubblesWebhook(request, env, ctx) {
    try {
        const rawBody = await request.text();
        const secret = env.BLUEBUBBLES_WEBHOOK_SECRET;
        if (!secret) {
            console.warn('[bluebubbles] BLUEBUBBLES_WEBHOOK_SECRET not set - rejecting');
            return new Response('Forbidden', { status: 403 });
        }
        const signature = request.headers.get('x-bluebubbles-signature')
            || request.headers.get('x-hub-signature-256');
        if (!signature) return new Response('Forbidden', { status: 403 });
        const expected = 'sha256=' + await hmacHex('SHA-256', secret, rawBody);
        if (!timingSafeEqual(signature, expected)) {
            return new Response('Forbidden', { status: 403 });
        }

        const body = JSON.parse(rawBody || '{}');
        const type = body.type; // e.g. "new-message"

        if (type !== 'new-message') {
            return jsonResponse({ status: 'ignored', type });
        }

        const msg = body.data; // BlueBubbles message object
        const text = msg.text;
        const sender = msg.handle?.address || 'unknown';
        const chatGuid = msg.chatGuid;

        console.log(`[iMessage] New message from ${sender}: ${text}`);

        // 🧱 Hook Resolution Engine
        const hook = await env.DB.prepare(
            `SELECT * FROM agentsam_hook 
             WHERE provider = 'imessage' AND external_id = ? AND trigger = 'imessage_reply' AND is_active = 1
             LIMIT 1`
        ).bind(chatGuid).first();

        if (hook) {
            console.log(`[iMessage] Found active hook for ${chatGuid} -> Targeting ${hook.target_id}`);
            
            // Append to agent_messages
            await env.DB.prepare(
                `INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
                crypto.randomUUID(),
                hook.target_id,
                'user',
                text,
                'imessage',
                Math.floor(Date.now() / 1000)
            ).run();

            // Note: In a full implementation, we might trigger an asynchronous agent reasoning task here.
        }
        await recordIntegrationEvent(env, env.TENANT_ID || fallbackSystemTenantId(env), 'bluebubbles', 'webhook_received', sender, `iMessage webhook received from ${sender}`, { hook_matched: !!hook, chatGuid });
        
        return jsonResponse({ 
            status: 'received', 
            message_id: msg.guid,
            source: 'bluebubbles',
            hook_matched: !!hook
        });

    } catch (e) {
        console.error('[BlueBubbles Webhook Error]', e.message);
        ctx.waitUntil(recordWorkerAnalyticsError(env, {
            path: '/api/integrations/bluebubbles/webhook',
            method: 'POST',
            error_message: e.message
        }));
        return jsonResponse({ error: 'Webhook processing failed' }, 500);
    }
}

async function hmacHex(algorithm, secret, body) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    return hex(sig);
}

async function sha256Hex(value) {
    return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function hex(buffer) {
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
    const left = new TextEncoder().encode(String(a || ''));
    const right = new TextEncoder().encode(String(b || ''));
    let diff = left.length ^ right.length;
    const len = Math.max(left.length, right.length);
    for (let i = 0; i < len; i += 1) {
        diff |= (left[i] || 0) ^ (right[i] || 0);
    }
    return diff === 0;
}

/**
 * 🧱 handleResendWebhook: Inbound Email Reply Hub
 * Processes inbound emails from Resend and matches them to active agent hooks.
 */
async function handleResendWebhook(request, env, ctx) {
    try {
        const body = await request.json();
        const { from, subject, text, to } = body.data || body; // Format varies based on Resend setup

        const senderEmail = from?.email || from;
        console.log(`[Resend] New inbound email from ${senderEmail}: ${subject}`);

        // 🧱 Hook Resolution Engine
        const hook = await env.DB.prepare(
            `SELECT * FROM agentsam_hook 
             WHERE provider = 'resend' AND external_id = ? AND trigger = 'email_reply' AND is_active = 1
             LIMIT 1`
        ).bind(senderEmail).first();

        if (hook) {
            console.log(`[Resend] Found active hook for ${senderEmail} -> Targeting ${hook.target_id}`);
            
            // Append to agent_messages
            await env.DB.prepare(
                `INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
                crypto.randomUUID(),
                hook.target_id,
                'user',
                `[Email Reply] Subject: ${subject}\n\n${text}`,
                'resend',
                Math.floor(Date.now() / 1000)
            ).run();
        }
        await recordIntegrationEvent(env, env.TENANT_ID || fallbackSystemTenantId(env), 'resend', 'webhook_received', senderEmail, `Inbound email webhook received from ${senderEmail}`, { hook_matched: !!hook, subject });

        return jsonResponse({ 
            status: 'received', 
            source: 'resend',
            hook_matched: !!hook
        });

    } catch (e) {
        console.error('[Resend Webhook Error]', e.message);
        ctx.waitUntil(recordWorkerAnalyticsError(env, {
            path: '/api/integrations/resend/webhook',
            method: 'POST',
            error_message: e.message
        }));
        return jsonResponse({ error: 'Email webhook processing failed' }, 500);
    }
}
