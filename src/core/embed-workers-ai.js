/**
 * Workers AI embeddings — shared by docs Vectorize indexing and cron RAG helpers.
 */
const IAM_EMBED_MODEL = '@cf/baai/bge-m3';

/**
 * @param {any} env
 * @param {string|string[]} text Single string or batch of strings (same length as returned vectors).
 * @returns {Promise<number[]|number[][]>}
 */
export async function generateWorkersAiEmbedding(env, text) {
  if (!env?.AI) throw new Error('Workers AI binding not configured');
  const batch = Array.isArray(text);
  const resp = await env.AI.run(IAM_EMBED_MODEL, {
    text: batch ? text : [text],
  });
  const vecs = resp?.data || resp?.result || [];
  if (!vecs.length) throw new Error('No embeddings returned');
  return batch ? vecs : vecs[0];
}
