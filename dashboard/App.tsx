
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useCallback, useMemo, Suspense, lazy } from 'react';
import { useLocation, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { ChatAssistant } from './components/ChatAssistant';
import { WorkspaceDashboard } from './components/WorkspaceDashboard';
import { AgentQuickstartPage, type QuickstartTemplate } from './components/AgentQuickstartPage';
import {
  AGENT_HOME_PATH,
  AGENT_QUICKSTART_PATH,
  isAgentHomePath,
  isAgentQuickstartPath,
  isAgentShellPath,
} from './lib/agentRoutes';
import { MCPPanel } from './components/MCPPanel';
import {
  IAM_AGENT_CHAT_CONVERSATION_CHANGE,
  IAM_AGENT_CHAT_NEW_THREAD,
  LS_AGENT_CHAT_CONVERSATION_ID,
  QUICKSTART_BATCH_LABEL,
  QUICKSTART_WORKSPACE_ID,
  type QuickstartThreadDetail,
} from './agentChatConstants';
import { WorkspaceLauncher } from './components/WorkspaceLauncher';
import { XTermShell, XTermShellHandle } from './components/XTermShell';
import { ExtensionsPanel } from './components/ExtensionsPanel';
import { MonacoEditorView, type EditorModelMeta } from './components/MonacoEditorView';
import { LocalExplorer } from './components/LocalExplorer';
import { BrowserView } from './components/BrowserView';
import { StatusBar, type AgentNotificationRow } from './components/StatusBar';
import { DatabaseBrowser, type DatabaseExplorerJump } from './components/DatabaseBrowser';
import { UnifiedSearchBar, type UnifiedSearchNavigate } from './components/UnifiedSearchBar';
import { GitHubActionsPanel } from './components/GitHubActionsPanel';
import { GitHubExplorer } from './components/GitHubExplorer';
import { KnowledgeSearchPanel } from './components/KnowledgeSearchPanel';
// import { ProblemsDebugPanel } from './components/ProblemsDebugPanel';
import { GoogleDriveExplorer } from './components/GoogleDriveExplorer';
import { SourcePanel } from './components/SourcePanel';
import { ProjectType, type ActiveFile } from './types';
import { SHELL_VERSION } from './src/shellVersion';
import {
  fetchAndApplyActiveCmsTheme,
  applyCachedCmsThemeFallback,
  applyCachedCmsThemeFallbackForWorkspace,
  migrateLegacyThemeLocalStorage,
  applyCmsThemeToDocument,
  logDashboardThemeDebug,
  type CmsActiveThemePayload,
} from './src/applyCmsTheme';
import {
  hydrateIdeFromApi,
  persistIdeToApi,
  formatWorkspaceStatusLine,
  mergeRecentFromActiveFile,
  IDE_PERSIST_VERSION,
  type IdeWorkspaceSnapshot,
  type RecentFileEntry,
} from './src/ideWorkspace';
import {
  prepareRecentWorkspacesForSession,
  getTrustedRecentWorkspaceId,
} from './src/recentWorkspacesStorage';
import { useEditor } from './src/EditorContext';
import { MeetProvider, MeetCtxValue } from './src/MeetContext';
import { MeetShellPanel } from './components/MeetShellPanel';
import { AuthSignInPage } from './components/auth/AuthSignInPage';
import { AuthSignUpPage } from './components/auth/AuthSignUpPage';
import { AuthForgotPage } from './components/auth/AuthForgotPage';
import { AuthResetPage } from './components/auth/AuthResetPage';
import AuthOAuthConsentPage from './components/auth/AuthOAuthConsentPage';
import { OnboardingPage } from './components/onboarding/OnboardingPage';
import { Bot, Home, Files, Search, GitBranch, Settings, PanelLeft, PanelLeftClose, PanelRightClose, Terminal as TermIcon, LayoutTemplate, Network, Layers, Monitor, ChevronDown, Bug, Github, Database, FolderOpen, Globe, PenTool, Cloud, X as XIcon, PanelBottom, Eye, MessageSquare, MoreHorizontal, ChevronLeft, Link2, HardDrive, Package, Palette, History, Wrench, Camera, Image, Mail, GraduationCap, ChartColumnIncreasing, Library } from 'lucide-react';
const ProjectManagement = lazy(() => import('./pages/projects/ProjectManagement'));

/** Route-level code splitting: heavy dashboard pages load on demand; shell + /dashboard/agent stay eager. */
const CalendarPage = lazy(() => import('./components/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const OverviewPage = lazy(() => import('./components/overview'));
const HealthPage = lazy(() => import('./pages/HealthPage').then((m) => ({ default: m.HealthPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const RedirectHealthToAnalytics = lazy(() =>
  import('./pages/RedirectHealthToAnalytics').then((m) => ({ default: m.RedirectHealthToAnalytics })),
);
const LearnPage = lazy(() => import('./components/LearnPage'));
const DatabasePage = lazy(() => import('./components/DatabasePage').then((m) => ({ default: m.DatabasePage })));
const McpPage = lazy(() => import('./components/McpPage').then((m) => ({ default: m.McpPage })));
const DesignStudioPage = lazy(() => import('./components/DesignStudioPage').then((m) => ({ default: m.DesignStudioPage })));
const ImagesPage = lazy(() => import('./components/ImagesPage'));
const MailPage = lazy(() => import('./components/MailPage').then((m) => ({ default: m.MailPage })));
const MeetPage = lazy(() => import('./components/MeetPage'));
const SettingsPanel = lazy(() => import('./components/settings'));
const TasksPage = lazy(() => import('./pages/tasks/TasksPage'));
const LibraryPage = lazy(() => import('./pages/library/LibraryPage'));
const WorkflowsPage = lazy(() => import('./pages/workflows/WorkflowsPage'));
const MovieModeStudio = lazy(() =>
  import('./features/moviemode/MovieModeStudio').then((m) => ({ default: m.MovieModeStudio })),
);
const ExcalidrawView = lazy(() =>
  import('./components/ExcalidrawView').then((m) => ({ default: m.ExcalidrawView })),
);

function DashboardRoutesFallback() {
  return (
    <div
      className="flex-1 min-h-0 flex items-center justify-center text-sm"
      style={{ color: 'var(--text-muted)' }}
      role="status"
      aria-live="polite"
    >
      Loading…
    </div>
  );
}

function escapeHtmlForPreview(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tab-bar Preview is shown for these extensions (blob / wrapped HTML in Browser tab). */
function isRenderablePreviewFilename(name: string): boolean {
  return /\.(html?|svg|md|jsx|tsx)$/i.test(name.trim());
}

function previewButtonTitle(name: string): string {
  if (/\.(html|htm)$/i.test(name)) return 'Preview HTML in Browser tab';
  if (/\.svg$/i.test(name)) return 'Preview SVG in Browser tab';
  if (/\.md$/i.test(name)) return 'Preview Markdown in Browser tab';
  if (/\.jsx$/i.test(name)) return 'Open JSX preview (build step required) in Browser tab';
  if (/\.tsx$/i.test(name)) return 'Open TSX preview (build step required) in Browser tab';
  return 'Preview in Browser tab';
}

/** Preview size thresholds — blob preview above SERVE causes blank/freeze; redirect to PTY. */
const PREVIEW_WARN_BYTES = 500_000; // 500 KB — warn but still try blob
const PREVIEW_SERVE_BYTES = 1_500_000; // 1.5 MB — redirect to PTY serve / Vite

/** Shown in the Browser tab address bar instead of a blob: URL when previewing from the editor. */
function previewAddressBarLabel(file: ActiveFile): string {
  const k = file.r2Key?.trim();
  const b = file.r2Bucket?.trim();
  if (k && b) return `r2://${b}/${k}`;
  const gh = file.githubRepo?.trim();
  const gp = file.githubPath?.trim();
  if (gh && gp) return `github://${gh}/${gp}`;
  const wp = file.workspacePath?.trim();
  if (wp) return `local://${wp}`;
  return `preview:${(file.name || 'buffer').trim() || 'buffer'}`;
}

const PRODUCT_NAME = 'Agent Sam';

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  github_repo: string | null;
}

function buildAgentSamGreeting(workspaceDisplayLine: string): string {
  const w = workspaceDisplayLine.trim();
  if (!w || w === 'No workspace') {
    return `${PRODUCT_NAME}: pick a workspace in Settings or open a local folder, then tell me what you want to build.`;
  }
  return `Hi! I'm ${PRODUCT_NAME}. Current workspace: ${w}. What should we work on?`;
}

const QUICK_COMMANDS = [
  { icon: Monitor, label: 'Local PTY', cmd: 'ssh iam-pty', desc: 'Inner Animal PTY' },
  { icon: Globe, label: 'Production SSH', cmd: 'ssh production-iam', desc: 'Mainstage Access' },
  { icon: HardDrive, label: 'Sandbox SSH', cmd: 'ssh sandbox-d1', desc: 'Experiment D1' },
  { icon: MessageSquare, label: 'Clear Chat', cmd: 'clear', desc: 'Reset Agent Session' },
  { icon: Package, label: 'Build Project', cmd: 'npm run build', desc: 'Production Bundle' },
  { icon: Database, label: 'Sync DB', cmd: 'npx prisma db pull', desc: 'D1 Schema Sync' },
];

const SETTINGS_SLUG_MAP: Record<string, string> = {
  general: 'General',
  agents: 'Agents',
  'ai-models': 'AI Models',
  tools: 'Tools & MCP',
  rules: 'Rules & Skills',
  workspace: 'Workspace',
  hooks: 'Hooks',
  github: 'GitHub',
  cicd: 'CI/CD',
  network: 'Network',
  themes: 'Themes',
  storage: 'Storage',
  security: 'Security',
  billing: 'Plan & Usage',
  notifications: 'Notifications',
  docs: 'Docs',
  integrations: 'Integrations',
};

/** Agent Sam chat column width bounds (px). */
const AGENT_PANEL_MIN_W = 320;
const AGENT_PANEL_MAX_W = 640;
/** Minimum width kept for the main editor/workspace while dragging the agent column. */
const MAIN_MIN_W_FOR_AGENT_RESIZE = 380;
/** Wider pointer target than the visible 1px stroke for the agent column resizer (matches JSX). */
const AGENT_RESIZER_HIT_PX = 10;
/** Wider hit target for the activity-sidebar grab (matches JSX). */
const ACTIVITY_SIDEBAR_GRAB_PX = 10;

/**
 * Next width after a horizontal drag. Sidebar: grow when dragging handle right.
 * Agent: sign depends on which edge of the chat column owns the handle.
 */
function getNextPanelWidth(args: {
  panel: 'sidebar' | 'agent';
  startWidth: number;
  deltaX: number;
  agentPosition: 'left' | 'right' | 'off';
  min: number;
  max: number;
}): number {
  let raw: number;
  if (args.panel === 'sidebar') {
    raw = args.startWidth + args.deltaX;
  } else {
    raw = args.agentPosition === 'right' ? args.startWidth - args.deltaX : args.startWidth + args.deltaX;
  }
  return Math.max(args.min, Math.min(args.max, Math.round(raw)));
}

function activityRailWidthPx(expanded: boolean): number {
  return expanded ? 180 : 48;
}

/** Max agent column width so main workspace stays usable (also capped by AGENT_PANEL_MAX_W). */
function getAgentPanelViewportMaxPx(opts: {
  viewportInnerWidth: number;
  activityRailWidth: number;
  activityPanelOpen: boolean;
  activityPanelWidth: number;
  mainMinWidth: number;
}): number {
  const activityStrip = opts.activityPanelOpen ? opts.activityPanelWidth + ACTIVITY_SIDEBAR_GRAB_PX : 0;
  const reserved =
    opts.activityRailWidth + activityStrip + AGENT_RESIZER_HIT_PX + opts.mainMinWidth;
  return opts.viewportInnerWidth - reserved;
}

const IAM_RECENT_FILES_LS_KEY = 'iam_recent_files';
const IAM_RECENT_FILES_LS_CAP = 10;

function isRecentFileEntry(x: unknown): x is RecentFileEntry {
  return (
    !!x &&
    typeof x === 'object' &&
    typeof (x as RecentFileEntry).id === 'string' &&
    typeof (x as RecentFileEntry).name === 'string' &&
    typeof (x as RecentFileEntry).openedAt === 'number'
  );
}

function readRecentFilesFromLocalStorage(): RecentFileEntry[] {
  try {
    const raw = localStorage.getItem(IAM_RECENT_FILES_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentFileEntry).slice(0, IAM_RECENT_FILES_LS_CAP);
  } catch {
    return [];
  }
}

function persistRecentFileToLocalStorage(entry: RecentFileEntry): void {
  try {
    const prev = readRecentFilesFromLocalStorage();
    const next = [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, IAM_RECENT_FILES_LS_CAP);
    localStorage.setItem(IAM_RECENT_FILES_LS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

const App: React.FC = () => {
  const { tabs, activeTabId, openFile, updateActiveContent, saveActiveFile } = useEditor();
  const location = useLocation();
  const navigate = useNavigate();
  const integrationsSlug =
    (Object.entries(SETTINGS_SLUG_MAP) as [string, string][]).find(([, lab]) => lab === 'Integrations')?.[0] ??
    'integrations';
  const settingsIntegrationsActive = location.pathname === `/dashboard/settings/${integrationsSlug}`;
  const terminalRef = useRef<XTermShellHandle>(null);
  const collabWsRef = useRef<WebSocket | null>(null);

  // Monaco deep-link handler (Settings → MCP tool config).
  // Opens a new editor tab with payload content, then clears query params.
  useEffect(() => {
    if (!isAgentHomePath(location.pathname)) return;
    const search = location.search || '';
    if (!search) return;
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const monaco = params.get('monaco');
    if (monaco !== 'mcp_tool') return;

    const id = params.get('id') || 'tool';
    const payload = params.get('payload') || '';
    if (!payload) return;

    let decoded = payload;
    try {
      decoded = decodeURIComponent(payload);
    } catch {
      decoded = payload;
    }

    // Guard: avoid blowing up the editor with absurd payloads.
    const content = decoded.length > 250_000 ? decoded.slice(0, 250_000) : decoded;
    const name = `mcp_tool_${id}.json`;

    openFile({
      name,
      workspacePath: `mcp_tool:${id}`,
      content,
    });

    // Clear query params but stay on the Agent route.
    try {
      navigate(AGENT_HOME_PATH, { replace: true });
    } catch {
      // ignore
    }
  }, [location.pathname, location.search, navigate, openFile]);

  if (!location.pathname.startsWith('/dashboard')) {
    return (
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/auth/login" element={<AuthSignInPage />} />
        <Route path="/auth/signup" element={<AuthSignUpPage />} />
        <Route path="/forgot-password" element={<AuthForgotPage />} />
        <Route path="/reset-password" element={<AuthResetPage />} />
        <Route path="/api/auth/oauth/consent" element={<AuthOAuthConsentPage />} />
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
    );
  }
  
  const [activeProject] = useState<ProjectType>(ProjectType.SANDBOX);

  // IDE State
  type TabId = 'Workspace' | 'welcome' | 'code' | 'browser' | 'glb' | 'excalidraw' | 'moviemode';
  const [activeActivity, setActiveActivity] = useState<'files' | 'search' | 'mcps' | 'git' | 'debug' | 'actions' | 'drive' | 'database' | null>(null);
  const LS_SIDEBAR_RAIL = 'iam_sidebar_expanded';
  /** User-chosen agent column side; survives reloads (not overwritten by workspace policy fetch). */
  const LS_AGENT_POSITION = 'iam_agent_position';
  const [sidebarRailExpanded, setSidebarRailExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const v = localStorage.getItem(LS_SIDEBAR_RAIL);
      if (v === '0') return false;
      if (v === '1') return true;
    } catch {
      /* ignore */
    }
    return true;
  });
  const [agentPosition, setAgentPosition] = useState<'right' | 'left' | 'off'>(() => {
    if (typeof window === 'undefined') return 'right';
    if (window.innerWidth < 768) return 'off';
    try {
      const v = localStorage.getItem(LS_AGENT_POSITION);
      if (v === 'left' || v === 'right' || v === 'off') return v;
    } catch {
      /* ignore */
    }
    return 'right';
  });
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalDrawerH, setTerminalDrawerH] = useState(288);
  /** Mirrored from Lab shell for Output tab (build / r2 / help). */
  const [shellOutputLines, setShellOutputLines] = useState<string[]>([]);

  const [ideWorkspace, setIdeWorkspace] = useState<IdeWorkspaceSnapshot>(() => ({ source: 'none' }));
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);
  const [recentFilesLsTick, setRecentFilesLsTick] = useState(0);
  const [gitBranch, setGitBranch] = useState(() => '');
  const stableAgentChatTabId = useMemo(
    () =>
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tab_${Date.now()}`,
    [],
  );
  const [agentChatTabs, setAgentChatTabs] = useState<Array<{ id: string; conversationId: string; title: string }>>(() => {
    let persisted = '';
    try {
      persisted =
        typeof localStorage !== 'undefined' ? localStorage.getItem(LS_AGENT_CHAT_CONVERSATION_ID)?.trim() || '' : '';
    } catch {
      /* ignore */
    }
    return [{ id: stableAgentChatTabId, conversationId: persisted, title: persisted ? 'Chat' : 'New chat' }];
  });
  const [activeAgentChatTabId, setActiveAgentChatTabId] = useState(() => stableAgentChatTabId);
  const [messagesByTabId, setMessagesByTabId] = useState<
    Record<string, { role: 'user' | 'assistant'; content: string }[]>
  >(() => ({
    [stableAgentChatTabId]: [{ role: 'assistant', content: buildAgentSamGreeting(formatWorkspaceStatusLine({ source: 'none' })) }],
  }));
  const [dbExplorerJump, setDbExplorerJump] = useState<DatabaseExplorerJump | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [systemProblems, setSystemProblems] = useState<any>([]);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [tunnelHealthy, setTunnelHealthy] = useState<boolean | null>(null);
  const [tunnelLabel, setTunnelLabel] = useState<string | null>(null);
  const [terminalOk, setTerminalOk] = useState<boolean | null>(null);
  const [lastDeployLine, setLastDeployLine] = useState<string | null>(null);
  const [editorMeta, setEditorMeta] = useState<EditorModelMeta>({
    tabSize: 2,
    insertSpaces: true,
    eol: 'LF',
    encoding: 'UTF-8',
  });
  const [agentNotifications, setAgentNotifications] = useState<AgentNotificationRow[]>([]);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  /** Increment to trigger File System Access picker from Welcome "Open Folder" after files panel mounts. */
  const [nativeFolderOpenSignal, setNativeFolderOpenSignal] = useState(0);
  /** ≤768px: secondary rail actions (sheet above bottom tab bar). */
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [agentIsStreaming, setAgentIsStreaming] = useState(false);
  const [activeCommandRunId, setActiveCommandRunId] = useState<string | null>(null);
  /** `agentsam_agent_run.id` from chat SSE context — separate from command_run approval id. */
  const [activeAgentRunId, setActiveAgentRunId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInitialFacets, setSearchInitialFacets] = useState<string[]>([]);
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  const onUnifiedSearchOpenChange = useCallback((next: boolean) => {
    setSearchOpen(next);
    if (!next) {
      setSearchInitialFacets([]);
      setSearchInitialQuery('');
    }
  }, []);
  /** Desktop: Draw / Search / History (Addendum A). */
  const [topChromeMoreOpen, setTopChromeMoreOpen] = useState(false);
  const topChromeMoreRef = useRef<HTMLDivElement>(null);
  const [isWorkspaceLauncherOpen, setWorkspaceLauncherOpen] = useState(false);

  const [meetCtxValue, setMeetCtxValue] = useState<MeetCtxValue | null>(null);

  const [isNarrowViewport, setIsNarrowViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  );
  const mobileSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  /** Mobile chat repo drawer: expand this repo when opening the GitHub / Deploy panel. */
  const [githubExpandRepo, setGithubExpandRepo] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const fn = () => setIsNarrowViewport(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || isNarrowViewport) return;
    try {
      localStorage.setItem(LS_AGENT_POSITION, agentPosition);
    } catch {
      /* ignore */
    }
  }, [agentPosition, isNarrowViewport]);

  useEffect(() => {
    logDashboardThemeDebug();
  }, [location.search]);

  /** Resolved from GET /api/auth/me — used to scope workspace recents in localStorage. */
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  /** From GET /api/settings/workspaces (`current` = default_workspace_id); drives theme ?workspace= */
  const [authWorkspaceId, setAuthWorkspaceId] = useState<string | null>(null);
  /** Rows from same API — used for human-readable workspace name in chrome + chat. */
  const [workspaceRows, setWorkspaceRows] = useState<WorkspaceRow[]>([]);
  const [workspaceDisplayName, setWorkspaceDisplayName] = useState<string | null>(null);
  const [agentsamChatPolicy, setAgentsamChatPolicy] = useState<Record<string, unknown> | null>(null);
  const maxTabsPolicyRef = useRef(24);
  /** Abort stale GET /api/themes/active after Settings → Apply overwrites document (race fix). */
  const activeThemeBootstrapAbortRef = useRef<AbortController | null>(null);
  const [workspaceSamState, setWorkspaceSamState] = useState<Record<string, unknown> | null>(null);

  const workspaceDisplayFallback = useMemo(() => {
    const id = authWorkspaceId?.trim();
    if (id && workspaceRows.length > 0) {
      const row = workspaceRows.find((w) => w.id === id);
      if (row?.name?.trim()) return row.name.trim();
      return id;
    }
    return formatWorkspaceStatusLine(ideWorkspace);
  }, [authWorkspaceId, workspaceRows, ideWorkspace]);

  const workspaceDisplayLine = workspaceDisplayName || workspaceDisplayFallback;

  const activeAgentConversationId = useMemo(
    () => agentChatTabs.find((t) => t.id === activeAgentChatTabId)?.conversationId?.trim() ?? '',
    [agentChatTabs, activeAgentChatTabId],
  );

  const agentChatTabsRef = useRef(agentChatTabs);
  const activeAgentChatTabIdRef = useRef(activeAgentChatTabId);
  agentChatTabsRef.current = agentChatTabs;
  activeAgentChatTabIdRef.current = activeAgentChatTabId;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__ = authWorkspaceId || 'global';
    window.dispatchEvent(new CustomEvent('iam_workspace_id'));
  }, [authWorkspaceId]);

  // IAM_COLLAB — same workspace DO room as canvas (`canvas:{workspaceId}`): realtime theme + canvas (D1 is authority).
  useEffect(() => {
    const wsId = authWorkspaceId?.trim();
    if (!wsId) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const room = encodeURIComponent(`canvas:${wsId}`);
    const wsUrl = `${proto}//${window.location.host}/api/collab/room/${room}`;
    const ws = new WebSocket(wsUrl);
    collabWsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as Record<string, unknown>;
        if (
          msg.type === 'theme_update' &&
          msg.cssVars &&
          typeof msg.cssVars === 'object' &&
          !Array.isArray(msg.cssVars) &&
          Object.keys(msg.cssVars as object).length > 0
        ) {
          applyCmsThemeToDocument({
            slug: typeof msg.theme_slug === 'string' ? msg.theme_slug : undefined,
            data: msg.cssVars as Record<string, string>,
            monaco_theme: typeof msg.monaco_theme === 'string' ? msg.monaco_theme : undefined,
            monaco_bg: typeof msg.monaco_bg === 'string' ? msg.monaco_bg : undefined,
            monaco_theme_data:
              msg.monaco_theme_data != null && typeof msg.monaco_theme_data === 'string'
                ? msg.monaco_theme_data
                : undefined,
            workspace_id: wsId,
            theme_channel: 'live',
          });
          logDashboardThemeDebug();
        }
        if (msg.type === 'canvas_update') {
          window.dispatchEvent(new CustomEvent('iam:canvas_update', { detail: msg.elements }));
        }
        if (msg.type === 'iam_excalidraw') {
          window.dispatchEvent(
            new CustomEvent('iam:excalidraw_action', { detail: { action: msg.action, params: msg.params } }),
          );
        }
      } catch (_) {}
    };
    ws.onerror = () => {};
    return () => {
      try {
        ws.close();
      } catch (_) {}
    };
  }, [authWorkspaceId]);

  useEffect(() => {
    const ws = authWorkspaceId?.trim();
    if (!ws) {
      setAgentsamChatPolicy(null);
      return;
    }
    void fetch(`/api/settings/agents?workspace_id=${encodeURIComponent(ws)}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { policy?: Record<string, unknown> } | null) => {
        if (!d?.policy || typeof d.policy !== 'object') {
          setAgentsamChatPolicy(null);
          return;
        }
        setAgentsamChatPolicy(d.policy);
        const m = Number(d.policy.max_tab_count);
        if (Number.isFinite(m) && m >= 2) maxTabsPolicyRef.current = Math.min(48, Math.max(2, Math.floor(m)));
      })
      .catch(() => setAgentsamChatPolicy(null));
  }, [authWorkspaceId]);

  useEffect(() => {
    if (!isAgentHomePath(location.pathname)) return;
    const ws = authWorkspaceId?.trim();
    if (!ws) {
      setWorkspaceSamState(null);
      return;
    }
    void fetch(`/api/agent/workspace/${encodeURIComponent(ws)}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((row: { state?: Record<string, unknown> } | null) => {
        const st = row?.state && typeof row.state === 'object' ? row.state : null;
        setWorkspaceSamState(st);
      })
      .catch(() => setWorkspaceSamState(null));
  }, [location.pathname, authWorkspaceId]);

  useEffect(() => {
    let cancelled = false;

    /** Same source as Settings → Workspace (`user_settings.default_workspace_id`), then shell recents, then newest row. */
    const pickActiveWorkspace = (
      list: Array<{ id: string; display_name?: string; slug?: string }>,
      settingsCurrent: string | null | undefined,
      userId: string | null,
    ): { id: string; displayName: string | null } | null => {
      const rows = list.filter((w) => w && typeof w.id === 'string');
      if (rows.length === 0) return null;
      const byId = (id: string) => rows.find((w) => w.id === id);
      const trimName = (w: (typeof rows)[0]) => {
        const dn = typeof w.display_name === 'string' ? w.display_name.trim() : '';
        return dn || (typeof w.slug === 'string' && w.slug.trim() ? w.slug.trim() : null);
      };

      const cur = typeof settingsCurrent === 'string' ? settingsCurrent.trim() : '';
      if (cur) {
        const row = byId(cur);
        if (row) return { id: row.id, displayName: trimName(row) };
      }
      try {
        const rid = getTrustedRecentWorkspaceId(userId);
        if (rid) {
          const row = byId(rid);
          if (row) return { id: row.id, displayName: trimName(row) };
        }
      } catch {
        /* ignore */
      }
      const first = rows[0];
      return { id: first.id, displayName: trimName(first) };
    };

    void (async () => {
      let userId: string | null = null;
      try {
        const meRes = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (meRes.ok) {
          const me = (await meRes.json()) as { id?: string | null };
          const rawId = me?.id;
          userId = rawId != null && String(rawId).trim() ? String(rawId).trim() : null;
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      setSessionUserId(userId);
      prepareRecentWorkspacesForSession(userId);

      let settingsCurrent: string | null = null;
      try {
        const r = await fetch('/api/settings/workspaces', { credentials: 'same-origin' });
        const d = r.ok ? ((await r.json()) as { current?: string }) : null;
        if (d?.current && typeof d.current === 'string' && d.current.trim()) {
          settingsCurrent = d.current.trim();
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;

      let pickedId: string | null = null;
      try {
        const r = await fetch('/api/workspaces/list', { credentials: 'same-origin' });
        const d = r.ok
          ? ((await r.json()) as {
              workspaces?: Array<{
                id: string;
                display_name?: string;
                slug?: string;
                status?: string;
                github_repo?: string | null;
              }>;
            })
          : null;
        if (cancelled) return;
        const workspaces = Array.isArray(d?.workspaces) ? d.workspaces : [];
        setWorkspaceRows(
          workspaces
            .filter((w) => w && typeof w.id === 'string')
            .map((w) => ({
              id: w.id,
              name:
                typeof w.display_name === 'string' && w.display_name.trim()
                  ? w.display_name
                  : w.slug || w.id,
              slug: w.slug || w.id,
              status: w.status || 'active',
              github_repo: w.github_repo || null,
            })),
        );
        const picked = pickActiveWorkspace(workspaces, settingsCurrent, userId);
        if (picked?.id) {
          pickedId = picked.id;
          setAuthWorkspaceId(picked.id);
          if (picked.displayName) setWorkspaceDisplayName(picked.displayName);
        }
      } catch {
        /* ignore */
      }
      if (!cancelled && !pickedId && settingsCurrent) {
        setAuthWorkspaceId(settingsCurrent);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.title = `${workspaceDisplayLine} — ${PRODUCT_NAME}`;
  }, [workspaceDisplayLine]);

  const idePersistRef = useRef({
    ideWorkspace: { source: 'none' } as IdeWorkspaceSnapshot,
    gitBranch: '',
    recentFiles: [] as RecentFileEntry[],
  });
  useEffect(() => {
    idePersistRef.current = { ideWorkspace, gitBranch, recentFiles };
  }, [ideWorkspace, gitBranch, recentFiles]);

  const hydrateGenRef = useRef(0);
  const prevAgentConvRef = useRef<string>('');
  useEffect(() => {
    const id = activeAgentConversationId?.trim() || '';
    const prev = prevAgentConvRef.current;
    prevAgentConvRef.current = id;

    if (prev && prev !== id) {
      const s = idePersistRef.current;
      void persistIdeToApi(prev, {
        v: IDE_PERSIST_VERSION,
        ideWorkspace: s.ideWorkspace,
        gitBranch: s.gitBranch,
        recentFiles: s.recentFiles,
      });
    }

    if (!id) return;
    const gen = ++hydrateGenRef.current;
    let cancelled = false;
    void hydrateIdeFromApi(id).then((b) => {
      if (cancelled || hydrateGenRef.current !== gen) return;
      setIdeWorkspace(b.ideWorkspace);
      setGitBranch(b.gitBranch);
      setRecentFiles(b.recentFiles);
      const buffers = b.recentFiles.filter(
        (e) =>
          e.source === 'buffer' &&
          typeof e.snapshotWorking === 'string' &&
          e.snapshotWorking.length > 0 &&
          /\.(html?|css|mjs|cjs|js|tsx?|md|json|svg)$/i.test(e.name),
      );
      for (const e of buffers.slice(0, 8)) {
        openFile({
          name: e.name,
          workspacePath: e.workspacePath || e.name,
          content: e.snapshotWorking,
          originalContent: e.snapshotOriginal ?? '',
        });
      }
      if (buffers.length) {
        setOpenTabs((prev) => (prev.includes('code') ? prev : [...prev, 'code']));
        setActiveTab('code');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeAgentConversationId, openFile]);

  useEffect(() => {
    const id = activeAgentConversationId?.trim();
    if (!id) return;
    const t = window.setTimeout(() => {
      void persistIdeToApi(id, {
        v: IDE_PERSIST_VERSION,
        ideWorkspace,
        gitBranch,
        recentFiles,
      });
    }, 650);
    return () => clearTimeout(t);
  }, [activeAgentConversationId, ideWorkspace, gitBranch, recentFiles]);
  
  const mappedRecentFiles = useMemo(() => {
    return recentFiles.map(f => ({
      name: f.name,
      path: f.workspacePath || f.githubPath || f.r2Key || f.id,
      label: f.label
    }));
  }, [recentFiles]);

  const workspaceDashboardRecentFiles = useMemo(() => {
    if (recentFiles.length > 0) return recentFiles;
    const convId = activeAgentConversationId?.trim();
    if (convId) return recentFiles;
    return readRecentFilesFromLocalStorage();
  }, [recentFiles, activeAgentConversationId, recentFilesLsTick]);

  // Tabs: Workspace matches default activeTab (welcome had no panel — stranded tab id removed from defaults).
  const [openTabs, setOpenTabs] = useState<TabId[]>(['Workspace']);
  const [activeTab, setActiveTab] = useState<TabId>('Workspace');
  const [movieModeTimeline, setMovieModeTimeline] = useState<import('./src/types/moviemode').MovieModeTimeline | null>(null);
  
  // Derived from EditorContext to minimize massive refactor breakage
  const activeFile = tabs.find(t => t.id === activeTabId) || null;
  const { updateActiveFile } = useEditor();
  const setActiveFile = useCallback((updates: Partial<ActiveFile> | ((prev: ActiveFile | null) => ActiveFile | null)) => {
    if (typeof updates === 'object' && updates !== null && 'content' in updates && 'name' in updates) {
      openFile(updates as ActiveFile);
    } else {
      updateActiveFile(updates);
    }
  }, [openFile, updateActiveFile]);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [browserUrl, setBrowserUrl] = useState<string>('https://inneranimalmedia.com');
  /** When set with a blob browser URL, Browser tab shows this label (e.g. r2://binding/key) instead of blob:. */
  const [browserAddressDisplay, setBrowserAddressDisplay] = useState<string | null>(null);
  const [browserTabTitle, setBrowserTabTitle] = useState<string | null>(null);
  const [glbViewerUrl, setGlbViewerUrl] = useState<string>(
    'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/6454d6fa-d4f1-43ec-33fd-628d0e7cdb00/public'
  );
  const [glbViewerFilename, setGlbViewerFilename] = useState('Meshy_AI_Jet.glb');

  const [cmdSearch, setCmdSearch] = useState('');
  const [cmdHubOpen, setCmdHubOpen] = useState(false);

  const handleCommandExecution = useCallback((cmdText: string) => {
    terminalRef.current?.runCommand(cmdText);
    setCmdHubOpen(false);
  }, []);

  const focusAgentChat = useCallback(() => {
    setAgentPosition((p) => (p === 'off' ? 'right' : p));
  }, []);

  const runVerificationInAgent = useCallback(
    (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) return;
      focusAgentChat();
      window.dispatchEvent(
        new CustomEvent('iam-agent-external-send', {
          detail: { message: trimmed },
        }),
      );
    },
    [focusAgentChat],
  );

  const persistActiveWorkspace = useCallback(async (id: string) => {
    setAuthWorkspaceId(id);
    try {
      const r = await fetch('/api/settings/workspaces/active', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error('sync failed');
    } catch {
      setToastMsg('Workspace saved locally — sync failed.');
    }
  }, []);

  const statusBarWorkspaceItems = useMemo(
    () =>
      workspaceRows.map((w) => ({
        id: w.id,
        label: w.name,
        slug: w.slug,
        status: w.status,
        github_repo: w.github_repo,
      })),
    [workspaceRows],
  );

  const handleStatusBarWorkspacePick = useCallback(
    (id: string) => {
      void persistActiveWorkspace(id);
      const row = workspaceRows.find((w) => w.id === id);
      if (row?.name?.trim()) setWorkspaceDisplayName(row.name.trim());
    },
    [persistActiveWorkspace, workspaceRows],
  );

  const lastPersistedTabRef = useRef<TabId | null>(null);
  useEffect(() => {
    lastPersistedTabRef.current = null;
  }, [activeAgentConversationId]);

  useEffect(() => {
    const id = activeAgentConversationId?.trim();
    if (!id) return;
    const prev = lastPersistedTabRef.current;
    lastPersistedTabRef.current = activeTab;
    if (prev === null) return;
    if (prev === activeTab) return;
    void persistIdeToApi(id, {
      v: IDE_PERSIST_VERSION,
      ideWorkspace,
      gitBranch,
      recentFiles,
    });
  }, [activeTab, activeAgentConversationId, ideWorkspace, gitBranch, recentFiles]);

  useEffect(() => {
    return () => {
      if (glbViewerUrl.startsWith('blob:')) URL.revokeObjectURL(glbViewerUrl);
    };
  }, [glbViewerUrl]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 4500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => {
    if (!topChromeMoreOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = topChromeMoreRef.current;
      if (el && !el.contains(e.target as Node)) setTopChromeMoreOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [topChromeMoreOpen]);

  const openTab = useCallback((tab: TabId) => {
    setOpenTabs((prev) => {
      if (prev.includes(tab)) return prev;
      const cap = maxTabsPolicyRef.current;
      if (prev.length >= cap) {
        setToastMsg(`Max ${cap} tabs — close one to open another.`);
        return prev;
      }
      return [...prev, tab];
    });
    setActiveTab(tab);
  }, []);

  const closeTab = (tab: TabId, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tab === 'browser') {
      setBrowserAddressDisplay(null);
      setBrowserTabTitle(null);
    }
    const next = openTabs.filter(t => t !== tab);
    setOpenTabs(next);
    if (activeTab === tab) {
      setActiveTab(next.length > 0 ? next[next.length - 1] : 'Workspace');
    }
  };

  // Dynamic Layout & Lifted State
  // Resizable panels using pointer events
  const [sidebarW, setSidebarW] = useState(260);
  const [agentW, setAgentW] = useState(360);

  const shellLayoutRef = useRef({
    sidebarW: 260,
    sidebarRailExpanded: true,
    activityOpen: false,
  });
  useEffect(() => {
    shellLayoutRef.current = {
      sidebarW,
      sidebarRailExpanded,
      activityOpen: !!activeActivity,
    };
  }, [sidebarW, sidebarRailExpanded, activeActivity]);

  const clampAgentWidthToViewport = useCallback((w: number) => {
    const vw =
      typeof window !== 'undefined' && Number.isFinite(window.innerWidth) ? window.innerWidth : 1440;
    const ctx = shellLayoutRef.current;
    const maxV = getAgentPanelViewportMaxPx({
      viewportInnerWidth: vw,
      activityRailWidth: activityRailWidthPx(ctx.sidebarRailExpanded),
      activityPanelOpen: ctx.activityOpen,
      activityPanelWidth: ctx.sidebarW,
      mainMinWidth: MAIN_MIN_W_FOR_AGENT_RESIZE,
    });
    const maxClamp = Math.min(AGENT_PANEL_MAX_W, maxV);
    const hi = Math.max(AGENT_PANEL_MIN_W, maxClamp);
    return Math.max(AGENT_PANEL_MIN_W, Math.min(hi, Math.round(w)));
  }, []);

  useEffect(() => {
    const clamp = () => setAgentW((prev) => clampAgentWidthToViewport(prev));
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [activeActivity, sidebarW, sidebarRailExpanded, agentPosition, clampAgentWidthToViewport]);

  const beginPanelResize = useCallback(
    (panel: 'sidebar' | 'agent', e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = e.currentTarget;
      const pointerId = e.pointerId;
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* already captured or unsupported */
      }
      document.body.classList.add('is-resizing');

      const startX = e.clientX;
      const startW = panel === 'sidebar' ? sidebarW : agentW;
      const agentSideAtStart = agentPosition;

      let finished = false;
      const endDrag = () => {
        if (finished) return;
        finished = true;
        document.body.classList.remove('is-resizing');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
      };

      const onMove = (pe: PointerEvent) => {
        if (pe.pointerId !== pointerId) return;
        const delta = pe.clientX - startX;
        const ctx = shellLayoutRef.current;

        if (panel === 'sidebar') {
          const next = getNextPanelWidth({
            panel: 'sidebar',
            startWidth: startW,
            deltaX: delta,
            agentPosition: 'left',
            min: 180,
            max: 480,
          });
          setSidebarW(next);
          return;
        }

        if (agentSideAtStart === 'off') return;

        const vw =
          typeof window !== 'undefined' && Number.isFinite(window.innerWidth) ? window.innerWidth : 1440;
        const maxV = getAgentPanelViewportMaxPx({
          viewportInnerWidth: vw,
          activityRailWidth: activityRailWidthPx(ctx.sidebarRailExpanded),
          activityPanelOpen: ctx.activityOpen,
          activityPanelWidth: ctx.sidebarW,
          mainMinWidth: MAIN_MIN_W_FOR_AGENT_RESIZE,
        });
        const maxClamp = Math.min(AGENT_PANEL_MAX_W, maxV);
        const hi = Math.max(AGENT_PANEL_MIN_W, maxClamp);
        const next = getNextPanelWidth({
          panel: 'agent',
          startWidth: startW,
          deltaX: delta,
          agentPosition: agentSideAtStart,
          min: AGENT_PANEL_MIN_W,
          max: hi,
        });
        setAgentW(next);
      };

      const onEnd = (pe: PointerEvent) => {
        if (pe.pointerId !== pointerId) return;
        endDrag();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    },
    [sidebarW, agentW, agentPosition],
  );

  const terminalResizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const clampTerminalH = useCallback((h: number) => {
    const min = 160;
    // Keep at least 160px for the content above the drawer.
    const max = Math.max(min, window.innerHeight - 10 /* topbar */ - 32 /* tabs */ - 84 /* status/mobile */ - 160);
    return Math.max(min, Math.min(max, Math.round(h)));
  }, []);

  const beginTerminalResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    terminalResizeRef.current = { startY: e.clientY, startH: terminalDrawerH };

    const onMove = (pe: PointerEvent) => {
      const s = terminalResizeRef.current;
      if (!s) return;
      const next = clampTerminalH(s.startH + (s.startY - pe.clientY));
      setTerminalDrawerH(next);
      // Let xterm FitAddon recompute.
      window.dispatchEvent(new Event('resize'));
    };
    const onUp = () => {
      terminalResizeRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [terminalDrawerH, clampTerminalH]);

  const chatMessages = useMemo(() => {
    return (
      messagesByTabId[activeAgentChatTabId] ?? [
        { role: 'assistant' as const, content: buildAgentSamGreeting(workspaceDisplayLine) },
      ]
    );
  }, [messagesByTabId, activeAgentChatTabId, workspaceDisplayLine]);

  const setChatMessages = useCallback(
    (updater: React.SetStateAction<{ role: 'user' | 'assistant'; content: string }[]>) => {
      setMessagesByTabId((prev) => {
        const cur =
          prev[activeAgentChatTabId] ?? [
            { role: 'assistant' as const, content: buildAgentSamGreeting(workspaceDisplayLine) },
          ];
        const next = typeof updater === 'function' ? (updater as (c: typeof cur) => typeof cur)(cur) : updater;
        return { ...prev, [activeAgentChatTabId]: next };
      });
    },
    [activeAgentChatTabId, workspaceDisplayLine],
  );

  useEffect(() => {
    setMessagesByTabId((prev) => {
      const cur = prev[activeAgentChatTabId];
      if (!cur || cur.length !== 1 || cur[0].role !== 'assistant') return prev;
      const next = buildAgentSamGreeting(workspaceDisplayLine);
      if (cur[0].content === next) return prev;
      return { ...prev, [activeAgentChatTabId]: [{ role: 'assistant', content: next }] };
    });
  }, [workspaceDisplayLine, activeAgentChatTabId]);

  useEffect(() => {
    const onConv = (e: Event) => {
      const raw = (e as CustomEvent<{ id?: string | null }>).detail?.id;

      if (raw === null || raw === undefined) {
        const tid = activeAgentChatTabIdRef.current;
        setAgentChatTabs((prev) => prev.map((t) => (t.id === tid ? { ...t, conversationId: '', title: 'New chat' } : t)));
        try {
          localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
        } catch {
          /* ignore */
        }
        setMessagesByTabId((prev) => ({
          ...prev,
          [tid]: [{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayLine) }],
        }));
        return;
      }

      const convId = typeof raw === 'string' ? raw.trim() : '';
      if (!convId) return;

      try {
        localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, convId);
      } catch {
        /* ignore */
      }

      const prevTabs = agentChatTabsRef.current;
      const act = activeAgentChatTabIdRef.current;
      const byConv = prevTabs.find((t) => t.conversationId === convId);
      let targetTabId = '';

      if (byConv) {
        targetTabId = byConv.id;
        if (byConv.id !== act) setActiveAgentChatTabId(byConv.id);
      } else {
        const activeRow = prevTabs.find((t) => t.id === act);
        if (activeRow && !activeRow.conversationId.trim()) {
          targetTabId = act;
          setAgentChatTabs((prev) =>
            prev.map((t) => (t.id === act ? { ...t, conversationId: convId, title: 'Chat' } : t)),
          );
        } else {
          const nid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tab_${Date.now()}`;
          targetTabId = nid;
          setAgentChatTabs((prev) => [...prev, { id: nid, conversationId: convId, title: 'Chat' }]);
          setActiveAgentChatTabId(nid);
        }
      }

      if (!targetTabId) return;

      void fetch(`/api/agent/sessions/${encodeURIComponent(convId)}/messages`, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: unknown) => {
          const tid = targetTabId;
          if (!Array.isArray(rows) || rows.length === 0) {
            setMessagesByTabId((prev) => ({
              ...prev,
              [tid]: [{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayLine) }],
            }));
            return;
          }
          const mapped: { role: 'user' | 'assistant'; content: string }[] = [];
          for (const row of rows) {
            if (!row || typeof row !== 'object') continue;
            const o = row as { role?: string; content?: unknown };
            const role = o.role === 'user' ? 'user' : o.role === 'assistant' ? 'assistant' : null;
            if (!role) continue;
            const rawContent = o.content;
            const content =
              typeof rawContent === 'string'
                ? rawContent
                : rawContent != null && typeof rawContent === 'object'
                  ? JSON.stringify(rawContent)
                  : '';
            mapped.push({ role, content: content.trim() ? content : '(empty)' });
          }
          if (mapped.length === 0) {
            setMessagesByTabId((prev) => ({
              ...prev,
              [tid]: [{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayLine) }],
            }));
            return;
          }
          setMessagesByTabId((prev) => ({ ...prev, [tid]: mapped }));
        })
        .catch(() => {
          setMessagesByTabId((prev) => ({
            ...prev,
            [targetTabId]: [{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayLine) }],
          }));
        });
    };
    window.addEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onConv);
    return () => window.removeEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onConv);
  }, [workspaceDisplayLine]);

  const didInitialAgentMessagesFetch = useRef(false);
  useEffect(() => {
    if (didInitialAgentMessagesFetch.current) return;
    const conv = agentChatTabs.find((t) => t.id === activeAgentChatTabId)?.conversationId?.trim();
    if (!conv) return;
    didInitialAgentMessagesFetch.current = true;
    void fetch(`/api/agent/sessions/${encodeURIComponent(conv)}/messages`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => {
        const tid = activeAgentChatTabId;
        if (!Array.isArray(rows) || rows.length === 0) return;
        const mapped: { role: 'user' | 'assistant'; content: string }[] = [];
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          const o = row as { role?: string; content?: unknown };
          const role = o.role === 'user' ? 'user' : o.role === 'assistant' ? 'assistant' : null;
          if (!role) continue;
          const rawContent = o.content;
          const content =
            typeof rawContent === 'string'
              ? rawContent
              : rawContent != null && typeof rawContent === 'object'
                ? JSON.stringify(rawContent)
                : '';
          mapped.push({ role, content: content.trim() ? content : '(empty)' });
        }
        if (mapped.length === 0) return;
        setMessagesByTabId((prev) => ({ ...prev, [tid]: mapped }));
      })
      .catch(() => {});
  }, [agentChatTabs, activeAgentChatTabId]);

  const createNewAgentChatTab = useCallback(() => {
    const cap = maxTabsPolicyRef.current;
    if (agentChatTabs.length >= cap) {
      setToastMsg(`Maximum chat tabs reached (${cap}).`);
      return;
    }
    const nid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tab_${Date.now()}`;
    setAgentChatTabs((prev) => [...prev, { id: nid, conversationId: '', title: 'New chat' }]);
    setActiveAgentChatTabId(nid);
    setMessagesByTabId((prev) => ({
      ...prev,
      [nid]: [{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayLine) }],
    }));
    try {
      localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
    } catch {
      /* ignore */
    }
  }, [agentChatTabs.length, workspaceDisplayLine]);

  const pendingNewThreadMessageRef = useRef<QuickstartThreadDetail | null>(null);

  const dispatchNewThreadMessage = useCallback((detail: QuickstartThreadDetail) => {
    const message = detail.message?.trim();
    if (!message) return;
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent(IAM_AGENT_CHAT_NEW_THREAD, {
          detail: { ...detail, message },
        }),
      );
    });
  }, []);

  const startAgentNewThreadWithMessage = useCallback(
    (detail: QuickstartThreadDetail | string) => {
      const normalized: QuickstartThreadDetail =
        typeof detail === 'string'
          ? { message: detail.trim() }
          : { ...detail, message: detail.message?.trim() ?? '' };
      if (!normalized.message) return;

      const openPanelAndSend = () => {
        createNewAgentChatTab();
        dispatchNewThreadMessage(normalized);
      };

      if (agentPosition === 'off') {
        pendingNewThreadMessageRef.current = normalized;
        setAgentPosition('right');
        return;
      }
      openPanelAndSend();
    },
    [agentPosition, createNewAgentChatTab, dispatchNewThreadMessage],
  );

  useEffect(() => {
    const pending = pendingNewThreadMessageRef.current;
    if (!pending || agentPosition === 'off') return;
    pendingNewThreadMessageRef.current = null;
    createNewAgentChatTab();
    dispatchNewThreadMessage(pending);
  }, [agentPosition, createNewAgentChatTab, dispatchNewThreadMessage]);

  const openAgentQuickstart = useCallback(() => {
    navigate(AGENT_QUICKSTART_PATH);
  }, [navigate]);

  const beginQuickstartTemplate = useCallback(
    (template: QuickstartTemplate) => {
      navigate(AGENT_HOME_PATH);
      startAgentNewThreadWithMessage({
        message: template.seedMessage,
        task_type: template.task_type,
        route_key: template.route_key,
        quickstart_batch: QUICKSTART_BATCH_LABEL,
        apply_eto_after_run: true,
        workspace_id: QUICKSTART_WORKSPACE_ID,
        modelKey: 'auto',
      });
    },
    [navigate, startAgentNewThreadWithMessage],
  );

  const selectAgentChatTab = useCallback(
    (tabId: string) => {
      setActiveAgentChatTabId(tabId);
      const conv = agentChatTabs.find((t) => t.id === tabId)?.conversationId?.trim() ?? '';
      try {
        if (conv) localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, conv);
        else localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
      } catch {
        /* ignore */
      }
    },
    [agentChatTabs],
  );

  const narrowBackToCenter = useCallback(() => {
    setActiveActivity(null);
    setAgentPosition('off');
  }, []);

  const openGitHubFromChat = useCallback((opts?: { expandRepoFullName?: string }) => {
    const fn = opts?.expandRepoFullName?.trim();
    if (fn) setGithubExpandRepo(fn);
    setActiveActivity('actions');
  }, []);

  const openDashboardFromChat = useCallback(() => {
    narrowBackToCenter();
    setActiveTab('Workspace');
    setOpenTabs((prev) => (prev.includes('Workspace') ? prev : [...prev, 'Workspace']));
  }, [narrowBackToCenter]);

  /**
   * Mobile: agent chat is `fixed inset-0` above the main workspace. Opening Monaco only
   * switched `activeTab` while the overlay stayed on top — Context / Open in Monaco looked broken.
   */
  const revealMainWorkspaceIfNarrow = useCallback(() => {
    if (isNarrowViewport) narrowBackToCenter();
  }, [isNarrowViewport, narrowBackToCenter]);

  const openInMonacoFromChat = useCallback(
    (file: Pick<ActiveFile, 'name' | 'content'> & Partial<ActiveFile>) => {
      const opened: ActiveFile = {
        name: file.name,
        content: file.content,
        originalContent: file.originalContent !== undefined ? file.originalContent : file.content ?? '',
        workspacePath: file.workspacePath || file.name,
        fileKind: file.fileKind,
        isImage: file.isImage,
        isBinary: file.isBinary,
        previewUrl: file.previewUrl,
        contentType: file.contentType,
        size: file.size,
        binaryMessage: file.binaryMessage,
        localObjectUrl: file.localObjectUrl,
        githubPath: file.githubPath,
        githubSha: file.githubSha,
        r2Key: file.r2Key,
        r2Bucket: file.r2Bucket,
      };
      setActiveFile(opened);
      setRecentFiles((prev) => mergeRecentFromActiveFile(prev, opened));
      revealMainWorkspaceIfNarrow();
      setOpenTabs((prev) => (prev.includes('code') ? prev : [...prev, 'code']));
      setActiveTab('code');
      if (isNarrowViewport) {
        setToastMsg('Opened in code editor. Tap Chat (bottom) to return to Agent Sam.');
      }
    },
    [revealMainWorkspaceIfNarrow, isNarrowViewport, mergeRecentFromActiveFile],
  );

  const focusCodeEditorFromChat = useCallback(() => {
    revealMainWorkspaceIfNarrow();
    openTab('code');
    if (isNarrowViewport) {
      setToastMsg('Code editor opened. Tap Chat to return to Agent Sam.');
    }
  }, [revealMainWorkspaceIfNarrow, isNarrowViewport, openTab]);

  const openInEditorFromExplorer = useCallback(
    (file: ActiveFile) => {
      const originalContent =
        file.fileKind && file.fileKind !== 'text'
          ? file.originalContent ?? ''
          : file.originalContent ?? file.content;
      openFile({ ...file, originalContent });
      openTab('code');
      revealMainWorkspaceIfNarrow();
    },
    [openFile, openTab, revealMainWorkspaceIfNarrow],
  );

  const openMovieModeFromExplorer = useCallback(
    async (item: import('./features/moviemode/types').MediaLibraryItem) => {
      const { createTimelineWithClip } = await import('./features/moviemode/createEmptyTimeline');
      setMovieModeTimeline(createTimelineWithClip(item));
      openTab('moviemode');
      revealMainWorkspaceIfNarrow();
    },
    [openTab, revealMainWorkspaceIfNarrow],
  );

  const onExplorerWorkspaceRootChange = useCallback(({ folderName }: { folderName: string }) => {
    setIdeWorkspace({ source: 'local', folderName });
  }, []);

  /** Agent Sam SSE `surface_open` / orchestration — open the right workspace tab without new buttons. */
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ surface?: string; url?: string; load_url?: string; artifact_id?: string }>).detail;
      const s = String(d?.surface || '').toLowerCase();
      if (!s) return;
      revealMainWorkspaceIfNarrow();
      if (s === 'browser') {
        if (d?.url?.trim()) {
          setBrowserAddressDisplay(null);
          setBrowserTabTitle(null);
          setBrowserUrl(d.url.trim());
        }
        openTab('browser');
        if (isNarrowViewport) setToastMsg('Browser tab opened. Tap Chat to return to Agent Sam.');
      } else if (s === 'excalidraw' || s === 'draw') {
        openTab('excalidraw');
        const load = typeof d?.load_url === 'string' ? d.load_url.trim() : '';
        const aid = typeof d?.artifact_id === 'string' ? d.artifact_id.trim() : '';
        if (load || aid) {
          window.dispatchEvent(
            new CustomEvent('iam:excalidraw_load_document', {
              detail: {
                load_url: load || null,
                artifact_id: aid || null,
                replace_workspace: true,
              },
            }),
          );
        }
        if (isNarrowViewport) setToastMsg('Canvas opened. Tap Chat to return to Agent Sam.');
      } else if (s === 'monaco' || s === 'code') {
        openTab('code');
        if (isNarrowViewport) setToastMsg('Code editor opened. Tap Chat to return to Agent Sam.');
      } else if (s === 'r2') {
        window.dispatchEvent(new CustomEvent('iam:palette-open-r2'));
      }
    };
    window.addEventListener('iam:agent-open-surface', h as EventListener);
    return () => window.removeEventListener('iam:agent-open-surface', h as EventListener);
  }, [openTab, revealMainWorkspaceIfNarrow, isNarrowViewport]);

  /** Browser / cdt_* tool activity from Agent SSE — surface the Browser tab so the workbench matches agent actions. */
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ tool_name?: string; phase?: string }>).detail;
      const tn = String(d?.tool_name || '');
      if (!tn) return;
      revealMainWorkspaceIfNarrow();
      openTab('browser');
      setToastMsg(`Agent Sam · browser tool: ${tn}`);
    };
    window.addEventListener('iam:agent-browser-tool-active', h as EventListener);
    return () => window.removeEventListener('iam:agent-browser-tool-active', h as EventListener);
  }, [openTab, revealMainWorkspaceIfNarrow]);

  const consumeGithubExpandRepo = useCallback(() => setGithubExpandRepo(null), []);

  useEffect(() => {
    const handleOpenR2Palette = (e: Event) => {
      const r2BucketName = (e as CustomEvent<{ bucket?: string }>).detail?.bucket?.trim();
      revealMainWorkspaceIfNarrow();
      if (!isAgentShellPath(location.pathname) && location.pathname !== '/dashboard/meet') {
        navigate(AGENT_HOME_PATH);
      }
      setActiveActivity('files');
      if (r2BucketName) {
        window.dispatchEvent(new CustomEvent('iam-palette-open-r2', { detail: { bucket: r2BucketName } }));
      }
    };
    window.addEventListener('iam:palette-open-r2', handleOpenR2Palette as EventListener);
    return () => window.removeEventListener('iam:palette-open-r2', handleOpenR2Palette as EventListener);
  }, [revealMainWorkspaceIfNarrow, location.pathname, navigate]);

  useEffect(() => {
    if (!activeFile) return;
    const t = window.setTimeout(() => {
      setRecentFiles((prev) => mergeRecentFromActiveFile(prev, activeFile));
    }, 450);
    return () => window.clearTimeout(t);
  }, [activeFile]);

  const openRecentEntry = useCallback(
    async (entry: RecentFileEntry) => {
      persistRecentFileToLocalStorage({ ...entry, openedAt: Date.now() });
      setRecentFilesLsTick((t) => t + 1);

      const applySnapshots = (msg?: string) => {
        const work = entry.snapshotWorking || '';
        const orig = entry.snapshotOriginal !== null ? entry.snapshotOriginal : work;
        setActiveFile({
          name: entry.name,
          content: work,
          originalContent: orig,
          workspacePath: entry.workspacePath,
          githubRepo: entry.githubRepo,
          githubPath: entry.githubPath,
          githubBranch: entry.githubBranch,
          r2Key: entry.r2Key,
          r2Bucket: entry.r2Bucket,
          driveFileId: entry.driveFileId,
        });
        if (msg) setToastMsg(msg);
        revealMainWorkspaceIfNarrow();
        setOpenTabs((p) => (p.includes('code') ? p : [...p, 'code']));
        setActiveTab('code');
      };

      try {
        if (entry.githubRepo && entry.githubPath && entry.githubBranch) {
          const [owner, repo] = entry.githubRepo.split('/');
          if (!owner || !repo) throw new Error('bad repo');
          const qs = new URLSearchParams({ path: entry.githubPath, ref: entry.githubBranch });
          const res = await fetch(
            `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents?${qs}`,
            { credentials: 'same-origin' },
          );
          const data = await res.json();
          if (!res.ok || data.type !== 'file' || typeof data.content !== 'string') throw new Error('github');
          const raw = String(data.content).replace(/\n/g, '');
          const binary = atob(raw);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const text = new TextDecoder().decode(bytes);
          setActiveFile({
            name: data.name || entry.name,
            content: text,
            originalContent: text,
            githubPath: entry.githubPath,
            githubRepo: entry.githubRepo,
            githubSha: typeof data.sha === 'string' ? data.sha : undefined,
            githubBranch: entry.githubBranch,
          });
        } else if (entry.r2Bucket && entry.r2Key) {
          const { openR2KeyInEditor } = await import('./src/lib/mediaPreview');
          const opened = await openR2KeyInEditor(entry.r2Bucket, entry.r2Key, (f) => {
            setActiveFile(f);
          });
          if (!opened) throw new Error('r2');
        } else if (entry.driveFileId) {
          const res = await fetch(
            `/api/integrations/gdrive/file?fileId=${encodeURIComponent(entry.driveFileId)}`,
            { credentials: 'same-origin' },
          );
          if (!res.ok) throw new Error('drive');
          const data = await res.json();
          const content = typeof data.content === 'string' ? data.content : '';
          setActiveFile({
            name: entry.name,
            content,
            originalContent: content,
            driveFileId: entry.driveFileId,
          });
        } else {
          applySnapshots();
          return;
        }
        revealMainWorkspaceIfNarrow();
        setOpenTabs((p) => (p.includes('code') ? p : [...p, 'code']));
        setActiveTab('code');
      } catch {
        applySnapshots('Opened from cached snapshot. Use Repos or Files to refresh from remote if needed.');
      }
    },
    [revealMainWorkspaceIfNarrow],
  );

  useEffect(() => {
    const onRun = (e: Event) => {
      const d = (e as CustomEvent<{ cmd: string }>).detail;
      if (!d?.cmd) return;
      
      setIsTerminalOpen(true);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      // Give terminal a frame to mount if it's currently closed
      requestAnimationFrame(() => {
        if (terminalRef.current) {
          terminalRef.current.runCommand(d.cmd);
        }
      });
    };
    
    const onToggle = (e: Event) => {
      const d = (e as CustomEvent<{ open?: boolean }>).detail;
      if (d && typeof d.open === 'boolean') {
        setIsTerminalOpen(d.open);
        if (d.open) setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      } else {
        setIsTerminalOpen((p) => {
          const next = !p;
          if (next) setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
          return next;
        });
      }
    };

    window.addEventListener('iam-run-command', onRun as EventListener);
    window.addEventListener('iam-terminal-toggle', onToggle as EventListener);
    
    return () => {
      window.removeEventListener('iam-run-command', onRun as EventListener);
      window.removeEventListener('iam-terminal-toggle', onToggle as EventListener);
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      setIsTerminalOpen(true);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    };
    window.addEventListener('iam:open-terminal', handler);
    return () => window.removeEventListener('iam:open-terminal', handler);
  }, []);

  const toggleActivity = (
    activity: 'files' | 'search' | 'mcps' | 'git' | 'debug' | 'actions' | 'drive' | 'database',
  ) => {
    if (activity === 'files' && typeof window !== 'undefined') {
      const p = window.location.pathname;
      if (!isAgentShellPath(p) && p !== '/dashboard/meet') {
        navigate(AGENT_HOME_PATH);
      }
    }
    setActiveActivity((prev) => {
      if (prev === activity) return null;
      if (activity === 'debug') {
        setIsTerminalOpen(true);
        setTimeout(() => terminalRef.current?.setActiveTab('problems'), 50);
        return null; // Don't open a sidebar for debug anymore
      }
      return activity;
    });
  };

  const openAgentThreadFromProblems = useCallback((sessionId: string) => {
    const id = sessionId.trim();
    if (!id) return;
    try {
      localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, id);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id } }));
    setAgentPosition((p) => (p === 'off' ? 'right' : p));
    setActiveActivity(null);
  }, []);

  const handleUnifiedNavigate = useCallback(
    (nav: UnifiedSearchNavigate) => {
      if (nav.kind === 'table') {
        setDbExplorerJump({ token: Date.now(), table: nav.name, dbTarget: 'd1' });
        setActiveActivity('database');
        return;
      }
      if (nav.kind === 'conversation') {
        try {
          localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, nav.id);
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id: nav.id } }));
        setAgentPosition((p) => (p === 'off' ? 'right' : p));
        return;
      }
      if (nav.kind === 'knowledge') {
        if (nav.url && /^https?:\/\//i.test(nav.url)) {
          window.open(nav.url, '_blank', 'noopener,noreferrer');
          return;
        }
        setActiveActivity('search');
        return;
      }
      if (nav.kind === 'sql' || nav.kind === 'column') {
        const sql = nav.sql?.trim();
        if (!sql) return;
        setDbExplorerJump({ token: Date.now(), querySql: sql, dbTarget: 'd1' });
        setActiveActivity('database');
        return;
      }
      if (nav.kind === 'deployment') {
        const t = nav.summary?.trim();
        if (t) {
          void navigator.clipboard?.writeText(t).catch(() => {});
        }
      }
    },
    [],
  );

  const fetchHealth = useCallback(async () => {
    try {
      const hr = await fetch('/api/health');
      const hj = await hr.json().catch(() => ({}));
      if (hr.ok) setHealthOk(!!hj.ok);
      else setHealthOk(false);
    } catch {
      setHealthOk(false);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    const cred = { credentials: 'same-origin' as const };
    try {
      const nr = await fetch('/api/agent/notifications', cred);
      const nj = await nr.json().catch(() => ({}));
      if (nr.ok && Array.isArray(nj.notifications)) {
        setAgentNotifications(nj.notifications as AgentNotificationRow[]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchGitAndProblems = useCallback(async () => {
    const cred = { credentials: 'same-origin' as const };
    try {
      const gitRes = await fetch('/api/agent/git/status', cred);
      const gitData = await gitRes.json().catch(() => ({}));
      if (gitRes.ok && gitData.branch) setGitBranch(String(gitData.branch));
    } catch {
      /* ignore */
    }

    try {
      const probRes = await fetch('/api/agent/problems', cred);
      const probData = await probRes.json().catch(() => ({}));
      if (probRes.ok && probData && typeof probData === 'object') {
        setSystemProblems([]);
        const mcp = Array.isArray(probData.mcp_tool_errors) ? probData.mcp_tool_errors.length : 0;
        const audits = Array.isArray(probData.audit_failures) ? probData.audit_failures : [];
        const wx = Array.isArray(probData.worker_errors) ? probData.worker_errors.length : 0;
        const warnAudits = audits.filter((a: { event_type?: string }) =>
          String(a?.event_type || '').toLowerCase().includes('warn'),
        );
        const errAudits = audits.length - warnAudits.length;
        setErrorCount(mcp + wx + errAudits);
        setWarningCount(warnAudits.length);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchTunnelStatusOnly = useCallback(async () => {
    const cred = { credentials: 'same-origin' as const };
    try {
      const tr = await fetch('/api/tunnel/status', cred);
      const tj = await tr.json().catch(() => ({}));
      if (tr.ok && typeof tj.healthy === 'boolean') {
        setTunnelHealthy(tj.healthy);
        const st = tj.status != null ? String(tj.status) : '';
        const n = typeof tj.connections === 'number' ? tj.connections : 0;
        setTunnelLabel(st ? `${st} · ${n} conn` : `${n} conn`);
      } else if (tr.status === 401) {
        setTunnelHealthy(null);
        setTunnelLabel(null);
      } else {
        setTunnelHealthy(false);
        const err = tj && typeof tj === 'object' && 'error' in tj ? String((tj as { error?: string }).error || '') : '';
        setTunnelLabel(err ? err.slice(0, 72) : `tunnel ${tr.status}`);
      }
    } catch {
      setTunnelHealthy(null);
      setTunnelLabel(null);
    }
  }, []);

  const fetchTerminalConfigOnly = useCallback(async () => {
    const cred = { credentials: 'same-origin' as const };
    try {
      const ter = await fetch('/api/agent/terminal/config-status', cred);
      const tej = await ter.json().catch(() => ({}));
      if (ter.ok) setTerminalOk(!!tej.terminal_configured);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchDeploymentsPoll = useCallback(async () => {
    const cred = { credentials: 'same-origin' as const };
    try {
      const dr = await fetch('/api/overview/deployments', cred);
      const dj = await dr.json().catch(() => ({}));
      if (dr.ok && Array.isArray(dj.deployments) && dj.deployments[0]) {
        const d = dj.deployments[0] as {
          worker_name?: string;
          environment?: string;
          status?: string;
        };
        const bits = [d.worker_name, d.environment, d.status].filter(Boolean).map(String);
        setLastDeployLine(bits.join(' · ') || null);
      } else {
        setLastDeployLine(null);
      }
    } catch {
      setLastDeployLine(null);
    }
  }, []);

  const fetchTelemetryPoll = useCallback(async () => {
    fetch('/api/agent/telemetry', { method: 'GET', credentials: 'same-origin' }).catch(() => {});
  }, []);

  const fetchLiveStatus = useCallback(async () => {
    const cred = { credentials: 'same-origin' as const };

    void fetchHealth();

    try {
      const gitRes = await fetch('/api/agent/git/status', cred);
      const gitData = await gitRes.json().catch(() => ({}));
      if (gitRes.ok && gitData.branch) setGitBranch(String(gitData.branch));
    } catch {
      /* ignore */
    }

    try {
      const probRes = await fetch('/api/agent/problems', cred);
      const probData = await probRes.json().catch(() => ({}));
      if (probRes.ok && probData && typeof probData === 'object') {
        setSystemProblems([]);
        const mcp = Array.isArray(probData.mcp_tool_errors) ? probData.mcp_tool_errors.length : 0;
        const audits = Array.isArray(probData.audit_failures) ? probData.audit_failures : [];
        const wx = Array.isArray(probData.worker_errors) ? probData.worker_errors.length : 0;
        const warnAudits = audits.filter((a: { event_type?: string }) =>
          String(a?.event_type || '').toLowerCase().includes('warn'),
        );
        const errAudits = audits.length - warnAudits.length;
        setErrorCount(mcp + wx + errAudits);
        setWarningCount(warnAudits.length);
      }
    } catch {
      /* ignore */
    }

    void fetchTunnelStatusOnly();
    void fetchTerminalConfigOnly();
    void fetchDeploymentsPoll();

    try {
      const nr = await fetch('/api/agent/notifications', cred);
      const nj = await nr.json().catch(() => ({}));
      if (nr.ok && Array.isArray(nj.notifications)) {
        setAgentNotifications(nj.notifications as AgentNotificationRow[]);
      }
    } catch {
      /* ignore */
    }

    void fetchTelemetryPoll();
  }, [fetchHealth, fetchTunnelStatusOnly, fetchTerminalConfigOnly, fetchDeploymentsPoll, fetchTelemetryPoll]);

  useEffect(() => {
    // Polling (ms): health 5m, notifications 2m, git+problems 3m, tunnel 5m, terminal config 10m,
    // deployments 2m, telemetry 5m. Paused while tab hidden (visibilitychange).
    const ids: number[] = [];
    const clearAll = () => {
      ids.forEach((id) => clearInterval(id));
      ids.length = 0;
    };

    const startAll = () => {
      clearAll();
      if (typeof document !== 'undefined' && document.hidden) return;

      void fetchHealth();
      void fetchNotifications();
      void fetchGitAndProblems();
      void fetchTunnelStatusOnly();
      void fetchTerminalConfigOnly();
      void fetchDeploymentsPoll();
      void fetchTelemetryPoll();

      ids.push(window.setInterval(() => void fetchHealth(), 300_000));
      ids.push(window.setInterval(() => void fetchNotifications(), 120_000));
      ids.push(window.setInterval(() => void fetchGitAndProblems(), 180_000));
      ids.push(window.setInterval(() => void fetchTunnelStatusOnly(), 300_000));
      ids.push(window.setInterval(() => void fetchTerminalConfigOnly(), 600_000));
      ids.push(window.setInterval(() => void fetchDeploymentsPoll(), 120_000));
      ids.push(window.setInterval(() => void fetchTelemetryPoll(), 300_000));
    };

    startAll();

    const onVis = () => {
      if (document.hidden) clearAll();
      else startAll();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearAll();
    };
  }, [
    fetchHealth,
    fetchNotifications,
    fetchGitAndProblems,
    fetchTunnelStatusOnly,
    fetchTerminalConfigOnly,
    fetchDeploymentsPoll,
    fetchTelemetryPoll,
  ]);

  const markNotificationRead = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/agent/notifications/${encodeURIComponent(id)}/read`, {
        method: 'PATCH',
        credentials: 'same-origin',
      });
      if (r.ok) setAgentNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isNarrowViewport || activeActivity == null) return;
    setAgentPosition('off');
  }, [activeActivity, isNarrowViewport]);

  useEffect(() => {
    if (activeActivity === 'files' && !isAgentShellPath(location.pathname)) {
      setActiveActivity(null);
    }
  }, [location.pathname, activeActivity]);

  useEffect(() => {
    const onSidebarToggle = (e: Event) => {
      const detail = (e as CustomEvent<{ activity?: string; r2Bucket?: string }>).detail;
      const act = detail?.activity;
      if (!act) return;
      if (act === 'files' && !isAgentShellPath(location.pathname) && location.pathname !== '/dashboard/meet') {
        navigate(AGENT_HOME_PATH);
      }
      if (act === 'remote') {
        if (!isAgentShellPath(location.pathname) && location.pathname !== '/dashboard/meet') {
          navigate(AGENT_HOME_PATH);
        }
        setActiveActivity('files');
        const paletteBucket = detail?.r2Bucket?.trim();
        if (paletteBucket) {
          window.dispatchEvent(new CustomEvent('iam-palette-open-r2', { detail: { bucket: paletteBucket } }));
        }
        return;
      }
      setActiveActivity(act as typeof activeActivity);
    };
    window.addEventListener('iam-sidebar-toggle', onSidebarToggle as EventListener);
    return () => window.removeEventListener('iam-sidebar-toggle', onSidebarToggle as EventListener);
  }, [location.pathname, navigate]);

  const cycleAgentPosition = useCallback(() => {
    setAgentPosition((p) => (p === 'right' ? 'left' : p === 'left' ? 'off' : 'right'));
  }, []);

  const onChatLayoutToggle = useCallback(() => {
    if (!isNarrowViewport) {
      cycleAgentPosition();
      return;
    }
    if (activeActivity) {
      setActiveActivity(null);
      return;
    }
    cycleAgentPosition();
  }, [isNarrowViewport, activeActivity, cycleAgentPosition]);

  const mobileEdgeSwipeHandlers = useMemo(
    () => ({
      onTouchStart: (e: React.TouchEvent) => {
        if (!isNarrowViewport) return;
        const t = e.touches[0];
        mobileSwipeStartRef.current = t.clientX <= 28 ? { x: t.clientX, y: t.clientY } : null;
      },
      onTouchEnd: (e: React.TouchEvent) => {
        if (!isNarrowViewport || !mobileSwipeStartRef.current) return;
        const t = e.changedTouches[0];
        const s = mobileSwipeStartRef.current;
        if (t.clientX - s.x > 56 && Math.abs(t.clientY - s.y) < 80) narrowBackToCenter();
        mobileSwipeStartRef.current = null;
      },
    }),
    [isNarrowViewport, narrowBackToCenter],
  );

  // ── File save (File System Access API write-back) ────────────────────────
  const isDirty = !!activeFile && activeFile.originalContent !== undefined && activeFile.content !== activeFile.originalContent;

  const handleR2FileUpdatedFromAgent = useCallback(
    async (event: { type: 'r2_file_updated'; bucket: string; key: string }) => {
      if (event.type !== 'r2_file_updated' || !event.bucket || !event.key) return;
      try {
        const res = await fetch(
          `/api/r2/file?bucket=${encodeURIComponent(event.bucket)}&key=${encodeURIComponent(event.key)}`,
          { credentials: 'same-origin' },
        );
        if (!res.ok) return;
        const data = await res.json();
        const content = typeof data.content === 'string' ? data.content : '';
        const baseName = event.key.split('/').pop() || event.key;
        setActiveFile({
          name: baseName,
          content,
          originalContent: content,
          r2Key: event.key,
          r2Bucket: event.bucket,
        });
        revealMainWorkspaceIfNarrow();
        setOpenTabs((prev) => (prev.includes('code') ? prev : [...prev, 'code']));
        setActiveTab('code');
        if (isNarrowViewport) {
          setToastMsg('Opened R2 file in editor. Tap Chat to return.');
        }
      } catch (e) {
        console.error(e);
      }
    },
    [isNarrowViewport, revealMainWorkspaceIfNarrow],
  );

  const handleBrowserNavigateFromAgent = useCallback(
    (event: { type: 'browser_navigate'; url: string }) => {
      if (event.type !== 'browser_navigate' || !event.url?.trim()) return;
      const url = event.url.trim();
      if (/\/api\/r2\/file\b/i.test(url)) {
        return;
      }
      window.dispatchEvent(
        new CustomEvent('iam:agent-open-surface', {
          detail: { surface: 'browser', url },
        }),
      );
      window.dispatchEvent(
        new CustomEvent('iam-browser-navigate', {
          detail: { url },
        }),
      );
      revealMainWorkspaceIfNarrow();
      setBrowserAddressDisplay(null);
      setBrowserTabTitle(null);
      setBrowserUrl(url);
      setOpenTabs((prev) => (prev.includes('browser') ? prev : [...prev, 'browser']));
      setActiveTab('browser');
      if (isNarrowViewport) {
        setToastMsg('Browser tab opened. Tap Chat to return to Agent Sam.');
      }
    },
    [revealMainWorkspaceIfNarrow, isNarrowViewport],
  );

  const htmlPreviewBlobRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (htmlPreviewBlobRef.current) {
        URL.revokeObjectURL(htmlPreviewBlobRef.current);
        htmlPreviewBlobRef.current = null;
      }
    };
  }, []);

  const guessMimeForDrive = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      html: 'text/html; charset=utf-8',
      htm: 'text/html; charset=utf-8',
      css: 'text/css; charset=utf-8',
      js: 'application/javascript; charset=utf-8',
      mjs: 'application/javascript; charset=utf-8',
      json: 'application/json; charset=utf-8',
      md: 'text/markdown; charset=utf-8',
      txt: 'text/plain; charset=utf-8',
      ts: 'text/typescript; charset=utf-8',
      tsx: 'text/typescript; charset=utf-8',
      jsx: 'text/javascript; charset=utf-8',
      xml: 'application/xml; charset=utf-8',
      svg: 'image/svg+xml',
      csv: 'text/csv; charset=utf-8',
    };
    return map[ext] || 'text/plain; charset=utf-8';
  };

  const handleSaveFile = useCallback(async (content: string) => {
    if (!activeFile) return;
    if (typeof activeFile.workspacePath === 'string' && activeFile.workspacePath.startsWith('mcp_tool:')) {
      const toolId = activeFile.workspacePath.slice('mcp_tool:'.length).trim();
      if (!toolId) return;
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        setToastMsg('Invalid JSON');
        return;
      }
      try {
        const res = await fetch(`/api/settings/mcp/tools/${encodeURIComponent(toolId)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setToastMsg(typeof data.error === 'string' ? data.error : `Tool config save failed (${res.status})`);
          return;
        }
        setActiveFile((prev) => (prev ? { ...prev, content, originalContent: content } : null));
        setToastMsg('Tool config saved');
      } catch (e) {
        setToastMsg(e instanceof Error ? e.message : 'Tool config save failed');
      }
      return;
    }
    if (activeFile.driveFileId) {
      try {
        const res = await fetch('/api/drive/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            fileId: activeFile.driveFileId,
            content,
            mimeType: guessMimeForDrive(activeFile.name || 'file.txt'),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setToastMsg(typeof data.error === 'string' ? data.error : 'Drive save failed');
          return;
        }
        setActiveFile((prev) => (prev ? { ...prev, content, originalContent: content } : null));
        setToastMsg('Saved to Google Drive');
      } catch (e) {
        console.error(e);
        setToastMsg('Drive save failed');
      }
      return;
    }
    if (activeFile.handle) {
      try {
        const writable = await activeFile.handle.createWritable();
        await writable.write(content);
        await writable.close();
        setActiveFile((prev) => (prev ? { ...prev, content, originalContent: content } : null));
      } catch (err) {
        console.error('Save failed:', err);
      }
      return;
    }
    if (activeFile.r2Key) {
      try {
        const res = await fetch('/api/r2/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            bucket: activeFile.r2Bucket ?? 'DASHBOARD',
            key: activeFile.r2Key,
            content,
          }),
        });
        if (!res.ok) {
          console.error('R2 save failed', await res.text());
          return;
        }
        setActiveFile((prev) => (prev ? { ...prev, content, originalContent: content } : null));
      } catch (e) {
        console.error(e);
      }
      return;
    }
    if (activeFile.githubPath && activeFile.githubRepo) {
      const parts = activeFile.githubRepo.split('/');
      const owner = parts[0];
      const repo = parts[1];
      if (!owner || !repo) return;
      const base64 = btoa(unescape(encodeURIComponent(content)));
      try {
        const res = await fetch(
          `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              path: activeFile.githubPath,
              message: 'Update via Agent Sam',
              content: base64,
              sha: activeFile.githubSha,
              ...(activeFile.githubBranch ? { branch: activeFile.githubBranch } : {}),
            }),
          },
        );
        const data = await res.json().catch(() => ({}));
        const newSha = data.content?.sha || data.sha;
        setActiveFile((prev) =>
          prev
            ? { ...prev, content, originalContent: content, githubSha: newSha || prev.githubSha }
            : null,
        );
        setToastMsg('Saved to GitHub');
      } catch (e) {
        console.error(e);
        setToastMsg('GitHub save failed');
      }
      return;
    }
    setActiveFile((prev) => (prev ? { ...prev, content, originalContent: content } : null));
  }, [activeFile]);

  // ── Terminal bridge ──────────────────────────────────────────────────────
  const runInTerminal = useCallback((cmd: string) => {
    if (!isTerminalOpen) setIsTerminalOpen(true);
    // Small delay to let terminal mount before writing
    setTimeout(() => terminalRef.current?.runCommand(cmd), 100);
  }, [isTerminalOpen]);

  const writeToTerminal = useCallback((text: string) => {
    if (!isTerminalOpen) setIsTerminalOpen(true);
    setTimeout(() => terminalRef.current?.writeToTerminal(text), 100);
  }, [isTerminalOpen]);

  const openBrowserTab = useCallback(
    (url: string, opts?: { addressDisplay?: string | null; tabTitle?: string | null }) => {
      if (htmlPreviewBlobRef.current && !url.startsWith('blob:')) {
        URL.revokeObjectURL(htmlPreviewBlobRef.current);
        htmlPreviewBlobRef.current = null;
      }
      setBrowserAddressDisplay(opts?.addressDisplay ?? null);
      setBrowserTabTitle(opts?.tabTitle ?? null);
      setBrowserUrl(url);
      setOpenTabs((prev) => (prev.includes('browser') ? prev : [...prev, 'browser']));
      setActiveTab('browser');
    },
    [],
  );

  const openPreviewBlob = useCallback(
    (blob: Blob, file: ActiveFile) => {
      if (htmlPreviewBlobRef.current) {
        URL.revokeObjectURL(htmlPreviewBlobRef.current);
        htmlPreviewBlobRef.current = null;
      }
      const u = URL.createObjectURL(blob);
      htmlPreviewBlobRef.current = u;
      openBrowserTab(u, {
        addressDisplay: previewAddressBarLabel(file),
        tabTitle: file.name?.trim() ? `Preview · ${file.name.trim()}` : 'Preview',
      });
    },
    [openBrowserTab],
  );

  /** Open current buffer in Browser tab; large files redirect to PTY serve / Vite (no silent blank blob). */
  const openEditorPreview = useCallback(() => {
    if (!activeFile?.content) return;
    const name = activeFile.name || '';
    if (!isRenderablePreviewFilename(name)) return;

    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const bytes = new TextEncoder().encode(activeFile.content).length;
    const isJsx = ext === 'jsx' || ext === 'tsx';
    const isHtml = ext === 'html' || ext === 'htm';
    const isSvg = ext === 'svg';
    const isMd = ext === 'md';

    const redirectToLocalServer = (reason: string) => {
      const cmd = isJsx ? 'npm run dev' : 'npx --yes serve . -l 3000';
      const port = isJsx ? 5173 : 3000;
      runInTerminal(cmd);
      window.setTimeout(() => {
        openBrowserTab(`http://localhost:${port}`, {
          addressDisplay: `localhost:${port}`,
          tabTitle: isJsx ? 'Vite dev server' : 'Static serve',
        });
      }, 2500);
      setToastMsg(reason);
      console.info(`[Preview] ${reason}`);
    };

    if (bytes >= PREVIEW_SERVE_BYTES || (isJsx && bytes > 12_000)) {
      redirectToLocalServer(
        `File is ${(bytes / 1e6).toFixed(1)} MB — opening in local server instead of blob preview.`,
      );
      return;
    }

    if (bytes >= PREVIEW_WARN_BYTES && (isHtml || isMd)) {
      setToastMsg(`Large file (${(bytes / 1e6).toFixed(1)} MB) — preview may be slow.`);
    }

    if (isSvg) {
      if (!activeFile.content.trim()) {
        setToastMsg('SVG is empty — nothing to preview.');
        console.warn('[Preview] SVG has no content');
        return;
      }
      openPreviewBlob(
        new Blob([activeFile.content], { type: 'image/svg+xml;charset=utf-8' }),
        activeFile,
      );
      return;
    }

    if (isMd) {
      const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtmlForPreview(
        name,
      )}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:52rem;margin:1rem auto;padding:0 1rem;line-height:1.5}</style></head><body><pre style="white-space:pre-wrap;font-family:Menlo,Monaco,monospace;font-size:13px">${escapeHtmlForPreview(
        activeFile.content,
      )}</pre></body></html>`;
      openPreviewBlob(new Blob([doc], { type: 'text/html; charset=utf-8' }), activeFile);
      return;
    }

    if (isHtml) {
      const hasRelativeAssets =
        /<script[^>]+src=["'](?!https?:\/\/|\/\/|data:|blob:)[^"']+["']/i.test(activeFile.content) ||
        /<link[^>]+href=["'](?!https?:\/\/|\/\/|data:|blob:)[^"']*\.(?:css|js)["']/i.test(activeFile.content);

      if (hasRelativeAssets) {
        setToastMsg(
          'Relative assets detected — blob preview may be incomplete. Use terminal serve for full fidelity.',
        );
      }

      openPreviewBlob(
        new Blob([activeFile.content], { type: 'text/html; charset=utf-8' }),
        activeFile,
      );
      return;
    }

    if (isJsx) {
      const isTsx = ext === 'tsx';
      const srcEsc = escapeHtmlForPreview(activeFile.content.slice(0, 12_000));
      const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtmlForPreview(
        name,
      )}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:52rem;margin:2rem auto;padding:1rem;line-height:1.5}.note{margin-bottom:1rem;padding:0.75rem;border:1px solid #ccc;border-radius:6px;background:#f5f5f5}</style></head><body><p class="note"><strong>React preview requires a build step.</strong> ${isTsx ? 'TSX' : 'JSX'} — run <code>npm run dev</code> in the terminal for a live preview.</p><p style="font-size:12px;color:#555">Source (first 12 KB)</p><pre style="white-space:pre-wrap;font-family:Menlo,Monaco,monospace;font-size:12px">${srcEsc}</pre></body></html>`;
      openPreviewBlob(new Blob([doc], { type: 'text/html; charset=utf-8' }), activeFile);
    }
  }, [activeFile, runInTerminal, openBrowserTab, openPreviewBlob]);

  useEffect(() => {
    const onInvalidateActiveThemeFetch = () => {
      try {
        activeThemeBootstrapAbortRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('iam:invalidate-active-theme-fetch', onInvalidateActiveThemeFetch);
    return () => window.removeEventListener('iam:invalidate-active-theme-fetch', onInvalidateActiveThemeFetch);
  }, []);

  // Themes: D1 cms_theme_preferences + fallbacks via GET /api/themes/active (?workspace_id)
  useEffect(() => {
    migrateLegacyThemeLocalStorage();
    if (authWorkspaceId?.trim()) {
      applyCachedCmsThemeFallbackForWorkspace(authWorkspaceId);
    } else {
      applyCachedCmsThemeFallback();
    }
    activeThemeBootstrapAbortRef.current?.abort();
    const ac = new AbortController();
    activeThemeBootstrapAbortRef.current = ac;
    const { signal } = ac;
    void fetchAndApplyActiveCmsTheme(authWorkspaceId, { signal })
      .then((payload) => {
        if (signal.aborted) return;
        const hasVars =
          payload?.data &&
          typeof payload.data === 'object' &&
          !Array.isArray(payload.data) &&
          Object.keys(payload.data).length > 0;
        if (!hasVars) {
          if (authWorkspaceId?.trim()) applyCachedCmsThemeFallbackForWorkspace(authWorkspaceId);
          else applyCachedCmsThemeFallback();
        }
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        const name =
          err && typeof err === 'object' && 'name' in err ? String((err as { name?: string }).name) : '';
        if (name === 'AbortError') return;
        if (authWorkspaceId?.trim()) applyCachedCmsThemeFallbackForWorkspace(authWorkspaceId);
        else applyCachedCmsThemeFallback();
      });
    return () => {
      ac.abort();
    };
  }, [authWorkspaceId]);

  // Cmd+J Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
            setIsTerminalOpen((p) => {
              const next = !p;
              if (next) setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
              return next;
            });
            e.preventDefault();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMainFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const glb = files.find((f) => f.name.toLowerCase().endsWith('.glb'));
    if (!glb) return;
    const url = URL.createObjectURL(glb);
    navigate('/dashboard/designstudio', {
      state: { pendingGlb: { url, name: glb.name.replace(/\.glb$/i, '') } },
    });
  };

  const handleMainDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const narrowBlocksCenter = isNarrowViewport && (!!activeActivity || agentPosition !== 'off');
  const narrowNeedsBack = narrowBlocksCenter;

  const statusIndentLabel = useMemo(
    () => `${editorMeta.insertSpaces ? 'Spaces' : 'Tabs'}: ${editorMeta.tabSize}`,
    [editorMeta.insertSpaces, editorMeta.tabSize],
  );

  return (
    <div className="w-full h-[100dvh] bg-[var(--dashboard-canvas)] overflow-hidden text-[var(--dashboard-text)] font-sans flex flex-col">
      {/* 1. TOP WINDOW BAR */}
      <div className="h-10 border-b border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] flex items-center justify-between px-3 shrink-0 overflow-visible relative z-[110]">
          <div className="flex items-center gap-1 opacity-80 pl-1 shrink-0 min-w-0">
              {narrowNeedsBack && (
                <button
                  type="button"
                  className="md:hidden shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors"
                  title="Back to editor"
                  aria-label="Back to editor"
                  onClick={narrowBackToCenter}
                >
                  <ChevronLeft size={18} strokeWidth={1.75} />
                </button>
              )}
              <img
                src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail"
                alt=""
                className="w-7 h-7 object-contain drop-shadow shrink-0 cursor-pointer"
                title={workspaceDisplayLine}
                onClick={() => setActiveTab('Workspace')}
              />
              <button
                type="button"
                onClick={() => {
                  setSidebarRailExpanded((prev) => {
                    const next = !prev;
                    try {
                      localStorage.setItem(LS_SIDEBAR_RAIL, next ? '1' : '0');
                    } catch {
                      /* ignore */
                    }
                    return next;
                  });
                }}
                className="shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors ml-1"
                title={sidebarRailExpanded ? 'Collapse navigation' : 'Expand navigation'}
                aria-expanded={sidebarRailExpanded}
              >
                {sidebarRailExpanded ? <PanelLeftClose size={18} strokeWidth={1.75} /> : <PanelLeft size={18} strokeWidth={1.75} />}
              </button>
          </div>

          {/* Unified search (Cmd+K) + Knowledge panel (RAG / chats list) */}
          <div className="flex-1 flex justify-center items-center min-w-0 px-2 gap-2 overflow-visible">
              <UnifiedSearchBar
                workspaceLabel={workspaceDisplayLine}
                recentFiles={mappedRecentFiles}
                onNavigate={(nav, _q) => handleUnifiedNavigate(nav)}
                onRunCommand={(cmd) => terminalRef.current?.runCommand(cmd)}
                controlledOpen={searchOpen}
                onControlledOpenChange={onUnifiedSearchOpenChange}
                initialFacets={searchInitialFacets}
                initialQuery={searchInitialQuery}
                onInitialQueryConsumed={() => setSearchInitialQuery('')}
              />
          </div>

          {/* Right layout cluster: split | side panel | bottom aux | terminal (IAM shell) */}
          <div className="flex gap-0.5 items-center mr-1 shrink-0">
              <button
                  type="button"
                  title="More tools (mobile)"
                  className="md:hidden p-1.5 rounded transition-colors text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]"
                  onClick={() => setMobileMoreOpen(true)}
              >
                  <MoreHorizontal size={15} strokeWidth={1.75} />
              </button>
              <button
                  type="button"
                  title="Open Browser"
                  className="p-1.5 rounded transition-colors text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]"
                  onClick={() => {
                    openTab('browser');
                  }}
              >
                  <Globe size={15} strokeWidth={1.75} />
              </button>
              <button
                  type="button"
                  title="Toggle agent panel"
                  className={`p-1.5 rounded transition-colors ${agentPosition !== 'off' ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
                  onClick={onChatLayoutToggle}
              >
                  {agentPosition === 'left' ? <PanelLeftClose size={15} strokeWidth={1.75} /> : <PanelRightClose size={15} strokeWidth={1.75} />}
              </button>



              <button
                  type="button"
                  title="Terminal (Cmd+J)"
                  className={`p-1.5 rounded transition-colors ${isTerminalOpen ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
                  onClick={() =>
                    setIsTerminalOpen((p) => {
                      const next = !p;
                      if (next) setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
                      return next;
                    })
                  }
              >
                  <TermIcon size={15} strokeWidth={1.75} />
              </button>
              <button
                  type="button"
                  title="Settings"
                  className={`p-1.5 rounded transition-colors ${location.pathname.startsWith('/dashboard/settings') ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
                  onClick={() => navigate('/dashboard/settings/general')}
              >
                  <Settings size={15} strokeWidth={1.75} />
              </button>
              <div className="relative hidden md:block" ref={topChromeMoreRef}>
                  <button
                      type="button"
                      title="More tools"
                      className={`p-1.5 rounded transition-colors ${topChromeMoreOpen ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
                      onClick={() => setTopChromeMoreOpen((v) => !v)}
                  >
                      <MoreHorizontal size={15} strokeWidth={1.75} />
                  </button>
                  {topChromeMoreOpen && (
                      <div className="absolute right-0 top-full mt-1 z-[120] min-w-[200px] rounded-lg border border-[var(--dashboard-border)] bg-[var(--bg-elevated)] shadow-xl py-1">
                          <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
                              onClick={() => {
                                  setTopChromeMoreOpen(false);
                                  navigate(AGENT_HOME_PATH);
                                  queueMicrotask(() => openTab('excalidraw'));
                              }}
                          >
                              <PenTool size={14} className="text-[var(--text-muted)]" />
                              Draw
                          </button>
                          <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
                              onClick={() => {
                                  setTopChromeMoreOpen(false);
                                  toggleActivity('search');
                              }}
                          >
                              <Search size={14} className="text-[var(--text-muted)]" />
                              Search
                          </button>
                          <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
                              onClick={() => {
                                  setTopChromeMoreOpen(false);
                                  navigate('/dashboard/overview');
                              }}
                          >
                              <History size={14} className="text-[var(--text-muted)]" />
                              History
                          </button>
                      </div>
                  )}
              </div>
          </div>
      </div>

      <div className="flex flex-1 overflow-hidden max-md:pb-[52px]">
          {/* 2. ACTIVITY BAR (Extreme Left) — hidden ≤768px; use bottom tab bar + More */}
          {/* Activity bar: icon rail (width toggled via ☰ — localStorage iam_sidebar_expanded) */}
          <div
            className="hidden md:flex flex-col py-3 gap-1 px-1 bg-[var(--dashboard-panel)] border-r border-[var(--dashboard-border)] shrink-0 z-50 overflow-x-hidden overflow-y-auto transition-[width] duration-200 ease-in-out"
            style={{ width: sidebarRailExpanded ? 180 : 48 }}
          >
              <ActivityRailItem icon={Home} label="Overview" expanded={sidebarRailExpanded} active={location.pathname === '/dashboard/overview'} onClick={() => navigate('/dashboard/overview')} />
              <ActivityRailItem
                icon={Library}
                label="Library"
                expanded={sidebarRailExpanded}
                active={location.pathname === '/dashboard/library'}
                onClick={() => navigate('/dashboard/library')}
              />
              <ActivityRailItem
                icon={ChartColumnIncreasing}
                label="Analytics"
                expanded={sidebarRailExpanded}
                active={location.pathname.startsWith('/dashboard/analytics')}
                onClick={() => navigate('/dashboard/analytics/overview')}
              />
              <ActivityRailItem icon={Bot} label="Agent" expanded={sidebarRailExpanded} active={isAgentShellPath(location.pathname)} onClick={() => navigate(AGENT_HOME_PATH)} />
              <ActivityRailItem
                icon={Network}
                label="Workflows"
                expanded={sidebarRailExpanded}
                active={location.pathname === '/dashboard/workflows'}
                onClick={() => navigate('/dashboard/workflows')}
              />
              <ActivityRailItem icon={GraduationCap} label="Learn" expanded={sidebarRailExpanded} active={location.pathname === '/dashboard/learn'} onClick={() => navigate('/dashboard/learn')} />
              <ActivityRailItem
                  icon={Palette}
                  label="Design Studio"
                  expanded={sidebarRailExpanded}
                  active={location.pathname === '/dashboard/designstudio'}
                  onClick={() => navigate('/dashboard/designstudio')}
              />
              <ActivityRailItem
                  icon={Wrench}
                  label="Integrations"
                  expanded={sidebarRailExpanded}
                  active={settingsIntegrationsActive}
                  onClick={() => navigate('/dashboard/settings/integrations')}
              />
              <ActivityRailItem icon={Layers} label="MCP & AI" expanded={sidebarRailExpanded} active={location.pathname.startsWith('/dashboard/mcp')} onClick={() => navigate('/dashboard/mcp')} />
              <ActivityRailItem
                  icon={Database}
                  label="D1 Explorer"
                  expanded={sidebarRailExpanded}
                  active={location.pathname === '/dashboard/database'}
                  onClick={() => navigate('/dashboard/database')}
              />
              <ActivityRailItem icon={Camera} label="Meet" expanded={sidebarRailExpanded} active={location.pathname === '/dashboard/meet'} onClick={() => navigate('/dashboard/meet')} />
              <ActivityRailItem
                icon={Image}
                label="Images"
                expanded={sidebarRailExpanded}
                active={location.pathname === '/dashboard/images'}
                onClick={() => navigate('/dashboard/images')}
              />
              <ActivityRailItem
                icon={Mail}
                label="Mail"
                expanded={sidebarRailExpanded}
                active={location.pathname === '/dashboard/mail'}
                onClick={() => navigate('/dashboard/mail')}
              />
              <ActivityRailItem icon={Settings} label="Settings" expanded={sidebarRailExpanded} active={location.pathname.startsWith('/dashboard/settings')} onClick={() => navigate('/dashboard/settings/general')} />
          </div>

          {/* Optional Left Agent Panel */}
          {agentPosition === 'left' && (
              <>
                <div 
                    className={`bg-[var(--dashboard-panel)] flex flex-col shrink-0 transition-opacity relative group z-30 opacity-100 max-md:fixed max-md:inset-0 max-md:z-[45] max-md:w-full max-md:max-w-none max-md:shrink ${
                      activeActivity ? 'max-md:hidden' : ''
                    }`}
                    style={
                      isNarrowViewport
                        ? { borderRight: '1px solid var(--dashboard-border)' }
                        : { width: agentW, borderRight: '1px solid var(--dashboard-border)' }
                    }
                    {...(narrowNeedsBack && !activeActivity ? mobileEdgeSwipeHandlers : {})}
                >
                    <div className="h-10 max-md:hidden border-b border-[var(--dashboard-border)] flex items-center px-4 font-semibold text-[11px] tracking-widest uppercase text-[var(--text-muted)] shrink-0">{PRODUCT_NAME}</div>
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    <ChatAssistant 
                        activeProject={activeProject} 
                        activeFileContent={activeFile?.content}
                        activeFileName={activeFile?.name}
                        activeFile={activeFile}
                        editorCursorLine={cursorPos.line}
                        editorCursorColumn={cursorPos.col}
                        agentsamPolicy={agentsamChatPolicy}
                        workspaceId={authWorkspaceId}
                        messages={chatMessages} 
                        setMessages={setChatMessages} 
                        onOpenChatHistory={() => setActiveActivity('search')}
                        onFileSelect={openInMonacoFromChat}
                        onGlbFileSelect={(file) => {
                          const glbUrl = URL.createObjectURL(file);
                          setGlbViewerUrl((prev) => {
                            if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                            return glbUrl;
                          });
                          setGlbViewerFilename(file.name);
                          navigate('/dashboard/designstudio', {
                            state: { pendingGlb: { url: glbUrl, name: file.name.replace(/\.glb$/i, '') } },
                          });
                        }}
                        onRunInTerminal={runInTerminal}
                        onR2FileUpdated={handleR2FileUpdatedFromAgent}
                        onBrowserNavigate={handleBrowserNavigateFromAgent}
                        onOpenGitHubIntegration={openGitHubFromChat}
                        onMobileOpenDashboard={openDashboardFromChat}
                        onOpenCodeTab={focusCodeEditorFromChat}
              onLoadingChange={setAgentIsStreaming}
              onApprovalRequired={setActiveCommandRunId}
              agentRunId={activeCommandRunId}
              onAgentRunContext={setActiveAgentRunId}
                        syncedHostConversationId={activeAgentConversationId}
                        agentChatShellTabs={agentChatTabs.map((t) => ({ id: t.id, title: t.title }))}
                        activeAgentChatShellTabId={activeAgentChatTabId}
                        onAgentChatShellTabSelect={selectAgentChatTab}
                        onAgentChatShellNewTab={createNewAgentChatTab}
                    />
                    </div>
                </div>
                {/* Grab Bar — wide hit target; stroke is 1px inside */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  title="Drag to resize Agent Sam panel"
                  aria-label="Resize Agent Sam panel"
                  className="max-md:hidden shrink-0 z-50 flex justify-center cursor-col-resize touch-none select-none group relative"
                  style={{ width: AGENT_RESIZER_HIT_PX }}
                  onPointerDown={(e) => beginPanelResize('agent', e)}
                >
                  <span
                    className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--dashboard-border)] group-hover:bg-[var(--solar-cyan)] group-active:bg-[var(--solar-cyan)] transition-colors"
                    aria-hidden
                  />
                </div>
              </>
          )}

          <div className="flex flex-1 min-w-0 overflow-hidden">
          <div 
              className={`transition-all duration-75 shrink-0 bg-[var(--dashboard-panel)] flex flex-col z-40 overflow-hidden shadow-2xl md:shadow-none hover:border-[var(--solar-cyan)] relative group
              ${activeActivity ? 'absolute inset-y-0 left-0 md:relative md:left-0 max-md:!w-full max-md:z-[46] max-md:inset-0 border-r border-[var(--dashboard-border)] opacity-100 pointer-events-auto' : 'border-none opacity-0 pointer-events-none'}`}
              style={{ width: activeActivity ? sidebarW : 0 }}
              {...(narrowNeedsBack && !!activeActivity ? mobileEdgeSwipeHandlers : {})}
          >
              <div className="w-full h-full flex flex-col relative">
                  {activeActivity === 'search' ? (
                      <KnowledgeSearchPanel
                        onClose={() => setActiveActivity(null)}
                        activeConversationId={activeAgentConversationId}
                      />
                  ) : location.pathname === '/dashboard/meet' && meetCtxValue ? (
                      <MeetProvider value={meetCtxValue}>
                        <MeetShellPanel />
                      </MeetProvider>
                  ) : activeActivity === 'files' && isAgentHomePath(location.pathname) ? (
                      <LocalExplorer
                          workspace_id={authWorkspaceId}
                          user_id={sessionUserId}
                          nativeFolderOpenSignal={nativeFolderOpenSignal}
                          onWorkspaceRootChange={onExplorerWorkspaceRootChange}
                          onFileSelect={openInEditorFromExplorer}
                          onOpenInEditor={openInEditorFromExplorer}
                          onOpenMovieMode={openMovieModeFromExplorer}
                      />
                  ) : activeActivity === 'mcps' ? (
                      <MCPPanel />
                  ) : activeActivity === 'actions' ? (
                      <GitHubExplorer
                          workspace_id={authWorkspaceId}
                          expandRepoFullName={githubExpandRepo}
                          onExpandRepoConsumed={consumeGithubExpandRepo}
                          onOpenInEditor={(file) => {
                              setActiveFile(file);
                              openTab('code');
                              revealMainWorkspaceIfNarrow();
                          }}
                      />
                  ) : activeActivity === 'drive' ? (
                      <GoogleDriveExplorer
                          onOpenInEditor={(file) => {
                              setActiveFile(file);
                              openTab('code');
                              revealMainWorkspaceIfNarrow();
                          }}
                      />
                  ) : activeActivity === 'debug' ? (
                      <div className="p-4 text-xs text-[var(--text-muted)]">Redirecting to terminal problems...</div>
                  ) : activeActivity === 'git' ? (
                      <SourcePanel />
                  ) : activeActivity === 'database' ? (
                      <DatabaseBrowser
                          explorerJump={dbExplorerJump}
                          onExplorerJumpConsumed={() => setDbExplorerJump(null)}
                          onClose={() => setActiveActivity(null)}
                      />
                  ) : activeActivity === 'files' ? (
                      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
                        <p className="text-[12px] text-[var(--text-muted)]">The file explorer is available on the Agent page.</p>
                        <button
                          type="button"
                          className="text-[11px] px-3 py-2 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-canvas)] text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] transition-colors"
                          onClick={() => navigate(AGENT_HOME_PATH)}
                        >
                          Go to Agent
                        </button>
                      </div>
                  ) : location.pathname !== '/dashboard/meet' ? (
                      <div className="p-4 text-xs text-[var(--text-muted)]">Panel empty.</div>
                  ) : null}
              </div>
          </div>

          {/* Sidebar Grab Bar */}
          {activeActivity && (
            <div
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize sidebar"
              className="hidden md:flex shrink-0 z-50 group relative cursor-col-resize touch-none select-none justify-center"
              style={{ width: ACTIVITY_SIDEBAR_GRAB_PX }}
              onPointerDown={(e) => beginPanelResize('sidebar', e)}
            >
              <span
                className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--dashboard-border)] group-hover:bg-[var(--solar-cyan)] group-active:bg-[var(--solar-cyan)]"
                aria-hidden
              />
            </div>
          )}

          {/* 4. MAIN EDITOR AREA */}
          <main 
              className={`flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--dashboard-canvas)] relative ${narrowBlocksCenter ? 'max-md:hidden' : ''}`}
              onDrop={handleMainFileDrop}
              onDragOver={handleMainDragOver}
          >
              {/* Dashboard page routes — non-agent pages render here */}
              {!isAgentShellPath(location.pathname) ? (
                <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-[var(--dashboard-canvas)] flex flex-col">
                  <Suspense fallback={<DashboardRoutesFallback />}>
                    <Routes>
                      <Route path="/dashboard/calendar" element={<CalendarPage />} />
                      <Route path="/dashboard/overview" element={<OverviewPage />} />
                      <Route path="/dashboard/library" element={<LibraryPage />} />
                      <Route path="/dashboard/projects" element={<ProjectManagement />} />
                      <Route path="/dashboard/tasks" element={<TasksPage />} />
                      <Route path="/dashboard/analytics" element={<Navigate to="/dashboard/analytics/overview" replace />} />
                      <Route path="/dashboard/analytics/:tab" element={<AnalyticsPage />} />
                      <Route path="/dashboard/health" element={<Navigate to="/dashboard/analytics/overview" replace />} />
                      <Route path="/dashboard/health/:tab" element={<RedirectHealthToAnalytics />} />
                      <Route path="/dashboard/health/*" element={<Navigate to="/dashboard/analytics/overview" replace />} />
                      <Route path="/dashboard/learn" element={<LearnPage />} />
                      <Route path="/dashboard/workflows" element={<WorkflowsPage />} />
                      <Route path="/dashboard/database" element={<DatabasePage />} />
                      <Route path="/dashboard/mcp/:agentSlug?" element={<McpPage />} />
                      <Route
                        path="/dashboard/integrations"
                        element={
                          <Navigate to="/dashboard/settings/integrations" replace />
                        }
                      />
                      <Route path="/dashboard/designstudio" element={<DesignStudioPage />} />
                      <Route
                        path="/dashboard/storage"
                        element={<Navigate to="/dashboard/settings/storage" replace />}
                      />
                      <Route
                        path="/dashboard/images"
                        element={<ImagesPage workspaceId={authWorkspaceId || undefined} />}
                      />
                      <Route path="/dashboard/mail" element={<MailPage />} />
                      <Route
                        path="/dashboard/meet"
                        element={
                          <MeetProvider value={meetCtxValue || ({} as MeetCtxValue)}>
                            <MeetPage onContextReady={setMeetCtxValue} />
                          </MeetProvider>
                        }
                      />
                      <Route
                        path="/dashboard/settings"
                        element={<Navigate to="/dashboard/settings/general" replace />}
                      />
                      <Route
                        path="/dashboard/settings/:sectionSlug"
                        element={
                          <SettingsPanel
                            onClose={() => navigate(-1)}
                            workspaceId={authWorkspaceId || undefined}
                          />
                        }
                      />
                    </Routes>
                  </Suspense>
                </div>
              ) : (
              <>
              {/* Editor Tabs — lazy, closeable */}
              <div className="h-10 flex items-center shrink-0 pl-0 relative z-10 overflow-x-auto overflow-y-hidden no-scrollbar">
                  {openTabs.includes('Workspace') && (
                      <Tab
                          title="Workspace"
                          icon={<Layers size={13} className="text-[var(--solar-cyan)]"/>}
                          active={activeTab === 'Workspace'}
                          onClick={() => setActiveTab('Workspace')}
                          onClose={(e) => closeTab('Workspace', e)}
                      />
                  )}
                  {openTabs.includes('code') && (
                      <>
                      <Tab
                          title={
                              <span className="flex items-center gap-1">
                                  {activeFile ? activeFile.name : 'Untitled.ts'}
                                  {isDirty && <span className="text-[var(--solar-yellow)] text-[10px] animate-pulse-dirty" title="Unsaved changes">●</span>}
                              </span>
                          }
                          icon={<LayoutTemplate size={13} className={activeFile ? 'text-[var(--solar-yellow)]' : 'text-[var(--text-muted)]'}/>}
                          active={activeTab === 'code'}
                          onClick={() => setActiveTab('code')}
                          onClose={(e) => closeTab('code', e)}
                      />
                      {activeFile && isRenderablePreviewFilename(activeFile.name) && (
                          <button
                              type="button"
                              onClick={(e) => {
                                  e.stopPropagation();
                                  openEditorPreview();
                              }}
                              title={previewButtonTitle(activeFile.name)}
                              className="shrink-0 h-8 w-8 p-0 inline-flex items-center justify-center rounded-md border border-[var(--dashboard-border)] bg-[var(--bg-hover)] text-[var(--text-main)] hover:bg-[var(--dashboard-panel)] hover:border-[var(--solar-cyan)]"
                          >
                              <Eye size={15} className="text-[var(--solar-cyan)]" strokeWidth={1.75} aria-hidden />
                              <span className="sr-only">Preview in Browser tab</span>
                          </button>
                      )}
                      {activeFile?.r2Key?.trim() && activeFile?.r2Bucket?.trim() && (
                          <button
                              type="button"
                              onClick={(e) => {
                                  e.stopPropagation();
                                  const path = `${activeFile.r2Bucket!.trim()}/${activeFile.r2Key!.trim()}`;
                                  void navigator.clipboard.writeText(path);
                                  setToastMsg('R2 path copied');
                              }}
                              title={`Copy R2 path: ${activeFile.r2Bucket!.trim()}/${activeFile.r2Key!.trim()}`}
                              className="shrink-0 h-8 w-8 p-0 inline-flex items-center justify-center rounded-md border border-[var(--dashboard-border)] bg-[var(--bg-hover)] text-[var(--text-main)] hover:bg-[var(--dashboard-panel)] hover:border-[var(--solar-cyan)]"
                          >
                              <Link2 size={14} className="text-[var(--text-muted)]" strokeWidth={1.75} aria-hidden />
                              <span className="sr-only">Copy R2 path</span>
                          </button>
                      )}
                      </>
                  )}
                  {openTabs.includes('browser') && (
                      <Tab
                          title={browserTabTitle ?? 'Browser'}
                          icon={<Globe size={13} className="text-[var(--solar-blue)]"/>}
                          active={activeTab === 'browser'}
                          onClick={() => setActiveTab('browser')}
                          onClose={(e) => closeTab('browser', e)}
                      />
                  )}
                  {openTabs.includes('excalidraw') && (
                      <Tab
                          title="Draw"
                          icon={<PenTool size={13} className="text-[var(--solar-orange)]"/>}
                          active={activeTab === 'excalidraw'}
                          onClick={() => setActiveTab('excalidraw')}
                          onClose={(e) => closeTab('excalidraw', e)}
                      />
                  )}
                  {openTabs.includes('moviemode') && (
                      <Tab
                          title="MovieMode"
                          icon={<Camera size={13} className="text-[var(--solar-orange)]"/>}
                          active={activeTab === 'moviemode'}
                          onClick={() => setActiveTab('moviemode')}
                          onClose={(e) => closeTab('moviemode', e)}
                      />
                  )}

                  {/* Quick-open buttons for closed panels */}
                  <div className="ml-auto flex items-center gap-0.5 pr-2 shrink-0">
                      {!openTabs.includes('browser') && <QuickOpen label="Browser" onClick={() => openTab('browser')} />}
                  </div>

                  {/* Decorative line below tabs */}
                  <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--dashboard-border)] z-[-1]" />
              </div>

              {/* Editor + optional aux bottom + terminal — flex column so drawer respects drag height */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                  <div className="flex-1 min-h-0 relative flex flex-col">
                  {isAgentQuickstartPath(location.pathname) && (
                      <div className="absolute inset-0 z-10">
                          <AgentQuickstartPage
                            onBack={() => navigate(AGENT_HOME_PATH)}
                            onBegin={beginQuickstartTemplate}
                          />
                      </div>
                  )}

                  {isAgentHomePath(location.pathname) && activeTab === 'Workspace' && (
                      <div className="absolute inset-0 z-10">
                          <WorkspaceDashboard 
                            onOpenFolder={() => {
                              setActiveActivity('files');
                              setNativeFolderOpenSignal(n => n + 1);
                            }}
                            onConnectWorkspace={() => setWorkspaceLauncherOpen(true)}
                            onGithubSync={() => {
                              setSearchInitialQuery('clone ');
                              setSearchOpen(true);
                            }}
                            recentFiles={workspaceDashboardRecentFiles}
                            onOpenRecent={openRecentEntry}
                            workspaceRows={workspaceRows}
                            authWorkspaceId={authWorkspaceId}
                            onSwitchWorkspace={persistActiveWorkspace}
                            onQuickstart={openAgentQuickstart}
                            onRunVerificationCommand={runVerificationInAgent}
                            onOpenEditor={focusCodeEditorFromChat}
                            workspacePlanTasks={Array.isArray(workspaceSamState?.next_tasks) ? (workspaceSamState!.next_tasks as unknown[]) : []}
                            activePlanId={(() => {
                              const st = workspaceSamState;
                              if (!st || typeof st !== 'object') return null;
                              const row = st as Record<string, unknown>;
                              const a = row.active_plan_id;
                              const b = row.activePlanId;
                              if (typeof a === 'string' && a.trim()) return a.trim();
                              if (typeof b === 'string' && b.trim()) return b.trim();
                              return null;
                            })()}
                            workspaceActivity={Array.isArray(workspaceSamState?.recent_adjustments) ? (workspaceSamState!.recent_adjustments as unknown[]) : []}
                            workspaceVerificationCommands={Array.isArray(workspaceSamState?.verification_commands) ? (workspaceSamState!.verification_commands as unknown[]) : []}
                            activeAgentSlug={typeof workspaceSamState?.active_agent_slug === 'string' ? workspaceSamState.active_agent_slug : null}
                          />
                      </div>
                  )}

                  {activeTab === 'code' && (
                      <div className="absolute inset-0 z-10">
                          <MonacoEditorView
                              fileData={activeFile}
                              isDirty={isDirty}
                              onSave={handleSaveFile}
                              onCursorPositionChange={(line, col) => setCursorPos({ line, col })}
                              onEditorModelMeta={setEditorMeta}
                              onChange={(val) => {
                                  if (activeFile && val !== undefined) {
                                      setActiveFile(prev => prev ? {
                                          ...prev,
                                          content: val,
                                          originalContent: prev.originalContent ?? prev.content
                                      } : null);
                                  }
                              }}
                          />
                      </div>
                  )}
                  {activeTab === 'browser' && (
                      <div className="absolute inset-0 z-10 overflow-hidden">
                          <BrowserView
                            isActive={activeTab === 'browser'}
                            url={browserUrl}
                            addressDisplay={browserAddressDisplay}
                            agentRunId={activeAgentRunId}
                          />
                      </div>
                  )}

                  {activeTab === 'excalidraw' && (
                      <div className="absolute inset-0 z-10 flex flex-col">
                          <Suspense
                            fallback={
                              <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm">
                                Loading canvas…
                              </div>
                            }
                          >
                            <ExcalidrawView />
                          </Suspense>
                      </div>
                  )}
                  {activeTab === 'moviemode' && (
                      <div className="absolute inset-0 z-10 flex flex-col">
                          <Suspense
                            fallback={
                              <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm">
                                Loading MovieMode…
                              </div>
                            }
                          >
                            <MovieModeStudio
                              timeline={movieModeTimeline}
                              onTimelineChange={setMovieModeTimeline}
                            />
                          </Suspense>
                      </div>
                  )}
                  </div>

                  {/* Agent page keeps integrated terminal mount (existing behavior). */}
                  {isTerminalOpen && (
                      <XTermShell
                          ref={terminalRef}
                          onClose={() => setIsTerminalOpen(false)}
                          problems={systemProblems ?? []}
                          iamOrigin={typeof window !== 'undefined' ? window.location.origin : 'https://inneranimalmedia.com'}
                          workspaceLabel={workspaceDisplayLine}
                          workspaceId={authWorkspaceId || undefined}
                          productLabel={PRODUCT_NAME}
                          layout="page"
                          outputLines={shellOutputLines}
                          onOutputLine={(line) =>
                            setShellOutputLines((prev) => [...prev.slice(-250), line])
                          }
                      />
                  )}
              </div>
          </>
              )}

              {/* Global terminal drawer — non-agent routes only (/dashboard/agent uses in-layout XTermShell) */}
              {!isAgentShellPath(location.pathname) && (
              <div
                style={{
                  display: isTerminalOpen ? 'flex' : 'none',
                  flexDirection: 'column',
                  height: `${terminalDrawerH}px`,
                  flexShrink: 0,
                  borderTop: '1px solid var(--dashboard-border)',
                  background: 'var(--dashboard-panel)',
                  position: 'relative',
                  zIndex: 60,
                  width: '100%',
                }}
              >
                {/* Drag handle (vertical resize) */}
                <div
                  onPointerDown={beginTerminalResize}
                  style={{
                    height: 4,
                    cursor: 'ns-resize',
                    background: 'transparent',
                    borderBottom: '1px solid var(--dashboard-border)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--solar-cyan)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  }}
                  title="Drag to resize terminal"
                  aria-label="Resize terminal"
                />
                <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                  <XTermShell
                    ref={terminalRef}
                    iamOrigin={window.location.origin}
                    workspaceLabel={workspaceDisplayName || ''}
                    workspaceId={authWorkspaceId || ''}
                    productLabel="IAM"
                    layout="drawer"
                    outputLines={shellOutputLines}
                    onOutputLine={(line) => setShellOutputLines((prev) => [...prev.slice(-250), line])}
                    problems={systemProblems ?? []}
                    onClose={() => setIsTerminalOpen(false)}
                  />
                </div>
              </div>
              )}
          </main>
          </div>

          {/* 6. Optional Right Agent Panel */}
          {agentPosition === 'right' && (
              <>
                {/* Agent Grab Bar */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  title="Drag to resize Agent Sam panel"
                  className="max-md:hidden shrink-0 z-50 group relative flex justify-center cursor-col-resize touch-none select-none"
                  style={{ width: AGENT_RESIZER_HIT_PX }}
                  onPointerDown={(e) => beginPanelResize('agent', e)}
                >
                  <span
                    className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--dashboard-border)] group-hover:bg-[var(--solar-cyan)] group-active:bg-[var(--solar-cyan)]"
                    aria-hidden
                  />
                </div>
                <div 
                    className={`bg-[var(--dashboard-panel)] flex flex-col shrink-0 transition-opacity z-30 relative group opacity-100 max-md:fixed max-md:inset-0 max-md:z-[45] max-md:w-full max-md:max-w-none max-md:shrink ${
                      isNarrowViewport && activeActivity ? 'max-md:hidden' : ''
                    }`}
                    style={
                      isNarrowViewport
                        ? { borderLeft: '1px solid var(--dashboard-border)' }
                        : { width: agentW, borderLeft: '1px solid var(--dashboard-border)' }
                    }
                    {...(narrowNeedsBack && !activeActivity ? mobileEdgeSwipeHandlers : {})}
                >
                    <div className="h-10 max-md:hidden border-b border-[var(--dashboard-border)] flex items-center px-4 font-semibold text-[11px] tracking-widest uppercase text-[var(--text-muted)] shrink-0">{PRODUCT_NAME}</div>
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                         <ChatAssistant 
                            activeProject={activeProject} 
                            activeFileContent={activeFile?.content}
                            activeFileName={activeFile?.name}
                            activeFile={activeFile}
                            editorCursorLine={cursorPos.line}
                            editorCursorColumn={cursorPos.col}
                            agentsamPolicy={agentsamChatPolicy}
                            workspaceId={authWorkspaceId}
                            messages={chatMessages} 
                            setMessages={setChatMessages} 
                            onOpenChatHistory={() => setActiveActivity('search')}
                            onFileSelect={openInMonacoFromChat}
                            onGlbFileSelect={(file) => {
                              const glbUrl = URL.createObjectURL(file);
                              setGlbViewerUrl((prev) => {
                                if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                                return glbUrl;
                              });
                              setGlbViewerFilename(file.name);
                              navigate('/dashboard/designstudio', {
                                state: { pendingGlb: { url: glbUrl, name: file.name.replace(/\.glb$/i, '') } },
                              });
                            }}
                            onRunInTerminal={runInTerminal}
                            onR2FileUpdated={handleR2FileUpdatedFromAgent}
                            onBrowserNavigate={handleBrowserNavigateFromAgent}
                            onOpenGitHubIntegration={openGitHubFromChat}
                            onMobileOpenDashboard={openDashboardFromChat}
                            onOpenCodeTab={focusCodeEditorFromChat}
                            onLoadingChange={setAgentIsStreaming}
                            onApprovalRequired={setActiveCommandRunId}
                            agentRunId={activeCommandRunId}
                            syncedHostConversationId={activeAgentConversationId}
                            agentChatShellTabs={agentChatTabs.map((t) => ({ id: t.id, title: t.title }))}
                            activeAgentChatShellTabId={activeAgentChatTabId}
                            onAgentChatShellTabSelect={selectAgentChatTab}
                            onAgentChatShellNewTab={createNewAgentChatTab}
                            onAgentRunContext={setActiveAgentRunId}
                         />
                    </div>
                </div>
              </>
          )}
      </div>
      {/* 8. STATUS BAR (FOOTER) */}
      {toastMsg && (
        <div
          className="fixed bottom-16 left-1/2 z-[200] -translate-x-1/2 px-4 py-2 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-canvas)] text-[11px] text-[var(--text-main)] shadow-lg max-w-md text-center max-md:[bottom:calc(56px+1.5rem+env(safe-area-inset-bottom,0px)+8px)]"
          role="status"
        >
          {toastMsg}
        </div>
      )}

      {/* Mobile (≤768px): bottom tab bar above StatusBar */}
      <nav
        className="md:hidden fixed inset-x-0 z-[90] flex items-stretch justify-around gap-0 border-t border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/95 backdrop-blur-sm"
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        aria-label="Primary"
      >
        <button
          type="button"
          className={`flex flex-1 flex-col items-center justify-center min-h-[44px] gap-0.5 px-0.5 text-[10px] font-medium leading-tight ${agentPosition !== 'off' && !activeActivity ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'}`}
          onClick={onChatLayoutToggle}
        >
          <MessageSquare size={24} strokeWidth={1.5} aria-hidden />
          <span>Chat</span>
        </button>
        <button
          type="button"
          className={`flex flex-1 flex-col items-center justify-center min-h-[44px] gap-0.5 px-0.5 text-[10px] font-medium leading-tight ${location.pathname === '/dashboard/database' ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'}`}
          onClick={() => navigate('/dashboard/database')}
        >
          <Database size={24} strokeWidth={1.5} aria-hidden />
          <span>Database</span>
        </button>
        <button
          type="button"
          className={`flex flex-1 flex-col items-center justify-center min-h-[44px] gap-0.5 px-0.5 text-[10px] font-medium leading-tight ${searchOpen ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'}`}
          onClick={() => {
            setSearchInitialFacets(['workspace']);
            setSearchOpen(true);
          }}
        >
          <FolderOpen size={24} strokeWidth={1.5} aria-hidden />
          <span>Explorer</span>
        </button>
        <button
          type="button"
          className={`flex flex-1 flex-col items-center justify-center min-h-[44px] gap-0.5 px-0.5 text-[10px] font-medium leading-tight ${activeActivity === 'actions' ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'}`}
          onClick={() => toggleActivity('actions')}
        >
          <Github size={24} strokeWidth={1.5} aria-hidden />
          <span>Deploy</span>
        </button>
        <button
          type="button"
          className={`flex flex-1 flex-col items-center justify-center min-h-[44px] gap-0.5 px-0.5 text-[10px] font-medium leading-tight ${location.pathname.startsWith('/dashboard/settings') ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'}`}
          onClick={() => navigate('/dashboard/settings/general')}
        >
          <Settings size={24} strokeWidth={1.5} aria-hidden />
          <span>Settings</span>
        </button>
      </nav>

      {mobileMoreOpen && (
        <>
          <button
            type="button"
            className="md:hidden fixed inset-0 z-[95] bg-[var(--text-main)]/25 backdrop-blur-[2px]"
            aria-label="Close more tools"
            onClick={() => setMobileMoreOpen(false)}
          />
          <div
            className="md:hidden fixed left-2 right-2 z-[96] max-h-[min(72vh,calc(100dvh-10rem))] flex flex-col rounded-t-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] shadow-2xl overflow-hidden"
            style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px) + 52px)' }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--dashboard-border)] shrink-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">More</span>
              <button
                type="button"
                className="p-2 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                title="Close"
                onClick={() => setMobileMoreOpen(false)}
              >
                <XIcon size={18} strokeWidth={1.75} />
              </button>
            </div>
            <div className="overflow-y-auto p-2 flex flex-col gap-0.5">
              <MobileMoreRow icon={Search} label="Search" onClick={() => { setMobileMoreOpen(false); toggleActivity('search'); }} />
              <MobileMoreRow icon={GitBranch} label="Source Control" onClick={() => { setMobileMoreOpen(false); toggleActivity('git'); }} />
              <MobileMoreRow icon={Bug} label="Run & Debug" onClick={() => { setMobileMoreOpen(false); toggleActivity('debug'); }} />
              <MobileMoreRow icon={Layers} label="Tools & MCP" onClick={() => { setMobileMoreOpen(false); toggleActivity('mcps'); }} />
              <MobileMoreRow icon={Cloud} label="Cloud Sync" onClick={() => { setMobileMoreOpen(false); toggleActivity('drive'); }} />
              <MobileMoreRow icon={Monitor} label="Engine View" onClick={() => { setMobileMoreOpen(false); navigate('/dashboard/designstudio'); }} />
            </div>
          </div>
        </>
      )}

      <StatusBar 
        branch={gitBranch}
        workspace={(workspaceDisplayName?.trim() || authWorkspaceId?.trim() || '')}
        workspaceMenuItems={statusBarWorkspaceItems.length > 0 ? statusBarWorkspaceItems : undefined}
        activeWorkspaceId={authWorkspaceId}
        onWorkspaceMenuSelect={handleStatusBarWorkspacePick}
        errorCount={errorCount}
        warningCount={warningCount}
        showCursor={activeTab === 'code'}
        line={cursorPos.line}
        col={cursorPos.col}
        version={SHELL_VERSION}
        healthOk={healthOk}
        tunnelHealthy={tunnelHealthy}
        tunnelLabel={tunnelLabel}
        terminalOk={terminalOk}
        lastDeployLine={lastDeployLine}
        indentLabel={statusIndentLabel}
        encodingLabel={editorMeta.encoding}
        eolLabel={editorMeta.eol}
        notifications={agentNotifications}
        notifUnreadCount={agentNotifications.length}
        onMarkNotificationRead={markNotificationRead}
        canFormatDocument={activeTab === 'code' && !!activeFile}
        onBrandClick={() => {
          window.open('https://inneranimalmedia.com', '_blank', 'noopener,noreferrer');
        }}
        onGitBranchClick={() => {
          setSearchInitialFacets(['branch']);
          setSearchOpen(true);
        }}
        onWorkspaceClick={() => {
          setSearchInitialFacets(['workspace']);
          setSearchOpen(true);
        }}
        onErrorsClick={() => toggleActivity('debug')}
        onWarningsClick={() => toggleActivity('mcps')}
        onCursorClick={() => {
          if (isNarrowViewport) narrowBackToCenter();
          openTab('code');
        }}
        onVersionClick={() => {}}
        onFormatClick={() => {
          window.dispatchEvent(new CustomEvent('iam-format-document'));
        }}
      />

      {isWorkspaceLauncherOpen && (
        <WorkspaceLauncher
          onClose={() => setWorkspaceLauncherOpen(false)}
          sessionUserId={sessionUserId}
          authWorkspaceId={authWorkspaceId}
          setAuthWorkspaceId={setAuthWorkspaceId}
          setWorkspaceDisplayName={setWorkspaceDisplayName}
          setToastMsg={setToastMsg}
          onOpenLocalFolder={() => {
            setWorkspaceLauncherOpen(false);
            setActiveActivity('files');
            setNativeFolderOpenSignal((n) => n + 1);
          }}
          onConnectWorkspace={() => setWorkspaceLauncherOpen(false)}
        />
      )}
    </div>
  );
};

// --- Helper UI Components ---
type LucideLike = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

const MobileMoreRow: React.FC<{ icon: LucideLike; label: string; onClick: () => void }> = ({ icon: Icon, label, onClick }) => (
  <button
    type="button"
    className="flex w-full items-center gap-3 min-h-[44px] rounded-lg px-3 text-left text-[13px] text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors border border-transparent hover:border-[var(--dashboard-border)]"
    onClick={onClick}
  >
    <Icon size={20} strokeWidth={1.5} className="shrink-0 text-[var(--text-muted)]" />
    <span>{label}</span>
  </button>
);

const ActivityRailItem: React.FC<{
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  expanded: boolean;
  active: boolean;
  onClick: () => void;
}> = ({ icon: Icon, label, expanded, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    className={`relative flex w-full min-h-[40px] shrink-0 items-center rounded-lg transition-colors ${
      expanded ? 'gap-2.5 px-2 justify-start' : 'justify-center px-0'
    } ${active ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]/60'}`}
  >
    {active ? (
      <div className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-md bg-[var(--solar-cyan)]" aria-hidden />
    ) : null}
    <Icon size={expanded ? 20 : 18} strokeWidth={1} className="shrink-0" />
    {expanded ? <span className="min-w-0 truncate text-left text-[12px] font-medium leading-tight">{label}</span> : null}
  </button>
);

const Tab: React.FC<{ title: React.ReactNode, icon: React.ReactNode, active: boolean, onClick: () => void, onClose?: (e: React.MouseEvent) => void }> = ({ title, icon, active, onClick, onClose }) => (
    <div 
        onClick={onClick}
        className={`h-full flex items-center gap-1.5 pl-3 pr-2 text-[12px] select-none cursor-pointer border-r border-[var(--dashboard-border)] relative group whitespace-nowrap shrink-0 ${
            active 
                ? 'bg-[var(--dashboard-canvas)] text-[var(--solar-cyan)]' 
                : 'bg-[var(--dashboard-panel)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
        }`}
    >
        {active && <div className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--solar-cyan)]" />}
        {icon}
        <span className="max-w-[120px] truncate">{title}</span>
        {onClose && (
            <button
                onClick={onClose}
                className={`ml-1 p-0.5 rounded transition-all hover:bg-[var(--solar-red)]/20 hover:text-[var(--solar-red)] ${
                    active ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-50 hover:!opacity-100'
                }`}
                title="Close tab"
            >
                <XIcon size={11} />
            </button>
        )}
        {!active && <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--dashboard-border)]" />}
    </div>
);

const QuickOpen: React.FC<{ label: string, onClick: () => void }> = ({ label, onClick }) => (
    <button
        onClick={onClick}
        className="text-[10px] px-2 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] transition-colors border border-transparent hover:border-[var(--dashboard-border)] font-sans"
        title={`Open ${label}`}
    >
        + {label}
    </button>
);

export default App;
