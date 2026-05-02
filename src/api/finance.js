/**
 * API Service: Finance & Client Operations
 * Handles accounting, spend tracking, client projects, and AI usage billing.
 * Deconstructed from legacy worker.js.
 */
import { getAuthUser, jsonResponse } from '../core/auth.js';

/**
 * Main dispatcher for Finance-related API routes (/api/finance/*, /api/clients, /api/projects, /api/billing/*).
 */
export async function handleFinanceApi(request, url, env, ctx) {
    const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    try {
        // ── /api/finance Dispatcher ──
        if (pathLower.startsWith('/api/finance')) {
            const subPath = pathLower.slice('/api/finance/'.length);
            const segments = subPath.split('/').filter(Boolean);

            if (segments[0] === 'transactions') {
                if (segments[1] && method === 'GET') return handleFinanceTransactionGet(env, segments[1]);
                if (segments[1] && (method === 'PATCH' || method === 'PUT' || method === 'DELETE')) {
                    return handleFinanceTransactionMutate(request, env, segments[1], method);
                }
                if (method === 'GET') return handleFinanceTransactionsList(url, env);
                if (method === 'POST') return handleFinanceTransactionCreate(request, env);
            }

            if (segments[0] === 'summary') return handleFinanceSummary(url, env);
            if (segments[0] === 'health') return handleFinanceHealth(env);
            if (segments[0] === 'breakdown') return handleFinanceBreakdown(url, env);
            if (segments[0] === 'categories') return handleFinanceCategories(env);
            if (segments[0] === 'accounts') return handleFinanceAccounts(env);
            if (segments[0] === 'ai-spend') return handleFinanceAiSpend(url, env);
            if (segments[0] === 'import-csv' && method === 'POST') return handleFinanceImportCsv(request, env);
        }

        // ── /api/clients ──
        if (pathLower === '/api/clients') return handleClientsRequest(request, url, env);

        // ── /api/projects ──
        if (pathLower === '/api/projects') return handleProjectsRequest(request, url, env);

        // ── /api/billing ──
        if (pathLower === '/api/billing/summary') return handleBillingSummary(env);

        return jsonResponse({ error: 'Finance route not found' }, 404);
    } catch (e) {
        return jsonResponse({ error: String(e.message || e) }, 500);
    }
}

// --- Implementation Handlers ---

