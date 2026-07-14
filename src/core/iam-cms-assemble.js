/**
 * IAM pilot assemble pipeline (CPAS-shaped): D1 sections → page HTML → R2.
 * Pilot routes only until more pages are extracted.
 */

import { normalizeCmsRoutePath } from './cms-page-hydrate-dispatch.js';
import {
  IAM_STOREFRONT_BUCKET,
  resolveIamStorefrontAssetForPage,
  storefrontAssetDraftKey,
} from './iam-storefront-assets.js';
import { getCmsCodeSpine } from './cms-site-spine.js';

const PILOT_ROUTES = new Set(
  (getCmsCodeSpine('inneranimalmedia')?.assemble_pilot_routes || ['/agentsam']).map((r) =>
    normalizeCmsRoutePath(r),
  ),
);

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugSeg(value, fallback = 'section') {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}

/**
 * @param {string|null|undefined} routePath
 */
export function isIamAssemblePilotRoute(routePath) {
  return PILOT_ROUTES.has(normalizeCmsRoutePath(routePath || ''));
}

/**
 * @param {Record<string, unknown>} page
 * @param {string} sectionKey
 */
export function iamSectionFragmentKey(page, sectionKey) {
  const asset = resolveIamStorefrontAssetForPage(page);
  const slug = asset
    ? String(asset.r2_key || '')
        .replace(/^pages\//, '')
        .replace(/\/index\.html$/, '')
    : slugSeg(page.slug || page.route_path, 'page');
  return `pages/${slug}/sections/${slugSeg(sectionKey)}.html`;
}

function parseSectionData(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * @param {Record<string, unknown>} section
 */
export function renderIamPilotSectionHtml(section) {
  const key = slugSeg(section.section_name || section.section_key || section.id, 'section');
  const type = String(section.section_type || 'html_block').trim() || 'html_block';
  const data = parseSectionData(section.section_data);
  const htmlFromData = String(data.html || data.body_html || data.content_html || '').trim();

  if (htmlFromData) {
    if (/^<section[\s>]/i.test(htmlFromData)) return htmlFromData;
    return `<section data-section-key="${esc(key)}" data-cms-section="${esc(key)}" data-section-type="${esc(type)}">${htmlFromData}</section>`;
  }

  const headline = data.headline || data.heading || data.title || section.section_name || type;
  const body = data.body || data.paragraph || data.description || data.subheadline || '';
  return `<section class="iam-cms-section" data-section-key="${esc(key)}" data-cms-section="${esc(key)}" data-section-type="${esc(type)}">
  <div class="iam-cms-section-inner">
    ${headline ? `<h2>${esc(String(headline))}</h2>` : ''}
    ${body ? `<p>${esc(String(body))}</p>` : ''}
  </div>
</section>`;
}

/**
 * @param {Record<string, unknown>} page
 * @param {string[]} sectionHtmls
 */
export function assembleIamPilotPageHtml(page, sectionHtmls) {
  const title = esc(page.seo_title || page.title || 'Inner Animal Media');
  const description = esc(
    page.meta_description || `${page.title || 'Page'} — Inner Animal Media`,
  );
  const route = esc(normalizeCmsRoutePath(page.route_path || `/${page.slug || ''}`));
  const body = (sectionHtmls || []).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<style>
  :root { --ink:#f8fbff; --muted:#9daac2; --bg:#050713; --line:rgba(255,255,255,.12); --blue:#2f7bff; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Nunito, Inter, system-ui, sans-serif; background: var(--bg); color: var(--ink); }
  main { padding-top: 76px; }
  .iam-cms-section { padding: clamp(64px, 8vw, 120px) clamp(20px, 6vw, 92px); border-bottom: 1px solid var(--line); }
  .iam-cms-section-inner { max-width: 1100px; margin: 0 auto; }
  .iam-cms-section h1 { font-size: clamp(42px, 7vw, 88px); letter-spacing: -0.06em; line-height: 0.95; margin: 0 0 18px; }
  .iam-cms-section h2 { font-size: clamp(28px, 4vw, 48px); letter-spacing: -0.04em; margin: 0 0 14px; }
  .iam-cms-section p { color: var(--muted); font-size: clamp(16px, 1.6vw, 20px); line-height: 1.55; max-width: 720px; }
  .iam-cms-section .cta { display: inline-flex; margin-top: 22px; padding: 12px 18px; border-radius: 999px; background: rgba(47,123,255,.2); border: 1px solid rgba(47,123,255,.45); color: #fff; text-decoration: none; font-weight: 700; }
</style>
</head>
<body data-footer-theme="dark" data-route="${route}">
<main class="iam-public-page" data-route="${route}">
${body || '<!-- no visible sections -->'}
</main>
</body>
</html>
`;
}

/**
 * Load sections and assemble pilot storefront HTML into R2.
 * @param {any} env
 * @param {{ page: Record<string, unknown>, r2Binding: any, preferDraft?: boolean }} opts
 */
export async function assembleAndPutIamPilotPage(env, opts) {
  const page = opts?.page || {};
  const route = normalizeCmsRoutePath(page.route_path || `/${page.slug || ''}`);
  if (!isIamAssemblePilotRoute(route)) {
    return { ok: false, skipped: true, reason: 'not_pilot_route' };
  }
  if (!env?.DB || !opts.r2Binding) {
    return { ok: false, error: 'missing_db_or_r2' };
  }

  const pageId = String(page.id || '').trim();
  const { results: sections = [] } = await env.DB.prepare(
    `SELECT id, section_name, section_type, section_data, sort_order, is_visible
       FROM cms_page_sections
      WHERE page_id = ?
      ORDER BY sort_order ASC, section_name ASC`,
  )
    .bind(pageId)
    .all()
    .catch(() => ({ results: [] }));

  const visible = (sections || []).filter(
    (s) => s.is_visible === 1 || s.is_visible === true || s.is_visible == null,
  );
  const sectionHtmls = [];
  const fragKeys = [];

  for (const section of visible.length ? visible : sections || []) {
    const key = slugSeg(section.section_name || section.id, 'section');
    const html = renderIamPilotSectionHtml(section);
    sectionHtmls.push(html);
    const fragKey = iamSectionFragmentKey(page, key);
    fragKeys.push(fragKey);
    await opts.r2Binding.put(fragKey, html, {
      httpMetadata: { contentType: 'text/html; charset=utf-8' },
    });
  }

  const fullHtml = assembleIamPilotPageHtml(page, sectionHtmls);
  const asset = resolveIamStorefrontAssetForPage(page);
  const publishedKey = asset?.r2_key || `pages/${slugSeg(page.slug || route)}/index.html`;
  const draftKey = storefrontAssetDraftKey(publishedKey);

  await opts.r2Binding.put(publishedKey, fullHtml, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
  });
  if (opts.preferDraft) {
    await opts.r2Binding.put(draftKey, fullHtml, {
      httpMetadata: { contentType: 'text/html; charset=utf-8' },
    });
  }

  return {
    ok: true,
    route,
    published_key: publishedKey,
    draft_key: draftKey,
    bucket: IAM_STOREFRONT_BUCKET,
    section_count: sectionHtmls.length,
    fragment_keys: fragKeys,
    bytes: fullHtml.length,
  };
}
