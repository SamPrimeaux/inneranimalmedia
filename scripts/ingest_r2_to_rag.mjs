#!/usr/bin/env node
/**
 * ingest_r2_to_rag.mjs
 *
 * Ingest three R2 content batches into:
 *   - Supabase: agentsam.agentsam_documents_oai3large_1536
 *   - CF Vectorize: agentsam-documents-oai3large-1536  (binding AGENTSAM_VECTORIZE_DOCUMENTS)
 *   - D1: vectorize_sync_log  (receipt, vectorize_index explicit — no default)
 *
 * Batches:
 *   1. inneranimalmedia-autorag/knowledge/agentsam/dashboard-agent-audit/**
 *   2. inneranimalmedia-autorag/recipes/**
 *   3. inneranimalmedia-autorag/skills/cloudflare/references/**
 *
 * Schema sourced from live prod on 2026-06-06:
 *   agentsam_documents_oai3large_1536 columns (28):
 *     id uuid DEFAULT gen_random_uuid()
 *     workspace_id uuid NOT NULL        → 'fa1f12a8-c841-4b79-a26c-d53a78b17dac' (ws_inneranimalmedia)
 *     user_id uuid NULL                 → NULL (platform ingest, not user-initiated)
 *     title text NULL
 *     content text NOT NULL
 *     source_type text DEFAULT 'document' → set per batch (see BATCH_CONFIG)
 *     source_url text NULL              → NULL
 *     source_path text NULL             → r2_key relative path
 *     source_ref text NULL              → "<source_type>/<slug>#<chunk_index>"
 *     course_id text NULL               → NULL
 *     module_id text NULL               → NULL
 *     lesson_id text NULL               → NULL
 *     slug text NULL                    → derived from r2_key (no ext, slashes→dashes)
 *     heading_path text[] DEFAULT '{}'  → H2 section title in array
 *     chunk_index integer DEFAULT 0
 *     chunk_type text DEFAULT 'section'
 *     content_hash text NULL            → sha256 of content
 *     token_count integer NULL          → rough estimate (chars/4)
 *     embedding vector(1536) NULL       → filled after OpenAI call
 *     embedding_model text DEFAULT 'text-embedding-3-large'  → hardcoded
 *     embedding_dims integer DEFAULT 1536                    → hardcoded
 *     embedded_at timestamptz NULL      → set on insert
 *     vectorize_binding text DEFAULT 'AGENTSAM_VECTORIZE_COURSES' → OVERRIDE to AGENTSAM_VECTORIZE_DOCUMENTS
 *     vectorize_index text DEFAULT 'agentsam-documents-oai3large-1536' → explicit match
 *     vectorize_id text NULL            → set to supabase row UUID after insert (used as Vectorize vector id)
 *     metadata jsonb DEFAULT '{}'       → { r2_key, source_type, bucket, chunk_strategy, section }
 *     created_at timestamptz DEFAULT now()
 *     updated_at timestamptz DEFAULT now()
 *
 *   vectorize_sync_log columns (4) — migration 585 applied:
 *     chunk_id TEXT PRIMARY KEY         → r2:<r2_key> (one row per R2 file)
 *     vectorize_index TEXT NOT NULL     → 'agentsam-documents-oai3large-1536' (EXPLICIT, no default)
 *     status TEXT DEFAULT 'ok'
 *     synced_at INTEGER DEFAULT unixepoch()
 *
 * CF Vectorize upsert shape (REST API v2):
 *   POST /accounts/{account_id}/vectorize/v2/indexes/{index_name}/upsert
 *   Body: NDJSON — one vector per line:
 *     { "id": "<supabase_uuid>", "values": [1536 floats], "metadata": { r2_key, source_type, title, chunk_index } }
 *   Note: id maxLength=64, must be unique. Using supabase UUID (36 chars) as the vector id.
 *   Upsert overwrites existing vectors with same id — safe for re-runs.
 *
 * Required env (from .env.cloudflare or shell):
 *   OPENAI_API_KEY          — for text-embedding-3-large
 *   SUPABASE_DB_URL         — direct Postgres connection string (not Hyperdrive)
 *   CLOUDFLARE_API_TOKEN    — needs Vectorize Write permission
 *   CLOUDFLARE_ACCOUNT_ID   — default: ede6590ac0d2fb7daf155b35653457b2
 *
 * D1 writes use wrangler CLI (remote) via the same pattern as existing ingest scripts.
 *
 * Usage:
 *   # dry run (no writes):
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_r2_to_rag.mjs --dry-run
 *
 *   # single batch:
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_r2_to_rag.mjs --batch=audit
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_r2_to_rag.mjs --batch=recipes
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_r2_to_rag.mjs --batch=skills
 *
 *   # all batches:
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_r2_to_rag.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import pathMod from 'path';
import pg from 'pg';

// ─── Load .env.cloudflare ────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathMod.join(__dirname, '..');

try {
  const lines = readFileSync(resolve(ROOT, '.env.cloudflare'), 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '');
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch { /* CI: no .env.cloudflare */ }

