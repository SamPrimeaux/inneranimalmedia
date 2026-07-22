/**
 * Health-aware terminal_connections routing — Mac-first when healthy, GCP fallback.
 * ExecOS law: localpty.* = samsmac desk lane · terminal.* = GCP always-on · auto picks by probe.
 */

/** @typedef {'auto'|'user_hosted_tunnel'|'platform_vm'|'sandbox'} TerminalRouteMode */

const LOCAL_TARGET_TYPES = ['user_hosted_tunnel'];
const CLOUD_TARGET_TYPES = ['platform_vm', 'remote'];
const AUTO_TARGET_TYPES = [...LOCAL_TARGET_TYPES, 'sandbox', ...CLOUD_TARGET_TYPES];

const TERMINAL_CONN_SELECT = `
  id, ws_url, auth_token_secret_name, connection_type, ollama_url,
  shell, platform, user_id, workspace_id, tenant_id, auth_mode, token_verify_endpoint,
  target_type, target_priority, self_service_enabled, last_health_status, last_health_at,
  health_error, cwd_strategy, is_default, is_active, updated_at,
  username, remote_exec_user, privileged_target_id, ssh_identity_secret_name`;

/**
 * @param {string} wsUrl
 */
export function terminalHealthUrlFromWsUrl(wsUrl) {
  const raw = String(wsUrl || '').trim().split('?')[0];
  if (!raw) return '';
  try {
    let u = raw;
    if (u.startsWith('wss://')) u = `https://${u.slice(6)}`;
    else if (u.startsWith('ws://')) u = `http://${u.slice(7)}`;
    else if (!/^https?:\/\//i.test(u)) u = `https://${u.replace(/^\/+/, '')}`;
    return new URL('/health', new URL(u).origin).href;
  } catch {
    return '';
  }
}

/**
 * @param {string} wsUrl
 * @param {number} [timeoutMs]
 */
export async function probeTerminalLaneHealth(wsUrl, timeoutMs = 3200) {
  const healthUrl = terminalHealthUrlFromWsUrl(wsUrl);
  if (!healthUrl) return { ok: false, error: 'health_url_unresolved' };
  const t0 = Date.now();
  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(Math.max(500, timeoutMs)),
    });
    const latency_ms = Date.now() - t0;
    if (!res.ok) {
      return { ok: false, error: `health_http_${res.status}`, latency_ms, health_url: healthUrl };
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const workspaces_root =
      body && typeof body.workspaces_root === 'string' ? body.workspaces_root : null;
    return {
      ok: true,
      latency_ms,
      health_url: healthUrl,
      workspaces_root,
      status: body?.status ?? 'ok',
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message ? String(e.message) : 'health_probe_failed',
      latency_ms: Date.now() - t0,
      health_url: healthUrl,
    };
  }
}

/**
 * @param {string | null | undefined} targetType
 * @returns {TerminalRouteMode}
 */
export function resolveTerminalRouteMode(targetType) {
  const tt = String(targetType || '').trim();
  if (!tt || tt === 'auto') return 'auto';
  if (tt === 'user_hosted_tunnel') return 'user_hosted_tunnel';
  if (tt === 'sandbox') return 'sandbox';
  if (tt === 'platform_vm' || tt === 'remote') return 'platform_vm';
  return 'auto';
}

/**
 * @param {string} targetType
 */
export function isLocalTerminalTargetType(targetType) {
  return LOCAL_TARGET_TYPES.includes(String(targetType || '').trim());
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{
 *   userId: string,
 *   workspaceId: string,
 *   tenantId?: string|null,
 *   targetTypes: string[],
 * }} q
 */
