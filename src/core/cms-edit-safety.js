/**
 * CMS M2 edit safety — drafts, overrides, activity, patch sessions, preview HTML.
 */
import { logSkillInvocation } from '../api/agentsam.js';
import { recordAgentsamPatchSession } from './agentsam-patch-sessions.js';
import {
  deleteCmsDraftCache,
  getCmsDraftCache,
  invalidateCmsBootstrapCache,
  putCmsDraftCache,
} from './cms-kv-cache.js';
import {
  fetchInjectedSectionHtml,
  isFullHtmlDocument,
  normalizeFullPageHtml,
  renderCmsSectionTreeHtmlWithInjections,
} from './cms-injected-sections.js';
import { CMS_DEFAULT_R2_BUCKET, getCmsR2Binding } from './cms-r2-binding.js';

const CMS_EDIT_SKILL_ID = 'skill_iam_cms_edit';

/** @param {string} workspaceId @param {string} projectId @param {string} slug @param {string} variant */
export function cmsPageHtmlKey(workspaceId, projectId, slug, variant) {
  return `cms/${workspaceId}/${projectId}/${slug}/${variant}.html`;
}

/** @param {string} raw */
export function cmsOverrideProjectId(raw) {
  const s = String(raw || '0').trim();
  const n = parseInt(s, 10);
  if (!Number.isNaN(n) && String(n) === s) return n;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

/**
 * @param {any} env
 * @param {{
 *   tenantId: string,
 *   userId: string,
 *   action: string,
 *   resourceType: string,
 *   resourceId: string,
 *   details?: string|null,
 * }} opts
 */
export async function logCmsActivity(env, opts) {
  if (!env?.DB) return;
  const tenantId = String(opts?.tenantId || '').trim();
  const userId = String(opts?.userId || '').trim();
  if (!tenantId || !userId) return;
  const details =
    opts.details != null
      ? typeof opts.details === 'string'
        ? opts.details
        : JSON.stringify(opts.details)
      : null;
  await env.DB.prepare(
    `INSERT INTO cms_activity_log (id, tenant_id, user_id, action, resource_type, resource_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `al_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      userId,
      String(opts.action || 'update').slice(0, 40),
      String(opts.resourceType || 'cms').slice(0, 40),
      String(opts.resourceId || '').slice(0, 120),
      details,
      Math.floor(Date.now() / 1000),
    )
    .run()
    .catch(() => {});
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   workspaceId?: string|null,
 *   tenantId?: string|null,
 *   userId?: string|null,
 *   projectSlug: string,
 *   pageId: string,
 *   sectionId?: string|null,
 *   changeSetId?: string|null,
 *   agentApplied?: boolean,
 *   routeKey?: string|null,
 * }} opts
 */
export function auditCmsMutation(env, ctx, opts) {
  const slug = String(opts.projectSlug || '').trim();
  const pageId = String(opts.pageId || '').trim();
  const sectionId = String(opts.sectionId || 'page').trim();
  if (!slug || !pageId) return;

  const taskFile = `cms/${slug}/${pageId}/${sectionId}`.slice(0, 200);
  const planId = opts.changeSetId || `cms_${pageId}_${Date.now().toString(36)}`;

  recordAgentsamPatchSession(env, ctx, {
    planId,
    changeSetId: opts.changeSetId || null,
    taskFile,
    workspaceId: opts.workspaceId,
    tenantId: opts.tenantId,
    applied: 1,
    passed: 1,
    provider: 'cms_api',
  });

  const routeKey = String(opts.routeKey || '').trim();
  const agentApplied = opts.agentApplied === true || routeKey === 'cms_edit';
  if (agentApplied && opts.userId) {
    const run = async () => {
      try {
        await logSkillInvocation(env, {
          skillId: CMS_EDIT_SKILL_ID,
          conversationId: opts.changeSetId || null,
          triggerMethod: agentApplied ? 'agent_apply' : 'cms_edit_route',
          inputSummary: taskFile.slice(0, 200),
          success: true,
          durationMs: 0,
          modelUsed: 'cms_edit',
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
        });
      } catch (_) {}
    };
    if (ctx?.waitUntil) ctx.waitUntil(run());
    else void run();
  }
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {string} workspaceId
 * @param {string} projectSlug
 */
export function invalidateCmsBootstrap(env, ctx, workspaceId, projectSlug) {
  const ws = String(workspaceId || '').trim();
  const slug = String(projectSlug || '').trim();
  if (!ws || !slug) return;
  const p = invalidateCmsBootstrapCache(env, ws, slug);
  if (ctx?.waitUntil) ctx.waitUntil(p);
  else void p;
}

/**
 * @param {any} env
 * @param {{
 *   pageId: string,
 *   userId: string,
 *   draftData: Record<string, unknown>,
 * }} opts
 */
export async function flushCmsDraftToD1(env, opts) {
  const pageId = String(opts?.pageId || '').trim();
  const userId = String(opts?.userId || '').trim();
  if (!env?.DB || !pageId || !userId) return { ok: false };

  let payload = opts.draftData;
  if (!payload || typeof payload !== 'object') {
    const cached = await getCmsDraftCache(env, pageId, userId);
    payload = cached?.draft_data || cached;
  }
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'no_draft' };

  const json = JSON.stringify(payload);
  await env.DB.prepare(
    `INSERT INTO cms_page_drafts (page_id, user_id, draft_data, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(page_id, user_id) DO UPDATE SET
       draft_data = excluded.draft_data,
       updated_at = datetime('now')`,
  )
    .bind(pageId, userId, json)
    .run();

  return { ok: true, draft_data: payload };
}

