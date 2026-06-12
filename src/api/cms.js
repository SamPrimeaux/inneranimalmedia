/**
 * API Service: CMS (Content Management System)
 * Handles page metadata in D1 and content persistence in R2.
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
  flushCmsDraftToD1,
  invalidateCmsBootstrap,
  logCmsActivity,
  promoteCmsDraftOverrides,
  renderCmsSectionTreeHtml,
  stageCmsDraftKv,
} from '../core/cms-edit-safety.js';
import {
  joinCmsLiveEditSession,
  leaveCmsLiveEditSession,
  touchCmsLiveEditSession,
} from '../core/cms-live-edit-session.js';
import { upsertCmsSiteProjectContext } from '../core/cms-project-context.js';
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
} from '../core/cms-spawn-bridge.js';
import { logPromptCacheUsage } from '../core/prompt-cache-economics.js';

export const CMS_DEFAULT_R2_BUCKET = 'inneranimalmedia';

function cmsPageKey(workspaceId, projectId, slug, variant) {
  return `cms/${workspaceId}/${projectId}/${slug}/${variant}.html`;
}

function cmsSnapshotKey(workspaceId, projectId, slug, ts) {
  return `cms/${workspaceId}/${projectId}/${slug}/snapshots/${ts}.html`;
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

function getCmsR2Binding(env, bucketName) {
  const name = String(bucketName || CMS_DEFAULT_R2_BUCKET).trim();
  if (name === 'inneranimalmedia' || name === 'dashboard') {
    return env.ASSETS || env.R2;
  }
  return env.ASSETS || env.R2;
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
  const tenantId = authUser.tenant_id;
  const personUuid = authUser.person_uuid;
  const actorCtx = await resolveIamActorContext(request, env).catch(() => null);
  const workspaceId = actorCtx?.workspaceId || (authUser.workspace_id ? String(authUser.workspace_id).trim() : '') || null;
  if (!tenantId || String(tenantId).trim() === '') {
    return jsonResponse({ error: 'TENANT_CONTEXT_MISSING' }, 400);
  }
  if (!workspaceId) {
    return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING' }, 400);
  }

  if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, 503);

  /**
   * GET /api/cms/pages
   * List pages for workspace (metadata only).
   */
  if (path === '/api/cms/pages' && method === 'GET') {
    const projectId = url.searchParams.get('project_id');
    try {
      let query = `SELECT id, project_id, slug, title, status, route_path, updated_at, created_at, is_homepage FROM cms_pages WHERE tenant_id = ?`;
      const params = [tenantId];
      
      if (projectId) {
        query += ` AND project_id = ?`;
        params.push(projectId);
      }
      
      const { results } = await env.DB.prepare(query + ` ORDER BY created_at DESC`).bind(...params).all();
      return jsonResponse({ pages: results || [] });
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
    try {
      const page = await env.DB.prepare(
        `SELECT * FROM cms_pages WHERE id = ? AND tenant_id = ?`
      ).bind(pageId, tenantId).first();

      if (!page) return jsonResponse({ error: 'Page not found' }, 404);

      // Generate presigned URL for the R2 content
      const bucket = page.r2_bucket || CMS_DEFAULT_R2_BUCKET;
      const key = page.r2_key;
      let contentUrl = null;
      if (key) {
        contentUrl = await presignR2GetObjectUrl(env, bucket, key);
      }

      const { results: sectionRows } = await env.DB.prepare(
        `SELECT id, section_type, section_name, section_data, sort_order, is_visible
         FROM cms_page_sections WHERE page_id = ? ORDER BY sort_order`,
      )
        .bind(pageId)
        .all()
        .catch(() => ({ results: [] }));

      const sections = (sectionRows || []).map((s) => ({
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
      let componentsBySection = {};
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
                    return typeof c.component_data === 'string' ? JSON.parse(c.component_data) : c.component_data;
                  } catch {
                    return {};
                  }
                })()
              : {},
          });
        }
      }

      const preview_html = renderCmsSectionTreeHtml(sections, componentsBySection);

      return jsonResponse({
        page,
        content_url: contentUrl,
        preview_html,
        sections,
        components_by_section: componentsBySection,
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  const draftPageMatch = path.match(/^\/api\/cms\/pages\/([^/]+)\/draft$/);
  if (draftPageMatch && (method === 'GET' || method === 'PUT')) {
    const pageId = draftPageMatch[1];
    try {
      const page = await env.DB.prepare(
        `SELECT id, project_id, project_slug, slug, route_path, tenant_id FROM cms_pages WHERE id = ? AND tenant_id = ? LIMIT 1`,
      )
        .bind(pageId, tenantId)
        .first();
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
      if (flush) {
        flushed = await flushCmsDraftToD1(env, {
          pageId,
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
    const { project_id, slug, title, content, content_type = 'text/html' } = body;

    if (!project_id || !slug || !title) {
      return jsonResponse({ error: 'project_id, slug, and title are required' }, 400);
    }

    const r2Bucket = CMS_DEFAULT_R2_BUCKET;
    const r2Key = cmsPageKey(workspaceId, project_id, slug, 'published');
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
          id, project_id, slug, title, status, route_path,
          tenant_id, person_uuid, created_by, updated_by,
          r2_key, r2_bucket, content_type, content_size_bytes,
          created_at, updated_at, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        pageId, project_id, slug, title, 'published', `/${slug}`,
        tenantId, personUuid, authUser.id, authUser.id,
        r2Key, r2Bucket, content_type, contentBuffer.byteLength,
        now, now, now
      ).run();

      return jsonResponse({ success: true, id: pageId, r2_key: r2Key });
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
        const updates = [];
        const binds = [];
        const allowed = ['title', 'seo_title', 'meta_description', 'robots', 'page_type', 'sort_order'];
        for (const k of allowed) {
          if (k in body) {
            updates.push(`${k} = ?`);
            binds.push(body[k]);
          }
        }
        if (!updates.length) return jsonResponse({ error: 'No valid fields to update' }, 400);
        updates.push(`updated_at = ?`, `updated_by = ?`);
        binds.push(Math.floor(Date.now() / 1000), authUser.id, pageId, tenantId);
        await env.DB.prepare(
          `UPDATE cms_pages SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
        )
          .bind(...binds)
          .run();
        return jsonResponse({ success: true, id: pageId });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    const { title, content, content_type = 'text/html' } = body;

    try {
      const page = await env.DB.prepare(
        `SELECT project_id, project_slug, slug, r2_bucket FROM cms_pages WHERE id = ? AND tenant_id = ?`
      ).bind(pageId, tenantId).first();

      if (!page) return jsonResponse({ error: 'Page not found' }, 404);

      const r2Bucket = page.r2_bucket || CMS_DEFAULT_R2_BUCKET;
      const r2Key = cmsPageKey(workspaceId, page.project_id, page.slug, 'draft');
      const r2Binding = getCmsR2Binding(env, r2Bucket);

      if (!r2Binding) return jsonResponse({ error: 'R2 storage unavailable' }, 503);

      // 1. Upload to R2 as draft
      const contentBuffer = new TextEncoder().encode(content || '');
      await r2Binding.put(r2Key, contentBuffer, {
        httpMetadata: { contentType: content_type }
      });

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

      // 2. Update D1 metadata
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(`
        UPDATE cms_pages 
        SET title = COALESCE(?, title),
            updated_by = ?,
            updated_at = ?,
            r2_key = ?,
            content_size_bytes = ?,
            status = 'draft'
        WHERE id = ? AND tenant_id = ?
      `      ).bind(
        title || null, authUser.id, now, r2Key, contentBuffer.byteLength, pageId, tenantId
      ).run();

      const projectSlug = String(page.project_slug || page.project_id || '').trim();
      if (projectSlug) {
        ctx.waitUntil(invalidateCmsBootstrapCache(env, workspaceId, projectSlug));
      }

      return jsonResponse({ success: true, r2_key: r2Key, status: 'draft', kv_draft_key: `cms:draft:${pageId}:${authUser.id}` });
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
      const page = await env.DB.prepare(
        `SELECT project_id, project_slug, slug, r2_bucket, content_type FROM cms_pages WHERE id = ? AND tenant_id = ?`
      ).bind(pageId, tenantId).first();

      if (!page) return jsonResponse({ error: 'Page not found' }, 404);

      projectSlug = String(page.project_slug || page.project_id || '').trim();
      const r2BucketPre = page.r2_bucket || CMS_DEFAULT_R2_BUCKET;
      const draftKeyPre = cmsPageKey(workspaceId, page.project_id, page.slug, 'draft');
      const r2BindingPre = getCmsR2Binding(env, r2BucketPre);
      let hasKvDraftPre = false;
      const kvDraftPre = await getCmsDraftCache(env, pageId, authUser.id).catch(() => null);
      hasKvDraftPre = !!(kvDraftPre?.draft_data || kvDraftPre?.r2_key);

      const contract = await verifyCmsPublishContract(env, {
        page,
        workspaceId,
        tenantId,
        r2Binding: r2BindingPre,
        draftKey: draftKeyPre,
        hasKvDraft: hasKvDraftPre,
      });
      const promotion = await runCmsPromotionGate(env, {
        page,
        tenantId,
        projectSlug,
        r2Binding: r2BindingPre,
        draftKey: draftKeyPre,
        hasKvDraft: hasKvDraftPre,
      });
      if (!contract.passed || !promotion.passed) {
        return jsonResponse(cmsPublishGateErrorResponse({ contract, promotion }), 422);
      }

      const lock = await acquireCmsPublishLock(env, projectSlug, authUser.id);
      if (!lock.acquired) {
        return jsonResponse({ error: 'publish_in_progress', holder: lock.holder || null }, 409);
      }

      const r2Bucket = page.r2_bucket || CMS_DEFAULT_R2_BUCKET;
      const draftKey = cmsPageKey(workspaceId, page.project_id, page.slug, 'draft');
      const publishedKey = cmsPageKey(workspaceId, page.project_id, page.slug, 'published');
      const r2Binding = getCmsR2Binding(env, r2Bucket);

      if (!r2Binding) {
        await releaseCmsPublishLock(env, projectSlug, authUser.id);
        return jsonResponse({ error: 'R2 storage unavailable' }, 503);
      }

      // 1. Copy draft to published in R2
      // Note: Cloudflare R2 binding doesn't have a direct 'copy' yet, so we get and put.
      let draftObj = await r2Binding.get(draftKey);
      if (!draftObj) {
        const kvDraft = await getCmsDraftCache(env, pageId, authUser.id);
        if (kvDraft?.r2_key) draftObj = await r2Binding.get(String(kvDraft.r2_key)).catch(() => null);
      }
      if (!draftObj) {
        await releaseCmsPublishLock(env, projectSlug, authUser.id);
        return jsonResponse({ error: 'No draft found to publish' }, 400);
      }

      const draftRow = await env.DB.prepare(
        `SELECT draft_data FROM cms_page_drafts WHERE page_id = ? AND user_id = ? LIMIT 1`,
      )
        .bind(pageId, authUser.id)
        .first()
        .catch(() => null);
      let draftData = null;
      if (draftRow?.draft_data) {
        try {
          draftData = JSON.parse(draftRow.draft_data);
        } catch {
          draftData = null;
        }
      }
      if (!draftData) {
        const kvDraft = await getCmsDraftCache(env, pageId, authUser.id);
        draftData = kvDraft?.draft_data || null;
      }
      let overrideChain = [];
      if (draftData && typeof draftData === 'object') {
        const sectionCount = cmsDraftSectionCount(draftData);
        const payloadBytes = cmsDraftPayloadBytes(draftData);
        const spawnHint = cmsExceedsSpawnThreshold({ sectionCount, payloadBytes });
        if (spawnHint.spawn) {
          ctx.waitUntil(
            maybeSpawnCmsHeavyJob(env, ctx, {
              userId: authUser.id,
              workspaceId,
              tenantId,
              masterRunId: `cms_pub_${pageId}_${Date.now().toString(36)}`,
              taskDescription: `CMS publish promote ${sectionCount} sections (${payloadBytes} bytes)`,
              chunkCount: sectionCount,
            }),
          );
        }
        overrideChain = await promoteCmsDraftOverrides(env, {
          page: { ...page, id: pageId },
          draftData,
          userId: authUser.id,
        });
        ctx.waitUntil(
          logCmsActivity(env, {
            tenantId,
            userId: authUser.id,
            action: 'draft_promote',
            resourceType: 'page',
            resourceId: pageId,
            details: { overrides: overrideChain.length, spawn_hint: spawnHint },
          }),
        );
      }

      const content = await draftObj.arrayBuffer();
      await r2Binding.put(publishedKey, content, {
        httpMetadata: { contentType: page.content_type || 'text/html' }
      });

      // 2. Update D1
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(`
        UPDATE cms_pages 
        SET status = 'published',
            published_at = ?,
            published_by = ?,
            updated_at = ?,
            r2_key = ?
        WHERE id = ? AND tenant_id = ?
      `      ).bind(
        now, authUser.id, now, publishedKey, pageId, tenantId
      ).run();

      ctx.waitUntil(releaseCmsPublishLock(env, projectSlug, authUser.id));
      if (projectSlug) {
        ctx.waitUntil(invalidateCmsBootstrapCache(env, workspaceId, projectSlug));
      }

      auditCmsMutation(env, ctx, {
        workspaceId,
        tenantId,
        userId: authUser.id,
        projectSlug,
        pageId,
        sectionId: 'publish',
      });
      ctx.waitUntil(
        logCmsActivity(env, {
          tenantId,
          userId: authUser.id,
          action: 'publish',
          resourceType: 'page',
          resourceId: pageId,
        }),
      );
      await clearCmsDraftHotCache(env, pageId, authUser.id);

      return jsonResponse({
        success: true,
        status: 'published',
        r2_key: publishedKey,
        r2_bucket: r2Bucket,
        bootstrap_cache_key: cmsBootstrapKey(workspaceId, projectSlug),
        override_chain: overrideChain,
      });
    } catch (e) {
      if (projectSlug) ctx.waitUntil(releaseCmsPublishLock(env, projectSlug, authUser.id));
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
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(`
        UPDATE cms_pages 
        SET status = 'archived',
            archived_at = ?,
            updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `).bind(now, now, pageId, tenantId).run();

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
      const page = await env.DB.prepare(
        `SELECT id, route_path, slug, title FROM cms_pages WHERE id = ? AND tenant_id = ? LIMIT 1`,
      )
        .bind(pageId, tenantId)
        .first();
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
    if (sectionData == null) return jsonResponse({ error: 'section_data is required' }, 400);
    const payload =
      typeof sectionData === 'string' ? sectionData : JSON.stringify(sectionData);
    try {
      const row = await env.DB.prepare(
        `SELECT s.id, s.page_id, p.tenant_id
         FROM cms_page_sections s
         JOIN cms_pages p ON p.id = s.page_id
         WHERE s.id = ? LIMIT 1`,
      )
        .bind(sectionId)
        .first();
      if (!row || String(row.tenant_id) !== String(tenantId)) {
        return jsonResponse({ error: 'Section not found' }, 404);
      }
      await env.DB.prepare(
        `UPDATE cms_page_sections SET section_data = ?, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(payload, sectionId)
        .run();

      const page = await env.DB.prepare(
        `SELECT id, project_slug, project_id FROM cms_pages WHERE id = ? LIMIT 1`,
      )
        .bind(row.page_id)
        .first()
        .catch(() => null);
      const projectSlug = String(page?.project_slug || page?.project_id || '').trim();
      const meta = cmsMutationMeta(authUser, request);
      if (body.agent_applied === true) meta.agentApplied = true;

      const parsed =
        typeof sectionData === 'string'
          ? (() => {
              try {
                return JSON.parse(sectionData);
              } catch {
                return { raw: sectionData };
              }
            })()
          : sectionData;
      await stageCmsDraftKv(env, {
        pageId: row.page_id,
        userId: authUser.id,
        payload: {
          sections: { [sectionId]: parsed },
          page_id: row.page_id,
          updated_at: Math.floor(Date.now() / 1000),
        },
      });
      ctx.waitUntil(
        flushCmsDraftToD1(env, {
          pageId: row.page_id,
          userId: authUser.id,
          draftData: { sections: { [sectionId]: parsed }, page_id: row.page_id },
        }),
      );
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

      return jsonResponse({ success: true, id: sectionId });
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
      const row = await env.DB.prepare(
        `SELECT c.id, c.section_id, p.tenant_id
         FROM cms_section_components c
         JOIN cms_page_sections s ON s.id = c.section_id
         JOIN cms_pages p ON p.id = s.page_id
         WHERE c.id = ? LIMIT 1`,
      )
        .bind(componentId)
        .first();
      if (!row || String(row.tenant_id) !== String(tenantId)) {
        return jsonResponse({ error: 'Component not found' }, 404);
      }
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
      const { results: tenants } = await env.DB.prepare(
        `SELECT id, name, slug, domain, is_active, theme, primary_color
         FROM cms_tenants WHERE is_active = 1 ORDER BY name`,
      ).all();
      const counts = {};
      for (const t of tenants || []) {
        const row = await env.DB.prepare(
          `SELECT COUNT(*) as n FROM cms_pages WHERE project_slug = ? AND status != 'archived'`,
        )
          .bind(t.slug)
          .first()
          .catch(() => ({ n: 0 }));
        counts[t.slug] = row?.n ?? 0;
      }
      const websites = (tenants || []).map((t) => ({
        ...t,
        page_count: counts[t.slug] ?? 0,
        url: t.domain ? `https://${t.domain}` : null,
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
        page = await env.DB.prepare(
          `SELECT id, slug, title, status, project_slug, published_at, updated_at FROM cms_pages WHERE id = ? AND tenant_id = ? LIMIT 1`,
        )
          .bind(pageId, tenantId)
          .first();
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
            `SELECT id, page_id, user_id, status, last_heartbeat_at, created_at
             FROM cms_live_edit_sessions WHERE page_id = ? AND status = 'active'
             ORDER BY last_heartbeat_at DESC LIMIT 1`,
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
          ? { session_id: liveRow.id, user_id: liveRow.user_id, status: liveRow.status }
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
      const { results: tenants } = await env.DB.prepare(
        `SELECT id, name, slug, domain, is_active, theme, primary_color
         FROM cms_tenants WHERE is_active = 1 ORDER BY name`,
      ).all();
      const counts = {};
      for (const t of tenants || []) {
        const row = await env.DB.prepare(
          `SELECT COUNT(*) as n FROM cms_pages WHERE project_slug = ? AND status != 'archived'`,
        )
          .bind(t.slug)
          .first()
          .catch(() => ({ n: 0 }));
        counts[t.slug] = row?.n ?? 0;
      }
      return jsonResponse({
        websites: (tenants || []).map((t) => ({
          ...t,
          page_count: counts[t.slug] ?? 0,
          url: t.domain ? `https://${t.domain}` : null,
        })),
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
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

  if (path === '/api/cms/bootstrap' && method === 'GET') {
    const projectSlug = url.searchParams.get('project_slug') || 'inneranimalmedia';
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
                    published_at, updated_at
             FROM cms_pages WHERE project_slug = ? AND status != 'archived'
             ORDER BY sort_order, route_path`,
          )
            .bind(projectSlug)
            .all()
            .catch(() => ({ results: [] })),
          env.DB.prepare(
            `SELECT s.id, s.page_id, s.section_type, s.section_name,
                    s.section_data, s.sort_order, s.is_visible, s.updated_at
             FROM cms_page_sections s
             JOIN cms_pages p ON p.id = s.page_id
             WHERE p.project_slug = ? ORDER BY s.sort_order`,
          )
            .bind(projectSlug)
            .all()
            .catch(() => ({ results: [] })),
          env.DB.prepare(
            `SELECT c.id, c.section_id, c.component_type, c.component_data,
                    c.sort_order, c.is_visible, c.updated_at
             FROM cms_section_components c
             JOIN cms_page_sections s ON s.id = c.section_id
             JOIN cms_pages p ON p.id = s.page_id
             WHERE p.project_slug = ? ORDER BY c.sort_order`,
          )
            .bind(projectSlug)
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
            `SELECT id, project_id, site_name, site_logo_url, site_favicon_url,
                    contact_email, analytics_id, settings_json, seo_defaults
             FROM cms_global_settings WHERE project_id = ? LIMIT 1`,
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

      const pages = pagesRes.results || [];
      const sections = sectionsRes.results || [];
      const themes = (themesRes.results || []).map((t) => ({
        ...t,
        is_active: !!t.pref_id,
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

      const payload = {
        project_slug: projectSlug,
        tenant: tenantRow,
        pages,
        sections_by_page: sectionsByPage,
        components_by_section: componentsBySection,
        active_theme: themes.find((t) => t.is_active) || themes[0] || null,
        themes,
        nav_menus: navsRes.results || [],
        component_templates: templatesRes.results || [],
        liquid_imports: importsRes.results || [],
        global_settings: globalSettingsRes || null,
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
      let q = `SELECT id, template_name, template_type, category, preview_image_url,
                      template_data, is_system, r2_key, source_liquid_file
               FROM cms_component_templates`;
      const binds = [];
      if (category) {
        q += ` WHERE category = ?`;
        binds.push(category);
      }
      q += ` ORDER BY category, template_name`;
      const { results } = await env.DB.prepare(q).bind(...binds).all();
      return jsonResponse({ templates: results || [] });
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
      const page = await env.DB.prepare(
        `SELECT id FROM cms_pages WHERE id = ? AND tenant_id = ? LIMIT 1`,
      )
        .bind(page_id, tenantId)
        .first();
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
      const ps = url.searchParams.get('project_slug');
      if (env.SESSION_CACHE && ps) {
        ctx.waitUntil(
          env.SESSION_CACHE.delete(`cms:bootstrap:${workspaceId}:${ps}`).catch(() => {}),
        );
      }
      return jsonResponse({ success: true, id: sectionId });
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
      await env.DB.prepare(
        `UPDATE cms_page_sections SET is_visible = ?, updated_at = datetime('now')
         WHERE id = ? AND EXISTS (
           SELECT 1 FROM cms_pages p WHERE p.id = page_id AND p.tenant_id = ?
         )`,
      )
        .bind(visible, sId, tenantId)
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

  if (path === '/api/cms/liquid-imports' && method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, import_key, import_name, source_type, status,
                sections_found, sections_mapped, templates_found, error_log, created_at, completed_at
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
    const projectSlug = project_id || url.searchParams.get('project_slug') || 'inneranimalmedia';
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
          r2_bucket || 'inneranimalmedia',
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
      if (env.MY_QUEUE) {
        ctx.waitUntil(
          env.MY_QUEUE.send({
            type: 'cms_liquid_import',
            import_id: importId,
            tenant_id: tenantId,
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
    try {
      let q = `SELECT id, user_id, action, resource_type, resource_id, details, created_at
               FROM cms_activity_log WHERE tenant_id = ?`;
      const binds = [tenantId];
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
      const { results } = await env.DB.prepare(
        `SELECT r.id, r.page_id, r.slug, r.previous_r2_key, r.deployed_html_hash, r.created_at
         FROM cms_live_rollbacks r
         JOIN cms_pages p ON p.id = r.page_id
         WHERE r.page_id = ? AND p.tenant_id = ?
         ORDER BY r.created_at DESC LIMIT 20`,
      )
        .bind(pageId, tenantId)
        .all();
      return jsonResponse({ rollbacks: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path.match(/^\/api\/cms\/pages\/[^/]+\/snapshot$/) && method === 'POST') {
    const pageId = path.split('/')[4];
    try {
      const page = await env.DB.prepare(
        `SELECT id, slug, project_id, project_slug, r2_key, r2_bucket FROM cms_pages WHERE id = ? AND tenant_id = ? LIMIT 1`,
      )
        .bind(pageId, tenantId)
        .first();
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
      const rb = await env.DB.prepare(
        `SELECT r.* FROM cms_live_rollbacks r
         JOIN cms_pages p ON p.id = r.page_id
         WHERE r.id = ? AND r.page_id = ? AND p.tenant_id = ? LIMIT 1`,
      )
        .bind(rollback_id, page_id, tenantId)
        .first();
      if (!rb) return jsonResponse({ error: 'Rollback not found' }, 404);

      const page = await env.DB.prepare(
        `SELECT id, slug, project_id, project_slug, r2_bucket, r2_key, content_type FROM cms_pages WHERE id = ? AND tenant_id = ? LIMIT 1`,
      )
        .bind(page_id, tenantId)
        .first();
      if (!page) return jsonResponse({ error: 'Page not found' }, 404);

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
           WHERE id = ? AND tenant_id = ?`,
        )
          .bind(restoredKey, now, now, page_id, tenantId)
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
