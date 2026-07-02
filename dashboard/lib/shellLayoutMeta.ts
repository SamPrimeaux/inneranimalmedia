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
}): AgentChatLayout {
  const { pathname, search, agentPosition, isNarrow, isCmsFullscreen } = opts;
  if (isCmsFullscreen) return 'hidden';

  const centerChat = isAgentCenterChatHome(pathname, search);
  const editorRoute = isAgentEditorPath(pathname);

  // Center-chat routes (/dashboard/agent, /new, /c/*) always use center layout.
  // agentPosition must not flip layout to a side rail — that remounts ChatAssistant.
  if (centerChat && !editorRoute) {
    return 'center';
  }

  if (agentPosition === 'left') return 'left-rail';
  if (agentPosition === 'right') return 'right-rail';

  if (isAgentShellPath(pathname) || isLibraryShellPath(pathname)) {
    return agentPosition === 'off' ? 'hidden' : 'right-rail';
  }

  return 'hidden';
}

/** Hide empty Monaco trap on agent home / conversation — editor only when a file is open or on /editor. */
export function shouldShowMonacoWorkbench(opts: {
  pathname: string;
  search: string;
  activeTab: string;
  hasActiveFile: boolean;
}): boolean {
  if (opts.activeTab !== 'code') return false;
  if (isAgentEditorPath(opts.pathname)) return true;
  if (opts.hasActiveFile) return true;
  if (isAgentCenterChatHome(opts.pathname, opts.search)) return false;
  return true;
}

export function shouldShowAgentWorkbenchTabs(opts: {
  pathname: string;
  search: string;
}): boolean {
  return !isAgentCenterChatHome(opts.pathname, opts.search);
}
