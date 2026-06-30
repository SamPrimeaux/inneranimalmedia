/**
 * Host cwd resolution — stateless infrastructure model.
 *
 * Repos live on user machines (workspace_settings.workspace_root) and GitHub only.
 * GCP iam-tunnel runs ExecOS on :3099 — no repo clones, no /workspace tenant paths.
 */

/** ExecOS install dir on GCP VM — default cwd for agentsam_terminal_remote. */
export const IAM_GCP_EXECOS_HOME = '/home/samprimeaux/ExecOS';

/** @deprecated use IAM_GCP_EXECOS_HOME — VM holds ExecOS only, not a git clone */
export const IAM_GCP_OPERATOR_REPO = IAM_GCP_EXECOS_HOME;

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * GCP remote lane cwd — ExecOS dir only (never a repo path).
 * @param {Record<string, unknown>|null|undefined} [_settings]
 */
export function gcpRemoteExecCwd(_settings = null) {
  return IAM_GCP_EXECOS_HOME;
}

/** @deprecated Do not map Mac repo paths onto GCP — VM has no clones */
export function translateHostRootForGcp(_root) {
  return IAM_GCP_EXECOS_HOME;
}

/**
 * @param {Record<string, unknown>|null|undefined} settings
 */
export function vmWorkspaceRootFromSettings(settings) {
  if (settings && typeof settings === 'object') {
    const explicit = trim(settings.execos_home || settings.gcp_execos_home);
    if (explicit) return explicit;
  }
  return IAM_GCP_EXECOS_HOME;
}

/**
 * GCP remote: no auto-cd into a repo — commands run from ExecOS home.
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
 * Local/user_hosted_tunnel: workspace_settings.workspace_root.
 * GCP platform_vm: ExecOS home only.
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
