/**
 * API: Git Status
 * Returns current branch, staged/unstaged changes, and recent commits
 * for the IAM workspace repo. Used by the dashboard source control panel.
 *
 * Route: GET /api/internal/git-status
 *
 * Requires workspace_id query param or WORKSPACE_ID env var to resolve
 * the workspace root from workspace_settings.
 */
import { runTerminalCommand, resolveIamWorkspaceRoot } from '../core/terminal.js';
import { jsonResponse } from '../core/responses.js';

export async function handleGitStatusApi(request, url, env, ctx) {
  const workspaceId = url.searchParams.get('workspace_id') || env.WORKSPACE_ID || null;
  const root        = await resolveIamWorkspaceRoot(env, workspaceId);

  if (!root) {
    return jsonResponse({
      error:       'workspace_root not configured',
      workspace_id: workspaceId,
      hint:        'Set workspace_root in workspace_settings.settings_json for this workspace_id',
    }, 503);
  }

  const [branchResult, statusResult, logResult] = await Promise.all([
    runTerminalCommand(env, request, `git -C "${root}" branch --show-current`,                        'git_status'),
    runTerminalCommand(env, request, `git -C "${root}" status --porcelain`,                            'git_status'),
    runTerminalCommand(env, request, `git -C "${root}" log -n 10 --pretty=format:"%h|%an|%ar|%s"`,    'git_status'),
  ]);

  const branch = (branchResult.output || '').trim() || 'unknown';

  const staged   = [];
  const unstaged = [];

  for (const line of (statusResult.output || '').split('\n').filter(l => l.trim())) {
    const x    = line[0];
    const y    = line[1];
    const path = line.slice(3).trim();
    const item = { path, status: line.slice(0, 2).trim() };
    if (x !== ' ' && x !== '?') staged.push(item);
    if (y !== ' '  || x === '?') unstaged.push(item);
  }

  const commits = (logResult.output || '')
    .split('\n')
    .filter(l => l.trim())
    .map(line => {
      const [hash, author, date, ...msgParts] = line.split('|');
      return { hash, author, date, message: msgParts.join('|') };
    });

  return jsonResponse({
    branch,
    staged,
    unstaged,
    commits,
    root,
    workspace_id: workspaceId,
    has_changes:  staged.length > 0 || unstaged.length > 0,
  });
}
