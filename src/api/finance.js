/**
 * API Layer: Finance & Client Operations
 * Handles accounting, spend tracking, client projects, and AI usage billing.
 * Tables: financial_transactions, financial_accounts, finance_transactions,
 *         finance_categories, spend_ledger, clients, projects, invoices,
 *         cursor_usage_log, agent_telemetry
 */
import { jsonResponse }        from '../core/responses.js';
import { getAuthUser }         from '../core/auth.js';

// ─── Spend Helpers ────────────────────────────────────────────────────────────

function normalizeTs(val) {
  if (val == null || val === '') return Math.floor(Date.now() / 1000);
  const n = Number(val);
  if (Number.isFinite(n)) return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  const ms = Date.parse(String(val));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
}

function spendDayUTC(tsSec) {
  const t = Number(tsSec);
  if (!Number.isFinite(t)) return '1970-01-01';
  return new Date(t * 1000).toISOString().slice(0, 10);
}

/**
 * Unified spend rollup across spend_ledger, agent_telemetry, and cursor_usage_log.
 * periodDays=0 means all time. groupKey: 'provider' | 'model' | 'day'
 */
export async function fetchUnifiedSpendGrouped(env, periodDays = 30, groupKey = 'provider') {
  if (!env.DB) return { rows: [], total_cost_usd: 0, period_days: periodDays, group: groupKey };

  const sinceUnix = periodDays > 0 ? Math.floor(Date.now() / 1000) - periodDays * 86400 : null;
  const merged    = [];

  await Promise.allSettled([
    // spend_ledger
    (async () => {
      try {
        const sql = sinceUnix != null
          ? `SELECT provider, model_key AS model, amount_usd AS cost_usd, occurred_at AS ts FROM spend_ledger WHERE occurred_at >= ?`
          : `SELECT provider, model_key AS model, amount_usd AS cost_usd, occurred_at AS ts FROM spend_ledger`;
        const stmt   = sinceUnix != null ? env.DB.prepare(sql).bind(sinceUnix) : env.DB.prepare(sql);
        const { results } = await stmt.all();
        for (const r of results || []) {
          merged.push({ provider: r.provider, model: r.model, cost_usd: r.cost_usd, tokens_in: 0, tokens_out: 0, ts: normalizeTs(r.ts) });
        }
      } catch (_) {}
    })(),

    // agent_telemetry
    (async () => {
      try {
        const sql = sinceUnix != null
          ? `SELECT provider, model_used AS model, computed_cost_usd AS cost_usd, input_tokens AS tokens_in, output_tokens AS tokens_out, created_at AS ts FROM agent_telemetry WHERE computed_cost_usd > 0 AND created_at >= ?`
          : `SELECT provider, model_used AS model, computed_cost_usd AS cost_usd, input_tokens AS tokens_in, output_tokens AS tokens_out, created_at AS ts FROM agent_telemetry WHERE computed_cost_usd > 0`;
        const stmt   = sinceUnix != null ? env.DB.prepare(sql).bind(sinceUnix) : env.DB.prepare(sql);
        const { results } = await stmt.all();
        for (const r of results || []) {
          merged.push({ provider: r.provider || 'unknown', model: r.model, cost_usd: r.cost_usd, tokens_in: r.tokens_in, tokens_out: r.tokens_out, ts: normalizeTs(r.ts) });
        }
      } catch (_) {}
    })(),

    // cursor_usage_log
    (async () => {
      try {
        const sql = sinceUnix != null
          ? `SELECT 'cursor' AS provider, model, estimated_cost_usd AS cost_usd, tokens AS tokens_in, 0 AS tokens_out, created_at AS ts FROM cursor_usage_log WHERE created_at >= ?`
          : `SELECT 'cursor' AS provider, model, estimated_cost_usd AS cost_usd, tokens AS tokens_in, 0 AS tokens_out, created_at AS ts FROM cursor_usage_log`;
        const stmt   = sinceUnix != null ? env.DB.prepare(sql).bind(sinceUnix) : env.DB.prepare(sql);
        const { results } = await stmt.all();
        for (const r of results || []) {
          merged.push({ provider: 'cursor', model: r.model, cost_usd: r.cost_usd, tokens_in: r.tokens_in, tokens_out: 0, ts: normalizeTs(r.ts) });
        }
      } catch (_) {}
    })(),
  ]);

  // Normalize
  for (const row of merged) {
    row.provider  = String(row.provider || 'unknown');
    row.model     = String(row.model    || 'unknown');
    row.cost_usd  = Number(row.cost_usd)  || 0;
    row.tokens_in = Number(row.tokens_in) || 0;
    row.tokens_out = Number(row.tokens_out) || 0;
  }

  const total_cost_usd = merged.reduce((s, r) => s + r.cost_usd, 0);
  const g = (groupKey || 'provider').toLowerCase();
  let rows = [];

  if (g === 'provider') {
    const map = new Map();
    for (const r of merged) {
      const cur = map.get(r.provider) || { provider: r.provider, total_cost_usd: 0, total_tokens_in: 0, total_tokens_out: 0, row_count: 0 };
      cur.total_cost_usd  += r.cost_usd;
      cur.total_tokens_in += r.tokens_in;
      cur.total_tokens_out += r.tokens_out;
      cur.row_count++;
      map.set(r.provider, cur);
    }
    rows = [...map.values()].sort((a, b) => b.total_cost_usd - a.total_cost_usd);

  } else if (g === 'model') {
    const map = new Map();
    for (const r of merged) {
      const cur = map.get(r.model) || { model: r.model, provider: r.provider, total_cost_usd: 0, total_tokens_in: 0, total_tokens_out: 0, row_count: 0, _pspend: {} };
      cur.total_cost_usd  += r.cost_usd;
      cur.total_tokens_in += r.tokens_in;
      cur.total_tokens_out += r.tokens_out;
      cur.row_count++;
      cur._pspend[r.provider] = (cur._pspend[r.provider] || 0) + r.cost_usd;
      map.set(r.model, cur);
    }
    rows = [...map.values()].map(cur => {
      let bestP = 'unknown', bestC = -1;
      for (const [p, c] of Object.entries(cur._pspend)) { if (c > bestC) { bestC = c; bestP = p; } }
      delete cur._pspend;
      cur.provider = bestP;
      return cur;
    }).sort((a, b) => b.total_cost_usd - a.total_cost_usd);

  } else if (g === 'day') {
    const map = new Map();
    for (const r of merged) {
      const day = spendDayUTC(r.ts);
      const cur = map.get(day) || { date: day, total_cost_usd: 0, row_count: 0 };
      cur.total_cost_usd += r.cost_usd;
      cur.row_count++;
      map.set(day, cur);
    }
    rows = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  return { rows, total_cost_usd, period_days: periodDays, group: g };
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

async function handleFinanceSummary(url, env) {
  const safe = p => p.catch(() => null);
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const [
    monthIn, monthOut, techSpend, monthly, byCategory, accounts,
    spendLedgerRow, spendByProvider, aiSpendRow, aiSpendList,
    totalInAllTime, totalOutTxns,
  ] = await Promise.all([
    safe(env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM financial_transactions WHERE transaction_date >= ? AND amount > 0`).bind(monthStart).first()),
    safe(env.DB.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) AS v FROM financial_transactions WHERE transaction_date >= ? AND amount < 0`).bind(monthStart).first()),
    safe(env.DB.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) AS v FROM financial_transactions WHERE transaction_date >= ? AND amount < 0 AND category IN ('tech','subscriptions')`).bind(monthStart).first()),
    safe(env.DB.prepare(`SELECT strftime('%b %Y',transaction_date) AS month, strftime('%Y-%m',transaction_date) AS sort_key, ROUND(SUM(CASE WHEN amount>0 THEN amount ELSE 0 END),2) AS income, ROUND(SUM(CASE WHEN amount<0 THEN ABS(amount) ELSE 0 END),2) AS expenses, ROUND(SUM(amount),2) AS net FROM financial_transactions WHERE transaction_date >= date('now','-6 months') GROUP BY strftime('%Y-%m',transaction_date) ORDER BY sort_key ASC`).all()),
    safe(env.DB.prepare(`SELECT category, ROUND(SUM(ABS(amount)),2) AS amount, COUNT(*) AS count FROM financial_transactions WHERE amount < 0 GROUP BY category ORDER BY amount DESC`).all()),
    safe(env.DB.prepare(`SELECT id, account_name, account_type, bank_name FROM financial_accounts WHERE is_active = 1 ORDER BY id`).all()),
    safe(env.DB.prepare(`SELECT COUNT(*) AS entries, COALESCE(SUM(amount_usd),0) AS total FROM spend_ledger`).first()),
    safe(env.DB.prepare(`SELECT provider, SUM(amount_usd) AS total FROM spend_ledger GROUP BY provider ORDER BY total DESC LIMIT 10`).all()),
    safe(env.DB.prepare(`SELECT COALESCE(SUM(amount_usd),0) AS total, COUNT(*) AS count FROM spend_ledger WHERE provider IS NOT NULL`).first()),
    safe(env.DB.prepare(`SELECT occurred_at, provider_slug, provider, amount_usd, description, notes FROM spend_ledger WHERE provider IS NOT NULL ORDER BY occurred_at DESC LIMIT 50`).all()),
    safe(env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM financial_transactions WHERE amount > 0`).first()),
    safe(env.DB.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) AS v FROM financial_transactions WHERE amount < 0`).first()),
  ]);

  const spendTotal     = Number(spendLedgerRow?.total ?? 0);
  const totalOutAllTime = Number(totalOutTxns?.v ?? 0) + spendTotal;

  return jsonResponse({
    success: true,
    summary:  { month_in: monthIn?.v ?? 0, month_out: monthOut?.v ?? 0, month_net: (monthIn?.v ?? 0) - (monthOut?.v ?? 0), tech_spend: techSpend?.v ?? 0 },
    monthly:  monthly?.results  || [],
    by_category: byCategory?.results || [],
    accounts: accounts?.results || [],
    spend_ledger: { total: spendTotal, entries: Number(spendLedgerRow?.entries ?? 0), by_provider: spendByProvider?.results || [] },
    ai_spend: { total_usd: Number(aiSpendRow?.total ?? 0), count: Number(aiSpendRow?.count ?? 0), rows: aiSpendList?.results || [] },
    financial_health: { total_in_all_time: Number(totalInAllTime?.v ?? 0), total_out_all_time: totalOutAllTime },
  });
}

async function handleFinanceAiSpend(url, env) {
  const periodDays = parseInt(url.searchParams.get('period_days') || '30', 10);
  const groupKey   = url.searchParams.get('group') || 'provider';
  const result     = await fetchUnifiedSpendGrouped(env, periodDays, groupKey);
  return jsonResponse({ success: true, ...result });
}

async function handleFinanceTransactionsList(url, env) {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const { results } = await env.DB.prepare(
    `SELECT id, transaction_date, description, category, amount, account_id, merchant, note
     FROM financial_transactions ORDER BY transaction_date DESC, id DESC LIMIT ?`
  ).bind(limit).all();
  return jsonResponse({ success: true, transactions: results || [] });
}

async function handleFinanceTransactionGet(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM financial_transactions WHERE id = ?`).bind(id).first();
  if (!row) return jsonResponse({ error: 'Not found' }, 404);
  return jsonResponse({ success: true, data: row });
}

