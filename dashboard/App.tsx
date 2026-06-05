
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
import { BREAKPOINTS, PHONE_MQ } from './lib/breakpoints';
import { sanitizeBrowserNavigateUrl } from './lib/sanitizeBrowserUrl';
import { MCPPanel } from './components/MCPPanel';
import {
  IAM_AGENT_CHAT_CONVERSATION_CHANGE,
  IAM_AGENT_CHAT_NEW_THREAD,
  IAM_AGENT_CHAT_COMPOSE,
  LS_AGENT_CHAT_CONVERSATION_ID,
  QUICKSTART_BATCH_LABEL,
  QUICKSTART_WORKSPACE_ID,
  type AgentChatComposeDetail,
  type QuickstartThreadDetail,
} from './agentChatConstants';
import { WorkspaceLauncher } from './components/WorkspaceLauncher';
import { XTermShell, XTermShellHandle } from './components/XTermShell';
import { SecurityShieldBanner } from './components/SecurityShieldBanner';
import { mapProblemsApiPayload, countProblemSeverities } from './src/lib/mapAgentProblems';
import { ExtensionsPanel } from './components/ExtensionsPanel';
import type { EditorModelMeta } from './components/MonacoEditorView';
import { LocalExplorer } from './components/LocalExplorer';
import { BrowserView } from './components/BrowserView';
import { EditorPreviewPane } from './components/EditorPreviewPane';
import {
  resolvePreviewMode,
  parseDevServerFromTerminalLine,
  probeDevServerUrl,
} from './lib/resolvePreviewMode';
import { buildPreviewSrcDoc } from './lib/buildPreviewSrcDoc';
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
import { prepareActiveFileForEditor } from './src/lib/mediaPreview';
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
  type AgentWorkspaceContextPacket,
  type DevServerState,
} from './src/ideWorkspace';
import { useEditor } from './src/EditorContext';
import { useWorkspace } from './src/context/WorkspaceContext';
import {
  readIamGitStatusCache,
  writeIamGitStatusCache,
  isIamGitStatusCacheFresh,
} from './src/iamGitStatusCache';
import { MeetProvider, MeetCtxValue } from './src/MeetContext';
import { MeetShellPanel } from './components/MeetShellPanel';
import { AuthSignInPage } from './components/auth/AuthSignInPage';
import { AuthSignUpPage } from './components/auth/AuthSignUpPage';
import { AuthForgotPage } from './components/auth/AuthForgotPage';
import { AuthResetPage } from './components/auth/AuthResetPage';
import AuthOAuthConsentPage from './components/auth/AuthOAuthConsentPage';
import MountIamMcpConsent from './components/auth/MountIamMcpConsent';
import { OnboardingPage } from './components/onboarding/OnboardingPage';
import { DashboardActivityNav } from './components/shell/DashboardActivityNav';
import { MobileNavShell } from './components/shell/MobileNavShell';
import { mobileNavBackLabel } from './components/shell/mobileNavBackLabel';
import { Files, Search, GitBranch, Settings, PanelLeft, PanelLeftClose, PanelRightClose, Terminal as TermIcon, Layers, Monitor, Bug, Github, Database, FolderOpen, FolderCode, Globe, PenTool, Cloud, X as XIcon, Eye, MessageSquare, MoreHorizontal, ChevronLeft, Link2, HardDrive, Package, History, Camera, FileCode2, Rocket } from 'lucide-react';
import { SetiFileIcon } from './src/components/SetiFileIcon';
const ProjectManagement = lazy(() => import('./pages/projects/ProjectManagement'));

