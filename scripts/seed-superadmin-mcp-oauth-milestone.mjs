#!/usr/bin/env node
/**
 * Milestone memory: superadmin MCP OAuth E2E (2026-06-04).
 * D1 agentsam_memory → mirror agentsam.agentsam_memory → embed Supabase 1536 + Vectorize memory index.
 *
 *   ./scripts/with-cloudflare-env.sh node scripts/seed-superadmin-mcp-oauth-milestone.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/seed-superadmin-mcp-oauth-milestone.mjs --mirror-only
 *   ./scripts/with-cloudflare-env.sh node scripts/seed-superadmin-mcp-oauth-milestone.mjs --embed-only
 *   ./scripts/with-cloudflare-env.sh node scripts/seed-superadmin-mcp-oauth-milestone.mjs --skip-embed
 *   ./scripts/with-cloudflare-env.sh node scripts/seed-superadmin-mcp-oauth-milestone.mjs --skip-mirror
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { mapD1RowToPrivateMemory } from '../src/core/agentsam-private-memory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TENANT_ID = 'tenant_sam_primeaux';
const WORKSPACE_ID = 'ws_inneranimalmedia';
const USER_ID = 'au_871d920d1233cbd1';
const MEMORY_KEY = 'platform_milestone_superadmin_mcp_oauth_e2e_2026_06_04';
const DOC_PATH = 'docs/platform/milestone-superadmin-mcp-oauth-e2e-2026-06-04.md';

const PG_TABLE = 'agentsam_memory_oai3large_1536';
const VECTORIZE_INDEX = 'agentsam-memory-oai3large-1536';
const WORKSPACE_UUID = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac';

const UPSERT_SQL = `
INSERT INTO agentsam.agentsam_memory (
  tenant_id, workspace_id, user_id, memory_type, memory_key,
  title, content, summary, value_json, source, external_ref, tags,
  confidence, importance, expires_at, is_pinned, is_archived,
  embedding, embedded_at, sync_key, d1_id, updated_at
) VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8, $9::jsonb, $10, $11, $12::text[],
  $13, $14, $15::timestamptz, $16, false,
  NULL, NULL, $17, $18, now()
)
ON CONFLICT (tenant_id, user_id, memory_key) DO UPDATE SET
  workspace_id = EXCLUDED.workspace_id,
  memory_type = EXCLUDED.memory_type,
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  summary = EXCLUDED.summary,
  value_json = EXCLUDED.value_json,
  source = EXCLUDED.source,
  tags = EXCLUDED.tags,
  confidence = EXCLUDED.confidence,
  importance = EXCLUDED.importance,
  is_pinned = EXCLUDED.is_pinned,
  sync_key = EXCLUDED.sync_key,
  updated_at = now()`;

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

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

function contentHash(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

function readMilestoneBody() {
  const abs = resolve(ROOT, DOC_PATH);
  if (!existsSync(abs)) throw new Error(`Missing ${DOC_PATH}`);
  return readFileSync(abs, 'utf8');
}

function buildMemoryRecord(body) {
  return {
    key: MEMORY_KEY,
    memory_type: 'decision',
    title: 'Milestone: Superadmin MCP OAuth E2E operator platform (2026-06-04)',
    importance: 10,
    tags: [
      'milestone',
      'superadmin',
      'mcp',
      'oauth',
      'terminal',
      'localpty',
      'cloudflare',
      'platform',
      '2026-06-04',
    ],
    source: 'cursor_milestone_2026_06_04',
    value: body,
  };
}

function d1ExecuteFile(sqlPath) {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'inneranimalmedia-business',
      '--remote',
      '-c',
      'wrangler.production.toml',
      '--file',
      sqlPath,
    ],
    { cwd: ROOT, stdio: 'inherit', env: process.env },
  );
}

function upsertD1(mem) {
  const now = Math.floor(Date.now() / 1000);
  const syncKey = `${TENANT_ID}:${USER_ID}:${mem.key}`;
  const summary = mem.value.slice(0, 500);
  const tagsJson = JSON.stringify(mem.tags);
  const id = `mem_${mem.key.replace(/[^a-z0-9]+/gi, '_').slice(0, 48)}`;
  const sql = `INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  '${sqlEscape(id)}',
  '${sqlEscape(TENANT_ID)}',
  '${sqlEscape(USER_ID)}',
  '${sqlEscape(WORKSPACE_ID)}',
  '${sqlEscape(mem.memory_type)}',
  '${sqlEscape(mem.key)}',
  '${sqlEscape(mem.value)}',
  '${sqlEscape(mem.title)}',
  '${sqlEscape(summary)}',
  '${sqlEscape(mem.source)}',
  '${sqlEscape(tagsJson)}',
  1.0,
  ${mem.importance},
  1,
  '${sqlEscape(syncKey)}',
  ${now}
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  memory_type = excluded.memory_type,
  title = excluded.title,
  summary = excluded.summary,
  workspace_id = excluded.workspace_id,
  source = excluded.source,
  tags = excluded.tags,
  importance = excluded.importance,
  is_pinned = excluded.is_pinned,
  sync_key = excluded.sync_key,
  updated_at = excluded.updated_at,
  embedded_at = NULL;`;
  const scratch = resolve(ROOT, '.scratch', `seed_milestone_${mem.key}.sql`);
  writeFileSync(scratch, sql, 'utf8');
  try {
    d1ExecuteFile(scratch);
  } finally {
    try {
      unlinkSync(scratch);
    } catch {
      /* ignore */
    }
  }
}

