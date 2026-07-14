/**
 * Shared CMS publish execution for API + Agent Sam tools.
 */
import type {
  CmsPage,
  ExecuteCmsPagePublishOpts,
  ExecuteCmsPagePublishResult,
} from '../types/cms.ts';
import {
  acquireCmsPublishLock,
  cmsBootstrapKey,
  getCmsDraftCache,
  invalidateCmsBootstrapCache,
  releaseCmsPublishLock,
} from './cms-kv-cache.js';
import {
  auditCmsMutation,
  clearCmsDraftHotCache,
  cmsPageHtmlKey as cmsPageKey,
  ensureCmsDraftR2BeforePublish,
  logCmsActivity,
  promoteCmsDraftOverrides,
} from './cms-edit-safety.js';
import {
  cmsPublishGateErrorResponse,
  runCmsPromotionGate,
  verifyCmsPublishContract,
} from './cms-promotion-gates.js';
import {
  cmsDraftPayloadBytes,
  cmsDraftSectionCount,
  cmsExceedsSpawnThreshold,
  maybeSpawnCmsHeavyJob,
} from './cms-spawn-bridge.js';
import { buildCmsPageUrls } from './cms-preview-route.js';
import { CMS_DEFAULT_R2_BUCKET, getCmsR2Binding } from './cms-r2-binding.js';
import { isFullHtmlDocument } from './cms-injected-sections.js';
import { resolveIamPageHtmlKeys } from './iam-storefront-assets.js';
import { assembleAndPutIamPilotPage, isIamAssemblePilotRoute } from './iam-cms-assemble.js';
import { emitInnerAnimalProEvent } from './inneranimalpro-stream.js';

