/**
 * Compaction context store — inneranimalmedia-autorag via env.AUTORAG_BUCKET only.
 * Never write compaction artifacts to env.R2 or other buckets.
 *
 * Key schema (strict, no variation):
 *   context/{userId}/{workspaceId}/{conversationId}/{type}_{unixepoch}.json
 *
 * userId is the authenticated au_* ID — outermost isolation prefix per user.
 * Legacy bucket-root docs (e.g. context/iam_multi_tenant_architecture.md) are unrelated.
 */

function safePathSegment(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (s.includes('/') || s.includes('\\') || s.includes('..')) return null;
  return s;
}

function buildContextR2Key({ userId, workspaceId, conversationId, type }) {
  const uid = safePathSegment(userId);
  const wid = safePathSegment(workspaceId);
  const cid = safePathSegment(conversationId);
  const t = safePathSegment(type);
  if (!uid || !wid || !cid || !t) return null;
  return `context/${uid}/${wid}/${cid}/${t}_${Date.now()}.json`;
}

/**
 * @param {object} env Worker env (AUTORAG_BUCKET binding required)
 * @param {{ userId: string, workspaceId: string, conversationId: string, type: string, content: unknown }} params
 * @returns {Promise<string|null>} Full R2 key on success; null on failure (never throws)
 */
export async function writeContextToR2(env, { userId, workspaceId, conversationId, type, content }) {
  try {
    const key = buildContextR2Key({ userId, workspaceId, conversationId, type });
    if (!key) {
      console.error('[r2-context-store] invalid key params', { userId, workspaceId, conversationId, type });
      return null;
    }

    const bucket = env.AUTORAG_BUCKET;
    if (!bucket?.put) {
      console.error('[r2-context-store] AUTORAG_BUCKET binding missing');
      return null;
    }

    const body = typeof content === 'string' ? content : JSON.stringify(content ?? null);
    await bucket.put(key, body, { httpMetadata: { contentType: 'application/json' } });
    return key;
  } catch (e) {
    console.error('[r2-context-store] write failed', e?.message ?? e);
    return null;
  }
}

/**
 * @param {object} env Worker env (AUTORAG_BUCKET binding required)
 * @param {string} r2Key Full object key under inneranimalmedia-autorag
 * @returns {Promise<string|null>} Object text or null (never throws)
 */
export async function readContextFromR2(env, r2Key) {
  try {
    const key = String(r2Key ?? '').trim().replace(/^\/+/, '');
    if (!key) return null;

    const bucket = env.AUTORAG_BUCKET;
    if (!bucket?.get) {
      console.error('[r2-context-store] AUTORAG_BUCKET binding missing');
      return null;
    }

    const obj = await bucket.get(key);
    if (!obj) return null;
    return await obj.text();
  } catch (e) {
    console.error('[r2-context-store] read failed', r2Key, e?.message ?? e);
    return null;
  }
}
