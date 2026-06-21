/** Agent IDE shell routes (ChatAssistant + workspace stay mounted). */
export const AGENT_HOME_PATH = '/dashboard/agent';
export const AGENT_QUICKSTART_PATH = '/dashboard/agent/quickstart';
/** Legacy path — redirects to {@link agentHomeWithTab} examples tab. */
export const AGENT_EXAMPLES_PATH = '/dashboard/agent/examples';

export const AGENT_TAB_QUERY = 'tab';
export const AGENT_EXAMPLES_TAB = 'examples';

export type AgentHomeTab = 'recent' | 'workspaces' | 'systems' | 'examples';

export function agentHomeWithTab(tab: AgentHomeTab): string {
  if (tab === 'recent') return AGENT_HOME_PATH;
  return `${AGENT_HOME_PATH}?${AGENT_TAB_QUERY}=${encodeURIComponent(tab)}`;
}

export function getAgentTabFromSearch(search: string): AgentHomeTab {
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(AGENT_TAB_QUERY);
  const tab = String(raw || '').trim();
  if (tab === 'examples' || tab === 'systems' || tab === 'workspaces') return tab;
  return 'recent';
}

export function isAgentExamplesTabActive(pathname: string, search: string): boolean {
  return isAgentHomePath(pathname) && getAgentTabFromSearch(search) === AGENT_EXAMPLES_TAB;
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

export function isAgentQuickstartPath(pathname: string): boolean {
  return normalizePath(pathname) === AGENT_QUICKSTART_PATH;
}

export function isAgentExamplesPath(pathname: string): boolean {
  return normalizePath(pathname) === AGENT_EXAMPLES_PATH;
}
