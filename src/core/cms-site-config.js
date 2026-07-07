/**
 * CMS site config — derives cms_hosting from worker_name + cms_site registry;
 * loads bridge URLs from agentsam_workspace columns/metadata (never stored cms_mode).
 */
import { getAgentsamWorkspace, parseWorkspaceMetadata } from './agentsam-workspace.js';
import { hasRegisteredCmsSiteContext } from './cms-workspace-resolve.js';
import {
  isOperatorHubSitePick,
  resolveRuntimeWorkspaceForCmsSlug,
  resolveTargetWorkspaceIdForCmsSlug,
} from './cms-hub-sites.js';
import { resolvePlatformCmsStudioUrl } from './cms-studio-lane.js';
import { resolveCmsSitePublicDomain } from './cms-public-domain.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

const PLATFORM_WORKER_NAME = 'inneranimalmedia';

/**
 * Client-worker CMS = dedicated worker + registered cms_site context (not IAM platform worker).
 * @param {Record<string, unknown>|null|undefined} workspaceRow
 * @param {boolean} hasRegistry
 */
export function isClientWorkerCms(workspaceRow, hasRegistry) {
  const worker = trim(workspaceRow?.worker_name);
  return Boolean(worker && worker !== PLATFORM_WORKER_NAME && hasRegistry);
}

/** @param {Record<string, unknown>|null|undefined} meta */
function deriveApiProfile(meta, workerName) {
  const fromMeta = trim(meta?.api_profile);
  if (fromMeta) return fromMeta;
  const profile = trim(meta?.cms_api_profile);
  if (profile) return profile;
  return 'primetch';
}

/**
 * @param {Record<string, unknown>|null|undefined} meta
 * @param {Record<string, unknown>|null|undefined} wsRow
 */
function resolveWorkerBaseUrl(meta, wsRow) {
  for (const candidate of [
    meta?.worker_base_url,
    meta?.public_domain ? `https://${String(meta.public_domain).replace(/^https?:\/\//, '')}` : null,
    wsRow?.deploy_url,
    meta?.deploy_url,
  ]) {
    const url = trim(candidate);
    if (url) return url.replace(/\/$/, '');
  }
  return null;
}

/**
 * @param {Record<string, unknown>|null|undefined} meta
 */
function resolveStudioPath(meta) {
  const fromMeta = trim(meta?.studio_path);
  if (fromMeta) return fromMeta.startsWith('/') ? fromMeta : `/${fromMeta}`;
  return '/dashboard/cms';
}

function hostnameFromDeployUrl(raw) {
  const url = trim(raw);
  if (!url) return null;
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
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

  const isOperatorHubPick = await isOperatorHubSitePick(env, ws, slug);

  const runtimeWorkspaceId = isOperatorHubPick
    ? ws
    : await resolveRuntimeWorkspaceForCmsSlug(env, ws, slug);
  const effectiveWs = runtimeWorkspaceId || ws;
  const clientRuntimeWs = isOperatorHubPick
    ? trim(await resolveTargetWorkspaceIdForCmsSlug(env, ws, slug)) || null
    : effectiveWs;

  const wsRow = await getAgentsamWorkspace(env, effectiveWs);
  const meta = parseWorkspaceMetadata(wsRow?.metadata_json);
  const clientWsRow =
    isOperatorHubPick && clientRuntimeWs && clientRuntimeWs !== effectiveWs
      ? await getAgentsamWorkspace(env, clientRuntimeWs)
      : wsRow;
  const clientMeta = parseWorkspaceMetadata(clientWsRow?.metadata_json);

  const hasRegistry = isOperatorHubPick
    ? true
    : await hasRegisteredCmsSiteContext(env, effectiveWs);
  const isClientWorker = isOperatorHubPick ? false : isClientWorkerCms(wsRow, hasRegistry);
  const cmsHosting = isClientWorker ? 'client_worker' : 'platform';
  const apiProfile = isOperatorHubPick
    ? deriveApiProfile(clientMeta, clientWsRow?.worker_name)
    : isClientWorker
      ? deriveApiProfile(meta, wsRow?.worker_name)
      : 'primetch';

  const workerBaseUrl = isOperatorHubPick
    ? resolveWorkerBaseUrl(clientMeta, clientWsRow)
    : resolveWorkerBaseUrl(meta, wsRow);
  const studioPath = resolveStudioPath(isOperatorHubPick ? clientMeta : meta);
  const studioUrl = isClientWorker
    ? workerBaseUrl
      ? `${workerBaseUrl}${studioPath}`
      : null
    : resolvePlatformCmsStudioUrl(meta);
  const bridgeSupported =
    (isClientWorker || isOperatorHubPick) &&
    Boolean(workerBaseUrl) &&
    trim(isOperatorHubPick ? clientWsRow?.worker_name : wsRow?.worker_name) !== PLATFORM_WORKER_NAME;

  let publicDomain = trim(isOperatorHubPick ? clientMeta.public_domain : meta.public_domain) || null;
  if (!publicDomain && slug) {
    const resolved = await resolveCmsSitePublicDomain(env, slug, {
      workspaceId: ws,
      workerName: trim(isOperatorHubPick ? clientWsRow?.worker_name : wsRow?.worker_name) || null,
    });
    publicDomain = trim(resolved?.domain) || null;
  }
  if (!publicDomain) {
    publicDomain = hostnameFromDeployUrl(workerBaseUrl);
  }

  return {
    workspace_id: ws,
    runtime_workspace_id: isOperatorHubPick ? clientRuntimeWs || effectiveWs : effectiveWs,
    client_runtime_workspace_id: clientRuntimeWs,
    project_slug: slug || trim(wsRow?.workspace_slug) || null,
    cms_hosting: cmsHosting,
    cms_shell: isOperatorHubPick || !isClientWorker ? 'iam_unified' : 'client_worker_legacy',
    api_profile: apiProfile,
    worker_name: trim(isOperatorHubPick ? clientWsRow?.worker_name : wsRow?.worker_name) || null,
    worker_base_url: workerBaseUrl,
    public_domain: publicDomain,
    studio_path: studioPath,
    studio_url: studioUrl,
    bridge_supported: bridgeSupported,
    deploy_hook_url: trim(isOperatorHubPick ? clientMeta.deploy_hook_url : meta.deploy_hook_url) || null,
    d1_database_id:
      trim(isOperatorHubPick ? clientWsRow?.d1_database_id : wsRow?.d1_database_id) ||
      trim(isOperatorHubPick ? clientMeta.d1_database_id : meta.d1_database_id) ||
      null,
    r2_bucket:
      trim(isOperatorHubPick ? clientWsRow?.r2_bucket : wsRow?.r2_bucket) ||
      trim(isOperatorHubPick ? clientMeta.r2_bucket : meta.r2_bucket) ||
      null,
    kv_namespace: trim(isOperatorHubPick ? clientMeta.kv_namespace : meta.kv_namespace) || null,
  };
}
