/**
 * CMS agent tool bridge — agentsam_cms_read|write|publish with agent_applied audit trail.
 * Used when task_type / route_key is cms_edit.
 */
import {
  auditCmsMutation,
  flushCmsDraftToD1,
  logCmsActivity,
  stageCmsDraftKv,
  writeCmsDraftHtmlToR2,
} from '../../core/cms-edit-safety.js';
import { verifyCmsPublishContract, runCmsPromotionGate, cmsPublishGateErrorResponse } from '../../core/cms-promotion-gates.js';

const CMS_DEFAULT_R2_BUCKET = 'inneranimalmedia';

function cmsPageKey(workspaceId, projectId, slug, variant) {
  return `cms/${workspaceId}/${projectId}/${slug}/${variant}.html`;
}

function getCmsR2Binding(env, bucketName) {
  const name = String(bucketName || CMS_DEFAULT_R2_BUCKET).trim();
  if (name === 'inneranimalmedia' || name === 'dashboard') return env.ASSETS || env.R2;
  return env.ASSETS || env.R2;
}

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 * @param {Record<string, unknown>} runContext
 */
async function cmsRead(params, env, runContext) {
  const tenantId = String(runContext.tenantId ?? runContext.tenant_id ?? '').trim();
  const pageId = String(params.page_id ?? params.pageId ?? '').trim();
  const projectSlug = String(params.project_slug ?? params.projectSlug ?? '').trim();
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
    return { ok: true, page, sections: sections || [] };
  }

  let q = `SELECT id, slug, title, status, route_path, project_slug, updated_at FROM cms_pages WHERE tenant_id = ? AND status != 'archived'`;
  const binds = [tenantId];
  if (projectSlug) {
    q += ` AND project_slug = ?`;
    binds.push(projectSlug);
  }
  const { results } = await env.DB.prepare(`${q} ORDER BY updated_at DESC LIMIT 50`).bind(...binds).all();
  return { ok: true, pages: results || [] };
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
    `SELECT id, project_slug, project_id, slug, r2_bucket, content_type FROM cms_pages WHERE id = ? LIMIT 1`,
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
  const ctx = runContext.executionCtx || null;
  auditCmsMutation(env, ctx, {
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
    r2_draft_key: page
      ? cmsPageKey(workspaceId, page.project_id, page.slug, 'draft')
      : null,
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

  const projectSlug = String(page.project_slug || page.project_id || '').trim();
  const draftKey = cmsPageKey(workspaceId, page.project_id, page.slug, 'draft');
  const r2Binding = getCmsR2Binding(env, page.r2_bucket || CMS_DEFAULT_R2_BUCKET);

  const contract = await verifyCmsPublishContract(env, {
    page,
    workspaceId,
    tenantId,
    r2Binding,
    draftKey,
    hasKvDraft: false,
  });
  const promotion = await runCmsPromotionGate(env, {
    page,
    tenantId,
    projectSlug,
    r2Binding,
    draftKey,
    hasKvDraft: false,
  });
  if (!contract.passed || !promotion.passed) {
    return { ok: false, ...cmsPublishGateErrorResponse({ contract, promotion }) };
  }

  return {
    ok: true,
    gated: true,
    message: 'Publish gates passed — call POST /api/cms/pages/:id/publish to complete (agent cannot bypass R2 copy).',
    page_id: pageId,
    contract,
    promotion,
  };
}

export const handlers = {
  cms_read: cmsRead,
  agentsam_cms_read: cmsRead,
  cms_write: cmsWrite,
  agentsam_cms_write: cmsWrite,
  cms_publish: cmsPublish,
  agentsam_cms_publish: cmsPublish,
};
