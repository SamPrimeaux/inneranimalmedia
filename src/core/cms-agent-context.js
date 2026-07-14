/**
 * CMS context injection for Agent Sam chat spine.
 */
import { normalizeWorkspaceContextPacket } from './workspace-studio-context.js';

const CMS_PROTOCOL_LINES = [
  'Loop: agentsam_cms_read → agentsam_cms_save_page_html|save_injected|save_site_shell|cms_write → agentsam_cms_publish|publish_site_shell → agentsam_cms_verify_live',
  'Always verify live_url after publish — reject Clean canvas / 404 as incomplete.',
].join('\n');

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
    preview_url: ws?.preview_url ?? bc.preview_url ?? null,
    public_domain: ws?.public_domain ?? bc.public_domain ?? null,
    cms_hosting: ws?.cms_hosting ?? bc.cms_hosting ?? null,
    api_profile: ws?.api_profile ?? bc.api_profile ?? null,
    picked_element: ws?.picked_element ?? bc.picked_element ?? bc.selected_element ?? null,
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
 * On-demand CMS payload formatter — do NOT append ambiently every chat turn.
 * Call only when the user is on a CMS surface and this chat is about that page,
 * or when they @-attach CMS context.
 * @param {Record<string, unknown>|null} cms
 */
export function formatCmsContextForAgent(cms) {
  if (!cms || typeof cms !== 'object') return '';
  const profile = String(cms.api_profile || '').trim();
  const siteLock = [
    'SITE LOCK: Only edit this project_slug. Refuse other sites.',
    'Do not invent page_id / section_id / section_name — use values below or read first.',
    profile === 'cpas_fragment'
      ? 'api_profile=cpas_fragment: use bridge section save/publish — not PrimeTech full-page remaster.'
      : profile === 'fuel_admin'
        ? 'api_profile=fuel_admin: Fuel admin CMS tools only.'
        : 'api_profile=primetch (or default): PrimeTech read → save → publish → verify.',
    'Instruction SSOT is D1 skills/rules/routes — do not invent system prompts from R2 markdown.',
  ].join(' ');
  const lines = [
    '[CMS editor context — follow site lock. Do not invent page ids.]',
    siteLock,
    profile === 'cpas_fragment' || profile === 'fuel_admin' ? '' : CMS_PROTOCOL_LINES,
    `project_slug: ${cms.project_slug || '(none)'}`,
    `api_profile: ${profile || '(none)'}`,
    `page_id: ${cms.page_id || '(none)'}`,
    `studio_panel: ${cms.studio_panel || '(none)'}`,
    `section_id: ${cms.section_id || '(none)'}`,
    `section_type: ${cms.section_type || '(none)'}`,
    `live_session_id: ${cms.live_session_id || '(none)'}`,
    `collab_room (IAM_COLLAB): ${cms.collab_room || '(none)'}`,
    `bootstrap_cache_key (SESSION_CACHE): ${cms.bootstrap_cache_key || '(none)'}`,
    `preview_url: ${cms.preview_url || '(none)'}`,
    `public_domain: ${cms.public_domain || '(none)'}`,
    `cms_hosting: ${cms.cms_hosting || '(none)'}`,
    `r2_bucket: ${cms.r2_bucket || '(none)'}`,
    `r2_key: ${cms.r2_key || '(none)'}`,
  ].filter(Boolean);
  return `## CMS context\n${lines.join('\n')}`;
}