async function handleFinanceSummary(url, env) {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));

    const [
        monthIn, monthOut, techSpend, monthly, byCategory, accounts,
        spendLedgerRow, spendByProvider, aiSpendRow, aiSpendList,
        totalInAllTime, totalOutTxns
    ] = await Promise.all([
        safe(env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM financial_transactions WHERE transaction_date >= ? AND amount > 0`).bind(monthStart).first()),
        safe(env.DB.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) as v FROM financial_transactions WHERE transaction_date >= ? AND amount < 0`).bind(monthStart).first()),
        safe(env.DB.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) as v FROM financial_transactions WHERE transaction_date >= ? AND amount < 0 AND (category = 'tech' OR category = 'subscriptions')`).bind(monthStart).first()),
        safe(env.DB.prepare(`
          SELECT strftime('%b %Y', transaction_date) as month,
            strftime('%Y-%m', transaction_date) as sort_key,
            ROUND(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END),2) as income,
            ROUND(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END),2) as expenses,
            ROUND(SUM(amount),2) as net
          FROM financial_transactions
          WHERE transaction_date >= date('now','-6 months')
          GROUP BY strftime('%Y-%m', transaction_date)
          ORDER BY sort_key ASC
        `).all()),
        safe(env.DB.prepare(`
          SELECT category, ROUND(SUM(ABS(amount)),2) as amount, COUNT(*) as count FROM financial_transactions WHERE amount < 0 GROUP BY category ORDER BY amount DESC
        `).all()),
        safe(env.DB.prepare(`SELECT id, account_name, account_type, bank_name, entity_type FROM financial_accounts WHERE is_active = 1 ORDER BY id`).all()),
        safe(env.DB.prepare(`SELECT COUNT(*) as entries, COALESCE(SUM(amount_usd), 0) as total FROM spend_ledger`).first()),
        safe(env.DB.prepare(`SELECT provider, SUM(amount_usd) as total FROM spend_ledger GROUP BY provider ORDER BY total DESC LIMIT 10`).all()),
        safe(env.DB.prepare(`SELECT COALESCE(SUM(amount_usd),0) as total, COUNT(*) as count FROM spend_ledger WHERE category IN ('ai_tools','usage') OR provider IS NOT NULL`).first()),
        safe(env.DB.prepare(`SELECT occurred_at, provider_slug, provider, amount_usd, description, notes FROM spend_ledger WHERE category IN ('ai_tools','usage') OR provider IS NOT NULL ORDER BY occurred_at DESC LIMIT 50`).all()),
        safe(env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM financial_transactions WHERE amount > 0`).first()),
        safe(env.DB.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) as v FROM financial_transactions WHERE amount < 0`).first()),
    ]);

    const spendTotal = Number(spendLedgerRow?.total ?? 0);
    const totalOutAllTime = (Number(totalOutTxns?.v ?? 0)) + spendTotal;

    return jsonResponse({
        success: true,
        summary: {
            month_in: monthIn?.v ?? 0,
            month_out: monthOut?.v ?? 0,
            month_net: (monthIn?.v ?? 0) - (monthOut?.v ?? 0),
            tech_spend: techSpend?.v ?? 0,
        },
        monthly: (monthly?.results || []),
        by_category: (byCategory?.results || []),
        accounts: (accounts?.results || []),
        spend_ledger: {
            total: spendTotal,
            entries: Number(spendLedgerRow?.entries ?? 0),
            by_provider: (spendByProvider?.results || []),
        },
        ai_spend: {
            total_usd: Number(aiSpendRow?.total ?? 0),
            count: Number(aiSpendRow?.count ?? 0),
            rows: (aiSpendList?.results || []),
        },
        financial_health: {
            total_in_all_time: Number(totalInAllTime?.v ?? 0),
            total_out_all_time: totalOutAllTime,
        },
    });
}

async function handleFinanceHealth(env) {
    const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
    const [inRow, outRow, spendRow] = await Promise.all([
        safe(env.DB.prepare(`SELECT COALESCE(SUM(amount_cents),0)/100.0 as total FROM finance_transactions WHERE direction = 'credit' OR transaction_type = 'credit'`).first()),
        safe(env.DB.prepare(`SELECT COALESCE(SUM(amount_cents),0)/100.0 as total FROM finance_transactions WHERE direction = 'debit' OR transaction_type = 'debit'`).first()),
        safe(env.DB.prepare(`SELECT COALESCE(SUM(amount_usd),0) as total FROM spend_ledger`).first()),
    ]);
    return jsonResponse({
        success: true,
        total_in_all_time: Number(inRow?.total ?? 0),
        total_out_all_time: Number(outRow?.total ?? 0) + Number(spendRow?.total ?? 0),
    });
}

async function handleFinanceBreakdown(url, env) {
    const month = url.searchParams.get('month') || '';
    const monthStart = month ? `date('${month}-01')` : `date('1900-01-01')`;
    const monthEnd = month ? `date('${month}-01','+1 month','-1 day')` : `date('now','+1 year')`;
    const { results } = await env.DB.prepare(
        `SELECT COALESCE(category, 'Uncategorized') as category_name, direction, SUM(amount_cents)/100.0 as total FROM finance_transactions WHERE date >= ${monthStart} AND date <= ${monthEnd} GROUP BY category, direction`
    ).all();
    return jsonResponse({ success: true, data: results || [] });
}

async function handleFinanceCategories(env) {
    const { results } = await env.DB.prepare(`SELECT id, name as category_name, color as category_color FROM finance_categories LIMIT 100`).all();
    return jsonResponse({ success: true, data: results || [] });
}

async function handleFinanceAccounts(env) {
    const { results } = await env.DB.prepare(`SELECT id, name as display_name, email FROM financial_accounts LIMIT 100`).all();
    return jsonResponse({ success: true, data: results || [] });
}

async function handleFinanceAiSpend(url, env) {
    const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
    const [summary, list] = await Promise.all([
        safe(env.DB.prepare(`SELECT COALESCE(SUM(amount_usd),0) as total, COUNT(*) as count FROM spend_ledger WHERE category IN ('ai_tools','usage') OR provider IS NOT NULL`).first()),
        safe(env.DB.prepare(`SELECT occurred_at, provider_slug, amount_usd, description, notes FROM spend_ledger WHERE category IN ('ai_tools','usage') OR provider IS NOT NULL ORDER BY occurred_at DESC LIMIT 100`).all()),
    ]);
    return jsonResponse({
        success: true,
        total_usd: Number(summary?.total ?? 0),
        count: Number(summary?.count ?? 0),
        rows: list?.results || [],
    });
}

async function handleFinanceTransactionsList(url, env) {
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const { results } = await env.DB.prepare(`
        SELECT id, transaction_date, description, category, amount, account_id, merchant, note
        FROM financial_transactions ORDER BY transaction_date DESC, id DESC LIMIT ?
    `).bind(limit).all();
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
    if (!date || !description || amount === undefined) return jsonResponse({ error: 'Missing required fields' }, 400);
    
    const id = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await env.DB.prepare(`
        INSERT INTO financial_transactions (transaction_id, transaction_date, description, category, amount, account_id, note, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'complete')
    `).bind(id, date, description, category || 'other', amount, account_id || 5, note || null).run();
    return jsonResponse({ success: true, id });
}

async function handleFinanceTransactionMutate(request, env, id, method) {
    if (method === 'DELETE') {
        await env.DB.prepare(`DELETE FROM financial_transactions WHERE id = ?`).bind(id).run();
        return jsonResponse({ success: true });
    }
    const body = await request.json().catch(() => ({}));
    const updates = [];
    const bindings = [];
    for (const [k, v] of Object.entries(body)) {
        if (['transaction_date', 'description', 'category', 'amount', 'note'].includes(k)) {
            updates.push(`${k} = ?`);
            bindings.push(v);
        }
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
    // Minimal parser (fallback to generic logic)
    let imported = 0;
    const stmt = env.DB.prepare(`INSERT OR IGNORE INTO financial_transactions (transaction_id, transaction_date, description, category, amount, status, source_file) VALUES (?, ?, ?, 'other', ?, 'complete', ?)`);
    for (const line of lines.slice(1)) {
        const p = line.split(',').map(s => s.trim());
        if (p.length < 3) continue;
        await stmt.bind(`csv_${Date.now()}_${imported}`, p[0], p[1], parseFloat(p[2]), filename || 'import').run();
        imported++;
    }
    return jsonResponse({ success: true, imported });
}

async function handleClientsRequest(request, url, env) {
    const method = request.method;
    if (method === 'GET') {
        const { results } = await env.DB.prepare(`SELECT * FROM clients WHERE COALESCE(status, '') != 'merged' ORDER BY name ASC`).all();
        return jsonResponse({ success: true, clients: results || [] });
    }
    if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const clientId = body.id || 'client_' + Math.random().toString(36).slice(2, 10);
        await env.DB.prepare(`INSERT OR REPLACE INTO clients (id, name, email, domain, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())`)
            .bind(clientId, body.name, body.email, body.domain, body.status || 'active').run();
        return jsonResponse({ success: true, id: clientId });
    }
    return jsonResponse({ error: 'Method not allowed' }, 405);
}

async function handleProjectsRequest(request, url, env) {
    const { results } = await env.DB.prepare(`SELECT * FROM projects ORDER BY priority DESC, name ASC`).all();
    return jsonResponse({ success: true, projects: results || [] });
}

async function handleBillingSummary(env) {
    const { results } = await env.DB.prepare(`SELECT i.*, c.name as client_name FROM invoices i LEFT JOIN clients c ON i.client_id = c.id WHERE i.status = 'paid' ORDER BY i.paid_at DESC`).all();
    const total = (results || []).reduce((a, i) => a + (Number(i.amount) || 0), 0);
    return jsonResponse({ success: true, invoices: results || [], total_collected: total });
}