// ─── Constants (sourced from live prod) ──────────────────────────────────────
const ACCOUNT_ID       = process.env.CLOUDFLARE_API_TOKEN
  ? (process.env.CLOUDFLARE_ACCOUNT_ID || 'ede6590ac0d2fb7daf155b35653457b2')
  : 'ede6590ac0d2fb7daf155b35653457b2';

// Supabase workspace UUID for ws_inneranimalmedia (from live agentsam_workspaces)
const WORKSPACE_UUID   = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac';

// Active CF Vectorize index for documents lane (from wrangler vectorize list)
const VECTORIZE_INDEX  = 'agentsam-documents-oai3large-1536';
const VECTORIZE_BINDING = 'AGENTSAM_VECTORIZE_DOCUMENTS';

// OpenAI embedding model — must match embedding_dims=1536
const EMBED_MODEL      = 'text-embedding-3-large';
const EMBED_DIMS       = 1536;

// R2 bucket (from live R2 listing — this is the active bucket)
const R2_BUCKET        = 'inneranimalmedia-autorag';

// CF Vectorize REST API v2 upsert endpoint
const VECTORIZE_UPSERT_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${VECTORIZE_INDEX}/upsert`;

// D1 database name and config
const D1_DB_NAME       = 'inneranimalmedia-business';
const D1_TOML          = 'wrangler.production.toml';

// Rate limiting
const EMBED_DELAY_MS   = Number(process.env.INGEST_DELAY_MS || 200);
const VECTORIZE_BATCH  = 100; // max vectors per upsert call

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_ARG = (args.find(a => a.startsWith('--batch=')) || '').replace('--batch=', '') || null;

// ─── Batch config ─────────────────────────────────────────────────────────────
// source_type values that make sense for agentsam_match_documents filter
const BATCH_CONFIG = {
  audit: {
    prefix: 'knowledge/agentsam/dashboard-agent-audit/',
    source_type: 'knowledge',
    label: 'dashboard-agent-audit',
    // skip these — not actual content files
    skip_keys: ['r2-upload-credentials.md', 'r2-upload-manifest.json', 'r2-upload-notes.md'],
  },
  recipes: {
    prefix: 'recipes/',
    source_type: 'recipe',
    label: 'recipes',
    skip_keys: [],
  },
  skills: {
    prefix: 'skills/cloudflare/references/',
    source_type: 'skill',
    label: 'cloudflare-references',
    skip_keys: ['SKILL.md.backup'],
  },
};

// ─── Env validation ───────────────────────────────────────────────────────────
const OPENAI_KEY   = (process.env.OPENAI_API_KEY || '').trim();
const CF_TOKEN     = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
const SUPABASE_URL = (process.env.SUPABASE_DB_URL || '').trim();

if (!DRY_RUN) {
  if (!OPENAI_KEY)   { console.error('❌ Missing OPENAI_API_KEY'); process.exit(1); }
  if (!CF_TOKEN)     { console.error('❌ Missing CLOUDFLARE_API_TOKEN'); process.exit(1); }
  if (!SUPABASE_URL) { console.error('❌ Missing SUPABASE_DB_URL'); process.exit(1); }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function contentHash(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

function estimateTokens(str) {
  return Math.ceil(str.length / 4);
}

/** Derive slug from r2 key: strip prefix, drop extension, slashes→dashes */
function slugFromKey(r2Key, prefix) {
  let rel = r2Key.startsWith(prefix) ? r2Key.slice(prefix.length) : r2Key;
  rel = rel.replace(/\.[^/.]+$/, ''); // strip extension
  return rel.replace(/\//g, '-').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Split markdown into H2 sections.
 * If no H2s found, treat entire file as a single chunk.
 */
function splitMarkdownH2(md, title) {
  const parts = md.split(/^## /m);
  if (parts.length <= 1) {
    // No H2 — whole file is one chunk
    return [{ heading: title, content: md.trim() }];
  }
  const out = [];
  // parts[0] is content before first H2 (preamble/title)
  const preamble = parts[0].trim();
  if (preamble.length > 100) {
    out.push({ heading: title, content: preamble });
  }
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const nl = chunk.indexOf('\n');
    const heading = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
    const content = `## ${chunk}`.trim();
    if (content.length > 50) { // skip near-empty sections
      out.push({ heading, content });
    }
  }
  return out;
}

