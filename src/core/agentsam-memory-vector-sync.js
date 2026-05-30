/**
 * D1 agentsam_memory → Supabase agentsam.agentsam_memory_oai3large_1536 (OpenAI 1536d).
 * Cron (hourly) + POST /api/agent/memory/sync manual trigger.
 */
import { createAgentsamEmbedding } from './agentsam-vectorize.js';
import { isHyperdriveUsable, runHyperdriveQuery } from './hyperdrive-query.js';
import { resolveSupabaseWorkspaceId } from './rag-lanes.js';
import { completeCronRun, failCronRun, startCronRun } from './cron-run-ledger.js';

export const MEMORY_VECTOR_SYNC_MAX_ROWS = 50;
const CRON_HOURLY = '0 * * * *';
const PG_TABLE = 'agentsam_memory_oai3large_1536';
const EMBED_SPEC = Object.freeze({
  provider: 'openai',
  model: 'text-embedding-3-large',
  dimensions: 1536,
});

/** @param {number[]} embedding */
function vectorLiteral(embedding) {
  if (!Array.isArray(embedding) || !embedding.length) throw new Error('embedding required');
  return `[${embedding.join(',')}]`;
}

/** @param {number|null|undefined} unixSec */
function unixToIso(unixSec) {
  const n = Number(unixSec);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(n * 1000).toISOString();
}

