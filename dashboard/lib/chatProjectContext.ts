/**
 * Client SSOT for Agent Sam project context (Cursor-shaped: open repo = workspace).
 */
export type ChatProjectContext = {
  github_repo: string | null;
  branch: string;
  active_file: string | null;
};

export function buildChatProjectContext(input: {
  githubRepo?: string | null;
  branch?: string | null;
  activeFilePath?: string | null;
}): ChatProjectContext {
  const github_repo = String(input.githubRepo || '').trim() || null;
  const branch = String(input.branch || '').trim() || 'main';
  const active_file = String(input.activeFilePath || '').trim() || null;
  return { github_repo, branch, active_file };
}

export const CHAT_RUNTIME_LANE_USER_APP = 'user_app';
