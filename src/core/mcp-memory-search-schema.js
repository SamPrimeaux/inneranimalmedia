/**
 * Canonical MCP input schema for agentsam_memory_search (tools/list).
 * Keep in sync with inneranimalmedia-mcp-server/src/mcp-memory-search-schema.js
 */

export const DEFAULT_MEMORY_SEARCH_QUERY = 'recent relevant workspace memory';
export const DEFAULT_MEMORY_NAMESPACE = 'agentsam-memory-oai3large-1536';

/** @type {Record<string, unknown>} */
export const CANONICAL_AGENTSAM_MEMORY_SEARCH_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        'Natural language query to embed and search. Defaults to recent relevant workspace memory when omitted.',
    },
    namespace: {
      type: 'string',
      default: DEFAULT_MEMORY_NAMESPACE,
      description: 'Legacy Vectorize namespace label (D1 search ignores; kept for connector compatibility).',
    },
    top_k: {
      type: 'integer',
      default: 5,
      maximum: 20,
      description: 'Max results (maps to D1 row limit).',
    },
    filter: {
      type: 'object',
      description: 'Optional metadata filter (ignored on D1 substring path).',
    },
    provider: {
      type: 'string',
      enum: ['cf', 'supabase', 'auto'],
      default: 'auto',
      description: 'Legacy provider hint (D1 search ignores; kept for connector compatibility).',
    },
  },
  additionalProperties: false,
};

/** @returns {Record<string, unknown>} */
export function agentsamMemorySearchInputSchema() {
  return {
    ...CANONICAL_AGENTSAM_MEMORY_SEARCH_INPUT_SCHEMA,
    properties: { ...CANONICAL_AGENTSAM_MEMORY_SEARCH_INPUT_SCHEMA.properties },
  };
}
