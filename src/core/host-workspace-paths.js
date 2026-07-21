/**
 * Host cwd resolution — local Mac/Windows paths vs GCP iam-tunnel sparse clones.
 *
 * Local: workspace_settings.workspace_root on user_hosted_tunnel.
 * Remote (platform_vm): workspace_settings.vm_workspace_root (required) — fail loud if unset.
 *   Operator-only lanes may pass allowOperatorFallback: true to use IAM_GCP_OPERATOR_REPO.
 * ExecOS runtime: IAM_GCP_EXECOS_HOME (PM2 :3099 dispatcher only — never alias as operator git root).
 */

/** ExecOS PM2 install on GCP VM. */
export const IAM_GCP_EXECOS_HOME = '/home/samprimeaux/ExecOS';

/** Operator sparse git clone on GCP iam-tunnel — only via allowOperatorFallback or explicit constant use. */
export const IAM_GCP_OPERATOR_REPO = '/home/samprimeaux/inneranimalmedia';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * GCP remote lane cwd from workspace settings. Fail loud when unset.
 * @param {Record<string, unknown>|null|undefined} [settings]
 * @param {{ allowOperatorFallback?: boolean }} [opts]
 * @returns {string|null}
 */
export function gcpRemoteExecCwd(settings = null, opts = {}) {
  if (settings && typeof settings === 'object') {
    const fromVm = trim(settings.vm_workspace_root || settings.repo?.vm_path);
    if (fromVm) return fromVm;
  }
  if (opts.allowOperatorFallback === true) return IAM_GCP_OPERATOR_REPO;
  return null;
}

/**
 * @deprecated Prefer gcpRemoteExecCwd(settings, opts). Never invent a path from Mac roots.
 * @param {string} [_root]
 * @param {Record<string, unknown>|null} [settings]
 * @param {{ allowOperatorFallback?: boolean }} [opts]
 */
export function translateHostRootForGcp(_root, settings = null, opts = {}) {
  return gcpRemoteExecCwd(settings, opts);
}

/**
 * @param {Record<string, unknown>|null|undefined} settings
 * @param {{ allowOperatorFallback?: boolean }} [opts]
 * @returns {string|null}
 */
export function vmWorkspaceRootFromSettings(settings, opts = {}) {
  return gcpRemoteExecCwd(settings, opts);
}

/**
 * @param {Record<string, unknown>|null|undefined} settings
 * @param {{ allowOperatorFallback?: boolean }} [opts]
 */
export function vmWorkspaceCdCommandFromSettings(settings, opts = {}) {
  const root = vmWorkspaceRootFromSettings(settings, opts);
  return root ? `cd ${root}` : '';
}

/**
 * Strip Mac `cd /Users/... &&` prefixes for Linux exec hosts.
 * @param {string} command
 * @param {string} gcpRoot — required Linux root; if empty, command is left unchanged
 */
export function rewriteMacCwdInShellCommand(command, gcpRoot) {
  const cmd = trim(command);
  const root = trim(gcpRoot);
  if (!cmd || !root) return cmd;
  const m = cmd.match(/^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*&&\s*(.+)$/is);
  if (!m) return cmd;
  const dir = trim(m[1] || m[2] || m[3]);
  const rest = trim(m[4]);
  if (!dir.startsWith('/Users/') && !/^[A-Za-z]:\\/.test(dir) && !dir.startsWith('/Volumes/')) {
    return cmd;
  }
  const quoted = root.includes(' ') ? `"${root.replace(/"/g, '\\"')}"` : root;
  return `cd ${quoted} && ${rest}`;
}

/**
 * @param {{ platform?: string|null, target_type?: string|null, targetType?: string|null }} [connection]
 */
export function connectionUsesGcpRepoLayout(connection) {
  const platform = trim(connection?.platform).toLowerCase();
  const targetType = trim(connection?.target_type || connection?.targetType).toLowerCase();
  if (platform === 'linux') return true;
  if (targetType === 'platform_vm') return true;
  return false;
}

/**
 * Map macOS workspace_root to GCP vm root when target is platform_vm.
 * Returns null when vm_workspace_root is unset (fail loud) unless allowOperatorFallback.
 * @param {string|null|undefined} cwd
 * @param {{ platform?: string|null, target_type?: string|null, targetType?: string|null }} [connection]
 * @param {Record<string, unknown>|null|undefined} [settings]
 * @param {{ allowOperatorFallback?: boolean }} [opts]
 */
export function normalizeExecCwdForConnection(cwd, connection = null, settings = null, opts = {}) {
  const raw = trim(cwd);
  if (!connectionUsesGcpRepoLayout(connection)) {
    return raw || null;
  }
  if (!raw || raw.startsWith('/Users/') || raw.startsWith('/Volumes/')) {
    return gcpRemoteExecCwd(settings, opts);
  }
  return raw;
}

/**
 * Local/user_hosted_tunnel: workspace_root.
 * GCP platform_vm: vm_workspace_root from settings (fail loud unless allowOperatorFallback).
 * @param {string|null|undefined} workspaceRoot
 * @param {{
 *   connection?: Record<string, unknown>|null,
 *   settings?: Record<string, unknown>|null,
 *   forceGcp?: boolean,
 *   allowOperatorFallback?: boolean,
 * }} [ctx]
 */
export function resolveRepoRootForHost(workspaceRoot, ctx = {}) {
  const root = trim(workspaceRoot);
  const forceGcp = ctx.forceGcp === true || connectionUsesGcpRepoLayout(ctx.connection);
  if (forceGcp) {
    const vm = vmWorkspaceRootFromSettings(ctx.settings, {
      allowOperatorFallback: ctx.allowOperatorFallback === true,
    });
    if (vm) return vm;
    if (root && !root.startsWith('/Users/') && !/^[A-Za-z]:\\/.test(root) && !root.startsWith('/Volumes/')) {
      return root;
    }
    return null;
  }
  return root;
}
