#!/usr/bin/env node
/**
 * Rebuild Supabase public.documents for RAG / Cmd+K (pgvector). Does NOT touch public.agent_memory.
 *
 * Canonical IDs (override via env):
 *   TENANT_ID (default tenant_sam_primeaux)
 *   WORKSPACE_ID (default ws_inneranimalmedia)
 *   DOCUMENTS_PROJECT_ID / project (default inneranimalmedia)
 *
 * Required for --apply (and for --dry-run DB diff):
 *   CLOUDFLARE_API_TOKEN, SUPABASE_DB_URL
 *
 * Embeddings: Workers AI REST @cf/baai/bge-large-en-v1.5 → vector(1024). Dry-run skips embedding API calls.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/reingest-supabase-documents.mjs --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/reingest-supabase-documents.mjs --dry-run --verbose
 *   ./scripts/with-cloudflare-env.sh node scripts/reingest-supabase-documents.mjs --apply
 *
 * Options:
 *   --dry-run       Plan only (default if neither dry-run nor apply)
 *   --apply         Upsert rows + optional prune orphans per managed source
 *   --verbose       Extra logging
 *   --skip-d1       Skip remote D1 pulls (files + manifest only)
 *   --no-prune      Apply mode: do not DELETE orphans within managed sources
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import pathMod from 'path';
import pg from 'pg';
import {
  serializeAgentsamGuardrailContent,
  guardrailDocumentMetadata,
} from './lib/agentsam-guardrails-ingest.mjs';


function requireIdentity(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing ${name}. Refusing to run without explicit tenant/workspace/user scope.`);
  }
  return String(value).trim();
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = pathMod.join(__dirname, '..');

try {
  const envPath = resolve(__dirname, '../.env.cloudflare');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch {
  /* optional */
}

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const skipD1 = argv.includes('--skip-d1');
const noPrune = argv.includes('--no-prune');
let dryRun = argv.includes('--dry-run');
const apply = argv.includes('--apply');
if (!dryRun && !apply) dryRun = true;

