#!/usr/bin/env node
/**
 * D1 agentsam_memory byok_sprint_router_v1 → Supabase agentsam_memory_oai3large_1536 + AGENTSAM_VECTORIZE_MEMORY.
 *
 *   ./scripts/with-cloudflare-env.sh node scripts/sync_byok_sprint_memory_vector.mjs --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/sync_byok_sprint_memory_vector.mjs
 */
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import {
  buildReceiptDetails,
  createRunId,
  openaiEmbedBatch,
  resolveGitCommitSha,
  vectorizeUpsertNdjson,
  writeVectorizeSyncReceipt,
} from './lib/rag-ingest-protocol.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const MEMORY_KEY = 'byok_sprint_router_v1';
const TENANT_ID = 'tenant_sam_primeaux';
const USER_ID = 'au_871d920d1233cbd1';
const WORKSPACE_D1 = 'ws_inneranimalmedia';
const WORKSPACE_UUID = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac';
const PG_TABLE = 'agentsam_memory_oai3large_1536';
const VECTORIZE_INDEX = 'agentsam-memory-oai3large-1536';
const VECTORIZE_BINDING = 'AGENTSAM_VECTORIZE_MEMORY';
const EMBED_MODEL = 'text-embedding-3-large';
const EMBED_DIMS = 1536;
const SCRIPT_KEY = 'sync_byok_sprint_memory_vector';

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run') };
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
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
    { cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 8 * 1024 * 1024 },
  );
  const start = out.indexOf('[');
  return JSON.parse(out.slice(start))[0]?.results ?? [];
}

function pgOptions(dbUrl) {
  const useSsl = /supabase\.(co|com)/.test(dbUrl);
  return { connectionString: dbUrl, ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}) };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const runId = createRunId();
  const gitSha = resolveGitCommitSha(ROOT);

  const rows = d1Json(
    `SELECT id, key, value, title, summary, memory_type, source, tags, sync_key, created_at, updated_at
     FROM agentsam_memory
     WHERE tenant_id = '${sqlEscape(TENANT_ID)}'
       AND user_id = '${sqlEscape(USER_ID)}'
       AND key = '${sqlEscape(MEMORY_KEY)}'
     LIMIT 1`,
  );
  const row = rows[0];
  if (!row?.value) die(`D1 memory not found: ${MEMORY_KEY}`);

  const title = String(row.title || 'BYOK sprint router').slice(0, 500);
  const content = String(row.value || '').trim();
  const embedText = `${title}\n\n${content}`;
  const tokenEst = Math.max(1, Math.ceil(embedText.length / 4));

  console.log(`${SCRIPT_KEY} — ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`run_id: ${runId}`);
  console.log(`memory_key: ${MEMORY_KEY}`);
  console.log(`workspace: ${WORKSPACE_D1} → ${WORKSPACE_UUID}`);
  console.log(`embed ~${tokenEst} tok → ${PG_TABLE} + ${VECTORIZE_INDEX}`);

  if (dryRun) return;

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const dbUrl = String(process.env.SUPABASE_DB_URL || '').trim();
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const cfToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!apiKey) die('OPENAI_API_KEY required');
  if (!dbUrl) die('SUPABASE_DB_URL required');
  if (!accountId || !cfToken) die('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required');

  const [embedding] = await openaiEmbedBatch({
    apiKey,
    texts: [embedText],
    model: EMBED_MODEL,
    dims: EMBED_DIMS,
  });
  const vecLiteral = `[${embedding.join(',')}]`;
  const metadata = {
    d1_id: String(row.id),
    user_id_d1: USER_ID,
    memory_type: String(row.memory_type || 'decision'),
    tenant_id: TENANT_ID,
    sync_key: String(row.sync_key || ''),
    topic: 'byok_sprint',
    doc_type: 'byok_sprint_router',
    is_pinned: true,
  };
  const source = String(row.source || 'migration_640_byok_sprint_router').slice(0, 120);

  const client = new pg.Client(pgOptions(dbUrl));
  await client.connect();

  try {
    const existing = await client.query(
      `SELECT id FROM agentsam.${PG_TABLE}
       WHERE workspace_id = $1::uuid AND memory_key = $2 LIMIT 1`,
      [WORKSPACE_UUID, MEMORY_KEY],
    );
    const pgRowId = existing.rows[0]?.id ?? crypto.randomUUID();

    if (existing.rows[0]?.id) {
      await client.query(
        `UPDATE agentsam.${PG_TABLE}
         SET content = $2, title = $3, embedding = $4::vector(1536),
             source = $5, metadata = $6::jsonb,
             vectorize_binding = $7, vectorize_index = $8,
             embedded_at = now(), updated_at = now()
         WHERE id = $1::uuid`,
        [pgRowId, content, title, vecLiteral, source, JSON.stringify(metadata), VECTORIZE_BINDING, VECTORIZE_INDEX],
      );
    } else {
      await client.query(
        `INSERT INTO agentsam.${PG_TABLE} (
           id, workspace_id, user_id, oauth_client_id, memory_key, content, title,
           embedding, source, metadata, created_at, updated_at,
           vectorize_binding, vectorize_index, embedded_at
         ) VALUES (
           $1::uuid, $2::uuid, NULL, NULL, $3, $4, $5,
           $6::vector(1536), $7, $8::jsonb, now(), now(),
           $9, $10, now()
         )`,
        [
          pgRowId,
          WORKSPACE_UUID,
          MEMORY_KEY,
          content,
          title,
          vecLiteral,
          source,
          JSON.stringify(metadata),
          VECTORIZE_BINDING,
          VECTORIZE_INDEX,
        ],
      );
    }

    await vectorizeUpsertNdjson({
      accountId,
      token: cfToken,
      index: VECTORIZE_INDEX,
      vectors: [
        {
          id: String(pgRowId),
          values: embedding,
          metadata: {
            workspace_id: WORKSPACE_D1,
            memory_key: MEMORY_KEY,
            title,
            source,
            topic: 'byok_sprint',
            doc_type: 'byok_sprint_router',
          },
        },
      ],
    });

    await client.query(
      `UPDATE agentsam.${PG_TABLE} SET vectorize_id = $1, updated_at = now() WHERE id = $1::uuid`,
      [pgRowId],
    );

    d1Json(
      `UPDATE agentsam_memory SET embedded_at = unixepoch(), updated_at = unixepoch()
       WHERE id = '${sqlEscape(String(row.id))}'`,
    );

    writeVectorizeSyncReceipt({
      root: ROOT,
      chunk_id: `run:${SCRIPT_KEY}:${MEMORY_KEY}`,
      vectorize_index: VECTORIZE_INDEX,
      status: 'ok',
      details: buildReceiptDetails({
        run_id: runId,
        script_key: SCRIPT_KEY,
        git_commit_sha: gitSha,
        workspace_id: WORKSPACE_D1,
        workspace_uuid: WORKSPACE_UUID,
        vectorize_index: VECTORIZE_INDEX,
        lane: 'memory',
        binding: VECTORIZE_BINDING,
        embed_model: EMBED_MODEL,
        embed_dims: EMBED_DIMS,
        chunks_embedded: 1,
        files_indexed: 1,
        status: 'ok',
        memory_key: MEMORY_KEY,
        pg_row_id: pgRowId,
      }),
      dryRun: false,
    });

    console.log(`✓ ${MEMORY_KEY} → agentsam.${PG_TABLE} id=${pgRowId} + ${VECTORIZE_INDEX}`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
