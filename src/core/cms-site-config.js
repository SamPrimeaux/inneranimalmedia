/**
 * CMS site config — derives cms_hosting from worker_name + cms_site registry;
 * loads bridge URLs from agentsam_workspace columns/metadata (never stored cms_mode).
 */
import { getAgentsamWorkspace, parseWorkspaceMetadata } from './agentsam-workspace.js';
import { hasRegisteredCmsSiteContext } from './cms-workspace-resolve.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

const PLATFORM_WORKER_NAME = 'inneranimalmedia';

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

const API_PROFILE_BY_WORKER = {
  companionscpas: 'cpas_fragment',
  fuelnfreetime: 'fuel_admin',
};

/**
 * Client-worker CMS = dedicated worker + registered cms_site context (not IAM platform worker).
 * @param {Record<string, unknown>|null|undefined} workspaceRow
 * @param {boolean} hasRegistry
 */
export function isClientWorkerCms(workspaceRow, hasRegistry) {
  const worker = trim(workspaceRow?.worker_name);
  return Boolean(worker && worker !== PLATFORM_WORKER_NAME && hasRegistry);
}

/** @param {string|null|undefined} workerName */
function deriveApiProfile(workerName) {
  const worker = trim(workerName).toLowerCase();
  if (worker && API_PROFILE_BY_WORKER[worker]) return API_PROFILE_BY_WORKER[worker];
  return 'primetch';
}

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
      cms_hosting: 'platform',
      api_profile: 'primetch',
      error: 'missing_workspace',
    };
  }

  const wsRow = await getAgentsamWorkspace(env, ws);
  const meta = parseWorkspaceMetadata(wsRow?.metadata_json);
  const hasRegistry = await hasRegisteredCmsSiteContext(env, ws);
  const isClientWorker = isClientWorkerCms(wsRow, hasRegistry);
  const cmsHosting = isClientWorker ? 'client_worker' : 'platform';
  const apiProfile = isClientWorker ? deriveApiProfile(wsRow?.worker_name) : 'primetch';

  const workerBaseUrl = resolveWorkerBaseUrl(meta, wsRow);
  const studioPath = resolveStudioPath(apiProfile, meta);
  const studioUrl = workerBaseUrl && isClientWorker ? `${workerBaseUrl}${studioPath}` : null;
  const bridgeSupported = isClientWorker && Boolean(workerBaseUrl);

  let publicDomain = trim(meta.public_domain) || null;
  if (!publicDomain && slug && env?.DB) {
    try {
      const tenant = await env.DB.prepare(
        `SELECT domain FROM cms_tenants WHERE slug = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
      )
        .bind(slug)
        .first();
      publicDomain = trim(tenant?.domain) || null;
    } catch (_) {}
  }
  if (!publicDomain && trim(wsRow?.worker_name) === PLATFORM_WORKER_NAME) {
    publicDomain = 'inneranimalmedia.com';
  }

  return {
    workspace_id: ws,
    project_slug: slug || trim(wsRow?.workspace_slug) || null,
    cms_hosting: cmsHosting,
    api_profile: apiProfile,
    worker_name: trim(wsRow?.worker_name) || null,
    worker_base_url: workerBaseUrl,
    public_domain: publicDomain,
    studio_path: studioPath,
    studio_url: studioUrl,
    bridge_supported: bridgeSupported,
    deploy_hook_url: trim(meta.deploy_hook_url) || null,
    d1_database_id: trim(wsRow?.d1_database_id) || trim(meta.d1_database_id) || null,
    r2_bucket: trim(wsRow?.r2_bucket) || trim(meta.r2_bucket) || null,
    kv_namespace: trim(meta.kv_namespace) || null,
  };
}
