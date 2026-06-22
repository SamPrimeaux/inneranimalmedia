/**
 * ExecOS fabric — dispatch shell commands to GCP iam-tunnel via ExecOS dispatcher.
 *
 * Path C (preferred):
 *   CORE Worker → EXECOS service binding → execos.inneranimalmedia.com/run (target=gcp)
 *   → terminal.inneranimalmedia.com/run → server.js :3099 on iam-tunnel VM
 *
 * Fallbacks: public ExecOS URL, direct GCP /run, legacy PTY_SERVICE /exec.
 */

import { execOnPtyHost, loadWorkspaceRootFromSettings, buildPtyUserWorkspaceRoot, PTY_REPO_DIRNAME } from './pty-workspace-paths.js';
import { userIsPlatformOperator, PLATFORM_WORKSPACE_ID } from './platform-operator-policy.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * Map D1 workspace_root (often Mac) to Linux GCP home layout.
 * @param {string} root
 */
export function translateHostRootForGcp(root) {
  const p = trim(root).replace(/\/+$/, '');
  if (!p) return '';
  if (p.startsWith('/Users/')) {
    return `/home/${p.slice('/Users/'.length)}`;
  }
  return p;
}

/**
 * Resolve CAD repo cwd: operator host repo vs tenant /workspace isolation.
 * @param {any} env
 * @param {{ userId?: string|null, tenantId?: string|null, workspaceId?: string|null, target?: string }} ctx
 */
export async function resolveCadExecRepoRoot(env, ctx = {}) {
  const target = trim(ctx.target) || 'gcp';
  const userId = trim(ctx.userId);
  const workspaceId = trim(ctx.workspaceId) || PLATFORM_WORKSPACE_ID;
  const tenantId = trim(ctx.tenantId);

  const explicit = trim(env?.EXECOS_CAD_CWD) || trim(env?.OPERATOR_TERMINAL_CWD);
  if (explicit) {
    const repoRoot = target === 'gcp' ? translateHostRootForGcp(explicit) : explicit;
    return { repoRoot, source: 'env', strategy: 'explicit' };
  }

  const isOperator = userId
    ? await userIsPlatformOperator(env, { id: userId }, workspaceId)
    : false;

  if (isOperator) {
    const hostRoot = await loadWorkspaceRootFromSettings(env, workspaceId);
    if (hostRoot) {
      const repoRoot = target === 'gcp' ? translateHostRootForGcp(hostRoot) : hostRoot;
      return { repoRoot, source: 'workspace_settings', strategy: 'host_default' };
    }
    if (target === 'gcp') {
      return { repoRoot: '/home/samprimeaux/inneranimalmedia', source: 'operator_fallback', strategy: 'host_default' };
    }
    return { repoRoot: '/Users/samprimeaux/inneranimalmedia', source: 'operator_fallback', strategy: 'host_default' };
  }

  if (tenantId && userId) {
    const workspaceRoot = buildPtyUserWorkspaceRoot(env, { tenantId, userId });
    if (workspaceRoot) {
      return {
        repoRoot: `${workspaceRoot}/${PTY_REPO_DIRNAME}`,
        source: 'platform_workspace',
        strategy: 'tenant_isolated',
      };
    }
  }

  return { repoRoot: '', source: 'unresolved', strategy: 'none' };
}

/** @deprecated use resolveCadExecRepoRoot */
export function resolveCadExecCwd(env, hints = {}) {
  const fromHint = trim(hints.repoRoot);
  if (fromHint) return fromHint;
  const explicit = trim(env?.EXECOS_CAD_CWD) || trim(env?.OPERATOR_TERMINAL_CWD);
  if (explicit) return translateHostRootForGcp(explicit);
  return '/home/samprimeaux/inneranimalmedia';
}

/**
 * @param {Record<string, unknown>} data
 */
function normalizeExecResult(data, resolution, target) {
  const stdout = typeof data?.stdout === 'string' ? data.stdout : '';
  const stderr = typeof data?.stderr === 'string' ? data.stderr : '';
  const exitCode = Number.isFinite(Number(data?.exit_code)) ? Number(data.exit_code) : 0;
  const ok = data?.ok !== false && exitCode === 0;
  return {
    ok,
    stdout,
    stderr,
    exit_code: exitCode,
    resolution,
    target: data?.target || target,
    latency_ms: data?.latency_ms ?? null,
  };
}

/**
 * @param {any} env
 * @param {{ command: string, cwd?: string|null, target?: string, timeout_ms?: number }} opts
 */
