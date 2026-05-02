/**
 * API Service: Git Status & Source Control
 * Provides git metadata to the dashboard UI.
 */
import { runTerminalCommand, resolveIamWorkspaceRoot } from '../core/terminal';
import { jsonResponse } from '../core/auth';

/**
 * GET /api/internal/git-status
 * Returns current branch, staged, and unstaged changes.
 */
export async function handleGitStatusRequest(request, env, ctx) {
  const root = await resolveIamWorkspaceRoot(env);
  
  // 1. Get Branch
  const branchCmd = await runTerminalCommand(env, request, `git -C "${root}" branch --show-current`, 'git_status');
  const branch = branchCmd.output.trim() || 'unknown';

  // 2. Get Porcelain Status
  const statusCmd = await runTerminalCommand(env, request, `git -C "${root}" status --porcelain`, 'git_status');
  const lines = statusCmd.output.split('\n').filter(l => l.trim());

  const staged = [];
  const unstaged = [];

  for (const line of lines) {
    const x = line[0];
    const y = line[1];
    const path = line.slice(3).trim();

    // Map porcelain status to descriptive states
    const item = { path, status: line.slice(0, 2).trim() };

    // XY: X is staged, Y is unstaged
    if (x !== ' ' && x !== '?') {
       staged.push(item);
    }
    if (y !== ' ' || x === '?') {
       unstaged.push(item);
    }
  }

  // 3. Get Recent Log
  const logCmd = await runTerminalCommand(env, request, `git -C "${root}" log -n 5 --pretty=format:"%h|%an|%ar|%s"`, 'git_status');
  const commits = logCmd.output.split('\n').filter(l => l.trim()).map(c => {
    const [hash, author, date, msg] = c.split('|');
    return { hash, author, date, msg };
  });

  return jsonResponse({
    branch,
    staged,
    unstaged,
    commits,
    root
  });
}
