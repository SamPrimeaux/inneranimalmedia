/**
 * Lane-aware prompt context for normal Agent chat — single block, no unifiedRagSearch.
 */
import {
  classifySemanticLane,
  classifyDatabaseAssistantIntent,
} from './semantic-lane-classifier.js';
import { dispatchSemanticRetrieval } from './semantic-retrieval-dispatch.js';
import { dispatchDatabaseAssistant } from './database-assistant-dispatch.js';

export const LANE_CONTEXT_HEADINGS = Object.freeze({
  code_semantic_search: '## Code semantic context',
  schema_semantic_search: '## Schema semantic context',
  memory_semantic_search: '## Memory semantic context',
  docs_knowledge_search: '## Docs knowledge context',
  deep_archive_search: '## Deep archive context',
  database_assistant: '## Database assistant context',
});

const MAX_LANE_BLOCK_CHARS = 3000;

/** @param {string} source */
export function logLegacyUnifiedRagBlocked(source) {
  console.warn(
    '[agent-chat] legacy_unified_rag_blocked',
    JSON.stringify({ source: String(source || 'unknown') }),
  );
}

/**
 * @param {string} text
 */
function extractAgentsamTableName(text) {
  const m = String(text || '').match(/\b(agentsam_[a-z0-9_]+)\b/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * @param {string} text
 */
function extractReadonlySql(text) {
  const m = String(text || '').match(/((?:select|explain|pragma)\b[\s\S]{8,2000})/i);
  return m ? m[1].trim() : null;
}

/**
 * @param {unknown} dbIntent
 * @param {string} message
 */
function mapDatabaseIntentToOperation(dbIntent, message) {
  const table = extractAgentsamTableName(message);
  switch (dbIntent) {
    case 'explain_table':
      return table
        ? { operation: 'describe_table', table, schema: 'agentsam' }
        : { operation: 'inspect_schema', schema: 'agentsam' };
    case 'inspect_schema':
      return { operation: 'inspect_schema', schema: 'agentsam' };
    case 'run_readonly_sql': {
      const sql = extractReadonlySql(message);
      return sql ? { operation: 'run_readonly_sql', sql, schema: 'agentsam' } : null;
    }
    case 'propose_migration':
      return {
        operation: 'propose_migration',
        migration_sql: String(message || '').slice(0, 4000),
        schema: 'agentsam',
      };
    default:
      return null;
  }
}

/**
 * @param {string} lane
 * @param {Array<{ title?: string, source_ref?: string, content?: string, score?: number }>} results
 */
function formatSemanticBlock(lane, results) {
  const heading = LANE_CONTEXT_HEADINGS[lane] || '## Semantic context';
  const body = results
    .slice(0, 8)
    .map((h) => {
      const label = h.title || h.source_ref || 'chunk';
      const snippet = String(h.content ?? '').slice(0, 800);
      const score =
        h.score != null && Number.isFinite(Number(h.score))
          ? ` (score ${Number(h.score).toFixed(3)})`
          : '';
      return `### ${label}${score}\n${snippet}`;
    })
    .join('\n\n');
  const block = `${heading}\n\n${body}`;
  return block.length > MAX_LANE_BLOCK_CHARS ? block.slice(0, MAX_LANE_BLOCK_CHARS) : block;
}

/**
 * @param {Record<string, unknown>} payload
 */
function formatDatabaseBlock(payload) {
  const heading = LANE_CONTEXT_HEADINGS.database_assistant;
  const summary = JSON.stringify(payload, null, 0)
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LANE_BLOCK_CHARS - heading.length - 4);
  return `${heading}\n\n${summary}`;
}

/**
 * Normal Agent chat: at most one lane context block when include_rag allows retrieval.
 *
 * @param {any} env
 * @param {{
 *   message: string,
 *   includeRag?: boolean,
 *   workspaceId?: string|null,
 *   tenantId?: string|null,
 *   userId?: string|null,
 *   authUser?: unknown,
 *   agentRunId?: string|null,
 * }} opts
 * @returns {Promise<{ block: string, lane: string|null, source: string|null }>}
 */
export async function resolveAgentChatLaneContextBlock(env, opts = {}) {
  const includeRag = opts.includeRag !== false;
  const message = String(opts.message || '').trim();
  const workspaceId =
    opts.workspaceId != null && String(opts.workspaceId).trim() !== ''
      ? String(opts.workspaceId).trim()
      : '';

  if (!includeRag || !message) {
    return { block: '', lane: null, source: null };
  }

  if (!workspaceId) {
    return { block: '', lane: null, source: null };
  }

  const dbIntent = classifyDatabaseAssistantIntent(message);
  if (dbIntent) {
    const mapped = mapDatabaseIntentToOperation(dbIntent, message);
    if (!mapped) {
      return { block: '', lane: 'database_assistant', source: 'database_assistant_skipped' };
    }
    try {
      const out = await dispatchDatabaseAssistant(env, {
        ...mapped,
        authUser: opts.authUser ?? null,
        tenant_id: opts.tenantId ?? null,
        workspace_id: workspaceId,
        agent_run_id: opts.agentRunId ?? null,
      });
      if (!out?.ok) {
        console.warn(
          '[agent-chat] database_assistant_degraded',
          JSON.stringify({ intent: dbIntent, error: out?.error, degraded: out?.degraded_reason }),
        );
        return { block: '', lane: 'database_assistant', source: 'database_assistant_degraded' };
      }
      return {
        block: formatDatabaseBlock({ operation: mapped.operation, ...out }),
        lane: 'database_assistant',
        source: 'dispatchDatabaseAssistant',
      };
    } catch (e) {
      console.warn('[agent-chat] database_assistant', e?.message ?? e);
      return { block: '', lane: 'database_assistant', source: 'database_assistant_error' };
    }
  }

  const semanticLane = classifySemanticLane(message);
  if (!semanticLane) {
    return { block: '', lane: null, source: null };
  }

  try {
    const out = await dispatchSemanticRetrieval(env, {
      lane: semanticLane,
      query: message,
      workspace_id: workspaceId,
      tenant_id: opts.tenantId ?? null,
      user_id: opts.userId ?? null,
      agent_run_id: opts.agentRunId ?? null,
      top_k: 6,
    });

    if (!out?.ok || !out?.results?.length) {
      if (out?.degraded_reason) {
        console.warn(
          '[agent-chat] semantic_lane_degraded',
          JSON.stringify({ lane: semanticLane, reason: out.degraded_reason }),
        );
      }
      return { block: '', lane: semanticLane, source: 'dispatchSemanticRetrieval_empty' };
    }

    return {
      block: formatSemanticBlock(semanticLane, out.results),
      lane: semanticLane,
      source: 'dispatchSemanticRetrieval',
    };
  } catch (e) {
    console.warn('[agent-chat] semantic_lane', semanticLane, e?.message ?? e);
    return { block: '', lane: semanticLane, source: 'dispatchSemanticRetrieval_error' };
  }
}
