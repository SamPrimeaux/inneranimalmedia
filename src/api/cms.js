/**
 * API Service: CMS (Content Management System)
 * Handles page metadata in D1 and content persistence in R2.
 *
 * Typed contracts: src/types/cms.ts (TypeScript-first — dashboard + future Worker migration)
 *
 * Rules:
 * 1. D1 row = metadata + routing.
 * 2. Actual content = R2 object (HTML/MD) on ASSETS (inneranimalmedia).
 * 3. R2 key format: cms/{workspace_id}/{project_id}/{slug}/[draft|published].html
 * 4. Every INSERT must write person_uuid and tenant_id.
 * 5. R2 writes must succeed before D1 writes.
 */

import { getAuthUser, jsonResponse } from '../core/auth.js';
import { resolveIamActorContext } from '../core/identity.js';
import {
  acquireCmsPublishLock,
  cmsBootstrapKey,
  getCmsDraftCache,
  invalidateCmsBootstrapCache,
  putCmsDraftCache,
  releaseCmsPublishLock,
} from '../core/cms-kv-cache.js';
import {
  auditCmsMutation,
  clearCmsDraftHotCache,
  cmsOverrideProjectId,
  copyR2Object,
  ensureCmsDraftR2BeforePublish,
  flushCmsDraftToD1,
  invalidateCmsBootstrap,
  loadCmsPagePreviewContext,
  logCmsActivity,
  promoteCmsDraftOverrides,
  renderCmsSectionTreeHtml,
  stageCmsDraftKv,
  writeCmsDraftHtmlToR2,
} from '../core/cms-edit-safety.js';
import {
  joinCmsLiveEditSession,
  leaveCmsLiveEditSession,
  touchCmsLiveEditSession,
} from '../core/cms-live-edit-session.js';
import { provisionCmsProject } from '../core/cms-project-provision.js';
import { upsertCmsSiteProjectContext } from '../core/cms-project-context.js';
import { emitInnerAnimalProEvent } from '../core/inneranimalpro-stream.js';
import {
  cmsPublishGateErrorResponse,
  runCmsPromotionGate,
  verifyCmsPublishContract,
} from '../core/cms-promotion-gates.js';
import {
  cmsDraftPayloadBytes,
  cmsDraftSectionCount,
  cmsExceedsSpawnThreshold,
  maybeSpawnCmsHeavyJob,
  maybeSpawnCmsSessionHandoff,
} from '../core/cms-spawn-bridge.js';
import { logPromptCacheUsage } from '../core/prompt-cache-economics.js';
import {
  buildCmsPagesListQuery,
  fetchCmsComponentInScope,
  fetchCmsPageInScope,
  fetchCmsSectionInScope,
  resolveCmsApiScope,
} from '../core/cms-access.js';
import {
  listCmsSitesForScope,
  persistBootstrapCmsProjectSlug,
  normalizeCmsSitesResponse,
  resolveCmsBootstrapProjectSlug,
  resolveCmsWorkspaceContext,
  sortSitesForWorkspace,
} from '../core/cms-workspace-resolve.js';
import { resolveActiveCmsThemeRow } from '../core/cms-theme-resolve.js';
import {
  enrichPagesWithStorefrontAssets,
  listIamStorefrontCatalog,
  readStorefrontAssetHtml,
  resolveIamPageHtmlKeys,
  resolveIamStorefrontAssetForPage,
} from '../core/iam-storefront-assets.js';
import {
  listSiteShellPartsMeta,
  publishSiteShellPart,
  readSiteShellPart,
  writeSiteShellDraft,
} from '../core/cms-site-shell.js';
import { isOperatorCmsHubWorkspace } from '../core/cms-hub-sites.js';
import { resolveCmsSiteConfig } from '../core/cms-site-config.js';
import { resolveCmsSitePublicDomain } from '../core/cms-public-domain.js';
import { resolveCmsTenantByProjectSlug } from '../core/cms-tenant-resolve.js';
import { mintCmsEmbedSession, proxyCmsBridgeRequest, isCmsBridgeEligible } from '../core/cms-client-bridge.js';
import { tryBridgedCpasCmsRequest } from '../core/cms-bridge-cpas-adapter.js';
import {
  isFullHtmlDocument,
  normalizeFullPageHtml,
  renderCmsSectionTreeHtmlWithInjections,
} from '../core/cms-injected-sections.js';
import {
  cmsStaticShellKeyForRoute,
  hydrateCmsRoutePageHtml,
  normalizeCmsRoutePath,
} from '../core/cms-page-hydrate-dispatch.js';
import { buildCmsPageUrls } from '../core/cms-preview-route.js';
import { executeCmsPagePublish } from '../core/cms-agent-publish.ts';
import { getSitePackageInventory, enqueueSitePackageProceed } from '../core/cms-site-package-api.js';
import { auditSitePackageById } from '../core/cms-theme-pipeline-audit.js';
import { listCmsProceedTargets } from '../core/resolve-cms-database.js';
import {
  CMS_DEFAULT_R2_BUCKET,
  cmsR2PublicObjectUrl,
  getCmsR2Binding,
} from '../core/cms-r2-binding.js';

export { CMS_DEFAULT_R2_BUCKET };

function cmsPageKey(workspaceId, projectId, slug, variant) {
  return `cms/${workspaceId}/${projectId}/${slug}/${variant}.html`;
}

function cmsMarketingSlugSuffix(len = 6) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function cmsSnapshotKey(workspaceId, projectId, slug, ts) {
  return `cms/${workspaceId}/${projectId}/${slug}/snapshots/${ts}.html`;
}

function cmsPathSegment(value, fallback = 'section') {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}

async function cmsContentSha256(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(input ?? '')));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function cmsSectionHtmlKey(pageSlug, sectionName, hash) {
  return `cms/sections/${cmsPathSegment(pageSlug, 'page')}/${cmsPathSegment(sectionName)}/${hash}.html`;
}

function cmsR2PublicUrlFromRequest(request, bucket, key) {
  const direct = cmsR2PublicObjectUrl(bucket, key);
  if (direct) return direct;
  const origin = new URL(request.url).origin;
  return `${origin}/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`;
}

/** @param {import('../core/auth.js').AuthUser} authUser @param {Request} request */
function cmsMutationMeta(authUser, request) {
  const routeKey = request.headers.get('x-iam-route-key') || request.headers.get('X-IAM-Route-Key') || '';
  let agentApplied = false;
  try {
    // body not parsed yet — caller may pass flag separately
  } catch (_) {}
  return {
    userId: authUser.id,
    routeKey: String(routeKey || '').trim(),
    agentApplied: agentApplied || routeKey === 'cms_edit',
  };
}

/**
 * Generates an R2 presigned URL for GET operations via S3 API.
 */
