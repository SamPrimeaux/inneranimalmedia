/**
 * Sync a pinned D1 agentsam_memory router to:
 *  - agentsam.agentsam_memory_oai3large_1536 (+ Vectorize) for memory_semantic_search
 *  - agentsam.agentsam_memory for agentsam_memory_manager (private ILIKE tier)
 *  - D1 agentsam_memory.embedding_id + embedded_at
 */
import { execFileSync } from 'child_process';
import pg from 'pg';
import {
  buildReceiptDetails,
  openaiEmbedBatch,
  vectorizeUpsertNdjson,
  writeVectorizeSyncReceipt,
} from './rag-ingest-protocol.mjs';

const PG_VECTOR_TABLE = 'agentsam_memory_oai3large_1536';
const PG_PRIVATE_TABLE = 'agentsam_memory';
const VECTORIZE_INDEX = 'agentsam-memory-oai3large-1536';
const VECTORIZE_BINDING = 'AGENTSAM_VECTORIZE_MEMORY';
const EMBED_MODEL = 'text-embedding-3-large';
const EMBED_DIMS = 1536;

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

export function d1JsonFromRoot(root, sql) {
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
    { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 8 * 1024 * 1024 },
  );
  const start = out.indexOf('[');
  return JSON.parse(out.slice(start))[0]?.results ?? [];
}

function pgOptions(dbUrl) {
  const useSsl = /supabase\.(co|com)/.test(dbUrl);
  return { connectionString: dbUrl, ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}) };
}

