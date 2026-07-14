/**
 * CMS section_data editor helpers — D1 typed fields only; markup lives on R2.
 */

export const CMS_SECTION_INJECT_META_KEYS = new Set([
  'r2_key',
  'r2_bucket',
  'public_url',
  'html_source',
  'inject_position',
  'content_sha256',
  'updated_at',
  'full_page_document',
  'zone',
  'raw',
  'role',
]);

const BLOB_KEYS = new Set(['html', 'css', 'js', 'body_html', 'content_html']);

/**
 * @param {unknown} data
 * @param {{ maxDepth?: number }} [opts]
 * @returns {Array<{ path: string, label: string, value: string, kind: 'scalar' | 'json' }>}
 */
export function flattenSectionDataForEditor(data, opts = {}) {
  const maxDepth = Number(opts.maxDepth ?? 3);
  const rows = [];
  const root = data && typeof data === 'object' ? data : {};

  /** @param {Record<string, unknown>} obj @param {string} prefix @param {number} depth */
  const walk = (obj, prefix, depth) => {
    for (const [k, v] of Object.entries(obj)) {
      if (CMS_SECTION_INJECT_META_KEYS.has(k) || BLOB_KEYS.has(k)) continue;
      const path = prefix ? `${prefix}.${k}` : k;
      if (v == null) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        rows.push({
          path,
          label: path.replace(/\./g, ' · ').replace(/_/g, ' '),
          value: String(v),
          kind: 'scalar',
        });
        continue;
      }
      if (Array.isArray(v)) {
        rows.push({
          path,
          label: path.replace(/\./g, ' · '),
          value: JSON.stringify(v, null, 2),
          kind: 'json',
        });
        continue;
      }
      if (typeof v === 'object' && depth < maxDepth) {
        walk(/** @type {Record<string, unknown>} */ (v), path, depth + 1);
      }
    }
  };

  walk(/** @type {Record<string, unknown>} */ (root), '', 0);
  return rows;
}

/**
 * @param {Record<string, unknown>} base
 * @param {Record<string, string>} edits path → value
 */
export function applyEditorFieldValues(base, edits) {
  const out = JSON.parse(JSON.stringify(base || {}));
  for (const [path, raw] of Object.entries(edits || {})) {
    if (!path) continue;
    const parts = path.split('.');
    let cursor = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cursor[p] || typeof cursor[p] !== 'object' || Array.isArray(cursor[p])) {
        cursor[p] = {};
      }
      cursor = cursor[p];
    }
    const leaf = parts[parts.length - 1];
    const existing = cursor[leaf];
    if (Array.isArray(existing) || (existing && typeof existing === 'object')) {
      try {
        cursor[leaf] = JSON.parse(raw);
      } catch {
        cursor[leaf] = raw;
      }
    } else {
      cursor[leaf] = raw;
    }
  }
  return out;
}

/**
 * Extract editable copy markers from R2 fragment HTML.
 * @param {string} html
 * @returns {Array<{ path: string, label: string, value: string, kind: 'fragment' }>}
 */
export function extractCmsFieldMarkersFromHtml(html) {
  const raw = String(html || '');
  if (!raw.trim()) return [];
  const rows = [];
  const seen = new Set();
  const re =
    /<([a-z][a-z0-9]*)[^>]*\sdata-cms-(?:field|editable)=["']([^"']+)["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(raw))) {
    const path = String(m[2] || '').trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const value = String(m[3] || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    rows.push({
      path: `fragment.${path}`,
      label: `Fragment · ${path.replace(/_/g, ' ')}`,
      value,
      kind: 'fragment',
    });
  }
  return rows;
}

/**
 * Apply fragment field edits back into HTML (data-cms-field markers).
 * @param {string} html
 * @param {Record<string, string>} fragmentEdits keys without fragment. prefix
 */
export function applyCmsFieldValuesToHtml(html, fragmentEdits) {
  let out = String(html || '');
  for (const [field, value] of Object.entries(fragmentEdits || {})) {
    if (!field) continue;
    const esc = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      `(<[a-z][a-z0-9]*[^>]*\\sdata-cms-(?:field|editable)=["']${esc}["'][^>]*>)([\\s\\S]*?)(</[a-z][a-z0-9]*>)`,
      'i',
    );
    out = out.replace(re, `$1${String(value ?? '')}$3`);
  }
  return out;
}

/**
 * Strip markup blobs from section_data before D1 write.
 * @param {Record<string, unknown>} data
 */
export function normalizeSectionDataForWrite(data) {
  const out = { ...(data || {}) };
  for (const k of BLOB_KEYS) delete out[k];
  return out;
}
