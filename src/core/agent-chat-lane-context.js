/**
 * Lane-aware prompt context for normal Agent chat — single block, no unifiedRagSearch.
 */
import {
  classifySemanticLane,
  classifyDatabaseAssistantIntent,
  shouldSupplementDeepArchive,
} from './semantic-lane-classifier.js';
import { dispatchSemanticRetrieval } from './semantic-retrieval-dispatch.js';
import {
  dispatchCustomerDataPlaneOperation,
  resolveCustomerDataPlane,
} from './customer-data-plane-dispatch.js';

export const LANE_CONTEXT_HEADINGS = Object.freeze({
  code_semantic_search: '## Code semantic context',
  schema_semantic_search: '## Schema semantic context',
  memory_semantic_search: '## Memory semantic context',
  docs_knowledge_search: '## Docs knowledge context',
  deep_archive_search: '## Deep archive context',
  database_assistant: '## Database assistant context',
});

const MAX_LANE_BLOCK_CHARS = 3000;
const MAX_PRIMARY_WHEN_DEEP = 1600;
const MAX_DEEP_SUPPLEMENT = 1400;

/** @typedef {'code_semantic_search'|'schema_semantic_search'|'memory_semantic_search'|'docs_knowledge_search'|'deep_archive_search'|null} SemanticLane */

/**
 * When message heuristics miss, map classified routing task type → semantic lane (P0-A).
 * @param {string|null|undefined} routingTaskType
 * @returns {SemanticLane}
 */
export function semanticLaneFromRoutingTaskType(routingTaskType) {
  const tt = String(routingTaskType || '').trim().toLowerCase();
  if (!tt) return null;
  if (
    [
      'd1_query',
      'd1_write',
      'd1_migrate',
      'supabase_query',
      'supabase_write',
      'db_query',
      'db_read',
      'db_write',
      'sql_d1_generation',
    ].includes(tt)
  ) {
    return 'schema_semantic_search';
  }
  if (tt === 'vectorize') {
    return 'docs_knowledge_search';
  }
  if (['search_code', 'code', 'refactor', 'review', 'debug'].includes(tt)) {
    return 'code_semantic_search';
  }
  if (['plan', 'explain', 'summary', 'chat', 'cms_edit', 'deploy', 'cf_ops'].includes(tt)) {
    return 'docs_knowledge_search';
  }
  if (['recall', 'skill_use'].includes(tt)) return 'memory_semantic_search';
  return null;
}

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
/**
 * @param {string} message
 */
