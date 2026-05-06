/**
 * iam-docs R2 → VECTORIZE_DOCS indexing (queue-driven Put/Delete events).
 * Lifted from worker.js — keep behavior aligned with legacy queue consumer.
 */
import { generateWorkersAiEmbedding } from '../core/embed-workers-ai.js';
import { chunkTextForCodebaseReindex } from './docs-chunk.js';

const DOCS_VECTOR_CHUNK_SIZE = 1000;
const DOCS_VECTOR_CHUNK_OVERLAP = 100;
const DOCS_EMBED_DIM = 1024;
const RAG_EMBED_BATCH_SIZE = 32;

/**
 * Remove all VECTORIZE_DOCS vectors for one R2 object key.
 * @param {any} env
 * @param {string} objectKey
 */
export async function deleteVectorsForDocKey(env, objectKey) {
  if (!env.VECTORIZE_DOCS?.deleteByIds || !objectKey) return;
  const slug = objectKey.replace(/\//g, '_').replace(/\./g, '_');
  let n = null;
  if (env.DB) {
    try {
      const row = await env.DB.prepare(
        'SELECT chunk_count FROM docs_index_log WHERE key = ? AND deleted_at IS NULL ORDER BY indexed_at DESC LIMIT 1',
      )
        .bind(objectKey)
        .first();
      n = row?.chunk_count;
    } catch (_) { /* non-fatal */ }
  }
  if (n != null && n > 0) {
    const ids = [];
    for (let i = 0; i < n; i++) ids.push(`${slug}#${i}`);
    for (let o = 0; o < ids.length; o += 100) {
      await env.VECTORIZE_DOCS.deleteByIds(ids.slice(o, o + 100));
    }
    return;
  }
  const zeroVec = new Array(DOCS_EMBED_DIM).fill(0);
  let safety = 0;
  while (safety++ < 200) {
    let matches;
    try {
      const res = await env.VECTORIZE_DOCS.query(zeroVec, {
        topK: 100,
        returnMetadata: 'all',
        filter: { key: { $eq: objectKey } },
      });
      matches = res?.matches ?? [];
    } catch (e) {
      console.warn('[deleteVectorsForDocKey] filter query failed', objectKey, e?.message ?? e);
      break;
    }
    if (!matches.length) break;
    const delIds = matches.map((m) => m.id).filter(Boolean);
    if (!delIds.length) break;
    await env.VECTORIZE_DOCS.deleteByIds(delIds);
  }
}

/**
 * Embed .md objects from DOCS_BUCKET into VECTORIZE_DOCS.
 * @param {any} env
 * @param {string} [keyFilter] If set, only index this key (single-file queue updates).
 */
export async function performDocsBucketVectorizeIndex(env, keyFilter) {
  let files = 0;
  let chunks = 0;
  try {
    if (!env.DOCS_BUCKET || !env.AI || !env.VECTORIZE_DOCS?.upsert) {
      console.warn('[docs-vector-index] missing DOCS_BUCKET, AI, or VECTORIZE_DOCS.upsert');
      return { files: 0, chunks: 0 };
    }
    const keys = [];
    if (keyFilter && typeof keyFilter === 'string') {
      const k = keyFilter.trim();
      if (!k.endsWith('.md')) return { files: 0, chunks: 0 };
      if (k.startsWith('screenshots/') || k.includes('/screenshots/')) return { files: 0, chunks: 0 };
      keys.push(k);
    } else {
      let listCursor;
      do {
        const list = await env.DOCS_BUCKET.list({ cursor: listCursor, limit: 1000 });
        for (const o of list.objects || []) {
          const key = o.key;
          if (!key || !key.endsWith('.md')) continue;
          if (key.startsWith('screenshots/') || key.includes('/screenshots/')) continue;
          keys.push(key);
        }
        listCursor = list.truncated ? list.cursor : undefined;
      } while (listCursor);
    }

    for (const key of keys) {
      await deleteVectorsForDocKey(env, key);
      const obj = await env.DOCS_BUCKET.get(key);
      if (!obj) continue;
      const text = await obj.text();
      if (!text.trim()) {
        if (env.DB) {
          await env.DB.prepare('DELETE FROM docs_index_log WHERE key = ?').bind(key).run().catch(() => {});
        }
        continue;
      }
      const parts = chunkTextForCodebaseReindex(text, DOCS_VECTOR_CHUNK_SIZE, DOCS_VECTOR_CHUNK_OVERLAP);
      if (!parts.length) {
        if (env.DB) {
          await env.DB.prepare('DELETE FROM docs_index_log WHERE key = ?').bind(key).run().catch(() => {});
        }
        continue;
      }
      files += 1;
      const slug = key.replace(/\//g, '_').replace(/\./g, '_');
      let chunkCountForKey = 0;
      for (let i = 0; i < parts.length; i += RAG_EMBED_BATCH_SIZE) {
        const batchParts = parts.slice(i, i + RAG_EMBED_BATCH_SIZE);
        const texts = batchParts.map((c) => c);
        let values;
        try {
          const vecs = await generateWorkersAiEmbedding(env, texts);
          values = Array.isArray(vecs) ? vecs : [];
        } catch (e) {
          console.warn('[docs-vector-index] embed batch failed', key, e?.message ?? e);
          continue;
        }
        const vectors = [];
        batchParts.forEach((_, j) => {
          const chunkIndex = i + j;
          const vec = values[j];
          if (vec && Array.isArray(vec)) {
            vectors.push({
              id: `${slug}#${chunkIndex}`,
              values: vec,
              metadata: { key, chunk_index: chunkIndex, source: 'r2' },
            });
          }
        });
        if (vectors.length) {
          await env.VECTORIZE_DOCS.upsert(vectors);
          chunkCountForKey += vectors.length;
        }
      }
      chunks += chunkCountForKey;
      if (env.DB && chunkCountForKey > 0) {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO docs_index_log (key, chunk_count, indexed_at, deleted_at, source, status) VALUES (?, ?, datetime('now'), NULL, 'r2', 'indexed')`,
        )
          .bind(key, chunkCountForKey)
          .run()
          .catch((e) => console.warn('[docs_index_log]', e?.message ?? e));
      }
    }
    console.log('[docs-vector-index] done', { files, chunks, keyFilter: keyFilter || null });
    return { files, chunks };
  } catch (e) {
    console.warn('[docs-vector-index]', e?.message ?? e);
    throw e;
  }
}
