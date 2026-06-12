/**
 * CMS context injection for Agent Sam chat spine.
 */
import { normalizeWorkspaceContextPacket } from './workspace-studio-context.js';

/**
 * @param {unknown} body
 * @param {unknown} browserContext
 */
export function extractCmsAgentContext(body, browserContext) {
  const b = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : {};
  const bc =
    browserContext && typeof browserContext === 'object'
      ? /** @type {Record<string, unknown>} */ (browserContext)
      : {};

  const fromBody = b.cms_context ?? b.cmsContext;
  const ws = normalizeWorkspaceContextPacket(browserContext, body);

  const merged = {
    project_slug:
      (fromBody && typeof fromBody === 'object' ? fromBody.project_slug : null) ??
      ws?.project_slug ??
      bc.project_slug ??
      null,
    page_id:
      (fromBody && typeof fromBody === 'object' ? fromBody.page_id : null) ??
      ws?.page_id ??
      bc.page_id ??
      null,
    studio_panel: ws?.studio_panel ?? bc.studio_panel ?? null,
    section_id:
      fromBody && typeof fromBody === 'object' ? fromBody.section_id ?? null : null,
    section_type:
      fromBody && typeof fromBody === 'object' ? fromBody.section_type ?? null : null,
    live_session_id: ws?.live_session_id ?? bc.live_session_id ?? null,
    collab_room: ws?.collab_room ?? bc.collab_room ?? null,
    bootstrap_cache_key: ws?.bootstrap_cache_key ?? bc.bootstrap_cache_key ?? null,
    r2_bucket: ws?.r2_bucket ?? bc.r2_bucket ?? null,
    r2_key: ws?.r2_key ?? bc.r2_key ?? null,
    do_binding: 'IAM_COLLAB',
    kv_binding: 'SESSION_CACHE',
  };

  const hasSignal =
    merged.project_slug ||
    merged.page_id ||
    merged.section_id ||
    merged.live_session_id ||
    merged.bootstrap_cache_key;
  return hasSignal ? merged : null;
}

/**
 * @param {Record<string, unknown>|null} cms
 */
export function formatCmsContextForAgent(cms) {
  if (!cms || typeof cms !== 'object') return '';
  const lines = [
    '[CMS editor context — use for page/section edits, publish, and theme work. Do not invent page ids.]',
    `project_slug: ${cms.project_slug || '(none)'}`,
    `page_id: ${cms.page_id || '(none)'}`,
    `studio_panel: ${cms.studio_panel || '(none)'}`,
    `section_id: ${cms.section_id || '(none)'}`,
    `section_type: ${cms.section_type || '(none)'}`,
    `live_session_id: ${cms.live_session_id || '(none)'}`,
    `collab_room (IAM_COLLAB): ${cms.collab_room || '(none)'}`,
    `bootstrap_cache_key (SESSION_CACHE): ${cms.bootstrap_cache_key || '(none)'}`,
    `r2_bucket: ${cms.r2_bucket || '(none)'}`,
    `r2_key: ${cms.r2_key || '(none)'}`,
  ];
  return `## CMS context\n${lines.join('\n')}`;
}
