#!/usr/bin/env node
/**
 * Post-deploy smoke: health check + semantic_search_log via Postgres RPC (when SUPABASE_DB_URL set).
 * Writes .deploy-eval-results.json for record-supabase-deploy-complete.mjs
 *
 * DEPLOY_SMOKE_BASE_URL → health target + artifacts_json.smoke_base_url + semantic RPC metadata.base_url;
 * merged into build_deploy_events.metadata_jsonb / workflow output via complete script.
 * See docs/DEPLOY_ENV_SUPABASE_MAPPING.md.
 */
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';
import { repoRoot, DEPLOY_CONTEXT_FILE } from './lib/supabase-deploy-paths.mjs';

async function healthCheck(url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { redirect: 'follow' });
    const ok = r.ok;
    return { ok, latency_ms: Date.now() - t0, status: r.status };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - t0, error: String(e?.message || e) };
  }
}

async function logSemanticSearchPg(client, args) {
  const {
    searchFn,
    tenantId,
    sessionId,
    queryPreview,
    matchThreshold,
    matchCountRequested,
    matchCountReturned,
    topSimilarity,
    avgSimilarity,
    sourcesHit,
    latencyMs,
    metadata,
  } = args;
  await client.query(
    `SELECT public.log_semantic_search(
      $1::text, $2::text, $3::text, $4::text,
      $5::double precision, $6::integer, $7::integer,
      $8::double precision, $9::double precision,
      $10::jsonb, $11::integer, $12::jsonb
    )`,
    [
      searchFn,
      tenantId ?? null,
      sessionId ?? null,
      String(queryPreview ?? '').slice(0, 500),
      matchThreshold,
      matchCountRequested,
      matchCountReturned,
      topSimilarity ?? null,
      avgSimilarity ?? null,
      JSON.stringify(Array.isArray(sourcesHit) ? sourcesHit : []),
      Math.max(0, Math.floor(latencyMs ?? 0)),
      JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {}),
    ],
  );
}

async function main() {
  const root = repoRoot();
  const tStart = Date.now();
  let tenantId = process.env.TENANT_ID?.trim() || '';
  let workspaceId = process.env.WORKSPACE_ID?.trim() || '';

  const ctxPath = resolve(root, DEPLOY_CONTEXT_FILE);
  if (existsSync(ctxPath)) {
    try {
      const c = JSON.parse(readFileSync(ctxPath, 'utf8'));
      tenantId = tenantId || c.tenant_id || '';
      workspaceId = workspaceId || c.workspace_id || '';
    } catch {
      /* ignore */
    }
  }

  const baseUrl = (
    process.env.DEPLOY_SMOKE_BASE_URL || 'https://inneranimalmedia.com'
  ).replace(/\/$/, '');
  const healthUrl = `${baseUrl}/api/health`;

  const h = await healthCheck(healthUrl);

  let semanticOk = false;
  let semanticErr = null;
  const dbUrl = (process.env.SUPABASE_DB_URL || '').trim();

  if (dbUrl && tenantId) {
    const client = new pg.Client({
      connectionString: dbUrl,
      ssl: dbUrl.includes('localhost') ? undefined : { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      await logSemanticSearchPg(client, {
        searchFn: 'deploy_smoke_match_documents_scoped',
        tenantId,
        sessionId: `deploy_${Date.now()}`,
        queryPreview: 'deploy validation semantic log',
        matchThreshold: 0.35,
        matchCountRequested: 5,
        matchCountReturned: 0,
        topSimilarity: null,
        avgSimilarity: null,
        sourcesHit: [],
        latencyMs: 0,
        metadata: {
          workspace_id: workspaceId || null,
          phase: 'deploy_eval',
          base_url: baseUrl,
        },
      });
      semanticOk = true;
    } catch (e) {
      semanticErr = String(e?.message || e);
    } finally {
      await client.end().catch(() => {});
    }
  } else {
    semanticErr = dbUrl ? 'missing tenant_id for semantic smoke' : 'SUPABASE_DB_URL unset';
  }

  const semanticRequired = Boolean(dbUrl && tenantId);
  const overall = Boolean(h.ok && (!semanticRequired || semanticOk));
  const out = {
    overall_success: overall,
    health_ok: h.ok,
    health_latency_ms: h.latency_ms,
    health_status: h.status,
    health_error: h.error || null,
    semantic_smoke_ok: semanticOk,
    semantic_smoke_error: semanticErr,
    build_passed: true,
    deploy_passed: true,
    tests_passed: null,
    lint_passed: null,
    failure_reason: overall
      ? null
      : [h.ok ? null : 'health', semanticRequired && !semanticOk ? 'semantic_smoke' : null]
          .filter(Boolean)
          .join(','),
    duration_ms: Date.now() - tStart,
    metrics_json: {
      health: h,
      semantic_rpc: semanticOk,
    },
    artifacts_json: {
      smoke_base_url: baseUrl,
    },
    steps_completed: 2,
    steps_total: 2,
  };

  writeFileSync(resolve(root, '.deploy-eval-results.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(
    `[deploy-eval] health=${h.ok} semantic_log=${semanticOk} overall=${overall} (${out.duration_ms}ms)`,
  );

  if (!overall) {
    console.warn('[deploy-eval] Smoke did not fully pass — check metrics above');
    process.exitCode = 0;
  }
}

main().catch((e) => {
  console.error('[deploy-eval]', e);
  process.exit(1);
});
