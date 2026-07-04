import {
  isAgentCenterChatHome,
  isAgentEditorPath,
  isAgentShellPath,
  isLibraryShellPath,
} from './agentRoutes';

export type AgentChatLayout = 'center' | 'left-rail' | 'right-rail' | 'hidden';

export function resolveAgentChatLayout(opts: {
  pathname: string;
  search: string;
  agentPosition: 'off' | 'left' | 'right';
  isNarrow: boolean;
  isCmsFullscreen: boolean;
  /** True when /editor has an active file open — transitions chat to right rail. */
  hasActiveFile?: boolean;
}): AgentChatLayout {
  const { pathname, search, agentPosition, isNarrow, isCmsFullscreen, hasActiveFile } = opts;
  if (isCmsFullscreen) return 'hidden';

  const centerChat = isAgentCenterChatHome(pathname, search);
  const editorRoute = isAgentEditorPath(pathname);

  // Center-chat routes (/dashboard/agent, /new, /c/*) always use center layout.
  // agentPosition must not flip layout to a side rail — that remounts ChatAssistant.
  if (centerChat && !editorRoute) {
    return 'center';
  }

  // Editor route: chat-first until a file is open.
  // No file → center layout (same as /agent/new). File open → right-rail so Monaco is usable.
  if (editorRoute) {
    if (!hasActiveFile) return 'center';
    // File is open: honour agentPosition, default to right-rail.
    if (agentPosition === 'left') return 'left-rail';
    return 'right-rail';
  }

  if (agentPosition === 'left') return 'left-rail';
  if (agentPosition === 'right') return 'right-rail';

  if (isAgentShellPath(pathname) || isLibraryShellPath(pathname)) {
    return agentPosition === 'off' ? 'hidden' : 'right-rail';
  }

  return 'hidden';
}

/**
 * Hide empty Monaco trap on agent home / conversation — editor only when a file is open.
 * On /editor with no file, Monaco stays hidden so center chat fills the canvas.
 */
export function shouldShowMonacoWorkbench(opts: {
  pathname: string;
  search: string;
  activeTab: string;
  hasActiveFile: boolean;
}): boolean {
  if (opts.activeTab !== 'code') return false;
  // Editor route: only show Monaco when a file is actually open — not on bare /editor landing.
  if (isAgentEditorPath(opts.pathname)) return opts.hasActiveFile;
  if (opts.hasActiveFile) return true;
  if (isAgentCenterChatHome(opts.pathname, opts.search)) return false;
  return true;
}

export function shouldShowAgentWorkbenchTabs(opts: {
  pathname: string;
  search: string;
  hasActiveFile?: boolean;
}): boolean {
  if (isAgentCenterChatHome(opts.pathname, opts.search)) return false;
  // On /editor with no file open, suppress workbench tabs — chat fills the canvas.
  if (isAgentEditorPath(opts.pathname) && !opts.hasActiveFile) return false;
  return true;
}
