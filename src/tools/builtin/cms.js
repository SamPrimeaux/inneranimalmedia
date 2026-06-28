/**
 * CMS agent tool bridge — PrimeTech loop: read → edit → save → publish → verify.
 * Used when task_type / route_key is cms_edit.
 */
import {
  auditCmsMutation,
  flushCmsDraftToD1,
  invalidateCmsBootstrap,
  logCmsActivity,
  stageCmsDraftKv,
  writeCmsDraftHtmlToR2,
  cmsPageHtmlKey as cmsPageKey,
} from '../../core/cms-edit-safety.js';
import {
  readCmsPageHtmlFromR2,
  saveCmsInjectedSection,
  saveCmsPageHtmlDraft,
  verifyCmsLiveUrl,
} from '../../core/cms-agent-page-html.js';
import { executeCmsPagePublish } from '../../core/cms-agent-publish.ts';
import { buildCmsPageUrls } from '../../core/cms-preview-route.js';
import { CMS_DEFAULT_R2_BUCKET, getCmsR2Binding } from '../../core/cms-r2-binding.js';
import {
  listSiteShellPartsMeta,
  publishSiteShellPart,
  writeSiteShellDraft,
} from '../../core/cms-site-shell.js';
import { resolveCmsPublicDomain } from '../../core/cms-storefront-url.js';
import { pipelineHandlers } from './cms-pipeline.js';
import { sitePackageHandlers } from './cms-site-package.js';

const CMS_PROTOCOL = [
  'PrimeTech CMS loop (use in order for page revisions):',
  '1. agentsam_cms_read({ page_id }) — page metadata, sections, draft/published HTML, preview_urls',
  '2. cms_pipeline_prototype({ goal, page_id }) OR agentsam_cms_save_page_html({ page_id, html }) OR agentsam_cms_save_injected({ page_id, section_name, html }) OR agentsam_cms_save_site_shell({ part_id, html }) for header/footer chrome',
  '3. agentsam_cms_publish({ page_id }) OR agentsam_cms_publish_site_shell({ part_id }) — copy draft R2 → published',
  '4. agentsam_cms_verify_live({ page_id }) — confirm live_url returns real content (not Clean canvas / 404)',
].join('\n');

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 * @param {Record<string, unknown>} runContext
 */
async function cmsRead(params, env, runContext) {
  const tenantId = String(runContext.tenantId ?? runContext.tenant_id ?? '').trim();
  const workspaceId = String(runContext.workspaceId ?? runContext.workspace_id ?? '').trim();
  const pageId = String(params.page_id ?? params.pageId ?? '').trim();
  const projectSlug = String(params.project_slug ?? params.projectSlug ?? '').trim();
  const includeHtml = params.include_html !== false;
  if (!env?.DB || !tenantId) return { error: 'tenant_or_db_missing' };

  if (pageId) {
    const page = await env.DB.prepare(`SELECT * FROM cms_pages WHERE id = ? AND tenant_id = ? LIMIT 1`)
      .bind(pageId, tenantId)
      .first();
    if (!page) return { error: 'page_not_found' };
    const { results: sections } = await env.DB.prepare(
      `SELECT id, section_type, section_name, section_data, sort_order, is_visible
       FROM cms_page_sections WHERE page_id = ? ORDER BY sort_order`,
    )
      .bind(pageId)
      .all();

    const tenantRow = await env.DB.prepare(`SELECT domain FROM cms_tenants WHERE slug = ? LIMIT 1`)
      .bind(page.project_slug || page.project_id || '')
      .first()
      .catch(() => null);
    const previewUrls = buildCmsPageUrls(page, {
      domain: tenantRow?.domain || null,
      projectSlug: page.project_slug || page.project_id || null,
    });

    let htmlDraft = null;
    let htmlPublished = null;
    if (includeHtml && workspaceId) {
      const draft = await readCmsPageHtmlFromR2(env, { page, workspaceId, variant: 'draft' });
      const published = await readCmsPageHtmlFromR2(env, { page, workspaceId, variant: 'published' });
      htmlDraft = draft.html
        ? { r2_key: draft.r2_key, byte_length: draft.byte_length, excerpt: draft.html.slice(0, 4000) }
        : null;
      htmlPublished = published.html
        ? { r2_key: published.r2_key, byte_length: published.byte_length, excerpt: published.html.slice(0, 4000) }
        : null;
    }

    return {
      ok: true,
      protocol: CMS_PROTOCOL,
      page,
      sections: sections || [],
      preview_urls: previewUrls,
      html_draft: htmlDraft,
      html_published: htmlPublished,
      storefront_edit_mode: htmlDraft?.edit_mode || htmlPublished?.edit_mode || null,
      storefront_asset_r2_key:
        htmlPublished?.storefront_asset_r2_key || htmlDraft?.storefront_asset_r2_key || null,
    };
  }

  let q = `SELECT id, slug, title, status, route_path, project_slug, updated_at FROM cms_pages WHERE tenant_id = ? AND status != 'archived'`;
  const binds = [tenantId];
  if (projectSlug) {
    q += ` AND project_slug = ?`;
    binds.push(projectSlug);
  }
  const { results } = await env.DB.prepare(`${q} ORDER BY updated_at DESC LIMIT 50`).bind(...binds).all();
  return { ok: true, protocol: CMS_PROTOCOL, pages: results || [] };
}

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 * @param {Record<string, unknown>} runContext
 */
