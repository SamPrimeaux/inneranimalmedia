/**
 * Code-proven CMS spines per app_key — do not trust client_apps metadata alone.
 * Agent Sam + Theme Studio use this for buckets, keys, and conventions.
 */

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/** @type {Record<string, Record<string, unknown>>} */
export const CMS_CODE_SPINES = {
  companionscpas: {
    app_key: 'companionscpas',
    cms_mode: 'client_worker',
    api_profile: 'cpas_fragment',
    r2_bucket: 'companionscpas',
    r2_binding: 'WEBSITE_ASSETS',
    r2_custom_domain: 'assets.companionsofcaddo.org',
    d1_database_id: 'fd6dd6fb-156b-4b6a-8ff0-505422652391',
    d1_database_name: 'companionscpas',
    d1_binding: 'DB',
    kv_namespace_id: '0b410337a8494fc982ea04c5bde1eab4',
    kv_binding: 'CMS_CACHE',
    public_domain: 'companionsofcaddo.org',
    path_convention: 'static/pages/{page_name}/{section_key}.html',
    page_artifact_convention: 'static/pages{route}/index.html',
    global_header_key: 'static/global/cpas-header.html',
    global_footer_key: 'static/global/cpas-footer.html',
    global_css_key: 'static/global/cpas-shell.css',
    shell_mode: 'dynamic_nav',
    header_runtime_note:
      'Prefer render_site_nav.js (D1 nav_visible + brand); R2 cpas-header/footer are fallbacks',
    content_ssot: 'client D1 cms_pages + cms_page_sections; publish assembles R2 + KV page:{route}',
    page_model: 'section_stack',
  },
  inneranimalmedia: {
    app_key: 'inneranimalmedia',
    cms_mode: 'platform',
    api_profile: 'primetch',
    r2_bucket: 'inneranimalmedia',
    r2_binding: 'ASSETS',
    r2_custom_domain: 'assets.inneranimalmedia.com',
    d1_database_id: 'cf87b717-d4e2-4cf8-bab0-a81268e32d49',
    d1_database_name: 'inneranimalmedia-business',
    d1_binding: 'DB',
    kv_namespace_id: 'dc87920b0a9247979a213c09df9a0234',
    kv_binding: 'SESSION_CACHE',
    public_domain: 'inneranimalmedia.com',
    path_convention: 'pages/{slug}/sections/{section_key}.html',
    page_artifact_convention: 'pages/{slug}/index.html',
    global_header_key: 'src/components/iam-header.html',
    global_footer_key: 'src/components/iam-footer.html',
    global_css_key: null,
    shell_mode: 'dynamic_nav',
    header_runtime_note:
      'Request inject via HTMLRewriter; nav links patched from SITE_NAV + cms_pages.nav_visible; R2 iam-header is chrome template/fallback',
    content_ssot:
      'IAM D1 cms_pages + sections; storefront R2 pages/{slug}/index.html; pilot publish assembles section stack',
    page_model: 'section_stack',
    assemble_pilot_routes: ['/agentsam'],
  },
};

/**
 * @param {string|null|undefined} appKey
 * @returns {Record<string, unknown>|null}
 */
export function getCmsCodeSpine(appKey) {
  const key = trim(appKey).toLowerCase();
  if (!key) return null;
  if (key === 'iam') return { ...CMS_CODE_SPINES.inneranimalmedia };
  return CMS_CODE_SPINES[key] ? { ...CMS_CODE_SPINES[key] } : null;
}

/**
 * Merge live siteConfig + code spine into agent_site_context.
 * Code spine wins on conventions when inventory drifts.
 * @param {string|null|undefined} appKey
 * @param {Record<string, unknown>|null|undefined} siteConfig
 * @param {Record<string, unknown>|null|undefined} [pageFocus]
 */
export function buildAgentSiteContext(appKey, siteConfig = null, pageFocus = null) {
  const spine = getCmsCodeSpine(appKey);
  const cfg = siteConfig && typeof siteConfig === 'object' ? siteConfig : {};
  const focus = pageFocus && typeof pageFocus === 'object' ? pageFocus : {};
  const slug = trim(appKey) || trim(cfg.project_slug) || trim(cfg.app_key) || null;

  if (!spine && !slug) return null;

  const base = spine || {
    app_key: slug,
    cms_mode: trim(cfg.cms_hosting) || 'platform',
    api_profile: trim(cfg.api_profile) || trim(cfg.cms_api_profile) || 'primetch',
    r2_bucket: trim(cfg.r2_bucket) || null,
    d1_database_id: trim(cfg.d1_database_id) || null,
    public_domain: trim(cfg.public_domain) || null,
    page_model: 'unknown',
  };

  return {
    ...base,
    app_key: spine?.app_key || slug,
    api_profile: trim(cfg.api_profile) || trim(cfg.cms_api_profile) || base.api_profile,
    cms_mode: trim(cfg.cms_hosting) || base.cms_mode,
    r2_bucket: trim(cfg.r2_bucket) || base.r2_bucket,
    d1_database_id: trim(cfg.d1_database_id) || base.d1_database_id,
    public_domain: trim(cfg.public_domain) || base.public_domain,
    page_id: trim(focus.page_id) || null,
    route_path: trim(focus.route_path) || null,
    r2_key: trim(focus.r2_key) || null,
    inventory_source: trim(cfg.inventory_source) || 'code_spine',
    spine_source: spine ? 'cms-site-spine.js' : 'site_config_only',
  };
}

/**
 * Format agent_site_context for system prompt.
 * @param {Record<string, unknown>|null|undefined} ctx
 */
export function formatAgentSiteContextForPrompt(ctx) {
  if (!ctx || typeof ctx !== 'object') return '';
  const lines = [
    '[Site spine — use these buckets/keys. Do not invent CPAS paths on IAM or IAM paths on CPAS.]',
    `app_key: ${ctx.app_key || '(none)'}`,
    `cms_mode: ${ctx.cms_mode || '(none)'}`,
    `api_profile: ${ctx.api_profile || '(none)'}`,
    `r2_bucket: ${ctx.r2_bucket || '(none)'}`,
    `r2_binding: ${ctx.r2_binding || '(none)'}`,
    `d1_database_id: ${ctx.d1_database_id || '(none)'}`,
    `d1_database_name: ${ctx.d1_database_name || '(none)'}`,
    `page_artifact_convention: ${ctx.page_artifact_convention || '(none)'}`,
    `path_convention: ${ctx.path_convention || '(none)'}`,
    `global_header_key: ${ctx.global_header_key || '(none)'}`,
    `global_footer_key: ${ctx.global_footer_key || '(none)'}`,
    `kv_binding: ${ctx.kv_binding || '(none)'}`,
    `public_domain: ${ctx.public_domain || '(none)'}`,
    `page_model: ${ctx.page_model || '(none)'}`,
    `shell_mode: ${ctx.shell_mode || '(none)'}`,
    ctx.page_id ? `page_id: ${ctx.page_id}` : '',
    ctx.route_path ? `route_path: ${ctx.route_path}` : '',
    ctx.r2_key ? `r2_key: ${ctx.r2_key}` : '',
    ctx.header_runtime_note ? `header_note: ${ctx.header_runtime_note}` : '',
    ctx.content_ssot ? `content_ssot: ${ctx.content_ssot}` : '',
  ].filter(Boolean);
  return `## Site spine\n${lines.join('\n')}`;
}