function d1Json(sql) {
  const out = execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'inneranimalmedia-business',
      '--remote',
      '-c',
      'wrangler.production.toml',
      '--json',
      '--command',
      sql,
    ],
    { cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 16 * 1024 * 1024 },
  );
  const start = out.indexOf('[');
  return JSON.parse(out.slice(start))[0]?.results ?? [];
}

function pgOptions(dbUrl) {
  const useSsl =
    /\.supabase\.co\b/.test(dbUrl) ||
    /\.pooler\.supabase\.com\b/.test(dbUrl) ||
    /supabase\.com/.test(dbUrl);
  return {
    connectionString: dbUrl,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

async function mirrorKey() {
  const dbUrl = (process.env.SUPABASE_DB_URL || '').trim();
  if (!dbUrl) {
    console.error('Missing SUPABASE_DB_URL — skip PG mirror');
    return { ok: false, error: 'no_supabase_db_url' };
  }
  const rows = d1Json(
    `SELECT * FROM agentsam_memory WHERE tenant_id = '${sqlEscape(TENANT_ID)}' AND user_id = '${sqlEscape(USER_ID)}' AND key = '${sqlEscape(MEMORY_KEY)}'`,
  );
  const row = rows[0];
  if (!row) return { ok: false, error: 'd1_row_missing' };

  const m = mapD1RowToPrivateMemory(row);
  if (!m.workspace_id) m.workspace_id = WORKSPACE_ID;
  const client = new pg.Client(pgOptions(dbUrl));
  await client.connect();
  try {
    await client.query(UPSERT_SQL, [
      m.tenant_id,
      m.workspace_id,
      m.user_id,
      m.memory_type,
      m.memory_key,
      m.title,
      m.content,
      m.summary,
      JSON.stringify(m.value_json),
      m.source,
      m.external_ref,
      m.tags,
      m.confidence,
      m.importance,
      m.expires_at,
      m.is_pinned,
      m.sync_key,
      m.d1_id,
    ]);
    return { ok: true, memory_key: m.memory_key, sync_key: m.sync_key };
  } finally {
    await client.end().catch(() => {});
  }
}

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for embed');
  return { url, key };
}

async function openaiEmbed(text) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY required');
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: text,
      dimensions: 1536,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OpenAI embed: ${JSON.stringify(json).slice(0, 300)}`);
  return json.data[0].embedding;
}

async function vectorizeUpsert(id, embedding, metadata) {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !token) throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required');
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${VECTORIZE_INDEX}/upsert`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-ndjson' },
    body: JSON.stringify({ id, values: embedding, metadata }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vectorize upsert: ${text.slice(0, 400)}`);
}

async function embedMemoryLane(mem) {
  const { url, key } = supabaseConfig();
  const title = mem.title;
  const content = mem.value;
  const embedText = `${title}\n\n${content}`;
  const hash = contentHash(embedText);
  const embedding = await openaiEmbed(embedText);
  const vectorLiteral = `[${embedding.join(',')}]`;
  const now = new Date().toISOString();

  const q = new URLSearchParams({
    select: 'id',
    workspace_id: `eq.${WORKSPACE_UUID}`,
    memory_key: `eq.${MEMORY_KEY}`,
    limit: '1',
  });
  const getRes = await fetch(`${url}/rest/v1/${PG_TABLE}?${q}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Accept-Profile': 'agentsam',
    },
  });
  const existing = getRes.ok ? await getRes.json() : [];
  const rowId = existing?.[0]?.id || randomUUID();

  const payload = {
    id: rowId,
    workspace_id: WORKSPACE_UUID,
    user_id: null,
    title,
    memory_key: MEMORY_KEY,
    content,
    source: mem.source,
    metadata: {
      source_type: 'milestone',
      milestone: 'superadmin_mcp_oauth_e2e',
      validated: '2026-06-04',
      content_hash: hash,
      user_id_d1: USER_ID,
      tenant_id: TENANT_ID,
      tags: mem.tags,
    },
    embedding: vectorLiteral,
    embedded_at: now,
    updated_at: now,
  };

  const postRes = await fetch(`${url}/rest/v1/${PG_TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'agentsam',
      'Content-Profile': 'agentsam',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify([payload]),
  });
  if (!postRes.ok) {
    const err = await postRes.text();
    throw new Error(`Supabase memory upsert: ${err.slice(0, 400)}`);
  }

  await vectorizeUpsert(rowId, embedding, {
    workspace_id: WORKSPACE_ID,
    memory_key: MEMORY_KEY,
    title,
    source_type: 'milestone',
    source_ref: `milestone.${MEMORY_KEY}`,
  });

  const d1Rows = d1Json(
    `SELECT id FROM agentsam_memory WHERE tenant_id = '${sqlEscape(TENANT_ID)}' AND user_id = '${sqlEscape(USER_ID)}' AND key = '${sqlEscape(MEMORY_KEY)}' LIMIT 1`,
  );
  if (d1Rows[0]?.id) {
    const scratch = resolve(ROOT, '.scratch', 'milestone_embedded_at.sql');
    writeFileSync(
      scratch,
      `UPDATE agentsam_memory SET embedded_at = unixepoch() WHERE id = '${sqlEscape(d1Rows[0].id)}';`,
      'utf8',
    );
    try {
      d1ExecuteFile(scratch);
    } finally {
      try {
        unlinkSync(scratch);
      } catch {
        /* ignore */
      }
    }
  }

  return { ok: true, supabase_id: rowId, vectorize_id: rowId, content_hash: hash };
}

async function main() {
  loadEnvCloudflare();
  const mirrorOnly = process.argv.includes('--mirror-only');
  const embedOnly = process.argv.includes('--embed-only');
  const skipEmbed = process.argv.includes('--skip-embed');
  const skipMirror = process.argv.includes('--skip-mirror');
  const body = readMilestoneBody();
  const mem = buildMemoryRecord(body);
  const report = { d1: null, mirror: null, embed: null };

  if (!mirrorOnly && !embedOnly) {
    upsertD1(mem);
    report.d1 = { key: MEMORY_KEY, ok: true };
  }

  if (!skipMirror && !embedOnly) {
    try {
      report.mirror = await mirrorKey();
    } catch (e) {
      report.mirror = { ok: false, error: String(e?.message || e) };
      if (mirrorOnly) throw e;
      console.warn('[mirror] skipped:', report.mirror.error);
    }
  } else if (skipMirror || embedOnly) {
    report.mirror = { ok: false, skipped: true };
  }

  if (!skipEmbed && !mirrorOnly) {
    report.embed = await embedMemoryLane(mem);
  }

  console.log(JSON.stringify(report, null, 2));
  const mirrorOk = skipMirror || embedOnly || report.mirror?.ok;
  const embedOk = skipEmbed || mirrorOnly || report.embed?.ok;
  const ok = mirrorOnly ? report.mirror?.ok : embedOnly ? embedOk : mirrorOk && embedOk;
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
