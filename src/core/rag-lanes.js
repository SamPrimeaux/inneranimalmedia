import { createAgentsamEmbedding } from './agentsam-vectorize.js';
import { runHyperdriveQuery } from './hyperdrive-query.js';

export const LANES = {
  memory: {
    name: 'memory',
    vectorize: 'AGENTSAM_VECTORIZE_MEMORY',
    supabase_table: 'agentsam_memory_oai3large_1536',
  },
  code: {
    name: 'code',
    vectorize: 'AGENTSAM_VECTORIZE_CODE',
    supabase_table: 'agentsam_codebase_chunks_oai3large_1536',
  },
  docs: {
    name: 'docs',
    vectorize: 'AGENTSAM_VECTORIZE_COURSES',
    supabase_table: 'agentsam_documents_oai3large_1536',
  },
  schema: {
    name: 'schema',
    vectorize: 'AGENTSAM_VECTORIZE_SCHEMA',
    supabase_table: 'agentsam_database_schema_oai3large_1536',
  },
  archive: {
    name: 'archive',
    vectorize: null,
    supabase_table: 'agentsam_deep_archive_oai3large_3072',
  },
};

function resolveLaneConfig(laneName) {
  const key = String(laneName ?? '').trim();
  return key ? LANES[key] ?? null : null;
}

function vectorLiteral(embedding) {
  if (!Array.isArray(embedding) || !embedding.length) throw new Error('embedding required');
  return `[${embedding.join(',')}]`;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value == null) {
      out[key] = null;
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else {
      out[key] = JSON.stringify(value).slice(0, 2000);
    }
  }
  return out;
}

export async function resolveSupabaseWorkspaceId(env, d1WorkspaceId) {
  return runHyperdriveQuery(
    env,
    'SELECT id FROM agentsam.agentsam_workspaces WHERE workspace_key = $1 LIMIT 1',
    [d1WorkspaceId],
  )
    .then((r) => r?.rows?.[0]?.id ?? null)
    .catch(() => null);
}

export async function contentHash(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}

export async function writeToLane(env, laneName, entry) {
  const lane = resolveLaneConfig(laneName);
  if (!lane) throw new Error(`unknown lane: ${laneName}`);

  const d1WorkspaceId = String(entry?.workspace_id_d1 ?? '').trim();
  if (!d1WorkspaceId) throw new Error('writeToLane: workspace_id_d1 required');

  const workspaceId = await resolveSupabaseWorkspaceId(env, d1WorkspaceId);
  if (!workspaceId) return { ok: false, skipped: 'workspace_unresolved' };

  const sourceRef = String(entry?.source_ref ?? '').trim();
  if (!sourceRef) throw new Error('writeToLane: source_ref required');

  const title = String(entry?.title ?? '').trim();
  const content = String(entry?.content ?? '').trim();
  if (!content) throw new Error('writeToLane: content required');

  const sourceType = String(entry?.source_type ?? '').trim() || 'unknown';
  const metadata = sanitizeMetadata(entry?.metadata);
  const hash = await contentHash(content);

  const existing = await runHyperdriveQuery(
    env,
    `SELECT id, content_hash
       FROM agentsam.${lane.supabase_table}
      WHERE workspace_id = $1 AND source_ref = $2
      LIMIT 1`,
    [workspaceId, sourceRef],
  );
  const existingRow = existing?.rows?.[0] ?? null;
  if (existingRow?.content_hash && String(existingRow.content_hash) === hash) {
    return { ok: true, skipped: 'unchanged', id: String(existingRow.id) };
  }

  const { embedding } = await createAgentsamEmbedding(env, content);
  const vector = vectorLiteral(embedding);
  const rowId = existingRow?.id != null ? String(existingRow.id) : crypto.randomUUID();
  const upsert = await runHyperdriveQuery(
    env,
    `INSERT INTO agentsam.${lane.supabase_table} (
       id, workspace_id, title, content, source_type, source_ref,
       metadata, rule_id, content_hash, embedding, embedded_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7::jsonb, $8, $9, $10::vector, now(), now()
     )
     ON CONFLICT (workspace_id, source_ref) DO UPDATE SET
       title = EXCLUDED.title,
       content = EXCLUDED.content,
       source_type = EXCLUDED.source_type,
       metadata = EXCLUDED.metadata,
       rule_id = EXCLUDED.rule_id,
       content_hash = EXCLUDED.content_hash,
       embedding = EXCLUDED.embedding,
       embedded_at = now(),
       updated_at = now()
     RETURNING id`,
    [
      rowId,
      workspaceId,
      title || null,
      content,
      sourceType,
      sourceRef,
      JSON.stringify(metadata),
      entry?.rule_id ?? null,
      hash,
      vector,
    ],
  );
  if (!upsert?.ok) throw new Error(upsert?.error || 'rag lane upsert failed');

  const supabaseRowId = String(upsert?.rows?.[0]?.id ?? rowId);
  if (lane.vectorize && typeof env?.[lane.vectorize]?.upsert === 'function') {
    await env[lane.vectorize].upsert([
      {
        id: supabaseRowId,
        values: embedding,
        metadata: {
          workspace_id: d1WorkspaceId,
          source_ref: sourceRef,
          title,
          source_type: sourceType,
        },
      },
    ]);
    await runHyperdriveQuery(
      env,
      `UPDATE agentsam.${lane.supabase_table}
          SET vectorize_id = $1,
              embedded_at = now(),
              updated_at = now()
        WHERE id = $2`,
      [supabaseRowId, supabaseRowId],
    );
  }

  return { ok: true, id: supabaseRowId, content_hash: hash };
}

