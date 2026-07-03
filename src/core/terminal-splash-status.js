/**
 * GET /api/terminal/splash-status — single workspace-scoped payload for terminal welcome UI.
 */
import { pingTunnelHealth } from './status-bar-runtime.js';
import {
  buildTerminalConfigStatus,
  getUserHostedTunnelConnection,
  userCanRunPtyFromPolicy,
} from './terminal.js';
import { getPtyTunnelStatus } from './pty-tunnel-provisioner.js';
import { resolvePtyTenantIdForUser } from './pty-workspace-paths.js';

function truncate(s, max = 20) {
  const t = String(s || '').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function laneTone(ok, pending = false) {
  if (pending) return 'loading';
  if (ok === true) return 'ok';
  if (ok === false) return 'warn';
  return 'muted';
}

function resolvePreferredLane(targets) {
  if (!targets?.can_run_pty) return null;
  if (targets.local?.ready) return 'local';
  if (targets.cloud?.ready) return 'cloud';
  if (targets.sandbox?.ready) return 'sandbox';
  if (targets.local?.configured) return 'local';
  if (targets.cloud?.configured) return 'cloud';
  return 'local';
}

function resolveRuntimeLane(targets) {
  if (!targets?.can_run_pty) {
    return { label: 'Runtime', value: 'disabled', tone: 'warn', preferred: null };
  }
  const localReady = targets.local?.ready === true;
  const cloudReady = targets.cloud?.ready === true;
  const sandboxReady = targets.sandbox?.ready === true;

  if (localReady) {
    return { label: 'Runtime', value: 'Local · ready', tone: 'ok', preferred: 'local' };
  }
  if (cloudReady) {
    return { label: 'Runtime', value: 'VM · ready', tone: 'ok', preferred: 'cloud' };
  }
  if (sandboxReady) {
    return { label: 'Runtime', value: 'Container · ready', tone: 'ok', preferred: 'sandbox' };
  }
  if (targets.local?.configured) {
    return { label: 'Runtime', value: 'Local · setup', tone: 'warn', preferred: 'local' };
  }
  if (targets.cloud?.configured) {
    return { label: 'Runtime', value: 'VM · setup', tone: 'warn', preferred: 'cloud' };
  }
  return { label: 'Runtime', value: 'needs setup', tone: 'warn', preferred: 'local' };
}

/**
 * @param {any} env
 * @param {{ id: string }} authUser
 * @param {string} workspaceId
 */
export async function buildTerminalLaneTargets(env, authUser, workspaceId) {
  const wid = String(workspaceId || '').trim();
  const canPty = await userCanRunPtyFromPolicy(env, authUser.id, wid);
  if (!canPty) {
    return {
      can_run_pty: false,
      workspace_id: wid,
      error: 'terminal_not_enabled',
      local: { target_type: 'user_hosted_tunnel', ready: false, configured: false },
      cloud: { target_type: 'platform_vm', ready: false, configured: false },
      sandbox: { target_type: 'sandbox', ready: false, configured: false },
    };
  }

  const twCfg = { workspaceId: wid };
  const [localCfg, cloudCfg, sandboxCfg] = await Promise.all([
    buildTerminalConfigStatus(env, authUser, twCfg, { target_type: 'user_hosted_tunnel' }),
    buildTerminalConfigStatus(env, authUser, twCfg, { target_type: 'platform_vm' }),
    buildTerminalConfigStatus(env, authUser, twCfg, { target_type: 'sandbox' }),
  ]);

  let containerReady = false;
  try {
    const { probeMyContainer } = await import('./my-container.js');
    const probe = await probeMyContainer(env);
    containerReady = probe.ok === true;
  } catch {
    containerReady = false;
  }

  const localRow = await getUserHostedTunnelConnection(env.DB, authUser.id, wid);
  const localShell = localRow?.shell != null ? String(localRow.shell).trim() : null;
  const localWs = localRow?.ws_url != null ? String(localRow.ws_url).trim() : '';
  const localActive = Number(localRow?.is_active) === 1 && !!localWs;

  return {
    can_run_pty: true,
    workspace_id: wid,
    local: {
      target_type: 'user_hosted_tunnel',
      ready: localCfg.terminal_configured === true || localActive,
      configured: localActive || localCfg.terminal_configured === true,
      connection_id: localCfg.selected_connection_id ?? null,
      shell: localShell,
      error_code: localCfg.error_code ?? null,
      cwd: localCfg.cwd ?? null,
    },
    cloud: {
      target_type: 'platform_vm',
      ready: cloudCfg.terminal_configured === true || !!env.PTY_SERVICE,
      configured: cloudCfg.terminal_configured === true,
      connection_id: cloudCfg.selected_connection_id ?? null,
      error_code: cloudCfg.error_code ?? null,
      cwd: cloudCfg.cwd ?? null,
      pty_service_bound: cloudCfg.pty_service_bound === true,
    },
    sandbox: {
      target_type: 'sandbox',
      ready: containerReady || sandboxCfg.terminal_configured === true,
      configured: containerReady || sandboxCfg.terminal_configured === true,
      connection_id: sandboxCfg.selected_connection_id ?? null,
      ws_url_present: sandboxCfg.selected_connection_ws_url_present === true,
      container_ready: containerReady,
      error_code: sandboxCfg.error_code ?? null,
      cwd: sandboxCfg.cwd ?? null,
    },
  };
}

/**
 * @param {any} env
 * @param {{ id: string, tenant_id?: string|null }} authUser
 * @param {string} workspaceId
 * @param {{ authWorkspaceId?: string|null }} [opts]
 */
export async function buildTerminalSplashStatus(env, authUser, workspaceId, opts = {}) {
  const wid = String(workspaceId || '').trim();
  const authWorkspaceId = opts.authWorkspaceId != null ? String(opts.authWorkspaceId).trim() : wid;

  const [targets, workspaceRow, tunnelPty, tunnelPlatform, agentHealth] = await Promise.all([
    buildTerminalLaneTargets(env, authUser, wid),
    env?.DB
      ? env.DB.prepare(
          `SELECT w.id, w.name, w.handle AS slug, w.github_repo
             FROM workspaces w
            WHERE w.id = ?
            LIMIT 1`,
        )
          .bind(wid)
          .first()
          .catch(() => null)
      : Promise.resolve(null),
    (async () => {
      const tid = await resolvePtyTenantIdForUser(env, authUser, authUser.id);
      return getPtyTunnelStatus(env, {
        userId: authUser.id,
        tenantId: tid || '',
        workspaceId: wid,
      }).catch(() => null);
    })(),
    pingTunnelHealth(env).catch(() => ({ healthy: false, status: 'disconnected' })),
    env?.DB
      ? env.DB.prepare(
          `SELECT component, status FROM iam_system_health ORDER BY status DESC, component ASC`,
        )
          .all()
          .then((r) => r.results || [])
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const wsName =
    workspaceRow?.name != null ? String(workspaceRow.name).trim() : truncate(wid, 14);
  const wsSlug = workspaceRow?.slug != null ? String(workspaceRow.slug).trim() : '';
  const githubRepo =
    workspaceRow?.github_repo != null ? String(workspaceRow.github_repo).trim() : '';

  const preferred = resolvePreferredLane(targets);
  const runtime = resolveRuntimeLane(targets);

  let cwd = null;
  let cdCommand = null;
  if (wid) {
    try {
      const preferredTarget =
        preferred === 'local'
          ? 'user_hosted_tunnel'
          : preferred === 'sandbox'
            ? 'sandbox'
            : 'platform_vm';
      const cfg = await buildTerminalConfigStatus(env, authUser, { workspaceId: wid }, {
        target_type: preferredTarget,
      });
      cwd = cfg?.cwd != null ? String(cfg.cwd).trim() : null;
      if (cwd) cdCommand = `cd ${JSON.stringify(cwd)}`;
    } catch {
      /* optional */
    }
  }

  const tunnelConnected =
    tunnelPty?.connection_active === true ||
    tunnelPlatform?.healthy === true ||
    tunnelPlatform?.status === 'connected';

  const tunnelValue = tunnelConnected
    ? 'connected'
    : tunnelPty?.hostname || tunnelPty?.tunnel_name
      ? 'idle'
      : 'offline';

  const healthRows = Array.isArray(agentHealth) ? agentHealth : [];
  const down = healthRows.filter((r) => r.status === 'down').length;
  const degraded = healthRows.filter((r) => r.status === 'degraded').length;
  const agentOverall = down > 0 ? 'down' : degraded > 0 ? 'degraded' : healthRows.length ? 'healthy' : 'unknown';
  const controlPlane = !!env.AGENT_SESSION;
  const agentValue =
    agentOverall === 'degraded'
      ? 'degraded'
      : agentOverall === 'healthy' && controlPlane
        ? 'online'
        : controlPlane
          ? 'online'
          : 'offline';

  const isActiveContext = !!wid && authWorkspaceId === wid;

  return {
    ok: true,
    fetched_at: Date.now(),
    workspace_id: wid,
    workspace: {
      id: wid,
      name: wsName || null,
      slug: wsSlug || null,
      github_repo: githubRepo || null,
      is_active_context: isActiveContext,
      cwd,
      cd_command: cdCommand,
    },
    targets,
    preferred_lane: runtime.preferred,
    lanes: {
      workspace: {
        label: 'Workspace',
        name: wsName || null,
        value: wsName ? (isActiveContext ? `${truncate(wsName, 16)} · active` : `${truncate(wsName, 16)} · switch`) : 'select workspace',
        tone: wsName ? (isActiveContext ? 'ok' : 'warn') : 'muted',
        cwd: cwd || null,
      },
      runtime: {
        label: runtime.label,
        value: runtime.value,
        tone: runtime.tone,
      },
      tunnel: {
        label: 'Tunnel',
        value: tunnelValue,
        tone: laneTone(tunnelConnected),
        connection_active: tunnelPty?.connection_active === true,
        hostname: tunnelPty?.hostname ?? null,
      },
      agent: {
        label: 'Agent',
        value: agentValue,
        tone: agentValue === 'online' ? 'ok' : agentValue === 'degraded' ? 'warn' : 'muted',
        control_plane_bound: controlPlane,
      },
    },
  };
}
