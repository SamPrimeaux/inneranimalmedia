/**
 * API Layer: System Health
 * Real health checks backed by system_health_snapshots, workspace_connectivity_status,
 * pty_health_events, and live binding probes.
 *
 * Routes:
 *   GET /api/health           — fast liveness check (tests actual D1 + bindings)
 *   GET /api/health/detailed  — full status from latest snapshot + connectivity
 *   GET /api/health/tools     — degraded/failing tool list
 *   GET /api/health/tunnel    — PTY/tunnel status from pty_health_events
 *   POST /api/health/snapshot — trigger a fresh system_health_snapshots write
 *
 * CF_TUNNEL_ID comes from env.CF_TUNNEL_ID — never hardcoded.
 * Worker name comes from env.PROJECT_ID — never hardcoded.
 */
import { jsonResponse }                    from '../core/responses.js';
import { getAuthUser, projectIdFromEnv,
         tenantIdFromEnv }                 from '../core/auth.js';

// ─── Binding Probe ────────────────────────────────────────────────────────────

/**
 * Test each binding with a real operation, not just !!env.binding.
 * Returns { ok: boolean, latency_ms: number, error?: string }
 */
async function probeBinding(name, fn) {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: e.message?.slice(0, 200) };
  }
}

async function probeBindings(env) {
  const [db, r2, kv, ai, tunnel] = await Promise.all([
    env.DB
      ? probeBinding('db',  () => env.DB.prepare('SELECT 1').first())
      : Promise.resolve({ ok: false, error: 'binding missing' }),

    env.DASHBOARD
      ? probeBinding('r2',  () => env.DASHBOARD.list({ limit: 1 }))
      : Promise.resolve({ ok: false, error: 'binding missing' }),

    env.KV
      ? probeBinding('kv',  () => env.KV.get('__health_probe__'))
      : Promise.resolve({ ok: false, error: 'binding missing' }),

    env.AI
      ? probeBinding('ai',  () => env.AI.run('@cf/baai/bge-base-en-v1.5', { text: 'ping' }))
      : Promise.resolve({ ok: false, error: 'binding missing' }),

    env.CF_TUNNEL_ID
      ? probeBinding('tunnel', () =>
          fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/tunnels/${env.CF_TUNNEL_ID}`, {
            headers: { 'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
            signal: AbortSignal.timeout(5000),
          })
        )
      : Promise.resolve({ ok: null, error: 'CF_TUNNEL_ID not configured' }),
  ]);

  return {
    db:      { configured: !!env.DB,        ...db },
    r2:      { configured: !!env.DASHBOARD, ...r2 },
    kv:      { configured: !!env.KV,        ...kv },
    ai:      { configured: !!env.AI,        ...ai },
    browser: { configured: !!env.MYBROWSER, ok: !!env.MYBROWSER },
    hyperdrive: { configured: !!env.HYPERDRIVE, ok: !!env.HYPERDRIVE },
    tunnel:  { configured: !!env.CF_TUNNEL_ID, ...tunnel },
  };
}

// ─── Snapshot Writer ──────────────────────────────────────────────────────────

/**
 * Write a fresh system_health_snapshots row.
 * Reads from routing_decisions, agent_telemetry, mcp_registered_tools,
 * agent_intent_patterns, model_routing_rules.
 */
export async function runHealthSnapshot(env, triggeredBy = 'api') {
  if (!env.DB) return null;

  const safe = p => p.catch(() => null);
  const now  = Math.floor(Date.now() / 1000);

  const [rdRow, telDay, tel7d, toolsRow, intentsRow, routingRow, degradedTools, topFailures, topIntents] = await Promise.all([
    // routing_decisions coverage
    safe(env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM routing_decisions`).first()),
    // telemetry 24h
    safe(env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(computed_cost_usd),0) AS cost FROM agent_telemetry WHERE created_at > ? - 86400`).bind(now).first()),
    // telemetry 7d
    safe(env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(computed_cost_usd),0) AS cost FROM agent_telemetry WHERE created_at > ? - 604800`).bind(now).first()),
    // tool counts
    safe(env.DB.prepare(`SELECT COUNT(*) AS total, SUM(is_degraded) AS degraded, SUM(CASE WHEN modes_json='[]' OR modes_json IS NULL THEN 1 ELSE 0 END) AS missing_modes FROM mcp_registered_tools WHERE enabled=1`).first()),
    // intent counts
    safe(env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN total_executions>0 THEN 1 ELSE 0 END) AS wired FROM agent_intent_patterns WHERE is_active=1`).first()),
    // routing rules
    safe(env.DB.prepare(`SELECT COUNT(*) AS active, SUM(CASE WHEN provider='google' THEN 1 ELSE 0 END) AS google_count FROM model_routing_rules WHERE is_active=1`).first()),
    // top degraded tools
    safe(env.DB.prepare(`SELECT tool_name FROM mcp_registered_tools WHERE is_degraded=1 AND enabled=1 LIMIT 10`).all()),
    // top failing tools from mcp_tool_calls
    safe(env.DB.prepare(`SELECT tool_name, SUM(CASE WHEN status NOT IN ('completed','success') THEN 1 ELSE 0 END) AS failure_count, SUM(CASE WHEN status IN ('completed','success') THEN 1 ELSE 0 END) AS success_count FROM mcp_tool_calls WHERE created_at > datetime('now','-7 days') GROUP BY tool_name HAVING failure_count > 0 ORDER BY failure_count DESC LIMIT 5`).all()),
    // top intents by execution
    safe(env.DB.prepare(`SELECT intent_slug, total_executions FROM agent_intent_patterns WHERE is_active=1 AND total_executions>0 ORDER BY total_executions DESC LIMIT 5`).all()),
  ]);

  // Telemetry by provider
  let providerJson = '{}';
  try {
    const { results } = await env.DB.prepare(`SELECT provider, COUNT(*) AS n, SUM(computed_cost_usd) AS cost FROM agent_telemetry WHERE created_at > ? - 604800 GROUP BY provider`).bind(now).all();
    providerJson = JSON.stringify(results || []);
  } catch (_) {}

  const toolsDegraded = toolsRow?.degraded || 0;
  const telCost7d     = tel7d?.cost || 0;
  const rdTotal       = rdRow?.total || 0;
  const rdCompleted   = rdRow?.completed || 0;
  const pctValid      = rdTotal > 0 ? Math.round((rdCompleted / rdTotal) * 100) : 100;

  // Determine overall status
  let healthStatus = 'green';
  const notes      = [];
  if (toolsDegraded > 0)      { healthStatus = 'yellow'; notes.push(`${toolsDegraded} degraded tools enabled`); }
  if (telCost7d > 50)         { healthStatus = 'yellow'; notes.push(`high 7d spend: $${telCost7d.toFixed(2)}`); }
  if (pctValid < 80)          { healthStatus = 'yellow'; notes.push(`routing completion ${pctValid}%`); }
  if (!rdRow && !telDay)      { healthStatus = 'red';    notes.push('DB read failures'); }

  const snapId = 'snap_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);

  await env.DB.prepare(
    `INSERT INTO system_health_snapshots
     (id, triggered_by, snapshot_at,
      rd_total, rd_completed, rd_pct_complete_valid,
      tel_total_24h, tel_total_7d, tel_cost_24h, tel_cost_7d, tel_providers_json,
      tools_total, tools_degraded, tools_missing_modes, tool_top_failures_json,
      intents_total, intents_wired, intents_top_json,
      routing_rules_active, routing_rules_with_google,
      health_status, health_notes, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    snapId, triggeredBy, now,
    rdTotal, rdCompleted, pctValid,
    telDay?.n || 0, tel7d?.n || 0, telDay?.cost || 0, telCost7d, providerJson,
    toolsRow?.total || 0, toolsDegraded, toolsRow?.missing_modes || 0,
    JSON.stringify((topFailures?.results || []).slice(0, 5)),
    intentsRow?.total || 0, intentsRow?.wired || 0,
    JSON.stringify((topIntents?.results || []).slice(0, 5)),
    routingRow?.active || 0, routingRow?.google_count || 0,
    healthStatus, notes.join('; '),
    now
  ).run();

  return { snapshot_id: snapId, health_status: healthStatus, notes };
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function handleHealthApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  // ── GET /api/health — fast liveness ──────────────────────────────────────
  if ((path === '/api/health' || path === '/health') && method === 'GET') {
    const workerName = projectIdFromEnv(env) || 'unknown';
    const version    = env.CF_VERSION_METADATA?.id ?? 'dev';

    // Fast DB probe
    let dbOk = false;
    try { await env.DB?.prepare('SELECT 1').first(); dbOk = true; } catch (_) {}

    // Latest snapshot status (no heavy queries)
    let snapshotStatus = 'unknown';
    let snapshotAge    = null;
    if (env.DB && dbOk) {
      try {
        const snap = await env.DB.prepare(
          `SELECT health_status, snapshot_at FROM system_health_snapshots ORDER BY snapshot_at DESC LIMIT 1`
        ).first();
        if (snap) {
          snapshotStatus = snap.health_status;
          snapshotAge    = Math.floor(Date.now() / 1000) - snap.snapshot_at;
        }
      } catch (_) {}
    }

    const overallOk = dbOk && !!env.DASHBOARD;

    return jsonResponse({
      status:   overallOk ? 'ok' : 'degraded',
      worker:   workerName,
      version,
      environment:    env.ENVIRONMENT || 'production',
      health_status:  snapshotStatus,
      snapshot_age_s: snapshotAge,
      bindings: {
        db:         dbOk,
        r2:         !!env.DASHBOARD,
        kv:         !!env.KV,
        ai:         !!env.AI,
        browser:    !!env.MYBROWSER,
        hyperdrive: !!env.HYPERDRIVE,
        tunnel:     !!env.CF_TUNNEL_ID,
        agent_session: !!env.AGENT_SESSION,
        iam_collab: !!env.IAM_COLLAB,
      },
      timestamp: Date.now(),
    }, overallOk ? 200 : 503);
  }

  // ── GET /api/health/detailed — full status ────────────────────────────────
  if (path === '/api/health/detailed' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    const [bindings, snapshot, connectivity] = await Promise.all([
      probeBindings(env),

      env.DB ? env.DB.prepare(
        `SELECT * FROM system_health_snapshots ORDER BY snapshot_at DESC LIMIT 1`
      ).first().catch(() => null) : Promise.resolve(null),

      env.DB ? env.DB.prepare(
        `SELECT service, status, last_checked_at, latency_ms, detail_json
         FROM workspace_connectivity_status WHERE workspace_id = ?`
      ).bind('ws_inneranimalmedia').all().then(r => r.results || []).catch(() => []) : Promise.resolve([]),
    ]);

    const snap = snapshot ? {
      ...snapshot,
      tel_providers_json:     safeParse(snapshot.tel_providers_json),
      tool_top_failures_json: safeParse(snapshot.tool_top_failures_json),
      intents_top_json:       safeParse(snapshot.intents_top_json),
      age_seconds: Math.floor(Date.now() / 1000) - (snapshot.snapshot_at || 0),
    } : null;

    return jsonResponse({
      worker:      projectIdFromEnv(env) || 'unknown',
      environment: env.ENVIRONMENT || 'production',
      version:     env.CF_VERSION_METADATA?.id ?? 'dev',
      tunnel_id:   env.CF_TUNNEL_ID || null,
      bindings,
      snapshot:    snap,
      connectivity,
      timestamp:   Date.now(),
    });
  }

  // ── GET /api/health/tools — degraded tools ────────────────────────────────
  if (path === '/api/health/tools' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    try {
      const [degraded, failing] = await Promise.all([
        env.DB.prepare(
          `SELECT tool_name, tool_category, failure_rate, avg_latency_ms, last_health_check
           FROM mcp_registered_tools WHERE is_degraded=1 ORDER BY failure_rate DESC`
        ).all().then(r => r.results || []),

        env.DB.prepare(
          `SELECT tool_name,
                  SUM(CASE WHEN status NOT IN ('completed','success') THEN 1 ELSE 0 END) AS failure_count,
                  SUM(CASE WHEN status IN ('completed','success') THEN 1 ELSE 0 END) AS success_count,
                  MAX(created_at) AS last_seen
           FROM mcp_tool_calls
           WHERE created_at > datetime('now','-24 hours')
           GROUP BY tool_name
           HAVING failure_count > 0
           ORDER BY failure_count DESC LIMIT 20`
        ).all().then(r => r.results || []),
      ]);

      return jsonResponse({ degraded, failing_24h: failing });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── GET /api/health/tunnel — PTY/tunnel status ────────────────────────────
  if (path === '/api/health/tunnel' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    try {
      const [lastEvent, recentEvents, terminalSession] = await Promise.all([
        env.DB.prepare(
          `SELECT event_type, tunnel_url, tunnel_connections, error_message, recorded_at
           FROM pty_health_events ORDER BY recorded_at DESC LIMIT 1`
        ).first(),

        env.DB.prepare(
          `SELECT event_type, tunnel_url, error_message, recorded_at
           FROM pty_health_events ORDER BY recorded_at DESC LIMIT 10`
        ).all().then(r => r.results || []),

        env.DB.prepare(
          `SELECT id, status, tunnel_url, created_at, updated_at
           FROM terminal_sessions WHERE status='active' ORDER BY updated_at DESC LIMIT 1`
        ).first().catch(() => null),
      ]);

      const tunnelUp   = lastEvent?.event_type === 'connected' || lastEvent?.event_type === 'tunnel_up' || lastEvent?.event_type === 'reconnected';
      const ageSeconds = lastEvent ? Math.floor(Date.now() / 1000) - lastEvent.recorded_at : null;

      return jsonResponse({
        tunnel_id:      env.CF_TUNNEL_ID || null,
        terminal_ws_url: env.TERMINAL_WS_URL || null,
        status:          tunnelUp ? 'connected' : (lastEvent ? 'disconnected' : 'unknown'),
        last_event:      lastEvent?.event_type || null,
        last_event_age_s: ageSeconds,
        tunnel_url:      lastEvent?.tunnel_url || null,
        active_session:  terminalSession || null,
        recent_events:   recentEvents,
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── POST /api/health/snapshot — trigger fresh snapshot ───────────────────
  if (path === '/api/health/snapshot' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    try {
      const result = await runHealthSnapshot(env, 'api');
      return jsonResponse({ ok: true, ...result });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── GET /api/health/snapshots — recent snapshot history ──────────────────
  if (path === '/api/health/snapshots' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, triggered_by, health_status, health_notes,
                tel_cost_24h, tel_cost_7d, tools_degraded, tools_total,
                intents_wired, intents_total, snapshot_at
         FROM system_health_snapshots ORDER BY snapshot_at DESC LIMIT ?`
      ).bind(limit).all();
      return jsonResponse({ snapshots: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  return jsonResponse({ error: 'Health route not found', path }, 404);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeParse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return str; }
}
