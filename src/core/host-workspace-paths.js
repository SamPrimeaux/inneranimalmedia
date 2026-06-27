/**
 * Host-specific workspace roots — Mac localpty vs GCP iam-tunnel Linux clone.
 * GitHub is SSOT; VM path is always ~/inneranimalmedia on iam-tunnel.
 */

export const IAM_GCP_OPERATOR_REPO = '/home/samprimeaux/inneranimalmedia';

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
 * @param {Record<string, unknown>|null|undefined} settings
 */
export function vmWorkspaceRootFromSettings(settings) {
  if (!settings || typeof settings !== 'object') return '';
  const explicit = trim(settings.vm_workspace_root);
  if (explicit) return explicit;
  const macRoot = trim(settings.workspace_root);
  return translateHostRootForGcp(macRoot) || IAM_GCP_OPERATOR_REPO;
}

/**
 * @param {Record<string, unknown>|null|undefined} settings
 */
export function vmWorkspaceCdCommandFromSettings(settings) {
  if (!settings || typeof settings !== 'object') return '';
  const explicit = trim(settings.vm_workspace_cd_command);
  if (explicit) return explicit;
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
 * @param {string|null|undefined} workspaceRoot
 * @param {{ connection?: Record<string, unknown>|null, settings?: Record<string, unknown>|null, forceGcp?: boolean }} [ctx]
 */
export function resolveRepoRootForHost(workspaceRoot, ctx = {}) {
  const root = trim(workspaceRoot);
  const forceGcp = ctx.forceGcp === true || connectionUsesGcpRepoLayout(ctx.connection);
  if (forceGcp) {
    if (ctx.settings) {
      const fromSettings = vmWorkspaceRootFromSettings(ctx.settings);
      if (fromSettings) return fromSettings;
    }
    return translateHostRootForGcp(root) || IAM_GCP_OPERATOR_REPO;
  }
  return root;
}
