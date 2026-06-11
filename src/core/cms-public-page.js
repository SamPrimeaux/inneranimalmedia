/**
 * Public marketing page CMS reads (cms_pages + cms_page_sections).
 * Used at Worker request time to hydrate static R2 shells without republishing HTML.
 */

function parseSectionData(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} routePath e.g. '/contact'
 */
export async function loadPublishedCmsSectionsByRoute(db, routePath) {
  if (!db) return { page: null, sections: [] };
  const route = String(routePath || '').trim() || '/';
  const page = await db
    .prepare(
      `SELECT id, route_path, slug, title, status, page_type, r2_key
       FROM cms_pages
       WHERE route_path = ? AND status = 'published' AND COALESCE(is_active, 1) = 1
       LIMIT 1`,
    )
    .bind(route)
    .first()
    .catch(() => null);
  if (!page?.id) return { page: null, sections: [] };

  const { results } = await db
    .prepare(
      `SELECT id, section_type, section_name, section_data, sort_order, is_visible
       FROM cms_page_sections
       WHERE page_id = ? AND COALESCE(is_visible, 1) = 1
       ORDER BY sort_order ASC, section_name ASC`,
    )
    .bind(page.id)
    .all()
    .catch(() => ({ results: [] }));

  const sections = (Array.isArray(results) ? results : []).map((row) => ({
    ...row,
    section_data: parseSectionData(row.section_data),
  }));
  return { page, sections };
}

/** Build a lookup: section_type → section_data (first match), section_type/name → data */
export function indexCmsSections(sections) {
  const byType = {};
  const byKey = {};
  for (const row of sections || []) {
    const data = row.section_data || {};
    if (!byType[row.section_type]) byType[row.section_type] = data;
    const key = `${row.section_type}:${row.section_name}`;
    byKey[key] = data;
  }
  return { byType, byKey };
}

export function cmsSection(byKey, byType, type, name, fallback = {}) {
  if (name && byKey[`${type}:${name}`]) return { ...fallback, ...byKey[`${type}:${name}`] };
  if (byType[type]) return { ...fallback, ...byType[type] };
  return { ...fallback };
}
