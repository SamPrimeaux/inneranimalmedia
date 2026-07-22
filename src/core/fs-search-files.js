/**
 * workspace_grep spine — fs_search_files via PTY ripgrep (not Tavily, not list_dir).
 */
import {
  applyActiveFileDefaultsToToolInput,
  defaultSearchPathFromActiveFile,
} from './active-file-envelope.js';
import {
  buildRgSearchCommand,
  isSafeRgSearchCommand,
  parseRgJsonMatches,
  FS_SEARCH_MAX_OUTPUT_BYTES,
} from './fs-search-rg-parse.js';

export { buildRgSearchCommand, isSafeRgSearchCommand, parseRgJsonMatches } from './fs-search-rg-parse.js';

/**
 * Derive ripgrep query from natural-language user text when the model omits `query`.
 * @param {unknown} message
 * @returns {string}
 */
export function extractSearchQueryFromUserText(message) {
  const m = String(message || '');
  if (!m.trim()) return '';

  const quotedContaining = m.match(/containing\s+["']([^"']+)["']/i);
  if (quotedContaining?.[1]) return String(quotedContaining[1]).trim();

  const quotedFind = m.match(/\bfind(?:\s+all)?\s+(?:files?\s+)?(?:with|for|matching)?\s*["']([^"']+)["']/i);
  if (quotedFind?.[1]) return String(quotedFind[1]).trim();

  const agentsamTables = m.match(/\bagentsam_[\w]*\b/i);
  if (agentsamTables?.[0]) return String(agentsamTables[0]).trim();

  if (/\bfind\b/i.test(m)) {
    const heading = m.match(/#\s*([^\r\n#]+)/);
    if (heading?.[1]) return String(heading[1]).trim().slice(0, 160);
  }

  const symbol = m.match(
    /\b(?:find|search|grep|locate|containing)\b[^.!?\n]{0,160}?\b([A-Za-z_][A-Za-z0-9_]{2,})\b/i,
  );
  if (symbol?.[1] && !/^(files?|repo|codebase|workspace|all|the|this|that|and|for|with|agent|sam|audit|checklist)$/i.test(symbol[1])) {
    return String(symbol[1]).trim();
  }

  return '';
}

/**
 * Normalize fs_search_files tool input (query + optional path).
 * @param {Record<string, unknown>|null|undefined} params
 * @param {{ userMessage?: string, activeFileEnvelope?: Record<string, unknown>|null }} [hints]
 */
export function normalizeFsSearchFilesParams(params, hints = {}) {
  const out = params && typeof params === 'object' ? { ...params } : {};
  let query = String(out.query ?? out.q ?? out.pattern ?? '').trim();

  if (!query && hints.userMessage) {
    query = extractSearchQueryFromUserText(hints.userMessage);
  }

  if (!query) {
    const fromPath = String(out.path ?? out.glob_path ?? '.').trim();
    const base = fromPath.split('/').filter(Boolean).pop() || '';
    if (base && base !== '.' && base !== '..') {
      query = base.replace(/\.[^.]+$/, '') || base;
    }
  }

  if (query) {
    out.query = query;
    delete out.q;
    delete out.pattern;
  }

  if (hints.activeFileEnvelope && typeof hints.activeFileEnvelope === 'object') {
    if (!out.path && !out.glob_path) {
      out.path = defaultSearchPathFromActiveFile(hints.activeFileEnvelope);
    }
    return applyActiveFileDefaultsToToolInput('fs_search_files', out, hints.activeFileEnvelope);
  }

  return out;
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 */
export async function executeFsSearchFiles(env, params, runContext = {}) {
  const started = Date.now();
  const normalized = normalizeFsSearchFilesParams(params, {
    userMessage:
      runContext.userMessage ??
      runContext.message ??
      runContext.mcpRuntimeContext?.userMessage ??
      null,
    activeFileEnvelope:
      runContext.activeFileEnvelope ?? runContext.active_file_envelope ?? null,
  });

  const query = String(normalized.query ?? '').trim();
  const pathArg = String(normalized.path ?? normalized.glob_path ?? '.').trim() || '.';

  const userId = String(
    runContext.userId ?? runContext.user_id ?? params.user_id ?? params.session?.user_id ?? '',
  ).trim();
  const workspaceId = String(
    runContext.workspaceId ?? runContext.workspace_id ?? params.workspace_id ?? '',
  ).trim();
  const tenantId = String(
    runContext.tenantId ?? runContext.tenant_id ?? params.tenant_id ?? '',
  ).trim();

  if (!query) {
    return { error: 'query required', lane: 'workspace_grep', tool: 'fs_search_files' };
  }
  if (!userId || !workspaceId) {
    return { error: 'user_id and workspace_id required', lane: 'workspace_grep' };
  }

  const { resolveMoviemodeRepoRootForSession } = await import('./pty-workspace-paths.js');
  const repo = await resolveMoviemodeRepoRootForSession(env, {
    tenantId,
    userId,
    workspaceId,
  });
  if (!repo?.repoRoot) {
    return { error: 'workspace_repo_root_unavailable', lane: 'workspace_grep' };
  }

  const command = buildRgSearchCommand(query, pathArg, {
    maxCount: params.max_results ?? params.max_count,
  });
  if (!command || !isSafeRgSearchCommand(command)) {
    return { error: 'unsafe_or_invalid_search_command', lane: 'workspace_grep' };
  }

  const request = runContext.request ?? params.request ?? null;
  if (!request) {
    return { error: 'request_context_required_for_pty_search', lane: 'workspace_grep' };
  }

  let output = '';
  let exitCode = 1;
  try {
    const { runTerminalCommand } = await import('./terminal.js');
    const res = await runTerminalCommand(env, request, command, runContext.sessionId ?? null, {
      execution_mode: 'pty',
      target_type: 'auto',
      workspace_id: workspaceId,
      tenant_id: tenantId,
      user_id: userId,
      tool_name: 'fs_search_files',
    });
    output = String(res?.output || '');
    exitCode = Number(res?.exitCode ?? 0);
  } catch (e) {
    const durationMs = Math.max(0, Date.now() - started);
    const { scheduleToolCallLog } = await import('./agentsam-ops-ledger.js');
    scheduleToolCallLog(env, runContext.ctx ?? null, {
      tenantId: tenantId || 'system',
      workspaceId,
      userId,
      sessionId: runContext.sessionId ?? runContext.conversation_id,
      toolName: 'fs_search_files',
      status: 'error',
      durationMs,
      errorMessage: String(e?.message || e).slice(0, 500),
      agent_run_id: runContext.agentRunId ?? runContext.agent_run_id,
      conversation_id: runContext.conversationId ?? runContext.conversation_id,
    });
    return {
      error: String(e?.message || e).slice(0, 500),
      lane: 'workspace_grep',
      exit_code: exitCode,
    };
  }

  const matches = parseRgJsonMatches(output);
  const durationMs = Math.max(0, Date.now() - started);
  const body = {
    lane: 'workspace_grep',
    tool: 'fs_search_files',
    query,
    path: pathArg,
    repo_root: repo.repoRoot,
    match_count: matches.length,
    matches,
    exit_code: exitCode,
    truncated: output.length > FS_SEARCH_MAX_OUTPUT_BYTES,
    duration_ms: durationMs,
  };

  const { scheduleToolCallLog } = await import('./agentsam-ops-ledger.js');
  scheduleToolCallLog(env, runContext.ctx ?? null, {
    tenantId: tenantId || 'system',
    workspaceId,
    userId,
    sessionId: runContext.sessionId ?? runContext.conversation_id,
    toolName: 'fs_search_files',
    status: 'success',
    durationMs,
    inputSummary: `rg:${query.slice(0, 80)}`,
    agent_run_id: runContext.agentRunId ?? runContext.agent_run_id,
    conversation_id: runContext.conversationId ?? runContext.conversation_id,
  });

  return body;
}
