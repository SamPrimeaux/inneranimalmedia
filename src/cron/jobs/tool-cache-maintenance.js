const TOOL_CACHE_TTL_DAYS = 14;
const TOOL_CACHE_MAX_ROWS = 5000;

/**
 * `0 1 * * *` — TTL + row cap for agentsam_tool_cache.
 * @param {any} env
 */
export async function runToolCacheMaintenance(env) {
  if (!env?.DB) return { rowsWritten: 0, metadata: {} };

  let rowsWritten = 0;

  const expiredDel = await env.DB.prepare(
    `DELETE FROM agentsam_tool_cache
     WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
     LIMIT 500`,
  )
    .run()
    .catch(() => null);
  rowsWritten += Number(expiredDel?.meta?.changes) || 0;

  const ttlDel = await env.DB.prepare(
    `DELETE FROM agentsam_tool_cache
     WHERE created_at < datetime('now', '-${TOOL_CACHE_TTL_DAYS} days')
     LIMIT 500`,
  )
    .run()
    .catch(() => null);
  rowsWritten += Number(ttlDel?.meta?.changes) || 0;

  const countRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM agentsam_tool_cache`)
    .first()
    .catch(() => null);
  const total = Number(countRow?.n) || 0;
  if (total > TOOL_CACHE_MAX_ROWS) {
    const excess = total - TOOL_CACHE_MAX_ROWS;
    const capDel = await env.DB.prepare(
      `DELETE FROM agentsam_tool_cache
       WHERE id IN (
         SELECT id FROM agentsam_tool_cache
         ORDER BY created_at ASC
         LIMIT ?
       )`,
    )
      .bind(excess)
      .run()
      .catch(() => null);
    rowsWritten += Number(capDel?.meta?.changes) || 0;
  }

  return {
    rowsWritten,
    metadata: {
      ttl_deleted: Number(ttlDel?.meta?.changes) || 0,
      cap_deleted: rowsWritten - (Number(ttlDel?.meta?.changes) || 0),
      rows_after: Math.min(total, TOOL_CACHE_MAX_ROWS),
    },
  };
}