/**
 * @param {any} env
 * @param {string} bucket
 * @param {string} sourceKey
 * @param {string} destKey
 */
export async function copyR2Object(env, bucket, sourceKey, destKey) {
  const binding =
    bucket === 'inneranimalmedia' || bucket === 'dashboard' ? env.ASSETS || env.R2 : env.ASSETS || env.R2;
  if (!binding || !sourceKey || !destKey) return false;
  const obj = await binding.get(String(sourceKey)).catch(() => null);
  if (!obj) return false;
  const buf = await obj.arrayBuffer();
  const ct = obj.httpMetadata?.contentType || 'text/html';
  await binding.put(String(destKey), buf, { httpMetadata: { contentType: ct } });
  return true;
}

/**
 * @param {Array<Record<string, unknown>>} sections
 * @param {Record<string, Array<Record<string, unknown>>>} componentsBySection
 */
export function renderCmsSectionTreeHtml(sections, componentsBySection = {}, opts = {}) {
  const sorted = [...(sections || [])].sort(
    (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0),
  );
  const themeCss = String(opts.themeCss || '').trim();
  const parts = [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>CMS Preview</title>',
    themeCss ? `<style id="cms-theme">${themeCss}</style>` : '',
    '<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#faf9f7;color:#1a1815}',
    'section{margin-bottom:32px;padding:20px;border:1px solid #e8e4dc;border-radius:10px}',
    'h1,h2{margin:0 0 8px}p{margin:0 0 8px;line-height:1.5;color:#444}',
    '.cmp{margin-top:8px;padding:8px;background:#fff;border-radius:6px;font-size:14px}',
    '.hidden{opacity:.35}</style></head><body>',
  ];
  for (const s of sorted) {
    if (!s.is_visible && s.is_visible !== 1) {
      parts.push(`<section class="hidden" data-section="${s.id}">`);
    } else {
      parts.push(`<section data-section="${s.id}">`);
    }
    const d =
      s.section_data && typeof s.section_data === 'object'
        ? s.section_data
        : (() => {
            try {
              return typeof s.section_data === 'string' ? JSON.parse(s.section_data) : {};
            } catch {
              return {};
            }
          })();
    const headline = d.headline || d.heading || d.title || s.section_name || s.section_type;
    if (headline) parts.push(`<h2>${escapeHtml(String(headline))}</h2>`);
    const body = d.body || d.paragraph || d.description || d.subheadline || '';
    if (body) parts.push(`<p>${escapeHtml(String(body))}</p>`);
    const comps = componentsBySection[s.id] || [];
    for (const c of comps) {
      const cd =
        c.component_data && typeof c.component_data === 'object'
          ? c.component_data
          : (() => {
              try {
                return typeof c.component_data === 'string' ? JSON.parse(c.component_data) : {};
              } catch {
                return {};
              }
            })();
      const label = cd.label || cd.title || c.component_type || 'component';
      parts.push(`<div class="cmp" data-component="${c.id}">${escapeHtml(String(label))}</div>`);
    }
    parts.push('</section>');
  }
  parts.push('</body></html>');
  return parts.join('');
}

