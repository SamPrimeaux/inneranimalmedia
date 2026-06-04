/**
 * agentsam_cf_vectorize — query | upsert | delete against AGENTSAM_VECTORIZE_* bindings.
 */
import { createAgentsamEmbedding } from '../../core/agentsam-vectorize.js';
import { resolveAgentsamEmbeddingSpecForDimensions } from '../../core/agentsam-vectorize-index.js';

const LANE_DIM = 1536;
const EMBED_SPEC_1536 = resolveAgentsamEmbeddingSpecForDimensions(LANE_DIM);

/** @type {Record<string, string>} */
const INDEX_ALIASES = {
  'agentsam-codebase-oai3large-1536': 'AGENTSAM_VECTORIZE_CODE',
  'agentsam-courses-oai3large-1536': 'AGENTSAM_VECTORIZE_COURSES',
  'agentsam-memory-oai3large-1536': 'AGENTSAM_VECTORIZE_MEMORY',
  'agentsam-schema-oai3large-1536': 'AGENTSAM_VECTORIZE_SCHEMA',
  'agentsam-documents-oai3large-1536': 'AGENTSAM_VECTORIZE_DOCUMENTS',
  code: 'AGENTSAM_VECTORIZE_CODE',
  courses: 'AGENTSAM_VECTORIZE_COURSES',
  memory: 'AGENTSAM_VECTORIZE_MEMORY',
  schema: 'AGENTSAM_VECTORIZE_SCHEMA',
  documents: 'AGENTSAM_VECTORIZE_DOCUMENTS',
  docs: 'AGENTSAM_VECTORIZE_DOCUMENTS',
};

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/** @param {any} env */
function buildBindingMap(env) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const [indexName, bindingName] of Object.entries(INDEX_ALIASES)) {
    if (indexName.includes('-oai3large-') && env?.[bindingName]) {
      map[indexName] = bindingName;
    }
  }
  return map;
}

/** @param {any} env @param {string} indexName */
function resolveVectorizeBinding(env, indexName) {
  const raw = trim(indexName);
  const key = raw.toLowerCase().replace(/_/g, '-');
  const bindingName = INDEX_ALIASES[key] || INDEX_ALIASES[raw];
  if (bindingName && env?.[bindingName]) {
    return { bindingName, indexName: canonicalIndexName(key, bindingName) };
  }
  const map = buildBindingMap(env);
  if (map[key]) {
    return { bindingName: map[key], indexName: key };
  }
  return null;
}

/** @param {string} key @param {string} bindingName */
function canonicalIndexName(key, bindingName) {
  for (const [name, binding] of Object.entries(INDEX_ALIASES)) {
    if (binding === bindingName && name.includes('-oai3large-')) return name;
  }
  return key;
}

function listValidIndexes(env) {
  const out = [];
  for (const [name, bindingName] of Object.entries(INDEX_ALIASES)) {
    if (name.includes('-oai3large-') && env?.[bindingName]) out.push(name);
  }
  return out;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const out = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (v == null) out[k] = null;
    else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else out[k] = JSON.stringify(v).slice(0, 2000);
  }
  return out;
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} input
 * @param {{ workspaceId?: string|null, tenantId?: string|null, userId?: string|null }} [scope]
 */
