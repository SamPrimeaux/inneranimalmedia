#!/usr/bin/env node
/**
 * Pull live rows from D1 (remote) via wrangler, embed with Workers AI REST, insert into Supabase public.documents.
 *
 * Required env (via .env.cloudflare / with-cloudflare-env.sh):
 *   CLOUDFLARE_API_TOKEN, SUPABASE_DB_URL
 * Optional: CLOUDFLARE_ACCOUNT_ID, DOCUMENTS_PROJECT_ID (default inneranimalmedia), INGEST_DELAY_MS
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest-d1-memory.js
 */
import { execFileSync } from 'child_process';
import pathMod from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = pathMod.dirname(fileURLToPath(import.meta.url));
const root = pathMod.join(__dirname, '..');

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'ede6590ac0d2fb7daf155b35653457b2';
const MODEL = '@cf/baai/bge-large-en-v1.5';
const EMBED_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`;
const PROJECT_ID = process.env.DOCUMENTS_PROJECT_ID || 'inneranimalmedia';
const DELAY_MS = Number(process.env.INGEST_DELAY_MS || 150);

const token = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
const dbUrl = (process.env.SUPABASE_DB_URL || '').trim();

if (!token) {
  console.error('Missing CLOUDFLARE_API_TOKEN');
  process.exit(1);
}
if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL; see scripts/ingest-docs.js header.');
  process.exit(1);
}

const wrapper = pathMod.join(root, 'scripts', 'with-cloudflare-env.sh');
const d1ArgsBase = [
  'npx',
  'wrangler',
  'd1',
  'execute',
  'inneranimalmedia-business',
  '--remote',
  '-c',
  'wrangler.production.toml',
  '--json',
];

function runD1Sql(sql) {
  const args = [...d1ArgsBase, '--command', sql];
  const raw = execFileSync(wrapper, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  let parsed;
  try {
    parsed = JSON.parse(raw.trim());
  } catch (e) {
    throw new Error(`D1 JSON parse: ${e.message}`);
  }
  const rows = parsed[0]?.results ?? parsed.results ?? [];
  return Array.isArray(rows) ? rows : [];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function embedText(text) {
  const body = { text: text.length > 50000 ? text.slice(0, 50000) : text };
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Embed HTTP ${res.status}: ${JSON.stringify(json).slice(0, 800)}`);
  }
  const r = json.result ?? json;
  let vec;
  if (Array.isArray(r?.data?.[0])) vec = r.data[0];
  else if (Array.isArray(r?.data) && typeof r.data[0] === 'number') vec = r.data;
  else if (Array.isArray(r?.[0])) vec = r[0];
  else if (Array.isArray(r) && typeof r[0] === 'number') vec = r;
  if (!vec || !Array.isArray(vec)) {
    throw new Error(`Unexpected embed shape: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return vec;
}

function pgClientOptions() {
  const useSsl =
    /\.supabase\.co\b/.test(dbUrl) ||
    /\.pooler\.supabase\.com\b/.test(dbUrl) ||
    /supabase\.com/.test(dbUrl);
  return {
    connectionString: dbUrl,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

async function clearSource(client, source) {
  await client.query('DELETE FROM documents WHERE source = $1 AND project_id = $2', [source, PROJECT_ID]);
}

async function insertRow(client, source, title, content, vector) {
  const literal = '[' + vector.join(',') + ']';
  await client.query(
    `INSERT INTO documents (source, title, content, embedding, project_id)
     VALUES ($1, $2, $3, $4::vector, $5)`,
    [source, title, content, literal, PROJECT_ID]
  );
}

async function ingestRows(client, label, source, rows, buildTitleContent) {
  console.log(`Ingest ${label}: ${rows.length} rows (source=${source})`);
  await clearSource(client, source);
  let n = 0;
  for (const row of rows) {
    n += 1;
    const { title, content } = buildTitleContent(row);
    const vec = await embedText(content);
    await insertRow(client, source, title, content, vec);
    if (n % 20 === 0) console.log(`  ... ${n}/${rows.length}`);
    await sleep(DELAY_MS);
  }
  console.log(`Done ${source}: inserted ${rows.length} rows`);
  return rows.length;
}

const client = new pg.Client(pgClientOptions());
await client.connect();
try {
  const pm = runD1Sql(
    `SELECT key, value, memory_type FROM project_memory WHERE project_id = 'inneranimalmedia'`
  );
  const n1 = await ingestRows(client, 'project_memory', 'd1:project_memory', pm, (r) => {
    const key = String(r.key ?? '');
    const mt = String(r.memory_type ?? '');
    const val = String(r.value ?? '');
    const content = `[${mt}] ${key}: ${val}`;
    return { title: key, content };
  });

  const gr = runD1Sql(
    `SELECT name, slug, rules, category FROM ai_guardrails WHERE is_active = 1`
  );
  const n2 = await ingestRows(client, 'ai_guardrails', 'd1:guardrails', gr, (r) => {
    const slug = String(r.slug ?? '');
    const rules = String(r.rules ?? '');
    return { title: slug, content: rules };
  });

  const ar = runD1Sql(
    `SELECT rule_key, content, category, scope, severity FROM agent_rules WHERE is_active = 1`
  );
  const n3 = await ingestRows(client, 'agent_rules', 'd1:agent_rules', ar, (r) => {
    const rk = String(r.rule_key ?? '');
    const content = String(r.content ?? '');
    return { title: rk, content };
  });

  console.log('D1 memory ingest complete.');
  console.log(
    `Summary — d1:project_memory: ${n1} rows | d1:guardrails: ${n2} rows | d1:agent_rules: ${n3} rows`
  );
} finally {
  await client.end().catch(() => {});
}
