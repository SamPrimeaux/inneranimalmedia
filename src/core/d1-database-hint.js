/**
 * Parse D1 targeting hints from tool params.
 * Prefer `database` (CF name). Non-UUID database_id/databaseId values are names.
 */

export const D1_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {Record<string, unknown>|null|undefined} params
 * @returns {{
 *   database_id: string|null,
 *   database_name: string|null,
 *   binding: string|null,
 *   via_workspace_slug_alias?: boolean,
 * }|null}
 */
export function parseD1DatabaseHint(params) {
  const p = params && typeof params === 'object' ? params : {};
  const resourceRef = String(p.resource_ref || p.resourceRef || '').trim();
  const resourceLooksLikeId = D1_UUID_RE.test(resourceRef);
  const rawIdField = String(p.database_id || p.databaseId || '').trim();
  const idFieldIsUuid = D1_UUID_RE.test(rawIdField);
  // Models often put the CF database name in databaseId — never send that to the UUID endpoint.
  const directId = idFieldIsUuid ? rawIdField : resourceLooksLikeId ? resourceRef : '';
  const nameFromMisplacedId = rawIdField && !idFieldIsUuid ? rawIdField : '';
  const directName = String(
    p.database ||
      p.database_name ||
      p.databaseName ||
      nameFromMisplacedId ||
      (!resourceLooksLikeId ? resourceRef : ''),
  ).trim();
  if (directId || directName) {
    return { database_id: directId || null, database_name: directName || null, binding: null };
  }
  // Deprecated silent alias — do not advertise; still accept so old callers don't hard-break.
  const legacySlug = String(p.workspace_slug || p.workspaceSlug || '').trim();
  if (legacySlug) {
    return {
      database_id: null,
      database_name: legacySlug,
      binding: null,
      via_workspace_slug_alias: true,
    };
  }
  let raw = p.d1_databases;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      const m = String(raw).match(/database_id["'\s:]+\s*["']?([0-9a-f-]{36})/i);
      if (m?.[1]) {
        const nameM = String(p.d1_databases || raw).match(
          /database_name["'\s:]+\s*["']?([^"',\]]+)/i,
        );
        return {
          database_id: m[1],
          database_name: nameM?.[1]?.trim() || null,
          binding: null,
        };
      }
    }
  }
  if (Array.isArray(raw) && raw[0] && typeof raw[0] === 'object') {
    return {
      database_id: String(raw[0].database_id || '').trim() || null,
      database_name: String(raw[0].database_name || '').trim() || null,
      binding: String(raw[0].binding || '').trim() || null,
    };
  }
  return null;
}
