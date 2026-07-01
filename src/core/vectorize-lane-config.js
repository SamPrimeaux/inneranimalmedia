/**
 * Single source of truth for semantic search lane routing (pgvector vs Vectorize).
 * MCP worker mirrors this object manually — see inneranimalmedia-mcp-server MCP_LANE_CONFIG.
 */

/** @typedef {'pgvector'|'vectorize'} LaneSsot */
/** @typedef {'full_content'|'metadata_only'} LaneReturns */

/**
 * @type {Record<string, {
 *   ssot: LaneSsot,
 *   table: string|null,
 *   vectorize: string|null,
 *   filters: Record<string, unknown>,
 *   returns: LaneReturns,
 *   reindex_script: string|null,
 *   dimensions?: number,
 * }>}
 */
export const LANE_CONFIG = Object.freeze({
  codebase: {
    ssot: 'pgvector',
    table: 'agentsam_codebase_chunks_oai3large_1536',
    vectorize: null,
    filters: { source_type: 'repo_file' },
    returns: 'full_content',
    reindex_script: 'agentsam_codebase_reindex.mjs',
    dimensions: 1536,
  },
  documents: {
    ssot: 'pgvector',
    table: 'agentsam_documents_oai3large_1536',
    vectorize: 'agentsam-documents-oai3large-1536',
    filters: {},
    returns: 'full_content',
    reindex_script: 'rag_ingest.mjs',
    dimensions: 1536,
  },
  memory: {
    ssot: 'pgvector',
    table: 'agentsam_memory_oai3large_1536',
    vectorize: null,
    filters: { workspace_scoped: true },
    returns: 'full_content',
    reindex_script: null,
    dimensions: 1536,
  },
  database_schema: {
    ssot: 'pgvector',
    table: 'agentsam_database_schema_oai3large_1536',
    vectorize: null,
    filters: { workspace_scoped: true },
    returns: 'full_content',
    reindex_script: 'schema_ingest.mjs',
    dimensions: 1536,
  },
  deep_archive: {
    ssot: 'pgvector',
    table: 'agentsam_deep_archive_oai3large_3072',
    vectorize: null,
    filters: { workspace_scoped: true },
    returns: 'full_content',
    reindex_script: 'archive_ingest.mjs',
    dimensions: 3072,
  },
});

/** Map dispatchSemanticRetrieval lane keys → LANE_CONFIG purpose keys. */
export const SEMANTIC_LANE_TO_PURPOSE = Object.freeze({
  code_semantic_search: 'codebase',
  schema_semantic_search: 'database_schema',
  memory_semantic_search: 'memory',
  docs_knowledge_search: 'documents',
  deep_archive_search: 'deep_archive',
});

/**
 * @param {string} purpose
 * @returns {typeof LANE_CONFIG[keyof typeof LANE_CONFIG]|null}
 */
export function getLane(purpose) {
  const key = String(purpose ?? '').trim();
  return key ? LANE_CONFIG[key] ?? null : null;
}

/**
 * @param {string} laneKey
 * @returns {string|null}
 */
export function resolveLanePurpose(laneKey) {
  const key = String(laneKey ?? '').trim();
  return key ? SEMANTIC_LANE_TO_PURPOSE[key] ?? null : null;
}

/**
 * @param {string} laneKey
 * @returns {typeof LANE_CONFIG[keyof typeof LANE_CONFIG]|null}
 */
export function getLaneForSemanticKey(laneKey) {
  const purpose = resolveLanePurpose(laneKey);
  return purpose ? getLane(purpose) : null;
}

/**
 * @param {string} purpose
 * @returns {boolean}
 */
export function isVectorizeLane(purpose) {
  return LANE_CONFIG[purpose]?.ssot === 'vectorize';
}

/**
 * @param {string} purpose
 * @returns {boolean}
 */
export function isPgvectorLane(purpose) {
  return LANE_CONFIG[purpose]?.ssot === 'pgvector';
}

const DEFINITION_INTENT_RE = /\b(defined|definition|where is|export|function|class|const)\b/i;

/** @param {string} query */
export function isDefinitionIntent(query) {
  return DEFINITION_INTENT_RE.test(String(query ?? ''));
}

/** @param {string} query */
export function expandDefinitionQuery(query) {
  const q = String(query ?? '').trim();
  if (!q || /^definition of /i.test(q)) return q;
  return `definition of ${q}`;
}

/** SQL WHERE fragments for codebase lane filters (metadata + legacy path guard). */
export const CODEBASE_PGVECTOR_FILE_FILTER = "file_path NOT LIKE 'docs/%'";

/**
 * @param {Record<string, unknown>} [filters]
 * @returns {string}
 */
export function buildCodebasePgvectorFilterSql(filters = {}) {
  const parts = [CODEBASE_PGVECTOR_FILE_FILTER];
  if (filters.source_type === 'repo_file') {
    parts.push("(metadata->>'source_type' IS NULL OR metadata->>'source_type' = 'repo_file')");
  }
  return parts.join('\n       AND ');
}

/** Secondary ORDER BY for definition-intent codebase queries (src paths over dashboard). */
export const CODEBASE_DEFINITION_PATH_BOOST_ORDER = `
         CASE
           WHEN file_path LIKE 'src/core/%' OR file_path LIKE 'src/api/%' THEN 0
           WHEN file_path LIKE 'dashboard/%' THEN 2
           ELSE 1
         END`;
