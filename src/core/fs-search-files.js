/**
 * workspace_grep spine — fs_search_files via PTY ripgrep (not Tavily, not list_dir).
 */
import {
  buildRgSearchCommand,
  isSafeRgSearchCommand,
  parseRgJsonMatches,
  FS_SEARCH_MAX_OUTPUT_BYTES,
} from './fs-search-rg-parse.js';

export { buildRgSearchCommand, isSafeRgSearchCommand, parseRgJsonMatches } from './fs-search-rg-parse.js';

/**
 * @param {any} env
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 */
export async function executeFsSearchFiles(env, params, runContext = {}) {
  const started = Date.now();
  const query = String(params.query ?? params.q ?? params.pattern ?? '').trim();
  const pathArg = String(params.path ?? params.glob_path ?? '.').trim() || '.';

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
      workspace_id: workspaceId,
      tenant_id: tenantId,
      user_id: userId,
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
