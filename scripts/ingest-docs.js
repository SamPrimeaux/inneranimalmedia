#!/usr/bin/env node
/**
 * One-shot: embed docs/route-map.md and docs/d1-agentic-schema.md into Supabase `documents`
 * via pg (direct Postgres URL). Embeddings via Cloudflare Workers AI REST API (not Worker env.AI).
 *
 * Required env:
 *   CLOUDFLARE_API_TOKEN — API token with Workers AI / account read
 *   SUPABASE_DB_URL — direct Postgres connection string (Supabase dashboard; Hyperdrive string is Worker-only)
 *
 * Worker note: `SUPABASE_DB_URL` is also a secret on the inneranimalmedia Worker, but Cloudflare does
 * not return secret values from the Workers secrets API (names/metadata only). For local scripts, set
 * the same connection string in `.env.cloudflare` (gitignored) or `~/.zshrc`, alongside
 * `CLOUDFLARE_API_TOKEN`, then run with the shell env loaded, e.g.:
 *   ./scripts/with-cloudflare-env.sh npm run ingest:docs
 *
 * Optional:
 *   CLOUDFLARE_ACCOUNT_ID (default: ede6590ac0d2fb7daf155b35653457b2)
 *   DOCUMENTS_PROJECT_ID (default: inneranimalmedia)
 *   INGEST_DELAY_MS (default: 150) — pause between embedding calls
 *
 * Also pulls live rows from Cloudflare D1 (remote via wrangler) and embeds:
 *   agent_commands, agentsam_rules_document, iam_agent_sam_prompts (sources d1:commands, d1:rules, d1:sam_prompts).
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh npm run ingest:docs
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import pathMod from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = pathMod.dirname(fileURLToPath(import.meta.url));
const root = pathMod.join(__dirname, '..');

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'ede6590ac0d2fb7daf155b35653457b2';
const MODEL = '@cf/baai/bge-large-en-v1.5';
/** Path must include literal `@cf/...` (do not encode `@`); encoding breaks the Cloudflare API route. */
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
  console.error(
    'Missing SUPABASE_DB_URL. Add it to .env.cloudflare (gitignored) or export it; see file header.'
  );
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} text
 * @returns {Promise<number[]>}
 */
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

/**
 * @param {string} md
 * @returns {{ title: string, content: string }[]}
 */
function splitMarkdownH2(md) {
  const parts = md.split(/^## /m);
  const out = [];
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i].trim();
    const nl = chunk.indexOf('\n');
    const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
    const content = `## ${chunk}`;
    out.push({ title, content });
  }
  return out;
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

async function ingestD1Rows(client, label, source, rows, buildTitleContent) {
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

async function ingestFile(client, relPath, sourceLabel) {
  const full = pathMod.join(root, relPath);
  if (!fs.existsSync(full)) {
    console.error('Missing file:', full);
    process.exit(1);
  }
  const md = fs.readFileSync(full, 'utf8');
  const chunks = splitMarkdownH2(md);
  console.log(`Ingest ${relPath}: ${chunks.length} chunks (source=${sourceLabel})`);
  await clearSource(client, sourceLabel);
  let n = 0;
  for (const { title, content } of chunks) {
    n += 1;
    const vec = await embedText(content);
    await insertRow(client, sourceLabel, title, content, vec);
    if (n % 20 === 0) console.log(`  ... ${n}/${chunks.length}`);
    await sleep(DELAY_MS);
  }
  console.log(`Done ${sourceLabel}: inserted ${chunks.length} rows`);
  return chunks.length;
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

const client = new pg.Client(pgClientOptions());
await client.connect();
try {
  const nRoute = await ingestFile(client, 'docs/route-map.md', 'docs:route-map');
  const nSchema = await ingestFile(client, 'docs/d1-agentic-schema.md', 'docs:d1-schema');

  const cmdRows = runD1Sql(
    `SELECT name, command_text, description, category FROM agent_commands WHERE status = 'active' AND tenant_id = 'tenant_sam_primeaux'`
  );
  const nCmd = await ingestD1Rows(client, 'agent_commands', 'd1:commands', cmdRows, (r) => {
    const name = String(r.name ?? '');
    const cat = String(r.category ?? '');
    const desc = String(r.description ?? '');
    const ct = String(r.command_text ?? '');
    const content = `Name: ${name}\nCategory: ${cat}\nDescription: ${desc}\nCommand:\n${ct}`;
    return { title: name || 'command', content };
  });

  const rulesRows = runD1Sql(
    `SELECT title, body_markdown FROM agentsam_rules_document WHERE is_active = 1`
  );
  const nRules = await ingestD1Rows(client, 'agentsam_rules_document', 'd1:rules', rulesRows, (r) => {
    const title = String(r.title ?? 'rule');
    const body = String(r.body_markdown ?? '');
    return { title, content: `${title}\n\n${body}` };
  });

  const promptRows = runD1Sql(
    `SELECT role, content FROM iam_agent_sam_prompts WHERE is_active = 1`
  );
  const nPrompts = await ingestD1Rows(client, 'iam_agent_sam_prompts', 'd1:sam_prompts', promptRows, (r) => {
    const role = String(r.role ?? 'prompt');
    const content = String(r.content ?? '');
    return { title: role, content: `Role: ${role}\n${content}` };
  });

  console.log('All ingest complete.');
  console.log(
    `Summary — docs:route-map: ${nRoute} | docs:d1-schema: ${nSchema} | d1:commands: ${nCmd} | d1:rules: ${nRules} | d1:sam_prompts: ${nPrompts}`
  );
} finally {
  await client.end().catch(() => {});
}