export async function runExecOsCommand(env, opts) {
  const command = trim(opts.command);
  if (!command) {
    return { ok: false, stdout: '', stderr: 'command_required', exit_code: 1, resolution: 'none' };
  }

  const target = trim(opts.target) || 'gcp';
  const cwd = opts.cwd != null ? trim(opts.cwd) : null;
  const body = { command, target };
  if (cwd) body.cwd = cwd;

  const execosKey = trim(env?.EXECOS_KEY);
  let lastError = 'execos_not_configured';

  // 1) Worker-to-Worker EXECOS binding (same as MCP terminal path)
  if (env?.EXECOS && execosKey) {
    try {
      const res = await env.EXECOS.fetch('https://internal/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ExecOS-Key': execosKey,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        return normalizeExecResult(data, 'execos_binding', target);
      }
      lastError = trim(data?.error) || `execos_binding_http_${res.status}`;
    } catch (e) {
      lastError = `execos_binding_throw:${trim(e?.message || e).slice(0, 160)}`;
    }
  }

  // 2) Public ExecOS dispatcher (execos.inneranimalmedia.com)
  if (execosKey) {
    const publicUrl = trim(env?.EXECOS_PUBLIC_URL) || 'https://execos.inneranimalmedia.com/run';
    try {
      const res = await fetch(publicUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ExecOS-Key': execosKey,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        return normalizeExecResult(data, 'execos_public', target);
      }
      lastError = trim(data?.error) || `execos_public_http_${res.status}`;
    } catch (e) {
      lastError = `execos_public_throw:${trim(e?.message || e).slice(0, 160)}`;
    }
  }

  // 3) Direct GCP terminal /run (skip dispatcher hop)
  if (execosKey) {
    const gcpUrl = trim(env?.GCP_EXEC_URL) || 'https://terminal.inneranimalmedia.com/run';
    try {
      const res = await fetch(gcpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ExecOS-Key': execosKey,
        },
        body: JSON.stringify({ command, cwd }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        return normalizeExecResult(data, 'gcp_terminal_direct', target);
      }
      lastError = trim(data?.error) || `gcp_direct_http_${res.status}`;
    } catch (e) {
      lastError = `gcp_direct_throw:${trim(e?.message || e).slice(0, 160)}`;
    }
  }

  // 4) Legacy VPC PTY /exec (iam-vpc binding)
  const ptyFallback = await execOnPtyHost(env, {
    command,
    cwd,
    timeout_ms: opts.timeout_ms ?? 120_000,
  });
  if (ptyFallback.ok) {
    return {
      ok: true,
      stdout: ptyFallback.stdout || '',
      stderr: ptyFallback.stderr || '',
      exit_code: ptyFallback.exit_code ?? 0,
      resolution: 'pty_service_exec',
      target: 'pty_vpc',
    };
  }

  return {
    ok: false,
    stdout: ptyFallback.stdout || '',
    stderr: ptyFallback.stderr || lastError,
    exit_code: ptyFallback.exit_code ?? 1,
    resolution: 'failed',
    target,
    error: lastError,
  };
}

/**
 * Probe ExecOS GCP chain + OpenSCAD/Blender toolchain.
 * @param {any} env
 * @param {{ userId?: string|null, tenantId?: string|null, workspaceId?: string|null }} [ctx]
 */
export async function probeExecOsCadHealth(env, ctx = {}) {
  const hasPath =
    !!(env?.EXECOS && trim(env?.EXECOS_KEY)) ||
    !!trim(env?.EXECOS_KEY) ||
    !!(env?.PTY_SERVICE || env?.TERMINAL_WS_URL);

  if (!hasPath) {
    return { status: 'unavailable', reason: 'execos_not_configured', dispatch: 'none' };
  }

  const chainProbe = await runExecOsCommand(env, {
    command: 'echo EXECOS_CHAIN_OK',
    target: 'gcp',
    timeout_ms: 25_000,
  });
  if (!chainProbe.ok) {
    return {
      status: 'unavailable',
      reason: 'execos_unreachable',
      detail: (chainProbe.stderr || chainProbe.error || '').slice(0, 300),
      resolution: chainProbe.resolution,
    };
  }

  const resolved = await resolveCadExecRepoRoot(env, { ...ctx, target: 'gcp' });
  const cwd = resolved.repoRoot;
  if (!cwd) {
    return { status: 'unavailable', reason: 'repo_root_unresolved', dispatch: 'execos' };
  }

  const toolProbe = await runExecOsCommand(env, {
    command:
      'command -v openscad >/dev/null && command -v blender >/dev/null && echo CAD_TOOLCHAIN_OK || echo CAD_TOOLCHAIN_MISSING',
    cwd,
    target: 'gcp',
    timeout_ms: 30_000,
  });
  const out = `${toolProbe.stdout}\n${toolProbe.stderr}`;
  if (out.includes('CAD_TOOLCHAIN_OK')) {
    return {
      status: 'ready',
      dispatch: 'execos',
      target: 'gcp',
      resolution: toolProbe.resolution || chainProbe.resolution,
      cwd,
      repo_source: resolved.source,
      repo_strategy: resolved.strategy,
    };
  }

  return {
    status: 'degraded',
    reason: 'toolchain_missing',
    dispatch: 'execos',
    detail: out.slice(0, 300),
    cwd,
    repo_source: resolved.source,
    repo_strategy: resolved.strategy,
  };
}