if (apply) {
  const t = (process.env.TENANT_ID || '').trim();
  const w = (process.env.WORKSPACE_ID || '').trim();
  const p = (
    process.env.DOCUMENTS_PROJECT_ID ||
    process.env.DEPLOY_PROJECT_ID ||
    ''
  ).trim();
  if (!t || !w || !p) {
    console.error(
      '[reingest] --apply requires TENANT_ID, WORKSPACE_ID, and DOCUMENTS_PROJECT_ID (or DEPLOY_PROJECT_ID). Do not rely on Supabase column defaults.',
    );
    process.exit(1);
  }
}

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'ede6590ac0d2fb7daf155b35653457b2';
const MODEL = '@cf/baai/bge-large-en-v1.5';
const EMBED_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`;
const PROJECT_ID = process.env.DOCUMENTS_PROJECT_ID || 'inneranimalmedia';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? 'ws_inneranimalmedia';
const TENANT_ID = process.env.TENANT_ID ?? 'tenant_sam_primeaux';
const DELAY_MS = Number(process.env.INGEST_DELAY_MS || 150);
const D1_SCHEMA_DOC =
  process.env.D1_SCHEMA_DOC_PATH || pathMod.join(root, 'docs/d1-agentic-schema.md');

const MANIFEST_PATH = pathMod.join(root, 'scripts/supabase-documents-selected-manifest.json');

const token = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
const dbUrl = (process.env.SUPABASE_DB_URL || '').trim();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function contentHash(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

/** Globally unique deterministic id per chunk (stable across runs). */
function sourceChunkId(parts) {
  return contentHash(parts.join('\x1e'));
}

function extractPathFromRouteTitle(title) {
  const parts = String(title).trim().split(/\s+/);
  for (const p of parts) {
    if (p.startsWith('/')) return p;
  }
  return '';
}

function routeGroupKey(path) {
  if (!path || path === '/') return '/';
  const segs = path.split('/').filter(Boolean);
  if (segs.length <= 1) return '/' + segs[0];
  return '/' + segs[0] + '/' + segs[1];
}

function groupRouteMapChunks(chunks) {
  const groups = new Map();
  for (const ch of chunks) {
    const path = extractPathFromRouteTitle(ch.title);
    const key = routeGroupKey(path);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ch);
  }
  const out = [];
  for (const [key, arr] of groups) {
    out.push({
      title: key,
      content: arr.map((c) => c.content).join('\n\n'),
    });
  }
  out.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

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
  if (parsed?.error) {
    const msg = JSON.stringify(parsed.error).slice(0, 400);
    throw new Error(`D1 API error: ${msg}`);
  }
  const rows = parsed[0]?.results ?? parsed.results ?? [];
  return Array.isArray(rows) ? rows : [];
}

/** Returns [] on missing table / remote error so one D1 source cannot abort the whole reingest. */
function runD1SqlOptional(label, sql) {
  try {
    return runD1Sql(sql);
  } catch (e) {
    console.warn(`[reingest] D1 skip ${label}:`, String(e.message || e).slice(0, 220));
    return [];
  }
}

function escapeSqlLit(s) {
  return String(s).replace(/'/g, "''");
}

function fetchAgentsamGuardrailRows() {
  const tid = escapeSqlLit(TENANT_ID);
  const ws = escapeSqlLit(WORKSPACE_ID);
  /** Single-line SQL — wrangler `--command` breaks on embedded newlines.
   * Direct agentsam_guardrails only: no rulesets JOIN; enabled via is_enabled (not status / ruleset_id).
   */
  const filter = `WHERE COALESCE(g.is_enabled, 1) = 1 AND (((g.tenant_id IS NULL OR g.tenant_id = '') AND (g.workspace_id IS NULL OR g.workspace_id = '')) OR (g.tenant_id = '${tid}' AND (g.workspace_id IS NULL OR g.workspace_id = '' OR g.workspace_id = '${ws}')))`;
  const sql = `SELECT g.id, g.guardrail_key, g.title, g.description, g.category, g.severity, g.action, g.scope, g.applies_to, g.matcher_json, g.policy_json, g.metadata_json, g.tenant_id, g.workspace_id FROM agentsam_guardrails g ${filter} ORDER BY COALESCE(g.scope, ''), COALESCE(g.priority, 0), COALESCE(g.guardrail_key, '')`;
  try {
    return runD1Sql(sql);
  } catch (e) {
    console.warn('[reingest] agentsam_guardrails:', String(e.message || e).slice(0, 220));
    return [];
  }
}

/**
 * @param {Record<string, unknown>[]} rows
 * @returns {PlannedChunk[]}
 */
function chunksFromAgentsamGuardrailRows(rows) {
  const scope = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, projectId: PROJECT_ID };
  /** @type {PlannedChunk[]} */
  const out = [];
  for (const raw of rows) {
    const r = /** @type {Record<string, unknown>} */ (raw);
    const content = serializeAgentsamGuardrailContent(r);
    if (!String(content || '').trim()) continue;
    const rowId = String(r.id ?? r.guardrail_key ?? '');
    const scid = sourceChunkId([
      TENANT_ID,
      WORKSPACE_ID,
      PROJECT_ID,
      'd1:guardrails',
      String(r.tenant_id ?? ''),
      String(r.workspace_id ?? ''),
      rowId,
    ]);
    const h = contentHash(content);
    const title = String(r.title || r.guardrail_key || rowId || 'guardrail').slice(0, 500);
    out.push({
      source: 'd1:guardrails',
      title,
      content,
      source_chunk_id: scid,
      content_hash: h,
      metadata: {
        content_hash: h,
        ...guardrailDocumentMetadata(r, scope),
      },
    });
  }
  return out;
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
  if (vec.length !== 1024) {
    console.warn(`[reingest] expected 1024-dim embedding, got ${vec.length}`);
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

/**
 * @typedef {{ source: string, title: string, content: string, source_chunk_id: string, content_hash: string, metadata: Record<string, unknown> }} PlannedChunk
 */

/** @param {string} relPath @param {string} source @returns {PlannedChunk[]} */
function chunksFromMarkdownFile(relPath, source) {
  const full = pathMod.join(root, relPath);
  if (!existsSync(full)) {
    console.warn(`[reingest] missing file (skip): ${relPath}`);
    return [];
  }
  const md = readFileSync(full, 'utf8');
  const fileHash = contentHash(md);
  let chunks = splitMarkdownH2(md);
  if (relPath.includes('route-map.md')) {
    chunks = groupRouteMapChunks(chunks);
  }
  const out = [];
  chunks.forEach((c, idx) => {
    const h = contentHash(c.content);
    const baseKey = relPath.includes('route-map.md') ? `group:${c.title}` : `h2:${idx}:${c.title}`;
    const scid = sourceChunkId([TENANT_ID, WORKSPACE_ID, PROJECT_ID, source, baseKey]);
    if (!String(c.content || '').trim()) return;
    out.push({
      source,
      title: c.title.slice(0, 500),
      content: c.content,
      source_chunk_id: scid,
      content_hash: h,
      metadata: {
        content_hash: h,
        file_hash: fileHash,
        file: relPath,
        chunk_key: baseKey,
      },
    });
  });
  return out;
}

/** @returns {PlannedChunk[]} */
function loadRepoSelected() {
  if (!existsSync(MANIFEST_PATH)) return [];
  let spec;
  try {
    spec = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    console.warn('[reingest] invalid manifest JSON', e.message);
    return [];
  }
  const paths = Array.isArray(spec.paths) ? spec.paths : [];
  /** @type {PlannedChunk[]} */
  const all = [];
  for (const rel of paths) {
    const fileChunks = chunksFromMarkdownFile(rel, 'repo:selected');
    for (const ch of fileChunks) {
      ch.metadata = { ...ch.metadata, manifest: 'supabase-documents-selected-manifest.json' };
      all.push(ch);
    }
  }
  return all;
}

function fetchCommandsRows() {
  const agentsamAttempts = [
    `SELECT id, slug, display_name, mapped_command, description, category, modes_json, risk_level, requires_confirmation
     FROM agentsam_commands
     WHERE COALESCE(is_active, 1) = 1 AND tenant_id = 'tenant_sam_primeaux'
     ORDER BY COALESCE(slug, id)`,
    `SELECT id, slug, display_name, mapped_command, description, category
     FROM agentsam_commands
     WHERE COALESCE(is_active, 1) = 1
     ORDER BY COALESCE(slug, id)`,
  ];
  for (const sql of agentsamAttempts) {
    try {
      const rows = runD1Sql(sql);
      if (verbose) console.error(`[reingest] D1 agentsam_commands: ${rows.length} rows`);
      if (rows.length > 0) return { rows, used: 'agentsam_commands' };
    } catch (e) {
      if (verbose) console.error('[reingest] agentsam_commands SQL failed:', String(e.message || e).slice(0, 200));
    }
  }
  try {
    const rows = runD1Sql(
      `SELECT name, command_text, description, category FROM agent_commands WHERE COALESCE(status,'active')='active' AND tenant_id = 'tenant_sam_primeaux'`,
    );
    if (verbose) console.error(`[reingest] D1 agent_commands (fallback): ${rows.length} rows`);
    return { rows, used: 'agent_commands' };
  } catch (e) {
    console.warn('[reingest] D1 commands: no rows', String(e.message || e).slice(0, 200));
    return { rows: [], used: 'none' };
  }
}

/** @returns {PlannedChunk[]} */
function d1OneRowPerChunk(source, rows, build) {
  /** @type {PlannedChunk[]} */
  const out = [];
  for (const row of rows) {
    const { title, content, key } = build(row);
    if (!String(content || '').trim()) continue;
    const h = contentHash(content);
    const scid = sourceChunkId([TENANT_ID, WORKSPACE_ID, PROJECT_ID, source, key]);
    out.push({
      source,
      title: title.slice(0, 500),
      content,
      source_chunk_id: scid,
      content_hash: h,
      metadata: { content_hash: h, d1_key: key },
    });
  }
  return out;
}

/** @returns {PlannedChunk[]} */
function buildAllPlannedChunks() {
  /** @type {PlannedChunk[]} */
  let chunks = [];

  chunks.push(...chunksFromMarkdownFile('docs/route-map.md', 'docs:route-map'));

  if (existsSync(D1_SCHEMA_DOC)) {
    const rel = pathMod.relative(root, D1_SCHEMA_DOC);
    chunks.push(...chunksFromMarkdownFile(rel, 'docs:d1-schema'));
  } else {
    console.warn(`[reingest] docs:d1-schema skipped — file missing: ${D1_SCHEMA_DOC} (set D1_SCHEMA_DOC_PATH)`);
  }

  chunks.push(...loadRepoSelected());

  if (!skipD1) {
    const { rows: cmdRows, used } = fetchCommandsRows();
    if (verbose) console.error(`[reingest] D1 commands source: ${used}, rows=${cmdRows.length}`);
    const firstCmd = cmdRows[0] || {};
    const useLegacyAgentCommands =
      cmdRows.length > 0 && 'command_text' in firstCmd && !('slug' in firstCmd) && !('mapped_command' in firstCmd);
    if (useLegacyAgentCommands) {
      chunks.push(
        ...d1OneRowPerChunk('d1:commands', cmdRows, (r) => {
          const name = String(r.name ?? '');
          const key = `agent_commands:${name}`;
          const cat = String(r.category ?? '');
          const desc = String(r.description ?? '');
          const ct = String(r.command_text ?? '');
          const content = `Name: ${name}\nCategory: ${cat}\nDescription: ${desc}\nCommand:\n${ct}`;
          return { title: name || 'command', content, key };
        }),
      );
    } else {
      chunks.push(
        ...d1OneRowPerChunk('d1:commands', cmdRows, (r) => {
          const slug = String(r.slug ?? r.id ?? '');
          const key = `agentsam_commands:${slug}`;
          const dn = String(r.display_name ?? '');
          const mc = String(r.mapped_command ?? '');
          const ds = String(r.description ?? '');
          const cat = String(r.category ?? '');
          const mj = r.modes_json != null ? JSON.stringify(r.modes_json) : '';
          const content = `Slug: ${slug}\nDisplay: ${dn}\nMapped: ${mc}\nCategory: ${cat}\nModes: ${mj}\n\n${ds}`;
          return { title: slug || dn || key, content, key };
        }),
      );
    }

    const rulesRows = runD1SqlOptional(
      'agentsam_rules_document',
      `SELECT title, body_markdown FROM agentsam_rules_document WHERE is_active = 1`,
    );
    chunks.push(
      ...d1OneRowPerChunk('d1:rules', rulesRows, (r) => {
        const title = String(r.title ?? 'rule');
        const body = String(r.body_markdown ?? '');
        const content = `${title}\n\n${body}`;
        return { title, content, key: `rules:${title}` };
      }),
    );

    const pm = runD1SqlOptional(
      'project_memory',
      `SELECT key, value, memory_type FROM project_memory WHERE project_id = '${PROJECT_ID}'`,
    );
    chunks.push(
      ...d1OneRowPerChunk('d1:project_memory', pm, (r) => {
        const key = String(r.key ?? '');
        const mt = String(r.memory_type ?? '');
        const val = String(r.value ?? '');
        const content = `[${mt}] ${key}: ${val}`;
        return { title: key, content, key: `pm:${key}` };
      }),
    );

    const grRows = fetchAgentsamGuardrailRows();
    chunks.push(...chunksFromAgentsamGuardrailRows(grRows));

    const ar = runD1SqlOptional(
      'agent_rules',
      `SELECT rule_key, content, category, scope, severity FROM agent_rules WHERE is_active = 1`,
    );
    chunks.push(
      ...d1OneRowPerChunk('d1:agent_rules', ar, (r) => {
        const rk = String(r.rule_key ?? '');
        const content = String(r.content ?? '');
        return { title: rk, content, key: `ar:${rk}` };
      }),
    );

    const promptRows = runD1SqlOptional(
      'iam_agent_sam_prompts',
      `SELECT role, content FROM iam_agent_sam_prompts WHERE is_active = 1`,
    );
    chunks.push(
      ...d1OneRowPerChunk('d1:sam_prompts', promptRows, (r) => {
        const role = String(r.role ?? 'prompt');
        const content = String(r.content ?? '');
        const body = `Role: ${role}\n${content}`;
        return { title: role, content: body, key: `prompt:${role}` };
      }),
    );
  }

  return chunks;
}

const MANAGED_SOURCES = [
  'docs:route-map',
  'docs:d1-schema',
  'd1:commands',
  'd1:rules',
  'd1:agent_rules',
  'd1:guardrails',
  'd1:project_memory',
  'd1:sam_prompts',
  'repo:selected',
];

function summarizeBySource(chunks) {
  const m = new Map();
  for (const c of chunks) {
    m.set(c.source, (m.get(c.source) || 0) + 1);
  }
  return m;
}

/** @param {pg.Client} client */
async function loadExistingScoped(client) {
  const res = await client.query(
    `SELECT id, source, source_chunk_id, content_hash, embed_model, tenant_id, workspace_id, project_id
     FROM public.documents
     WHERE tenant_id = $1 AND workspace_id = $2 AND project_id = $3 AND source = ANY($4::text[])`,
    [TENANT_ID, WORKSPACE_ID, PROJECT_ID, MANAGED_SOURCES],
  );
  /** @type {Map<string, { id: string, content_hash: string | null, embed_model: string | null }>} */
  const byScid = new Map();
  for (const row of res.rows) {
    const scid = row.source_chunk_id != null ? String(row.source_chunk_id) : '';
    if (!scid) continue;
    byScid.set(`${row.source}::${scid}`, {
      id: String(row.id),
      content_hash: row.content_hash != null ? String(row.content_hash) : null,
      embed_model: row.embed_model != null ? String(row.embed_model) : null,
    });
  }
  return byScid;
}

/** Prefer first row when same source+source_chunk_id appears twice (e.g. duplicate D1 rows). */
function dedupeChunks(planned) {
  const seen = new Set();
  /** @type {PlannedChunk[]} */
  const out = [];
  /** @type {string[]} */
  const dupKeys = [];
  for (const p of planned) {
    const k = `${p.source}::${p.source_chunk_id}`;
    if (seen.has(k)) {
      dupKeys.push(k);
      continue;
    }
    seen.add(k);
    out.push(p);
  }
  return { chunks: out, duplicateKeys: dupKeys };
}

async function auditBadRows(client) {
  const badEmbed = await client.query(
    `SELECT count(*)::int AS n FROM public.documents
     WHERE tenant_id = $1 AND workspace_id = $2 AND project_id = $3
       AND (embed_model IS NULL OR embed_model = '' OR embed_model <> $4)`,
    [TENANT_ID, WORKSPACE_ID, PROJECT_ID, MODEL],
  );
  const missingScope = await client.query(
    `SELECT count(*)::int AS n FROM public.documents
     WHERE source = ANY($1::text[])
       AND (tenant_id IS NULL OR tenant_id = '' OR workspace_id IS NULL OR workspace_id = '' OR project_id IS NULL OR project_id = '')`,
    [MANAGED_SOURCES],
  );
  return {
    bad_embed_model: badEmbed.rows[0]?.n ?? 0,
    missing_scope: missingScope.rows[0]?.n ?? 0,
  };
}

/** @param {pg.Client} client @param {PlannedChunk} chunk @param {string} vecLiteral */
async function upsertChunk(client, chunk, vecLiteral) {
  const meta = JSON.stringify({
    ...chunk.metadata,
    embed_model: MODEL,
    reingest: 'scripts/reingest-supabase-documents.mjs',
  });
  const r = await client.query(
    `UPDATE public.documents SET
       title = $1,
       content = $2,
       embedding = $3::vector(1024),
       metadata = $4::jsonb,
       embed_model = $5,
       content_hash = $6,
       updated_at = now()
     WHERE tenant_id = $7 AND workspace_id = $8 AND project_id = $9
       AND source = $10 AND source_chunk_id = $11
     RETURNING id`,
    [
      chunk.title,
      chunk.content,
      vecLiteral,
      meta,
      MODEL,
      chunk.content_hash,
      TENANT_ID,
      WORKSPACE_ID,
      PROJECT_ID,
      chunk.source,
      chunk.source_chunk_id,
    ],
  );
  if (r.rowCount) return 'update';
  await client.query(
    `INSERT INTO public.documents (
       tenant_id, workspace_id, project_id, source, title, content,
       embedding, metadata, embed_model, content_hash, source_chunk_id,
       created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::vector(1024),$8::jsonb,$9,$10,$11,now(),now())`,
    [
      TENANT_ID,
      WORKSPACE_ID,
      PROJECT_ID,
      chunk.source,
      chunk.title,
      chunk.content,
      vecLiteral,
      meta,
      MODEL,
      chunk.content_hash,
      chunk.source_chunk_id,
    ],
  );
  return 'insert';
}

async function main() {
  console.log('Supabase documents reingest');
  console.log(`tenant_id: ${TENANT_ID}`);
  console.log(`workspace_id: ${WORKSPACE_ID}`);
  console.log(`project_id: ${PROJECT_ID}`);
  console.log(`embed_model: ${MODEL}`);
  console.log(`mode: ${apply ? 'APPLY (writes)' : 'DRY-RUN (no writes)'}`);
  console.log('');

  if (apply && !token) {
    console.error('Missing CLOUDFLARE_API_TOKEN (required for --apply embeddings)');
    process.exit(1);
  }
  if (!dbUrl && !dryRun) {
    console.error('Missing SUPABASE_DB_URL');
    process.exit(1);
  }
  /** For dry-run diff we still need DB URL */
  if (dryRun && !dbUrl) {
    console.warn('SUPABASE_DB_URL missing — printing source/chunk counts only (no DB diff).\n');
  }

  let rawPlanned;
  try {
    rawPlanned = buildAllPlannedChunks();
  } catch (e) {
    console.error('[reingest] failed to build chunks:', e);
    process.exit(1);
  }

  const { chunks: planned, duplicateKeys: dupKeys } = dedupeChunks(rawPlanned);
  const bySrc = summarizeBySource(planned);

  console.log('Sources (chunk counts, after dedupe):');
  for (const s of MANAGED_SOURCES) {
    const n = bySrc.get(s) ?? 0;
    if (n || verbose) console.log(`  ${s.padEnd(22)} ${n} chunks`);
  }
  console.log('');
  if (dupKeys.length) {
    console.log(`duplicates dropped (same source+source_chunk_id): ${dupKeys.length}`);
    if (verbose) console.log(dupKeys.slice(0, 20));
  }

  if (!dbUrl) {
    console.log('Planned rows:', planned.length);
    console.log('Dry-run complete (no database configured).');
    return;
  }

  const client = new pg.Client(pgClientOptions());
  await client.connect();
  try {
    let cols;
    try {
      const cres = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'documents'`,
      );
      cols = new Set(cres.rows.map((r) => r.column_name));
    } catch (e) {
      console.error(e);
      process.exit(1);
    }

    const required = ['source_chunk_id', 'content_hash', 'tenant_id', 'workspace_id', 'embed_model'];
    const missingCols = required.filter((c) => !cols.has(c));
    if (missingCols.length) {
      console.error(
        `[reingest] public.documents missing columns: ${missingCols.join(', ')} — add them in Supabase before running.`,
      );
      process.exit(1);
    }

    const existing = await loadExistingScoped(client);
    const audit = await auditBadRows(client);

    let inserts = 0;
    let updates = 0;
    let unchanged = 0;
    /** @type {Map<string, Set<string>>} */
    const plannedBySource = new Map();
    for (const p of planned) {
      if (!plannedBySource.has(p.source)) plannedBySource.set(p.source, new Set());
      plannedBySource.get(p.source).add(p.source_chunk_id);
      const k = `${p.source}::${p.source_chunk_id}`;
      const ex = existing.get(k);
      if (!ex) inserts += 1;
      else if (ex.content_hash !== p.content_hash) updates += 1;
      else unchanged += 1;
    }

    let deletes = 0;
    if (!noPrune) {
      for (const source of MANAGED_SOURCES) {
        const want = plannedBySource.get(source) ?? new Set();
        const q = await client.query(
          `SELECT source_chunk_id FROM public.documents
           WHERE tenant_id = $1 AND workspace_id = $2 AND project_id = $3 AND source = $4`,
          [TENANT_ID, WORKSPACE_ID, PROJECT_ID, source],
        );
        for (const row of q.rows) {
          const scid = row.source_chunk_id != null ? String(row.source_chunk_id) : '';
          if (!scid) continue;
          if (!want.has(scid)) deletes += 1;
        }
      }
    }

    console.log('Planned:');
    console.log(`  inserts: ${inserts}`);
    console.log(`  updates: ${updates}`);
    console.log(`  unchanged: ${unchanged}`);
    console.log(`  deletes (orphans in managed sources): ${deletes}${noPrune ? ' (prune disabled)' : ''}`);
    console.log(`  bad embed_model rows (scoped, != ${MODEL}): ${audit.bad_embed_model}`);
    console.log(`  missing tenant/workspace/project (managed sources): ${audit.missing_scope}`);
    console.log('');

    if (!apply) {
      console.log('Dry-run complete. No writes performed.');
      return;
    }

    if (!token) {
      console.error('Missing CLOUDFLARE_API_TOKEN');
      process.exit(1);
    }

    let appliedIns = 0;
    let appliedUpd = 0;
    let n = 0;
    for (const chunk of planned) {
      n += 1;
      const vec = await embedText(chunk.content);
      const literal = '[' + vec.join(',') + ']';
      const kind = await upsertChunk(client, chunk, literal);
      if (kind === 'insert') appliedIns += 1;
      else appliedUpd += 1;
      if (n % 25 === 0) console.log(`  ... embedded ${n}/${planned.length}`);
      await sleep(DELAY_MS);
    }

    if (!noPrune) {
      for (const source of MANAGED_SOURCES) {
        const want = plannedBySource.get(source) ?? new Set();
        if (want.size === 0) continue;
        const arr = [...want];
        await client.query(
          `DELETE FROM public.documents
           WHERE tenant_id = $1 AND workspace_id = $2 AND project_id = $3
             AND source = $4
             AND NOT (source_chunk_id = ANY($5::text[]))`,
          [TENANT_ID, WORKSPACE_ID, PROJECT_ID, source, arr],
        );
      }
    }

    console.log('');
    console.log(`Apply complete. inserted ${appliedIns}, updated ${appliedUpd}.`);
  } finally {
    await client.end().catch(() => {});
  }
}

await main().catch((e) => {
  console.error(e);
  process.exit(1);
});