/** @param {string} s */
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {any} env
 * @param {string} pageId
 * @param {string} userId
 */
export async function clearCmsDraftHotCache(env, pageId, userId) {
  await deleteCmsDraftCache(env, pageId, userId);
}

/**
 * @param {any} env
 * @param {{ pageId: string, userId: string, payload: Record<string, unknown> }} opts
 */
export async function stageCmsDraftKv(env, opts) {
  await putCmsDraftCache(env, {
    pageId: opts.pageId,
    userId: opts.userId,
    payload: { draft_data: opts.payload, ...opts.payload },
  });
}

/**
 * Promote flushed draft sections → cms_page_overrides + cms_override_versions (pre-publish).
 * @param {any} env
 * @param {{
 *   page: { id: string, project_id?: string, project_slug?: string, slug?: string, route_path?: string },
 *   draftData: Record<string, unknown>,
 *   userId: string,
 * }} opts
 */
export async function promoteCmsDraftOverrides(env, opts) {
  const page = opts.page;
  const userId = String(opts.userId || '').trim();
  const draftData = opts.draftData && typeof opts.draftData === 'object' ? opts.draftData : {};
  const sections = /** @type {Record<string, unknown>} */ (draftData.sections || {});
  const path = String(page.route_path || `/${page.slug || ''}`).trim() || '/';
  const projectSlug = String(page.project_slug || page.project_id || '').trim();
  const projectIdNum = cmsOverrideProjectId(page.project_id || projectSlug);
  const published = [];

  for (const [sectionKey, sectionPayload] of Object.entries(sections)) {
    const overridesJson =
      typeof sectionPayload === 'string' ? sectionPayload : JSON.stringify(sectionPayload || {});
    const existing = await env.DB.prepare(
      `SELECT id, version FROM cms_page_overrides
       WHERE project_slug = ? AND path = ? AND section = ? LIMIT 1`,
    )
      .bind(projectSlug, path, sectionKey)
      .first()
      .catch(() => null);

    let overrideId = existing?.id;
    const nextVersion = (Number(existing?.version) || 0) + 1;

    if (overrideId) {
      await env.DB.prepare(
        `UPDATE cms_page_overrides
         SET overrides_json = ?, status = 'draft', version = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(overridesJson, nextVersion, overrideId)
        .run();
    } else {
      overrideId = `ov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await env.DB.prepare(
        `INSERT INTO cms_page_overrides
         (id, project_id, project_slug, path, section, overrides_json, status, version, created_by, created_at, updated_at, project_id_text)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, ?, datetime('now'), datetime('now'), ?)`,
      )
        .bind(
          overrideId,
          projectIdNum,
          projectSlug,
          path,
          sectionKey,
          overridesJson,
          userId,
          String(page.project_id || projectSlug),
        )
        .run()
        .catch(async () => {
          await env.DB.prepare(
            `INSERT INTO cms_page_overrides
             (id, project_id, project_slug, path, section, overrides_json, status, version, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, ?, datetime('now'), datetime('now'))`,
          )
            .bind(overrideId, projectIdNum, projectSlug, path, sectionKey, overridesJson, userId)
            .run();
        });
    }

    const versionId = `ovv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await env.DB.prepare(
      `INSERT INTO cms_override_versions
       (override_id, project_id, project_slug, path, section, overrides_json, version, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, datetime('now'))`,
    )
      .bind(
        overrideId,
        projectIdNum,
        projectSlug,
        path,
        sectionKey,
        overridesJson,
        nextVersion || 1,
        userId,
      )
      .run();

    await env.DB.prepare(
      `UPDATE cms_page_overrides
       SET status = 'published', published_at = datetime('now'), published_by = ?, version = ?
       WHERE id = ?`,
    )
      .bind(userId, nextVersion || 1, overrideId)
      .run();

    published.push({ override_id: overrideId, version_id: versionId, section: sectionKey });
  }

  return published;
}

/**
 * Merge KV/D1 draft section overrides onto page sections for preview/publish HTML.
 * @param {Array<Record<string, unknown>>} sections
 * @param {Record<string, unknown>|null} draftData
 */
export function mergeCmsDraftSections(sections, draftData) {
  const draftSections =
    draftData && typeof draftData === 'object'
      ? /** @type {Record<string, unknown>} */ (draftData).sections
      : null;
  if (!draftSections || typeof draftSections !== 'object') return sections;
  return (sections || []).map((s) => {
    const override = draftSections[s.id];
    if (!override || typeof override !== 'object') return s;
    const base =
      s.section_data && typeof s.section_data === 'object'
        ? s.section_data
        : (() => {
            try {
              return typeof s.section_data === 'string' ? JSON.parse(s.section_data) : {};
            } catch {
              return {};
            }
          })();
    return { ...s, section_data: { ...base, ...override } };
  });
}

/**
 * @param {any} env
 * @param {string} pageId
 * @param {string} userId
 * @param {Record<string, unknown>|null} [draftDataOverride]
 */
export async function loadCmsPagePreviewContext(env, pageId, userId, draftDataOverride = null) {
  const page = await env.DB.prepare(
    `SELECT id, project_id, project_slug, slug, route_path, title, r2_bucket, content_type
     FROM cms_pages WHERE id = ? LIMIT 1`,
  )
    .bind(pageId)
    .first()
    .catch(() => null);
  if (!page?.id) return null;

  const { results: sectionRows } = await env.DB.prepare(
    `SELECT id, section_type, section_name, section_data, sort_order, is_visible
     FROM cms_page_sections WHERE page_id = ? ORDER BY sort_order`,
  )
    .bind(pageId)
    .all()
    .catch(() => ({ results: [] }));

  let sections = (sectionRows || []).map((s) => ({
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

  let draftData = draftDataOverride;
  if (!draftData) {
    const kvDraft = await getCmsDraftCache(env, pageId, userId).catch(() => null);
    if (kvDraft?.draft_data) draftData = kvDraft.draft_data;
    else if (kvDraft && typeof kvDraft === 'object') draftData = kvDraft;
    else {
      const row = await env.DB.prepare(
        `SELECT draft_data FROM cms_page_drafts WHERE page_id = ? AND user_id = ? LIMIT 1`,
      )
        .bind(pageId, userId)
        .first()
        .catch(() => null);
      if (row?.draft_data) {
        try {
          draftData = JSON.parse(row.draft_data);
        } catch {
          draftData = null;
        }
      }
    }
  }
  sections = mergeCmsDraftSections(sections, draftData);

  const sectionIds = sections.map((s) => s.id).filter(Boolean);
  const componentsBySection = {};
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

  return { page, sections, componentsBySection, draftData };
}

/**
 * Render section tree HTML and persist to R2 draft.html (publish prerequisite).
 * @param {any} env
 * @param {{
 *   workspaceId: string,
 *   page: Record<string, unknown>,
 *   userId: string,
 *   draftData?: Record<string, unknown>|null,
 * }} opts
 */
/**
 * @param {Array<Record<string, unknown>>} sections
 * @param {unknown} r2Binding
 */
async function resolveFullPageHtmlFromSections(sections, r2Binding) {
  const visible = (sections || []).filter((s) => s.is_visible === 1 || s.is_visible === true);
  if (visible.length !== 1 || !r2Binding) return null;

  const section = visible[0];
  const data =
    section.section_data && typeof section.section_data === 'object'
      ? section.section_data
      : (() => {
          try {
            return typeof section.section_data === 'string' ? JSON.parse(section.section_data) : {};
          } catch {
            return {};
          }
        })();
  const r2Key = String(data.r2_key || data.r2Key || '').trim();
  if (!r2Key) return null;

  const obj = await r2Binding.get(r2Key).catch(() => null);
  if (!obj) return null;
  const raw = await obj.text();
  if (!isFullHtmlDocument(raw)) return null;
  return normalizeFullPageHtml(raw);
}

export async function writeCmsDraftHtmlToR2(env, opts) {
  const workspaceId = String(opts.workspaceId || '').trim();
  const userId = String(opts.userId || '').trim();
  const page = opts.page || {};
  const pageId = String(page.id || '').trim();
  if (!env?.DB || !workspaceId || !userId || !pageId) {
    return { ok: false, error: 'missing_context' };
  }

  const ctx = await loadCmsPagePreviewContext(env, pageId, userId, opts.draftData || null);
  if (!ctx) return { ok: false, error: 'page_not_found' };

  const r2Bucket = String(page.r2_bucket || CMS_DEFAULT_R2_BUCKET).trim();
  const r2Binding = getCmsR2Binding(env, r2Bucket);
  if (!r2Binding) return { ok: false, error: 'r2_unavailable' };

  const fullPageOverride =
    typeof opts.fullPageHtml === 'string' && opts.fullPageHtml.trim()
      ? normalizeFullPageHtml(opts.fullPageHtml)
      : await resolveFullPageHtmlFromSections(ctx.sections, r2Binding);

  let html;
  if (fullPageOverride) {
    html = fullPageOverride;
  } else if (ctx.sections?.length) {
    html = await renderCmsSectionTreeHtmlWithInjections(
      ctx.sections,
      ctx.componentsBySection,
      r2Binding,
    );
  } else {
    html = renderCmsSectionTreeHtml(ctx.sections, ctx.componentsBySection);
  }

  const draftKey = cmsPageHtmlKey(
    workspaceId,
    String(page.project_id || page.project_slug || ''),
    String(page.slug || ''),
    'draft',
  );
  const contentBuffer = new TextEncoder().encode(html);
  await r2Binding.put(draftKey, contentBuffer, {
    httpMetadata: { contentType: String(page.content_type || 'text/html') },
  });

  await putCmsDraftCache(env, {
    pageId,
    userId,
    payload: {
      draft_data: ctx.draftData || opts.draftData || null,
      r2_key: draftKey,
      r2_bucket: r2Bucket,
      byte_length: contentBuffer.byteLength,
      html_rendered_at: Math.floor(Date.now() / 1000),
      full_page_document: Boolean(fullPageOverride),
    },
  });

  return { ok: true, r2_key: draftKey, r2_bucket: r2Bucket, byte_length: contentBuffer.byteLength };
}

/**
 * Ensure draft.html exists in R2 before publish (build from D1 sections + KV draft if missing).
 * @param {any} env
 * @param {{
 *   workspaceId: string,
 *   page: Record<string, unknown>,
 *   userId: string,
 *   r2Binding: unknown,
 *   draftKey: string,
 * }} opts
 */
export async function ensureCmsDraftR2BeforePublish(env, opts) {
  const r2Binding = opts.r2Binding;
  const draftKey = String(opts.draftKey || '').trim();
  const page = opts.page || {};
  const userId = String(opts.userId || '').trim();
  const pageId = String(page.id || '').trim();

  if (pageId && env?.DB) {
    const sectionRow = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM cms_page_sections WHERE page_id = ?`,
    )
      .bind(pageId)
      .first()
      .catch(() => null);
    const sectionCount = Number(sectionRow?.n) || 0;
    if (sectionCount > 0) {
      return writeCmsDraftHtmlToR2(env, {
        workspaceId: opts.workspaceId,
        page,
        userId,
      });
    }
  }

  if (r2Binding && draftKey) {
    const head = await r2Binding.head(draftKey).catch(() => null);
    if (head) return { ok: true, existed: true, r2_key: draftKey };
  }

  const publishedKey = String(page.r2_key || '').trim();
  if (r2Binding && draftKey && publishedKey && pageId && userId) {
    const pubObj = await r2Binding.get(publishedKey).catch(() => null);
    if (pubObj) {
      const content = await pubObj.arrayBuffer();
      const r2Bucket = String(page.r2_bucket || CMS_DEFAULT_R2_BUCKET).trim();
      await r2Binding.put(draftKey, content, {
        httpMetadata: { contentType: String(page.content_type || 'text/html; charset=utf-8') },
      });
      await putCmsDraftCache(env, {
        pageId,
        userId,
        payload: {
          r2_key: draftKey,
          r2_bucket: r2Bucket,
          byte_length: content.byteLength,
          copied_from_published: publishedKey,
          html_rendered_at: Math.floor(Date.now() / 1000),
        },
      });
      return { ok: true, copied_from_published: true, r2_key: draftKey };
    }
  }

  return writeCmsDraftHtmlToR2(env, {
    workspaceId: opts.workspaceId,
    page,
    userId,
  });
}