function parseTags(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw == null || raw === '') return [];
  try {
    const p = JSON.parse(String(raw));
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

/**
 * @param {{
 *   root: string,
 *   runId: string,
 *   gitSha: string,
 *   memoryKey: string,
 *   tenantId: string,
 *   userId: string,
 *   workspaceD1: string,
 *   workspaceUuid: string,
 *   scriptKey: string,
 *   topic: string,
 *   docType: string,
 *   defaultSource: string,
 *   dryRun?: boolean,
 * }} opts
 */
export async function syncSprintMemoryRouter(opts) {
  const {
    root,
    runId,
    gitSha,
    memoryKey,
    tenantId,
    userId,
    workspaceD1,
    workspaceUuid,
    scriptKey,
    topic,
    docType,
    defaultSource,
    dryRun = false,
  } = opts;

  const rows = d1JsonFromRoot(
    root,
    `SELECT id, key, value, title, summary, memory_type, source, tags, sync_key,
            confidence, importance, is_pinned, workspace_id
     FROM agentsam_memory
     WHERE tenant_id = '${sqlEscape(tenantId)}'
       AND user_id = '${sqlEscape(userId)}'
       AND key = '${sqlEscape(memoryKey)}'
     LIMIT 1`,
  );
  const row = rows[0];
  if (!row?.value) {
    throw new Error(`D1 memory not found: ${memoryKey}`);
  }

  const title = String(row.title || memoryKey).slice(0, 500);
  const content = String(row.value || '').trim();
  const summary = String(row.summary || content.slice(0, 400)).slice(0, 2000);
  const embedText = `${title}\n\n${content}`;
  const tokenEst = Math.max(1, Math.ceil(embedText.length / 4));
  const d1Workspace = String(row.workspace_id || workspaceD1).trim() || workspaceD1;
  const syncKey =
    String(row.sync_key || '').trim() || `${tenantId}:${userId}:${memoryKey}`;
  const tags = parseTags(row.tags);
  const importance = Math.min(10, Math.max(1, Number(row.importance) || 5));
  const isPinned = row.is_pinned === 1 || row.is_pinned === true;
  const source = String(row.source || defaultSource).slice(0, 120);

  console.log(`memory_key: ${memoryKey}`);
  console.log(`embed ~${tokenEst} tok → vector ${PG_VECTOR_TABLE} + private ${PG_PRIVATE_TABLE}`);

  if (dryRun) return { dryRun: true, memoryKey, tokenEst };

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const dbUrl = String(process.env.SUPABASE_DB_URL || '').trim();
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const cfToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY required');
  if (!dbUrl) throw new Error('SUPABASE_DB_URL required');
  if (!accountId || !cfToken) throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required');

  const [embedding] = await openaiEmbedBatch({
    apiKey,
    texts: [embedText],
    model: EMBED_MODEL,
    dims: EMBED_DIMS,
  });
  const vecLiteral = `[${embedding.join(',')}]`;
  const metadata = {
    d1_id: String(row.id),
    user_id_d1: userId,
    memory_type: String(row.memory_type || 'decision'),
    tenant_id: tenantId,
    sync_key: syncKey,
    topic,
    doc_type: docType,
    is_pinned: isPinned,
  };

  const client = new pg.Client(pgOptions(dbUrl));
  await client.connect();

  try {
    const existing = await client.query(
      `SELECT id FROM agentsam.${PG_VECTOR_TABLE}
       WHERE workspace_id = $1::uuid AND memory_key = $2 LIMIT 1`,
      [workspaceUuid, memoryKey],
    );
    const pgRowId = existing.rows[0]?.id ?? crypto.randomUUID();

    if (existing.rows[0]?.id) {
      await client.query(
        `UPDATE agentsam.${PG_VECTOR_TABLE}
         SET content = $2, title = $3, embedding = $4::vector(1536),
             source = $5, metadata = $6::jsonb,
             vectorize_binding = $7, vectorize_index = $8,
             embedded_at = now(), updated_at = now()
         WHERE id = $1::uuid`,
        [
          pgRowId,
          content,
          title,
          vecLiteral,
          source,
          JSON.stringify(metadata),
          VECTORIZE_BINDING,
          VECTORIZE_INDEX,
        ],
      );
    } else {
      await client.query(
        `INSERT INTO agentsam.${PG_VECTOR_TABLE} (
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
          workspaceUuid,
          memoryKey,
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

    await client.query(
      `INSERT INTO agentsam.${PG_PRIVATE_TABLE} (
         tenant_id, workspace_id, user_id, memory_type, memory_key,
         title, content, summary, value_json, source, tags,
         confidence, importance, is_pinned, is_archived,
         sync_key, d1_id, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9::jsonb, $10, $11::text[],
         $12, $13, $14, false,
         $15, $16, now()
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
         d1_id = EXCLUDED.d1_id,
         updated_at = now()`,
      [
        tenantId,
        d1Workspace,
        userId,
        String(row.memory_type || 'decision'),
        memoryKey,
        title,
        content,
        summary,
        JSON.stringify({ router: true, topic, doc_type: docType }),
        source,
        tags,
        Math.min(1, Math.max(0, Number(row.confidence) || 1)),
        importance,
        isPinned,
        syncKey,
        String(row.id),
      ],
    );

    await vectorizeUpsertNdjson({
      accountId,
      token: cfToken,
      index: VECTORIZE_INDEX,
      vectors: [
        {
          id: String(pgRowId),
          values: embedding,
          metadata: {
            workspace_id: workspaceD1,
            memory_key: memoryKey,
            title,
            source,
            topic,
            doc_type: docType,
          },
        },
      ],
    });

    await client.query(
      `UPDATE agentsam.${PG_VECTOR_TABLE} SET vectorize_id = $1, updated_at = now() WHERE id = $1::uuid`,
      [pgRowId],
    );

    d1JsonFromRoot(
      root,
      `UPDATE agentsam_memory
       SET embedded_at = unixepoch(),
           embedding_id = '${sqlEscape(String(pgRowId))}',
           updated_at = unixepoch()
       WHERE id = '${sqlEscape(String(row.id))}'`,
    );

    writeVectorizeSyncReceipt({
      root,
      chunk_id: `run:${scriptKey}:${memoryKey}`,
      vectorize_index: VECTORIZE_INDEX,
      status: 'ok',
      details: buildReceiptDetails({
        run_id: runId,
        script_key: scriptKey,
        git_commit_sha: gitSha,
        workspace_id: workspaceD1,
        workspace_uuid: workspaceUuid,
        vectorize_index: VECTORIZE_INDEX,
        lane: 'memory',
        binding: VECTORIZE_BINDING,
        embed_model: EMBED_MODEL,
        embed_dims: EMBED_DIMS,
        chunks_embedded: 1,
        files_indexed: 1,
        status: 'ok',
        memory_key: memoryKey,
        pg_row_id: pgRowId,
        private_memory_synced: true,
        embedding_id_written: true,
      }),
      dryRun: false,
    });

    console.log(
      `✓ ${memoryKey} → vector id=${pgRowId} + private ${PG_PRIVATE_TABLE} + D1 embedding_id`,
    );
    return { memoryKey, pgRowId, d1Id: String(row.id) };
  } finally {
    await client.end().catch(() => {});
  }
}