async function cmsWrite(params, env, runContext) {
  const tenantId = String(runContext.tenantId ?? runContext.tenant_id ?? '').trim();
  const userId = String(runContext.userId ?? runContext.user_id ?? '').trim();
  const workspaceId = String(runContext.workspaceId ?? runContext.workspace_id ?? '').trim();
  const sectionId = String(params.section_id ?? params.sectionId ?? '').trim();
  const sectionData = params.section_data ?? params.sectionData;
  const changeSetId = params.change_set_id ?? params.changeSetId ?? null;
  if (!env?.DB || !tenantId || !userId || !sectionId) {
    return { error: 'section_id, tenant, and user required' };
  }
  if (sectionData == null) return { error: 'section_data required' };

  const row = await env.DB.prepare(
    `SELECT s.id, s.page_id, p.tenant_id, p.project_slug, p.project_id
     FROM cms_page_sections s
     JOIN cms_pages p ON p.id = s.page_id
     WHERE s.id = ? LIMIT 1`,
  )
    .bind(sectionId)
    .first();
  if (!row || String(row.tenant_id) !== tenantId) return { error: 'section_not_found' };

  const payload =
    typeof sectionData === 'string' ? sectionData : JSON.stringify(sectionData || {});
  await env.DB.prepare(
    `UPDATE cms_page_sections SET section_data = ?, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(payload, sectionId)
    .run();

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
  const draftPayload = {
    sections: { [sectionId]: parsed },
    page_id: row.page_id,
    updated_at: Math.floor(Date.now() / 1000),
  };
  await stageCmsDraftKv(env, { pageId: row.page_id, userId, payload: draftPayload });
  await flushCmsDraftToD1(env, { pageId: row.page_id, userId, draftData: draftPayload });

  const page = await env.DB.prepare(
    `SELECT id, project_slug, project_id, slug, r2_bucket, content_type, status FROM cms_pages WHERE id = ? LIMIT 1`,
  )
    .bind(row.page_id)
    .first()
    .catch(() => null);
  if (page && workspaceId) {
    await writeCmsDraftHtmlToR2(env, {
      workspaceId,
      page,
      userId,
      draftData: draftPayload,
    });
  }

  const projectSlug = String(row.project_slug || row.project_id || '').trim();
  auditCmsMutation(env, runContext.executionCtx || null, {
    workspaceId,
    tenantId,
    userId,
    projectSlug,
    pageId: row.page_id,
    sectionId,
    agentApplied: true,
    routeKey: 'cms_edit',
    changeSetId: changeSetId != null ? String(changeSetId) : null,
  });
  await logCmsActivity(env, {
    tenantId,
    userId,
    action: 'section_update',
    resourceType: 'section',
    resourceId: sectionId,
    details: { agent_applied: true, route_key: 'cms_edit' },
  });

  return {
    ok: true,
    section_id: sectionId,
    page_id: row.page_id,
    agent_applied: true,
    next_step: 'agentsam_cms_publish({ page_id }) then agentsam_cms_verify_live({ page_id })',
    r2_draft_key: page ? cmsPageKey(workspaceId, page.project_id, page.slug, 'draft') : null,
  };
}

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 * @param {Record<string, unknown>} runContext
 */
async function cmsSavePageHtml(params, env, runContext) {
  const tenantId = String(runContext.tenantId ?? runContext.tenant_id ?? '').trim();
  const userId = String(runContext.userId ?? runContext.user_id ?? '').trim();
  const workspaceId = String(runContext.workspaceId ?? runContext.workspace_id ?? '').trim();
  const pageId = String(params.page_id ?? params.pageId ?? '').trim();
  const html = params.html != null ? String(params.html) : '';
  if (!pageId || !html.trim()) return { error: 'page_id and html required' };

  const page = await env.DB.prepare(`SELECT * FROM cms_pages WHERE id = ? AND tenant_id = ? LIMIT 1`)
    .bind(pageId, tenantId)
    .first();
  if (!page) return { error: 'page_not_found' };

  const out = await saveCmsPageHtmlDraft(env, {
    page,
    pageId,
    workspaceId,
    userId,
    html,
    title: params.title != null ? String(params.title) : null,
    executionCtx: runContext.executionCtx || runContext.ctx || null,
  });
  if (!out.ok) return out;

  await logCmsActivity(env, {
    tenantId,
    userId,
    action: 'agent_save_page_html',
    resourceType: 'page',
    resourceId: pageId,
    details: { byte_length: out.byte_length },
  });

  return {
    ...out,
    next_step: 'agentsam_cms_publish({ page_id: "' + pageId + '" })',
  };
}

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 * @param {Record<string, unknown>} runContext
 */
async function cmsSaveInjected(params, env, runContext) {
  const tenantId = String(runContext.tenantId ?? runContext.tenant_id ?? '').trim();
  const userId = String(runContext.userId ?? runContext.user_id ?? '').trim();
  const workspaceId = String(runContext.workspaceId ?? runContext.workspace_id ?? '').trim();
  const pageId = String(params.page_id ?? params.pageId ?? '').trim();
  const sectionName = String(params.section_name ?? params.sectionName ?? '').trim();
  const html = params.html != null ? String(params.html) : '';
  if (!pageId || !sectionName || !html.trim()) {
    return { error: 'page_id, section_name, and html required' };
  }

  const page = await env.DB.prepare(`SELECT * FROM cms_pages WHERE id = ? AND tenant_id = ? LIMIT 1`)
    .bind(pageId, tenantId)
    .first();
  if (!page) return { error: 'page_not_found' };

  const out = await saveCmsInjectedSection(env, {
    page,
    pageId,
    workspaceId,
    userId,
    sectionName,
    sectionType: String(params.section_type ?? params.sectionType ?? 'custom'),
    html,
    position: String(params.position ?? 'end'),
    sectionId: String(params.section_id ?? params.sectionId ?? ''),
    executionCtx: runContext.executionCtx || runContext.ctx || null,
  });
  if (!out.ok) return out;

  await logCmsActivity(env, {
    tenantId,
    userId,
    action: 'agent_save_injected',
    resourceType: 'section',
    resourceId: out.section_id,
    details: { section_name: sectionName, r2_key: out.r2_key },
  });

  return {
    ...out,
    next_step: 'agentsam_cms_publish({ page_id: "' + pageId + '" })',
  };
}

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 * @param {Record<string, unknown>} runContext
 */
async function cmsPublish(params, env, runContext) {
  const tenantId = String(runContext.tenantId ?? runContext.tenant_id ?? '').trim();
  const userId = String(runContext.userId ?? runContext.user_id ?? '').trim();
  const workspaceId = String(runContext.workspaceId ?? runContext.workspace_id ?? '').trim();
  const pageId = String(params.page_id ?? params.pageId ?? '').trim();
  if (!env?.DB || !tenantId || !userId || !workspaceId || !pageId) {
    return { error: 'page_id, tenant, workspace, and user required' };
  }

  const page = await env.DB.prepare(
    `SELECT * FROM cms_pages WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(pageId, tenantId)
    .first();
  if (!page) return { error: 'page_not_found' };

  const out = await executeCmsPagePublish(env, {
    pageId,
    page,
    workspaceId,
    tenantId,
    userId,
    executionCtx: runContext.executionCtx || runContext.ctx || null,
    agentApplied: true,
  });
  if (!out.ok) return out;

  return {
    ...out,
    next_step: 'agentsam_cms_verify_live({ page_id: "' + pageId + '" })',
  };
}

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 * @param {Record<string, unknown>} runContext
 */
async function cmsVerifyLive(params, env, runContext) {
  const tenantId = String(runContext.tenantId ?? runContext.tenant_id ?? '').trim();
  const pageId = String(params.page_id ?? params.pageId ?? '').trim();
  const urlOverride = String(params.url ?? params.live_url ?? '').trim();
  if (!env?.DB || !tenantId) return { error: 'tenant_or_db_missing' };

  let liveUrl = urlOverride;
  let page = null;
  if (pageId) {
    page = await env.DB.prepare(`SELECT * FROM cms_pages WHERE id = ? AND tenant_id = ? LIMIT 1`)
      .bind(pageId, tenantId)
      .first();
    if (!page) return { error: 'page_not_found' };
    const tenantRow = await env.DB.prepare(`SELECT domain FROM cms_tenants WHERE slug = ? LIMIT 1`)
      .bind(page.project_slug || page.project_id || '')
      .first()
      .catch(() => null);
    const previewUrls = buildCmsPageUrls(page, {
      domain: tenantRow?.domain || null,
      projectSlug: page.project_slug || page.project_id || null,
    });
    liveUrl = liveUrl || previewUrls.live_url;
  }
  if (!liveUrl) return { error: 'page_id or url required' };

  const expectTitle = String(params.expect_title ?? params.expectTitle ?? page?.title ?? '').trim();
  const expectSnippet = String(params.expect_snippet ?? params.expectSnippet ?? '').trim();

  const verify = await verifyCmsLiveUrl(liveUrl, {
    expect_title: expectTitle || undefined,
    expect_snippet: expectSnippet || undefined,
  });

  return {
    ...verify,
    page_id: pageId || null,
    live_url: liveUrl,
    protocol_complete: verify.verified === true,
  };
}

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 * @param {Record<string, unknown>} runContext
 */
async function cmsSaveSiteShell(params, env, runContext) {
  const tenantId = String(runContext.tenantId ?? runContext.tenant_id ?? '').trim();
  const userId = String(runContext.userId ?? runContext.user_id ?? '').trim();
  const workspaceId = String(runContext.workspaceId ?? runContext.workspace_id ?? '').trim();
  const partId = String(params.part_id ?? params.partId ?? '').trim();
  const html = params.html != null ? String(params.html) : '';
  const projectSlug = String(
    params.project_slug ??
      params.projectSlug ??
      runContext.projectSlug ??
      runContext.project_slug ??
      'inneranimalmedia',
  ).trim();

  if (!partId || !html.trim()) return { error: 'part_id and html required' };
  if (!['header', 'footer'].includes(partId)) {
    return { error: 'part_id must be header or footer' };
  }

  try {
    const part = await writeSiteShellDraft(env, projectSlug, partId, html);
    if (workspaceId && projectSlug) {
      invalidateCmsBootstrap(env, runContext.executionCtx || runContext.ctx || null, workspaceId, projectSlug);
    }
    await logCmsActivity(env, {
      tenantId,
      userId,
      action: 'agent_save_site_shell',
      resourceType: 'site_shell',
      resourceId: partId,
      details: {
        project_slug: projectSlug,
        draft_key: part?.draft_key,
        byte_length: html.length,
        agent_applied: true,
      },
    });

    const domain = resolveCmsPublicDomain(projectSlug, null);
    const previewDraftUrl = `https://${domain}/?preview=draft&cms=1`;

    return {
      ok: true,
      part_id: partId,
      project_slug: projectSlug,
      part: {
        id: part?.id,
        label: part?.label,
        slot: part?.slot,
        published_key: part?.published_key,
        draft_key: part?.draft_key,
        has_draft: part?.has_draft,
        has_published: part?.has_published,
        byte_length: html.length,
      },
      preview_draft_url: previewDraftUrl,
      agent_applied: true,
      next_step: `agentsam_cms_publish_site_shell({ part_id: "${partId}", project_slug: "${projectSlug}" })`,
    };
  } catch (e) {
    const msg = e?.message || 'save_failed';
    if (msg === 'site_shell_not_configured' || msg === 'site_shell_part_not_found') {
      return { error: msg, project_slug: projectSlug, part_id: partId };
    }
    return { error: msg };
  }
}

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 * @param {Record<string, unknown>} runContext
 */
async function cmsPublishSiteShell(params, env, runContext) {
  const tenantId = String(runContext.tenantId ?? runContext.tenant_id ?? '').trim();
  const userId = String(runContext.userId ?? runContext.user_id ?? '').trim();
  const workspaceId = String(runContext.workspaceId ?? runContext.workspace_id ?? '').trim();
  const partId = String(params.part_id ?? params.partId ?? '').trim();
  const projectSlug = String(
    params.project_slug ??
      params.projectSlug ??
      runContext.projectSlug ??
      runContext.project_slug ??
      'inneranimalmedia',
  ).trim();

  if (!partId) return { error: 'part_id required' };
  if (!['header', 'footer'].includes(partId)) {
    return { error: 'part_id must be header or footer' };
  }

  try {
    const part = await publishSiteShellPart(env, projectSlug, partId);
    if (workspaceId && projectSlug) {
      invalidateCmsBootstrap(env, runContext.executionCtx || runContext.ctx || null, workspaceId, projectSlug);
    }
    const siteShell = await listSiteShellPartsMeta(env, projectSlug);
    await logCmsActivity(env, {
      tenantId,
      userId,
      action: 'agent_publish_site_shell',
      resourceType: 'site_shell',
      resourceId: partId,
      details: {
        project_slug: projectSlug,
        published_key: part?.published_key,
        agent_applied: true,
      },
    });

    const domain = resolveCmsPublicDomain(projectSlug, null);
    const liveUrl = `https://${domain}/`;

    return {
      ok: true,
      part_id: partId,
      project_slug: projectSlug,
      part: {
        id: part?.id,
        label: part?.label,
        slot: part?.slot,
        published_key: part?.published_key,
        draft_key: part?.draft_key,
        has_draft: part?.has_draft,
        has_published: part?.has_published,
      },
      site_shell: siteShell,
      live_url: liveUrl,
      agent_applied: true,
      next_step: `Confirm chrome on ${liveUrl} (header/footer should match published R2 keys)`,
    };
  } catch (e) {
    const msg = e?.message || 'publish_failed';
    if (msg === 'no_shell_draft') {
      return {
        error: msg,
        hint: 'Save draft first with agentsam_cms_save_site_shell',
        project_slug: projectSlug,
        part_id: partId,
      };
    }
    if (msg === 'site_shell_not_configured' || msg === 'site_shell_part_not_found') {
      return { error: msg, project_slug: projectSlug, part_id: partId };
    }
    return { error: msg };
  }
}

export const handlers = {
  cms_read: cmsRead,
  agentsam_cms_read: cmsRead,
  cms_write: cmsWrite,
  agentsam_cms_write: cmsWrite,
  cms_save_page_html: cmsSavePageHtml,
  agentsam_cms_save_page_html: cmsSavePageHtml,
  cms_save_injected: cmsSaveInjected,
  agentsam_cms_save_injected: cmsSaveInjected,
  cms_publish: cmsPublish,
  agentsam_cms_publish: cmsPublish,
  cms_verify_live: cmsVerifyLive,
  agentsam_cms_verify_live: cmsVerifyLive,
  cms_save_site_shell: cmsSaveSiteShell,
  agentsam_cms_save_site_shell: cmsSaveSiteShell,
  cms_publish_site_shell: cmsPublishSiteShell,
  agentsam_cms_publish_site_shell: cmsPublishSiteShell,
  ...pipelineHandlers,
  ...sitePackageHandlers,
};