/** Copy draft R2 → published, update D1, bust caches. */
export async function executeCmsPagePublish(
  env: Record<string, unknown>,
  opts: ExecuteCmsPagePublishOpts,
): Promise<ExecuteCmsPagePublishResult> {
  const pageId = String(opts.pageId || '').trim();
  const page = (opts.page || {}) as CmsPage & Record<string, unknown>;
  const workspaceId = String(opts.workspaceId || '').trim();
  const tenantId = String(opts.tenantId || '').trim();
  const userId = String(opts.userId || '').trim();
  const agentApplied = opts.agentApplied === true;
  const ctx = opts.executionCtx || null;
  const waitUntil = (p: Promise<unknown> | undefined) => {
    if (ctx?.waitUntil && p) ctx.waitUntil(p);
    else if (p) p.catch(() => {});
  };

  if (!env?.DB || !pageId || !workspaceId || !tenantId || !userId) {
    return { ok: false, error: 'missing_context' };
  }

  const projectSlug = String(page.project_slug || page.project_id || '').trim();

  if (!String(page.seo_title || '').trim() && String(page.title || '').trim()) {
    await (env.DB as D1Database)
      .prepare(`UPDATE cms_pages SET seo_title = ? WHERE id = ?`)
      .bind(String(page.title).trim(), pageId)
      .run();
    page.seo_title = page.title;
  }
  if (!String(page.meta_description || '').trim()) {
    const autoDesc = `${String(page.title || page.slug || 'Page').trim()} — ${projectSlug || 'site'}`;
    await (env.DB as D1Database)
      .prepare(`UPDATE cms_pages SET meta_description = ? WHERE id = ?`)
      .bind(autoDesc, pageId)
      .run();
    page.meta_description = autoDesc;
  }

  const layout = resolveIamPageHtmlKeys(page, workspaceId, cmsPageKey);
  const r2BucketPre = layout.bucket || page.r2_bucket || CMS_DEFAULT_R2_BUCKET;
  const draftKeyPre = layout.draft_key;
  const r2BindingPre = getCmsR2Binding(env, r2BucketPre);

  await ensureCmsDraftR2BeforePublish(env, {
    workspaceId,
    page: { ...page, id: pageId },
    userId,
    r2Binding: r2BindingPre,
    draftKey: draftKeyPre,
  });

  const kvDraftPre = await getCmsDraftCache(env, pageId, userId).catch(() => null);
  const hasKvDraftPre = !!(kvDraftPre?.draft_data || kvDraftPre?.r2_key);

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
    return { ok: false, ...cmsPublishGateErrorResponse({ contract, promotion }) };
  }

  const lock = await acquireCmsPublishLock(env, workspaceId, projectSlug, userId);
  if (!lock.acquired) {
    return { ok: false, error: 'publish_in_progress', holder: lock.holder || null };
  }

  const r2Bucket = layout.bucket || page.r2_bucket || CMS_DEFAULT_R2_BUCKET;
  const draftKey = layout.draft_key;
  const publishedKey = layout.published_key;
  const r2Binding = getCmsR2Binding(env, r2Bucket);

  if (!r2Binding) {
    await releaseCmsPublishLock(env, workspaceId, projectSlug, userId);
    return { ok: false, error: 'R2 storage unavailable' };
  }

  let draftObj = await r2Binding.get(draftKey);
  if (!draftObj && layout.mode === 'storefront_asset' && layout.legacy_draft_key) {
    draftObj = await r2Binding.get(layout.legacy_draft_key).catch(() => null);
  }
  if (!draftObj) {
    const kvDraft = await getCmsDraftCache(env, pageId, userId);
    if (kvDraft?.r2_key) draftObj = await r2Binding.get(String(kvDraft.r2_key)).catch(() => null);
  }

  const storefrontHydrate = layout.mode === 'storefront_asset' && layout.asset?.hydrate === true;

  // Read the R2 body ONCE as ArrayBuffer to avoid "Body already used" stream exhaustion.
  // Derive text from the buffer via TextDecoder instead of calling .text() separately.
  let draftBuffer: ArrayBuffer | null = null;
  let draftHtml: string | null = null;
  if (draftObj) {
    draftBuffer = await draftObj.arrayBuffer();
    draftHtml = new TextDecoder().decode(draftBuffer);
  }

  const routePathEarly = String(page.route_path || `/${page.slug || ''}`).trim();
  const pilotAssembleEarly = isIamAssemblePilotRoute(routePathEarly);

  if (!draftObj && !storefrontHydrate && !pilotAssembleEarly) {
    await releaseCmsPublishLock(env, workspaceId, projectSlug, userId);
    return { ok: false, error: 'No draft found to publish' };
  }

  const draftRow = await (env.DB as D1Database)
    .prepare(`SELECT draft_data FROM cms_page_drafts WHERE page_id = ? AND user_id = ? LIMIT 1`)
    .bind(pageId, userId)
    .first()
    .catch(() => null);
  let draftData: Record<string, unknown> | null = null;
  if (draftRow?.draft_data) {
    try {
      draftData = JSON.parse(String(draftRow.draft_data)) as Record<string, unknown>;
    } catch {
      draftData = null;
    }
  }
  if (!draftData) {
    const kvDraft = await getCmsDraftCache(env, pageId, userId);
    draftData = (kvDraft?.draft_data as Record<string, unknown>) || null;
  }

  let overrideChain: unknown[] = [];
  if (draftData && typeof draftData === 'object') {
    const sectionCount = cmsDraftSectionCount(draftData);
    const payloadBytes = cmsDraftPayloadBytes(draftData);
    const spawnHint = cmsExceedsSpawnThreshold({ sectionCount, payloadBytes });
    if (spawnHint.spawn) {
      waitUntil(
        maybeSpawnCmsHeavyJob(env, ctx, {
          userId,
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
      userId,
    });
    waitUntil(
      logCmsActivity(env, {
        tenantId,
        userId,
        action: 'draft_promote',
        resourceType: 'page',
        resourceId: pageId,
        details: { overrides: overrideChain.length, spawn_hint: spawnHint },
      }),
    );
  }

  const routePath = routePathEarly;
  const pilotAssemble = pilotAssembleEarly;
  let assembleResult: Record<string, unknown> | null = null;

  if (pilotAssemble) {
    assembleResult = (await assembleAndPutIamPilotPage(env, {
      page: { ...page, id: pageId, route_path: routePath, slug: page.slug },
      r2Binding,
      draftOnly: false,
    })) as Record<string, unknown>;
    if (!assembleResult?.ok) {
      await releaseCmsPublishLock(env, workspaceId, projectSlug, userId);
      return {
        ok: false,
        error: String(assembleResult?.error || 'assemble_failed'),
        assemble: assembleResult,
      };
    }
  }

  const shouldCopyDraftR2 =
    !pilotAssemble &&
    draftBuffer != null &&
    draftHtml != null &&
    (!storefrontHydrate || isFullHtmlDocument(draftHtml));

  // Hoist contentByteLength so it's accessible in the return statement regardless of branch.
  let contentByteLength = 0;
  if (pilotAssemble && assembleResult) {
    contentByteLength = Number(assembleResult.bytes) || 0;
  } else if (shouldCopyDraftR2 && draftBuffer != null) {
    contentByteLength = draftBuffer.byteLength;
    await r2Binding.put(publishedKey, draftBuffer, {
      httpMetadata: { contentType: page.content_type || 'text/html' },
    });
    if (layout.mode === 'storefront_asset' && layout.legacy_published_key) {
      await r2Binding.put(layout.legacy_published_key, draftBuffer, {
        httpMetadata: { contentType: page.content_type || 'text/html' },
      }).catch(() => {});
    }
  } else if (storefrontHydrate) {
    const pubHead = await r2Binding.head(publishedKey).catch(() => null);
    contentByteLength = Number(pubHead?.size) || Number(page.content_size_bytes) || 0;
  }

  const dbR2Key = publishedKey;

  const now = Math.floor(Date.now() / 1000);
  await (env.DB as D1Database)
    .prepare(`
    UPDATE cms_pages
    SET status = 'published',
        published_at = ?,
        published_by = ?,
        updated_at = ?,
        r2_key = ?,
        content_size_bytes = ?
    WHERE id = ?
  `)
    .bind(now, userId, now, dbR2Key, contentByteLength, pageId)
    .run();

  waitUntil(releaseCmsPublishLock(env, workspaceId, projectSlug, userId));
  if (projectSlug) {
    waitUntil(invalidateCmsBootstrapCache(env, workspaceId, projectSlug));
  }

  auditCmsMutation(env, ctx, {
    workspaceId,
    tenantId,
    userId,
    projectSlug,
    pageId,
    sectionId: 'publish',
    agentApplied,
    routeKey: agentApplied ? 'cms_edit' : undefined,
  });
  waitUntil(
    logCmsActivity(env, {
      tenantId,
      userId,
      action: 'publish',
      resourceType: 'page',
      resourceId: pageId,
      details: agentApplied ? { agent_applied: true } : undefined,
    }),
  );
  emitInnerAnimalProEvent(
    env,
    {
      userId,
      eventName: `cms_publish:${pageId}:${projectSlug || page.slug || 'page'}`,
    },
    ctx,
  );
  await clearCmsDraftHotCache(env, pageId, userId);

  const tenantRow = await (env.DB as D1Database)
    .prepare(`SELECT domain FROM cms_tenants WHERE slug = ? LIMIT 1`)
    .bind(projectSlug)
    .first()
    .catch(() => null);
  const previewUrls = buildCmsPageUrls(
    { ...page, id: pageId, status: 'published', r2_key: publishedKey },
    { domain: tenantRow?.domain || null, projectSlug },
  );

  return {
    ok: true,
    status: 'published',
    phase: pilotAssemble ? 'assembled_live' : 'published_live',
    page_id: pageId,
    r2_key: publishedKey,
    r2_bucket: String(r2Bucket),
    byte_length: contentByteLength,
    bootstrap_cache_key: cmsBootstrapKey(workspaceId, projectSlug),
    override_chain: overrideChain,
    preview_urls: previewUrls,
    live_url: previewUrls.live_url,
    agent_applied: agentApplied,
    assemble: assembleResult,
  };
}