async function handleFinanceTransactionCreate(request, env) {
  const body = await request.json().catch(() => ({}));
  const { date, description, category, amount, account_id, note } = body;
  if (!date || !description || amount === undefined) return jsonResponse({ error: 'date, description, amount required' }, 400);
  const id = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await env.DB.prepare(
    `INSERT INTO financial_transactions (transaction_id, transaction_date, description, category, amount, account_id, note, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'complete')`
  ).bind(id, date, description, category || 'other', amount, account_id || null, note || null).run();
  return jsonResponse({ success: true, id });
}

async function handleFinanceTransactionMutate(request, env, id, method) {
  if (method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM financial_transactions WHERE id = ?`).bind(id).run();
    return jsonResponse({ success: true });
  }
  const body    = await request.json().catch(() => ({}));
  const allowed = ['transaction_date', 'description', 'category', 'amount', 'note'];
  const updates = [], bindings = [];
  for (const [k, v] of Object.entries(body)) {
    if (allowed.includes(k)) { updates.push(`${k} = ?`); bindings.push(v); }
  }
  if (!updates.length) return jsonResponse({ success: true });
  bindings.push(id);
  await env.DB.prepare(`UPDATE financial_transactions SET ${updates.join(', ')} WHERE id = ?`).bind(...bindings).run();
  return jsonResponse({ success: true });
}

async function handleFinanceImportCsv(request, env) {
  const { csv, filename } = await request.json().catch(() => ({}));
  if (!csv) return jsonResponse({ error: 'csv required' }, 400);
  const lines = csv.split('\n').filter(Boolean);
  if (lines.length < 2) return jsonResponse({ success: true, imported: 0 });
  let imported = 0;
  const stmt = env.DB.prepare(
    `INSERT OR IGNORE INTO financial_transactions (transaction_id, transaction_date, description, category, amount, status, source_file) VALUES (?, ?, ?, 'other', ?, 'complete', ?)`
  );
  for (const line of lines.slice(1)) {
    const p = line.split(',').map(s => s.trim());
    if (p.length < 3) continue;
    await stmt.bind(`csv_${Date.now()}_${imported}`, p[0], p[1], parseFloat(p[2]), filename || 'import').run();
    imported++;
  }
  return jsonResponse({ success: true, imported });
}

async function handleClientsRequest(request, env) {
  const method = request.method.toUpperCase();
  if (method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT * FROM clients WHERE COALESCE(status,'') != 'merged' ORDER BY name ASC`).all();
    return jsonResponse({ success: true, clients: results || [] });
  }
  if (method === 'POST') {
    const body     = await request.json().catch(() => ({}));
    const clientId = body.id || 'client_' + Math.random().toString(36).slice(2, 10);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO clients (id, name, email, domain, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())`
    ).bind(clientId, body.name, body.email, body.domain, body.status || 'active').run();
    return jsonResponse({ success: true, id: clientId });
  }
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

async function handleProjectsRequest(env) {
  const { results } = await env.DB.prepare(`SELECT * FROM projects ORDER BY priority DESC, name ASC`).all();
  return jsonResponse({ success: true, projects: results || [] });
}

async function handleBillingSummary(env) {
  const { results } = await env.DB.prepare(
    `SELECT i.*, c.name AS client_name FROM invoices i LEFT JOIN clients c ON i.client_id = c.id WHERE i.status = 'paid' ORDER BY i.paid_at DESC`
  ).all();
  const total = (results || []).reduce((a, i) => a + (Number(i.amount) || 0), 0);
  return jsonResponse({ success: true, invoices: results || [], total_collected: total });
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function handleFinanceApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

  try {
    if (path.startsWith('/api/finance')) {
      const sub      = path.slice('/api/finance'.length).replace(/^\//, '');
      const segments = sub.split('/').filter(Boolean);

      if (segments[0] === 'transactions') {
        if (segments[1] && method === 'GET')    return handleFinanceTransactionGet(env, segments[1]);
        if (segments[1] && ['PATCH','PUT','DELETE'].includes(method)) return handleFinanceTransactionMutate(request, env, segments[1], method);
        if (method === 'GET')  return handleFinanceTransactionsList(url, env);
        if (method === 'POST') return handleFinanceTransactionCreate(request, env);
      }
      if (segments[0] === 'summary')    return handleFinanceSummary(url, env);
      if (segments[0] === 'ai-spend')   return handleFinanceAiSpend(url, env);
      if (segments[0] === 'import-csv' && method === 'POST') return handleFinanceImportCsv(request, env);
      if (segments[0] === 'accounts') {
        const { results } = await env.DB.prepare(`SELECT id, account_name, account_type, bank_name FROM financial_accounts WHERE is_active = 1 ORDER BY id`).all();
        return jsonResponse({ success: true, data: results || [] });
      }
      if (segments[0] === 'categories') {
        const { results } = await env.DB.prepare(`SELECT id, name AS category_name, color AS category_color FROM finance_categories LIMIT 100`).all();
        return jsonResponse({ success: true, data: results || [] });
      }
    }

    if (path === '/api/clients')          return handleClientsRequest(request, env);
    if (path === '/api/projects')         return handleProjectsRequest(env);
    if (path === '/api/billing/summary')  return handleBillingSummary(env);

    return jsonResponse({ error: 'Finance route not found', path }, 404);
  } catch (e) {
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}