function extractCustomerTableName(message) {
  const m = String(message || '').match(/\b(?:table|from)\s+([a-z_][a-z0-9_]*)\b/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * @param {string} dbIntent
 * @param {string} message
 * @param {Awaited<ReturnType<typeof resolveCustomerDataPlane>>} plane
 */
function mapDatabaseIntentToOperation(dbIntent, message, plane) {
  const agentsamTable = extractAgentsamTableName(message);
  const customerTable = extractCustomerTableName(message);
  const schema =
    plane.data_plane === 'public_learning'
      ? 'public'
      : plane.data_plane === 'customer_supabase'
        ? 'public'
        : 'agentsam';

  switch (dbIntent) {
    case 'explain_table':
      if (plane.data_plane === 'public_learning') {
        return { operation: 'describe_table', table: agentsamTable || 'iam_tool_cards', schema };
      }
      if (plane.data_plane === 'customer_supabase') {
        return customerTable
          ? { operation: 'describe_table', table: customerTable, schema }
          : { operation: 'inspect_schema', schema };
      }
      return agentsamTable
        ? { operation: 'describe_table', table: agentsamTable, schema }
        : { operation: 'inspect_schema', schema };
    case 'inspect_schema':
      return plane.data_plane === 'public_learning'
        ? { operation: 'list_tables', schema }
        : { operation: 'inspect_schema', schema };
    case 'run_readonly_sql': {
      const sql = extractReadonlySql(message);
      return sql ? { operation: 'run_readonly_sql', sql, schema } : null;
    }
    case 'propose_migration':
      return {
        operation: 'propose_migration',
        migration_sql: String(message || '').slice(0, 4000),
        schema,
      };
    default:
      return null;
  }
}

/**
 * @param {string} lane
 * @param {Array<{ title?: string, source_ref?: string, content?: string, score?: number }>} results
 */
function formatSemanticBlock(lane, results, maxChars = MAX_LANE_BLOCK_CHARS) {
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
  return block.length > maxChars ? block.slice(0, maxChars) : block;
}

const VECTORIZE_BINDING_PREAMBLE =
  'Authoritative Vectorize bindings (2026-06): AGENTSAM_VECTORIZE_CODE, AGENTSAM_VECTORIZE_SCHEMA, AGENTSAM_VECTORIZE_MEMORY, AGENTSAM_VECTORIZE_DOCUMENTS, AGENTSAM_VECTORIZE_COURSES. Deep archive @3072d is Hyperdrive-only (deep_archive_search). RETIRED — do not cite: AGENTSAMVECTORIZE, legacy VECTORIZE @1024.\n\n';

/**
 * @param {string} primaryLane
 * @param {Array<{ title?: string, source_ref?: string, content?: string, score?: number }>} primaryResults
 * @param {Array<{ title?: string, source_ref?: string, content?: string, score?: number }>|null|undefined} deepResults
 * @param {{ withDeep?: boolean, vectorizeQuestion?: boolean }} [opts]
 */
function mergeSemanticBlocks(primaryLane, primaryResults, deepResults, opts = {}) {
  const withDeep = opts.withDeep === true && deepResults?.length;
  const parts = [];
  if (primaryResults?.length) {
    parts.push(
      formatSemanticBlock(primaryLane, primaryResults, withDeep ? MAX_PRIMARY_WHEN_DEEP : MAX_LANE_BLOCK_CHARS),
    );
  }
  if (withDeep) {
    parts.push(formatSemanticBlock('deep_archive_search', deepResults, MAX_DEEP_SUPPLEMENT));
  }
  if (!parts.length) return '';
  let block = parts.join('\n\n');
  if (opts.vectorizeQuestion) {
    block = VECTORIZE_BINDING_PREAMBLE + block;
  }
  return block.length > MAX_LANE_BLOCK_CHARS ? block.slice(0, MAX_LANE_BLOCK_CHARS) : block;
}

/**
 * @param {Record<string, unknown>} payload
 */
function formatDatabaseBlock(payload, plane) {
  const heading = LANE_CONTEXT_HEADINGS.database_assistant;
  const banner = plane?.data_plane
    ? `Active data plane: ${plane.data_plane}${plane.project_ref ? ` (${plane.project_ref})` : ''}${plane.degraded_reason ? ` [${plane.degraded_reason}]` : ''}\n\n`
    : '';
  const summary = JSON.stringify(payload, null, 0)
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LANE_BLOCK_CHARS - heading.length - banner.length - 4);
  return `${heading}\n\n${banner}${summary}`;
}

/**
 * Normal Agent chat: lane context block when include_rag allows retrieval (primary lane + optional deep archive).
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
 *   routingTaskType?: string|null,
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
    const userId = opts.userId != null ? String(opts.userId) : String(opts.authUser?.id || '');
    const plane = await resolveCustomerDataPlane(env, {
      user_id: userId,
      tenant_id: opts.tenantId ?? null,
      workspace_id: workspaceId,
      message,
      operation_type: dbIntent,
      authUser: opts.authUser ?? null,
    });

    const mapped = mapDatabaseIntentToOperation(dbIntent, message, plane);
    if (!mapped) {
      return { block: '', lane: 'database_assistant', source: 'database_assistant_skipped' };
    }
    try {
      const out = await dispatchCustomerDataPlaneOperation(env, {
        ...mapped,
        message,
        authUser: opts.authUser ?? null,
        user_id: userId,
        tenant_id: opts.tenantId ?? null,
        workspace_id: workspaceId,
        agent_run_id: opts.agentRunId ?? null,
        data_plane: plane.data_plane,
      });
      if (!out?.ok) {
        console.warn(
          '[agent-chat] database_assistant_degraded',
          JSON.stringify({
            intent: dbIntent,
            data_plane: plane.data_plane,
            error: out?.error,
            reason: out?.reason,
            degraded: out?.degraded_reason || plane.degraded_reason,
          }),
        );
        const denyMsg =
          out?.user_message ||
          (out?.error === 'customer_database_not_connected'
            ? 'Connect your Supabase or Cloudflare D1 in integrations before querying your database.'
            : out?.error === 'access_denied' || plane.data_plane === 'platform_access_denied'
              ? 'IAM platform database access is owner-only. Use public learning examples or connect your own database.'
              : '');
        if (denyMsg) {
          return {
            block: `${LANE_CONTEXT_HEADINGS.database_assistant}\n\n${denyMsg}`,
            lane: 'database_assistant',
            source: 'data_plane_access_denied',
          };
        }
        return { block: '', lane: 'database_assistant', source: 'database_assistant_degraded' };
      }
      console.info(
        '[agent-chat] data_plane_used',
        JSON.stringify({
          data_plane: out.data_plane || plane.data_plane,
          operation: mapped.operation,
          owner_type: plane.owner_type,
        }),
      );
      return {
        block: formatDatabaseBlock({ operation: mapped.operation, ...out }, plane),
        lane: 'database_assistant',
        source: 'dispatchCustomerDataPlaneOperation',
      };
    } catch (e) {
      console.warn('[agent-chat] database_assistant', e?.message ?? e);
      return { block: '', lane: 'database_assistant', source: 'database_assistant_error' };
    }
  }

  const semanticLane =
    classifySemanticLane(message) || semanticLaneFromRoutingTaskType(opts.routingTaskType);
  if (!semanticLane) {
    return { block: '', lane: null, source: null };
  }

  try {
    const dispatchBase = {
      query: message,
      workspace_id: workspaceId,
      tenant_id: opts.tenantId ?? null,
      user_id: opts.userId ?? null,
      agent_run_id: opts.agentRunId ?? null,
    };
    const supplementDeep =
      shouldSupplementDeepArchive(message, semanticLane) ||
      String(opts.routingTaskType || '').trim().toLowerCase() === 'vectorize';

    const [primaryOut, deepOut] = await Promise.all([
      dispatchSemanticRetrieval(env, { ...dispatchBase, lane: semanticLane, top_k: 6 }),
      supplementDeep
        ? dispatchSemanticRetrieval(env, {
            ...dispatchBase,
            lane: 'deep_archive_search',
            top_k: 4,
          })
        : Promise.resolve(null),
    ]);

    const primaryResults = primaryOut?.ok ? primaryOut.results || [] : [];
    const deepResults = deepOut?.ok ? deepOut.results || [] : [];

    if (!primaryResults.length && !deepResults.length) {
      if (primaryOut?.degraded_reason || deepOut?.degraded_reason) {
        console.warn(
          '[agent-chat] semantic_lane_degraded',
          JSON.stringify({
            lane: semanticLane,
            reason: primaryOut?.degraded_reason || deepOut?.degraded_reason,
            deep_supplement: supplementDeep,
          }),
        );
      }
      return { block: '', lane: semanticLane, source: 'dispatchSemanticRetrieval_empty' };
    }

    const block = mergeSemanticBlocks(semanticLane, primaryResults, deepResults, {
      withDeep: supplementDeep,
      vectorizeQuestion: supplementDeep || /\bvectorize\b/i.test(message),
    });
    const source =
      supplementDeep && deepResults.length
        ? 'dispatchSemanticRetrieval+deep_archive'
        : supplementDeep
          ? 'dispatchSemanticRetrieval+deep_archive_empty'
          : 'dispatchSemanticRetrieval';

    if (supplementDeep) {
      console.info(
        '[agent-chat] deep_archive_supplement',
        JSON.stringify({
          primary_lane: semanticLane,
          primary_count: primaryResults.length,
          deep_count: deepResults.length,
          deep_degraded: deepOut?.degraded_reason ?? null,
        }),
      );
    }

    return {
      block,
      lane: primaryResults.length ? semanticLane : 'deep_archive_search',
      source,
    };
  } catch (e) {
    console.warn('[agent-chat] semantic_lane', semanticLane, e?.message ?? e);
    return { block: '', lane: semanticLane, source: 'dispatchSemanticRetrieval_error' };
  }
}