export async function handleCfVectorizeManage(env, input, scope = {}) {
  const indexNameRaw = trim(input?.index_name || input?.indexName || input?.index);
  const validIndexes = listValidIndexes(env);

  if (!indexNameRaw) {
    return { ok: false, error: 'index_name required', valid_indexes: validIndexes };
  }

  const resolved = resolveVectorizeBinding(env, indexNameRaw);
  if (!resolved) {
    return {
      ok: false,
      error: 'unknown_vectorize_index',
      index_name: indexNameRaw,
      valid_indexes: validIndexes,
      available_bindings: Object.keys(env || {}).filter((k) => k.startsWith('AGENTSAM_VECTORIZE_')),
    };
  }

  const { bindingName, indexName } = resolved;
  const binding = env[bindingName];
  if (!binding) {
    return { ok: false, error: 'vectorize_binding_unavailable', binding: bindingName, index_name: indexName };
  }

  const op = trim(input?.operation || input?.op || input?.action).toLowerCase() || 'query';
  const workspaceId = trim(input?.workspace_id) || trim(scope?.workspaceId) || '';
  const tenantId = trim(input?.tenant_id) || trim(scope?.tenantId) || '';
  const userId = trim(input?.user_id) || trim(scope?.userId) || null;

  if (op === 'query') {
    let vector = Array.isArray(input?.vector) ? input.vector : null;
    const queryText = trim(input?.query || input?.q);

    if ((!vector || !vector.length) && queryText) {
      try {
        const { embedding } = await createAgentsamEmbedding(env, queryText, {
          spec: EMBED_SPEC_1536,
          userId,
        });
        vector = embedding;
      } catch (e) {
        return { ok: false, error: 'embedding_failed', message: String(e?.message || e) };
      }
    }

    if (!Array.isArray(vector) || !vector.length) {
      return { ok: false, error: 'vector or query required for query operation' };
    }
    if (vector.length !== LANE_DIM) {
      return {
        ok: false,
        error: 'invalid_vector_dimensions',
        got: vector.length,
        expected: LANE_DIM,
      };
    }

    const topK = Math.min(Math.max(1, Number(input?.top_k ?? input?.topK ?? input?.limit) || 10), 100);
    const filter = { ...(input?.filter && typeof input.filter === 'object' ? input.filter : {}) };
    if (workspaceId && filter.workspace_id == null) filter.workspace_id = workspaceId;
    if (tenantId && filter.tenant_id == null) filter.tenant_id = tenantId;

    const results = await binding.query(vector, {
      topK,
      returnMetadata: 'all',
      ...(Object.keys(filter).length ? { filter } : {}),
    });
    const matches = results?.matches || results?.result?.matches || [];
    return {
      ok: true,
      operation: 'query',
      binding: bindingName,
      index_name: indexName,
      top_k: topK,
      match_count: matches.length,
      matches,
    };
  }

  if (op === 'upsert') {
    const id = trim(input?.id || input?.vector_id);
    if (!id) return { ok: false, error: 'id required for upsert' };

    let vector = Array.isArray(input?.vector) ? input.vector : null;
    const text = trim(input?.text || input?.content || input?.value);
    if ((!vector || !vector.length) && text) {
      try {
        const { embedding } = await createAgentsamEmbedding(env, text, {
          spec: EMBED_SPEC_1536,
          userId,
        });
        vector = embedding;
      } catch (e) {
        return { ok: false, error: 'embedding_failed', message: String(e?.message || e) };
      }
    }

    if (!Array.isArray(vector) || !vector.length) {
      return { ok: false, error: 'vector or text required for upsert' };
    }
    if (vector.length !== LANE_DIM) {
      return {
        ok: false,
        error: 'invalid_vector_dimensions',
        got: vector.length,
        expected: LANE_DIM,
      };
    }

    const metadata = sanitizeMetadata(input?.metadata);
    if (workspaceId && metadata.workspace_id == null) metadata.workspace_id = workspaceId;
    if (tenantId && metadata.tenant_id == null) metadata.tenant_id = tenantId;

    await binding.upsert([{ id, values: vector, metadata }]);
    return { ok: true, operation: 'upsert', binding: bindingName, index_name: indexName, upserted: id };
  }

  if (op === 'delete') {
    const idList = Array.isArray(input?.ids)
      ? input.ids.map((x) => trim(x)).filter(Boolean)
      : trim(input?.id)
        ? [trim(input.id)]
        : [];
    if (!idList.length) return { ok: false, error: 'id or ids required for delete' };
    if (typeof binding.deleteByIds !== 'function') {
      return { ok: false, error: `${bindingName}.deleteByIds unavailable` };
    }
    await binding.deleteByIds(idList);
    return {
      ok: true,
      operation: 'delete',
      binding: bindingName,
      index_name: indexName,
      deleted: idList,
    };
  }

  return { ok: false, error: 'operation must be query | upsert | delete', valid_indexes: validIndexes };
}