async function listScopedConnections(db, q) {
  const { userId, workspaceId, tenantId, targetTypes } = q;
  if (!targetTypes.length) return [];
  const placeholders = targetTypes.map(() => '?').join(', ');

  const runQuery = (workspaceFilter) => {
    let sql = `SELECT ${TERMINAL_CONN_SELECT}
     FROM terminal_connections
     WHERE user_id = ? AND is_active = 1
       AND target_type IN (${placeholders})`;
    const binds = [userId, ...targetTypes];
    if (workspaceFilter) {
      sql += ' AND workspace_id = ?';
      binds.push(workspaceFilter);
    }
    if (tenantId) {
      sql += " AND (tenant_id = ? OR tenant_id IS NULL OR tenant_id = '')";
      binds.push(tenantId);
    }
    sql += ' ORDER BY is_default DESC, target_priority ASC, updated_at DESC LIMIT 8';
    return db.prepare(sql).bind(...binds).all().then((r) => r?.results || []);
  };

  const wid = String(workspaceId || '').trim();
  if (wid) {
    const scoped = await runQuery(wid);
    if (scoped.length) return scoped;
  }
  /** PTY is user-scoped — workspace switch must not kill a healthy lane. */
  return runQuery(null);
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {'auto'|'user_hosted_tunnel'|'platform_vm'|'sandbox'} mode
 */
function autoTargetTypeRank(targetType) {
  const tt = String(targetType || '').trim();
  if (isLocalTerminalTargetType(tt)) return 0;
  if (tt === 'sandbox') return 1;
  return 2;
}

function orderConnectionsForMode(rows, mode) {
  const list = [...rows];
  if (mode === 'auto') {
    list.sort((a, b) => {
      const ar = autoTargetTypeRank(a.target_type);
      const br = autoTargetTypeRank(b.target_type);
      if (ar !== br) return ar - br;
      const ap = Number(a.target_priority) || 999;
      const bp = Number(b.target_priority) || 999;
      if (ap !== bp) return ap - bp;
      return Number(b.is_default) - Number(a.is_default);
    });
  }
  return list;
}

/**
 * @param {string|null|undefined} clientSurface
 * @param {'auto'|'remote'|'local'|'sandbox'|null|undefined} execLane
 */
function mobileSkipsLocalTunnel(clientSurface, execLane) {
  const surface = String(clientSurface || '')
    .trim()
    .toLowerCase();
  if (!surface.startsWith('mobile')) return false;
  const lane = String(execLane || 'auto')
    .trim()
    .toLowerCase();
  return lane !== 'local';
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{
 *   userId: string,
 *   workspaceId: string,
 *   tenantId?: string|null,
 *   targetType?: string|null,
 *   healthAware?: boolean,
 *   clientSurface?: string|null,
 *   execLane?: string|null,
 *   skipLocalTunnel?: boolean,
 * }} opts
 */
export async function selectHealthyTerminalConnection(db, opts = {}) {
  const uid = String(opts.userId || '').trim();
  const wid = String(opts.workspaceId || '').trim();
  const tid = opts.tenantId != null ? String(opts.tenantId).trim() : '';
  if (!db || !uid || !wid) {
    return { connection: null, error: 'connection_missing', resolution: null, health: null };
  }

  const mode = resolveTerminalRouteMode(opts.targetType);
  const healthAware = opts.healthAware !== false;

  let targetTypes;
  if (mode === 'user_hosted_tunnel') targetTypes = LOCAL_TARGET_TYPES;
  else if (mode === 'platform_vm') targetTypes = CLOUD_TARGET_TYPES;
  else if (mode === 'sandbox') targetTypes = ['sandbox'];
  else targetTypes = AUTO_TARGET_TYPES;

  const rows = await listScopedConnections(db, {
    userId: uid,
    workspaceId: wid,
    tenantId: tid || null,
    targetTypes,
  });

  if (!rows.length) {
    return { connection: null, error: 'connection_missing', resolution: null, health: null };
  }

  const skipLocal =
    opts.skipLocalTunnel === true ||
    mobileSkipsLocalTunnel(opts.clientSurface, opts.execLane);

  let ordered = orderConnectionsForMode(rows, mode);
  if (skipLocal) {
    ordered = ordered.filter((row) => !isLocalTerminalTargetType(row.target_type));
  }

  if (!ordered.length) {
    return {
      connection: null,
      error: skipLocal ? 'mobile_local_skipped' : 'connection_missing',
      resolution: skipLocal ? 'mobile_skip_local_no_lane' : null,
      health: null,
    };
  }

  if (!healthAware) {
    return {
      connection: ordered[0],
      error: null,
      resolution: 'static_priority',
      health: null,
    };
  }

  /** @type {Record<string, unknown>[]} */
  const probes = [];
  for (const row of ordered) {
    const ws = String(row.ws_url || '').trim();
    if (!ws) continue;
    const probe = await probeTerminalLaneHealth(ws);
    probes.push({ connection_id: row.id, target_type: row.target_type, ...probe });
    if (probe.ok) {
      const lane = isLocalTerminalTargetType(row.target_type) ? 'mac_local' : 'gcp_primary';
      return {
        connection: row,
        error: null,
        resolution:
          mode === 'auto'
            ? lane === 'mac_local'
              ? 'health_mac_local'
              : 'health_gcp_fallback'
            : `health_${mode}`,
        lane,
        health: { probe, probes },
      };
    }
  }

  if (mode === 'auto') {
    const sandbox = ordered.find((r) => String(r.target_type || '').trim() === 'sandbox' && r.ws_url);
    if (sandbox) {
      return {
        connection: sandbox,
        error: 'lane_unhealthy_fallback',
        resolution: 'health_sandbox_forced_unhealthy',
        lane: 'gcp_sandbox',
        health: { probes },
      };
    }
    const cloud = ordered.find(
      (r) =>
        !isLocalTerminalTargetType(r.target_type) &&
        String(r.target_type || '').trim() !== 'sandbox' &&
        r.ws_url,
    );
    if (cloud) {
      return {
        connection: cloud,
        error: 'lane_unhealthy_fallback',
        resolution: 'health_gcp_forced_unhealthy',
        lane: 'gcp_primary',
        health: { probes },
      };
    }
  }

  return {
    connection: ordered[0] || null,
    error: ordered[0] ? 'lane_unhealthy' : 'connection_missing',
    resolution: 'health_all_failed',
    health: { probes },
  };
}
