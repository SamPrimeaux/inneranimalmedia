/**
 * CMS liquid import queue consumer (M3 stub — BROWSER_SESSION wiring deferred).
 * Enqueues from POST /api/cms/liquid-imports and POST /api/cms/conversions.
 */

/**
 * @param {any} env
 * @param {Record<string, unknown>} body
 */
export async function handleCmsLiquidImportQueueJob(env, body) {
  const importId = String(body.import_id || body.conversion_id || '').trim();
  const tenantId = String(body.tenant_id || '').trim();
  if (!env?.DB || !importId) {
    return { ok: false, error: 'missing_db_or_import_id' };
  }

  const browserBinding = env.BROWSER_SESSION || env.AGENT_BROWSER;
  if (!browserBinding) {
    const err = 'BROWSER_SESSION binding unavailable — liquid section screenshots deferred (see INTEGRATION.md Step 7)';
    if (body.import_id) {
      await env.DB.prepare(
        `UPDATE cms_liquid_imports SET status = 'failed', error_log = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(err, Math.floor(Date.now() / 1000), importId)
        .run()
        .catch(() => {});
    }
    if (body.conversion_id) {
      await env.DB.prepare(
        `UPDATE cms_conversions SET status = 'failed', error_message = ? WHERE id = ?`,
      )
        .bind(err, importId)
        .run()
        .catch(() => {});
    }
    return { ok: false, error: err, stub: true };
  }

  await env.DB.prepare(
    `UPDATE cms_liquid_imports SET status = 'processing', updated_at = ? WHERE id = ?`,
  )
    .bind(Math.floor(Date.now() / 1000), importId)
    .run()
    .catch(() => {});

  await env.DB.prepare(
    `INSERT INTO cms_liquid_sections
     (id, tenant_id, import_id, section_key, section_name, parse_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'queued', datetime('now'), datetime('now'))`,
  )
    .bind(
      `lsec_${Date.now().toString(36)}`,
      tenantId || 'unknown',
      importId,
      'import_queue_stub',
      'Queue stub section',
    )
    .run()
    .catch(() => {});

  await env.DB.prepare(
    `UPDATE cms_liquid_imports SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), importId)
    .run()
    .catch(() => {});

  return { ok: true, import_id: importId, stub: true, note: 'browser binding present but full CDP pipeline not wired in M3' };
}
