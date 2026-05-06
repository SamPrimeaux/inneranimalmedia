export async function runSpendLedgerRollup(env) {
  if (!env?.DB) return;
  const now = Math.floor(Date.now() / 1000);
  const currentMonth = new Date().toISOString().slice(0, 7);

  const { results: months = [] } = await env.DB.prepare(
    `SELECT
      tenant_id, workspace_id, brand_id, provider, provider_slug,
      strftime('%Y-%m', occurred_at, 'unixepoch') as month,
      COUNT(*) as row_count,
      ROUND(SUM(amount_usd), 6) as total_usd,
      SUM(tokens_in) as tokens_in,
      SUM(tokens_out) as tokens_out
    FROM spend_ledger
    WHERE strftime('%Y-%m', occurred_at, 'unixepoch') < ?
    GROUP BY tenant_id, provider, month`
  ).bind(currentMonth).all();

  if (!months.length) {
    console.log('[rollup] No completed months to roll up.');
    return;
  }

  for (const row of months) {
    const id = `slr_${row.tenant_id}_${row.provider}_${row.month}`.replace(/[^a-z0-9_]/gi, '_');
    await env.DB.prepare(
      `INSERT INTO spend_ledger_monthly_rollup
        (id, tenant_id, workspace_id, brand_id, provider, provider_slug, month,
         row_count, total_usd, tokens_in, tokens_out, source_deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(tenant_id, provider, month) DO UPDATE SET
        row_count = excluded.row_count,
        total_usd = excluded.total_usd,
        tokens_in = excluded.tokens_in,
        tokens_out = excluded.tokens_out,
        updated_at = excluded.updated_at`
    ).bind(
      id,
      row.tenant_id,
      row.workspace_id,
      row.brand_id,
      row.provider,
      row.provider_slug,
      row.month,
      row.row_count,
      row.total_usd,
      row.tokens_in,
      row.tokens_out,
      now,
      now
    ).run();
  }

  await env.DB.prepare(
    `DELETE FROM spend_ledger
    WHERE strftime('%Y-%m', occurred_at, 'unixepoch') < ?
      AND source = 'api_direct'`
  ).bind(currentMonth).run();

  await env.DB.prepare(
    `UPDATE spend_ledger_monthly_rollup
     SET source_deleted = 1, updated_at = ?
     WHERE month < ?`
  ).bind(now, currentMonth).run();

  console.log(`[rollup] Completed. ${months.length} provider/month combos rolled up.`);
}
