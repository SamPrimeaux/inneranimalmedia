/** Agent IDE shell routes (ChatAssistant + workspace stay mounted). */
export const AGENT_HOME_PATH = '/dashboard/agent';
export const AGENT_QUICKSTART_PATH = '/dashboard/agent/quickstart';

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
