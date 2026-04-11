/**
 * API: CI/CD Pipeline
 * User-facing routes for viewing and triggering CI/CD pipeline runs.
 * Auth: required on all routes.
 * Routes: /api/cicd/*
 */

import { getAuthUser } from '../core/auth.js';
import { jsonResponse } from '../core/responses.js';
import { handleMcpApi } from './mcp.js';

export async function handleCicdApi(request, url, env, ctx) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

  const path   = url.pathname.toLowerCase().replace(/\/$/, '');
  const method = request.method.toUpperCase();

  // ── GET /api/cicd/current ─────────────────────────────────────────────────
  if (path === '/api/cicd/current' && method === 'GET') {
    const row = await env.DB.prepare(
      `SELECT * FROM cicd_pipeline_runs
       ORDER BY triggered_at DESC LIMIT 1`
    ).first();
    return jsonResponse({ cicd_run: row || null });
  }

  // ── GET /api/cicd/runs ────────────────────────────────────────────────────
  if (path === '/api/cicd/runs' && method === 'GET') {
    const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '20', 10) || 20);

    const runs = await env.DB.prepare(
      `SELECT run_id, env, status, branch, commit_hash,
              triggered_at, completed_at, notes
       FROM cicd_pipeline_runs
       ORDER BY triggered_at DESC LIMIT ?`
    ).bind(limit).all();

    const runIds = (runs.results || []).map(r => r.run_id);
    let steps = [];

    if (runIds.length > 0) {
      const placeholders = runIds.map(() => '?').join(',');
      const res = await env.DB.prepare(
        `SELECT id, run_id, tool_name, test_type, status,
                latency_ms, http_status, error, tested_at
         FROM cicd_run_steps
         WHERE run_id IN (${placeholders})
         ORDER BY tested_at ASC`
      ).bind(...runIds).all();
      steps = res.results || [];
    }

    const grouped = (runs.results || []).map(run => ({
      ...run,
      tests: steps.filter(s => s.run_id === run.run_id),
    }));

    return jsonResponse(grouped);
  }

  // ── POST /api/cicd/run ────────────────────────────────────────────────────
  if (path === '/api/cicd/run' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (_) {}

    const envName     = body.env === 'sandbox' ? 'sandbox' : 'production';
    const sandboxBase = env.SANDBOX_ORIGIN || 'https://inneranimal-dashboard.meauxbility.workers.dev';
    const runId       = crypto.randomUUID();
    const cookie      = request.headers.get('cookie') || '';

    await env.DB.prepare(
      `INSERT INTO cicd_pipeline_runs
         (run_id, env, status, branch, triggered_at)
       VALUES (?, ?, 'running', 'main', datetime('now'))`
    ).bind(runId, envName).run();

    // ── Test helpers ────────────────────────────────────────────────────────
    const fetchMcpStatus = async () => {
      if (envName === 'sandbox') {
        const r = await fetch(`${sandboxBase}/api/mcp/status`);
        return { r, json: await r.json().catch(() => ({})) };
      }
      const req = new Request(`${env.IAM_ORIGIN || 'https://inneranimalmedia.com'}/api/mcp/status`);
      const r   = await handleMcpApi(req, new URL(req.url), env, ctx);
      return { r, json: await r.json().catch(() => ({})) };
    };

    const fetchMcpInvoke = async (toolName, params = {}) => {
      const invokeBody = JSON.stringify({ tool_name: toolName, params });
      if (envName === 'sandbox') {
        const r = await fetch(`${sandboxBase}/api/mcp/invoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie },
          body: invokeBody,
        });
        return { r, json: await r.json().catch(() => ({})) };
      }
      const req = new Request(
        `${env.IAM_ORIGIN || 'https://inneranimalmedia.com'}/api/mcp/invoke`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: invokeBody }
      );
      const r = await handleMcpApi(req, new URL(req.url), env, ctx);
      return { r, json: await r.json().catch(() => ({})) };
    };

    // ── Test suite ──────────────────────────────────────────────────────────
    const tests = [
      {
        tool_name: 'mcp_status',
        test_type: 'route',
        run: async () => {
          const start      = Date.now();
          const { r, json } = await fetchMcpStatus();
          const pass       = r.ok && json.ok === true;
          return {
            status:           pass ? 'pass' : 'fail',
            latency_ms:       Date.now() - start,
            http_status:      r.status,
            response_preview: JSON.stringify(json).slice(0, 200),
            error:            pass ? null : 'unexpected response',
          };
        },
      },
      {
        tool_name: 'github_repos',
        test_type: 'invoke',
        run: async () => {
          const start      = Date.now();
          const { r, json } = await fetchMcpInvoke('github_repos');
          const pass       = r.ok && json.result !== undefined && !json.result?.error;
          return {
            status:           pass ? 'pass' : 'fail',
            latency_ms:       Date.now() - start,
            http_status:      r.status,
            response_preview: JSON.stringify(json.result).slice(0, 200),
            error:            pass ? null : (json.result?.error || 'unexpected response'),
          };
        },
      },
      {
        tool_name: 'd1_deploy_record',
        test_type: 'd1',
        run: async () => {
          const start = Date.now();
          const row   = await env.DB.prepare(
            `SELECT id FROM deployments ORDER BY created_at DESC LIMIT 1`
          ).first().catch(() => null);
          return {
            status:           row ? 'pass' : 'fail',
            latency_ms:       Date.now() - start,
            http_status:      200,
            response_preview: row ? `latest: ${row.id}` : 'no rows',
            error:            row ? null : 'no deploy records found',
          };
        },
      },
    ];

    // ── Run tests ───────────────────────────────────────────────────────────
    const results = [];
    for (const test of tests) {
      try {
        const r = await test.run();
        results.push({ tool_name: test.tool_name, test_type: test.test_type, ...r });
      } catch (err) {
        results.push({
          tool_name:        test.tool_name,
          test_type:        test.test_type,
          status:           'fail',
          latency_ms:       0,
          http_status:      0,
          response_preview: null,
          error:            err.message,
        });
      }
    }

    const stmt = env.DB.prepare(
      `INSERT INTO cicd_run_steps
         (id, run_id, tool_name, test_type, status, latency_ms,
          http_status, error, response_preview, tested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    await env.DB.batch(
      results.map(r => stmt.bind(
        crypto.randomUUID(), runId,
        r.tool_name, r.test_type, r.status,
        r.latency_ms, r.http_status,
        r.error || null, r.response_preview || null
      ))
    );

    const allPassed = results.every(r => r.status === 'pass');
    await env.DB.prepare(
      `UPDATE cicd_pipeline_runs
       SET status = ?, completed_at = datetime('now')
       WHERE run_id = ?`
    ).bind(allPassed ? 'passed' : 'failed', runId).run();

    return jsonResponse({ run_id: runId, status: allPassed ? 'passed' : 'failed', results });
  }

  return jsonResponse({ error: 'Route not found' }, 404);
}
