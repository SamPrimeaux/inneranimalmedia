import { useState, useEffect, useCallback, useMemo } from 'react';

export type DashboardRoute = 
  | 'agent' | 'overview' | 'finance' | 'chats' | 'calendar' 
  | 'meet' | 'mail' | 'cloud' | 'mcp' | 'projects' 
  | 'images' | 'time-tracking' | 'cms' | 'database';


export type LayoutMode = 'default' | 'focus' | 'split' | 'wide';

export interface WorkbenchState {
  activeRoute: DashboardRoute;
  layoutMode: LayoutMode;
  isTerminalOpen: boolean;
  agentPosition: 'left' | 'right' | 'off';
  isWorkspaceLauncherOpen: boolean;
  authWorkspaceId: string | null;
  workspaceRows: Array<{ id: string; name: string; environment?: string }>;
}

export function useWorkbench() {
  const [activeRoute, setActiveRoute] = useState<DashboardRoute>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const match = path.match(/\/dashboard\/([^/]+)/);
      if (match && match[1]) return match[1] as DashboardRoute;
    }
    return 'agent';
  });

  const [layoutMode, setLayoutMode] = useState<LayoutMode>('default');
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [agentPosition, setAgentPosition] = useState<'left' | 'right' | 'off'>(
    () => typeof window !== 'undefined' && window.innerWidth < 768 ? 'off' : 'right'
  );
  
  const [isWorkspaceLauncherOpen, setWorkspaceLauncherOpen] = useState(false);
  const [authWorkspaceId, setAuthWorkspaceId] = useState<string | null>(null);
  const [workspaceRows, setWorkspaceRows] = useState<Array<{ id: string; name: string; environment?: string }>>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const path = window.location.pathname;
      const match = path.match(/\/dashboard\/([^/]+)/);
      if (match && match[1]) setActiveRoute(match[1] as DashboardRoute);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((route: DashboardRoute) => {
    setActiveRoute(route);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `/dashboard/${route}`);
    }
  }, []);

  useEffect(() => {
    fetch('/api/settings/workspaces', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { current?: string; data?: Array<{ id?: string; name?: string; environment?: string }> } | null) => {
        if (d?.current && typeof d.current === 'string') setAuthWorkspaceId(d.current);
        if (Array.isArray(d?.data)) {
          setWorkspaceRows(
            d.data
              .filter(r => r && typeof r.id === 'string')
              .map(r => ({
                id:          r.id as string,
                name:        typeof r.name === 'string' ? r.name : r.id as string,
                environment: typeof r.environment === 'string' ? r.environment : undefined,
              }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const activeWorkspace = useMemo(() => 
    workspaceRows.find(w => w.id === authWorkspaceId) || null
  , [authWorkspaceId, workspaceRows]);

  return {
    activeRoute,
    navigate,
    layoutMode,
    setLayoutMode,
    isTerminalOpen,
    setIsTerminalOpen,
    agentPosition,
    setAgentPosition,
    isWorkspaceLauncherOpen,
    setWorkspaceLauncherOpen,
    authWorkspaceId,
    setAuthWorkspaceId,
    workspaceRows,
    activeWorkspace,
  };
}