export async function queryLanes(env, opts = {}) {
  const d1WorkspaceId = String(opts?.workspace_id_d1 ?? '').trim();
  const queryText = String(opts?.query_text ?? '').trim();
  if (!d1WorkspaceId || !queryText) return [];

  const workspaceId = await resolveSupabaseWorkspaceId(env, d1WorkspaceId);
  if (!workspaceId) return [];

  const { embedding } = await createAgentsamEmbedding(env, queryText);
  const topK = Math.min(Math.max(1, Number(opts?.top_k) || 5), 20);
  const laneNames = Array.isArray(opts?.lanes) && opts.lanes.length ? opts.lanes : Object.keys(LANES);
  const deduped = new Map();

  for (const laneName of laneNames) {
    const lane = resolveLaneConfig(laneName);
    if (!lane?.vectorize || typeof env?.[lane.vectorize]?.query !== 'function') continue;

    const result = await env[lane.vectorize].query(embedding, {
      topK,
      filter: { workspace_id: { $eq: d1WorkspaceId } },
      returnMetadata: 'all',
    });
    const matches = result?.matches || result?.result?.matches || [];
    for (const match of matches) {
      const sourceRef = String(match?.metadata?.source_ref ?? '').trim();
      if (!sourceRef) continue;
      const score = Number(match?.score ?? 0);
      const existing = deduped.get(sourceRef);
      if (!existing || score > existing.score) {
        deduped.set(sourceRef, {
          lane: lane.name,
          table: lane.supabase_table,
          score,
          source_ref: sourceRef,
          title: String(match?.metadata?.title ?? '').trim(),
        });
      }
    }
  }

  const results = [];
  for (const hit of deduped.values()) {
    const row = await runHyperdriveQuery(
      env,
      `SELECT title, content, source_ref
         FROM agentsam.${hit.table}
        WHERE workspace_id = $1 AND source_ref = $2
        LIMIT 1`,
      [workspaceId, hit.source_ref],
    );
    const found = row?.rows?.[0] ?? null;
    if (!found) continue;
    results.push({
      lane: hit.lane,
      title: String(found.title ?? hit.title ?? '').trim(),
      content: String(found.content ?? '').trim(),
      score: hit.score,
      source_ref: String(found.source_ref ?? hit.source_ref),
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
