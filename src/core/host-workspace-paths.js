/**
 * Host cwd resolution — local Mac/Windows paths vs GCP iam-tunnel operator clone.
 *
 * Local: workspace_settings.workspace_root on user_hosted_tunnel.
 * Remote (platform_vm): /home/samprimeaux/inneranimalmedia git clone (agentsam user).
 * ExecOS runtime: /home/samprimeaux/ExecOS (PM2 :3099 dispatcher only).
 */

/** ExecOS PM2 install on GCP VM. */
export const IAM_GCP_EXECOS_HOME = '/home/samprimeaux/ExecOS';

/** Operator git clone on GCP iam-tunnel — agentsam_terminal_remote build lane. */
export const IAM_GCP_OPERATOR_REPO = '/home/samprimeaux/inneranimalmedia';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * GCP remote lane cwd — operator repo clone (git/npm/wrangler on iam-tunnel).
 * @param {Record<string, unknown>|null|undefined} [settings]
 */
export function gcpRemoteExecCwd(settings = null) {
  if (settings && typeof settings === 'object') {
    const fromVm = trim(settings.vm_workspace_root || settings.repo?.vm_path);
    if (fromVm) return fromVm;
  }
  return IAM_GCP_OPERATOR_REPO;
}

/** @deprecated use gcpRemoteExecCwd() */
export function translateHostRootForGcp(_root) {
  return IAM_GCP_OPERATOR_REPO;
}

/**
 * @param {Record<string, unknown>|null|undefined} settings
 */
export function vmWorkspaceRootFromSettings(settings) {
  if (settings && typeof settings === 'object') {
    const vmRoot = trim(settings.vm_workspace_root || settings.repo?.vm_path);
    if (vmRoot) return vmRoot;
  }
  return IAM_GCP_OPERATOR_REPO;
}

/**
 * @param {Record<string, unknown>|null|undefined} settings
 */
export function vmWorkspaceCdCommandFromSettings(settings) {
  const root = vmWorkspaceRootFromSettings(settings);
  return root ? `cd ${root}` : '';
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
 * Map macOS workspace_root to GCP operator clone when target is platform_vm.
 * @param {string|null|undefined} cwd
 * @param {{ platform?: string|null, target_type?: string|null, targetType?: string|null }} [connection]
 * @param {Record<string, unknown>|null|undefined} [settings]
 */
export function normalizeExecCwdForConnection(cwd, connection = null, settings = null) {
  const raw = trim(cwd);
  if (!connectionUsesGcpRepoLayout(connection)) {
    return raw || null;
  }
  if (!raw || raw.startsWith('/Users/') || raw.startsWith('/Volumes/')) {
    return gcpRemoteExecCwd(settings);
  }
  return raw;
}

/**
 * Local/user_hosted_tunnel: workspace_settings.workspace_root.
 * GCP platform_vm: operator repo clone on iam-tunnel.
 * @param {string|null|undefined} workspaceRoot
 * @param {{ connection?: Record<string, unknown>|null, settings?: Record<string, unknown>|null, forceGcp?: boolean }} [ctx]
 */
export function resolveRepoRootForHost(workspaceRoot, ctx = {}) {
  const root = trim(workspaceRoot);
  const forceGcp = ctx.forceGcp === true || connectionUsesGcpRepoLayout(ctx.connection);
  if (forceGcp) {
    return vmWorkspaceRootFromSettings(ctx.settings);
  }
  return root;
}
