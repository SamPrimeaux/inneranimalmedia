/**
 * Classify user messages into semantic lanes and database-assistant intents.
 */
import { stripUserTextForIntent } from './active-file-envelope.js';
import {
  isReadOnlyFileContextIntent,
  isReadOnlyRepoSearchIntent,
} from './code-implementation-intent.js';
import { messageRequestsInternalKnowledge } from './tavily-open-web-search.js';
import { messageExplicitlyRequestsBrowserInspection } from './code-implementation-intent.js';

function messageRequestsWebFetchLocal(message) {
  const m = String(message || '').trim();
  const url = m.match(/https?:\/\/[^\s)\]"'<>]+/i);
  if (!url) return false;
  return /\b(fetch|read|get|pull|download|extract|scrape|curl)\b/i.test(m);
}

function messageRequestsOpenWebSearchLocal(message) {
  const m = String(message || '').toLowerCase();
  if (!m || messageRequestsWebFetchLocal(message)) return false;
  return (
    /\b(search the web|look it up online|google|search online|latest on|current news)\b/i.test(m) ||
    (/\b(latest|current|today)\b/i.test(m) &&
      /\b(cloudflare|openai|anthropic|api|release notes)\b/i.test(m))
  );
}

/**
 * @param {unknown} message
 */
function messageRequestsWorkspaceGrepLocal(message) {
  const m = String(message || '').toLowerCase();
  return (
    isReadOnlyRepoSearchIntent(message) ||
    /\b(grep|ripgrep|\brg\b|find in (the )?codebase|which file|where is .{0,80} defined|workspace_grep|fs_search)\b/i.test(
      m,
    )
  );
}

/**
 * @param {unknown} message
 */
function messageRequestsBrowserInspectLocal(message) {
  const m = String(message || '').toLowerCase();
  return (
    messageExplicitlyRequestsBrowserInspection(m) ||
    /\b(screenshot|playwright|inspect (the )?page|dom\b)\b/i.test(m)
  );
}

/** @typedef {'code_semantic_search'|'schema_semantic_search'|'memory_semantic_search'|'docs_knowledge_search'|'deep_archive_search'|null} SemanticLane */

/** @typedef {'inspect_schema'|'run_readonly_sql'|'propose_migration'|'explain_table'|null} DatabaseAssistantIntent */

/**
 * @param {unknown} message
 * @returns {SemanticLane}
 */
export function classifySemanticLane(message) {
  const m = stripUserTextForIntent(message).toLowerCase();
  if (!m) return null;
  if (isReadOnlyFileContextIntent(message) || isReadOnlyRepoSearchIntent(message)) return null;
  if (messageRequestsWorkspaceGrepLocal(message)) return null;
  if (messageRequestsOpenWebSearchLocal(message) || messageRequestsWebFetchLocal(message)) return null;
  if (messageRequestsBrowserInspectLocal(message)) return null;

  if (
    /\b(deep archive|long.?range archival|golden retrieval|eval baseline|architecture archive)\b/i.test(m)
  ) {
    return 'deep_archive_search';
  }

  if (
    /\b(what did we decide|we decided|remembered|project decision|policy was|routing decision|terminal policy|gpt-5|claude-)\b/i.test(
      m,
    ) &&
    !/\b(table|schema|column|migration)\b/i.test(m)
  ) {
    return 'memory_semantic_search';
  }

  if (
    /\b(iam docs?|tool reference|runbook|platform docs?|internal docs?|deploy runbook|knowledge doc)\b/i.test(m) ||
    (/\bwhat (?:do|does) .{0,40} docs?\b/i.test(m) && !/\b(cloudflare|openai|anthropic)\b/i.test(m))
  ) {
    return 'docs_knowledge_search';
  }

  if (
    /\b(what tables|which tables|schema support|database schema|hyperdrive table|d1 table|foreign key|rls policy|agentsam_)\b/i.test(
      m,
    ) ||
    (/\b(table|schema|column|index|migration)\b/i.test(m) &&
      /\b(support|relate|store|telemetry|workflow|routing|pricing)\b/i.test(m))
  ) {
    return 'schema_semantic_search';
  }

  if (
    /\b(what files|which files|where is .{0,80} handled|what code owns|how does .{0,60} choose|model routing|browser context|terminal policy|tool dispatch)\b/i.test(
      m,
    ) ||
    (/\b(files?|codebase|src\/|worker\.js)\b/i.test(m) &&
      /\b(handle|own|implement|fallback|route)\b/i.test(m) &&
      !/\b(find|grep|defined)\b/i.test(m))
  ) {
    return 'code_semantic_search';
  }

  if (messageRequestsInternalKnowledge(message)) {
    if (/\b(schema|table|d1|hyperdrive|agentsam_)\b/i.test(m)) return 'schema_semantic_search';
    if (/\b(code|file|function|module)\b/i.test(m)) return 'code_semantic_search';
    return 'docs_knowledge_search';
  }

  return null;
}

/**
 * @param {unknown} message
 * @returns {DatabaseAssistantIntent}
 */
export function classifyDatabaseAssistantIntent(message) {
  const m = stripUserTextForIntent(message).toLowerCase();
  if (!m) return null;

  if (/\b(propose|draft|write).{0,60}migration\b/i.test(m)) {
    if (!/\b(do not apply|don't apply|without applying|do not run)\b/i.test(m)) {
      if (/\b(apply now|run migration|execute migration|apply the migration)\b/i.test(m)) {
        return null;
      }
    }
    return 'propose_migration';
  }

  if (
    /\b(explain|describe).{0,30}(schema|table|agentsam_workflow|agentsam_)/i.test(m) ||
    /\bwhat columns\b/i.test(m) ||
    /\bhow (?:is|are) .{0,40} (?:table|schema)\b/i.test(m)
  ) {
    return 'explain_table';
  }

  if (/\b(list tables|show tables|inspect schema|database schema)\b/i.test(m)) {
    return 'inspect_schema';
  }

  if (/\b(select|explain|pragma)\b/i.test(m) && /\b(from|agentsam\.|agentsam_)\b/i.test(m)) {
    return 'run_readonly_sql';
  }

  return null;
}