/** @param {string} tagsJson */
function parseTags(tagsJson) {
  try {
    const parsed = JSON.parse(String(tagsJson || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {any} env
 * @param {{ limit?: number, skipLedger?: boolean, cronExpression?: string }} [opts]
 */
export async function runAgentsamMemoryVectorSync(env, opts = {}) {
  const limit = Math.min(
    Math.max(1, Number(opts.limit) || MEMORY_VECTOR_SYNC_MAX_ROWS),
    MEMORY_VECTOR_SYNC_MAX_ROWS,
  );
  const skipLedger = opts.skipLedger === true;
  const cronExpression = opts.cronExpression ?? CRON_HOURLY;

  if (!env?.DB) {
    return { ok: false, error: 'DB not configured', embedded: 0, skipped: 0, failed: 0 };
  }
  if (!isHyperdriveUsable(env)) {
    return { ok: false, error: 'hyperdrive_unavailable', embedded: 0, skipped: 0, failed: 0 };
  }

  let runId = null;
  let startedAt = Date.now();
  if (!skipLedger) {
    const begun = await startCronRun(env, {
      jobName: 'agentsam_memory_oai3large_1536_sync',
      cronExpression,
      tenantId: null,
      workspaceId: null,
    });
    runId = begun?.runId ?? null;
    startedAt = begun?.startedAt ?? Date.now();
  }

  let embedded = 0;
  let skipped = 0;
  let failed = 0;
  let rowsRead = 0;
  const errors = [];

  try {
    const { results: pending } = await env.DB.prepare(
      `SELECT id, tenant_id, user_id, workspace_id, memory_type, key, value,
              title, source, tags, sync_key, created_at, updated_at
         FROM agentsam_memory
        WHERE workspace_id IS NOT NULL
          AND TRIM(workspace_id) != ''
          AND is_archived = 0
          AND TRIM(value) != ''
          AND (embedded_at IS NULL OR embedded_at < updated_at)
        ORDER BY updated_at DESC
        LIMIT ?`,
    )
      .bind(limit)
      .all();

    const rows = pending || [];
    rowsRead = rows.length;
    const workspaceUuidCache = new Map();

    for (const row of rows) {
      const d1WorkspaceId = String(row.workspace_id || '').trim();
      const memoryKey = String(row.key || '').trim();
      const content = String(row.value || '').trim();
      if (!d1WorkspaceId || !memoryKey || !content) {
        skipped += 1;
        continue;
      }

      let workspaceUuid = workspaceUuidCache.get(d1WorkspaceId);
      if (workspaceUuid === undefined) {
        workspaceUuid = await resolveSupabaseWorkspaceId(env, d1WorkspaceId);
        workspaceUuidCache.set(d1WorkspaceId, workspaceUuid);
      }
      if (!workspaceUuid) {
        skipped += 1;
        errors.push({ id: row.id, error: 'workspace_unresolved' });
        continue;
      }

      const existing = await runHyperdriveQuery(
        env,
        `SELECT id, content, embedding IS NOT NULL AS has_embedding
           FROM agentsam.${PG_TABLE}
          WHERE memory_key = $1
            AND workspace_id = $2::uuid
          LIMIT 1`,
        [memoryKey, workspaceUuid],
      );
      if (!existing.ok) {
        failed += 1;
        errors.push({ id: row.id, error: existing.error || 'pg_lookup_failed' });
        continue;
      }
      const pgRow = existing.rows?.[0] ?? null;
      if (pgRow?.has_embedding && String(pgRow.content || '') === content) {
        await env.DB.prepare(`UPDATE agentsam_memory SET embedded_at = unixepoch() WHERE id = ?`)
          .bind(row.id)
          .run();
        skipped += 1;
        continue;
      }

      try {
        const title = row.title != null ? String(row.title).slice(0, 500) : null;
        const embedText = title ? `${title}\n\n${content}` : content;
        const { embedding } = await createAgentsamEmbedding(env, embedText, { spec: EMBED_SPEC });
        const vector = vectorLiteral(embedding);
        const metadata = {
          d1_id: String(row.id),
          user_id_d1: String(row.user_id || ''),
          memory_type: String(row.memory_type || 'fact'),
          tenant_id: String(row.tenant_id || ''),
          sync_key: String(row.sync_key || ''),
          tags: parseTags(row.tags),
        };
        const source = String(row.source || 'agent_sam').slice(0, 120);
        const createdAt = unixToIso(row.created_at);
        const updatedAt = unixToIso(row.updated_at);

        const upsert = await runHyperdriveQuery(
          env,
          `INSERT INTO agentsam.${PG_TABLE} (
             workspace_id, user_id, oauth_client_id, memory_key, content, title,
             embedding, source, metadata, created_at, updated_at, embedded_at
           ) VALUES (
             $1::uuid, $2, $3, $4, $5, $6,
             $7::vector(1536), $8, $9::jsonb, $10::timestamptz, $11::timestamptz, now()
           )
           ON CONFLICT (memory_key) DO UPDATE SET
             workspace_id = EXCLUDED.workspace_id,
             user_id = EXCLUDED.user_id,
             content = EXCLUDED.content,
             title = EXCLUDED.title,
             embedding = EXCLUDED.embedding,
             source = EXCLUDED.source,
             metadata = EXCLUDED.metadata,
             embedded_at = now(),
             updated_at = now()`,
          [
            workspaceUuid,
            null,
            null,
            memoryKey,
            content,
            title,
            vector,
            source,
            JSON.stringify(metadata),
            createdAt,
            updatedAt,
          ],
        );
        if (!upsert.ok) {
          failed += 1;
          errors.push({ id: row.id, error: upsert.error || 'upsert_failed' });
          continue;
        }

        await env.DB.prepare(`UPDATE agentsam_memory SET embedded_at = unixepoch() WHERE id = ?`)
          .bind(row.id)
          .run();
        embedded += 1;
      } catch (e) {
        failed += 1;
        errors.push({ id: row.id, error: String(e?.message || e).slice(0, 200) });
      }
    }

    const summary = {
      ok: failed === 0 || embedded > 0,
      embedded,
      skipped,
      failed,
      rows_read: rowsRead,
      table: `agentsam.${PG_TABLE}`,
      errors: errors.slice(0, 10),
    };
    console.log(
      `[memory-vector-sync] agentsam_memory_oai3large_1536 embedded=${embedded} skipped=${skipped} failed=${failed}`,
    );

    if (runId) {
      await completeCronRun(env, runId, startedAt, {
        rowsRead,
        rowsWritten: embedded,
        metadata: { embedded, skipped, failed, table: PG_TABLE },
      });
    }
    return summary;
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[memory-vector-sync]', e?.message ?? e);
    throw e;
  }
}
