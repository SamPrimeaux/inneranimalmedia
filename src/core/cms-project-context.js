/**
 * Per-site agentsam_project_context rows for CMS project_slug values.
 * Invoked from GET /api/cms/bootstrap (idempotent upsert).
 */
import { cmsBootstrapKey, cmsPublishLockKey } from './cms-kv-cache.js';

const CMS_PRIMARY_TABLES = JSON.stringify([
  'cms_pages',
  'cms_page_sections',
  'cms_section_components',
  'cms_themes',
  'cms_component_templates',
  'cms_page_drafts',
  'cms_page_overrides',
  'cms_live_edit_sessions',
]);

const CMS_RELATED_ROUTES = JSON.stringify([
  'cms_edit',
  'cms_live_editor.*',
  '/dashboard/cms/*',
  '/api/cms/bootstrap',
  '/api/cms/live-session/join',
]);

/**
 * @param {string} projectSlug
 */
export function cmsProjectContextRowId(projectSlug) {
  const safe = String(projectSlug || 'unknown')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
  return `ctx_cms_${safe}`;
}

/**
 * @param {any} env
 * @param {{
 *   tenantId: string,
 *   workspaceId: string,
 *   projectSlug: string,
 *   pageCount?: number,
 * }} opts
 */
export async function upsertCmsSiteProjectContext(env, opts) {
  const tenantId = String(opts?.tenantId || '').trim();
  const workspaceId = String(opts?.workspaceId || '').trim();
  const projectSlug = String(opts?.projectSlug || '').trim();
  if (!env?.DB || !tenantId || !workspaceId || !projectSlug) return;

  const id = cmsProjectContextRowId(projectSlug);
  const bootstrapKey = cmsBootstrapKey(workspaceId, projectSlug);
  const publishLockKey = cmsPublishLockKey(projectSlug);
  const pageCount = Number(opts?.pageCount) || 0;

  const description = [
    `CMS site project \`${projectSlug}\` on workspace ${workspaceId}.`,
    `D1: cms_pages (${pageCount} active), sections, themes, drafts.`,
    `R2 (ASSETS): published HTML, draft artifacts, theme CSS, snapshot rollback keys.`,
    `KV (SESSION_CACHE): ${bootstrapKey}, cms:live-session:{page_id}:{user_id}, cms:draft:{page_id}:{user_id}, ${publishLockKey}.`,
    `DO (IAM_COLLAB): live edit presence room cms:{page_id}.`,
  ].join(' ');

  await env.DB.prepare(
    `INSERT INTO agentsam_project_context (
       id, tenant_id, workspace_id, project_key, project_name, project_type,
       status, priority, description, primary_tables, related_routes,
       workers_involved, r2_buckets_involved, notes, created_at, updated_at
     ) VALUES (
       ?, ?, ?, ?, ?, 'cms_site', 'active', 75, ?, ?, ?,
       'inneranimalmedia', 'inneranimalmedia', ?, unixepoch(), unixepoch()
     )
     ON CONFLICT(id) DO UPDATE SET
       tenant_id = excluded.tenant_id,
       workspace_id = excluded.workspace_id,
       project_key = excluded.project_key,
       project_name = excluded.project_name,
       description = excluded.description,
       primary_tables = excluded.primary_tables,
       related_routes = excluded.related_routes,
       status = 'active',
       updated_at = unixepoch()`,
  )
    .bind(
      id,
      tenantId,
      workspaceId,
      projectSlug,
      `CMS · ${projectSlug}`,
      description,
      CMS_PRIMARY_TABLES,
      CMS_RELATED_ROUTES,
      `Auto-upsert from cms bootstrap. KV+DO+ASSETS lanes active (628).`,
    )
    .run()
    .catch((e) => console.warn('[cms-project-context] upsert', e?.message ?? e));
}

/**
 * @param {any} env
 * @param {string} workspaceId
 * @param {string} projectSlug
 * @param {string} planId
 */
export async function linkCmsProjectPlan(env, workspaceId, projectSlug, planId) {
  const ws = String(workspaceId || '').trim();
  const slug = String(projectSlug || '').trim();
  const pid = String(planId || '').trim();
  if (!env?.DB || !ws || !slug || !pid) return;
  const id = cmsProjectContextRowId(slug);
  await env.DB.prepare(
    `UPDATE agentsam_project_context SET linked_plan_id = ?, updated_at = unixepoch()
     WHERE id = ? AND workspace_id = ?`,
  )
    .bind(pid, id, ws)
    .run()
    .catch(() => {});
}