// ─── OpenAI embedding ─────────────────────────────────────────────────────────
async function embedText(text) {
  const truncated = text.length > 32000 ? text.slice(0, 32000) : text;
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: truncated }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`OpenAI embed HTTP ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) {
    throw new Error(`Unexpected embed shape: length=${vec?.length} expected=${EMBED_DIMS}`);
  }
  return vec;
}

// ─── CF Vectorize upsert (REST API v2) ───────────────────────────────────────
/**
 * Upsert a batch of vectors via CF REST API v2.
 * Body is NDJSON (one JSON object per line, no wrapping array).
 * vector.id must be ≤ 64 chars. We use supabase UUID (36 chars).
 */
async function vectorizeUpsertBatch(vectors) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would upsert ${vectors.length} vectors to ${VECTORIZE_INDEX}`);
    return;
  }
  const ndjson = vectors
    .map(v => JSON.stringify({
      id: v.id,               // supabase UUID — 36 chars, within maxLength=64
      values: v.values,
      metadata: v.metadata,   // { r2_key, source_type, title, chunk_index }
    }))
    .join('\n');

  const res = await fetch(VECTORIZE_UPSERT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/x-ndjson',
    },
    body: ndjson,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`Vectorize upsert HTTP ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  // json.result.mutationId is returned — async, propagates within seconds
  console.log(`  ✓ Vectorize upsert ${vectors.length} vecs — mutationId: ${json.result?.mutationId ?? 'n/a'}`);
}

// ─── R2 list objects ──────────────────────────────────────────────────────────
/**
 * List all objects under a prefix in R2 using CF REST API.
 * Returns array of { key, size }.
 */
async function r2ListObjects(prefix) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects?prefix=${encodeURIComponent(prefix)}&limit=1000`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${CF_TOKEN}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`R2 list HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return (json.result?.objects || []).map(o => ({ key: o.key, size: o.size }));
}

/** Fetch a single R2 object as text */
async function r2GetText(key) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${CF_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`R2 get HTTP ${res.status} for key=${key}`);
  }
  return await res.text();
}

// ─── Supabase (direct pg) ─────────────────────────────────────────────────────
function pgClientOptions() {
  const useSsl = /supabase\.co|pooler\.supabase\.com|supabase\.com/.test(SUPABASE_URL);
  return {
    connectionString: SUPABASE_URL,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

/**
 * Upsert a document row into agentsam.agentsam_documents_oai3large_1536.
 * Uses content_hash + source_path + chunk_index as natural dedup key.
 * Returns the inserted/existing row UUID.
 *
 * All 28 columns explicitly set — no reliance on column defaults except
 * created_at/updated_at/id (gen_random_uuid).
 *
 * ON CONFLICT strategy: if same source_path + chunk_index already exists
 * with same content_hash → skip (return existing id).
 * Different content_hash → update content + embedding + embedded_at.
 */
async function upsertSupabaseRow(client, {
  title,
  content,
  source_type,
  source_path,
  source_ref,
  slug,
  heading,
  chunk_index,
  content_hash_val,
  token_count,
  embedding,
  r2_key,
}) {
  const vecLiteral = '[' + embedding.join(',') + ']';
  const now = new Date().toISOString();

  const result = await client.query(
    `INSERT INTO agentsam.agentsam_documents_oai3large_1536 (
      workspace_id,
      user_id,
      title,
      content,
      source_type,
      source_url,
      source_path,
      source_ref,
      course_id,
      module_id,
      lesson_id,
      slug,
      heading_path,
      chunk_index,
      chunk_type,
      content_hash,
      token_count,
      embedding,
      embedding_model,
      embedding_dims,
      embedded_at,
      vectorize_binding,
      vectorize_index,
      vectorize_id,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      $1,  -- workspace_id
      NULL, -- user_id
      $2,  -- title
      $3,  -- content
      $4,  -- source_type
      NULL, -- source_url
      $5,  -- source_path
      $6,  -- source_ref
      NULL, -- course_id
      NULL, -- module_id
      NULL, -- lesson_id
      $7,  -- slug
      $8,  -- heading_path (text[])
      $9,  -- chunk_index
      'section', -- chunk_type
      $10, -- content_hash
      $11, -- token_count
      $12::vector, -- embedding
      'text-embedding-3-large', -- embedding_model
      1536, -- embedding_dims
      $13, -- embedded_at
      'AGENTSAM_VECTORIZE_DOCUMENTS', -- vectorize_binding (override column default)
      'agentsam-documents-oai3large-1536', -- vectorize_index
      NULL, -- vectorize_id (set after insert via UPDATE)
      $14::jsonb, -- metadata
      $13, -- created_at
      $13  -- updated_at
    )
    ON CONFLICT (source_path, chunk_index)
    DO UPDATE SET
      content        = EXCLUDED.content,
      content_hash   = EXCLUDED.content_hash,
      embedding      = EXCLUDED.embedding,
      embedded_at    = EXCLUDED.embedded_at,
      token_count    = EXCLUDED.token_count,
      title          = EXCLUDED.title,
      heading_path   = EXCLUDED.heading_path,
      metadata       = EXCLUDED.metadata,
      updated_at     = EXCLUDED.updated_at
    WHERE agentsam.agentsam_documents_oai3large_1536.content_hash IS DISTINCT FROM EXCLUDED.content_hash
       OR agentsam.agentsam_documents_oai3large_1536.embedding IS NULL
    RETURNING id`,
    [
      WORKSPACE_UUID,                          // $1
      title,                                   // $2
      content,                                 // $3
      source_type,                             // $4
      source_path,                             // $5
      source_ref,                              // $6
      slug,                                    // $7
      [heading],                               // $8 heading_path text[]
      chunk_index,                             // $9
      content_hash_val,                        // $10
      token_count,                             // $11
      vecLiteral,                              // $12
      now,                                     // $13
      JSON.stringify({                         // $14 metadata
        r2_key,
        bucket: R2_BUCKET,
        source_type,
        section: heading,
        chunk_index,
        chunk_strategy: 'h2_section',
      }),
    ]
  );

  if (result.rows.length === 0) {
    // ON CONFLICT hit but WHERE clause meant no update (content_hash unchanged)
    // Fetch existing id
    const existing = await client.query(
      `SELECT id FROM agentsam.agentsam_documents_oai3large_1536
       WHERE workspace_id = $1 AND source_path = $2 AND chunk_index = $3`,
      [WORKSPACE_UUID, source_path, chunk_index]
    );
    return existing.rows[0]?.id ?? null;
  }

  const rowId = result.rows[0].id;

  // Update vectorize_id to match the row UUID (used as CF Vectorize vector id)
  await client.query(
    `UPDATE agentsam.agentsam_documents_oai3large_1536
     SET vectorize_id = $1 WHERE id = $1`,
    [rowId]
  );

  return rowId;
}

// ─── D1 vectorize_sync_log ────────────────────────────────────────────────────
const WRAPPER = pathMod.join(ROOT, 'scripts', 'with-cloudflare-env.sh');
const D1_ARGS_BASE = [
  'npx', 'wrangler', 'd1', 'execute', D1_DB_NAME,
  '--remote', '-c', D1_TOML, '--json',
];

function d1Write(sql) {
  if (DRY_RUN) {
    console.log(`  [dry-run] D1: ${sql.slice(0, 120)}...`);
    return;
  }
  execFileSync(WRAPPER, [...D1_ARGS_BASE, '--command', sql], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

/**
 * Write one coarse receipt per R2 file to D1 vectorize_sync_log.
 * vectorize_index is always explicit — migration 585 removed the stale default.
 */
function logR2FileVectorizeSync(r2Key) {
  const chunkId = `r2:${String(r2Key).replace(/'/g, "''")}`;
  d1Write(
    `INSERT INTO vectorize_sync_log (chunk_id, vectorize_index, status, synced_at)
     VALUES ('${chunkId}', '${VECTORIZE_INDEX}', 'ok', unixepoch())
     ON CONFLICT (chunk_id) DO UPDATE SET
       vectorize_index = '${VECTORIZE_INDEX}',
       status = 'ok',
       synced_at = unixepoch()`,
  );
}

// ─── Check existing content_hash to skip unchanged files ─────────────────────
async function fetchExistingHashes(client, source_paths) {
  if (source_paths.length === 0) return new Map();
  const result = await client.query(
    `SELECT source_path, chunk_index, content_hash, id
     FROM agentsam.agentsam_documents_oai3large_1536
     WHERE workspace_id = $1 AND source_path = ANY($2)`,
    [WORKSPACE_UUID, source_paths]
  );
  const map = new Map();
  for (const row of result.rows) {
    map.set(`${row.source_path}::${row.chunk_index}`, { hash: row.content_hash, id: row.id });
  }
  return map;
}

// ─── Process one batch ────────────────────────────────────────────────────────
async function processBatch(client, batchKey) {
  const cfg = BATCH_CONFIG[batchKey];
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Batch: ${cfg.label}  prefix=${cfg.prefix}  source_type=${cfg.source_type}`);
  console.log(`${'─'.repeat(60)}`);

  // 1. List R2 objects
  const objects = await r2ListObjects(cfg.prefix);
  const files = objects.filter(o => {
    if (o.size === 0) return false; // folder markers
    if (o.key.endsWith('/')) return false;
    if (!o.key.match(/\.(md|txt|json)$/i)) return false; // only text content
    const basename = o.key.split('/').pop();
    if (cfg.skip_keys.includes(basename)) return false;
    if (basename.endsWith('.meta.md')) return false; // skip meta sidecars
    return true;
  });

  console.log(`Found ${files.length} ingestable files (of ${objects.length} total objects)`);
  if (files.length === 0) { console.log('Nothing to ingest.'); return { processed: 0, skipped: 0, errors: 0 }; }

  // 2. Pre-fetch existing hashes for dedup
  const sourcePaths = files.map(f => f.key);
  const existingMap = await fetchExistingHashes(client, sourcePaths);
  console.log(`Found ${existingMap.size} existing chunk records in Supabase`);

  // 3. Process files
  let processed = 0, skipped = 0, errors = 0;
  const vectorizeQueue = []; // accumulate for batch upsert

  for (const file of files) {
    try {
      const r2Key = file.key;
      const relPath = r2Key.startsWith(cfg.prefix) ? r2Key.slice(cfg.prefix.length) : r2Key;
      const fileTitle = relPath.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      const slug = slugFromKey(r2Key, cfg.prefix);

      // Fetch content
      const rawContent = await r2GetText(r2Key);
      if (!rawContent || rawContent.trim().length < 20) {
        console.log(`  skip (empty): ${r2Key}`);
        skipped++;
        continue;
      }

      // Split into H2 chunks
      const chunks = splitMarkdownH2(rawContent, fileTitle);

      for (let ci = 0; ci < chunks.length; ci++) {
        const { heading, content } = chunks[ci];
        const hash = contentHash(content);
        const existingKey = `${r2Key}::${ci}`;
        const existing = existingMap.get(existingKey);

        // Skip if content unchanged and already embedded
        if (existing && existing.hash === hash) {
          skipped++;
          continue;
        }

        if (DRY_RUN) {
          console.log(`  [dry-run] would embed: ${r2Key} chunk=${ci} heading="${heading}" tokens~${estimateTokens(content)}`);
          processed++;
          continue;
        }

        // Embed
        const embedding = await embedText(content);
        await sleep(EMBED_DELAY_MS);

        // Upsert Supabase
        const rowId = await upsertSupabaseRow(client, {
          title: `${fileTitle} — ${heading}`,
          content,
          source_type: cfg.source_type,
          source_path: r2Key,
          source_ref: `${cfg.source_type}/${slug}#${ci}`,
          slug,
          heading,
          chunk_index: ci,
          content_hash_val: hash,
          token_count: estimateTokens(content),
          embedding,
          r2_key: r2Key,
        });

        if (!rowId) {
          console.log(`  warning: no rowId returned for ${r2Key} chunk=${ci}`);
          errors++;
          continue;
        }

        // Queue for Vectorize batch upsert
        vectorizeQueue.push({
          id: rowId,  // supabase UUID, 36 chars ≤ maxLength=64
          values: embedding,
          metadata: {
            r2_key: r2Key,
            source_type: cfg.source_type,
            title: `${fileTitle} — ${heading}`,
            chunk_index: ci,
          },
        });

        processed++;
        if (processed % 10 === 0) {
          console.log(`  ... ${processed} chunks embedded (${skipped} skipped, ${errors} errors)`);
        }

        // Flush Vectorize batch
        if (vectorizeQueue.length >= VECTORIZE_BATCH) {
          await vectorizeUpsertBatch(vectorizeQueue.splice(0, VECTORIZE_BATCH));
        }
      }

      if (!DRY_RUN) {
        if (vectorizeQueue.length > 0) {
          await vectorizeUpsertBatch(vectorizeQueue.splice(0));
        }
        logR2FileVectorizeSync(r2Key);
      }
    } catch (err) {
      console.error(`  ❌ Error processing ${file.key}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nBatch ${cfg.label} complete: ${processed} embedded, ${skipped} skipped, ${errors} errors`);
  return { processed, skipped, errors };
}