/** Route-level code splitting: heavy dashboard pages load on demand; shell + /dashboard/agent stay eager. */
const CalendarPage = lazy(() => import('./components/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const OverviewPage = lazy(() => import('./components/overview'));
const FinanceDashboard = lazy(() => import('./components/finance'));
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
const WorkflowsPage = lazy(() =>
  import('./pages/workflows/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage })),
);
const MovieModeStudio = lazy(() =>
  import('./features/moviemode/MovieModeStudio').then((m) => ({ default: m.MovieModeStudio })),
);
const ExcalidrawView = lazy(() =>
  import('./components/ExcalidrawView').then((m) => ({ default: m.ExcalidrawView })),
);
const MonacoEditorView = lazy(() =>
  import('./components/MonacoEditorView').then((m) => ({ default: m.MonacoEditorView })),
);
const LaunchDeskPage = lazy(() =>
  import('./pages/LaunchDeskPage').then((m) => ({ default: m.LaunchDeskPage })),
);
const DocsPage = lazy(() =>
  import('./pages/DocsPage').then((m) => ({ default: m.DocsPage })),
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
  if (/\.(html|htm)$/i.test(name)) return 'Preview HTML';
  if (/\.svg$/i.test(name)) return 'Preview SVG';
  if (/\.md$/i.test(name)) return 'Preview Markdown';
  if (/\.jsx$/i.test(name)) return 'Preview JSX (dev server)';
  if (/\.tsx$/i.test(name)) return 'Preview TSX (dev server)';
  return 'Preview file';
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
const LS_ACTIVITY_PANEL_W = 'iam_activity_panel_w';
const DEFAULT_ACTIVITY_PANEL_W = 260;
const LS_MOBILE_ACTIVITY_PANEL_VW = 'iam_mobile_activity_panel_vw';
const MOBILE_ACTIVITY_PANEL_MIN_VW = 32;
const MOBILE_ACTIVITY_PANEL_MAX_VW = 85;
const MOBILE_ACTIVITY_PANEL_DEFAULT_VW = 50;

function readMobileActivityPanelVw(): number {
  try {
    const n = Number(sessionStorage.getItem(LS_MOBILE_ACTIVITY_PANEL_VW));
    if (Number.isFinite(n) && n >= MOBILE_ACTIVITY_PANEL_MIN_VW && n <= MOBILE_ACTIVITY_PANEL_MAX_VW) {
      return Math.round(n * 10) / 10;
    }
  } catch {
    /* ignore */
  }
  return MOBILE_ACTIVITY_PANEL_DEFAULT_VW;
}

function readActivityPanelW(): number {
  try {
    const raw = localStorage.getItem(LS_ACTIVITY_PANEL_W);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= 180 && n <= 480) return Math.round(n);
  } catch {
    /* ignore */
  }
  return DEFAULT_ACTIVITY_PANEL_W;
}

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
  const {
    sessionUserId,
    workspaceId: authWorkspaceId,
    setWorkspaceId: setAuthWorkspaceId,
    workspaces: workspaceRows,
    displayName: workspaceDisplayName,
    setDisplayName: setWorkspaceDisplayName,
    switchWorkspace,
    refreshWorkspaces,
  } = useWorkspace();
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
        <Route path="/oauth/mcp/consent" element={<MountIamMcpConsent />} />
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
    if (window.innerWidth <= BREAKPOINTS.PHONE_MAX) return 'off';
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
  const [devServer, setDevServer] = useState<DevServerState | null>(null);
  const [gitHash, setGitHash] = useState<string | null>(null);
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
  const [securityShieldAlert, setSecurityShieldAlert] = useState<{
    message: string;
    details_url: string;
    open_findings_count: number;
    audit_events_24h: number;
  } | null>(null);
  const [securityBannerDismissed, setSecurityBannerDismissed] = useState(false);
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
  const handleEditorCursorPosition = useCallback((line: number, col: number) => {
    setCursorPos((prev) => (prev.line === line && prev.col === col ? prev : { line, col }));
  }, []);
  /** Increment to trigger File System Access picker from Welcome "Open Folder" after files panel mounts. */
  const [nativeFolderOpenSignal, setNativeFolderOpenSignal] = useState(0);
  /** ≤430px: secondary rail actions (sheet above bottom tab bar). */
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  /** ≤430px: glass hamburger → left nav drawer (same destinations as desktop rail). */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [agentIsStreaming, setAgentIsStreaming] = useState(false);
  const [agentBrowserPresenceActive, setAgentBrowserPresenceActive] = useState(false);
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
    () => typeof window !== 'undefined' && window.innerWidth <= BREAKPOINTS.PHONE_MAX,
  );
  const mobileSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  /** Mobile chat repo drawer: expand this repo when opening the GitHub / Deploy panel. */
  const [githubExpandRepo, setGithubExpandRepo] = useState<string | null>(null);

  useEffect(() => {
    const onBrowserPresence = (e: Event) => {
      const d = (e as CustomEvent<{ active?: boolean }>).detail;
      setAgentBrowserPresenceActive(d?.active === true);
    };
    window.addEventListener('iam-agent-browser-presence', onBrowserPresence);
    return () => window.removeEventListener('iam-agent-browser-presence', onBrowserPresence);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(PHONE_MQ);
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
        if (msg.type === 'iam_monaco_patch') {
          window.dispatchEvent(
            new CustomEvent('iam:monaco_patch', {
              detail: {
                filePath: typeof msg.filePath === 'string' ? msg.filePath : '',
                patch: typeof msg.patch === 'string' ? msg.patch : '',
              },
            }),
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
    document.title = `${workspaceDisplayLine} — ${PRODUCT_NAME}`;
  }, [workspaceDisplayLine]);

  const idePersistRef = useRef({
    ideWorkspace: { source: 'none' } as IdeWorkspaceSnapshot,
    gitBranch: '',
    recentFiles: [] as RecentFileEntry[],
    devServer: null as DevServerState | null,
  });
  useEffect(() => {
    idePersistRef.current = { ideWorkspace, gitBranch, recentFiles, devServer };
  }, [ideWorkspace, gitBranch, recentFiles, devServer]);

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
        devServer: s.devServer ?? null,
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
      setDevServer(b.devServer ?? null);
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
        devServer,
      });
    }, 650);
    return () => clearTimeout(t);
  }, [activeAgentConversationId, ideWorkspace, gitBranch, recentFiles, devServer]);
  
  const mappedRecentFiles = useMemo(() => {
    return recentFiles.map(f => ({
      name: f.name,
      path: f.workspacePath || f.githubPath || f.r2Key || f.id,
      label: f.label
    }));
  }, [recentFiles]);

  const workspaceDashboardRecentFiles = useMemo(() => {
    if (recentFiles.length > 0) return recentFiles;
    return readRecentFilesFromLocalStorage();
  }, [recentFiles, recentFilesLsTick]);

  // Tabs: Workspace matches default activeTab (welcome had no panel — stranded tab id removed from defaults).
  const [openTabs, setOpenTabs] = useState<TabId[]>(['Workspace']);
  const [activeTab, setActiveTab] = useState<TabId>('Workspace');
  const [movieModeTimeline, setMovieModeTimeline] = useState<import('./src/types/moviemode').MovieModeTimeline | null>(null);
  
  // Derived from EditorContext to minimize massive refactor breakage
  const activeFile = tabs.find(t => t.id === activeTabId) || null;

  const activePlanIdForChat = useMemo(() => {
    const st = workspaceSamState;
    if (!st || typeof st !== 'object') return null;
    const row = st as Record<string, unknown>;
    const a = row.active_plan_id;
    const b = row.activePlanId;
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (typeof b === 'string' && b.trim()) return b.trim();
    return null;
  }, [workspaceSamState]);

  const handleActivePlanChange = useCallback((planId: string | null) => {
    setWorkspaceSamState((prev) => ({
      ...(prev && typeof prev === 'object' ? prev : {}),
      active_plan_id: planId,
    }));
  }, []);

  const agentWorkbenchOpenFiles = useMemo(
    () => tabs.map((t) => t.name).filter((n) => Boolean(n && String(n).trim())).slice(0, 32),
    [tabs],
  );

  const [browserUrl, setBrowserUrl] = useState<string>('https://inneranimalmedia.com');

  const agentWorkspaceContext = useMemo<AgentWorkspaceContextPacket>(
    () => ({
      activeTab: String(activeTab),
      browserUrl: browserUrl?.trim() || null,
      openFiles: agentWorkbenchOpenFiles,
      plan_id: activePlanIdForChat,
      workflow_run_id: null,
    }),
    [activeTab, browserUrl, agentWorkbenchOpenFiles, activePlanIdForChat],
  );

  const { updateActiveFile } = useEditor();
  const setActiveFile = useCallback((updates: Partial<ActiveFile> | ((prev: ActiveFile | null) => ActiveFile | null)) => {
    if (typeof updates === 'object' && updates !== null && 'content' in updates && 'name' in updates) {
      openFile(updates as ActiveFile);
    } else {
      updateActiveFile(updates);
    }
  }, [openFile, updateActiveFile]);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  /** When set with a blob browser URL, Browser tab shows this label (e.g. r2://binding/key) instead of blob:. */
  const [browserAddressDisplay, setBrowserAddressDisplay] = useState<string | null>(null);
  const [browserTabTitle, setBrowserTabTitle] = useState<string | null>(null);
  /** Agent browser automation vs passive editor URL (never MYBROWSER for editor). */
  const [browserPreviewSource, setBrowserPreviewSource] = useState<'editor' | 'agent'>('agent');
  const [editorPreviewOpen, setEditorPreviewOpen] = useState(false);
  const [editorPreviewMode, setEditorPreviewMode] = useState<'srcdoc' | 'devserver'>('srcdoc');
  const [editorPreviewSrcDoc, setEditorPreviewSrcDoc] = useState<string | null>(null);
  const [editorPreviewUrl, setEditorPreviewUrl] = useState<string | null>(null);
  const [editorPreviewLoading, setEditorPreviewLoading] = useState(false);
  const [editorPreviewStatus, setEditorPreviewStatus] = useState<string | null>(null);
  const editorPreviewLoadingRef = useRef(false);
  useEffect(() => {
    editorPreviewLoadingRef.current = editorPreviewLoading;
  }, [editorPreviewLoading]);
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

  const persistActiveWorkspace = useCallback(
    async (id: string) => {
      const row = workspaceRows.find((w) => w.id === id);
      try {
        await switchWorkspace(id, {
          displayName: row?.name,
          slug: row?.slug,
          github_repo: row?.github_repo,
          sync: true,
        });
        void refreshWorkspaces({ force: true });
      } catch {
        setToastMsg('Workspace saved locally — sync failed.');
      }
    },
    [switchWorkspace, refreshWorkspaces, workspaceRows],
  );

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
    },
    [persistActiveWorkspace],
  );

  const handleStatusBarBranchSelect = useCallback(
    (branchName: string) => {
      const b = branchName.trim();
      if (!b) return;
      setGitBranch(b);
      const ws = authWorkspaceId?.trim();
      void fetch('/api/agent/git/branch', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: b, workspace_id: ws || undefined }),
      }).catch(() => {});
    },
    [authWorkspaceId],
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
  const [sidebarW, setSidebarW] = useState(readActivityPanelW);
  const [mobileActivityPanelVw, setMobileActivityPanelVw] = useState(readMobileActivityPanelVw);
  const mobileActivityPanelVwRef = useRef(mobileActivityPanelVw);
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

  useEffect(() => {
    try {
      localStorage.setItem(LS_ACTIVITY_PANEL_W, String(sidebarW));
    } catch {
      /* ignore */
    }
  }, [sidebarW]);

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

  useEffect(() => {
    mobileActivityPanelVwRef.current = mobileActivityPanelVw;
  }, [mobileActivityPanelVw]);

  const beginMobileActivityPanelResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startVw = mobileActivityPanelVwRef.current;
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }
    document.body.classList.add('is-resizing');

    const onMove = (pe: PointerEvent) => {
      if (pe.pointerId !== pointerId) return;
      const vw = window.innerWidth || 390;
      const deltaVw = ((pe.clientX - startX) / vw) * 100;
      const next = Math.min(
        MOBILE_ACTIVITY_PANEL_MAX_VW,
        Math.max(MOBILE_ACTIVITY_PANEL_MIN_VW, startVw + deltaVw),
      );
      setMobileActivityPanelVw(Math.round(next * 10) / 10);
    };

    const endDrag = () => {
      document.body.classList.remove('is-resizing');
      try {
        sessionStorage.setItem(
          LS_MOBILE_ACTIVITY_PANEL_VW,
          String(mobileActivityPanelVwRef.current),
        );
      } catch {
        /* ignore */
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    const onUp = (pe: PointerEvent) => {
      if (pe.pointerId !== pointerId) return;
      endDrag();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  const terminalResizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const clampTerminalH = useCallback((h: number) => {
    const min = 160;
    // Keep at least 160px for the content above the drawer.
    const max = Math.max(min, window.innerHeight - 10 /* topbar */ - 32 /* tabs */ - 84 /* status/mobile */ - 160);
    return Math.max(min, Math.min(max, Math.round(h)));
  }, []);

  const beginTerminalResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture?.(e.pointerId);
    handle.dataset.dragging = 'true';
    document.body.classList.add('is-terminal-resizing');
    terminalResizeRef.current = { startY: e.clientY, startH: terminalDrawerH };

    const onMove = (pe: PointerEvent) => {
      const s = terminalResizeRef.current;
      if (!s) return;
      const next = clampTerminalH(s.startH + (s.startY - pe.clientY));
      setTerminalDrawerH(next);
      window.dispatchEvent(new Event('resize'));
    };
    const onUp = () => {
      terminalResizeRef.current = null;
      handle.dataset.dragging = 'false';
      document.body.classList.remove('is-terminal-resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
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
  const pendingAgentChatComposeRef = useRef<AgentChatComposeDetail | null>(null);

  const dispatchAgentChatCompose = useCallback((detail: AgentChatComposeDetail) => {
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_COMPOSE, { detail }));
    });
  }, []);

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

  useEffect(() => {
    const onComposeRequest = (e: Event) => {
      const detail = (e as CustomEvent<AgentChatComposeDetail>).detail;
      if (!detail?.message) return;
      if (detail.ensureAgentPanel === false) return;
      if (agentPosition !== 'off') return;
      pendingAgentChatComposeRef.current = detail;
      setAgentPosition('right');
    };
    window.addEventListener(IAM_AGENT_CHAT_COMPOSE, onComposeRequest);
    return () => window.removeEventListener(IAM_AGENT_CHAT_COMPOSE, onComposeRequest);
  }, [agentPosition]);

  useEffect(() => {
    const pending = pendingAgentChatComposeRef.current;
    if (!pending || agentPosition === 'off') return;
    pendingAgentChatComposeRef.current = null;
    dispatchAgentChatCompose(pending);
  }, [agentPosition, dispatchAgentChatCompose]);

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

  const urlAgentSessionId = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get('session')?.trim() || '';
    } catch {
      return '';
    }
  }, [location.search]);

  const mobileHamburgerConversationBack =
    isNarrowViewport &&
    agentPosition !== 'off' &&
    !!(activeAgentConversationId?.trim() || urlAgentSessionId);

  const narrowBackToAgentHome = useCallback(() => {
    try {
      localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id: null } }));
    if (urlAgentSessionId && isAgentShellPath(location.pathname)) {
      navigate(AGENT_HOME_PATH, { replace: true });
    }
  }, [location.pathname, navigate, urlAgentSessionId]);

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
   * Mobile: dismiss fullscreen agent chat so Monaco/workbench is visible.
   * Keeps the activity drawer open so explorer + editor can sit side-by-side.
   */
  const revealMainWorkspaceIfNarrow = useCallback(() => {
    if (!isNarrowViewport) return;
    if (agentPosition !== 'off') setAgentPosition('off');
  }, [isNarrowViewport, agentPosition]);

  const openInMonacoFromChat = useCallback(
    (file: Pick<ActiveFile, 'name' | 'content'> & Partial<ActiveFile>) => {
      const opened = prepareActiveFileForEditor({
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
      });
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
      openFile(prepareActiveFileForEditor(file));
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
        const safeUrl = sanitizeBrowserNavigateUrl(d?.url);
        setBrowserPreviewSource('agent');
        if (safeUrl) {
          setBrowserAddressDisplay(null);
          setBrowserTabTitle(null);
          setBrowserUrl(safeUrl);
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

  const toggleExplorer = useCallback(() => {
    if (!isAgentHomePath(location.pathname)) {
      navigate(AGENT_HOME_PATH);
      setActiveActivity('files');
      return;
    }
    setActiveActivity((prev) => (prev === 'files' ? null : 'files'));
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!isAgentShellPath(location.pathname)) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'b') return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      toggleExplorer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [location.pathname, toggleExplorer]);

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
      if (hr.ok) setHealthOk(hj.status === 'ok' || hr.ok);
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

  const applyGitStatusPayload = useCallback(
    (gitData: { branch?: string; repo?: string; repo_full_name?: string }) => {
      const repo = gitData.repo_full_name
        ? String(gitData.repo_full_name)
        : gitData.repo
          ? String(gitData.repo)
          : '';
      const branchName = gitData.branch ? String(gitData.branch) : '';
      if (branchName) setGitBranch(branchName);
    },
    [],
  );

  const fetchSecurityShieldPulse = useCallback(async (notify = false) => {
    const cred = { credentials: 'same-origin' as const };
    try {
      const qs = notify ? '?notify=1' : '';
      const res = await fetch(`/api/security/shield-pulse${qs}`, cred);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.alert === true) {
        setSecurityShieldAlert({
          message: String(data.message || 'Security finding detected — view details'),
          details_url: String(data.details_url || '/dashboard/settings/security'),
          open_findings_count: Number(data.open_findings_count) || 0,
          audit_events_24h: Number(data.audit_events_24h) || 0,
        });
        if (notify) setSecurityBannerDismissed(false);
      } else {
        setSecurityShieldAlert(null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const applyProblemsPayload = useCallback((probData: Record<string, unknown>) => {
    const rows = mapProblemsApiPayload(probData as Parameters<typeof mapProblemsApiPayload>[0]);
    setSystemProblems(rows);
    const { errors, warnings } = countProblemSeverities(rows);
    setErrorCount(errors);
    setWarningCount(warnings);
  }, []);

  const fetchGitAndProblems = useCallback(async () => {
    const cred = { credentials: 'same-origin' as const };
    const ws = authWorkspaceId?.trim();
    const gitStatusUrl = ws
      ? `/api/agent/git/status?workspace_id=${encodeURIComponent(ws)}`
      : '/api/agent/git/status';
    const cached = readIamGitStatusCache();
    if (isIamGitStatusCacheFresh(cached)) {
      applyGitStatusPayload(cached);
    } else {
      try {
        const gitRes = await fetch(gitStatusUrl, cred);
        const gitData = await gitRes.json().catch(() => ({}));
        if (gitRes.ok) {
          writeIamGitStatusCache({
            branch: gitData.branch ? String(gitData.branch) : undefined,
            repo: gitData.repo ? String(gitData.repo) : undefined,
            repo_full_name: gitData.repo_full_name ? String(gitData.repo_full_name) : undefined,
          });
          applyGitStatusPayload(gitData);
        }
      } catch {
        /* ignore */
      }
    }

    try {
      const probRes = await fetch('/api/agent/problems', cred);
      const probData = await probRes.json().catch(() => ({}));
      if (probRes.ok && probData && typeof probData === 'object') {
        applyProblemsPayload(probData as Record<string, unknown>);
      }
    } catch {
      /* ignore */
    }
  }, [applyGitStatusPayload, applyProblemsPayload, authWorkspaceId]);

  const fetchTunnelStatusOnly = useCallback(async () => {
    const cred = { credentials: 'same-origin' as const };
    try {
      const tr = await fetch('/api/tunnel/status', cred);
      const tj = await tr.json().catch(() => ({}));
      if (tr.ok && typeof tj.healthy === 'boolean') {
        setTunnelHealthy(tj.healthy);
        const st = tj.status != null ? String(tj.status) : '';
        setTunnelLabel(st === 'connected' ? 'connected' : st === 'disconnected' ? 'disconnected' : st || null);
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
      const ter = await fetch('/api/agent/pty/health', cred);
      const tej = await ter.json().catch(() => ({}));
      if (ter.ok) {
        setTerminalOk(tej.status === 'connected');
      }
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

  useEffect(() => {
    setSystemProblems([]);
    setErrorCount(0);
    setWarningCount(0);
    if (sessionUserId) void fetchGitAndProblems();
  }, [sessionUserId, authWorkspaceId, fetchGitAndProblems]);

  useEffect(() => {
    const onGithubRepo = () => void fetchGitAndProblems();
    window.addEventListener('iam_workspace_github_repo', onGithubRepo);
    return () => window.removeEventListener('iam_workspace_github_repo', onGithubRepo);
  }, [fetchGitAndProblems]);

  const fetchLiveStatus = useCallback(async () => {
    const cred = { credentials: 'same-origin' as const };

    void fetchHealth();

    const ws = authWorkspaceId?.trim();
    const gitStatusUrl = ws
      ? `/api/agent/git/status?workspace_id=${encodeURIComponent(ws)}`
      : '/api/agent/git/status';
    const cachedGit = readIamGitStatusCache();
    if (isIamGitStatusCacheFresh(cachedGit)) {
      applyGitStatusPayload(cachedGit);
    } else {
      try {
        const gitRes = await fetch(gitStatusUrl, cred);
        const gitData = await gitRes.json().catch(() => ({}));
        if (gitRes.ok) {
          writeIamGitStatusCache({
            branch: gitData.branch ? String(gitData.branch) : undefined,
            repo: gitData.repo ? String(gitData.repo) : undefined,
            repo_full_name: gitData.repo_full_name ? String(gitData.repo_full_name) : undefined,
          });
          applyGitStatusPayload(gitData);
        }
      } catch {
        /* ignore */
      }
    }

    try {
      const probRes = await fetch('/api/agent/problems', cred);
      const probData = await probRes.json().catch(() => ({}));
      if (probRes.ok && probData && typeof probData === 'object') {
        applyProblemsPayload(probData as Record<string, unknown>);
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
  }, [fetchHealth, fetchTunnelStatusOnly, fetchTerminalConfigOnly, fetchDeploymentsPoll, fetchTelemetryPoll, applyGitStatusPayload, applyProblemsPayload, authWorkspaceId]);

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
      void fetchSecurityShieldPulse(true);
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
    fetchSecurityShieldPulse,
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

  /** Mobile bottom Chat tab: open agent home + chat overlay (not only toggle panel on other routes). */
  const onMobileBottomChatTab = useCallback(() => {
    if (!isNarrowViewport) {
      onChatLayoutToggle();
      return;
    }
    if (activeActivity) setActiveActivity(null);
    if (!isAgentShellPath(location.pathname)) {
      navigate(AGENT_HOME_PATH);
      setAgentPosition((p) => (p === 'off' ? 'right' : p));
      return;
    }
    onChatLayoutToggle();
  }, [
    isNarrowViewport,
    activeActivity,
    location.pathname,
    navigate,
    onChatLayoutToggle,
  ]);

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
    (event: {
      type: 'browser_navigate';
      url: string;
      automation?: boolean;
      agent_live?: boolean;
      live_view_url?: string;
      session_id?: string;
      screenshot_url?: string;
      page_text?: string;
      title?: string;
    }) => {
      if (event.type !== 'browser_navigate' || !event.url?.trim()) return;
      const url = sanitizeBrowserNavigateUrl(event.url);
      if (!url) return;
      if (/\/api\/r2\/file\b/i.test(url)) {
        return;
      }
      const automation = event.automation === true;
      const agentLive = event.agent_live === true || (automation && !event.screenshot_url);
      window.dispatchEvent(
        new CustomEvent('iam:agent-open-surface', {
          detail: { surface: 'browser', url, automation, agent_live: agentLive },
        }),
      );
      window.dispatchEvent(
        new CustomEvent('iam-browser-navigate', {
          detail: {
            url,
            automation,
            agent_live: agentLive,
            live_view_url: event.live_view_url,
            session_id: event.session_id,
            ...(event.screenshot_url ? { screenshot_url: event.screenshot_url } : {}),
            page_text: event.page_text,
            title: event.title,
          },
        }),
      );
      revealMainWorkspaceIfNarrow();
      setBrowserPreviewSource('agent');
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

  useEffect(() => {
    if (location.pathname !== '/dashboard/meet') return;
    setOpenTabs((prev) => prev.filter((t) => t !== 'excalidraw'));
    setActiveTab((cur) => (cur === 'excalidraw' ? 'Workspace' : cur));
  }, [location.pathname]);

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
    (
      url: string,
      opts?: {
        addressDisplay?: string | null;
        tabTitle?: string | null;
        previewSource?: 'editor' | 'agent';
      },
    ) => {
      if (htmlPreviewBlobRef.current && !url.startsWith('blob:')) {
        URL.revokeObjectURL(htmlPreviewBlobRef.current);
        htmlPreviewBlobRef.current = null;
      }
      setBrowserPreviewSource(opts?.previewSource ?? 'agent');
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

  const closeEditorPreview = useCallback(() => {
    setEditorPreviewOpen(false);
    setEditorPreviewSrcDoc(null);
    setEditorPreviewUrl(null);
    setEditorPreviewLoading(false);
    setEditorPreviewStatus(null);
  }, []);

  /** Open inline preview pane — srcDoc or PTY dev server. Never MYBROWSER. */
  const openEditorPreview = useCallback(() => {
    if (!activeFile?.content) return;
    const name = activeFile.name || '';
    if (!isRenderablePreviewFilename(name)) return;

    const bytes = new TextEncoder().encode(activeFile.content).length;
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const mode = resolvePreviewMode({ fileName: name, workspace: ideWorkspace, bytes });

    setEditorPreviewOpen(true);
    setOpenTabs((prev) => (prev.includes('code') ? prev : [...prev, 'code']));
    setActiveTab('code');

    if (mode === 'srcdoc') {
      if (ext === 'svg' && !activeFile.content.trim()) {
        setToastMsg('SVG is empty — nothing to preview.');
        return;
      }
      if (bytes >= PREVIEW_WARN_BYTES && (ext === 'html' || ext === 'htm' || ext === 'md')) {
        setToastMsg(`Large file (${(bytes / 1e6).toFixed(1)} MB) — preview may be slow.`);
      }
      const hasRelativeAssets =
        (ext === 'html' || ext === 'htm') &&
        (/<script[^>]+src=["'](?!https?:\/\/|\/\/|data:|blob:)[^"']+["']/i.test(activeFile.content) ||
          /<link[^>]+href=["'](?!https?:\/\/|\/\/|data:|blob:)[^"']*\.(?:css|js)["']/i.test(
            activeFile.content,
          ));
      setEditorPreviewMode('srcdoc');
      setEditorPreviewSrcDoc(buildPreviewSrcDoc(name, activeFile.content));
      setEditorPreviewUrl(null);
      setEditorPreviewLoading(false);
      setEditorPreviewStatus(
        hasRelativeAssets
          ? 'Relative assets may not resolve in inline preview — use a dev server for full fidelity.'
          : null,
      );
      return;
    }

    setEditorPreviewMode('devserver');
    setEditorPreviewSrcDoc(null);
    void (async () => {
      if (devServer?.url) {
        const ok = await probeDevServerUrl(devServer.url);
        if (ok) {
          setEditorPreviewUrl(devServer.url);
          setEditorPreviewLoading(false);
          setEditorPreviewStatus('Using running dev server');
          return;
        }
      }
      setEditorPreviewLoading(true);
      setEditorPreviewStatus('Starting dev server in terminal…');
      const cmd =
        ext === 'jsx' || ext === 'tsx' || ext === 'vue' || ext === 'js'
          ? 'npm run dev'
          : 'npx --yes serve . -l 3000';
      runInTerminal(cmd);
    })();
  }, [activeFile, ideWorkspace, devServer, runInTerminal]);

  const handleTerminalOutputLine = useCallback((line: string) => {
    setShellOutputLines((prev) => [...prev.slice(-250), line]);
    const hit = parseDevServerFromTerminalLine(line);
    if (!hit) return;
    const next: DevServerState = { port: hit.port, url: hit.url, updatedAt: Date.now() };
    setDevServer(next);
    if (editorPreviewLoadingRef.current) {
      setEditorPreviewUrl(hit.url);
      setEditorPreviewLoading(false);
      setEditorPreviewStatus(null);
    }
  }, []);

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

  /** Mobile: only fullscreen agent chat hides the editor; activity drawer is a side panel. */
  const narrowBlocksCenter = isNarrowViewport && agentPosition !== 'off';
  /** Explorer drawer has its own close control — no floating back pill while files panel is open. */
  const narrowNeedsBack =
    isNarrowViewport &&
    (agentPosition !== 'off' || (!!activeActivity && activeActivity !== 'files'));

  const mobileBackLabel = useMemo(
    () =>
      narrowNeedsBack
        ? mobileNavBackLabel({
            agentChatOpen: agentPosition !== 'off',
            activeActivity,
            pathname: location.pathname,
          })
        : null,
    [narrowNeedsBack, agentPosition, activeActivity, location.pathname],
  );

  const statusIndentLabel = useMemo(
    () => `${editorMeta.insertSpaces ? 'Spaces' : 'Tabs'}: ${editorMeta.tabSize}`,
    [editorMeta.insertSpaces, editorMeta.tabSize],
  );

  return (
    <div className="w-full h-[100dvh] bg-[var(--dashboard-canvas)] overflow-hidden text-[var(--dashboard-text)] font-sans flex flex-col">
      <div
        className="iam-agent-browser-live-vignette"
        data-active={agentBrowserPresenceActive ? 'true' : 'false'}
        aria-hidden="true"
      />
      {/* 1. TOP WINDOW BAR + mobile hamburger (sticky ≤430px) */}
      <header className="shrink-0 z-[110] max-phone:sticky max-phone:top-0 bg-[var(--dashboard-panel)]">
      <div className="h-10 border-b border-[var(--dashboard-border)] flex items-center justify-between px-3 overflow-visible relative">
          <div className="flex items-center gap-1 opacity-80 pl-1 shrink-0 min-w-0">
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
                className="iam-topbar-desktop-only max-phone:hidden shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors ml-1"
                title={sidebarRailExpanded ? 'Collapse navigation' : 'Expand navigation'}
                aria-expanded={sidebarRailExpanded}
              >
                {sidebarRailExpanded ? <PanelLeftClose size={18} strokeWidth={1.75} /> : <PanelLeft size={18} strokeWidth={1.75} />}
              </button>
              {isAgentShellPath(location.pathname) && (
                <button
                  type="button"
                  onClick={toggleExplorer}
                  className={`iam-topbar-desktop-only max-phone:hidden shrink-0 p-1.5 rounded-md transition-colors ml-0.5 ${
                    activeActivity === 'files'
                      ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                  }`}
                  title={activeActivity === 'files' ? 'Close Explorer (⌘B)' : 'Open Explorer (⌘B)'}
                  aria-pressed={activeActivity === 'files'}
                >
                  <Files size={18} strokeWidth={1.75} />
                </button>
              )}
          </div>

          {/* Unified search (Cmd+K) — desktop center; mobile lives in right cluster */}
          <div className="iam-topbar-desktop-only flex-1 flex justify-center items-center min-w-0 px-2 gap-2 overflow-visible max-phone:hidden">
              <UnifiedSearchBar
                workspaceLabel={workspaceDisplayLine}
                onWorkspacePickerClick={() => setWorkspaceLauncherOpen(true)}
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

          {/* Right layout cluster — mobile: Search icon + More; desktop adds terminal/globe/etc. */}
          <div className="flex gap-0.5 items-center mr-1 shrink-0 max-phone:ml-auto">
              <div className="iam-topbar-mobile-only hidden max-phone:block shrink-0">
                <UnifiedSearchBar
                  workspaceLabel={workspaceDisplayLine}
                  hideWorkspaceSegment
                  mobileToolbar
                  onWorkspacePickerClick={() => setWorkspaceLauncherOpen(true)}
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
              <button
                  type="button"
                  title="More tools (mobile)"
                  className="iam-topbar-mobile-block hidden max-phone:block p-1.5 rounded transition-colors text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]"
                  onClick={() => setMobileMoreOpen(true)}
              >
                  <MoreHorizontal size={15} strokeWidth={1.75} />
              </button>
              <button
                  type="button"
                  title="Open Browser"
                  className="iam-topbar-desktop-only max-phone:hidden p-1.5 rounded transition-colors text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]"
                  onClick={() => {
                    openTab('browser');
                  }}
              >
                  <Globe size={15} strokeWidth={1.75} />
              </button>
              <button
                  type="button"
                  title="Toggle agent panel"
                  className={`iam-topbar-desktop-only max-phone:hidden p-1.5 rounded transition-colors ${agentPosition !== 'off' ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
                  onClick={onChatLayoutToggle}
              >
                  {agentPosition === 'left' ? <PanelLeftClose size={15} strokeWidth={1.75} /> : <PanelRightClose size={15} strokeWidth={1.75} />}
              </button>



              <button
                  type="button"
                  title="Terminal (Cmd+J)"
                  className={`iam-topbar-desktop-only max-phone:hidden p-1.5 rounded transition-colors ${isTerminalOpen ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
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
                  className={`iam-topbar-desktop-only max-phone:hidden p-1.5 rounded transition-colors ${location.pathname.startsWith('/dashboard/settings') ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
                  onClick={() => navigate('/dashboard/settings/general')}
              >
                  <Settings size={15} strokeWidth={1.75} />
              </button>
              <div className="iam-topbar-desktop-only relative hidden tablet-up:block" ref={topChromeMoreRef}>
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
                          {location.pathname !== '/dashboard/meet' ? (
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
                          ) : null}
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
      </header>

      <MobileNavShell
        open={mobileNavOpen}
        onToggle={() => setMobileNavOpen((v) => !v)}
        onClose={() => setMobileNavOpen(false)}
        settingsIntegrationsActive={settingsIntegrationsActive}
        showBack={narrowNeedsBack && !mobileHamburgerConversationBack}
        backLabel={mobileBackLabel}
        onBack={narrowBackToCenter}
        hamburgerBackMode={mobileHamburgerConversationBack}
        onHamburgerBack={narrowBackToAgentHome}
      />

      {securityShieldAlert && !securityBannerDismissed && (
        <SecurityShieldBanner
          message={securityShieldAlert.message}
          detailsUrl={securityShieldAlert.details_url}
          openFindingsCount={securityShieldAlert.open_findings_count}
          auditEvents24h={securityShieldAlert.audit_events_24h}
          onDismiss={() => setSecurityBannerDismissed(true)}
        />
      )}

      <div className="flex flex-1 overflow-hidden max-phone:pb-[52px]">
          {/* 2. ACTIVITY BAR (Extreme Left) — hidden ≤430px; use bottom tab bar + More */}
          {/* Activity bar: icon rail (width toggled via ☰ — localStorage iam_sidebar_expanded) */}
          <div
            className="hidden tablet-up:flex flex-col py-3 gap-1 px-1 bg-[var(--dashboard-panel)] border-r border-[var(--dashboard-border)] shrink-0 z-50 overflow-x-hidden overflow-y-auto transition-[width] duration-200 ease-in-out"
            style={{ width: sidebarRailExpanded ? 180 : 48 }}
          >
              <DashboardActivityNav
                expanded={sidebarRailExpanded}
                settingsIntegrationsActive={settingsIntegrationsActive}
              />
          </div>

          {/* Optional Left Agent Panel */}
          {agentPosition === 'left' && (
              <>
                <div 
                    className={`bg-[var(--dashboard-panel)] flex flex-col shrink-0 transition-opacity relative group z-30 opacity-100 max-phone:fixed max-phone:inset-0 max-phone:z-[45] max-phone:w-full max-phone:max-w-none max-phone:shrink ${
                      activeActivity ? 'max-phone:hidden' : ''
                    }`}
                    style={
                      isNarrowViewport
                        ? { borderRight: '1px solid var(--dashboard-border)' }
                        : { width: agentW, borderRight: '1px solid var(--dashboard-border)' }
                    }
                    {...(narrowNeedsBack && !activeActivity ? mobileEdgeSwipeHandlers : {})}
                >
                    <div className="h-10 max-phone:hidden border-b border-[var(--dashboard-border)] flex items-center px-4 font-semibold text-[11px] tracking-widest uppercase text-[var(--text-muted)] shrink-0">{PRODUCT_NAME}</div>
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
                        onOpenQuickstart={openAgentQuickstart}
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
                        activeWorkbenchTab={activeTab}
                        browserUrl={browserUrl}
                        openFilePaths={agentWorkbenchOpenFiles}
                        activePlanId={activePlanIdForChat}
                        onActivePlanChange={handleActivePlanChange}
                    />
                    </div>
                </div>
                {/* Grab Bar — wide hit target; stroke is 1px inside */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  title="Drag to resize Agent Sam panel"
                  aria-label="Resize Agent Sam panel"
                  className="max-phone:hidden shrink-0 z-50 flex justify-center cursor-col-resize touch-none select-none group relative"
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
              className={`transition-all duration-75 shrink-0 bg-[var(--dashboard-panel)] flex flex-col z-40 overflow-hidden shadow-2xl tablet-up:shadow-none hover:border-[var(--solar-cyan)] relative group
              ${
                activeActivity
                  ? 'tablet-up:relative tablet-up:left-0 border-r border-[var(--dashboard-border)] opacity-100 pointer-events-auto max-phone:iam-mobile-activity-panel'
                  : 'border-none opacity-0 pointer-events-none max-phone:iam-mobile-activity-panel'
              }`}
              data-open={activeActivity ? 'true' : 'false'}
              style={
                isNarrowViewport
                  ? activeActivity
                    ? { width: `${mobileActivityPanelVw}vw` }
                    : { width: 0 }
                  : { width: activeActivity ? sidebarW : 0 }
              }
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
                          onClose={() => setActiveActivity(null)}
                      />
                  ) : activeActivity === 'mcps' ? (
                      <MCPPanel />
                  ) : activeActivity === 'actions' ? (
                      <GitHubExplorer
                          workspace_id={authWorkspaceId}
                          expandRepoFullName={githubExpandRepo}
                          onExpandRepoConsumed={consumeGithubExpandRepo}
                          onOpenInEditor={openInEditorFromExplorer}
                      />
                  ) : activeActivity === 'drive' ? (
                      <GoogleDriveExplorer
                          onOpenInEditor={openInEditorFromExplorer}
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

          {/* Sidebar Grab Bar — desktop */}
          {activeActivity && (
            <div
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize · double-click to close"
              aria-label="Resize activity panel"
              className="hidden tablet-up:flex shrink-0 z-50 group relative cursor-col-resize touch-none select-none justify-center"
              style={{ width: ACTIVITY_SIDEBAR_GRAB_PX }}
              onPointerDown={(e) => beginPanelResize('sidebar', e)}
              onDoubleClick={() => setActiveActivity(null)}
            >
              <span
                className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--dashboard-border)] group-hover:bg-[var(--solar-cyan)] group-active:bg-[var(--solar-cyan)]"
                aria-hidden
              />
            </div>
          )}
          {/* Mobile activity drawer edge — drag width (32–85vw, default 50) */}
          {activeActivity && isNarrowViewport && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize explorer panel"
              title="Drag to resize explorer"
              className="iam-mobile-activity-resizer hidden max-phone:block"
              style={{ left: `${mobileActivityPanelVw}vw` }}
              onPointerDown={beginMobileActivityPanelResize}
            />
          )}

          {/* 4. MAIN EDITOR AREA */}
          <main 
              className={`flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--dashboard-canvas)] relative max-phone:overflow-x-hidden ${narrowBlocksCenter ? 'max-phone:hidden' : ''}`}
              onDrop={handleMainFileDrop}
              onDragOver={handleMainDragOver}
          >
              {isAgentHomePath(location.pathname) && !activeActivity && (
                <button
                  type="button"
                  className="hidden tablet-up:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 flex-col items-center gap-1 py-3 px-1 rounded-r-md border border-l-0 border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/40 shadow-md transition-colors"
                  title="Show Explorer (⌘B)"
                  aria-label="Show Explorer"
                  onClick={() => setActiveActivity('files')}
                >
                  <Files size={16} strokeWidth={1.75} />
                </button>
              )}
              {/* Dashboard page routes — non-agent pages render here */}
              {!isAgentShellPath(location.pathname) ? (
                <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-[var(--dashboard-canvas)] flex flex-col">
                  <Suspense fallback={<DashboardRoutesFallback />}>
                    <div className="flex flex-1 flex-col min-h-0 min-w-0">
                    <Routes>
                      <Route path="/dashboard/calendar" element={<CalendarPage />} />
                      <Route path="/dashboard/overview" element={<OverviewPage />} />
                      <Route
                        path="/dashboard/finance"
                        element={
                          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-y-contain">
                            <FinanceDashboard />
                          </div>
                        }
                      />
                      <Route path="/dashboard/library" element={<LibraryPage />} />
                      <Route path="/dashboard/projects" element={<ProjectManagement />} />
                      <Route path="/dashboard/tasks" element={<TasksPage />} />
                      <Route
                        path="/dashboard/launch-desk"
                        element={
                          <div className="flex-1 min-h-0 min-w-0 overflow-auto">
                            <LaunchDeskPage />
                          </div>
                        }
                      />
                      <Route path="/dashboard/analytics" element={<AnalyticsPage />} />
                      <Route path="/dashboard/analytics/*" element={<Navigate to="/dashboard/analytics" replace />} />
                      <Route path="/dashboard/health" element={<Navigate to="/dashboard/analytics" replace />} />
                      <Route path="/dashboard/health/:tab" element={<RedirectHealthToAnalytics />} />
                      <Route path="/dashboard/health/*" element={<Navigate to="/dashboard/analytics" replace />} />
                      <Route path="/dashboard/learn" element={<LearnPage />} />
                      <Route path="/dashboard/workflows" element={<WorkflowsPage />} />
                      <Route
                        path="/dashboard/database"
                        element={
                          <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
                            <DatabasePage />
                          </div>
                        }
                      />
                      <Route
                        path="/dashboard/docs"
                        element={
                          <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
                            <DocsPage />
                          </div>
                        }
                      />
                      <Route path="/dashboard/mcp/:agentSlug?" element={<McpPage />} />
                      <Route
                        path="/dashboard/integrations"
                        element={
                          <Navigate to="/dashboard/settings/integrations" replace />
                        }
                      />
                      <Route
                        path="/dashboard/designstudio"
                        element={
                          <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
                            <DesignStudioPage />
                          </div>
                        }
                      />
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
                    </div>
                  </Suspense>
                </div>
              ) : (
              <>
              {/* Editor Tabs — lazy, closeable */}
              <div className="h-10 flex items-center shrink-0 pl-0 relative z-10 overflow-x-auto overflow-y-hidden no-scrollbar">
                  {openTabs.includes('Workspace') && (
                      <Tab
                          title="Workspace"
                          icon={<FolderCode size={13} className="text-[var(--solar-cyan)]"/>}
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
                          icon={
                            activeFile ? (
                              <SetiFileIcon filename={activeFile.name} size={14} />
                            ) : (
                              <FileCode2 size={14} className="text-[var(--solar-cyan)] opacity-60" />
                            )
                          }
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
                              <span className="sr-only">Preview file</span>
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

                  {/* Tab row tools — mobile: globe + terminal; desktop: + Browser text */}
                  <div className="ml-auto flex items-center gap-0.5 pr-2 shrink-0">
                      {!openTabs.includes('browser') && (
                        <>
                          <button
                            type="button"
                            title="Open Browser"
                            className="hidden max-phone:block p-1.5 rounded transition-colors text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]"
                            onClick={() => openTab('browser')}
                          >
                            <Globe size={15} strokeWidth={1.75} />
                          </button>
                          <span className="max-phone:hidden">
                            <QuickOpen label="Browser" onClick={() => openTab('browser')} />
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        title="Terminal (Cmd+J)"
                        className={`hidden max-phone:block p-1.5 rounded transition-colors ${isTerminalOpen ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
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
                            sessionUserId={sessionUserId}
                          />
                      </div>
                  )}

                  {activeTab === 'code' && (
                      <div className="absolute inset-0 z-10 flex min-h-0 min-w-0">
                          <div className={`flex flex-col min-h-0 min-w-0 ${editorPreviewOpen ? 'w-1/2' : 'w-full'}`}>
                            <Suspense
                              fallback={
                                <div className="flex h-full items-center justify-center text-[12px] text-[var(--text-muted)]">
                                  Loading editor…
                                </div>
                              }
                            >
                              <MonacoEditorView
                                onSave={handleSaveFile}
                                onCursorPositionChange={handleEditorCursorPosition}
                                onEditorModelMeta={setEditorMeta}
                                workspaceContext={agentWorkspaceContext}
                              />
                            </Suspense>
                          </div>
                          {editorPreviewOpen && activeFile ? (
                            <div className="w-1/2 min-w-0 min-h-0">
                              <EditorPreviewPane
                                fileName={activeFile.name}
                                mode={editorPreviewMode}
                                srcDoc={editorPreviewSrcDoc}
                                url={editorPreviewUrl}
                                loading={editorPreviewLoading}
                                statusMessage={editorPreviewStatus}
                                onClose={closeEditorPreview}
                                onRefresh={
                                  editorPreviewMode === 'devserver'
                                    ? () => {
                                        if (editorPreviewUrl) {
                                          setEditorPreviewUrl(`${editorPreviewUrl.split('?')[0]}?t=${Date.now()}`);
                                        }
                                      }
                                    : undefined
                                }
                              />
                            </div>
                          ) : null}
                      </div>
                  )}
                  {activeTab === 'browser' && (
                      <div className="absolute inset-0 z-10 overflow-hidden">
                          <BrowserView
                            url={browserUrl}
                            addressDisplay={browserAddressDisplay}
                            previewSource={browserPreviewSource}
                            onUrlCommitted={(url) => {
                              const n = url.trim();
                              if (!n || n === browserUrl) return;
                              setBrowserAddressDisplay(null);
                              setBrowserTabTitle(null);
                              setBrowserUrl(n);
                              setBrowserPreviewSource('agent');
                            }}
                            agentRunId={browserPreviewSource === 'editor' ? null : activeAgentRunId}
                            workspaceContext={agentWorkspaceContext}
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
                          onProblemsTabOpen={() => void fetchGitAndProblems()}
                          iamOrigin={typeof window !== 'undefined' ? window.location.origin : 'https://inneranimalmedia.com'}
                          workspaceLabel={workspaceDisplayLine}
                          workspaceId={authWorkspaceId || undefined}
                          productLabel={PRODUCT_NAME}
                          layout="page"
                          outputLines={shellOutputLines}
                          onOutputLine={handleTerminalOutputLine}
                          workspaceContext={agentWorkspaceContext}
                      />
                  )}
              </div>
          </>
              )}

              {/* Global terminal drawer — non-agent routes only (/dashboard/agent uses in-layout XTermShell) */}
              {!isAgentShellPath(location.pathname) && (
              <div
                className={isNarrowViewport ? 'iam-terminal-drawer-host' : undefined}
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
                  maxWidth: '100%',
                  overflowX: 'hidden',
                }}
              >
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Drag to resize terminal"
                  title="Drag to resize terminal"
                  className="iam-terminal-drawer-resizer"
                  onPointerDown={beginTerminalResize}
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
                    onOutputLine={handleTerminalOutputLine}
                    problems={systemProblems ?? []}
                    onProblemsTabOpen={() => void fetchGitAndProblems()}
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
                  className="max-phone:hidden shrink-0 z-50 group relative flex justify-center cursor-col-resize touch-none select-none"
                  style={{ width: AGENT_RESIZER_HIT_PX }}
                  onPointerDown={(e) => beginPanelResize('agent', e)}
                >
                  <span
                    className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--dashboard-border)] group-hover:bg-[var(--solar-cyan)] group-active:bg-[var(--solar-cyan)]"
                    aria-hidden
                  />
                </div>
                <div 
                    className={`bg-[var(--dashboard-panel)] flex flex-col shrink-0 transition-opacity z-30 relative group opacity-100 max-phone:fixed max-phone:inset-0 max-phone:z-[45] max-phone:w-full max-phone:max-w-none max-phone:shrink ${
                      isNarrowViewport && activeActivity ? 'max-phone:hidden' : ''
                    }`}
                    style={
                      isNarrowViewport
                        ? { borderLeft: '1px solid var(--dashboard-border)' }
                        : { width: agentW, borderLeft: '1px solid var(--dashboard-border)' }
                    }
                    {...(narrowNeedsBack && !activeActivity ? mobileEdgeSwipeHandlers : {})}
                >
                    <div className="h-10 max-phone:hidden border-b border-[var(--dashboard-border)] flex items-center px-4 font-semibold text-[11px] tracking-widest uppercase text-[var(--text-muted)] shrink-0">{PRODUCT_NAME}</div>
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
                            onOpenQuickstart={openAgentQuickstart}
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
                            activeWorkbenchTab={activeTab}
                            browserUrl={browserUrl}
                            openFilePaths={agentWorkbenchOpenFiles}
                            activePlanId={activePlanIdForChat}
                            onActivePlanChange={handleActivePlanChange}
                         />
                    </div>
                </div>
              </>
          )}
      </div>
      {/* 8. STATUS BAR (FOOTER) */}
      {toastMsg && (
        <div
          className="fixed bottom-16 left-1/2 z-[200] -translate-x-1/2 px-4 py-2 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-canvas)] text-[11px] text-[var(--text-main)] shadow-lg max-w-md text-center max-phone:[bottom:calc(56px+1.5rem+env(safe-area-inset-bottom,0px)+8px)]"
          role="status"
        >
          {toastMsg}
        </div>
      )}

      {/* Mobile (≤430px): bottom tab bar above StatusBar */}
      <nav
        className="hidden max-phone:flex fixed inset-x-0 z-[90] items-stretch justify-around gap-0 border-t border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/95 backdrop-blur-sm"
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        aria-label="Primary"
      >
        <button
          type="button"
          className={`flex flex-1 flex-col items-center justify-center min-h-[44px] gap-0.5 px-0.5 text-[10px] font-medium leading-tight ${agentPosition !== 'off' && !activeActivity ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'}`}
          onClick={onMobileBottomChatTab}
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
          className={`flex flex-1 flex-col items-center justify-center min-h-[44px] gap-0.5 px-0.5 text-[10px] font-medium leading-tight ${activeActivity === 'files' ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'}`}
          onClick={() => toggleActivity('files')}
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
            className="hidden max-phone:block fixed inset-0 z-[95] bg-[var(--text-main)]/25 backdrop-blur-[2px]"
            aria-label="Close more tools"
            onClick={() => setMobileMoreOpen(false)}
          />
          <div
            className="hidden max-phone:flex fixed left-2 right-2 z-[96] max-h-[min(72vh,calc(100dvh-10rem))] flex-col rounded-t-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] shadow-2xl overflow-hidden"
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
              {/*
                MOBILE SEARCH AUDIT (Round 4 — do not remove until approved):
                • Top-bar search icon → UnifiedSearchBar Cmd+K palette (commands, R2, D1, files, recent via /api/unified-search/recent).
                • More → "Search" → toggleActivity('search') → KnowledgeSearchPanel (RAG /api/rag/query + agent session threads).
                Different components and data sources — not duplicate. If we label later: "Search files & commands" vs "Knowledge & chats".
              */}
              <MobileMoreRow icon={Search} label="Search" onClick={() => { setMobileMoreOpen(false); toggleActivity('search'); }} />
              <MobileMoreRow icon={GitBranch} label="Source Control" onClick={() => { setMobileMoreOpen(false); toggleActivity('git'); }} />
              <MobileMoreRow icon={Bug} label="Run & Debug" onClick={() => { setMobileMoreOpen(false); toggleActivity('debug'); }} />
              <MobileMoreRow icon={Layers} label="Tools & MCP" onClick={() => { setMobileMoreOpen(false); toggleActivity('mcps'); }} />
              <MobileMoreRow icon={Cloud} label="Cloud Sync" onClick={() => { setMobileMoreOpen(false); toggleActivity('drive'); }} />
              <MobileMoreRow icon={Monitor} label="Engine View" onClick={() => { setMobileMoreOpen(false); navigate('/dashboard/designstudio'); }} />
              <MobileMoreRow icon={Rocket} label="Launch Desk" onClick={() => { setMobileMoreOpen(false); navigate('/dashboard/launch-desk'); }} />
            </div>
          </div>
        </>
      )}

      <StatusBar 
        branch={gitBranch}
        gitHash={gitHash}
        workspace={(workspaceDisplayName?.trim() || authWorkspaceId?.trim() || '')}
        workspaceMenuItems={statusBarWorkspaceItems.length > 0 ? statusBarWorkspaceItems : undefined}
        activeWorkspaceId={authWorkspaceId}
        onWorkspaceMenuSelect={handleStatusBarWorkspacePick}
        onBranchSelect={handleStatusBarBranchSelect}
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
          setActiveActivity('git');
          if (!isAgentShellPath(location.pathname)) navigate(AGENT_HOME_PATH);
        }}
        onWorkspaceClick={() => setWorkspaceLauncherOpen(true)}
        onRefreshGitStatus={() => void fetchGitAndProblems()}
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
          onWorkspaceActivated={(ws) => {
            void switchWorkspace(ws.id, {
              displayName: ws.display_name,
              slug: ws.slug,
              github_repo: ws.github_repo ?? null,
              sync: false,
            });
            void refreshWorkspaces({ force: true });
          }}
          setToastMsg={setToastMsg}
          onOpenLocalFolder={() => {
            setWorkspaceLauncherOpen(false);
            setActiveActivity('files');
            setNativeFolderOpenSignal((n) => n + 1);
          }}
          onManageEnvironments={() => {
            setWorkspaceLauncherOpen(false);
            navigate('/dashboard/settings/workspace');
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