async function presignR2GetObjectUrl(env, bucket, key, expiresSeconds = 3600) {
  const accessKey = env.R2_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_ACCESS_KEY;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!accessKey || !secretKey || !accountId) return null;

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  
  const encodedKey = String(key).split('/').map(seg => encodeURIComponent(seg)).join('/');
  
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host'
  });
  
  const sortedPairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const canonicalQueryString = sortedPairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  
  const sha256 = async (msg) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const hmac = async (key, msg) => {
    const cryptoKey = await crypto.subtle.importKey(
      'raw', typeof key === 'string' ? new TextEncoder().encode(key) : key,
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg));
    return new Uint8Array(sig);
  };

  const canonicalRequest = ['GET', `/${bucket}/${encodedKey}`, canonicalQueryString, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256(canonicalRequest)].join('\n');
  
  const kDate = await hmac('AWS4' + secretKey, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const signingKey = await hmac(kService, 'aws4_request');
  
  const signature = Array.from(await hmac(signingKey, stringToSign)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `https://${host}/${bucket}/${encodedKey}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// --- CMS API Handlers ---

export async function handleCmsApi(request, url, env, ctx) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  const method = request.method.toUpperCase();
  const path = url.pathname.replace(/\/$/, '');
  const pathParts = path.split('/');
  
  // Scoping context
  const authTenantId = authUser.tenant_id;
  const personUuid = authUser.person_uuid;
  const actorCtx = await resolveIamActorContext(request, env).catch(() => null);
  const workspaceId = actorCtx?.workspaceId || (authUser.workspace_id ? String(authUser.workspace_id).trim() : '') || null;
  if (!authTenantId || String(authTenantId).trim() === '') {
    return jsonResponse({ error: 'TENANT_CONTEXT_MISSING' }, 400);
  }
  if (!workspaceId) {
    return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING' }, 400);
  }

  if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, 503);

  const requestCache = {};
  const tenantId = authTenantId;
  const cmsScope = await resolveCmsApiScope(env, authUser, workspaceId);

  if (path === '/api/cms/workspace-context' && method === 'GET') {
    try {
      const explicit =
        url.searchParams.get('project_slug') ||
        url.searchParams.get('site') ||
        null;
      const wsCtx = await resolveCmsWorkspaceContext(env, request, authUser, requestCache, {
        explicitProjectSlug: explicit,
      });
      if (wsCtx.error) {
        return jsonResponse({
          error: wsCtx.error,
          sites: normalizeCmsSitesResponse(wsCtx.sites),
        }, 400);
      }
      const siteConfig = await resolveCmsSiteConfig(env, workspaceId, wsCtx.project_slug);
      const is_operator_hub = await isOperatorCmsHubWorkspace(env, wsCtx.workspace_id);
      return jsonResponse({
        ...wsCtx,
        ...siteConfig,
        is_operator_hub,
        sites: normalizeCmsSitesResponse(wsCtx.sites),
      });
    } catch (e) {
      console.warn('[cms] workspace-context GET', e?.message || e);
      let sites = [];
      try {
        sites = await listCmsSitesForScope(env, { tenantId: authTenantId, workspaceId });
      } catch (_) {}
      return jsonResponse({ error: e.message, sites }, 500);
    }
  }

  if (path === '/api/cms/projects/create' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const reqWorkspaceId = String(body.workspace_id || workspaceId || '').trim();
    if (reqWorkspaceId && reqWorkspaceId !== workspaceId) {
      return jsonResponse({ error: 'WORKSPACE_MISMATCH' }, 403);
    }
    try {
      const result = await provisionCmsProject(env, ctx, {
        tenantId,
        workspaceId,
        userId: authUser.id,
        personUuid: personUuid,
        authUser,
        request,
        payload: body,
      });
      if (!result.ok) {
        return jsonResponse(
          { ok: false, error: result.error, project_slug: result.project_slug || null },
          result.status || 400,
        );
      }
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ ok: false, error: e.message }, 500);
    }
  }

  if (path === '/api/cms/workspace-context' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const projectSlug = String(body.project_slug || body.site || '').trim();
    if (!projectSlug) return jsonResponse({ error: 'project_slug required' }, 400);
    try {
      const wsCtx = await resolveCmsWorkspaceContext(env, request, authUser, requestCache);
      if (wsCtx.error) return jsonResponse({ error: wsCtx.error }, 400);
      const allowed = (wsCtx.sites || []).some((s) => s.slug === projectSlug);
      if (!allowed) return jsonResponse({ error: 'CMS_SITE_NOT_ALLOWED', project_slug: projectSlug }, 403);
      if (!wsCtx.bootstrap_id) return jsonResponse({ error: 'BOOTSTRAP_ROW_MISSING' }, 409);
      const saved = await persistBootstrapCmsProjectSlug(env, {
        bootstrapId: wsCtx.bootstrap_id,
        userId: authUser.id,
        workspaceId,
        projectSlug,
      });
      if (!saved.ok) return jsonResponse({ error: saved.error || 'persist_failed' }, 409);
      const next = await resolveCmsWorkspaceContext(env, request, authUser, requestCache, {
        explicitProjectSlug: projectSlug,
      });
      const siteConfig = await resolveCmsSiteConfig(env, workspaceId, next.project_slug);
      const is_operator_hub = await isOperatorCmsHubWorkspace(env, next.workspace_id);
      return jsonResponse({ ok: true, ...next, ...siteConfig, is_operator_hub });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  const explicitProjectSlug =
    url.searchParams.get('project_slug') || url.searchParams.get('site') || url.searchParams.get('project_id') || null;
  const siteConfig = await resolveCmsSiteConfig(env, workspaceId, explicitProjectSlug);

  if (path === '/api/cms/bridge/embed-session' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const projectSlug = String(body.project_slug || body.site || siteConfig.project_slug || '').trim();
    if (!projectSlug) return jsonResponse({ error: 'project_slug required' }, 400);
    if (!cmsScope.allowedSlugs.has(projectSlug)) {
      return jsonResponse({ error: 'CMS_SITE_NOT_ALLOWED', project_slug: projectSlug }, 403);
    }
    const cfg = await resolveCmsSiteConfig(env, workspaceId, projectSlug);
    if (!isCmsBridgeEligible(cfg)) {
      return jsonResponse({ error: 'CMS_BRIDGE_NOT_APPLICABLE', cms_hosting: cfg.cms_hosting, bridge_supported: cfg.bridge_supported }, 409);
    }
    const mint = await mintCmsEmbedSession(env, authUser, { ...cfg, project_slug: projectSlug });
    if (!mint.ok) {
      return jsonResponse(
        { error: mint.error || 'embed_session_failed', status: mint.status, hint: 'Client worker bridge middleware pending (Agent 4)' },
        mint.status && mint.status >= 400 ? mint.status : 502,
      );
    }
    return jsonResponse({
      embed_url: mint.embed_url,
      expires_at: mint.expires_at,
      studio_url: cfg.studio_url,
      bridge_supported: cfg.bridge_supported,
    });
  }

  if (path.startsWith('/api/cms/bridge/')) {
    const projectSlug =
      url.searchParams.get('project_slug') ||
      url.searchParams.get('site') ||
      explicitProjectSlug ||
      siteConfig.project_slug;
    const slug = String(projectSlug || '').trim();
    if (!slug || !cmsScope.allowedSlugs.has(slug)) {
      return jsonResponse({ error: 'CMS_SITE_NOT_ALLOWED', project_slug: slug || null }, 403);
    }
    const cfg = await resolveCmsSiteConfig(env, workspaceId, slug);
    if (!isCmsBridgeEligible(cfg)) {
      return jsonResponse({ error: 'CMS_BRIDGE_NOT_APPLICABLE', cms_hosting: cfg.cms_hosting, bridge_supported: cfg.bridge_supported }, 409);
    }
    const proxied = await proxyCmsBridgeRequest(env, request, authUser, { ...cfg, project_slug: slug }, path);
    return jsonResponse(proxied.body, proxied.status || (proxied.ok ? 200 : 502));
  }

  const bridgeProjectSlug = String(
    explicitProjectSlug || url.searchParams.get('project_slug') || url.searchParams.get('site') || siteConfig.project_slug || '',
  ).trim();

  if (bridgeProjectSlug && cmsScope.allowedSlugs.has(bridgeProjectSlug) && !path.startsWith('/api/cms/workspace-context')) {
    const bridgeCfg = await resolveCmsSiteConfig(env, workspaceId, bridgeProjectSlug);
    if (isCmsBridgeEligible(bridgeCfg)) {
      const bridged = await tryBridgedCpasCmsRequest(env, request, authUser, {
        path,
        method,
        url,
        siteConfig: { ...bridgeCfg, project_slug: bridgeProjectSlug },
        projectSlug: bridgeProjectSlug,
      });
      if (bridged) return bridged;
    }
  }

  if (siteConfig.cms_hosting === 'client_worker' && !path.startsWith('/api/cms/workspace-context')) {
    return jsonResponse(
      {
        error: 'CMS_CLIENT_WORKER_MODE',
        cms_hosting: siteConfig.cms_hosting,
        api_profile: siteConfig.api_profile,
        studio_url: siteConfig.studio_url,
        bridge_prefix: siteConfig.api_profile === 'fuel_admin' ? '/api/cms/bridge/admin/cms' : '/api/cms/bridge/cms',
        message: 'Use ClientWorkerCmsStudio embed or /api/cms/bridge/* — platform PrimeTech D1 is registry-only for this workspace.',
      },
      409,
    );
  }

  /**
   * GET /api/cms/pages
   * List pages for workspace (metadata only).
   */
  if (path === '/api/cms/pages' && method === 'GET') {
    const projectId = url.searchParams.get('project_id');
    try {
      if (projectId && !cmsScope.allowedSlugs.has(String(projectId).trim())) {
        return jsonResponse({ error: 'CMS_SITE_NOT_ALLOWED', project_id: projectId }, 403);
      }
      const listQuery = buildCmsPagesListQuery(cmsScope, projectId);
      if (!listQuery) return jsonResponse({ pages: [] });
      const { results } = await env.DB.prepare(listQuery.sql).bind(...listQuery.binds).all();
      return jsonResponse({ pages: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  const pagePreviewUrlsMatch = path.match(/^\/api\/cms\/pages\/([^/]+)\/preview-urls$/);
  if (pagePreviewUrlsMatch && method === 'GET') {
    const pageId = pagePreviewUrlsMatch[1];
    try {
      const page = await fetchCmsPageInScope(env, pageId, cmsScope);
      if (!page) return jsonResponse({ error: 'Page not found' }, 404);
      const projectSlug = String(page.project_slug || page.project_id || '').trim();
      const resolved = await resolveCmsSitePublicDomain(env, projectSlug, { workspaceId });
      return jsonResponse({
        page_id: pageId,
        public_domain: resolved?.domain || null,
        domain_source: resolved?.source || null,
        ...buildCmsPageUrls(page, {
          domain: resolved?.domain || null,
        }),
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  /**
   * GET /api/cms/pages/:id
   * Return metadata + presigned R2 URL for content.
   */
  const pageIdMatch = path.match(/^\/api\/cms\/pages\/([^/]+)$/);
  if (pageIdMatch && method === 'GET') {
    const pageId = pageIdMatch[1];
    const useDraft = url.searchParams.get('draft') === '1' || url.searchParams.get('preview') === 'draft';
    const projectSlugParam = String(url.searchParams.get('project_slug') || '').trim();
    try {
      const page = await fetchCmsPageInScope(env, pageId, cmsScope, projectSlugParam || null);

      if (!page) return jsonResponse({ error: 'Page not found' }, 404);

      const tenantRow = await env.DB.prepare(
        `SELECT domain, slug FROM cms_tenants WHERE slug = ? LIMIT 1`,
      )
        .bind(String(page.project_slug || page.project_id || '').trim())
        .first()
        .catch(() => null);

      const bucket = page.r2_bucket || CMS_DEFAULT_R2_BUCKET;
      const htmlKeys = resolveIamPageHtmlKeys(page, workspaceId, cmsPageKey);
      const assetDef = resolveIamStorefrontAssetForPage(page);
      const assetBucket = htmlKeys.bucket || bucket;
      let contentUrl = null;
      const publishedKey = htmlKeys.published_key || page.r2_key;
      if (publishedKey) {
        contentUrl = await presignR2GetObjectUrl(env, assetBucket, publishedKey);
      }

      let sections = [];
      let componentsBySection = {};
      let activeDraft = null;
      if (useDraft) {
        const previewCtx = await loadCmsPagePreviewContext(env, pageId, authUser.id);
        sections = previewCtx?.sections || [];
        componentsBySection = previewCtx?.componentsBySection || {};
        activeDraft = previewCtx?.draftData || null;
      } else {
        const { results: sectionRows } = await env.DB.prepare(
          `SELECT id, section_type, section_name, section_data, sort_order, is_visible
           FROM cms_page_sections WHERE page_id = ? ORDER BY sort_order`,
        )
          .bind(pageId)
          .all()
          .catch(() => ({ results: [] }));
        sections = (sectionRows || []).map((s) => ({
          ...s,
          section_data: s.section_data
            ? (() => {
                try {
                  return typeof s.section_data === 'string' ? JSON.parse(s.section_data) : s.section_data;
                } catch {
                  return {};
                }
              })()
            : {},
        }));
        const sectionIds = sections.map((s) => s.id).filter(Boolean);
        if (sectionIds.length) {
          const placeholders = sectionIds.map(() => '?').join(',');
          const { results: compRows } = await env.DB.prepare(
            `SELECT id, section_id, component_type, component_data, sort_order, is_visible
             FROM cms_section_components WHERE section_id IN (${placeholders}) ORDER BY sort_order`,
          )
            .bind(...sectionIds)
            .all()
            .catch(() => ({ results: [] }));
          for (const c of compRows || []) {
            if (!componentsBySection[c.section_id]) componentsBySection[c.section_id] = [];
            componentsBySection[c.section_id].push({
              ...c,
              component_data: c.component_data
                ? (() => {
                    try {
                      return typeof c.component_data === 'string'
                        ? JSON.parse(c.component_data)
                        : c.component_data;
                    } catch {
                      return {};
                    }
                  })()
                : {},
            });
          }
        }
      }
      const r2BindingPreview = getCmsR2Binding(env, assetBucket);
      let preview_html = r2BindingPreview
        ? await renderCmsSectionTreeHtmlWithInjections(
            sections,
            componentsBySection,
            r2BindingPreview,
          )
        : renderCmsSectionTreeHtml(sections, componentsBySection);

      if (assetDef && r2BindingPreview) {
        const assetRead = await readStorefrontAssetHtml(
          r2BindingPreview,
          {
            draft_key: htmlKeys.draft_key,
            published_key: htmlKeys.published_key,
          },
          useDraft ? 'draft' : 'published',
        );
        if (assetRead.html) {
          if (assetDef.hydrate) {
            const route = normalizeCmsRoutePath(assetDef.route);
            preview_html = await hydrateCmsRoutePageHtml(
              assetRead.html,
              route,
              sections,
              r2BindingPreview,
            );
          } else {
            preview_html = assetRead.html;
          }
        }
      }

      let draftContentUrl = null;
      if (useDraft && htmlKeys.draft_key) {
        draftContentUrl = await presignR2GetObjectUrl(env, assetBucket, htmlKeys.draft_key);
      }

      const routePath = String(page.route_path || `/${page.slug || ''}`).trim() || '/';
      const previewUrls = buildCmsPageUrls(page, {
        domain: tenantRow?.domain || null,
        projectSlug: page.project_slug || page.project_id || null,
      });
      const liveUrl = previewUrls.live_url;

      return jsonResponse({
        page: {
          ...page,
          storefront_edit_mode: htmlKeys.mode,
          storefront_asset_r2_key: assetDef?.r2_key || null,
          storefront_hydrate: assetDef?.hydrate === true,
        },
        content_url: useDraft && draftContentUrl ? draftContentUrl : contentUrl,
        preview_html,
        preview_mode: useDraft ? 'draft' : 'published',
        live_url: liveUrl,
        preview_urls: previewUrls,
        r2_key: useDraft ? htmlKeys.draft_key : publishedKey,
        storefront_edit_mode: htmlKeys.mode,
        storefront_asset: assetDef
          ? {
              route_path: normalizeCmsRoutePath(assetDef.route),
              r2_key: assetDef.r2_key,
              draft_key: htmlKeys.draft_key,
              hydrate: assetDef.hydrate === true,
              chrome: assetDef.chrome === true,
            }
          : null,
        sections,
        components_by_section: componentsBySection,
        active_draft: activeDraft,
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  const draftPageMatch = path.match(/^\/api\/cms\/pages\/([^/]+)\/draft$/);
  if (draftPageMatch && (method === 'GET' || method === 'PUT')) {
    const pageId = draftPageMatch[1];
    try {
      const page = await fetchCmsPageInScope(env, pageId, cmsScope);
      if (!page) return jsonResponse({ error: 'Page not found' }, 404);

      if (method === 'GET') {
        const kvDraft = await getCmsDraftCache(env, pageId, authUser.id);
        const row = await env.DB.prepare(
          `SELECT draft_data, updated_at FROM cms_page_drafts WHERE page_id = ? AND user_id = ? LIMIT 1`,
        )
          .bind(pageId, authUser.id)
          .first()
          .catch(() => null);
        let draftData = null;
        if (kvDraft?.draft_data) draftData = kvDraft.draft_data;
        else if (kvDraft && typeof kvDraft === 'object') draftData = kvDraft;
        else if (row?.draft_data) {
          try {
            draftData = JSON.parse(row.draft_data);
          } catch {
            draftData = row.draft_data;
          }
        }
        return jsonResponse({
          page_id: pageId,
          draft_data: draftData,
          source: kvDraft ? 'kv' : row ? 'd1' : null,
          updated_at: row?.updated_at || kvDraft?.cached_at || null,
        });
      }

      let body = {};
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }
      const draftData = body.draft_data ?? body.draftData ?? body;
      const flush = body.flush === true || body.flush === 1;
      const meta = cmsMutationMeta(authUser, request);
      if (body.agent_applied === true) meta.agentApplied = true;

      await stageCmsDraftKv(env, {
        pageId,
        userId: authUser.id,
        payload: typeof draftData === 'object' ? draftData : { content: draftData },
      });

      let flushed = null;
      let draftR2 = null;
      if (flush) {
        flushed = await flushCmsDraftToD1(env, {
          pageId,
          userId: authUser.id,
          draftData: typeof draftData === 'object' ? draftData : { content: draftData },
        });
        draftR2 = await writeCmsDraftHtmlToR2(env, {
          workspaceId,
          page,
          userId: authUser.id,
          draftData: typeof draftData === 'object' ? draftData : { content: draftData },
        });
      }

      await touchCmsLiveEditSession(env, { pageId, userId: authUser.id });

      const projectSlug = String(page.project_slug || page.project_id || '').trim();
      ctx.waitUntil(
        logCmsActivity(env, {
          tenantId,
          userId: authUser.id,
          action: flush ? 'draft_flush' : 'draft_save',
          resourceType: 'draft',
          resourceId: pageId,
          details: { flushed: !!flushed?.ok },
        }),
      );
      auditCmsMutation(env, ctx, {
        workspaceId,
        tenantId,
        userId: authUser.id,
        projectSlug,
        pageId,
        sectionId: body.section_id || 'draft',
        agentApplied: meta.agentApplied,
        routeKey: meta.routeKey,
        changeSetId: body.change_set_id || null,
      });
      invalidateCmsBootstrap(env, ctx, workspaceId, projectSlug);

      return jsonResponse({
        success: true,
        page_id: pageId,
        kv_draft_key: `cms:draft:${pageId}:${authUser.id}`,
        flushed: !!flushed?.ok,
        r2_draft_key: draftR2?.r2_key || null,
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  /**
   * POST /api/cms/pages
   * Create a new page.
   */
  if (path === '/api/cms/pages' && method === 'POST') {
    const body = await request.json();
    const { project_id, slug, title, content, content_type = 'text/html', route_path } = body;

    if (!project_id || !slug || !title) {
      return jsonResponse({ error: 'project_id, slug, and title are required' }, 400);
    }
    if (!cmsScope.allowedSlugs.has(String(project_id).trim())) {
      return jsonResponse({ error: 'CMS_SITE_NOT_ALLOWED', project_id }, 403);
    }

    const normalizedRoute =
      String(route_path || `/${slug}`).trim().startsWith('/')
        ? String(route_path || `/${slug}`).trim()
        : `/${String(route_path || slug).trim()}`;
    const pageType = String(body.page_type || 'custom').trim() || 'custom';
    const pageStatus = String(body.status || 'draft').trim() === 'published' ? 'published' : 'draft';
    const r2Variant = pageStatus === 'published' ? 'published' : 'draft';
    const seoTitle = String(body.seo_title || title || '').trim();
    const metaDescription = String(body.meta_description || `${title} — ${project_id}`).trim();
    const initialSections = Array.isArray(body.sections) ? body.sections : [];

    const r2Bucket = CMS_DEFAULT_R2_BUCKET;
    const r2Key = cmsPageKey(workspaceId, project_id, slug, r2Variant);
    const r2Binding = getCmsR2Binding(env, r2Bucket);

    if (!r2Binding) return jsonResponse({ error: 'R2 storage unavailable' }, 503);

    try {
      // 1. Write to R2 first
      const contentBuffer = new TextEncoder().encode(content || '');
      await r2Binding.put(r2Key, contentBuffer, {
        httpMetadata: { contentType: content_type }
      });

      // 2. Insert to D1
      const pageId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);

      await env.DB.prepare(`
        INSERT INTO cms_pages (
          id, project_id, project_slug, slug, title, status, route_path, path, page_type,
          tenant_id, workspace_id, person_uuid, created_by, updated_by,
          r2_key, r2_bucket, content_type, content_size_bytes,
          seo_title, meta_description,
          created_at, updated_at, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        pageId, project_id, project_id, slug, title, pageStatus, normalizedRoute, normalizedRoute, pageType,
        tenantId, workspaceId, personUuid, authUser.id, authUser.id,
        r2Key, r2Bucket, content_type, contentBuffer.byteLength,
        seoTitle, metaDescription,
        now, now, pageStatus === 'published' ? now : null,
      ).run();

      const createdSections = [];
      for (let i = 0; i < initialSections.length; i++) {
        const sec = initialSections[i] || {};
        const sectionId =
          String(sec.id || '').trim() ||
          `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const sectionType = String(sec.section_type || sec.type || 'custom').trim();
        const sectionName = String(sec.section_name || sec.name || sectionType).trim();
        const sectionData =
          typeof sec.section_data === 'string'
            ? sec.section_data
            : JSON.stringify(sec.section_data || sec.data || {});
        const sortOrder = Number(sec.sort_order ?? (i + 1) * 10);
        await env.DB.prepare(
          `INSERT INTO cms_page_sections
           (id, page_id, section_type, section_name, section_data, sort_order, is_visible, css_classes, custom_css, created_at_unix)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            sectionId,
            pageId,
            sectionType,
            sectionName,
            sectionData,
            sortOrder,
            sec.is_visible === 0 || sec.is_visible === false ? 0 : 1,
            sec.css_classes || '',
            sec.custom_css || '',
            now,
          )
          .run();
        createdSections.push({
          id: sectionId,
          page_id: pageId,
          section_type: sectionType,
          section_name: sectionName,
          sort_order: sortOrder,
          is_visible: sec.is_visible === 0 ? 0 : 1,
        });
      }

      invalidateCmsBootstrap(env, ctx, workspaceId, project_id);

      return jsonResponse({
        success: true,
        id: pageId,
        r2_key: r2Key,
        route_path: normalizedRoute,
        status: pageStatus,
        sections: createdSections,
        preview_urls: buildCmsPageUrls(
          { id: pageId, slug, route_path: normalizedRoute, project_slug: project_id },
          { projectSlug: project_id },
        ),
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  /**
   * PUT /api/cms/pages/:id
   * Update page content (saved as draft).
   */
  if (pageIdMatch && method === 'PUT') {
    const pageId = pageIdMatch[1];
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    if (!('content' in body)) {
      try {
        const page = await fetchCmsPageInScope(env, pageId, cmsScope);
        if (!page) return jsonResponse({ error: 'Page not found' }, 404);
        const updates = [];
        const binds = [];
        const allowed = ['title', 'seo_title', 'meta_description', 'robots', 'page_type', 'sort_order', 'route_path', 'slug'];
        for (const k of allowed) {
          if (k in body) {
            updates.push(`${k} = ?`);
            if (k === 'route_path') {
              const rp = String(body.route_path || '').trim();
              binds.push(rp.startsWith('/') ? rp : `/${rp}`);
            } else if (k === 'slug') {
              binds.push(String(body.slug || '').replace(/^\//, ''));
            } else {
              binds.push(body[k]);
            }
          }
        }
        if ('route_path' in body || 'slug' in body) {
          const routePath = String(
            body.route_path ?? page.route_path ?? (body.slug ? `/${body.slug}` : ''),
          ).trim();
          const normalizedRoute = routePath.startsWith('/') ? routePath : `/${routePath}`;
          updates.push('path = ?');
          binds.push(normalizedRoute || '/');
        }
        if (!updates.length) return jsonResponse({ error: 'No valid fields to update' }, 400);
        updates.push(`updated_at = ?`, `updated_by = ?`);
        binds.push(Math.floor(Date.now() / 1000), authUser.id, pageId);
        await env.DB.prepare(
          `UPDATE cms_pages SET ${updates.join(', ')} WHERE id = ?`,
        )
          .bind(...binds)
          .run();
        const projectSlug = String(page.project_slug || page.project_id || '').trim();
        if (projectSlug) invalidateCmsBootstrap(env, ctx, workspaceId, projectSlug);
        const updated = await env.DB.prepare(`SELECT * FROM cms_pages WHERE id = ? LIMIT 1`)
          .bind(pageId)
          .first();
        return jsonResponse({
          success: true,
          id: pageId,
          page: updated,
          preview_urls: buildCmsPageUrls(updated || page, {
            projectSlug,
          }),
        });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    const { title, content, content_type = 'text/html' } = body;

    try {
      const page = await fetchCmsPageInScope(env, pageId, cmsScope);

      if (!page) return jsonResponse({ error: 'Page not found' }, 404);

      const htmlKeys = resolveIamPageHtmlKeys(page, workspaceId, cmsPageKey);
      const r2Bucket = htmlKeys.bucket || page.r2_bucket || CMS_DEFAULT_R2_BUCKET;
      const r2Key = htmlKeys.draft_key;
      const r2Binding = getCmsR2Binding(env, r2Bucket);

      if (!r2Binding) return jsonResponse({ error: 'R2 storage unavailable' }, 503);

      // 1. Upload to R2 as draft (storefront asset key when mapped)
      const contentBuffer = new TextEncoder().encode(content || '');
      await r2Binding.put(r2Key, contentBuffer, {
        httpMetadata: { contentType: content_type }
      });

      if (htmlKeys.mode === 'storefront_asset' && htmlKeys.legacy_draft_key) {
        await r2Binding.put(htmlKeys.legacy_draft_key, contentBuffer, {
          httpMetadata: { contentType: content_type },
        }).catch(() => {});
      }

      await putCmsDraftCache(env, {
        pageId,
        userId: authUser.id,
        payload: {
          content_type,
          r2_key: r2Key,
          r2_bucket: r2Bucket,
          title: title || null,
          byte_length: contentBuffer.byteLength,
        },
      });

      // 2. Update D1 metadata — never demote a published page to draft on content save;
      // live URL keeps serving published.html until explicit Publish copies draft → published.
      const now = Math.floor(Date.now() / 1000);
      const wasPublished = String(page.status || '').trim().toLowerCase() === 'published';
      const publishedKey = htmlKeys.published_key;
      const r2KeyForDb =
        htmlKeys.mode === 'storefront_asset' ? publishedKey : (wasPublished ? publishedKey : r2Key);
      const nextStatus = wasPublished ? 'published' : 'draft';

      await env.DB.prepare(`
        UPDATE cms_pages 
        SET title = COALESCE(?, title),
            updated_by = ?,
            updated_at = ?,
            r2_key = ?,
            content_size_bytes = ?,
            status = ?
        WHERE id = ?
      `      ).bind(
        title || null, authUser.id, now, r2KeyForDb, contentBuffer.byteLength, nextStatus, pageId
      ).run();

      const projectSlug = String(page.project_slug || page.project_id || '').trim();
      if (projectSlug) {
        ctx.waitUntil(invalidateCmsBootstrapCache(env, workspaceId, projectSlug));
      }

      return jsonResponse({
        success: true,
        r2_key: r2Key,
        draft_r2_key: r2Key,
        live_r2_key: wasPublished ? publishedKey : r2Key,
        status: nextStatus,
        has_unpublished_draft: wasPublished,
        kv_draft_key: `cms:draft:${pageId}:${authUser.id}`,
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  /**
   * POST /api/cms/pages/:id/publish
   * Copy draft R2 object to published path.
   */
  if (path.endsWith('/publish') && method === 'POST') {
    const pageId = pathParts[pathParts.length - 2];
    let projectSlug = '';
    try {
      const page = await fetchCmsPageInScope(env, pageId, cmsScope);
      if (!page) return jsonResponse({ error: 'Page not found' }, 404);

      projectSlug = String(page.project_slug || page.project_id || '').trim();

      const result = await executeCmsPagePublish(env, {
        pageId,
        page,
        workspaceId,
        tenantId,
        userId: authUser.id,
        executionCtx: ctx,
        agentApplied: false,
      });

      if (!result.ok) {
        if (result.error === 'publish_in_progress') {
          return jsonResponse({ error: 'publish_in_progress', holder: result.holder || null }, 409);
        }
        if (result.error === 'publish_gate_blocked') {
          return jsonResponse(
            {
              error: result.error,
              contract: result.contract,
              promotion: result.promotion,
              blocked: result.blocked,
            },
            422,
          );
        }
        const status = result.error === 'R2 storage unavailable' ? 503 : 400;
        return jsonResponse({ error: result.error }, status);
      }

      return jsonResponse({
        success: true,
        status: result.status,
        phase: result.phase,
        r2_key: result.r2_key,
        r2_bucket: result.r2_bucket,
        bootstrap_cache_key: result.bootstrap_cache_key,
        override_chain: result.override_chain,
        preview_urls: result.preview_urls,
        live_url: result.live_url,
      });
    } catch (e) {
      if (projectSlug) ctx.waitUntil(releaseCmsPublishLock(env, workspaceId, projectSlug, authUser.id));
      return jsonResponse({ error: e.message }, 500);
    }
  }

  /**
   * DELETE /api/cms/pages/:id
   * Soft delete page.
   */
  if (pageIdMatch && method === 'DELETE') {
    const pageId = pageIdMatch[1];
    try {
      const page = await fetchCmsPageInScope(env, pageId, cmsScope);
      if (!page) return jsonResponse({ error: 'Page not found' }, 404);
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(`
        UPDATE cms_pages 
        SET status = 'archived',
            archived_at = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(now, now, pageId).run();

      return jsonResponse({ success: true, status: 'archived' });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  /**
   * GET /api/cms/sections?page_id=
   * List editable sections for a CMS page (dashboard / CMS editor).
   */
  if (path === '/api/cms/sections' && method === 'GET') {
    const pageId = String(url.searchParams.get('page_id') || '').trim();
    if (!pageId) return jsonResponse({ error: 'page_id is required' }, 400);
    try {
      const page = await fetchCmsPageInScope(env, pageId, cmsScope);
      if (!page) return jsonResponse({ error: 'Page not found' }, 404);
      const { results } = await env.DB.prepare(
        `SELECT id, page_id, section_type, section_name, section_data, sort_order, is_visible, updated_at
         FROM cms_page_sections WHERE page_id = ? ORDER BY sort_order ASC, section_name ASC`,
      )
        .bind(pageId)
        .all();
      return jsonResponse({ page, sections: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  /**
   * PUT /api/cms/sections/:id
   * Update section_data JSON for a page section.
   */
  const sectionIdMatch = path.match(/^\/api\/cms\/sections\/([^/]+)$/);
  if (sectionIdMatch && method === 'PUT') {
    const sectionId = sectionIdMatch[1];
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }
    const sectionData = body.section_data ?? body.sectionData;
    const hasSectionData = sectionData != null;
    const metaFields = ['section_name', 'section_type', 'sort_order', 'is_visible', 'css_classes', 'custom_css'];
    const hasMeta = metaFields.some((k) => k in body);
    if (!hasSectionData && !hasMeta) {
      return jsonResponse({ error: 'section_data or section metadata required' }, 400);
    }
    try {
      const scoped = await fetchCmsSectionInScope(env, sectionId, cmsScope);
      if (!scoped) return jsonResponse({ error: 'Section not found' }, 404);
      const row = scoped.section;
      if (hasSectionData) {
        const payload =
          typeof sectionData === 'string' ? sectionData : JSON.stringify(sectionData);
        await env.DB.prepare(
          `UPDATE cms_page_sections SET section_data = ?, updated_at = datetime('now') WHERE id = ?`,
        )
          .bind(payload, sectionId)
          .run();
      }
      if (hasMeta) {
        const metaUpdates = [];
        const metaBinds = [];
        if ('section_name' in body) {
          metaUpdates.push('section_name = ?');
          metaBinds.push(String(body.section_name || '').trim());
        }
        if ('section_type' in body) {
          metaUpdates.push('section_type = ?');
          metaBinds.push(String(body.section_type || '').trim());
        }
        if ('sort_order' in body) {
          metaUpdates.push('sort_order = ?');
          metaBinds.push(Number(body.sort_order));
        }
        if ('is_visible' in body) {
          metaUpdates.push('is_visible = ?');
          metaBinds.push(body.is_visible === true || body.is_visible === 1 ? 1 : 0);
        }
        if (metaUpdates.length) {
          metaUpdates.push(`updated_at = datetime('now')`);
          await env.DB.prepare(
            `UPDATE cms_page_sections SET ${metaUpdates.join(', ')} WHERE id = ?`,
          )
            .bind(...metaBinds, sectionId)
            .run();
        }
      }

      const updatedRow = await env.DB.prepare(
        `SELECT id, page_id, section_type, section_name, section_data, sort_order, is_visible, updated_at
         FROM cms_page_sections WHERE id = ? LIMIT 1`,
      )
        .bind(sectionId)
        .first();

      const page = await env.DB.prepare(
        `SELECT id, project_slug, project_id, slug, r2_bucket, content_type FROM cms_pages WHERE id = ? LIMIT 1`,
      )
        .bind(row.page_id)
        .first()
        .catch(() => null);
      const projectSlug = String(page?.project_slug || page?.project_id || '').trim();
      const meta = cmsMutationMeta(authUser, request);
      if (body.agent_applied === true) meta.agentApplied = true;

      const parsed =
        hasSectionData && typeof sectionData === 'string'
          ? (() => {
              try {
                return JSON.parse(sectionData);
              } catch {
                return { raw: sectionData };
              }
            })()
          : hasSectionData
            ? sectionData
            : (() => {
                try {
                  return typeof updatedRow?.section_data === 'string'
                    ? JSON.parse(updatedRow.section_data)
                    : updatedRow?.section_data || {};
                } catch {
                  return {};
                }
              })();
      const draftPayload = {
        sections: { [sectionId]: parsed },
        page_id: row.page_id,
        updated_at: Math.floor(Date.now() / 1000),
      };
      await stageCmsDraftKv(env, {
        pageId: row.page_id,
        userId: authUser.id,
        payload: draftPayload,
      });
      ctx.waitUntil(
        flushCmsDraftToD1(env, {
          pageId: row.page_id,
          userId: authUser.id,
          draftData: draftPayload,
        }),
      );
      if (page) {
        await writeCmsDraftHtmlToR2(env, {
          workspaceId,
          page,
          userId: authUser.id,
          draftData: draftPayload,
        });
      }
      ctx.waitUntil(
        logCmsActivity(env, {
          tenantId,
          userId: authUser.id,
          action: 'section_update',
          resourceType: 'section',
          resourceId: sectionId,
        }),
      );
      auditCmsMutation(env, ctx, {
        workspaceId,
        tenantId,
        userId: authUser.id,
        projectSlug,
        pageId: row.page_id,
        sectionId,
        agentApplied: meta.agentApplied,
        routeKey: meta.routeKey,
        changeSetId: body.change_set_id || null,
      });
      if (meta.agentApplied || meta.routeKey === 'cms_edit') {
        ctx.waitUntil(
          logPromptCacheUsage(
            env,
            tenantId,
            [`cms_edit:${row.page_id}:${sectionId}`],
            meta.routeKey || 'cms_edit',
            'cms_api',
            'cms_edit',
            64,
          ).catch(() => {}),
        );
      }
      if (projectSlug) invalidateCmsBootstrap(env, ctx, workspaceId, projectSlug);

      return jsonResponse({
        success: true,
        id: sectionId,
        section: {
          ...updatedRow,
          section_data: parsed,
        },
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  /**
   * DELETE /api/cms/sections/:id
   * Remove a page section (hard delete; R2 artifacts retained for audit).
   */
  if (sectionIdMatch && method === 'DELETE') {
    const sectionId = sectionIdMatch[1];
    try {
      const scoped = await fetchCmsSectionInScope(env, sectionId, cmsScope);
      if (!scoped) return jsonResponse({ error: 'Section not found' }, 404);
      const row = scoped.section;
      const page = await env.DB.prepare(
        `SELECT id, project_slug, project_id FROM cms_pages WHERE id = ? LIMIT 1`,
      )
        .bind(row.page_id)
        .first()
        .catch(() => null);
      await env.DB.prepare(`DELETE FROM cms_page_sections WHERE id = ?`).bind(sectionId).run();
      await env.DB.prepare(
        `DELETE FROM cms_section_components WHERE section_id = ?`,
      )
        .bind(sectionId)
        .run()
        .catch(() => {});
      ctx.waitUntil(
        logCmsActivity(env, {
          tenantId,
          userId: authUser.id,
          action: 'section_delete',
          resourceType: 'section',
          resourceId: sectionId,
        }),
      );
      const projectSlug = String(page?.project_slug || page?.project_id || '').trim();
      if (projectSlug) invalidateCmsBootstrap(env, ctx, workspaceId, projectSlug);
      return jsonResponse({ success: true, id: sectionId, deleted: true });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  const componentIdMatch = path.match(/^\/api\/cms\/components\/([^/]+)$/);
  if (componentIdMatch && method === 'PUT') {
    const componentId = componentIdMatch[1];
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }
    const componentData = body.component_data ?? body.componentData;
    if (componentData == null) return jsonResponse({ error: 'component_data is required' }, 400);
    const payload =
      typeof componentData === 'string' ? componentData : JSON.stringify(componentData);
    try {
      const scoped = await fetchCmsComponentInScope(env, componentId, cmsScope);
      if (!scoped) return jsonResponse({ error: 'Component not found' }, 404);
      const row = scoped.component;
      const section = await env.DB.prepare(
        `SELECT s.id, s.page_id FROM cms_page_sections s WHERE s.id = ? LIMIT 1`,
      )
        .bind(row.section_id)
        .first()
        .catch(() => null);
      await env.DB.prepare(
        `UPDATE cms_section_components SET component_data = ?, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(payload, componentId)
        .run();

      const page = section?.page_id
        ? await env.DB.prepare(`SELECT project_slug, project_id FROM cms_pages WHERE id = ? LIMIT 1`)
            .bind(section.page_id)
            .first()
            .catch(() => null)
        : null;
      const projectSlug = String(page?.project_slug || page?.project_id || '').trim();
      const meta = cmsMutationMeta(authUser, request);
      if (body.agent_applied === true) meta.agentApplied = true;

      if (section?.page_id) {
        const parsed =
          typeof componentData === 'string'
            ? (() => {
                try {
                  return JSON.parse(componentData);
                } catch {
                  return { raw: componentData };
                }
              })()
            : componentData;
        await stageCmsDraftKv(env, {
          pageId: section.page_id,
          userId: authUser.id,
          payload: {
            components: { [componentId]: parsed },
            page_id: section.page_id,
            updated_at: Math.floor(Date.now() / 1000),
          },
        });
        ctx.waitUntil(
          flushCmsDraftToD1(env, {
            pageId: section.page_id,
            userId: authUser.id,
            draftData: { components: { [componentId]: parsed }, page_id: section.page_id },
          }),
        );
        auditCmsMutation(env, ctx, {
          workspaceId,
          tenantId,
          userId: authUser.id,
          projectSlug,
          pageId: section.page_id,
          sectionId: row.section_id,
          agentApplied: meta.agentApplied,
          routeKey: meta.routeKey,
          changeSetId: body.change_set_id || null,
        });
      }
      ctx.waitUntil(
        logCmsActivity(env, {
          tenantId,
          userId: authUser.id,
          action: 'component_update',
          resourceType: 'component',
          resourceId: componentId,
        }),
      );
      if (projectSlug) invalidateCmsBootstrap(env, ctx, workspaceId, projectSlug);

      return jsonResponse({ success: true, id: componentId });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/tenants' && method === 'GET') {
    try {
      const sites = await listCmsSitesForScope(env, { tenantId: authTenantId, workspaceId });
      const websites = sites.map((s) => ({
        slug: s.slug,
        name: s.name || s.slug,
        domain: s.domain || null,
        page_count: s.page_count ?? 0,
        url: s.domain ? `https://${s.domain}` : null,
      }));
      return jsonResponse({ tenants: websites, websites });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/studio-status' && method === 'GET') {
    const pageId = String(url.searchParams.get('page_id') || '').trim();
    const projectSlug = String(url.searchParams.get('project_slug') || '').trim();
    try {
      let page = null;
      if (pageId) {
        page = await fetchCmsPageInScope(env, pageId, cmsScope, projectSlug || null);
      }
      const patchRow = await env.DB.prepare(
        `SELECT plan_id, change_set_id, task_file, passed, applied, created_at
         FROM agentsam_patch_sessions
         WHERE task_file LIKE ?
         ORDER BY created_at DESC LIMIT 1`,
      )
        .bind(pageId ? `cms/%/${pageId}/%` : 'cms/%')
        .first()
        .catch(() => null);
      const liveRow = pageId
        ? await env.DB.prepare(
            `SELECT id, page_id, user_id, is_active, last_activity, created_at
             FROM cms_live_edit_sessions WHERE page_id = ? AND is_active = 1
             ORDER BY last_activity DESC LIMIT 1`,
          )
            .bind(pageId)
            .first()
            .catch(() => null)
        : null;
      return jsonResponse({
        page_id: pageId || null,
        project_slug: projectSlug || page?.project_slug || null,
        publish_status: page?.status || 'unknown',
        published_at: page?.published_at || null,
        active_plan_id: patchRow?.plan_id || patchRow?.change_set_id || null,
        last_patch_session: patchRow
          ? {
              task_file: patchRow.task_file,
              passed: patchRow.passed,
              applied: patchRow.applied,
              created_at: patchRow.created_at,
            }
          : null,
        live_session: liveRow
          ? {
              session_id: liveRow.id,
              user_id: liveRow.user_id,
              is_active: !!liveRow.is_active,
              last_activity: liveRow.last_activity,
            }
          : null,
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/conversions' && method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, asset_id, tenant_id, source_format, target_format, status,
                output_url, error_message, started_at, completed_at, created_at
         FROM cms_conversions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 30`,
      )
        .bind(tenantId)
        .all();
      const jobs = await env.DB.prepare(
        `SELECT id, asset_id, service, status, input_format, output_format, job_id, result_url, error, created_at
         FROM cms_conversion_jobs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 30`,
      )
        .bind(tenantId)
        .all()
        .catch(() => ({ results: [] }));
      return jsonResponse({ conversions: results || [], jobs: jobs.results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/conversions' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const sourceFormat = String(body.source_format || body.sourceFormat || 'liquid').trim();
    const targetFormat = String(body.target_format || body.targetFormat || 'sections').trim();
    const assetId = String(body.asset_id || body.assetId || '').trim() || null;
    const importName = String(body.import_name || body.importName || 'cms_import').trim();
    try {
      const conversionId = `cnv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const jobId = `cjob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `INSERT INTO cms_conversions
         (id, asset_id, tenant_id, source_format, target_format, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      )
        .bind(conversionId, assetId || conversionId, tenantId, sourceFormat, targetFormat, now)
        .run();
      await env.DB.prepare(
        `INSERT INTO cms_conversion_jobs
         (id, tenant_id, asset_id, service, status, input_format, output_format, created_at)
         VALUES (?, ?, ?, 'cms_import_wizard', 'pending', ?, ?, datetime('now'))`,
      )
        .bind(jobId, tenantId, assetId || conversionId, sourceFormat, targetFormat)
        .run();
      const spawnHint = cmsExceedsSpawnThreshold({ importName });
      let spawnMeta = null;
      if (spawnHint.spawn) {
        spawnMeta = await maybeSpawnCmsHeavyJob(env, ctx, {
          userId: authUser.id,
          workspaceId,
          tenantId,
          masterRunId: `cms_cnv_${conversionId}`,
          taskDescription: `CMS conversion import ${importName} (${sourceFormat} → ${targetFormat})`,
          chunkCount: 1,
        });
      }
      if (env.MY_QUEUE) {
        ctx.waitUntil(
          env.MY_QUEUE.send({
            type: 'cms_liquid_import',
            conversion_id: conversionId,
            import_name: importName,
            tenant_id: tenantId,
            workspace_id: workspaceId,
          }).catch(() => {}),
        );
      }
      return jsonResponse({
        success: true,
        conversion_id: conversionId,
        job_id: jobId,
        status: 'pending',
        spawn: spawnMeta,
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/collection-assets' && method === 'GET') {
    const collectionId = String(url.searchParams.get('collection_id') || '').trim();
    try {
      let q = `SELECT ca.collection_id, ca.asset_id, ca.order_index, ca.added_at,
                      a.filename, a.public_url, a.cdn_url, a.thumbnail_url, a.mime_type, a.label
               FROM cms_collection_assets ca
               JOIN cms_assets a ON a.id = ca.asset_id
               WHERE a.tenant_id = ?`;
      const binds = [tenantId];
      if (collectionId) {
        q += ` AND ca.collection_id = ?`;
        binds.push(collectionId);
      }
      q += ` ORDER BY ca.order_index ASC, ca.added_at DESC LIMIT 100`;
      const { results } = await env.DB.prepare(q).bind(...binds).all();
      return jsonResponse({ assets: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/websites' && method === 'GET') {
    try {
      const wsCtx = await resolveCmsWorkspaceContext(env, request, authUser, requestCache);
      const sorted = await sortSitesForWorkspace(env, wsCtx.sites || [], {
        primarySlug: wsCtx.project_slug,
        workspaceSlug: wsCtx.workspace_slug,
        workspaceId: wsCtx.workspace_id,
      });
      return jsonResponse({
        primary_project_slug: wsCtx.project_slug || null,
        workspace_slug: wsCtx.workspace_slug || null,
        websites: sorted.map((s) => ({
          slug: s.slug,
          name: s.name || s.slug,
          domain: s.domain || null,
          page_count: s.page_count ?? 0,
          updated_at: s.updated_at || null,
          source: s.source || null,
          url: s.domain ? `https://${s.domain}` : null,
        })),
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/spawn-handoff' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const turnCount = Number(body.turn_count ?? body.turnCount ?? 0);
    const parentRunId = String(body.parent_run_id ?? body.parentRunId ?? '').trim();
    const parentSessionId = String(body.parent_session_id ?? body.parentSessionId ?? '').trim();
    const pageId = String(body.page_id ?? body.pageId ?? '').trim();
    const goal =
      String(body.goal || '').trim() ||
      (pageId ? `Continue CMS edit for page ${pageId}` : 'Continue CMS edit session');
    const handoff = await maybeSpawnCmsSessionHandoff(env, ctx, {
      userId: authUser.id,
      workspaceId,
      tenantId,
      parentRunId: parentRunId || `cms_${pageId || 'studio'}_${Date.now().toString(36)}`,
      parentSessionId: parentSessionId || `cms_session_${pageId || 'studio'}`,
      turnCount,
      goal,
      messages: body.messages || [],
    });
    return jsonResponse({ ok: true, ...handoff });
  }

  if (path === '/api/cms/live-session/join' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const pageId = String(body.page_id || body.pageId || '').trim();
    if (!pageId) return jsonResponse({ error: 'page_id required' }, 400);
    const result = await joinCmsLiveEditSession(env, {
      pageId,
      userId: authUser.id,
      workspaceId,
      tenantId,
    });
    if (!result.ok) return jsonResponse({ error: result.error || 'join_failed' }, 404);
    return jsonResponse(result);
  }

  if (path === '/api/cms/live-session/heartbeat' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const pageId = String(body.page_id || body.pageId || '').trim();
    if (!pageId) return jsonResponse({ error: 'page_id required' }, 400);
    await touchCmsLiveEditSession(env, { pageId, userId: authUser.id });
    return jsonResponse({ ok: true, page_id: pageId });
  }

  if (path === '/api/cms/live-session/leave' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const pageId = String(body.page_id || body.pageId || '').trim();
    if (!pageId) return jsonResponse({ error: 'page_id required' }, 400);
    const flushed = await flushCmsDraftToD1(env, { pageId, userId: authUser.id });
    await leaveCmsLiveEditSession(env, { pageId, userId: authUser.id });
    await clearCmsDraftHotCache(env, pageId, authUser.id);
    const page = await env.DB.prepare(`SELECT project_slug, project_id FROM cms_pages WHERE id = ? LIMIT 1`)
      .bind(pageId)
      .first()
      .catch(() => null);
    const projectSlug = String(page?.project_slug || page?.project_id || '').trim();
    if (projectSlug) invalidateCmsBootstrap(env, ctx, workspaceId, projectSlug);
    ctx.waitUntil(
      logCmsActivity(env, {
        tenantId,
        userId: authUser.id,
        action: 'live_session_leave',
        resourceType: 'page',
        resourceId: pageId,
        details: { draft_flushed: !!flushed?.ok },
      }),
    );
    return jsonResponse({ ok: true, page_id: pageId, draft_flushed: !!flushed?.ok });
  }

  if (path === '/api/cms/overrides' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const projectSlug = String(body.project_slug || body.project_id || url.searchParams.get('project_slug') || '').trim();
    const pathVal = String(body.path || '').trim();
    const section = String(body.section || 'hero').trim();
    const overridesJson = body.overrides_json ?? body.overridesJson ?? {};
    if (!projectSlug || !pathVal) {
      return jsonResponse({ error: 'project_slug and path required' }, 400);
    }
    const projectIdNum = cmsOverrideProjectId(body.project_id || projectSlug);
    const payload =
      typeof overridesJson === 'string' ? overridesJson : JSON.stringify(overridesJson || {});
    try {
      const existing = await env.DB.prepare(
        `SELECT id, version FROM cms_page_overrides WHERE project_id = ? AND path = ? AND section = ? LIMIT 1`,
      )
        .bind(projectIdNum, pathVal, section)
        .first()
        .catch(() => null);
      let overrideId = existing?.id;
      if (overrideId) {
        await env.DB.prepare(
          `UPDATE cms_page_overrides
           SET overrides_json = ?, status = 'draft', updated_at = datetime('now'), project_slug = ?
           WHERE id = ?`,
        )
          .bind(payload, projectSlug, overrideId)
          .run();
      } else {
        overrideId = `ov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        await env.DB.prepare(
          `INSERT INTO cms_page_overrides
           (id, project_id, project_slug, path, section, overrides_json, status, version, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, ?, datetime('now'), datetime('now'))`,
        )
          .bind(overrideId, projectIdNum, projectSlug, pathVal, section, payload, authUser.id)
          .run();
      }
      ctx.waitUntil(
        logCmsActivity(env, {
          tenantId,
          userId: authUser.id,
          action: 'override_upsert',
          resourceType: 'override',
          resourceId: overrideId,
        }),
      );
      invalidateCmsBootstrap(env, ctx, workspaceId, projectSlug);
      return jsonResponse({ success: true, id: overrideId });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  const overridePublishMatch = path.match(/^\/api\/cms\/overrides\/([^/]+)\/publish$/);
  if (overridePublishMatch && method === 'POST') {
    const overrideId = overridePublishMatch[1];
    try {
      const row = await env.DB.prepare(`SELECT * FROM cms_page_overrides WHERE id = ? LIMIT 1`)
        .bind(overrideId)
        .first();
      if (!row) return jsonResponse({ error: 'Override not found' }, 404);
      const nextVersion = (Number(row.version) || 0) + 1;
      const versionId = `ovv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await env.DB.prepare(
        `INSERT INTO cms_override_versions
         (override_id, project_id, project_slug, path, section, overrides_json, version, status, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, datetime('now'))`,
      )
        .bind(
          overrideId,
          row.project_id,
          row.project_slug,
          row.path,
          row.section,
          row.overrides_json,
          nextVersion,
          authUser.id,
        )
        .run();
      await env.DB.prepare(
        `UPDATE cms_page_overrides
         SET status = 'published', version = ?, published_at = datetime('now'), published_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(nextVersion, authUser.id, overrideId)
        .run();
      ctx.waitUntil(
        logCmsActivity(env, {
          tenantId,
          userId: authUser.id,
          action: 'override_publish',
          resourceType: 'override_version',
          resourceId: versionId,
          details: { override_id: overrideId, version: nextVersion },
        }),
      );
      invalidateCmsBootstrap(env, ctx, workspaceId, String(row.project_slug || '').trim());
      return jsonResponse({ success: true, override_id: overrideId, version_id: versionId, version: nextVersion });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  const siteShellPublishMatch = path.match(/^\/api\/cms\/site-shell\/([^/]+)\/publish$/);
  if (siteShellPublishMatch && method === 'POST') {
    const partId = siteShellPublishMatch[1];
    const projectSlug =
      url.searchParams.get('project_slug') ||
      url.searchParams.get('site') ||
      explicitProjectSlug ||
      siteConfig.project_slug;
    const slug = String(projectSlug || '').trim();
    if (!slug || !cmsScope.allowedSlugs.has(slug)) {
      return jsonResponse({ error: 'CMS_SITE_NOT_ALLOWED', project_slug: slug || null }, 403);
    }
    try {
      const part = await publishSiteShellPart(env, slug, partId);
      return jsonResponse({ ok: true, part });
    } catch (e) {
      const msg = e?.message || 'publish_failed';
      const status = msg === 'no_shell_draft' ? 409 : msg === 'site_shell_part_not_found' ? 404 : 500;
      return jsonResponse({ error: msg }, status);
    }
  }

  const siteShellPartMatch = path.match(/^\/api\/cms\/site-shell\/([^/]+)$/);
  if (siteShellPartMatch) {
    const partId = siteShellPartMatch[1];
    const projectSlug =
      url.searchParams.get('project_slug') ||
      url.searchParams.get('site') ||
      explicitProjectSlug ||
      siteConfig.project_slug;
    const slug = String(projectSlug || '').trim();
    if (!slug || !cmsScope.allowedSlugs.has(slug)) {
      return jsonResponse({ error: 'CMS_SITE_NOT_ALLOWED', project_slug: slug || null }, 403);
    }
    if (method === 'GET') {
      const useDraft =
        url.searchParams.get('draft') === '1' || url.searchParams.get('preview') === 'draft';
      try {
        const part = await readSiteShellPart(env, slug, partId, { draft: useDraft });
        if (!part) return jsonResponse({ error: 'site_shell_not_found' }, 404);
        return jsonResponse({ part });
      } catch (e) {
        return jsonResponse({ error: e.message || 'read_failed' }, 500);
      }
    }
    if (method === 'PUT') {
      let body = {};
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'invalid JSON' }, 400);
      }
      try {
        const part = await writeSiteShellDraft(env, slug, partId, String(body.html || ''));
        return jsonResponse({ ok: true, part });
      } catch (e) {
        const msg = e?.message || 'write_failed';
        const status =
          msg === 'site_shell_not_configured' || msg === 'site_shell_part_not_found' ? 404 : 500;
        return jsonResponse({ error: msg }, status);
      }
    }
  }

  if (path === '/api/cms/site-shell' && method === 'GET') {
    const projectSlug =
      url.searchParams.get('project_slug') ||
      url.searchParams.get('site') ||
      explicitProjectSlug ||
      siteConfig.project_slug;
    const slug = String(projectSlug || '').trim();
    if (!slug || !cmsScope.allowedSlugs.has(slug)) {
      return jsonResponse({ error: 'CMS_SITE_NOT_ALLOWED', project_slug: slug || null }, 403);
    }
    try {
      const site_shell = await listSiteShellPartsMeta(env, slug);
      return jsonResponse({ site_shell });
    } catch (e) {
      return jsonResponse({ error: e.message || 'list_failed' }, 500);
    }
  }

  if (path === '/api/cms/bootstrap' && method === 'GET') {
    const explicitSlug =
      url.searchParams.get('project_slug') ||
      url.searchParams.get('site') ||
      url.searchParams.get('project') ||
      null;
    const resolved = await resolveCmsBootstrapProjectSlug(
      env,
      request,
      authUser,
      workspaceId,
      explicitSlug,
      requestCache,
    );
    if (resolved.error) {
      return jsonResponse(
        {
          error: resolved.error,
          message: resolved.message || resolved.error,
          sites: resolved.context?.sites || [],
        },
        resolved.error === 'CMS_PROJECT_UNRESOLVED' ? 404 : 400,
      );
    }
    const projectSlug = resolved.project_slug;
    const focusPageIdParam = String(url.searchParams.get('page_id') || '').trim();
    const cacheKey = cmsBootstrapKey(workspaceId, projectSlug);

    let cachedPayload = null;
    if (env.SESSION_CACHE && !focusPageIdParam) {
      try {
        cachedPayload = await env.SESSION_CACHE.get(cacheKey, { type: 'json' });
        if (cachedPayload) return jsonResponse({ ...cachedPayload, _cache: 'hit' });
      } catch (_) {}
    }

    try {
      const [
        pagesRes,
        sectionsRes,
        componentsRes,
        themesRes,
        navsRes,
        templatesRes,
        tenantRow,
        importsRes,
        globalSettingsRes,
        assets3dRes,
      ] = await Promise.all([
          env.DB.prepare(
            `SELECT id, project_slug, slug, route_path, title, status, page_type,
                    is_homepage, sort_order, seo_title, meta_description, robots,
                    r2_key, r2_bucket, published_at, updated_at
             FROM cms_pages
             WHERE tenant_id = ?
               AND (project_slug = ? OR project_id = ?)
               AND status != 'archived'
             ORDER BY sort_order, route_path`,
          )
            .bind(tenantId, projectSlug, projectSlug)
            .all()
            .catch(() => ({ results: [] })),
          env.DB.prepare(
            `SELECT s.id, s.page_id, s.section_type, s.section_name,
                    s.section_data, s.sort_order, s.is_visible, s.updated_at
             FROM cms_page_sections s
             JOIN cms_pages p ON p.id = s.page_id
             WHERE p.tenant_id = ?
               AND (p.project_slug = ? OR p.project_id = ?)
             ORDER BY s.sort_order`,
          )
            .bind(tenantId, projectSlug, projectSlug)
            .all()
            .catch(() => ({ results: [] })),
          env.DB.prepare(
            `SELECT c.id, c.section_id, c.component_type, c.component_data,
                    c.sort_order, c.is_visible, c.updated_at
             FROM cms_section_components c
             JOIN cms_page_sections s ON s.id = c.section_id
             JOIN cms_pages p ON p.id = s.page_id
             WHERE p.tenant_id = ?
               AND (p.project_slug = ? OR p.project_id = ?)
             ORDER BY c.sort_order`,
          )
            .bind(tenantId, projectSlug, projectSlug)
            .all()
            .catch(() => ({ results: [] })),
          env.DB.prepare(
            `SELECT t.id, t.name, t.slug, t.theme_family, t.css_r2_key,
                    t.compiled_css_hash, t.css_vars_json, t.tokens_json,
                    t.monaco_theme, tp.id AS pref_id
             FROM cms_themes t
             LEFT JOIN cms_theme_preferences tp
               ON tp.theme_id = t.id AND tp.workspace_id = ? AND tp.is_active = 1
             WHERE t.status = 'active' ORDER BY tp.id DESC, t.sort_order LIMIT 50`,
          )
            .bind(workspaceId)
            .all()
            .catch(() => ({ results: [] })),
          env.DB.prepare(
            `SELECT id, menu_name, menu_type, menu_items FROM cms_navigation_menus WHERE project_id = ?`,
          )
            .bind(projectSlug)
            .all()
            .catch(() => ({ results: [] })),
          env.DB.prepare(
            `SELECT id, template_name, template_type, category, preview_image_url
             FROM cms_component_templates ORDER BY category, template_name`,
          )
            .all()
            .catch(() => ({ results: [] })),
          env.DB.prepare(
            `SELECT id, name, slug, domain, primary_color, secondary_color, theme
             FROM cms_tenants WHERE slug = ? LIMIT 1`,
          )
            .bind(projectSlug)
            .first()
            .catch(() => null),
          env.DB.prepare(
            `SELECT id, import_name, status, sections_found, sections_mapped
             FROM cms_liquid_imports WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 10`,
          )
            .bind(tenantId)
            .all()
            .catch(() => ({ results: [] })),
          env.DB.prepare(
            `SELECT gs.id, gs.project_id, gs.site_name, gs.site_logo_url, gs.site_favicon_url,
                    gs.contact_email, gs.analytics_id, gs.settings_json, gs.seo_defaults
             FROM cms_global_settings gs
             INNER JOIN cms_tenants t ON t.slug = ?
             WHERE gs.site_name = t.name OR CAST(gs.project_id AS TEXT) = t.slug
             LIMIT 1`,
          )
            .bind(projectSlug)
            .first()
            .catch(() => null),
          env.DB.prepare(
            `SELECT a.id, a.asset_id, a.meshy_task_id, a.model_type, a.prompt,
                    a.glb_url, a.thumbnail_url, a.r2_key, a.r2_bucket, a.status, a.poly_count
             FROM cms_3d_assets a
             WHERE a.tenant_id = ? ORDER BY a.created_at DESC LIMIT 50`,
          )
            .bind(tenantId)
            .all()
            .catch(() => ({ results: [] })),
        ]);

      const pages = enrichPagesWithStorefrontAssets(pagesRes.results || []);
      const sections = sectionsRes.results || [];
      const activeThemeResolved = await resolveActiveCmsThemeRow(env, {
        tenantId: authTenantId,
        authUser,
        workspaceId,
        projectId: projectSlug,
      });
      const activeThemeSlug = activeThemeResolved?.row?.slug || null;
      const themes = (themesRes.results || []).map((t) => ({
        ...t,
        is_active: activeThemeSlug ? t.slug === activeThemeSlug : !!t.pref_id,
        css_vars: t.css_vars_json
          ? (() => {
              try {
                return JSON.parse(t.css_vars_json);
              } catch {
                return {};
              }
            })()
          : {},
      }));
      const activeThemeRow = activeThemeResolved?.row;
      const activeThemeFromList = themes.find((t) => t.is_active) || themes[0] || null;
      const active_theme = activeThemeRow
        ? {
            id: activeThemeRow.id,
            name: activeThemeRow.name,
            slug: activeThemeRow.slug,
            theme_family: activeThemeRow.theme_family,
            css_r2_key: activeThemeRow.css_r2_key,
            compiled_css_hash: activeThemeRow.compiled_css_hash,
            monaco_theme: activeThemeRow.monaco_theme,
            is_active: true,
            resolved_from: activeThemeResolved.resolved_from,
            css_vars: activeThemeRow.css_vars_json
              ? (() => {
                  try {
                    return JSON.parse(activeThemeRow.css_vars_json);
                  } catch {
                    return {};
                  }
                })()
              : {},
          }
        : activeThemeFromList;

      const sectionsByPage = {};
      for (const s of sections) {
        if (!sectionsByPage[s.page_id]) sectionsByPage[s.page_id] = [];
        sectionsByPage[s.page_id].push({
          ...s,
          section_data: s.section_data
            ? (() => {
                try {
                  return typeof s.section_data === 'string'
                    ? JSON.parse(s.section_data)
                    : s.section_data;
                } catch {
                  return {};
                }
              })()
            : {},
        });
      }

      const components = componentsRes.results || [];
      const componentsBySection = {};
      for (const c of components) {
        if (!componentsBySection[c.section_id]) componentsBySection[c.section_id] = [];
        componentsBySection[c.section_id].push({
          ...c,
          component_data: c.component_data
            ? (() => {
                try {
                  return typeof c.component_data === 'string'
                    ? JSON.parse(c.component_data)
                    : c.component_data;
                } catch {
                  return {};
                }
              })()
            : {},
        });
      }

      const homePage = pages.find((p) => p.is_homepage) || pages[0] || null;
      const focusPageId = focusPageIdParam;

      let activeDraft = null;
      let liveSession = null;
      if (focusPageId) {
        const draftRow = await env.DB.prepare(
          `SELECT draft_data, updated_at FROM cms_page_drafts WHERE page_id = ? AND user_id = ? LIMIT 1`,
        )
          .bind(focusPageId, authUser.id)
          .first()
          .catch(() => null);
        const kvDraft = await getCmsDraftCache(env, focusPageId, authUser.id);
        let draftData = null;
        if (kvDraft?.draft_data) draftData = kvDraft.draft_data;
        else if (draftRow?.draft_data) {
          try {
            draftData = JSON.parse(draftRow.draft_data);
          } catch {
            draftData = draftRow.draft_data;
          }
        }
        if (draftData) {
          activeDraft = {
            page_id: focusPageId,
            draft_data: draftData,
            source: kvDraft ? 'kv' : 'd1',
            updated_at: draftRow?.updated_at || kvDraft?.cached_at || null,
          };
        }
        const sessionRow = await env.DB.prepare(
          `SELECT id, session_token, is_active, last_activity
           FROM cms_live_edit_sessions WHERE page_id = ? AND user_id = ? AND is_active = 1
           ORDER BY last_activity DESC LIMIT 1`,
        )
          .bind(focusPageId, authUser.id)
          .first()
          .catch(() => null);
        if (sessionRow?.id) {
          liveSession = {
            session_id: sessionRow.id,
            session_token: sessionRow.session_token,
            page_id: focusPageId,
            collab_room: `cms:${focusPageId}`,
            is_active: !!sessionRow.is_active,
            last_activity: sessionRow.last_activity,
          };
        }
      }

      const siteConfig = await resolveCmsSiteConfig(env, workspaceId, projectSlug);
      const site_shell = await listSiteShellPartsMeta(env, projectSlug);
      const tenantResolved = await resolveCmsTenantByProjectSlug(env, projectSlug);
      const domainResolved = await resolveCmsSitePublicDomain(env, projectSlug, {
        workspaceId,
        workerName: siteConfig.worker_name,
      });
      const publicHost =
        String(domainResolved?.domain || '').trim() ||
        String(siteConfig.public_domain || '').trim() ||
        String(tenantResolved?.domain || '').trim() ||
        null;
      const pagesWithUrls = pages.map((page) => ({
        ...page,
        ...buildCmsPageUrls(page, { domain: publicHost }),
      }));

      const payload = {
        project_slug: projectSlug,
        workspace_id: workspaceId,
        workspace_name: resolved.context?.workspace_name || null,
        workspace_label: resolved.context?.ui_label || resolved.context?.workspace_name || null,
        resolved_from: resolved.context?.resolved_from || null,
        cms_hosting: siteConfig.cms_hosting || 'platform',
        worker_name: siteConfig.worker_name || null,
        worker_base_url: siteConfig.worker_base_url || null,
        studio_url: siteConfig.studio_url || null,
        tenant: tenantResolved
          ? {
              ...tenantResolved,
              domain: publicHost,
            }
          : {
              slug: projectSlug,
              domain: publicHost,
            },
        public_domain: publicHost,
        domain_source: domainResolved?.source || (siteConfig.public_domain ? 'cms_site_config' : null),
        pages: pagesWithUrls,
        sections_by_page: sectionsByPage,
        components_by_section: componentsBySection,
        active_theme: active_theme,
        themes,
        nav_menus: navsRes.results || [],
        component_templates: templatesRes.results || [],
        liquid_imports: importsRes.results || [],
        global_settings: globalSettingsRes || null,
        site_shell,
        storefront_catalog: listIamStorefrontCatalog(),
        home_page: homePage
          ? {
              id: homePage.id,
              slug: homePage.slug,
              title: homePage.title,
              route_path: homePage.route_path,
              status: homePage.status,
              r2_key: homePage.r2_key,
              storefront_edit_mode: homePage.storefront_edit_mode || null,
              storefront_asset_r2_key: homePage.storefront_asset_r2_key || null,
              storefront_hydrate: homePage.storefront_hydrate === true,
            }
          : null,
        assets_3d: assets3dRes.results || [],
        active_draft: activeDraft,
        live_session: liveSession,
        storage: {
          r2_bucket: CMS_DEFAULT_R2_BUCKET,
          r2_key: homePage?.r2_key || null,
          bootstrap_cache_key: cacheKey,
          kv_binding: 'SESSION_CACHE',
          do_binding: 'IAM_COLLAB',
        },
      };

      ctx.waitUntil(
        upsertCmsSiteProjectContext(env, {
          tenantId,
          workspaceId,
          projectSlug,
          pageCount: pages.length,
        }),
      );

      if (env.SESSION_CACHE) {
        ctx.waitUntil(
          env.SESSION_CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 300 }).catch(
            () => {},
          ),
        );
      }
      return jsonResponse(payload);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/templates' && method === 'GET') {
    const category = url.searchParams.get('category') || null;
    try {
      let where = '';
      const binds = [];
      if (category) {
        where = ' WHERE category = ?';
        binds.push(category);
      }
      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) AS total FROM cms_component_templates${where}`,
      )
        .bind(...binds)
        .first();
      const total = Number(countRow?.total) || 0;
      let q = `SELECT id, template_name, template_type, category, preview_image_url,
                      template_data, is_system, slug, r2_key, source_html_r2_key, source_liquid_file,
                      iam_tags, iam_build, iam_project_slug, iam_category, iam_label, iam_status,
                      iam_workspace_id, sort_order, usage_count, last_used_at, is_featured, featured_collection
               FROM cms_component_templates${where}`;
      q += ` ORDER BY sort_order ASC, category, template_name LIMIT 5000`;
      const { results } = await env.DB.prepare(q).bind(...binds).all();
      return jsonResponse({
        templates: results || [],
        total,
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  const templateIdMatch = path.match(/^\/api\/cms\/templates\/([^/]+)$/);
  if (templateIdMatch && method === 'PATCH') {
    const templateId = decodeURIComponent(templateIdMatch[1]);
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    try {
      const existing = await env.DB.prepare(
        `SELECT id, iam_tags, iam_build, iam_category FROM cms_component_templates WHERE id = ? LIMIT 1`,
      )
        .bind(templateId)
        .first();
      if (!existing) return jsonResponse({ error: 'template not found' }, 404);

      const sets = [];
      const binds = [];
      if (body.iam_tags != null) {
        const tags = Array.isArray(body.iam_tags)
          ? body.iam_tags.map((t) => String(t).trim()).filter(Boolean)
          : [];
        sets.push('iam_tags = ?');
        binds.push(JSON.stringify(tags));
      }
      if (body.iam_build != null) {
        sets.push('iam_build = ?');
        binds.push(String(body.iam_build).trim() || null);
      }
      if (body.iam_category != null) {
        sets.push('iam_category = ?');
        binds.push(String(body.iam_category).trim() || null);
      }
      if (body.iam_label != null) {
        sets.push('iam_label = ?');
        binds.push(String(body.iam_label).trim() || null);
      }
      if (!sets.length) return jsonResponse({ error: 'no fields to update' }, 400);

      await env.DB.prepare(
        `UPDATE cms_component_templates SET ${sets.join(', ')} WHERE id = ?`,
      )
        .bind(...binds, templateId)
        .run();

      const row = await env.DB.prepare(
        `SELECT id, template_name, template_type, category, preview_image_url,
                template_data, is_system, slug, r2_key, source_html_r2_key, source_liquid_file,
                iam_tags, iam_build, iam_project_slug, iam_category, iam_label, iam_status,
                iam_workspace_id, sort_order, usage_count, last_used_at, is_featured, featured_collection
         FROM cms_component_templates WHERE id = ? LIMIT 1`,
      )
        .bind(templateId)
        .first();
      return jsonResponse({ ok: true, template: row });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/imports' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const sourceType = String(body.source_type || 'html_drop').trim();
    const projectSlug = String(body.project_slug || body.projectSlug || '').trim();
    const files = Array.isArray(body.files) ? body.files : [];
    return jsonResponse({
      ok: true,
      queued: true,
      source_type: sourceType,
      project_slug: projectSlug || null,
      file_count: files.length,
      message:
        'Import received. Agent Sam will parse, tag, and remaster dropped assets into CMS blocks.',
    });
  }

  if (path === '/api/cms/templates' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const templateName = String(body.template_name || '').trim();
    const templateType = String(body.template_type || 'section').trim();
    const category = String(body.category || 'General').trim();
    if (!templateName) return jsonResponse({ error: 'template_name required' }, 400);

    const templateData = body.template_data ?? body.templateData ?? {};
    const payload =
      typeof templateData === 'string' ? templateData : JSON.stringify(templateData || {});
    const templateId =
      String(body.id || '').trim() ||
      `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const slug = body.slug != null ? String(body.slug).trim() || null : null;
    const sourceHtmlR2Key =
      body.source_html_r2_key != null ? String(body.source_html_r2_key).trim() || null : null;
    const r2Key = body.r2_key != null ? String(body.r2_key).trim() || null : null;
    const previewImageUrl =
      body.preview_image_url != null ? String(body.preview_image_url).trim() || null : null;
    const sourceLiquidFile =
      body.source_liquid_file != null ? String(body.source_liquid_file).trim() || null : null;
    const isSystem = body.is_system === true || body.is_system === 1 ? 1 : 0;

    try {
      await env.DB.prepare(
        `INSERT INTO cms_component_templates
         (id, template_name, template_type, category, is_system, slug, r2_key, source_html_r2_key,
          template_data, preview_image_url, source_liquid_file)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           template_name = excluded.template_name,
           template_type = excluded.template_type,
           category = excluded.category,
           is_system = excluded.is_system,
           slug = excluded.slug,
           r2_key = excluded.r2_key,
           source_html_r2_key = excluded.source_html_r2_key,
           template_data = excluded.template_data,
           preview_image_url = excluded.preview_image_url,
           source_liquid_file = excluded.source_liquid_file,
           updated_at = datetime('now')`,
      )
        .bind(
          templateId,
          templateName,
          templateType,
          category,
          isSystem,
          slug,
          r2Key,
          sourceHtmlR2Key,
          payload,
          previewImageUrl,
          sourceLiquidFile,
        )
        .run();
      return jsonResponse({ success: true, id: templateId, slug });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  const templateInstantiateMatch = path.match(/^\/api\/cms\/templates\/([^/]+)\/instantiate$/);
  if (templateInstantiateMatch && method === 'POST') {
    const templateId = templateInstantiateMatch[1];
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    let projectSlug = String(
      body.project_slug || body.project_id || url.searchParams.get('project_slug') || '',
    ).trim();
    if (!projectSlug) {
      const resolved = await resolveCmsBootstrapProjectSlug(
        env,
        request,
        authUser,
        workspaceId,
        null,
        requestCache,
      );
      if (resolved.error) {
        return jsonResponse({ error: resolved.error, message: resolved.message }, 400);
      }
      projectSlug = resolved.project_slug;
    }
    if (!cmsScope.allowedSlugs.has(projectSlug)) {
      return jsonResponse({ error: 'CMS_SITE_NOT_ALLOWED', project_slug: projectSlug }, 403);
    }

    try {
      const template = await env.DB.prepare(
        `SELECT id, template_name, template_type, slug, source_html_r2_key, template_data
         FROM cms_component_templates WHERE id = ? LIMIT 1`,
      )
        .bind(templateId)
        .first();
      if (!template) return jsonResponse({ error: 'Template not found' }, 404);
      if (!template.source_html_r2_key) {
        return jsonResponse({ error: 'Template has no source_html_r2_key' }, 422);
      }

      let meta = {};
      try {
        meta =
          typeof template.template_data === 'string'
            ? JSON.parse(template.template_data)
            : template.template_data || {};
      } catch {
        meta = {};
      }

      const suffix = cmsMarketingSlugSuffix(6);
      const base = String(template.slug || template.template_name || 'page')
        .toLowerCase()
        .replace(/^marketing-/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const pageSlug = `marketing-${base || 'page'}-${suffix}`;
      const routePath = `/marketing/${pageSlug}`;
      const title = String(meta.title || template.template_name || pageSlug).trim();

      const r2Bucket = CMS_DEFAULT_R2_BUCKET;
      const draftKey = cmsPageKey(workspaceId, projectSlug, pageSlug, 'draft');
      const r2Binding = getCmsR2Binding(env, r2Bucket);
      if (!r2Binding) return jsonResponse({ error: 'R2 storage unavailable' }, 503);

      const srcObj = await r2Binding.get(String(template.source_html_r2_key));
      if (!srcObj) {
        return jsonResponse(
          { error: 'Template source HTML not found in R2', source_html_r2_key: template.source_html_r2_key },
          404,
        );
      }
      const contentBuffer = await srcObj.arrayBuffer();
      await r2Binding.put(draftKey, contentBuffer, {
        httpMetadata: { contentType: 'text/html; charset=utf-8' },
      });

      const pageId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `INSERT INTO cms_pages (
          id, project_id, project_slug, slug, title, status, route_path, path, page_type,
          tenant_id, workspace_id, person_uuid, created_by, updated_by,
          r2_key, r2_bucket, content_type, content_size_bytes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          pageId,
          projectSlug,
          projectSlug,
          pageSlug,
          title,
          'draft',
          routePath,
          routePath,
          'landing',
          tenantId,
          workspaceId,
          personUuid,
          authUser.id,
          authUser.id,
          draftKey,
          r2Bucket,
          'text/html',
          contentBuffer.byteLength,
          now,
          now,
        )
        .run();

      await env.DB.prepare(
        `UPDATE cms_pages SET metadata_json = ? WHERE id = ?`,
      )
        .bind(
          JSON.stringify({
            marketing_page: true,
            template_id: templateId,
            template_type: template.template_type || 'marketing_page',
          }),
          pageId,
        )
        .run();

      ctx.waitUntil(
        logCmsActivity(env, {
          tenantId,
          userId: authUser.id,
          action: 'template_instantiate',
          resourceType: 'page',
          resourceId: pageId,
          details: { template_id: templateId, route_path: routePath },
        }),
      );
      invalidateCmsBootstrap(env, ctx, workspaceId, projectSlug);

      return jsonResponse({
        page: { id: pageId, slug: pageSlug, route_path: routePath },
        r2_draft_key: draftKey,
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/sections/save-injected' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const pageId = String(body.page_id || '').trim();
    const sectionName = String(body.section_name || '').trim();
    const sectionType = String(body.section_type || body.sectionType || 'custom').trim();
    const html = body.html != null ? String(body.html) : '';
    const projectSlug = String(body.project_slug || body.projectSlug || '').trim();
    const explicitSectionId = String(body.section_id || body.sectionId || '').trim();
    const position = String(body.position || 'end').trim();
    if (!pageId || !sectionName) {
      return jsonResponse({ error: 'page_id and section_name required' }, 400);
    }
    if (!html.trim()) return jsonResponse({ error: 'html required' }, 400);
    if (html.length > 512_000) {
      return jsonResponse({ error: 'html exceeds 512KB limit' }, 413);
    }
    try {
      const page = await fetchCmsPageInScope(env, pageId, cmsScope, projectSlug || null);
      if (!page) return jsonResponse({ error: 'Page not found' }, 404);
      if (projectSlug && !cmsScope.allowedSlugs.has(projectSlug)) {
        return jsonResponse({ error: 'CMS_SITE_NOT_ALLOWED', project_slug: projectSlug }, 403);
      }
      const pageSlug = String(page.slug || page.route_path || pageId).replace(/^\//, '') || 'page';
      const hash = await cmsContentSha256(html);
      const r2Key = cmsSectionHtmlKey(pageSlug, sectionName, hash);
      const r2Bucket = CMS_DEFAULT_R2_BUCKET;
      const r2Binding = getCmsR2Binding(env, r2Bucket);
      if (!r2Binding) return jsonResponse({ error: 'R2 storage unavailable' }, 503);
      await r2Binding.put(r2Key, new TextEncoder().encode(html), {
        httpMetadata: { contentType: 'text/html; charset=utf-8' },
      });
      const publicUrl =
        (await presignR2GetObjectUrl(env, r2Bucket, r2Key)) ||
        cmsR2PublicUrlFromRequest(request, r2Bucket, r2Key);
      const zone = String(body.zone || body.section_zone || '').trim();
      const sectionData = {
        r2_key: r2Key,
        public_url: publicUrl,
        html_source: 'injected',
        inject_position: position,
        content_sha256: hash,
        updated_at: Math.floor(Date.now() / 1000),
        full_page_document: isFullHtmlDocument(html),
        ...(zone ? { zone } : {}),
      };
      const payload = JSON.stringify(sectionData);

      let sectionId = explicitSectionId;
      let existing = null;
      if (sectionId) {
        existing = await env.DB.prepare(
          `SELECT id, page_id, section_type, section_name, section_data, sort_order, is_visible
           FROM cms_page_sections WHERE id = ? AND page_id = ? LIMIT 1`,
        )
          .bind(sectionId, pageId)
          .first()
          .catch(() => null);
      }
      if (!existing) {
        existing = await env.DB.prepare(
          `SELECT id, page_id, section_type, section_name, section_data, sort_order, is_visible
           FROM cms_page_sections WHERE page_id = ? AND section_name = ? LIMIT 1`,
        )
          .bind(pageId, sectionName)
          .first()
          .catch(() => null);
      }

      if (existing?.id) {
        sectionId = String(existing.id);
        await env.DB.prepare(
          `UPDATE cms_page_sections
           SET section_data = ?, section_type = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
          .bind(payload, sectionType, sectionId)
          .run();
        ctx.waitUntil(
          logCmsActivity(env, {
            tenantId,
            userId: authUser.id,
            action: 'section_inject_update',
            resourceType: 'section',
            resourceId: sectionId,
            details: { r2_key: r2Key, section_name: sectionName },
          }),
        );
      } else {
        sectionId = sectionId || `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const sortOrder =
          typeof body.sort_order === 'number'
            ? body.sort_order
            : position === 'start'
              ? 5
              : Number(body.sort_order ?? 50);
        await env.DB.prepare(
          `INSERT INTO cms_page_sections
           (id, page_id, section_type, section_name, section_data, sort_order, is_visible, created_at_unix)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        )
          .bind(
            sectionId,
            pageId,
            sectionType,
            sectionName,
            payload,
            sortOrder,
            Math.floor(Date.now() / 1000),
          )
          .run();
        ctx.waitUntil(
          logCmsActivity(env, {
            tenantId,
            userId: authUser.id,
            action: 'section_inject_create',
            resourceType: 'section',
            resourceId: sectionId,
            details: { r2_key: r2Key, section_name: sectionName },
          }),
        );
      }

      const section = await env.DB.prepare(
        `SELECT id, page_id, section_type, section_name, section_data, sort_order, is_visible, updated_at
         FROM cms_page_sections WHERE id = ? LIMIT 1`,
      )
        .bind(sectionId)
        .first();
      const ps = projectSlug || page.project_slug || page.project_id || null;
      if (ps) invalidateCmsBootstrap(env, ctx, workspaceId, ps);
      await writeCmsDraftHtmlToR2(env, {
        workspaceId,
        page,
        userId: authUser.id,
        fullPageHtml: isFullHtmlDocument(html) ? normalizeFullPageHtml(html) : undefined,
      }).catch(() => null);
      return jsonResponse({
        success: true,
        section: {
          ...section,
          section_data: sectionData,
        },
        r2_key: r2Key,
        public_url: publicUrl,
        created: !existing?.id,
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/sections/upload-html' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const pageId = String(body.page_id || '').trim();
    const sectionName = String(body.section_name || '').trim();
    const html = body.html != null ? String(body.html) : '';
    const projectSlug = String(body.project_slug || '').trim();
    if (!pageId || !sectionName) {
      return jsonResponse({ error: 'page_id and section_name required' }, 400);
    }
    if (!html.trim()) return jsonResponse({ error: 'html required' }, 400);
    try {
      const page = await fetchCmsPageInScope(env, pageId, cmsScope, projectSlug || null);
      if (!page) return jsonResponse({ error: 'Page not found' }, 404);
      if (projectSlug && !cmsScope.allowedSlugs.has(projectSlug)) {
        return jsonResponse({ error: 'CMS_SITE_NOT_ALLOWED', project_slug: projectSlug }, 403);
      }
      const pageSlug = String(page.slug || page.route_path || pageId).replace(/^\//, '');
      const hash = await cmsContentSha256(html);
      const r2Key = cmsSectionHtmlKey(pageSlug, sectionName, hash);
      const r2Bucket = CMS_DEFAULT_R2_BUCKET;
      const r2Binding = getCmsR2Binding(env, r2Bucket);
      if (!r2Binding) return jsonResponse({ error: 'R2 storage unavailable' }, 503);
      const contentBuffer = new TextEncoder().encode(html);
      await r2Binding.put(r2Key, contentBuffer, {
        httpMetadata: { contentType: 'text/html; charset=utf-8' },
      });
      const publicUrl =
        (await presignR2GetObjectUrl(env, r2Bucket, r2Key)) ||
        cmsR2PublicUrlFromRequest(request, r2Bucket, r2Key);
      const ps = projectSlug || page.project_slug || page.project_id || null;
      if (env.SESSION_CACHE && ps) {
        ctx.waitUntil(env.SESSION_CACHE.delete(cmsBootstrapKey(workspaceId, ps)).catch(() => {}));
      }
      return jsonResponse({ r2_key: r2Key, public_url: publicUrl });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/sections' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }
    const { page_id, section_type, section_name, section_data, sort_order } = body;
    if (!page_id || !section_type) {
      return jsonResponse({ error: 'page_id and section_type required' }, 400);
    }
    try {
      const page = await fetchCmsPageInScope(env, page_id, cmsScope);
      if (!page) return jsonResponse({ error: 'Page not found' }, 404);
      const sectionId = `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const payload =
        typeof section_data === 'string' ? section_data : JSON.stringify(section_data || {});
      await env.DB.prepare(
        `INSERT INTO cms_page_sections
         (id, page_id, section_type, section_name, section_data, sort_order, is_visible, created_at_unix)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      )
        .bind(
          sectionId,
          page_id,
          section_type,
          section_name || section_type,
          payload,
          Number(sort_order ?? 50),
          Math.floor(Date.now() / 1000),
        )
        .run();
      await env.DB.prepare(
        `INSERT INTO cms_activity_log (id, tenant_id, user_id, action, resource_type, resource_id, created_at)
         VALUES (?, ?, ?, 'create', 'section', ?, ?)`,
      )
        .bind(
          `al_${Date.now().toString(36)}`,
          tenantId,
          authUser.id,
          sectionId,
          Math.floor(Date.now() / 1000),
        )
        .run()
        .catch(() => {});
      const ps = String(
        url.searchParams.get('project_slug') || page.project_slug || page.project_id || '',
      ).trim();
      if (ps) invalidateCmsBootstrap(env, ctx, workspaceId, ps);
      await writeCmsDraftHtmlToR2(env, {
        workspaceId,
        page,
        userId: authUser.id,
      }).catch(() => null);
      const section = await env.DB.prepare(
        `SELECT id, page_id, section_type, section_name, section_data, sort_order, is_visible, updated_at
         FROM cms_page_sections WHERE id = ? LIMIT 1`,
      )
        .bind(sectionId)
        .first();
      let parsedData = section_data || {};
      if (typeof parsedData === 'string') {
        try {
          parsedData = JSON.parse(parsedData);
        } catch {
          parsedData = {};
        }
      }
      return jsonResponse({
        success: true,
        id: sectionId,
        section: {
          ...section,
          section_data: parsedData,
        },
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path.match(/^\/api\/cms\/sections\/[^/]+\/visibility$/) && method === 'POST') {
    const sId = path.split('/')[4];
    let body = {};
    try {
      body = await request.json();
    } catch {}
    const visible = body.is_visible === true || body.is_visible === 1 ? 1 : 0;
    try {
      const scoped = await fetchCmsSectionInScope(env, sId, cmsScope);
      if (!scoped) return jsonResponse({ error: 'Section not found' }, 404);
      await env.DB.prepare(
        `UPDATE cms_page_sections SET is_visible = ?, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(visible, sId)
        .run();
      return jsonResponse({ success: true, id: sId, is_visible: visible });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/sections/reorder' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {}
    const { order } = body;
    if (!Array.isArray(order)) return jsonResponse({ error: 'order array required' }, 400);
    try {
      for (const item of order) {
        if (!item.id || typeof item.sort_order !== 'number') continue;
        await env.DB.prepare(`UPDATE cms_page_sections SET sort_order = ? WHERE id = ?`)
          .bind(item.sort_order, item.id)
          .run();
      }
      return jsonResponse({ success: true, updated: order.length });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/themes' && method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `SELECT t.id, t.name, t.slug, t.theme_family, t.css_r2_key, t.compiled_css_hash,
                t.css_vars_json, t.tokens_json, t.monaco_theme, t.sort_order,
                tp.id AS pref_id
         FROM cms_themes t
         LEFT JOIN cms_theme_preferences tp
           ON tp.theme_id = t.id AND tp.workspace_id = ? AND tp.is_active = 1
         WHERE t.status = 'active' ORDER BY tp.id DESC, t.sort_order LIMIT 100`,
      )
        .bind(workspaceId)
        .all();
      return jsonResponse({ themes: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/themes/activate' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {}
    const { theme_id, theme_slug, project_slug } = body;
    if (!theme_id) return jsonResponse({ error: 'theme_id required' }, 400);
    try {
      await env.DB.prepare(
        `UPDATE cms_theme_preferences SET is_active = 0 WHERE workspace_id = ? AND scope = 'workspace'`,
      )
        .bind(workspaceId)
        .run();
      const prefId = `pref_${Date.now().toString(36)}`;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO cms_theme_preferences
         (id, tenant_id, workspace_id, theme_id, theme_slug, scope, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'workspace', 1, datetime('now'), datetime('now'))`,
      )
        .bind(prefId, tenantId, workspaceId, theme_id, theme_slug || '')
        .run();
      if (env.SESSION_CACHE && project_slug) {
        ctx.waitUntil(
          env.SESSION_CACHE.delete(`cms:bootstrap:${workspaceId}:${project_slug}`).catch(() => {}),
        );
      }
      return jsonResponse({ success: true, theme_id });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/liquid-imports/upload' && method === 'POST') {
    const ct = String(request.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('multipart/form-data')) {
      return jsonResponse({ error: 'multipart/form-data required' }, 400);
    }
    let form;
    try {
      form = await request.formData();
    } catch {
      return jsonResponse({ error: 'invalid multipart body' }, 400);
    }
    const file = form.get('file');
    if (!(file instanceof File) || file.size < 1) {
      return jsonResponse({ error: 'file required (.zip or .tar.gz theme archive)' }, 400);
    }
    const importName = String(form.get('import_name') || file.name || 'Shopify theme import').trim();
    const explicitImportProject =
      String(form.get('project_slug') || form.get('project_id') || '').trim() ||
      url.searchParams.get('project_slug') ||
      url.searchParams.get('site') ||
      null;
    const importResolved = await resolveCmsBootstrapProjectSlug(
      env,
      request,
      authUser,
      workspaceId,
      explicitImportProject,
      requestCache,
    );
    if (importResolved.error) {
      return jsonResponse(
        { error: importResolved.error, message: importResolved.message, sites: importResolved.context?.sites || [] },
        importResolved.error === 'CMS_PROJECT_UNRESOLVED' ? 404 : 400,
      );
    }
    const projectSlug = importResolved.project_slug;
    const lowerName = String(file.name || '').toLowerCase();
    if (
      !lowerName.endsWith('.zip') &&
      !lowerName.endsWith('.tar.gz') &&
      !lowerName.endsWith('.tgz') &&
      !lowerName.endsWith('.tar')
    ) {
      return jsonResponse({ error: 'unsupported_file_type', allowed: ['.zip', '.tar.gz', '.tgz', '.tar'] }, 400);
    }
    const maxBytes = 80 * 1024 * 1024;
    if (file.size > maxBytes) {
      return jsonResponse({ error: 'file_too_large', max_mb: 80 }, 413);
    }
    try {
      const importId = `limp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const importKey = importName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 64);
      const safeFile = String(file.name || 'theme.zip').replace(/[^a-zA-Z0-9._-]+/g, '_');
      const r2Key = `cms/liquid-imports/uploads/${importId}/${safeFile}`;
      const r2Bucket = CMS_DEFAULT_R2_BUCKET;
      const r2Binding = getCmsR2Binding(env, r2Bucket);
      if (!r2Binding) return jsonResponse({ error: 'R2 storage unavailable' }, 503);
      const buf = await file.arrayBuffer();
      await r2Binding.put(r2Key, buf, {
        httpMetadata: {
          contentType: file.type || 'application/octet-stream',
        },
      });
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `INSERT INTO cms_liquid_imports
         (id, tenant_id, workspace_id, project_id, import_key, import_name,
          source_type, source_path, source_url, r2_bucket, r2_key,
          status, sections_found, snippets_found, templates_found,
          sections_mapped, pages_created, assets_registered,
          metadata_json, result_json, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'upload', ?, '', ?, ?,
                 'pending', 0, 0, 0, 0, 0, 0, ?, '{}', ?, ?, ?)`,
      )
        .bind(
          importId,
          tenantId,
          workspaceId,
          projectSlug,
          importKey,
          importName,
          safeFile,
          r2Bucket,
          r2Key,
          JSON.stringify({ original_filename: file.name, size_bytes: file.size }),
          authUser.id,
          now,
          now,
        )
        .run();
      const spawnMeta = await maybeSpawnCmsHeavyJob(env, ctx, {
        userId: authUser.id,
        workspaceId,
        tenantId,
        masterRunId: `cms_limp_${importId}`,
        taskDescription: `CMS liquid import upload ${importName}`,
        chunkCount: 1,
      });
      if (env.MY_QUEUE) {
        ctx.waitUntil(
          env.MY_QUEUE.send({
            type: 'cms_liquid_import',
            phase: 'inventory',
            import_id: importId,
            tenant_id: tenantId,
            workspace_id: workspaceId,
            r2_key: r2Key,
            r2_bucket: r2Bucket,
            import_name: importName,
          }).catch(() => {}),
        );
      }
      emitInnerAnimalProEvent(
        env,
        {
          userId: authUser.id,
          eventName: `liquid_import_queued:${importId}:${importName}`,
        },
        ctx,
      );
      return jsonResponse({
        success: true,
        id: importId,
        status: 'pending',
        r2_key: r2Key,
        r2_bucket: r2Bucket,
        spawn: spawnMeta,
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/site-packages/proceed-targets' && method === 'GET') {
    try {
      const targets = await listCmsProceedTargets(env, workspaceId);
      return jsonResponse({ ok: true, workspace_id: workspaceId, ...targets });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  const sitePackageInventoryMatch = path.match(/^\/api\/cms\/site-packages\/([^/]+)\/inventory$/);
  if (sitePackageInventoryMatch && method === 'GET') {
    try {
      const inv = await getSitePackageInventory(env, tenantId, sitePackageInventoryMatch[1]);
      if (!inv.ok) return jsonResponse({ error: inv.error }, inv.status || 404);
      return jsonResponse(inv);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  const sitePackageAuditMatch = path.match(/^\/api\/cms\/site-packages\/([^/]+)\/audit$/);
  if (sitePackageAuditMatch && method === 'POST') {
    try {
      const audit = await auditSitePackageById(env, tenantId, sitePackageAuditMatch[1]);
      if (!audit.ok) return jsonResponse({ error: audit.error, skipped: audit.skipped, hint: audit.hint }, audit.status || 503);
      return jsonResponse(audit);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  const sitePackageProceedMatch = path.match(/^\/api\/cms\/site-packages\/([^/]+)\/proceed$/);
  if (sitePackageProceedMatch && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {}
    try {
      const packageId = sitePackageProceedMatch[1];
      const inv = await getSitePackageInventory(env, tenantId, packageId);
      if (!inv.ok) return jsonResponse({ error: inv.error }, inv.status || 404);
      if (!inv.ready && inv.package?.status !== 'completed') {
        return jsonResponse(
          { error: 'package_not_ready', status: inv.package?.status, hint: 'Wait for inventory_ready' },
          409,
        );
      }
      const result = await enqueueSitePackageProceed(env, ctx, {
        importId: packageId,
        tenantId,
        workspaceId,
        userId: authUser.id,
        apply: {
          ...body,
          project_slug: body.project_slug || inv.package?.project_id,
        },
      });
      emitInnerAnimalProEvent(
        env,
        { userId: authUser.id, eventName: `site_package_proceed:${packageId}` },
        ctx,
      );
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  const sitePackageMatch = path.match(/^\/api\/cms\/site-packages\/([^/]+)$/);
  if (sitePackageMatch && method === 'GET') {
    try {
      const inv = await getSitePackageInventory(env, tenantId, sitePackageMatch[1]);
      if (!inv.ok) return jsonResponse({ error: inv.error }, inv.status || 404);
      return jsonResponse(inv);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/liquid-imports' && method === 'GET') {
    try {
      const importId = url.searchParams.get('import_id') || url.searchParams.get('id');
      if (importId) {
        const row = await env.DB.prepare(
          `SELECT id, import_key, import_name, source_type, status, project_id,
                  sections_found, sections_mapped, pages_created, templates_found,
                  error_log, result_json, created_at, completed_at
           FROM cms_liquid_imports WHERE tenant_id = ? AND id = ? LIMIT 1`,
        )
          .bind(tenantId, importId)
          .first();
        if (!row) return jsonResponse({ error: 'import_not_found' }, 404);
        return jsonResponse({ import: row });
      }
      const { results } = await env.DB.prepare(
        `SELECT id, import_key, import_name, source_type, status, project_id,
                sections_found, sections_mapped, pages_created, templates_found, error_log, created_at, completed_at
         FROM cms_liquid_imports WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20`,
      )
        .bind(tenantId)
        .all();
      return jsonResponse({ imports: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/liquid-imports' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {}
    const { import_name, source_type, r2_key, r2_bucket, source_url, project_id } = body;
    if (!import_name || !source_type) {
      return jsonResponse({ error: 'import_name and source_type required' }, 400);
    }
    if (source_type !== 'upload' && !r2_key && !source_url) {
      return jsonResponse(
        {
          error: 'r2_key_or_source_url_required',
          hint: 'Upload theme .zip via POST /api/cms/liquid-imports/upload (multipart file)',
        },
        400,
      );
    }
    const explicitImportProject =
      project_id || url.searchParams.get('project_slug') || url.searchParams.get('site') || null;
    const importResolved = await resolveCmsBootstrapProjectSlug(
      env,
      request,
      authUser,
      workspaceId,
      explicitImportProject,
      requestCache,
    );
    if (importResolved.error) {
      return jsonResponse(
        { error: importResolved.error, message: importResolved.message, sites: importResolved.context?.sites || [] },
        importResolved.error === 'CMS_PROJECT_UNRESOLVED' ? 404 : 400,
      );
    }
    const projectSlug = importResolved.project_slug;
    try {
      const importId = `limp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const importKey = import_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 64);
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `INSERT INTO cms_liquid_imports
         (id, tenant_id, workspace_id, project_id, import_key, import_name,
          source_type, source_path, source_url, r2_bucket, r2_key,
          status, sections_found, snippets_found, templates_found,
          sections_mapped, pages_created, assets_registered,
          metadata_json, result_json, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 'pending', 0, 0, 0, 0, 0, 0, '{}', '{}', ?, ?, ?)`,
      )
        .bind(
          importId,
          tenantId,
          workspaceId,
          projectSlug,
          importKey,
          import_name,
          source_type,
          r2_key || source_url || '',
          source_url || '',
          r2_bucket || CMS_DEFAULT_R2_BUCKET,
          r2_key || '',
          authUser.id,
          now,
          now,
        )
        .run();
      const spawnMeta = await maybeSpawnCmsHeavyJob(env, ctx, {
        userId: authUser.id,
        workspaceId,
        tenantId,
        masterRunId: `cms_limp_${importId}`,
        taskDescription: `CMS liquid import ${import_name} (${source_type})`,
        chunkCount: 1,
      });
      if (env.MY_QUEUE && (r2_key || source_url)) {
        ctx.waitUntil(
          env.MY_QUEUE.send({
            type: 'cms_liquid_import',
            phase: 'inventory',
            import_id: importId,
            tenant_id: tenantId,
            workspace_id: workspaceId,
            r2_key: r2_key || '',
            r2_bucket: r2_bucket || CMS_DEFAULT_R2_BUCKET,
            import_name,
          }).catch(() => {}),
        );
      }
      return jsonResponse({ success: true, id: importId, status: 'pending', spawn: spawnMeta });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/assets' && method === 'GET') {
    const category = url.searchParams.get('category') || null;
    const context = url.searchParams.get('context') || null;
    try {
      let q = `SELECT id, filename, original_filename, path, r2_key, public_url, cdn_url,
                      thumbnail_url, alt_text, mime_type, category, usage_context, label,
                      asset_key, created_at
               FROM cms_assets WHERE tenant_id = ?`;
      const binds = [tenantId];
      if (category) {
        q += ` AND category = ?`;
        binds.push(category);
      }
      if (context) {
        q += ` AND usage_context = ?`;
        binds.push(context);
      }
      q += ` ORDER BY created_at DESC LIMIT 100`;
      const { results } = await env.DB.prepare(q).bind(...binds).all();
      return jsonResponse({ assets: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/activity' && method === 'GET') {
    const pageId = url.searchParams.get('page_id');
    const projectSlug = String(
      url.searchParams.get('project_slug') || url.searchParams.get('site') || '',
    ).trim();
    try {
      let q = `SELECT id, user_id, action, resource_type, resource_id, details, created_at
               FROM cms_activity_log WHERE tenant_id = ?`;
      const binds = [tenantId];
      if (projectSlug) {
        q += ` AND (
          resource_id IN (
            SELECT id FROM cms_pages
            WHERE project_slug = ? OR project_id = ?
          )
          OR resource_id IN (
            SELECT s.id FROM cms_page_sections s
            INNER JOIN cms_pages p ON p.id = s.page_id
            WHERE p.project_slug = ? OR p.project_id = ?
          )
        )`;
        binds.push(projectSlug, projectSlug, projectSlug, projectSlug);
      }
      if (pageId) {
        q += ` AND (resource_id = ? OR resource_id IN (
                 SELECT id FROM cms_page_sections WHERE page_id = ?
               ))`;
        binds.push(pageId, pageId);
      }
      q += ` ORDER BY created_at DESC LIMIT 50`;
      const { results } = await env.DB.prepare(q).bind(...binds).all();
      return jsonResponse({ activity: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path.match(/^\/api\/cms\/pages\/[^/]+\/rollbacks$/) && method === 'GET') {
    const pageId = path.split('/')[4];
    try {
      const page = await fetchCmsPageInScope(env, pageId, cmsScope);
      if (!page) return jsonResponse({ error: 'Page not found' }, 404);
      const { results } = await env.DB.prepare(
        `SELECT r.id, r.page_id, r.slug, r.previous_r2_key, r.deployed_html_hash, r.created_at
         FROM cms_live_rollbacks r
         WHERE r.page_id = ?
         ORDER BY r.created_at DESC LIMIT 20`,
      )
        .bind(pageId)
        .all();
      return jsonResponse({ rollbacks: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path.match(/^\/api\/cms\/pages\/[^/]+\/snapshot$/) && method === 'POST') {
    const pageId = path.split('/')[4];
    try {
      const page = await fetchCmsPageInScope(env, pageId, cmsScope);
      if (!page) return jsonResponse({ error: 'Page not found' }, 404);

      const r2Bucket = page.r2_bucket || CMS_DEFAULT_R2_BUCKET;
      const projectId = String(page.project_id || page.project_slug || '').trim();
      const snapshotTs = Math.floor(Date.now() / 1000);
      let snapshotKey = page.r2_key || '';
      let htmlHash = null;

      if (page.r2_key) {
        const r2Binding = getCmsR2Binding(env, r2Bucket);
        if (r2Binding) {
          const obj = await r2Binding.head(page.r2_key).catch(() => null);
          htmlHash = obj?.etag ? String(obj.etag).replace(/"/g, '') : null;
          snapshotKey = cmsSnapshotKey(workspaceId, projectId, page.slug, snapshotTs);
          const copied = await copyR2Object(env, r2Bucket, page.r2_key, snapshotKey);
          if (!copied) snapshotKey = page.r2_key;
        }
      }

      const rollbackId = `rb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      await env.DB.prepare(
        `INSERT INTO cms_live_rollbacks
         (id, page_id, project_id, slug, previous_r2_key, deployed_html_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          rollbackId,
          pageId,
          projectId,
          page.slug,
          snapshotKey,
          htmlHash || '',
          snapshotTs,
        )
        .run();
      ctx.waitUntil(
        logCmsActivity(env, {
          tenantId,
          userId: authUser.id,
          action: 'snapshot',
          resourceType: 'rollback',
          resourceId: rollbackId,
          details: { previous_r2_key: snapshotKey },
        }),
      );
      return jsonResponse({ success: true, id: rollbackId, previous_r2_key: snapshotKey });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/cms/rollback' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {}
    const { rollback_id, page_id } = body;
    if (!rollback_id || !page_id) {
      return jsonResponse({ error: 'rollback_id and page_id required' }, 400);
    }
    try {
      const page = await fetchCmsPageInScope(env, page_id, cmsScope);
      if (!page) return jsonResponse({ error: 'Page not found' }, 404);
      const rb = await env.DB.prepare(
        `SELECT r.* FROM cms_live_rollbacks r
         WHERE r.id = ? AND r.page_id = ? LIMIT 1`,
      )
        .bind(rollback_id, page_id)
        .first();
      if (!rb) return jsonResponse({ error: 'Rollback not found' }, 404);

      const r2Bucket = page.r2_bucket || CMS_DEFAULT_R2_BUCKET;
      const publishedKey = cmsPageKey(
        workspaceId,
        page.project_id,
        page.slug,
        'published',
      );
      let restoredKey = rb.previous_r2_key;

      if (rb.previous_r2_key) {
        const r2Binding = getCmsR2Binding(env, r2Bucket);
        if (r2Binding) {
          const restored = await copyR2Object(env, r2Bucket, rb.previous_r2_key, publishedKey);
          if (restored) restoredKey = publishedKey;
        }
        const now = Math.floor(Date.now() / 1000);
        await env.DB.prepare(
          `UPDATE cms_pages SET r2_key = ?, status = 'published', published_at = ?, updated_at = ?
           WHERE id = ?`,
        )
          .bind(restoredKey, now, now, page_id)
          .run();
      }

      const projectSlug = String(page.project_slug || page.project_id || '').trim();
      invalidateCmsBootstrap(env, ctx, workspaceId, projectSlug);
      auditCmsMutation(env, ctx, {
        workspaceId,
        tenantId,
        userId: authUser.id,
        projectSlug,
        pageId: page_id,
        sectionId: 'rollback',
      });
      ctx.waitUntil(
        logCmsActivity(env, {
          tenantId,
          userId: authUser.id,
          action: 'rollback',
          resourceType: 'page',
          resourceId: page_id,
          details: { rollback_id, previous_r2_key: rb.previous_r2_key, restored_r2_key: restoredKey },
        }),
      );

      return jsonResponse({
        success: true,
        page_id,
        previous_r2_key: rb.previous_r2_key,
        restored_r2_key: restoredKey,
        r2_restored: restoredKey === publishedKey,
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  return jsonResponse({ error: 'CMS route not found' }, 404);
}