// ─── Conflict index check ──────────────────────────────────────────────────────
/**
 * The ON CONFLICT clause on upsertSupabaseRow requires a unique index on
 * (source_path, chunk_index). Verify it exists before running to avoid
 * silent full-table scans or errors.
 */
async function verifyUniqueIndex(client) {
  const res = await client.query(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'agentsam'
       AND tablename = 'agentsam_documents_oai3large_1536'
       AND indexdef ILIKE '%source_path%chunk_index%'`
  );
  if (res.rows.length === 0) {
    console.warn(
      '\n⚠️  No unique index on (source_path, chunk_index) found in agentsam_documents_oai3large_1536.\n' +
      '   ON CONFLICT will fail. Run migration to add it first:\n\n' +
      '   CREATE UNIQUE INDEX IF NOT EXISTS agentsam_docs_source_chunk_uniq\n' +
      '     ON agentsam.agentsam_documents_oai3large_1536 (workspace_id, source_path, chunk_index);\n'
    );
    return false;
  }
  console.log(`✓ Unique index verified: ${res.rows.map(r => r.indexname).join(', ')}`);
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log(`\ningest_r2_to_rag.mjs`);
console.log(`mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
console.log(`batch filter: ${BATCH_ARG || 'all'}`);
console.log(`target Vectorize index: ${VECTORIZE_INDEX} (${EMBED_DIMS}d, cosine)`);
console.log(`target Supabase table: agentsam.agentsam_documents_oai3large_1536`);
console.log(`workspace_uuid: ${WORKSPACE_UUID}`);
console.log(`R2 bucket: ${R2_BUCKET}\n`);

const batchesToRun = BATCH_ARG
  ? (BATCH_CONFIG[BATCH_ARG] ? [BATCH_ARG] : (() => { console.error(`Unknown batch: ${BATCH_ARG}. Valid: ${Object.keys(BATCH_CONFIG).join(', ')}`); process.exit(1); })())
  : Object.keys(BATCH_CONFIG);

const client = DRY_RUN ? null : new pg.Client(pgClientOptions());
if (!DRY_RUN) await client.connect();

try {
  if (!DRY_RUN) {
    const indexOk = await verifyUniqueIndex(client);
    if (!indexOk) {
      console.error('\nAborting — fix the unique index first (see warning above).');
      process.exit(1);
    }
  }

  const totals = { processed: 0, skipped: 0, errors: 0 };
  for (const bk of batchesToRun) {
    const result = await processBatch(client, bk);
    totals.processed += result.processed;
    totals.skipped += result.skipped;
    totals.errors += result.errors;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`TOTAL: ${totals.processed} embedded  ${totals.skipped} skipped  ${totals.errors} errors`);
  console.log(`Vectorize index: ${VECTORIZE_INDEX}`);
  console.log(`Note: CF Vectorize propagation takes ~5-10s after upsert.`);
  console.log(`${'═'.repeat(60)}\n`);

} finally {
  if (!DRY_RUN && client) await client.end().catch(() => {});
}
