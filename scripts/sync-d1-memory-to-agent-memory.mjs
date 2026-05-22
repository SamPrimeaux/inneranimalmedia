#!/usr/bin/env node
/**
 * Mirror recent D1 agentsam_memory → Supabase public.agent_memory for semantic recall.
 * Dedupes via metadata.sync_key = d1_memory:<id>
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/sync-d1-memory-to-agent-memory.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/sync-d1-memory-to-agent-memory.mjs --limit 50
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DB = process.env.IAM_D1_DB || 'inneranimalmedia-business';
const WRANGLER_CFG = process.env.IAM_WRANGLER_CONFIG || 'wrangler.production.toml';
const LIMIT = Number(process.argv.includes('--limit') ? process.argv[process.argv.indexOf('--limit') + 1] : 80);

function loadEnvCloudflare() {
  const p = resolve(ROOT, '.env.cloudflare');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (k && process.env[k] == null) process.env[k] = v;
  }
}

function d1Json(sql) {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB, '--remote', '-c', WRANGLER_CFG, '--json', '--command', sql],
    { cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 8 * 1024 * 1024 },
  );
  const start = out.indexOf('[');
  return JSON.parse(out.slice(start))[0]?.results ?? [];
}

function mapRow(r) {
  const syncKey = `d1_memory:${r.id}`;
  const content = `[${r.memory_type}] ${r.key}: ${String(r.value || '').slice(0, 4000)}`;
  return {
    session_id: r.session_id || `d1_${r.id}`,
    agent_id: r.agent_id || 'agent-sam',
    role: 'system',
    content,
    workspace_id: r.workspace_id || 'ws_inneranimalmedia',
    tenant_id: r.tenant_id || 'tenant_sam_primeaux',
    user_id: r.user_id,
    memory_type: r.memory_type || 'project',
    durability: 'project',
    importance: r.memory_type === 'project' || r.memory_type === 'decision' ? 5 : 3,
    plan_id: r.plan_id || null,
    task_id: r.task_id || null,
    source_tool: r.source || 'd1_agentsam_memory',
    metadata: {
      sync_key: syncKey,
      d1_memory_id: r.id,
      d1_key: r.key,
      confidence: r.confidence,
    },
  };
}

async function deleteBySyncKey(base, key, syncKey) {
  const q = new URLSearchParams({
    metadata: `cs.{"sync_key":"${syncKey}"}`,
  });
  await fetch(`${base}/rest/v1/agent_memory?${q}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).catch(() => null);
}

async function main() {
  loadEnvCloudflare();
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(2);
  }

  const rows = d1Json(`
    SELECT id, tenant_id, user_id, workspace_id, memory_type, key, value, source, confidence,
           session_id, agent_id, plan_id, task_id, updated_at
    FROM agentsam_memory
    WHERE tenant_id = 'tenant_sam_primeaux'
    ORDER BY updated_at DESC
    LIMIT ${Math.min(500, Math.max(1, LIMIT))}
  `);

  let upserted = 0;
  for (const r of rows) {
    const syncKey = `d1_memory:${r.id}`;
    await deleteBySyncKey(base, key, syncKey);
    const body = mapRow(r);
    const res = await fetch(`${base}/rest/v1/agent_memory`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      upserted += 1;
      console.log(`[ok] ${syncKey}`);
    } else {
      const t = await res.text();
      console.warn(`[fail] ${syncKey} HTTP ${res.status}: ${t.slice(0, 300)}`);
    }
  }
  console.log(`[sync-d1-memory] upserted ${upserted}/${rows.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
