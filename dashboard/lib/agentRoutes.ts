/** Agent IDE shell routes (ChatAssistant + workspace stay mounted). */
export const AGENT_HOME_PATH = '/dashboard/agent';
/** Composer-only fresh thread — no persisted session id in URL until first send. */
export const AGENT_NEW_CHAT_PATH = '/dashboard/agent/new';
export const AGENT_EDITOR_PATH = '/dashboard/agent/editor';
export const AGENT_WORKSPACE_PATH = '/dashboard/agent/workspace';
export const AGENT_SYSTEMS_PATH = '/dashboard/agent/systems';
export const AGENT_QUICKSTART_PATH = '/dashboard/agent/quickstart';
/** Legacy path — redirects to {@link agentHomeWithTab} examples tab. */
export const AGENT_EXAMPLES_PATH = '/dashboard/agent/examples';

export const AGENT_TAB_QUERY = 'tab';
export const AGENT_EXAMPLES_TAB = 'examples';

export type AgentHomeTab = 'recent' | 'workspaces' | 'systems' | 'examples';

/** Bare `/dashboard/agent` (no tab) is the atmospheric home — not a workspace tab. */
export function agentHomeWithTab(tab: AgentHomeTab): string {
  return `${AGENT_HOME_PATH}?${AGENT_TAB_QUERY}=${encodeURIComponent(tab)}`;
}

export function getAgentTabFromSearch(search: string): AgentHomeTab | null {
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(AGENT_TAB_QUERY);
  const tab = String(raw || '').trim();
  if (tab === 'examples' || tab === 'systems' || tab === 'workspaces' || tab === 'recent') return tab;
  return null;
}

export function isAgentAtmosphericHome(pathname: string, search: string): boolean {
  return isAgentHomePath(pathname) && getAgentTabFromSearch(search) === null;
}

export function isAgentEditorPath(pathname: string): boolean {
  return normalizePath(pathname) === AGENT_EDITOR_PATH;
}

export function isAgentWorkspacePath(pathname: string): boolean {
  return normalizePath(pathname) === AGENT_WORKSPACE_PATH;
}

export function isAgentSystemsPath(pathname: string): boolean {
  return normalizePath(pathname) === AGENT_SYSTEMS_PATH;
}

export function agentPathTab(pathname: string): AgentHomeTab | null {
  if (isAgentWorkspacePath(pathname)) return 'recent';
  if (isAgentSystemsPath(pathname)) return 'systems';
  if (isAgentExamplesPath(pathname)) return 'examples';
  return null;
}

export function isAgentWorkspaceBrowserPath(pathname: string, search: string): boolean {
  if (isAgentWorkspacePath(pathname) || isAgentSystemsPath(pathname) || isAgentExamplesPath(pathname)) {
    return true;
  }
  return isAgentHomePath(pathname) && getAgentTabFromSearch(search) !== null;
}

export function resolveAgentWorkspaceTab(pathname: string, search: string): AgentHomeTab {
  const fromPath = agentPathTab(pathname);
  if (fromPath) return fromPath;
  const fromQuery = getAgentTabFromSearch(search);
  if (fromQuery) return fromQuery;
  if (isAgentWorkspacePath(pathname)) {
    const qTab = getAgentTabFromSearch(search);
    if (qTab === 'workspaces') return 'workspaces';
    return 'recent';
  }
  return 'recent';
}

export function isAgentExamplesTabActive(pathname: string, search: string): boolean {
  return isAgentExamplesPath(pathname) || (isAgentHomePath(pathname) && getAgentTabFromSearch(search) === AGENT_EXAMPLES_TAB);
}

export function normalizePath(pathname: string): string {
  const p = String(pathname || '').trim();
  if (!p) return AGENT_HOME_PATH;
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

/** True when the main editor should show Agent workspace/quickstart (not lazy dashboard Routes). */
export function isAgentShellPath(pathname: string): boolean {
  const p = normalizePath(pathname);
  return p === AGENT_HOME_PATH || p === AGENT_QUICKSTART_PATH || p.startsWith(`${AGENT_HOME_PATH}/`);
}

export function isAgentHomePath(pathname: string): boolean {
  return normalizePath(pathname) === AGENT_HOME_PATH;
}

export function isAgentNewChatPath(pathname: string): boolean {
  return normalizePath(pathname) === AGENT_NEW_CHAT_PATH;
}

/** `/dashboard/agent/:conversationId` — active thread deep link (set via replaceState after first send). */
export function isAgentConversationPath(pathname: string): boolean {
  const p = normalizePath(pathname);
  if (p === AGENT_HOME_PATH || p === AGENT_NEW_CHAT_PATH) return false;
  if (!p.startsWith(`${AGENT_HOME_PATH}/`)) return false;
  const tail = p.slice(`${AGENT_HOME_PATH}/`.length);
  if (!tail || tail.includes('/')) return false;
  const reserved = new Set(['editor', 'workspace', 'systems', 'quickstart', 'examples', 'new']);
  return !reserved.has(tail.toLowerCase());
}

export function agentConversationPath(conversationId: string): string {
  const id = String(conversationId || '').trim();
  return id ? `${AGENT_HOME_PATH}/${encodeURIComponent(id)}` : AGENT_NEW_CHAT_PATH;
}

export function replaceAgentConversationUrl(conversationId: string): void {
  if (typeof window === 'undefined') return;
  const id = String(conversationId || '').trim();
  if (!id) return;
  const next = agentConversationPath(id);
  const current = normalizePath(window.location.pathname);
  if (current === normalizePath(next)) return;
  window.history.replaceState(window.history.state, '', next);
}

export function isAgentQuickstartPath(pathname: string): boolean {
  return normalizePath(pathname) === AGENT_QUICKSTART_PATH;
}

export function isAgentExamplesPath(pathname: string): boolean {
  return normalizePath(pathname) === AGENT_EXAMPLES_PATH;
}

/** Routes that render dashboard content beside the agent column (stay put on new chat). */
export function isLibraryShellPath(pathname: string): boolean {
  const p = normalizePath(pathname);
  return (
    p === '/dashboard/artifacts' ||
    p === '/dashboard/chats' ||
    p === '/dashboard/tasks' ||
    p === '/dashboard/collaborate' ||
    p === '/dashboard/home' ||
    p === '/dashboard/overview'
  );
}
