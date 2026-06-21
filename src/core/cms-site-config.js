/**
 * CMS site config — loads cms_mode / api_profile / studio_url from agentsam_workspace SSOT.
 */
import { getAgentsamWorkspace, parseWorkspaceMetadata } from './agentsam-workspace.js';
import { PLATFORM_WORKSPACE_ID } from './platform-operator-policy.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

const DEFAULT_WORKER_BASE = {
  companionscpas: 'https://companionscpas.meauxbility.workers.dev',
  fuelnfreetime: 'https://fuelnfreetime.meauxbility.workers.dev',
  inneranimalmedia: 'https://inneranimalmedia.meauxbility.workers.dev',
};

const DEFAULT_STUDIO_PATH = {
  cpas_fragment: '/dashboard/cms/website',
  fuel_admin: '/admin/cms',
  primetch: '/dashboard/cms/pages',
};

/**
 * @param {Record<string, unknown>|null|undefined} meta
 * @param {Record<string, unknown>|null|undefined} wsRow
 */
function resolveWorkerBaseUrl(meta, wsRow) {
  const fromMeta = trim(meta?.worker_base_url);
  if (fromMeta) return fromMeta.replace(/\/$/, '');
  const worker = trim(wsRow?.worker_name);
  if (worker && DEFAULT_WORKER_BASE[worker]) return DEFAULT_WORKER_BASE[worker];
  const slug = trim(wsRow?.workspace_slug);
  if (slug) return `https://${slug}.meauxbility.workers.dev`;
  return null;
}

/**
 * @param {string|null|undefined} apiProfile
 * @param {Record<string, unknown>} meta
 */
function resolveStudioPath(apiProfile, meta) {
  const fromMeta = trim(meta?.studio_path);
  if (fromMeta) return fromMeta.startsWith('/') ? fromMeta : `/${fromMeta}`;
  const profile = trim(apiProfile).toLowerCase();
  return DEFAULT_STUDIO_PATH[profile] || '/dashboard/cms';
}

/**
 * @param {any} env
 * @param {string} workspaceId
 * @param {string|null|undefined} [projectSlug]
 */
export async function resolveCmsSiteConfig(env, workspaceId, projectSlug = null) {
  const ws = trim(workspaceId);
  const slug = trim(projectSlug);
  if (!env?.DB || !ws) {
    return {
      workspace_id: ws || null,
      project_slug: slug || null,
      cms_mode: 'platform_hosted',
      api_profile: 'primetch',
      error: 'missing_workspace',
    };
  }

  const wsRow = await getAgentsamWorkspace(env, ws);
  const meta = parseWorkspaceMetadata(wsRow?.metadata_json);

  let cmsMode = trim(meta.cms_mode).toLowerCase();
  if (!cmsMode) {
    cmsMode = ws === PLATFORM_WORKSPACE_ID ? 'platform_hosted' : 'platform_hosted';
  }
  if (!['platform_hosted', 'client_worker'].includes(cmsMode)) {
    cmsMode = 'platform_hosted';
  }

  let apiProfile = trim(meta.api_profile).toLowerCase();
  if (!apiProfile) {
    apiProfile = cmsMode === 'client_worker' ? 'cpas_fragment' : 'primetch';
  }

  const workerBaseUrl = resolveWorkerBaseUrl(meta, wsRow);
  const studioPath = resolveStudioPath(apiProfile, meta);
  const studioUrl = workerBaseUrl && cmsMode === 'client_worker' ? `${workerBaseUrl}${studioPath}` : null;
  const bridgeSupported = cmsMode === 'client_worker' && Boolean(workerBaseUrl);

  return {
    workspace_id: ws,
    project_slug: slug || trim(wsRow?.workspace_slug) || null,
    cms_mode: cmsMode,
    api_profile: apiProfile,
    worker_name: trim(wsRow?.worker_name) || null,
    worker_base_url: workerBaseUrl,
    public_domain: trim(meta.public_domain) || null,
    studio_path: studioPath,
    studio_url: studioUrl,
    bridge_supported: bridgeSupported,
    deploy_hook_url: trim(meta.deploy_hook_url) || null,
    d1_database_id: trim(wsRow?.d1_database_id) || trim(meta.d1_database_id) || null,
    r2_bucket: trim(wsRow?.r2_bucket) || trim(meta.r2_bucket) || null,
    kv_namespace: trim(meta.kv_namespace) || null,
  };
}
