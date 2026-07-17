
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useCallback, useMemo, Suspense, lazy } from 'react';
import { useLocation, Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import { WorkspaceDashboard } from './components/WorkspaceDashboard';
import { WorkspaceDashboardV2 } from './components/WorkspaceDashboardV2';
import { AgentQuickstartPage, type QuickstartTemplate } from './components/AgentQuickstartPage';
import {
  AGENT_HOME_PATH,
  AGENT_NEW_CHAT_PATH,
  isAgentNewChatPath,
  AGENT_EDITOR_PATH,
  AGENT_WORKSPACE_PATH,
  AGENT_SYSTEMS_PATH,
  AGENT_EXAMPLES_PATH,
  AGENT_TAB_QUERY,
  AGENT_QUICKSTART_PATH,
  agentHomeWithTab,
  agentConversationPath,
  getAgentTabFromSearch,
  isAgentAtmosphericHome,
  isAgentCenterChatHome,
  isAgentEditorPath,
  isAgentWorkspaceBrowserPath,
  resolveAgentWorkspaceTab,
  isAgentHomePath,
  isAgentQuickstartPath,
  isAgentExamplesPath,
  isAgentShellPath,
  isContextPreservingAgentRailPath,
  normalizePath,
  parseAgentConversationIdFromPath,
  type AgentHomeTab,
} from './lib/agentRoutes';
import { AgentHome } from './components/agent/AgentHome';
import { EditorWorkbenchLanes } from './components/agent/EditorWorkbenchLanes';
import type { AgentModeId } from './types/agentHomeScene';
import { resolveDashboardRouteAgentContext } from './lib/dashboardRouteContext';
import { resolveAgentSurfaceTarget } from './lib/resolveAgentSurfaceTarget';
import { SKETCH_PATH, sketchPathForSurface } from './pages/sketch/sketchRoutes';
import { BREAKPOINTS, PHONE_MQ } from './lib/breakpoints';
import { sanitizeBrowserNavigateUrl } from './lib/sanitizeBrowserUrl';
import {
  IAM_AGENT_CHAT_CONVERSATION_CHANGE,
  IAM_AGENT_CHAT_NEW_THREAD,
  IAM_AGENT_CHAT_COMPOSE,
  IAM_AGENT_CHAT_READY,
  IAM_AGENT_SYNC_CONVERSATION_URL,
  IAM_AGENT_MOBILE_CODE_FOCUS,
  IAM_ARTIFACT_OPEN_BUILDER,
  LS_AGENT_CHAT_CONVERSATION_ID,
  QUICKSTART_BATCH_LABEL,
  QUICKSTART_WORKSPACE_ID,
  type AgentChatComposeDetail,
  type ArtifactOpenBuilderDetail,
  type QuickstartThreadDetail,
} from './agentChatConstants';
import {
  IAM_AGENT_COLLAPSE_PANEL,
  IAM_AGENT_ENSURE_PANEL,
  IAM_AGENT_PANEL_CHANGED,
  IAM_AGENT_OPEN_THREAD,
  IAM_AGENT_START_NEW_CHAT,
  buildProjectChatFirstMessage,
  openAgentConversation,
  persistAgentConversationId,
  resumeAgentChatSession,
  type OpenAgentThreadDetail,
  type StartNewAgentChatDetail,
} from './lib/openAgentConversation';
import {
  agentTabMessagesNeedHydration,
  fetchAgentSessionMessages,
} from './lib/mapAgentSessionMessages';
import { writeSessionProject } from './src/lib/freshChatSession';
import { resolveWorkspaceContextLabel } from './src/workspaceContextLabel';
import { coalesceLabel } from './src/lib/coalesceLabel';
import {
  IAM_OPEN_COMMAND_PALETTE,
  IAM_GIT_SYNC_PUBLISH,
  IAM_TERMINAL_CONNECT,
  IAM_TERMINAL_SETUP_WIZARD,
  IAM_TERMINAL_CONFIGURE,
  openCommandPalette,
  type OpenCommandPaletteDetail,
} from './src/lib/openCommandPalette';
import { type ConnectionMenuAction } from './components/ConnectionMenuPanel';
import { WorkspaceLauncher } from './components/WorkspaceLauncher';
import type { XTermShellHandle, ShellTab } from './components/XTermShell';
import { useTerminalWorkspace } from './hooks/useTerminalWorkspace';
import { SecurityShieldBanner } from './components/SecurityShieldBanner';
import { mapProblemsApiPayload, countProblemSeverities } from './src/lib/mapAgentProblems';
import { buildPlatformHealthIssues, localTunnelVerificationStale } from './src/lib/platformHealth';
import { ExtensionsPanel } from './components/ExtensionsPanel';
import type { EditorModelMeta } from './types/editorModel';
import { EditorPreviewPane } from './components/EditorPreviewPane';
import {
  resolvePreviewMode,
  parseDevServerFromTerminalLine,
  probeDevServerUrl,
} from './lib/resolvePreviewMode';
import { buildPreviewSrcDoc } from './lib/buildPreviewSrcDoc';
import { buildR2ObjectUrl } from './src/lib/r2Urls';
import { StatusBar, type AgentNotificationRow } from './components/StatusBar';
import { UnifiedSearchBar, type UnifiedSearchNavigate } from './components/UnifiedSearchBar';
import { ProjectType, type ActiveFile } from './types';
import { DesignStudioProvider } from './components/designstudio/DesignStudioContext';
import type { DatabaseExplorerJump } from './types/databaseExplorer';
import { prepareActiveFileForEditor } from './src/lib/prepareActiveFileForEditor';
import { databaseStudioPathForWorkspace } from './src/lib/databaseStudioRoute';
import { SHELL_VERSION } from './src/shellVersion';
import {
  DASHBOARD_STATUS_BAR_INSET,
  isAgentEditorDevContext,
  mobileTabBarBottomOffset,
  PREF_SHOW_STATUS_BAR,
  readShellBoolPref,
  showDashboardStatusBar,
  SHELL_PREF_CHANGE_EVENT,
} from './config/shellChrome';
import {
  fetchAndApplyActiveCmsTheme,
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
  shouldAutoOpenRecentOnEditorBoot,
  type AgentWorkspaceContextPacket,
  type DevServerState,
} from './src/ideWorkspace';
import { isCmsEditorFullscreenRoute, isCmsStudioEditorRoute, parseCmsRoute } from './pages/cms/cmsRoute';
import { useCmsWorkspaceContext } from './hooks/useCmsWorkspaceContext';
import { useEditor } from './src/EditorContext';
import { useWorkspace } from './src/context/WorkspaceContext';
import { OfflineReconnectBanner, persistLastSessionSnapshot } from './src/pwa/OfflineReconnectBanner';
import { InstallCoach } from './src/pwa/InstallCoach';
import { PwaUpdateBanner } from './src/pwa/PwaUpdateBanner';
import { SessionExpiredGate } from './src/pwa/SessionExpiredGate';
import { warmAgentChunksForTab } from './src/pwa/warmAgentChunks';
import {
  readIamGitStatusCache,
  writeIamGitStatusCache,
  isIamGitStatusCacheFresh,
} from './src/iamGitStatusCache';
import { readDashboardBootstrapCache, type DashboardBootstrapPayload } from './src/loadDashboardBootstrap';
import { useAgentPolicy } from './src/hooks/useAgentPolicy';
import { useAvailableConnectors } from './src/hooks/useAvailableConnectors';
import { MeetProvider, MeetCtxValue } from './src/MeetContext';
import { MeetShellPanel } from './components/MeetShellPanel';
import { AuthSignInPage } from './components/auth/AuthSignInPage';
import { AuthSignUpPage } from './components/auth/AuthSignUpPage';
import { AuthForgotPage } from './components/auth/AuthForgotPage';
import { AuthResetPage } from './components/auth/AuthResetPage';
import AuthOAuthConsentPage from './components/auth/AuthOAuthConsentPage';
import MountIamMcpConsent from './components/auth/MountIamMcpConsent';
import { OnboardingPage } from './components/onboarding/OnboardingPage';
import { DashboardSidebar } from './components/shell/DashboardSidebar';
import { AgentSamChatHost } from './components/shell/AgentSamChatHost';
import { MobileNavShell } from './components/shell/MobileNavShell';
import {
  resolveAgentChatLayout,
  shouldShowAgentWorkbenchTabs,
  shouldShowMonacoWorkbench,
} from './lib/shellLayoutMeta';
import { MobileNavHamburger } from './components/shell/MobileNavHamburger';
import { mobileNavBackLabel } from './components/shell/mobileNavBackLabel';
import { Files, Search, GitBranch, Settings, PanelLeftClose, PanelRightClose, Terminal as TermIcon, Layers, Monitor, Bug, Github, Database, FolderOpen, FolderCode, Globe, PenTool, Cloud, X as XIcon, Eye, MessageSquare, MoreHorizontal, ChevronLeft, Link2, HardDrive, Package, History, FileCode2, Rocket } from 'lucide-react';
import { SetiFileIcon } from './src/components/SetiFileIcon';

function ProjectsLegacyRedirect() {
  const { projectId } = useParams();
  const dest = projectId
    ? `/dashboard/projects/${encodeURIComponent(projectId)}`
    : '/dashboard/projects';
  return <Navigate to={dest} replace />;
}

/** Route-level code splitting: heavy dashboard pages load on demand; shell + /dashboard/agent stay eager. */
const OverviewPage = lazy(() => import('./components/overview'));
const DashboardHome = lazy(() => import('./components/DashboardHome').then((m) => ({ default: m.DashboardHome })));
const FinanceDashboard = lazy(() => import('./components/finance'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const RedirectHealthToAnalytics = lazy(() =>
  import('./pages/RedirectHealthToAnalytics').then((m) => ({ default: m.RedirectHealthToAnalytics })),
);
const LearnPage = lazy(() => import('./components/LearnPage'));
const DatabasePage = lazy(() => import('./components/DatabasePage').then((m) => ({ default: m.DatabasePage })));
const DesignStudioPage = lazy(() => import('./components/DesignStudioPage').then((m) => ({ default: m.DesignStudioPage })));
const ImagesPage = lazy(() => import('./components/ImagesPage'));
const MailPage = lazy(() => import('./components/MailPage').then((m) => ({ default: m.MailPage })));
const MeetPage = lazy(() => import('./components/MeetPage'));
const SettingsPanel = lazy(() => import('./components/settings'));
const TasksPage = lazy(() => import('./pages/tasks/TasksPage'));
const LibraryPage = lazy(() => import('./pages/library/LibraryPage'));
const ProjectsPage = lazy(() => import('./pages/projects/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/projects/ProjectDetailPage'));
const WorkflowsPage = lazy(() =>
  import('./pages/workflows/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage })),
);
const MovieModePage = lazy(() =>
  import('./pages/moviemode/MovieModePage').then((m) => ({ default: m.default })),
);
const DrawPage = lazy(() =>
  import('./pages/draw/DrawPage').then((m) => ({ default: m.default })),
);
const SketchPage = lazy(() =>
  import('./pages/sketch/SketchPage').then((m) => ({ default: m.default })),
);
const CmsPage = lazy(() =>
  import('./pages/cms/CmsPage').then((m) => ({ default: m.default })),
);
const MonacoEditorView = lazy(() =>
  import('./components/MonacoEditorView').then((m) => ({ default: m.MonacoEditorView })),
);
const LaunchDeskPage = lazy(() =>
  import('./pages/LaunchDeskPage').then((m) => ({ default: m.LaunchDeskPage })),
);
const BookPage = lazy(() =>
  import('./pages/book/BookPage').then((m) => ({ default: m.BookPage })),
);
const BrowserView = lazy(() =>
  import('./components/BrowserView').then((m) => ({ default: m.BrowserView })),
);

/** Activity drawer + agent-only tools — not on critical path for /dashboard/artifacts etc. */
const AgentSamFilesystem = lazy(() =>
  import('./components/AgentSamFilesystem').then((m) => ({ default: m.AgentSamFilesystem })),
);
const GitHubExplorer = lazy(() =>
  import('./components/GitHubExplorer').then((m) => ({ default: m.GitHubExplorer })),
);
const DatabaseBrowser = lazy(() =>
  import('./components/DatabaseBrowser').then((m) => ({ default: m.DatabaseBrowser })),
);
const GoogleDriveExplorer = lazy(() =>
  import('./components/GoogleDriveExplorer').then((m) => ({ default: m.GoogleDriveExplorer })),
);
const SourcePanel = lazy(() =>
  import('./components/SourcePanel').then((m) => ({ default: m.SourcePanel })),
);
const MCPPanel = lazy(() =>
  import('./components/MCPPanel').then((m) => ({ default: m.MCPPanel })),
);
const ChatsPage = lazy(() => import('./pages/chats/ChatsPage'));
const XTermShell = lazy(() =>
  import('./components/XTermShell').then((m) => ({ default: m.XTermShell })),
);
const CmsStudioEditor = lazy(() =>
  import('../src/dashboard/cms/CmsStudioEditor').then((m) => ({ default: m.CmsStudioEditor })),
);

function ActivityPanelFallback() {
  return (
    <div className="flex flex-1 min-h-[120px] items-center justify-center text-[12px] text-muted">
      Loading…
    </div>
  );
}

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

/** Tab-bar Preview is shown for these extensions (inline EditorPreviewPane, not BrowserView). */
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
    return `Hi! I'm ${PRODUCT_NAME}. Open a GitHub repo in the explorer (or pick a workspace), then tell me what to work on.`;
  }
  // Prefer exact owner/repo when the explorer has one open — this is not the IAM workspace id.
  return `Hi! I'm ${PRODUCT_NAME}. Looking at ${w}. What should we work on?`;
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
const LS_EDITOR_PREVIEW_SPLIT_PCT = 'iam_editor_preview_split_pct';
const EDITOR_PREVIEW_SPLIT_MIN = 20;
const EDITOR_PREVIEW_SPLIT_MAX = 80;
const DEFAULT_EDITOR_PREVIEW_SPLIT_PCT = 50;
const EDITOR_PREVIEW_PANEL_MIN_PX = 220;
const LS_MOBILE_ACTIVITY_PANEL_VH = 'iam_mobile_activity_panel_vh';
const MOBILE_ACTIVITY_PANEL_MIN_VH = 28;
const MOBILE_ACTIVITY_PANEL_MAX_VH = 75;
const MOBILE_ACTIVITY_PANEL_DEFAULT_VH = 35;

function readMobileActivityPanelVh(): number {
  try {
    const n = Number(sessionStorage.getItem(LS_MOBILE_ACTIVITY_PANEL_VH));
    if (Number.isFinite(n) && n >= MOBILE_ACTIVITY_PANEL_MIN_VH && n <= MOBILE_ACTIVITY_PANEL_MAX_VH) {
      return Math.round(n * 10) / 10;
    }
  } catch {
    /* ignore */
  }
  return MOBILE_ACTIVITY_PANEL_DEFAULT_VH;
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

function readEditorPreviewSplitPct(): number {
  try {
    const raw = localStorage.getItem(LS_EDITOR_PREVIEW_SPLIT_PCT);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= EDITOR_PREVIEW_SPLIT_MIN && n <= EDITOR_PREVIEW_SPLIT_MAX) {
      return Math.round(n * 10) / 10;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_EDITOR_PREVIEW_SPLIT_PCT;
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
  const activeFile = tabs.find((t) => t.id === activeTabId) || null;
  const [openTabs, setOpenTabs] = useState<TabId[]>(['Workspace']);
  const [activeTab, setActiveTab] = useState<TabId>('Workspace');
  const {
    sessionUserId,
    sessionUserName,
    sessionAvatarUrl,
    workspaceId: authWorkspaceId,
    setWorkspaceId: setAuthWorkspaceId,
    workspaces: workspaceRows,
    displayName: workspaceDisplayName,
    setDisplayName: setWorkspaceDisplayName,
    switchWorkspace,
    refreshWorkspaces,
    workspaceDrift,
  } = useWorkspace();
  const location = useLocation();
  const [isNarrowViewport, setIsNarrowViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= BREAKPOINTS.PHONE_MAX,
  );
  useEffect(() => {
    const mq = window.matchMedia(PHONE_MQ);
    const fn = () => setIsNarrowViewport(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  const agentHomeTab = useMemo(
    () => getAgentTabFromSearch(location.search),
    [location.search],
  );
  const agentWorkspaceTab = useMemo(
    () => resolveAgentWorkspaceTab(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const isAgentWorkspaceBrowser = useMemo(
    () => isAgentWorkspaceBrowserPath(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const [agentHomeComposerHost, setAgentHomeComposerHost] = useState<HTMLDivElement | null>(null);
  const [agentHomeMessagesHost, setAgentHomeMessagesHost] = useState<HTMLDivElement | null>(null);
  const [designStudioComposerHost, setDesignStudioComposerHost] = useState<HTMLDivElement | null>(null);
  const [designStudioMessagesHost, setDesignStudioMessagesHost] = useState<HTMLDivElement | null>(null);
  const [designStudioEntryPhase, setDesignStudioEntryPhase] = useState(true);
  const [drawComposerHost, setDrawComposerHost] = useState<HTMLDivElement | null>(null);
  const [drawMessagesHost, setDrawMessagesHost] = useState<HTMLDivElement | null>(null);
  const [drawEntryPhase, setDrawEntryPhase] = useState(true);
  const [sketchComposerHost, setSketchComposerHost] = useState<HTMLDivElement | null>(null);
  const [sketchMessagesHost, setSketchMessagesHost] = useState<HTMLDivElement | null>(null);
  const [sketchEntryPhase, setSketchEntryPhase] = useState(true);
  const isAgentHomeAtmospheric = useMemo(
    () => isAgentCenterChatHome(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const isAgentBareHeroHome = useMemo(
    () => isAgentAtmosphericHome(location.pathname, location.search) || isAgentNewChatPath(location.pathname),
    [location.pathname, location.search],
  );
  const isAgentEditorWorkbench = useMemo(
    () => isAgentEditorPath(location.pathname),
    [location.pathname],
  );
  const editorDevContext = useMemo(
    () => isAgentEditorDevContext(location.pathname, !!activeFile),
    [location.pathname, activeFile],
  );
  const [prefShowStatusBar, setPrefShowStatusBar] = useState(() =>
    readShellBoolPref(PREF_SHOW_STATUS_BAR, false),
  );
  useEffect(() => {
    const syncPref = () => setPrefShowStatusBar(readShellBoolPref(PREF_SHOW_STATUS_BAR, false));
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREF_SHOW_STATUS_BAR) syncPref();
    };
    const onShellPref = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key;
      if (!key || key === PREF_SHOW_STATUS_BAR) syncPref();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SHELL_PREF_CHANGE_EVENT, onShellPref);
    window.addEventListener('focus', syncPref);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SHELL_PREF_CHANGE_EVENT, onShellPref);
      window.removeEventListener('focus', syncPref);
    };
  }, []);
  const showStatusBar = showDashboardStatusBar(location.pathname, {
    editorDevContext,
    userPrefShow: prefShowStatusBar,
  });
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--iam-status-bar-inset',
      showStatusBar ? DASHBOARD_STATUS_BAR_INSET : '0px',
    );
  }, [showStatusBar]);
  const isMovieModeRoute = location.pathname.startsWith('/dashboard/moviemode');
  const mobileTabBarBottom = mobileTabBarBottomOffset(showStatusBar);
  /** TODO: Movie Mode right rail — split Media bin + ChatAssistant (dual panel). */
  const isDrawRoute = location.pathname.startsWith('/dashboard/draw');
  const isSketchRoute = location.pathname.startsWith('/dashboard/sketch');
  const isCmsRoute = location.pathname.startsWith('/dashboard/cms');
  const cmsRouteParsed = useMemo(() => {
    if (!isCmsRoute) return null;
    return parseCmsRoute(location.pathname, new URLSearchParams(location.search));
  }, [isCmsRoute, location.pathname, location.search]);
  const isCmsFullscreen = isCmsEditorFullscreenRoute(
    location.pathname,
    new URLSearchParams(location.search),
  );
  const isCmsStudioEditor = isCmsStudioEditorRoute(
    location.pathname,
    new URLSearchParams(location.search),
  );

  const { context: cmsWorkspaceContext } = useCmsWorkspaceContext({
    workspaceId: authWorkspaceId,
    siteSlug: cmsRouteParsed?.siteSlug || null,
    enabled: Boolean(authWorkspaceId?.trim()),
  });
  const movieModeProjectId = useMemo(() => {
    const m = location.pathname.match(/^\/dashboard\/moviemode\/([^/?#]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
    try {
      return new URLSearchParams(location.search).get('project_id');
    } catch {
      return null;
    }
  }, [location.pathname, location.search]);
  const navigate = useNavigate();
  const terminalRef = useRef<XTermShellHandle>(null);
  const collabWsRef = useRef<WebSocket | null>(null);

  const termWs = useTerminalWorkspace({
    authWorkspaceId,
  });

  useEffect(() => {
    if (!sessionUserId) return;
    persistLastSessionSnapshot({
      workspaceId: authWorkspaceId,
      displayName: workspaceDisplayName,
    });
  }, [sessionUserId, authWorkspaceId, workspaceDisplayName]);

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
  type TabId = 'Workspace' | 'welcome' | 'code' | 'browser' | 'glb' | 'cms';
  const [activeActivity, setActiveActivity] = useState<'files' | 'mcps' | 'git' | 'debug' | 'actions' | 'drive' | 'database' | null>(null);
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
    if (typeof window === 'undefined') return 'off';
    if (window.innerWidth <= BREAKPOINTS.PHONE_MAX) return 'off';
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const search = window.location.search;
      if (isAgentCenterChatHome(path, search) && !isAgentEditorPath(path)) return 'off';
      // Editor landing always starts with agentPosition='off' so center layout wins until a file opens.
      if (isAgentEditorPath(path)) return 'off';
    }
    try {
      const v = localStorage.getItem(LS_AGENT_POSITION);
      if (v === 'left' || v === 'right' || v === 'off') return v;
    } catch {
      /* ignore */
    }
    return 'off';
  });
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalDrawerH, setTerminalDrawerH] = useState(288);
  /** Mirrored from Lab shell for Output tab (build / r2 / help). */
  const [shellOutputLines, setShellOutputLines] = useState<string[]>([]);

  const [ideWorkspace, setIdeWorkspace] = useState<IdeWorkspaceSnapshot>(() => ({ source: 'none' }));
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);
  const [recentFilesLsTick, setRecentFilesLsTick] = useState(0);
  const [gitBranch, setGitBranch] = useState(() => '');
  const [gitRepoFullName, setGitRepoFullName] = useState(() => '');
  const [gitAhead, setGitAhead] = useState<number | null>(null);
  const [gitBehind, setGitBehind] = useState<number | null>(null);
  const [gitTrackingBranch, setGitTrackingBranch] = useState<string | null>(null);
  const [gitSyncBusy, setGitSyncBusy] = useState(false);
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
  const MESSAGES_SS_KEY = 'iam-agent-chat-messages-v1';
  const [messagesByTabId, setMessagesByTabId] = useState<
    Record<string, { role: 'user' | 'assistant'; content: string }[]>
  >(() => {
    try {
      const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('iam-agent-chat-messages-v1') : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, { role: 'user' | 'assistant'; content: string }[]>;
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return { [stableAgentChatTabId]: [{ role: 'assistant', content: buildAgentSamGreeting(formatWorkspaceStatusLine({ source: 'none' })) }] };
  });
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
  const [sandboxOk, setSandboxOk] = useState<boolean | null>(null);
  const [tunnelHealthy, setTunnelHealthy] = useState<boolean | null>(null);
  const [tunnelStale, setTunnelStale] = useState(false);
  const [tunnelLabel, setTunnelLabel] = useState<string | null>(null);
  const [terminalOk, setTerminalOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (termWs.ptyReady) {
      setTerminalOk(true);
      return;
    }
    const boot = readDashboardBootstrapCache();
    if (boot?.status?.terminal?.ready === true) return;
    if (termWs.splashStatus == null && !termWs.statusLoading) return;
    if (!termWs.statusLoading) setTerminalOk(false);
  }, [termWs.splashStatus, termWs.ptyReady, termWs.statusLoading]);
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

  useEffect(() => {
    const onPalette = (e: Event) => {
      const detail = (e as CustomEvent<OpenCommandPaletteDetail>).detail ?? {};
      if (detail.query) setSearchInitialQuery(detail.query);
      if (detail.facets?.length) setSearchInitialFacets(detail.facets);
      else if (detail.chip === 'commands') setSearchInitialFacets(['commands']);
      else if (detail.chip === 'd1') setSearchInitialFacets(['d1']);
      setSearchOpen(true);
    };
    window.addEventListener(IAM_OPEN_COMMAND_PALETTE, onPalette as EventListener);
    return () => window.removeEventListener(IAM_OPEN_COMMAND_PALETTE, onPalette as EventListener);
  }, []);

  const handleConnectionMenuAction = useCallback(
    (action: ConnectionMenuAction) => {
      if (action === 'ssh_config') {
        navigate('/dashboard/settings/network');
        return;
      }

      const openTerminalThen = (eventName: string, detail?: Record<string, string>) => {
        setIsTerminalOpen(true);
        setTimeout(() => {
          window.dispatchEvent(
            detail
              ? new CustomEvent(eventName, { detail })
              : new CustomEvent(eventName),
          );
        }, 100);
      };

      if (action === 'local_pty') {
        openTerminalThen(IAM_TERMINAL_CONNECT, { target: 'local' });
        return;
      }
      if (action === 'cloud_terminal') {
        openTerminalThen(IAM_TERMINAL_CONNECT, { target: 'cloud' });
        return;
      }
      if (action === 'gcp_vm') {
        openTerminalThen(IAM_TERMINAL_CONNECT, { target: 'sandbox' });
        return;
      }
      if (action === 'pty_setup_wizard') {
        openTerminalThen(IAM_TERMINAL_SETUP_WIZARD);
        return;
      }
      if (action === 'configure_terminal') {
        openTerminalThen(IAM_TERMINAL_CONFIGURE);
      }
    },
    [navigate],
  );

  /** Desktop: Draw / Search / History (Addendum A). */
  const [topChromeMoreOpen, setTopChromeMoreOpen] = useState(false);
  const topChromeMoreRef = useRef<HTMLDivElement>(null);
  const [isWorkspaceLauncherOpen, setWorkspaceLauncherOpen] = useState(false);

  const [meetCtxValue, setMeetCtxValue] = useState<MeetCtxValue | null>(null);

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
    if (typeof window === 'undefined' || isNarrowViewport) return;
    try {
      localStorage.setItem(LS_AGENT_POSITION, agentPosition);
    } catch {
      /* ignore */
    }
  }, [agentPosition, isNarrowViewport]);


  const agentChatLayout = useMemo(() => {
    if (location.pathname.startsWith('/dashboard/designstudio') && designStudioEntryPhase) {
      return 'center' as const;
    }
    if (location.pathname.startsWith('/dashboard/draw') && drawEntryPhase) {
      return 'center' as const;
    }
    if (location.pathname.startsWith('/dashboard/sketch') && sketchEntryPhase) {
      return 'center' as const;
    }
    return resolveAgentChatLayout({
      pathname: location.pathname,
      search: location.search,
      agentPosition,
      isNarrow: isNarrowViewport,
      isCmsFullscreen,
      hasActiveFile: !!activeFile,
      activeTab: String(activeTab),
    });
  }, [
    location.pathname,
    location.search,
    agentPosition,
    isNarrowViewport,
    isCmsFullscreen,
    designStudioEntryPhase,
    drawEntryPhase,
    sketchEntryPhase,
    activeFile,
    activeTab,
  ]);

  /** Atmospheric chrome only while chat actually owns the center — not when a side rail left an empty canvas. */
  const isCenterChatAtmospheric =
    !isAgentEditorWorkbench && isAgentHomeAtmospheric && agentChatLayout === 'center';

  /** Desktop center-chat routes keep layout=center — do not flip agentPosition to open a side rail. */
  const isCenterAgentDesktop = useMemo(
    () =>
      !isNarrowViewport &&
      (
        (isAgentCenterChatHome(location.pathname, location.search) && !isAgentEditorPath(location.pathname))
      ),
    [isNarrowViewport, location.pathname, location.search],
  );

  const ensureAgentSidePanel = useCallback(() => {
    if (isCenterAgentDesktop) return;
    setAgentPosition((p) => (p === 'off' ? 'right' : p));
  }, [isCenterAgentDesktop]);

  const showAgentWorkbenchTabs = useMemo(
    () => shouldShowAgentWorkbenchTabs({
      pathname: location.pathname,
      search: location.search,
      hasActiveFile: !!activeFile,
      activeTab: String(activeTab),
    }),
    [location.pathname, location.search, activeFile, activeTab],
  );

  useEffect(() => {
    if (!isCmsStudioEditor || isNarrowViewport) return;
    setAgentPosition('off');
  }, [isCmsStudioEditor, isNarrowViewport, location.pathname, location.search]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent(IAM_AGENT_PANEL_CHANGED, {
        detail: { open: agentPosition !== 'off' },
      }),
    );
  }, [agentPosition]);

  useEffect(() => {
    if (isNarrowViewport) return;
    if (!isAgentCenterChatHome(location.pathname, location.search)) return;
    if (isAgentEditorPath(location.pathname)) return;
    setAgentPosition('off');
  }, [location.pathname, location.search, isNarrowViewport]);

  /** Pure chat routes (/new, /agent/{id}): don't leave a hollow browser/cms/code canvas beside the rail. */
  useEffect(() => {
    if (!isAgentCenterChatHome(location.pathname, location.search)) return;
    if (isAgentEditorPath(location.pathname)) return;
    if (activeFile) return;
    setActiveTab((t) => (t === 'browser' || t === 'cms' || t === 'code' ? 'Workspace' : t));
  }, [location.pathname, location.search, activeFile]);

  const { policy: agentsamChatPolicy } = useAgentPolicy(authWorkspaceId);
  const { connectors: availableConnectors, loading: availableConnectorsLoading } =
    useAvailableConnectors(authWorkspaceId);
  const maxTabsPolicyRef = useRef(24);
  const [workspaceSamState, setWorkspaceSamState] = useState<Record<string, unknown> | null>(null);

  const workspaceDisplayFallback = useMemo(() => {
    const id = authWorkspaceId?.trim();
    if (id && workspaceRows.length > 0) {
      const row = workspaceRows.find((w) => w.id === id);
      if (row?.slug?.trim()) return row.slug.trim();
      if (row?.name?.trim()) return row.name.trim();
      return id;
    }
    return formatWorkspaceStatusLine(ideWorkspace);
  }, [authWorkspaceId, workspaceRows, ideWorkspace]);

  const activeWorkspaceRow = useMemo(
    () => workspaceRows.find((w) => w.id === authWorkspaceId) ?? null,
    [workspaceRows, authWorkspaceId],
  );

  const databaseStudioPath = useMemo(
    () => databaseStudioPathForWorkspace(activeWorkspaceRow),
    [activeWorkspaceRow],
  );

  const workspaceContextLabel = useMemo(
    () =>
      resolveWorkspaceContextLabel({
        // Explorer-open repo wins over D1 workspace.github_repo (often still pinned to platform).
        githubRepo: coalesceLabel(gitRepoFullName ?? activeWorkspaceRow?.github_repo ?? null, ''),
        workspaceSlug: coalesceLabel(activeWorkspaceRow?.slug ?? null, ''),
        workspaceId: authWorkspaceId,
        ideWorkspace,
      }),
    [activeWorkspaceRow, authWorkspaceId, ideWorkspace, gitRepoFullName],
  );

  const userProfileLabel = useMemo(() => {
    const name = sessionUserName?.trim();
    if (name) return name;
    const id = sessionUserId?.trim();
    return id || 'Account';
  }, [sessionUserName, sessionUserId]);

  const workspaceDisplayLine = coalesceLabel(workspaceContextLabel || workspaceDisplayFallback, 'No workspace');

  const activeAgentConversationId = useMemo(
    () => agentChatTabs.find((t) => t.id === activeAgentChatTabId)?.conversationId?.trim() ?? '',
    [agentChatTabs, activeAgentChatTabId],
  );

  const agentChatTabsRef = useRef(agentChatTabs);
  const activeAgentChatTabIdRef = useRef(activeAgentChatTabId);
  const messagesByTabIdRef = useRef(messagesByTabId);
  agentChatTabsRef.current = agentChatTabs;
  activeAgentChatTabIdRef.current = activeAgentChatTabId;
  messagesByTabIdRef.current = messagesByTabId;

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
            agent_home:
              msg.agent_home && typeof msg.agent_home === 'object' && !Array.isArray(msg.agent_home)
                ? (msg.agent_home as import('./types/agentHomeScene').AgentHomeCmsConfig)
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
  const messageHydrateGenRef = useRef(0);
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

  /** Hero scene only when chat is in a side rail — center chat IS the home (no portal shell). */
  const showAgentHomeScene = useMemo(
    () =>
      isAgentBareHeroHome &&
      activeTab === 'Workspace' &&
      agentChatLayout !== 'center',
    [isAgentBareHeroHome, activeTab, agentChatLayout],
  );
  
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

  const [cmsAgentPageId, setCmsAgentPageId] = useState<string | null>(null);
  const [cmsAgentPanel, setCmsAgentPanel] = useState<string>('pages');
  const [cmsLiveSessionId, setCmsLiveSessionId] = useState<string | null>(null);

  const cmsWorkbenchContext = useMemo<AgentWorkspaceContextPacket | null>(() => {
    const slug = cmsWorkspaceContext?.project_slug || cmsRouteParsed?.siteSlug || null;
    const ws = (authWorkspaceId || '').trim();
    if (!slug && !isCmsRoute) return null;
    const pageId = isCmsRoute ? cmsRouteParsed?.pageId ?? null : cmsAgentPageId;
    const panel = isCmsRoute ? cmsRouteParsed?.panel ?? 'pages' : cmsAgentPanel;
    const publicDomain = cmsWorkspaceContext?.public_domain || null;
    const workerBase = cmsWorkspaceContext?.worker_base_url || null;
    const previewUrl = publicDomain
      ? `https://${publicDomain.replace(/^https?:\/\//, '')}`
      : workerBase || null;
    return {
      activeTab: activeTab === 'cms' || isCmsRoute ? 'cms' : String(activeTab),
      browserUrl: browserUrl?.trim() || null,
      openFiles: agentWorkbenchOpenFiles,
      plan_id: activePlanIdForChat,
      workflow_run_id: null,
      project_slug: slug,
      page_id: pageId,
      studio_panel: panel,
      live_session_id: cmsLiveSessionId,
      collab_room: pageId ? `cms:${pageId}` : null,
      bootstrap_cache_key: slug && ws ? `cms:bootstrap:${ws}:${slug}` : null,
      preview_url: previewUrl,
      public_domain: publicDomain,
      cms_hosting: cmsWorkspaceContext?.cms_hosting || null,
      api_profile: cmsWorkspaceContext?.api_profile || null,
      capabilities: slug ? ['cms'] : null,
      r2_bucket:
        (cmsWorkspaceContext as { r2_bucket?: string | null } | null)?.r2_bucket ||
        (cmsWorkspaceContext as { agent_site_context?: { r2_bucket?: string } } | null)
          ?.agent_site_context?.r2_bucket ||
        null,
      r2_key: null,
      agent_site_context:
        (cmsWorkspaceContext as { agent_site_context?: Record<string, unknown> } | null)
          ?.agent_site_context || null,
      d1_database_id:
        (cmsWorkspaceContext as { d1_database_id?: string | null } | null)?.d1_database_id ||
        null,
    };
  }, [
    cmsWorkspaceContext,
    cmsRouteParsed,
    isCmsRoute,
    authWorkspaceId,
    cmsAgentPageId,
    cmsAgentPanel,
    cmsLiveSessionId,
    activeTab,
    browserUrl,
    agentWorkbenchOpenFiles,
    activePlanIdForChat,
  ]);

  useEffect(() => {
    const pageId = cmsWorkbenchContext?.page_id?.trim();
    if (!pageId || isCmsRoute) return;
    let cancelled = false;
    void fetch('/api/cms/live-session/join', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_id: pageId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { session_id?: string } | null) => {
        if (cancelled || !data?.session_id?.trim()) return;
        setCmsLiveSessionId(data.session_id.trim());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cmsWorkbenchContext?.page_id, isCmsRoute]);

  const isDesignStudioRoute = location.pathname.startsWith('/dashboard/designstudio');
  const designStudioEntryAtmospheric = isDesignStudioRoute && designStudioEntryPhase;
  const drawEntryAtmospheric = isDrawRoute && drawEntryPhase;
  const sketchEntryAtmospheric = isSketchRoute && sketchEntryPhase;
  const routeEntryAtmospheric =
    designStudioEntryAtmospheric || drawEntryAtmospheric || sketchEntryAtmospheric;

  useEffect(() => {
    if (!isDesignStudioRoute) {
      setDesignStudioEntryPhase(true);
      setDesignStudioComposerHost(null);
      setDesignStudioMessagesHost(null);
    }
  }, [isDesignStudioRoute]);

  useEffect(() => {
    if (!isDrawRoute) {
      setDrawEntryPhase(true);
      setDrawComposerHost(null);
      setDrawMessagesHost(null);
    }
  }, [isDrawRoute]);

  useEffect(() => {
    if (!isSketchRoute) {
      setSketchEntryPhase(true);
      setSketchComposerHost(null);
      setSketchMessagesHost(null);
    }
  }, [isSketchRoute]);

  useEffect(() => {
    if (!isDesignStudioRoute || isNarrowViewport) return;
    if (designStudioEntryPhase) {
      setAgentPosition('off');
    } else {
      ensureAgentSidePanel();
    }
  }, [isDesignStudioRoute, designStudioEntryPhase, isNarrowViewport, ensureAgentSidePanel]);

  useEffect(() => {
    if (!isDrawRoute || isNarrowViewport) return;
    if (drawEntryPhase) {
      setAgentPosition('off');
    } else {
      ensureAgentSidePanel();
    }
  }, [isDrawRoute, drawEntryPhase, isNarrowViewport, ensureAgentSidePanel]);

  useEffect(() => {
    if (!isSketchRoute || isNarrowViewport) return;
    if (sketchEntryPhase) {
      setAgentPosition('off');
    }
  }, [isSketchRoute, sketchEntryPhase, isNarrowViewport]);

  const agentWorkspaceContext = useMemo<AgentWorkspaceContextPacket>(() => {
    const routeCtx = resolveDashboardRouteAgentContext({
      pathname: location.pathname,
      search: location.search,
      workspaceId: authWorkspaceId,
      cmsContext: cmsWorkspaceContext,
      activeTab: String(activeTab),
      browserUrl,
      openFiles: agentWorkbenchOpenFiles,
      planId: activePlanIdForChat,
    });
    const activePath =
      activeFile?.workspacePath ||
      activeFile?.githubPath ||
      activeFile?.r2Key ||
      activeFile?.name ||
      null;
    const wsGithub = activeWorkspaceRow?.github_repo?.trim() || null;
    const wsR2Prefix =
      (activeWorkspaceRow as { r2_prefix?: string | null } | null)?.r2_prefix?.trim() || null;
    const wsRoot =
      (activeWorkspaceRow as { root_path?: string | null } | null)?.root_path?.trim() ||
      (ideWorkspace?.source === 'local'
        ? ideWorkspace.folderName
        : ideWorkspace?.source === 'pinned'
          ? ideWorkspace.pathHint
          : null);
    const workspaceSource = (() => {
      const gh = !!wsGithub;
      const r2 = !!wsR2Prefix;
      if (gh && r2) return 'mixed';
      if (gh) return 'github';
      if (r2) return 'r2';
      if (wsRoot || ideWorkspace?.source === 'local') return 'local';
      return 'general';
    })();
    return {
      activeTab: isDesignStudioRoute ? 'designstudio' : String(activeTab),
      browserUrl: browserUrl?.trim() || null,
      openFiles: agentWorkbenchOpenFiles,
      plan_id: activePlanIdForChat,
      workflow_run_id: null,
      dashboard_path: location.pathname,
      dashboard_route_key: routeCtx.route_key,
      ide_workspace: ideWorkspace,
      dev_server_url: devServer?.url ?? null,
      active_file: activePath,
      terminal_tail: shellOutputLines.slice(-8),
      workspace_id: authWorkspaceId?.trim() || null,
      workspace_source: workspaceSource,
      github_repo: wsGithub,
      r2_prefix: wsR2Prefix,
      root_path: wsRoot,
      ...routeCtx.workspaceContext,
      ...(cmsWorkbenchContext || {}),
    };
  }, [
    location.pathname,
    location.search,
    authWorkspaceId,
    cmsWorkspaceContext,
    isDesignStudioRoute,
    activeTab,
    browserUrl,
    agentWorkbenchOpenFiles,
    activePlanIdForChat,
    cmsWorkbenchContext,
    activeFile,
    ideWorkspace,
    devServer,
    shellOutputLines,
    activeWorkspaceRow,
  ]);

  const routeAgentMeta = useMemo(
    () =>
      resolveDashboardRouteAgentContext({
        pathname: location.pathname,
        search: location.search,
        workspaceId: authWorkspaceId,
        cmsContext: cmsWorkspaceContext,
        activeTab: String(activeTab),
        browserUrl,
        openFiles: agentWorkbenchOpenFiles,
        planId: activePlanIdForChat,
      }),
    [
      location.pathname,
      location.search,
      authWorkspaceId,
      cmsWorkspaceContext,
      activeTab,
      browserUrl,
      agentWorkbenchOpenFiles,
      activePlanIdForChat,
    ],
  );

  const showMonacoWorkbench = useMemo(
    () =>
      shouldShowMonacoWorkbench({
        pathname: location.pathname,
        search: location.search,
        activeTab,
        hasActiveFile: !!activeFile,
      }),
    [location.pathname, location.search, activeTab, activeFile],
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
  const editorPreviewSplitRef = useRef<HTMLDivElement>(null);
  const [editorPreviewEditorPct, setEditorPreviewEditorPct] = useState(readEditorPreviewSplitPct);
  useEffect(() => {
    editorPreviewLoadingRef.current = editorPreviewLoading;
  }, [editorPreviewLoading]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_EDITOR_PREVIEW_SPLIT_PCT, String(editorPreviewEditorPct));
    } catch {
      /* ignore */
    }
  }, [editorPreviewEditorPct]);
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
    ensureAgentSidePanel();
  }, [ensureAgentSidePanel]);

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
        if (location.pathname.startsWith('/dashboard/database')) {
          const nextPath = databaseStudioPathForWorkspace(row ?? null);
          if (nextPath !== location.pathname) {
            navigate(nextPath, { replace: true });
          }
        }
      } catch {
        setToastMsg('Workspace saved locally — sync failed.');
      }
    },
    [switchWorkspace, refreshWorkspaces, workspaceRows, location.pathname, navigate],
  );

  const statusBarWorkspaceItems = useMemo(
    () =>
      workspaceRows.map((w) => ({
        id: w.id,
        label: w.github_repo?.trim() || w.slug || w.name,
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
    warmAgentChunksForTab(tab);
    if (
      !isNarrowViewport &&
      (tab === 'browser' || tab === 'cms' || tab === 'code') &&
      (isAgentEditorPath(location.pathname) ||
        isAgentCenterChatHome(location.pathname, location.search))
    ) {
      setAgentPosition((p) => (p === 'off' ? 'right' : p));
    }
  }, [isNarrowViewport, location.pathname, location.search]);

  const toggleSidebarRail = useCallback(() => {
    setSidebarRailExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LS_SIDEBAR_RAIL, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const agentHomeGreetingName = useMemo(() => {
    const user = coalesceLabel(sessionUserName, '');
    if (user) return user;
    return coalesceLabel(workspaceDisplayName, 'there');
  }, [sessionUserName, workspaceDisplayName]);

  const createNewAgentChatTabRef = useRef<(() => void) | null>(null);
  const chatAssistantReadyRef = useRef(false);
  const pendingNewThreadMessageRef = useRef<QuickstartThreadDetail | null>(null);
  const flushPendingNewThreadRef = useRef<(() => void) | null>(null);
  const pathHydratedConvRef = useRef<string | null>(null);

  const shellNewChat = useCallback(() => {
    createNewAgentChatTabRef.current?.();
    if (isAgentEditorPath(location.pathname)) {
      if (agentPosition === 'off') setAgentPosition('right');
      return;
    }
    // Work / Collaborate / Projects / Mail: keep the current route; only open the side rail.
    // Navigating to /dashboard/agent/new was yanking users out of context into a "fresh" agent home.
    if (isContextPreservingAgentRailPath(location.pathname)) {
      if (agentPosition === 'off') setAgentPosition('right');
      return;
    }
    if (!isAgentShellPath(location.pathname)) {
      navigate(AGENT_NEW_CHAT_PATH);
    } else if (!isAgentNewChatPath(location.pathname)) {
      navigate(AGENT_NEW_CHAT_PATH, { replace: true });
    }
    if (isAgentHomeAtmospheric && !isNarrowViewport) return;
    ensureAgentSidePanel();
  }, [location.pathname, navigate, isAgentHomeAtmospheric, isNarrowViewport, ensureAgentSidePanel, agentPosition]);

  const shellOpenChats = useCallback(() => {
    navigate('/dashboard/chats');
  }, [navigate]);

  const shellOpenChatHistory = useCallback(() => {
    navigate('/dashboard/chats');
  }, [navigate]);

  const shellSelectChat = useCallback(
    (conversationId: string, title?: string) => {
      const id = String(conversationId || '').trim();
      if (!id) return;
      // On Work / Collaborate / Projects / Mail: resume in the side rail — do not full-screen navigate.
      if (isContextPreservingAgentRailPath(location.pathname)) {
        openAgentConversation({ id, title, force: true });
        if (agentPosition === 'off') setAgentPosition('right');
        return;
      }
      resumeAgentChatSession({ id, title, force: true });
    },
    [location.pathname, agentPosition],
  );

  const shellDeleteActiveChat = useCallback(
    (deletedId: string) => {
      const id = String(deletedId || '').trim();
      if (!id || id !== activeAgentConversationId) return;
      createNewAgentChatTabRef.current?.();
      window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id: null } }));
    },
    [activeAgentConversationId],
  );

  const shellOpenMovieMode = useCallback(() => {
    navigate('/dashboard/moviemode');
  }, [navigate]);

  const shellOpenDraw = useCallback(
    (detail?: { load_url?: string | null; artifact_id?: string | null }) => {
      navigate('/dashboard/draw');
      const load = detail?.load_url?.trim() || '';
      const aid = detail?.artifact_id?.trim() || '';
      if (load || aid) {
        queueMicrotask(() => {
          window.dispatchEvent(
            new CustomEvent('iam:excalidraw_load_document', {
              detail: {
                load_url: load || null,
                artifact_id: aid || null,
                replace_workspace: true,
              },
            }),
          );
        });
      }
    },
    [navigate],
  );

  const shellOpenSketch = useCallback(
    (detail?: {
      elements?: unknown[];
      mode?: 'sketch' | 'layout' | 'blueprint';
      name?: string;
    }) => {
      navigate(SKETCH_PATH);
      if (detail?.elements?.length) {
        queueMicrotask(() => {
          window.dispatchEvent(
            new CustomEvent('iam:sketch_load_document', {
              detail: {
                elements: detail.elements,
                mode: detail.mode ?? 'layout',
                name: detail.name ?? 'Agent concept',
              },
            }),
          );
        });
      }
    },
    [navigate],
  );

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
  const [mobileActivityPanelVh, setMobileActivityPanelVh] = useState(readMobileActivityPanelVh);
  const mobileActivityPanelVhRef = useRef(mobileActivityPanelVh);
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

  const beginEditorPreviewResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }
    document.body.classList.add('is-resizing');

    const startX = e.clientX;
    const startPct = editorPreviewEditorPct;
    const container = editorPreviewSplitRef.current;

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
        /* ignore */
      }
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new CustomEvent('iam:monaco-layout'));
    };

    const onMove = (pe: PointerEvent) => {
      if (pe.pointerId !== pointerId) return;
      const width = container?.getBoundingClientRect().width ?? 0;
      if (width <= 0) return;
      const deltaPct = ((pe.clientX - startX) / width) * 100;
      const next = Math.max(
        EDITOR_PREVIEW_SPLIT_MIN,
        Math.min(EDITOR_PREVIEW_SPLIT_MAX, startPct + deltaPct),
      );
      setEditorPreviewEditorPct(next);
      window.dispatchEvent(new CustomEvent('iam:monaco-layout'));
    };

    const onEnd = (pe: PointerEvent) => {
      if (pe.pointerId !== pointerId) return;
      endDrag();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }, [editorPreviewEditorPct]);

  useEffect(() => {
    mobileActivityPanelVhRef.current = mobileActivityPanelVh;
  }, [mobileActivityPanelVh]);

  useEffect(() => {
    const onExpandSheet = (e: Event) => {
      const detail = (e as CustomEvent<{ vh?: number }>).detail;
      const target = Number(detail?.vh);
      const next = Number.isFinite(target)
        ? Math.min(MOBILE_ACTIVITY_PANEL_MAX_VH, Math.max(MOBILE_ACTIVITY_PANEL_MIN_VH, target))
        : MOBILE_ACTIVITY_PANEL_MAX_VH;
      setMobileActivityPanelVh(next);
      try {
        sessionStorage.setItem(LS_MOBILE_ACTIVITY_PANEL_VH, String(next));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('iam-mobile-activity-sheet-expand', onExpandSheet as EventListener);
    return () => window.removeEventListener('iam-mobile-activity-sheet-expand', onExpandSheet as EventListener);
  }, []);

  const beginMobileActivitySheetResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const startY = e.clientY;
    const startVh = mobileActivityPanelVhRef.current;
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }
    document.body.classList.add('is-resizing');

    const onMove = (pe: PointerEvent) => {
      if (pe.pointerId !== pointerId) return;
      const vh = window.innerHeight || 800;
      const deltaVh = ((startY - pe.clientY) / vh) * 100;
      const next = Math.min(
        MOBILE_ACTIVITY_PANEL_MAX_VH,
        Math.max(MOBILE_ACTIVITY_PANEL_MIN_VH, startVh + deltaVh),
      );
      setMobileActivityPanelVh(Math.round(next * 10) / 10);
    };

    const endDrag = () => {
      document.body.classList.remove('is-resizing');
      try {
        sessionStorage.setItem(
          LS_MOBILE_ACTIVITY_PANEL_VH,
          String(mobileActivityPanelVhRef.current),
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

  const agentHomeShowHero = useMemo(
    () => isAgentBareHeroHome && !chatMessages.some((m) => m.role === 'user'),
    [chatMessages, isAgentBareHeroHome],
  );

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

  // Persist chat messages across route navigation (sessionStorage — clears on tab close)
  useEffect(() => {
    try {
      const TRIM_THRESHOLD = 200; // messages per tab
      const trimmed = Object.fromEntries(
        Object.entries(messagesByTabId).map(([k, v]) => [k, v.slice(-TRIM_THRESHOLD)])
      );
      sessionStorage.setItem(MESSAGES_SS_KEY, JSON.stringify(trimmed));
    } catch { /* quota or SSR — ignore */ }
  }, [messagesByTabId, MESSAGES_SS_KEY]);

  useEffect(() => {
    const ensurePanel = () => {
      if (isAgentHomeAtmospheric && !isNarrowViewport) return;
      setAgentPosition((p) => (p === 'off' ? 'right' : p));
    };
    const collapsePanel = () => {
      setAgentPosition('off');
    };
    window.addEventListener(IAM_AGENT_ENSURE_PANEL, ensurePanel);
    window.addEventListener(IAM_AGENT_COLLAPSE_PANEL, collapsePanel);
    return () => {
      window.removeEventListener(IAM_AGENT_ENSURE_PANEL, ensurePanel);
      window.removeEventListener(IAM_AGENT_COLLAPSE_PANEL, collapsePanel);
    };
  }, [isAgentHomeAtmospheric, isNarrowViewport]);

  // Greeting / status line follow the open GitHub explorer repo (not only D1 workspace.github_repo).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onExplorerRepo = (ev: Event) => {
      const detail = (ev as CustomEvent<{ active_repo?: string | null }>).detail;
      const repo = detail?.active_repo != null ? String(detail.active_repo).trim() : '';
      if (repo) setGitRepoFullName(repo);
    };
    window.addEventListener('iam_explorer_active_repo', onExplorerRepo);
    try {
      window.dispatchEvent(new CustomEvent('iam_explorer_request_active_repo'));
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener('iam_explorer_active_repo', onExplorerRepo);
  }, []);

  const hydrateAgentTabMessages = useCallback(
    async (tabId: string, convId: string, force = false) => {
      const tid = String(tabId || '').trim();
      const cid = String(convId || '').trim();
      if (!tid || !cid) return;

      const existing = messagesByTabIdRef.current[tid];
      if (!force && !agentTabMessagesNeedHydration(existing, { hasConversationId: true })) return;

      const gen = ++messageHydrateGenRef.current;
      setMessagesByTabId((prev) => ({
        ...prev,
        [tid]: [{ role: 'assistant' as const, content: 'Loading conversation…' }],
      }));

      try {
        const mapped = await fetchAgentSessionMessages(cid);
        if (messageHydrateGenRef.current !== gen) return;
        if (!mapped.length) {
          setMessagesByTabId((prev) => ({
            ...prev,
            [tid]: [{ role: 'assistant' as const, content: buildAgentSamGreeting(workspaceDisplayLine) }],
          }));
          return;
        }
        setMessagesByTabId((prev) => ({ ...prev, [tid]: mapped }));
      } catch {
        if (messageHydrateGenRef.current !== gen) return;
        setMessagesByTabId((prev) => ({
          ...prev,
          [tid]: [{ role: 'assistant' as const, content: buildAgentSamGreeting(workspaceDisplayLine) }],
        }));
      }
    },
    [workspaceDisplayLine],
  );

  useEffect(() => {
    const onOpenThread = (e: Event) => {
      const detail = (e as CustomEvent<OpenAgentThreadDetail>).detail;
      const projectId = detail?.projectId?.trim();
      const conversationId = detail?.conversationId?.trim();
      if (projectId) {
        writeSessionProject({
          id: projectId,
          name: detail?.projectName?.trim() || 'Project',
        });
      }

      setAgentPosition('off');
      setActiveTab('Workspace');
      setOpenTabs((prev) => (prev.includes('Workspace') ? prev : [...prev, 'Workspace']));

      const message = buildProjectChatFirstMessage(
        detail?.firstMessage,
        detail?.memory,
        detail?.instructions,
      );

      if (conversationId) {
        persistAgentConversationId(conversationId);
        navigate(agentConversationPath(conversationId));
        requestAnimationFrame(() => {
          openAgentConversation({
            id: conversationId,
            title: detail?.title,
            force: detail?.force !== false,
            ensureAgentPanel: false,
          });
        });
        return;
      }

      navigate(projectId ? `${AGENT_NEW_CHAT_PATH}?project_id=${encodeURIComponent(projectId)}` : AGENT_NEW_CHAT_PATH);
      createNewAgentChatTabRef.current?.();
      if (message) {
        pendingNewThreadMessageRef.current = { message, ensureAgentPanel: false };
        flushPendingNewThreadRef.current?.();
      }
    };
    window.addEventListener(IAM_AGENT_OPEN_THREAD, onOpenThread);
    return () => window.removeEventListener(IAM_AGENT_OPEN_THREAD, onOpenThread);
  }, [navigate]);

  useEffect(() => {
    const convId = parseAgentConversationIdFromPath(location.pathname);
    if (!convId || !isAgentShellPath(location.pathname)) {
      pathHydratedConvRef.current = null;
      return;
    }
    if (pathHydratedConvRef.current === convId) return;
    pathHydratedConvRef.current = convId;
    setAgentPosition('off');
    persistAgentConversationId(convId);
    // Mid-stream sync from /agent/new already owns this id on the active tab.
    // force:true would replace live SSE messages with "Loading conversation…" and
    // abort the in-flight image/tool stream (network shows Canceled).
    const activeConv =
      agentChatTabsRef.current
        .find((t) => t.id === activeAgentChatTabIdRef.current)
        ?.conversationId?.trim() || '';
    const activeMsgs =
      messagesByTabIdRef.current[activeAgentChatTabIdRef.current] || [];
    if (activeConv === convId && !agentTabMessagesNeedHydration(activeMsgs, { hasConversationId: true })) {
      return;
    }
    openAgentConversation({ id: convId, force: true, ensureAgentPanel: false });
  }, [location.pathname]);

  useEffect(() => {
    const onSyncUrl = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id?.trim();
      if (!id) return;
      if (
        isCmsEditorFullscreenRoute(location.pathname, new URLSearchParams(location.search))
      ) {
        return;
      }
      // Stay in the editor / Work shell — conversation id lives in tab/localStorage, not URL.
      // Navigating to /dashboard/agent/{id} drops the page context and feels like a "new chat" redirect.
      if (isAgentEditorPath(location.pathname) || isContextPreservingAgentRailPath(location.pathname)) {
        try {
          localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, id);
        } catch {
          /* ignore */
        }
        return;
      }
      const next = agentConversationPath(id);
      if (normalizePath(location.pathname) === normalizePath(next)) return;
      navigate(next, { replace: true });
    };
    window.addEventListener(IAM_AGENT_SYNC_CONVERSATION_URL, onSyncUrl);
    return () => window.removeEventListener(IAM_AGENT_SYNC_CONVERSATION_URL, onSyncUrl);
  }, [navigate, location.pathname]);

  useEffect(() => {
    const onConv = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string | null; force?: boolean; title?: string }>).detail;
      const raw = detail?.id;

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

      const sessionTitle = typeof detail?.title === 'string' ? detail.title.trim() : '';
      const forceReload = detail?.force === true;

      const prevTabs = agentChatTabsRef.current;
      const act = activeAgentChatTabIdRef.current;
      const byConv = prevTabs.find((t) => t.conversationId === convId);
      let targetTabId = '';

      if (byConv) {
        targetTabId = byConv.id;
        if (byConv.id !== act) setActiveAgentChatTabId(byConv.id);
        if (sessionTitle) {
          setAgentChatTabs((prev) =>
            prev.map((t) => (t.id === byConv.id ? { ...t, title: sessionTitle } : t)),
          );
        }
      } else {
        const activeRow = prevTabs.find((t) => t.id === act);
        if (activeRow && !activeRow.conversationId.trim()) {
          targetTabId = act;
          setAgentChatTabs((prev) =>
            prev.map((t) =>
              t.id === act
                ? { ...t, conversationId: convId, title: sessionTitle || 'Chat' }
                : t,
            ),
          );
        } else {
          const nid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tab_${Date.now()}`;
          targetTabId = nid;
          setAgentChatTabs((prev) => [
            ...prev,
            { id: nid, conversationId: convId, title: sessionTitle || 'Chat' },
          ]);
          setActiveAgentChatTabId(nid);
        }
      }

      if (!targetTabId) return;

      void hydrateAgentTabMessages(targetTabId, convId, forceReload);
    };
    window.addEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onConv);
    return () => window.removeEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onConv);
  }, [workspaceDisplayLine, hydrateAgentTabMessages]);

  useEffect(() => {
    const conv = activeAgentConversationId.trim();
    if (!conv) return;
    void hydrateAgentTabMessages(activeAgentChatTabId, conv, false);
  }, [activeAgentChatTabId, activeAgentConversationId, hydrateAgentTabMessages]);

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

  createNewAgentChatTabRef.current = createNewAgentChatTab;

  useEffect(() => {
    const onStartNewChat = (e: Event) => {
      const stayOnPage = (e as CustomEvent<StartNewAgentChatDetail>).detail?.stayOnPage === true;
      if (stayOnPage) {
        createNewAgentChatTabRef.current?.();
        if (agentPosition === 'off') setAgentPosition('right');
        return;
      }
      shellNewChat();
    };
    window.addEventListener(IAM_AGENT_START_NEW_CHAT, onStartNewChat);
    return () => window.removeEventListener(IAM_AGENT_START_NEW_CHAT, onStartNewChat);
  }, [shellNewChat, agentPosition]);

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
          detail: { ...detail, message, ensureAgentPanel: false },
        }),
      );
    });
  }, []);

  const flushPendingNewThread = useCallback(() => {
    if (!chatAssistantReadyRef.current) return;
    const pending = pendingNewThreadMessageRef.current;
    if (!pending?.message?.trim()) return;
    pendingNewThreadMessageRef.current = null;
    dispatchNewThreadMessage(pending);
  }, [dispatchNewThreadMessage]);

  flushPendingNewThreadRef.current = flushPendingNewThread;

  useEffect(() => {
    const onReady = () => {
      chatAssistantReadyRef.current = true;
      flushPendingNewThread();
    };
    const onUnmount = () => {
      chatAssistantReadyRef.current = false;
    };
    window.addEventListener(IAM_AGENT_CHAT_READY, onReady);
    window.addEventListener('iam-agent-chat-unmount', onUnmount);
    return () => {
      window.removeEventListener(IAM_AGENT_CHAT_READY, onReady);
      window.removeEventListener('iam-agent-chat-unmount', onUnmount);
    };
  }, [flushPendingNewThread]);

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

      if (isAgentHomeAtmospheric && !isNarrowViewport) {
        openPanelAndSend();
        return;
      }

      if (agentPosition === 'off') {
        pendingNewThreadMessageRef.current = normalized;
        setAgentPosition('right');
        return;
      }
      openPanelAndSend();
    },
    [agentPosition, createNewAgentChatTab, dispatchNewThreadMessage, isAgentHomeAtmospheric, isNarrowViewport],
  );

  useEffect(() => {
    const onNewThreadRequest = (e: Event) => {
      const detail = (e as CustomEvent<QuickstartThreadDetail>).detail;
      if (!detail?.message?.trim()) return;
      if (detail.ensureAgentPanel === false) return;
      e.stopImmediatePropagation();
      startAgentNewThreadWithMessage(detail);
    };
    window.addEventListener(IAM_AGENT_CHAT_NEW_THREAD, onNewThreadRequest, true);
    return () => window.removeEventListener(IAM_AGENT_CHAT_NEW_THREAD, onNewThreadRequest, true);
  }, [startAgentNewThreadWithMessage]);

  useEffect(() => {
    const onComposeRequest = (e: Event) => {
      const detail = (e as CustomEvent<AgentChatComposeDetail>).detail;
      if (detail?.closePanel) {
        setAgentPosition('off');
        return;
      }
      if (detail?.ensureAgentPanel !== false && agentPosition === 'off') {
        setAgentPosition('right');
      }
      if (!detail?.message?.trim()) return;
      if (detail.ensureAgentPanel === false) return;
      if (isAgentHomeAtmospheric && !isNarrowViewport) return;
      if (agentPosition !== 'off') return;
      pendingAgentChatComposeRef.current = detail;
      setAgentPosition('right');
    };
    window.addEventListener(IAM_AGENT_CHAT_COMPOSE, onComposeRequest);
    return () => window.removeEventListener(IAM_AGENT_CHAT_COMPOSE, onComposeRequest);
  }, [agentPosition, isAgentHomeAtmospheric, isNarrowViewport]);

  useEffect(() => {
    const pending = pendingAgentChatComposeRef.current;
    if (!pending || agentPosition === 'off') return;
    pendingAgentChatComposeRef.current = null;
    dispatchAgentChatCompose(pending);
  }, [agentPosition, dispatchAgentChatCompose]);

  useEffect(() => {
    if (!isAgentHomeAtmospheric) return;
    setAgentPosition('off');
  }, [isAgentHomeAtmospheric]);

  const openAgentQuickstart = useCallback(() => {
    navigate(AGENT_QUICKSTART_PATH);
  }, [navigate]);

  const handleAgentTabChange = useCallback(
    (tab: AgentHomeTab) => {
      const pathByTab: Record<AgentHomeTab, string> = {
        recent: AGENT_WORKSPACE_PATH,
        workspaces: `${AGENT_WORKSPACE_PATH}?${AGENT_TAB_QUERY}=workspaces`,
        systems: AGENT_SYSTEMS_PATH,
        examples: AGENT_EXAMPLES_PATH,
      };
      navigate(pathByTab[tab], { replace: true });
    },
    [navigate],
  );

  const handleAgentHomeModeSelect = useCallback(
    (mode: AgentModeId) => {
      const MODE_PREFIX: Record<Exclude<AgentModeId, 'code'>, string> = {
        write: 'Help me write: ',
        create: 'Help me create: ',
        learn: 'I want to learn about: ',
        life: 'Life stuff — ',
      };
      if (mode === 'code') return;
      const prefix = MODE_PREFIX[mode];
      dispatchAgentChatCompose({ message: prefix, ensureAgentPanel: false });
    },
    [dispatchAgentChatCompose],
  );

  const beginExamplesPrompt = useCallback(
    ({
      prompt,
      recipeId,
      source: _source,
    }: {
      prompt: string;
      recipeId?: string;
      source?: string;
    }) => {
      startAgentNewThreadWithMessage({
        message: prompt,
        task_type: 'design_intake',
        route_key: 'design_intake',
        quickstart_batch: QUICKSTART_BATCH_LABEL,
        apply_eto_after_run: true,
        workspace_id: QUICKSTART_WORKSPACE_ID,
        modelKey: 'auto',
      });
      if (recipeId) {
        fetch(`/api/cookbook/${encodeURIComponent(recipeId)}/use`, {
          method: 'POST',
          credentials: 'include',
        }).catch(() => {});
      }
    },
    [startAgentNewThreadWithMessage],
  );

  useEffect(() => {
    window.iamStartWorkspaceWithPrompt = beginExamplesPrompt;
    return () => {
      delete window.iamStartWorkspaceWithPrompt;
    };
  }, [beginExamplesPrompt]);

  const beginQuickstartTemplate = useCallback(
    (template: QuickstartTemplate) => {
      const surface = template.openSurface ?? null;
      const openExcalidraw =
        surface === 'excalidraw' || template.slug === 'card-flowchart';
      const openSketch =
        surface === 'sketch' ||
        surface === 'wireframe' ||
        template.slug === 'card-wireframe' ||
        template.slug === 'card-blank-canvas';
      if (openExcalidraw) {
        shellOpenDraw();
      } else if (openSketch) {
        shellOpenSketch();
      } else {
        navigate(AGENT_HOME_PATH);
      }
      startAgentNewThreadWithMessage({
        message: template.seedMessage,
        task_type: template.task_type,
        route_key: template.route_key,
        quickstart_batch: QUICKSTART_BATCH_LABEL,
        quickstart_card: template.slug,
        apply_eto_after_run: true,
        workspace_id: QUICKSTART_WORKSPACE_ID,
        modelKey: 'auto',
        surface: openExcalidraw ? 'excalidraw' : openSketch ? 'sketch' : undefined,
        ensureAgentPanel: true,
      });
    },
    [navigate, shellOpenDraw, shellOpenSketch, startAgentNewThreadWithMessage],
  );

  const selectAgentChatTab = useCallback(
    (tabId: string) => {
      setActiveAgentChatTabId(tabId);
      const row = agentChatTabs.find((t) => t.id === tabId);
      const conv = row?.conversationId?.trim() ?? '';
      try {
        if (conv) localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, conv);
        else localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
      } catch {
        /* ignore */
      }
      if (conv) {
        void hydrateAgentTabMessages(tabId, conv, false);
      }
    },
    [agentChatTabs, hydrateAgentTabMessages],
  );

  const closeAgentChatTab = useCallback(
    (tabId: string) => {
      const id = String(tabId || '').trim();
      if (!id) return;

      setAgentChatTabs((prev) => {
        if (prev.length <= 1) {
          setActiveAgentChatTabId(prev[0]?.id ?? id);
          setMessagesByTabId((mPrev) => ({
            ...mPrev,
            [prev[0]?.id ?? id]: [{ role: 'assistant' as const, content: buildAgentSamGreeting(workspaceDisplayLine) }],
          }));
          try {
            localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
          } catch {
            /* ignore */
          }
          return prev.map((t) => ({ ...t, conversationId: '', title: 'New chat' }));
        }

        const idx = prev.findIndex((t) => t.id === id);
        const nextTabs = prev.filter((t) => t.id !== id);
        if (activeAgentChatTabId === id) {
          const neighbor = nextTabs[Math.max(0, idx - 1)] ?? nextTabs[0];
          if (neighbor) {
            setActiveAgentChatTabId(neighbor.id);
            const conv = neighbor.conversationId.trim();
            try {
              if (conv) localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, conv);
              else localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
            } catch {
              /* ignore */
            }
            if (conv) void hydrateAgentTabMessages(neighbor.id, conv, false);
          }
        }
        return nextTabs;
      });

      setMessagesByTabId((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [activeAgentChatTabId, hydrateAgentTabMessages, workspaceDisplayLine],
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
    (agentChatLayout === 'center' || agentPosition !== 'off') &&
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

  const focusMobileCodeContext = useCallback(() => {
    if (agentPosition === 'off') setAgentPosition('right');
    window.dispatchEvent(new CustomEvent(IAM_AGENT_MOBILE_CODE_FOCUS));
  }, [agentPosition]);

  const engageAgentEditorWorkbench = useCallback(() => {
    setAgentPosition((p) => (p === 'off' ? 'right' : p));
    setOpenTabs((prev) => {
      let next = prev.includes('Workspace') ? [...prev] : ['Workspace', ...prev];
      if (!next.includes('browser')) next = [...next, 'browser'];
      return next;
    });
    setActiveTab((t) => (t === 'browser' || t === 'code' || t === 'cms' ? t : 'Workspace'));
    setActiveActivity('files');
  }, []);

  const openNewEditorFile = useCallback(() => {
    openFile({ name: 'Untitled.ts', content: '', originalContent: '' });
    setOpenTabs((p) => (p.includes('code') ? p : [...p, 'code']));
    setActiveTab('code');
    revealMainWorkspaceIfNarrow();
  }, [openFile, revealMainWorkspaceIfNarrow]);

  const focusCodeEditorFromChat = useCallback(() => {
    if (isNarrowViewport) {
      focusMobileCodeContext();
      return;
    }
    revealMainWorkspaceIfNarrow();
    if (activeFile) {
      openTab('code');
      return;
    }
    setActiveActivity('files');
    setOpenTabs((p) => (p.includes('code') ? p : [...p, 'code']));
    setActiveTab('code');
  }, [focusMobileCodeContext, isNarrowViewport, revealMainWorkspaceIfNarrow, openTab, activeFile]);

  const openEditorFromChat = useCallback(() => {
    if (!isAgentEditorPath(location.pathname)) {
      navigate(AGENT_EDITOR_PATH);
    }
    engageAgentEditorWorkbench();
  }, [location.pathname, navigate, engageAgentEditorWorkbench]);

  useEffect(() => {
    if (!isAgentEditorWorkbench || isNarrowViewport) return;
    engageAgentEditorWorkbench();
  }, [isAgentEditorWorkbench, isNarrowViewport, engageAgentEditorWorkbench]);

  const openInEditorFromExplorer = useCallback(
    (file: ActiveFile) => {
      openFile(prepareActiveFileForEditor(file));
      openTab('code');
      revealMainWorkspaceIfNarrow();
    },
    [openFile, openTab, revealMainWorkspaceIfNarrow],
  );

  const onExplorerWorkspaceRootChange = useCallback(({ folderName }: { folderName: string }) => {
    setIdeWorkspace({ source: 'local', folderName });
  }, []);

  /** Agent Sam SSE `surface_open` / orchestration — open the right workspace tab without new buttons. */
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<Record<string, unknown>>).detail;
      if (!d || typeof d !== 'object') return;
      const resolved = resolveAgentSurfaceTarget(d as Parameters<typeof resolveAgentSurfaceTarget>[0]);
      if (!resolved.surface) return;
      revealMainWorkspaceIfNarrow();

      if (resolved.cms) {
        if (resolved.cms.page_id) setCmsAgentPageId(resolved.cms.page_id);
        if (resolved.cms.panel) setCmsAgentPanel(resolved.cms.panel);
        openTab('cms');
        if (isNarrowViewport) setToastMsg('CMS panel opened in Agent workbench.');
        return;
      }

      if (resolved.surface === 'excalidraw') {
        shellOpenDraw({
          load_url: resolved.excalidraw?.load_url ?? null,
          artifact_id: resolved.excalidraw?.artifact_id ?? null,
        });
        if (isNarrowViewport) setToastMsg('Draw opened. Tap Chat to return to Agent Sam.');
        return;
      }

      if (resolved.surface === 'sketch') {
        shellOpenSketch(resolved.sketch ?? undefined);
        if (isNarrowViewport) setToastMsg('Sketch studio opened. Tap Chat to return to Agent Sam.');
        return;
      }

      if (resolved.surface === 'moviemode') {
        navigate('/dashboard/moviemode');
        if (isNarrowViewport) setToastMsg('MovieMode opened. Tap Chat to return to Agent Sam.');
        return;
      }

      if (resolved.surface === 'browser') {
        const devUrl = devServer?.url?.trim();
        const safeUrl = sanitizeBrowserNavigateUrl(
          resolved.browserUrl ||
            (resolved.reason === 'devserver' && devUrl ? devUrl : null) ||
            (typeof d.url === 'string' ? d.url : ''),
        );
        setBrowserPreviewSource('agent');
        if (safeUrl) {
          setBrowserAddressDisplay(null);
          setBrowserTabTitle(null);
          setBrowserUrl(safeUrl);
        }
        openTab('browser');
        if (isNarrowViewport) setToastMsg('Browser tab opened. Tap Chat to return to Agent Sam.');
        return;
      }

      if (resolved.surface === 'code') {
        if (resolved.localFile?.workspace_path) {
          openFile({
            name: resolved.localFile.workspace_path.split('/').pop() || 'untitled',
            workspacePath: resolved.localFile.workspace_path,
            content: '',
          });
        }
        openTab('code');
        if (isNarrowViewport) setToastMsg('Code editor opened. Tap Chat to return to Agent Sam.');
        return;
      }

      if (resolved.surface === 'r2') {
        if (resolved.r2?.bucket && resolved.r2?.key && resolved.r2.preview) {
          const bucket = resolved.r2.bucket;
          const key = resolved.r2.key;
          if (/\.(?:html?|dc\.html)$/i.test(key)) {
            void (async () => {
              const { openR2KeyInEditor } = await import('./src/lib/mediaPreview');
              const opened = await openR2KeyInEditor(bucket, key, (f) => {
                const prepared = prepareActiveFileForEditor(f);
                openFile(prepared);
                openTab('code');
                window.setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent('iam:open-editor-preview', { detail: { file: prepared } }),
                  );
                }, 0);
              });
              if (!opened) {
                setToastMsg('Could not open HTML artifact for preview.');
              }
              return;
            })();
            return;
          }
          const previewUrl = buildR2ObjectUrl(bucket, key);
          setBrowserPreviewSource('agent');
          setBrowserUrl(previewUrl);
          openTab('browser');
          return;
        }
        window.dispatchEvent(
          new CustomEvent('iam:palette-open-r2', {
            detail: { bucket: resolved.r2?.bucket || undefined },
          }),
        );
        return;
      }

      if (resolved.surface === 'terminal') {
        setIsTerminalOpen(true);
      }
    };
    window.addEventListener('iam:agent-open-surface', h as EventListener);
    return () => window.removeEventListener('iam:agent-open-surface', h as EventListener);
  }, [openTab, revealMainWorkspaceIfNarrow, isNarrowViewport, shellOpenDraw, navigate, devServer, openFile]);

  /** Artifacts → category/builder: open Agent workbench tab without leaving chat-first flow on phone. */
  useEffect(() => {
    const onOpenBuilder = (e: Event) => {
      const detail = (e as CustomEvent<ArtifactOpenBuilderDetail>).detail;
      const tab = detail?.tab ?? 'code';
      if (tab === 'moviemode') {
        navigate('/dashboard/moviemode');
        if (isNarrowViewport) setToastMsg('Movie Mode opened. Tap Chat to return to Agent Sam.');
        return;
      }
      if (tab === 'excalidraw') {
        shellOpenDraw();
        if (isNarrowViewport) setToastMsg('Draw opened. Tap Chat to return to Agent Sam.');
        return;
      }
      if (!isAgentShellPath(location.pathname)) navigate(AGENT_HOME_PATH);
      revealMainWorkspaceIfNarrow();
      openTab(tab === 'Workspace' || tab === 'code' || tab === 'browser' ? tab : 'code');
      if (isNarrowViewport) setToastMsg('Builder opened. Tap Chat to return to Agent Sam.');
    };
    window.addEventListener(IAM_ARTIFACT_OPEN_BUILDER, onOpenBuilder);
    return () => window.removeEventListener(IAM_ARTIFACT_OPEN_BUILDER, onOpenBuilder);
  }, [location.pathname, navigate, openTab, revealMainWorkspaceIfNarrow, isNarrowViewport, shellOpenDraw]);

  /** Browser / cdt_* tool activity — do not auto-open Browser tab; surfaces open only on explicit SSE `surface_open`. */

  const consumeGithubExpandRepo = useCallback(() => setGithubExpandRepo(null), []);

  useEffect(() => {
    const handleOpenR2Palette = (e: Event) => {
      const r2BucketName = (e as CustomEvent<{ bucket?: string }>).detail?.bucket?.trim();
      revealMainWorkspaceIfNarrow();
      if (!isAgentShellPath(location.pathname) && location.pathname !== '/dashboard/meet') {
        navigate(AGENT_HOME_PATH);
      }
      setActiveActivity('files');
      window.dispatchEvent(
        new CustomEvent('iam-palette-open-r2', { detail: { bucket: r2BucketName || undefined } }),
      );
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
    // Editor mount: do NOT force Monaco or the files activity panel on landing.
    // Chat-first layout — user navigates to /editor and sees center chat, just like /agent/new.
    // Monaco + file panel open naturally when a file is selected (openInEditorFromExplorer → openFile → openTab('code')).
    if (!isAgentEditorPath(location.pathname)) return;
    if (isNarrowViewport) {
      // Mobile still gets code context focus since it uses a different layout.
      focusMobileCodeContext();
    }
    // Desktop: intentionally no-op — center chat takes over on landing.
  }, [location.pathname, focusMobileCodeContext, isNarrowViewport]);

  /**
   * Tracks which editor pathname we've already attempted an auto-open for, so
   * this effect can't re-fire openRecentEntry() while a previous call for the
   * same path is still in flight. workspaceDashboardRecentFiles and
   * openRecentEntry can both get new identities on renders that happen before
   * the in-flight fetch resolves (e.g. while typing triggers the debounced
   * recentFiles write), and without this guard each such re-render queued
   * another GET to the same /api/github/repos/.../contents URL — the actual
   * cause of the ERR_INSUFFICIENT_RESOURCES crash loop on this page.
   */
  const autoOpenAttemptedForPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAgentEditorPath(location.pathname)) return;
    if (activeFile) {
      autoOpenAttemptedForPathRef.current = null;
      return;
    }
    if (autoOpenAttemptedForPathRef.current === location.pathname) return;
    const recent = workspaceDashboardRecentFiles.find(shouldAutoOpenRecentOnEditorBoot);
    if (!recent) return;
    autoOpenAttemptedForPathRef.current = location.pathname;
    void openRecentEntry(recent);
  }, [location.pathname, activeFile, workspaceDashboardRecentFiles, openRecentEntry]);

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
      const d = (e as CustomEvent<{ open?: boolean; tab?: ShellTab }>).detail;
      if (d && typeof d.open === 'boolean') {
        setIsTerminalOpen(d.open);
        if (d.open) {
          setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
          if (d.tab) {
            setTimeout(() => terminalRef.current?.setActiveTab(d.tab), 50);
          }
        }
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
    if (!isAgentEditorPath(location.pathname)) {
      navigate(AGENT_EDITOR_PATH);
      engageAgentEditorWorkbench();
      setActiveActivity('files');
      return;
    }
    setActiveActivity((prev) => (prev === 'files' ? null : 'files'));
  }, [location.pathname, navigate, engageAgentEditorWorkbench]);

  useEffect(() => {
    if (!isAgentHomePath(location.pathname)) return;
    if (activeActivity === 'files') setActiveActivity(null);
  }, [location.pathname, activeActivity]);

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
    activity: 'files' | 'mcps' | 'git' | 'debug' | 'actions' | 'drive' | 'database',
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
        navigate('/dashboard/chats');
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
    [navigate],
  );

  const fetchHealth = useCallback(async () => {
    try {
      const [hr, sr] = await Promise.all([
        fetch('/api/health', { credentials: 'same-origin' }),
        fetch('/api/sandbox/health', { credentials: 'same-origin' }),
      ]);
      const hj = await hr.json().catch(() => ({}));
      if (hr.ok) setHealthOk(hj.status === 'ok' || hr.ok);
      else setHealthOk(false);
      if (sr.ok) {
        const sj = await sr.json().catch(() => ({}));
        setSandboxOk(sj.ok === true);
        void sj.exec_smoke;
      } else {
        setSandboxOk(false);
      }
    } catch {
      setHealthOk(false);
      setSandboxOk(false);
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
    (gitData: {
      branch?: string;
      repo?: string;
      repo_full_name?: string;
      ahead_by?: number | null;
      behind_by?: number | null;
      tracking_branch?: string;
      default_branch?: string;
    }) => {
      const repo = gitData.repo_full_name
        ? coalesceLabel(gitData.repo_full_name, '')
        : gitData.repo
          ? coalesceLabel(gitData.repo, '')
          : '';
      const branchName = gitData.branch ? String(gitData.branch) : '';
      if (branchName) setGitBranch(branchName);
      if (repo) setGitRepoFullName(repo);
      if (gitData.ahead_by != null && Number.isFinite(Number(gitData.ahead_by))) {
        setGitAhead(Number(gitData.ahead_by));
      } else {
        setGitAhead(null);
      }
      if (gitData.behind_by != null && Number.isFinite(Number(gitData.behind_by))) {
        setGitBehind(Number(gitData.behind_by));
      } else {
        setGitBehind(null);
      }
      const track =
        gitData.tracking_branch != null && String(gitData.tracking_branch).trim()
          ? String(gitData.tracking_branch).trim()
          : gitData.default_branch != null && String(gitData.default_branch).trim()
            ? String(gitData.default_branch).trim()
            : null;
      setGitTrackingBranch(track);
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
          details_url: String(data.details_url || '/dashboard/settings/keys#security-findings'),
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
      } else {
        setTerminalOk(false);
      }
    } catch {
      setTerminalOk(false);
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

    try {
      const intRes = await fetch('/api/settings/integrations/connected', cred);
      const intData = await intRes.json().catch(() => ({}));
      if (intRes.ok && intData && typeof intData === 'object') {
        const items = Array.isArray((intData as { items?: unknown[] }).items)
          ? ((intData as { items: unknown[] }).items as Parameters<typeof localTunnelVerificationStale>[0])
          : [];
        setTunnelStale(localTunnelVerificationStale(items));
      } else {
        setTunnelStale(false);
      }
    } catch {
      setTunnelStale(false);
    }

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
  }, [fetchHealth, fetchTunnelStatusOnly, fetchTerminalConfigOnly, fetchTelemetryPoll, applyGitStatusPayload, applyProblemsPayload, authWorkspaceId]);

  const handleGitSyncPublish = useCallback(async () => {
    const ws = authWorkspaceId?.trim();
    setGitSyncBusy(true);
    try {
      const res = await fetch('/api/agent/git/publish', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: ws || undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        build_uuid?: string;
      };
      if (!res.ok || !j.ok) {
        setToastMsg(j.error || `Deploy trigger failed (${res.status})`);
        return;
      }
      const buildHint = j.build_uuid ? ` Build ${String(j.build_uuid).slice(0, 8)}…` : '';
      setToastMsg(`Workers Builds deploy triggered.${buildHint}`);
      void fetchGitAndProblems();
      void fetchLiveStatus();
    } catch (e) {
      setToastMsg(e instanceof Error ? e.message : 'Deploy trigger failed');
    } finally {
      setGitSyncBusy(false);
    }
  }, [authWorkspaceId, fetchGitAndProblems, fetchLiveStatus]);

  useEffect(() => {
    const onGitSync = () => void handleGitSyncPublish();
    window.addEventListener(IAM_GIT_SYNC_PUBLISH, onGitSync);
    return () => window.removeEventListener(IAM_GIT_SYNC_PUBLISH, onGitSync);
  }, [handleGitSyncPublish]);

  useEffect(() => {
    if (agentsamChatPolicy && typeof agentsamChatPolicy === 'object') {
      const m = Number(agentsamChatPolicy.max_tab_count);
      if (Number.isFinite(m) && m >= 2) {
        maxTabsPolicyRef.current = Math.min(48, Math.max(2, Math.floor(m)));
      }
    }
  }, [agentsamChatPolicy]);

  const applyDashboardBootstrapPayload = useCallback((boot: DashboardBootstrapPayload | null | undefined) => {
    if (!boot) return;
    const st = boot.status;
    if (st) {
      if (st.health?.status === 'ok') setHealthOk(true);
      if (st.sandbox && typeof st.sandbox.ok === 'boolean') setSandboxOk(st.sandbox.ok);
      if (Array.isArray(st.notifications)) {
        setAgentNotifications(st.notifications as AgentNotificationRow[]);
      }
      if (st.git) {
        if (st.git.branch) setGitBranch(coalesceLabel(st.git.branch, ''));
        const repo = coalesceLabel(st.git.repo_full_name, '');
        if (repo) setGitRepoFullName(repo);
        if (st.git.git_hash) setGitHash(coalesceLabel(st.git.git_hash, ''));
      }
      if (st.problems && typeof st.problems === 'object') {
        applyProblemsPayload(st.problems as Record<string, unknown>);
      }
      if (st.tunnel && typeof st.tunnel.healthy === 'boolean') {
        setTunnelHealthy(st.tunnel.healthy);
        const ts = st.tunnel.status != null ? String(st.tunnel.status) : '';
        setTunnelLabel(ts === 'connected' ? 'connected' : ts || null);
      }
      if (st.terminal) {
        if (typeof st.terminal.ready === 'boolean') {
          setTerminalOk(st.terminal.ready);
        } else if (st.terminal.status) {
          setTerminalOk(String(st.terminal.status) === 'connected');
        }
      }
    }
  }, [applyProblemsPayload]);

  useEffect(() => {
    const cached = readDashboardBootstrapCache();
    if (cached) applyDashboardBootstrapPayload(cached);
    const onBoot = (e: Event) => {
      const detail = (e as CustomEvent<DashboardBootstrapPayload>).detail;
      applyDashboardBootstrapPayload(detail);
    };
    window.addEventListener('iam_dashboard_bootstrap', onBoot);
    return () => window.removeEventListener('iam_dashboard_bootstrap', onBoot);
  }, [applyDashboardBootstrapPayload]);

  useEffect(() => {
    // Polling (ms): health 5m, notifications 2m, git+problems 3m, tunnel 5m, terminal config 10m,
    // telemetry 5m. Paused while tab hidden (visibilitychange). Skipped until session is confirmed
    // so unauthenticated / half-loaded shells do not stampede D1.
    if (!sessionUserId) return;

    const ids: number[] = [];
    const clearAll = () => {
      ids.forEach((id) => clearInterval(id));
      ids.length = 0;
    };

    const startAll = () => {
      clearAll();
      if (typeof document !== 'undefined' && document.hidden) return;

      const freshBootstrap = readDashboardBootstrapCache(60_000);
      if (freshBootstrap) {
        applyDashboardBootstrapPayload(freshBootstrap);
      } else {
        void fetchHealth();
        void fetchNotifications();
        void fetchGitAndProblems();
        void fetchSecurityShieldPulse(true);
        void fetchTunnelStatusOnly();
        void fetchTerminalConfigOnly();
      }
      void fetchTelemetryPoll();

      ids.push(window.setInterval(() => void fetchHealth(), 300_000));
      ids.push(window.setInterval(() => void fetchNotifications(), 120_000));
      ids.push(window.setInterval(() => void fetchGitAndProblems(), 180_000));
      ids.push(window.setInterval(() => void fetchTunnelStatusOnly(), 300_000));
      ids.push(window.setInterval(() => void fetchTerminalConfigOnly(), 600_000));
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
    sessionUserId,
    fetchHealth,
    fetchNotifications,
    fetchGitAndProblems,
    fetchSecurityShieldPulse,
    fetchTunnelStatusOnly,
    fetchTerminalConfigOnly,
    fetchTelemetryPoll,
    applyDashboardBootstrapPayload,
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
        navigate(AGENT_EDITOR_PATH);
        engageAgentEditorWorkbench();
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
  }, [location.pathname, navigate, engageAgentEditorWorkbench]);

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
      const onAgentRoute = browserPreviewSource === 'agent';
      const agentLive =
        onAgentRoute &&
        (event.agent_live === true ||
          event.automation === true ||
          Boolean(activeAgentRunId?.trim()));
      const automation = onAgentRoute && !agentLive && event.automation === true;
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
      if (agentLive && activeAgentRunId?.trim()) {
        window.dispatchEvent(
          new CustomEvent('iam-browser-agent-live', {
            detail: {
              url,
              agent_run_id: activeAgentRunId.trim(),
              live_view_url: event.live_view_url,
              session_id: event.session_id,
            },
          }),
        );
      }
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
    [revealMainWorkspaceIfNarrow, isNarrowViewport, browserPreviewSource, activeAgentRunId],
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
        previewSource: 'editor',
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
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new CustomEvent('iam:monaco-layout'));
    }, 50);
  }, []);

  /** Preview: HTML/SVG/MD use EditorPreviewPane; JSX/TSX via dev server; BrowserView is for live URLs only. */
  const openEditorPreviewForFile = useCallback(
    (file: ActiveFile) => {
      const name = file.name || '';
      if (!isRenderablePreviewFilename(name)) return;
      if (!file.content?.trim() && !(file.r2Bucket?.trim() && file.r2Key?.trim())) return;

      const content = file.content ?? '';
      const bytes = new TextEncoder().encode(content).length;
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      const mode = resolvePreviewMode({ fileName: name, workspace: ideWorkspace, bytes });
      const r2Bucket = file.r2Bucket?.trim();
      const r2Key = file.r2Key?.trim();
      const isHtml = ext === 'html' || ext === 'htm';

      setEditorPreviewOpen(true);
      setOpenTabs((prev) => (prev.includes('code') ? prev : [...prev, 'code']));
      setActiveTab('code');

      if (isHtml && r2Bucket && r2Key) {
        const hasRelativeAssets =
          Boolean(content.trim()) &&
          (/<script[^>]+src=["'](?!https?:\/\/|\/\/|data:|blob:)[^"']+["']/i.test(content) ||
            /<link[^>]+href=["'](?!https?:\/\/|\/\/|data:|blob:)[^"']*\.(?:css|js)["']/i.test(content));
        if (!content.trim() || hasRelativeAssets) {
          if (bytes >= PREVIEW_WARN_BYTES) {
            setToastMsg(`Large file (${(bytes / 1e6).toFixed(1)} MB) — preview may be slow.`);
          }
          setEditorPreviewMode('devserver');
          setEditorPreviewSrcDoc(null);
          setEditorPreviewUrl(buildR2ObjectUrl(r2Bucket, r2Key));
          setEditorPreviewLoading(false);
          setEditorPreviewStatus(
            hasRelativeAssets
              ? 'Serving from R2 so linked assets resolve — use a dev server for full fidelity.'
              : null,
          );
          setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
            window.dispatchEvent(new CustomEvent('iam:monaco-layout'));
          }, 50);
          return;
        }
      }

      if (mode === 'srcdoc') {
        if (ext === 'svg' && !content.trim()) {
          setToastMsg('SVG is empty — nothing to preview.');
          return;
        }
        if (bytes >= PREVIEW_WARN_BYTES && (isHtml || ext === 'md')) {
          setToastMsg(`Large file (${(bytes / 1e6).toFixed(1)} MB) — preview may be slow.`);
        }
        const hasRelativeAssets =
          isHtml &&
          (/<script[^>]+src=["'](?!https?:\/\/|\/\/|data:|blob:)[^"']+["']/i.test(content) ||
            /<link[^>]+href=["'](?!https?:\/\/|\/\/|data:|blob:)[^"']*\.(?:css|js)["']/i.test(content));
        setEditorPreviewMode('srcdoc');
        setEditorPreviewSrcDoc(buildPreviewSrcDoc(name, content));
        setEditorPreviewUrl(null);
        setEditorPreviewLoading(false);
        setEditorPreviewStatus(
          hasRelativeAssets
            ? 'Relative assets may not resolve in inline preview — use a dev server for full fidelity.'
            : null,
        );
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
          window.dispatchEvent(new CustomEvent('iam:monaco-layout'));
        }, 50);
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
    },
    [ideWorkspace, devServer, runInTerminal],
  );

  const openEditorPreview = useCallback(() => {
    if (!activeFile) return;
    openEditorPreviewForFile(activeFile);
  }, [activeFile, openEditorPreviewForFile]);

  useEffect(() => {
    const onOpenPreview = (e: Event) => {
      const file = (e as CustomEvent<{ file?: ActiveFile }>).detail?.file;
      if (file) {
        openEditorPreviewForFile(file);
        return;
      }
      if (activeFile) openEditorPreviewForFile(activeFile);
    };
    window.addEventListener('iam:open-editor-preview', onOpenPreview);
    return () => window.removeEventListener('iam:open-editor-preview', onOpenPreview);
  }, [activeFile, openEditorPreviewForFile]);

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
    const onStudioOutput = (e: Event) => {
      const d = (e as CustomEvent<{ line?: string; open?: boolean; tab?: ShellTab }>).detail;
      if (!d?.line) return;
      handleTerminalOutputLine(d.line);
      if (!d.open) return;
      setIsTerminalOpen(true);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      setTimeout(() => terminalRef.current?.setActiveTab(d.tab ?? 'output'), 50);
    };
    window.addEventListener('iam-terminal-output', onStudioOutput as EventListener);
    return () => window.removeEventListener('iam-terminal-output', onStudioOutput as EventListener);
  }, [handleTerminalOutputLine]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--terminal-drawer-h',
      isTerminalOpen ? `${terminalDrawerH}px` : '0px',
    );
    return () => {
      document.documentElement.style.setProperty('--terminal-drawer-h', '0px');
    };
  }, [isTerminalOpen, terminalDrawerH]);

  useEffect(() => {
    const onInvalidateActiveThemeFetch = () => {
      void fetchAndApplyActiveCmsTheme(authWorkspaceId);
    };
    window.addEventListener('iam:invalidate-active-theme-fetch', onInvalidateActiveThemeFetch);
    return () => window.removeEventListener('iam:invalidate-active-theme-fetch', onInvalidateActiveThemeFetch);
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
  // Studio needs full canvas on mobile — never let agent panel hide it
  const narrowBlocksCenter =
    isNarrowViewport && agentChatLayout !== 'center' && agentPosition !== 'off' && !isDesignStudioRoute;
  /** Explorer drawer has its own close control — no floating back pill while files panel is open. */
  const narrowNeedsBack =
    isNarrowViewport &&
    (agentChatLayout === 'center' || agentPosition !== 'off' || (!!activeActivity && activeActivity !== 'files'));

  const mobileBackLabel = useMemo(
    () =>
      narrowNeedsBack
        ? mobileNavBackLabel({
            agentChatOpen: agentChatLayout === 'center' || agentPosition !== 'off',
            activeActivity,
            pathname: location.pathname,
          })
        : null,
    [narrowNeedsBack, agentChatLayout, agentPosition, activeActivity, location.pathname],
  );

  const statusIndentLabel = useMemo(
    () => `${editorMeta.insertSpaces ? 'Spaces' : 'Tabs'}: ${editorMeta.tabSize}`,
    [editorMeta.insertSpaces, editorMeta.tabSize],
  );

  const platformHealthIssues = useMemo(
    () =>
      buildPlatformHealthIssues({
        healthOk,
        tunnelHealthy,
        tunnelStale,
        terminalOk,
        sandboxOk,
        workspaceDrift,
      }),
    [healthOk, tunnelHealthy, tunnelStale, terminalOk, sandboxOk, workspaceDrift],
  );

  const agentSamChatShellTabs = useMemo(
    () => (showAgentWorkbenchTabs ? agentChatTabs.map((t) => ({ id: t.id, title: t.title })) : undefined),
    [showAgentWorkbenchTabs, agentChatTabs],
  );

  const handleGlbFileSelectFromChat = useCallback(
    (file: File) => {
      const glbUrl = URL.createObjectURL(file);
      setGlbViewerUrl((prev) => {
        if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return glbUrl;
      });
      setGlbViewerFilename(file.name);
      navigate('/dashboard/designstudio', {
        state: { pendingGlb: { url: glbUrl, name: file.name.replace(/\.glb$/i, '') } },
      });
    },
    [navigate],
  );

  const agentSamChatHostProps = useMemo(
    () => ({
      fallbackProject: activeProject,
      activeFileContent: activeFile?.content,
      activeFileName: activeFile?.name,
      activeFile,
      editorCursorLine: cursorPos.line,
      editorCursorColumn: cursorPos.col,
      agentsamPolicy: agentsamChatPolicy,
      workspaceId: authWorkspaceId,
      defaultSubagentSlug: isDesignStudioRoute ? ('cadcreator' as const) : undefined,
      composerPlaceholder:
        isCmsRoute
          ? 'Update a page, publish changes, or ask Agent Sam to edit this CMS site…'
          : designStudioEntryAtmospheric
          ? 'Describe a 3D model, import a GLB, or ask Agent Sam to create…'
          : drawEntryAtmospheric
            ? 'Sketch a diagram or flowchart with Agent Sam on Excalidraw…'
            : sketchEntryAtmospheric
              ? 'Concept, layout, or blueprint — describe what to sketch with Agent Sam…'
            : undefined,
      messages: chatMessages,
      setMessages: setChatMessages,
      onOpenChatHistory: shellOpenChatHistory,
      onDeleteActiveChat: shellDeleteActiveChat,
      onFileSelect: openInMonacoFromChat,
      onGlbFileSelect: handleGlbFileSelectFromChat,
      onRunInTerminal: runInTerminal,
      onR2FileUpdated: handleR2FileUpdatedFromAgent,
      onBrowserNavigate: handleBrowserNavigateFromAgent,
      onOpenGitHubIntegration: openGitHubFromChat,
      onMobileOpenDashboard: openDashboardFromChat,
      onOpenQuickstart: openAgentQuickstart,
      onOpenCodeTab: focusCodeEditorFromChat,
      onOpenEditor: openEditorFromChat,
      onLoadingChange: setAgentIsStreaming,
      onApprovalRequired: setActiveCommandRunId,
      agentRunId: activeCommandRunId,
      syncedHostConversationId: activeAgentConversationId,
      showAgentWorkbenchTabs,
      agentChatShellTabs: agentSamChatShellTabs,
      activeAgentChatShellTabId: activeAgentChatTabId,
      onAgentChatShellTabSelect: selectAgentChatTab,
      onAgentChatShellTabClose: closeAgentChatTab,
      onAgentChatShellNewTab: createNewAgentChatTab,
      onAgentRunContext: setActiveAgentRunId,
      activeWorkbenchTab: isMovieModeRoute
        ? 'moviemode'
        : isDesignStudioRoute
          ? 'designstudio'
        : isCmsRoute
          ? 'cms'
          : activeTab === 'cms'
            ? 'cms'
            : isDrawRoute
              ? 'draw'
              : isSketchRoute
                ? 'sketch'
              : activeTab,
      browserUrl,
      openFilePaths: agentWorkbenchOpenFiles,
      activePlanId: activePlanIdForChat,
      onActivePlanChange: handleActivePlanChange,
      cmsContext: cmsWorkbenchContext,
      hostWorkspaceContext: agentWorkspaceContext,
      dashboardRouteKey: routeAgentMeta.route_key,
      dashboardTaskType: routeAgentMeta.task_type || null,
      dashboardRouteLabel: routeAgentMeta.context_label,
      routeQuickActions: routeAgentMeta.quickActions,
      availableConnectors,
      availableConnectorsLoading,
    }),
    [
      activeProject,
      activeFile,
      cursorPos.line,
      cursorPos.col,
      agentsamChatPolicy,
      authWorkspaceId,
      isDesignStudioRoute,
      designStudioEntryAtmospheric,
      drawEntryAtmospheric,
      sketchEntryAtmospheric,
      chatMessages,
      setChatMessages,
      shellOpenChatHistory,
      shellDeleteActiveChat,
      openInMonacoFromChat,
      handleGlbFileSelectFromChat,
      runInTerminal,
      handleR2FileUpdatedFromAgent,
      handleBrowserNavigateFromAgent,
      openGitHubFromChat,
      openDashboardFromChat,
      openAgentQuickstart,
      focusCodeEditorFromChat,
      openEditorFromChat,
      activeCommandRunId,
      activeAgentConversationId,
      showAgentWorkbenchTabs,
      agentSamChatShellTabs,
      activeAgentChatTabId,
      selectAgentChatTab,
      closeAgentChatTab,
      createNewAgentChatTab,
      isMovieModeRoute,
      isCmsRoute,
      activeTab,
      isDrawRoute,
      isSketchRoute,
      browserUrl,
      agentWorkbenchOpenFiles,
      activePlanIdForChat,
      handleActivePlanChange,
      cmsWorkbenchContext,
      agentWorkspaceContext,
      routeAgentMeta.route_key,
      routeAgentMeta.task_type,
      routeAgentMeta.context_label,
      routeAgentMeta.quickActions,
      availableConnectors,
      availableConnectorsLoading,
    ],
  );

  return (
    <DesignStudioProvider>
    <div className="w-full h-[100dvh] bg-[var(--dashboard-canvas)] overflow-hidden text-[var(--dashboard-text)] font-sans flex flex-col">
      {!isCmsFullscreen ? <OfflineReconnectBanner /> : null}
      {!isCmsFullscreen ? <PwaUpdateBanner /> : null}
      {!isCmsFullscreen ? <SessionExpiredGate /> : null}
      {!isCmsFullscreen ? <InstallCoach /> : null}
      <div
        className="iam-agent-browser-live-vignette"
        data-active={agentBrowserPresenceActive ? 'true' : 'false'}
        aria-hidden="true"
      />
      {/* 1. TOP WINDOW BAR + mobile hamburger (sticky ≤430px) — hidden in fullscreen CMS editor */}
      {!isCmsFullscreen ? (
      <header className="iam-chrome-topbar shrink-0 z-[110] max-phone:sticky max-phone:top-0">
      <div className="h-10 border-b border-[var(--dashboard-border)] flex items-center justify-between px-3 overflow-visible relative">
          <div className="flex items-center gap-1 pl-1 shrink-0 min-w-0">
              {/* Mobile: hamburger (MobileNavShell inline) then logo */}
              <div className="hidden max-phone:flex items-center shrink-0">
                <MobileNavHamburger
                  open={mobileNavOpen}
                  backMode={mobileHamburgerConversationBack}
                  onClick={mobileHamburgerConversationBack && narrowBackToAgentHome ? narrowBackToAgentHome : () => setMobileNavOpen(v => !v)}
                />
              </div>
              {/* IAM logo — tap to open workspace/store switcher (Shopify-style) */}
              <button
                type="button"
                title={`${workspaceDisplayLine} — tap to switch workspace`}
                onClick={() => setWorkspaceLauncherOpen(true)}
                className="flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-[var(--bg-hover)] transition-colors group shrink-0"
                aria-label="Switch workspace"
              >
                <img
                  src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail"
                  alt=""
                  className="w-7 h-7 object-contain drop-shadow shrink-0 opacity-80 group-hover:opacity-100 transition-opacity"
                />
                <ChevronLeft size={10} strokeWidth={2.5} className="rotate-[270deg] text-muted group-hover:text-main transition-colors shrink-0 hidden tablet-up:block" />
              </button>
          </div>

          {/* Unified search (Cmd+K) — desktop center; mobile lives in right cluster */}
          <div className="iam-topbar-desktop-only flex-1 flex justify-center items-center min-w-0 px-2 gap-2 overflow-visible max-phone:hidden">
              <UnifiedSearchBar
                workspaceLabel={editorDevContext ? workspaceDisplayLine : userProfileLabel}
                gitBranch={editorDevContext ? gitBranch : undefined}
                hideWorkspaceSegment={false}
                activeWorkspaceId={authWorkspaceId}
                workspaceRepoHint={activeWorkspaceRow?.github_repo ?? null}
                onGitBranchSelect={handleStatusBarBranchSelect}
                onOpenCommandPalette={openCommandPalette}
                onGitBranchPanelClick={() => {
                  setActiveActivity('git');
                  if (!isAgentShellPath(location.pathname)) navigate(AGENT_HOME_PATH);
                }}
                onWorkspacePickerClick={() => setWorkspaceLauncherOpen(true)}
                recentFiles={mappedRecentFiles}
                onNavigate={(nav, _q) => handleUnifiedNavigate(nav)}
                onRunCommand={(cmd) => terminalRef.current?.runCommand(cmd)}
                controlledOpen={searchOpen}
                onControlledOpenChange={onUnifiedSearchOpenChange}
                initialFacets={searchInitialFacets}
                initialQuery={searchInitialQuery}
                onInitialQueryConsumed={() => setSearchInitialQuery('')}
                shellDropdownHost={!isNarrowViewport}
                onConnectionMenuAction={handleConnectionMenuAction}
              />
          </div>

          {/* Right layout cluster — mobile: Search icon + More; desktop adds terminal/globe/etc. */}
          <div className="flex gap-0.5 items-center mr-1 shrink-0 max-phone:ml-auto">
              <div className="iam-topbar-mobile-only hidden max-phone:block shrink-0">
                <UnifiedSearchBar
                  workspaceLabel={editorDevContext ? workspaceDisplayLine : userProfileLabel}
                  gitBranch={editorDevContext ? gitBranch : undefined}
                  activeWorkspaceId={authWorkspaceId}
                  workspaceRepoHint={activeWorkspaceRow?.github_repo ?? null}
                  onGitBranchSelect={handleStatusBarBranchSelect}
                  onOpenCommandPalette={openCommandPalette}
                  onGitBranchPanelClick={() => {
                    setActiveActivity('git');
                    if (!isAgentShellPath(location.pathname)) navigate(AGENT_HOME_PATH);
                  }}
                  onWorkspacePickerClick={() => setWorkspaceLauncherOpen(true)}
                  hideWorkspaceSegment
                  mobileToolbar
                  recentFiles={mappedRecentFiles}
                  onNavigate={(nav, _q) => handleUnifiedNavigate(nav)}
                  onRunCommand={(cmd) => terminalRef.current?.runCommand(cmd)}
                  controlledOpen={searchOpen}
                  onControlledOpenChange={onUnifiedSearchOpenChange}
                  initialFacets={searchInitialFacets}
                  initialQuery={searchInitialQuery}
                  onInitialQueryConsumed={() => setSearchInitialQuery('')}
                  shellDropdownHost={isNarrowViewport}
                  onConnectionMenuAction={handleConnectionMenuAction}
                />
              </div>

              <button
                  type="button"
                  title="Open Browser"
                  className="iam-topbar-desktop-only max-phone:hidden p-1.5 rounded transition-colors text-muted hover:text-white hover:bg-[var(--bg-hover)]"
                  onClick={() => {
                    openTab('browser');
                  }}
              >
                  <Globe size={15} strokeWidth={1.75} />
              </button>
              <button
                  type="button"
                  title="Toggle agent panel"
                  className={`iam-topbar-desktop-only max-phone:hidden p-1.5 rounded transition-colors ${agentPosition !== 'off' ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-muted hover:text-white hover:bg-[var(--bg-hover)]'}`}
                  onClick={onChatLayoutToggle}
              >
                  {agentPosition === 'left' ? <PanelLeftClose size={15} strokeWidth={1.75} /> : <PanelRightClose size={15} strokeWidth={1.75} />}
              </button>



              <button
                  type="button"
                  title="Terminal (Cmd+J)"
                  className={`iam-topbar-desktop-only max-phone:hidden p-1.5 rounded transition-colors ${isTerminalOpen ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-muted hover:text-white hover:bg-[var(--bg-hover)]'}`}
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
              <div className="iam-topbar-desktop-only relative hidden tablet-up:block" ref={topChromeMoreRef}>
                  <button
                      type="button"
                      title="More tools"
                      className={`p-1.5 rounded transition-colors ${topChromeMoreOpen ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-muted hover:text-white hover:bg-[var(--bg-hover)]'}`}
                      onClick={() => setTopChromeMoreOpen((v) => !v)}
                  >
                      <MoreHorizontal size={15} strokeWidth={1.75} />
                  </button>
                  {topChromeMoreOpen && (
                      <div className="absolute right-0 top-full mt-1 z-[120] min-w-[200px] rounded-lg border border-[var(--dashboard-border)] bg-[var(--bg-elevated)] shadow-xl py-1">
                          {location.pathname !== '/dashboard/meet' ? (
                          <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-main hover:bg-[var(--bg-hover)]"
                              onClick={() => {
                                  setTopChromeMoreOpen(false);
                                  shellOpenDraw();
                              }}
                          >
                              <PenTool size={14} className="text-muted" />
                              Draw
                          </button>
                          ) : null}
                          <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-main hover:bg-[var(--bg-hover)]"
                              onClick={() => {
                                  setTopChromeMoreOpen(false);
                                  navigate('/dashboard/chats');
                              }}
                          >
                              <Search size={14} className="text-muted" />
                              Chats
                          </button>
                          <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-main hover:bg-[var(--bg-hover)]"
                              onClick={() => {
                                  setTopChromeMoreOpen(false);
                                  navigate('/dashboard/overview');
                              }}
                          >
                              <History size={14} className="text-muted" />
                              History
                          </button>
                      </div>
                  )}
              </div>
          </div>
      </div>
      </header>
      ) : null}

      {/* MobileNavDrawer — hamburger button moved into topbar left cluster */}
      {!isCmsFullscreen ? (
      <MobileNavShell
        open={mobileNavOpen}
        onToggle={() => setMobileNavOpen((v) => !v)}
        onClose={() => setMobileNavOpen(false)}
        showBack={narrowNeedsBack && !mobileHamburgerConversationBack}
        backLabel={mobileBackLabel}
        onBack={narrowBackToCenter}
        hamburgerBackMode={mobileHamburgerConversationBack}
        onHamburgerBack={narrowBackToAgentHome}
        onNewChat={shellNewChat}
        onOpenChats={shellOpenChats}
        onOpenMovieMode={shellOpenMovieMode}
        onSelectChat={shellSelectChat}
        onDeleteActiveChat={shellDeleteActiveChat}
        activeConversationId={activeAgentConversationId}
        workspaceLabel={userProfileLabel}
        avatarUrl={sessionAvatarUrl}
        avatarInitial={
          sessionUserName?.trim()?.charAt(0)?.toUpperCase() ||
          sessionUserId?.charAt(0)?.toUpperCase() ||
          undefined
        }
        workspaceSubtitle={
          editorDevContext && gitBranch?.trim() ? gitBranch.trim() : undefined
        }
      />
      ) : null}

      {securityShieldAlert && !securityBannerDismissed && !isCmsFullscreen && (
        <SecurityShieldBanner
          message={securityShieldAlert.message}
          detailsUrl={securityShieldAlert.details_url}
          openFindingsCount={securityShieldAlert.open_findings_count}
          auditEvents24h={securityShieldAlert.audit_events_24h}
          onDismiss={() => setSecurityBannerDismissed(true)}
        />
      )}

      <div className={`flex flex-1 overflow-hidden ${isCmsFullscreen ? 'min-h-0 h-full' : ''}`}>
          {/* 2. ACTIVITY BAR (Extreme Left) — hidden ≤430px; use bottom tab bar + More */}
          {/* Activity bar: icon rail (width toggled via ☰ — localStorage iam_sidebar_expanded) */}
          {!isCmsFullscreen ? (
          <div
            className="iam-chrome-sidebar hidden tablet-up:flex flex-col h-full min-h-0 py-3 gap-1 px-1 border-r border-[var(--dashboard-border)] shrink-0 z-50 overflow-x-hidden overflow-y-auto transition-[width] duration-200 ease-in-out"
            style={{ width: sidebarRailExpanded ? 200 : 48 }}
          >
              <DashboardSidebar
                expanded={sidebarRailExpanded}
                onToggleExpanded={toggleSidebarRail}
                onNewChat={shellNewChat}
                onOpenChats={shellOpenChats}
                onOpenMovieMode={shellOpenMovieMode}
                onSelectChat={shellSelectChat}
                onDeleteActiveChat={shellDeleteActiveChat}
                activeConversationId={activeAgentConversationId}
                workspaceLabel={userProfileLabel}
                avatarUrl={sessionAvatarUrl}
                avatarInitial={
                  sessionUserName?.trim()?.charAt(0)?.toUpperCase() ||
                  sessionUserId?.charAt(0)?.toUpperCase() ||
                  undefined
                }
                workspaceSubtitle={
                  editorDevContext && gitBranch?.trim() ? gitBranch.trim() : undefined
                }
              />
          </div>
          ) : null}

          {/* Optional Left Agent Panel */}
          {agentChatLayout === 'left-rail' ? (
            <AgentSamChatHost
              {...agentSamChatHostProps}
              layout="left-rail"
              agentW={agentW}
              isNarrowViewport={isNarrowViewport}
              activeActivity={activeActivity}
              narrowNeedsBack={narrowNeedsBack}
              mobileEdgeSwipeHandlers={mobileEdgeSwipeHandlers}
              productLabel={PRODUCT_NAME}
              onResizePointerDown={(e) => beginPanelResize('agent', e)}
            />
          ) : null}

          <div className="flex flex-1 min-w-0 overflow-hidden">
          {activeActivity && isNarrowViewport ? (
            <button
              type="button"
              className="iam-mobile-activity-scrim max-phone:block hidden"
              onClick={() => setActiveActivity(null)}
              aria-label="Close panel"
            />
          ) : null}
          <div 
              className={`transition-all duration-75 shrink-0 bg-[var(--dashboard-panel)] flex flex-col z-40 overflow-hidden shadow-2xl tablet-up:shadow-none hover:border-[var(--solar-cyan)] relative group
              ${
                activeActivity
                  ? 'tablet-up:relative tablet-up:left-0 border-r border-[var(--dashboard-border)] opacity-100 pointer-events-auto max-phone:iam-mobile-activity-sheet'
                  : 'border-none opacity-0 pointer-events-none max-phone:iam-mobile-activity-sheet'
              }`}
              data-open={activeActivity ? 'true' : 'false'}
              style={
                isNarrowViewport
                  ? activeActivity
                    ? {
                        width: 0,
                        ['--iam-mobile-activity-vh' as string]: `${mobileActivityPanelVh}dvh`,
                      }
                    : { width: 0 }
                  : { width: activeActivity ? sidebarW : 0 }
              }
              {...(narrowNeedsBack && !!activeActivity ? mobileEdgeSwipeHandlers : {})}
          >
              <div className="w-full h-full flex flex-col relative max-phone:iam-mobile-activity-sheet-body">
                  {isNarrowViewport && activeActivity ? (
                    <div
                      role="separator"
                      aria-orientation="horizontal"
                      aria-label="Resize panel height"
                      title="Drag to resize panel"
                      className="iam-mobile-activity-sheet-handle max-phone:flex hidden"
                      onPointerDown={beginMobileActivitySheetResize}
                    />
                  ) : null}
                  {location.pathname === '/dashboard/meet' && meetCtxValue ? (
                      <MeetProvider value={meetCtxValue}>
                        <MeetShellPanel />
                      </MeetProvider>
                  ) : activeActivity === 'files' && isAgentEditorPath(location.pathname) ? (
                      <Suspense fallback={<ActivityPanelFallback />}>
                        <AgentSamFilesystem
                          workspace_id={authWorkspaceId}
                          user_id={sessionUserId}
                          nativeFolderOpenSignal={nativeFolderOpenSignal}
                          onWorkspaceRootChange={onExplorerWorkspaceRootChange}
                          onFileSelect={openInEditorFromExplorer}
                          onOpenInEditor={openInEditorFromExplorer}
                          onClose={() => setActiveActivity(null)}
                          pinnedGithubRepo={activeWorkspaceRow?.github_repo ?? gitRepoFullName ?? null}
                        />
                      </Suspense>
                  ) : activeActivity === 'mcps' ? (
                      <Suspense fallback={<ActivityPanelFallback />}>
                        <MCPPanel />
                      </Suspense>
                  ) : activeActivity === 'actions' ? (
                      <Suspense fallback={<ActivityPanelFallback />}>
                        <GitHubExplorer
                          workspace_id={authWorkspaceId}
                          expandRepoFullName={githubExpandRepo}
                          onExpandRepoConsumed={consumeGithubExpandRepo}
                          onOpenInEditor={openInEditorFromExplorer}
                          onClose={() => setActiveActivity(null)}
                        />
                      </Suspense>
                  ) : activeActivity === 'drive' ? (
                      <Suspense fallback={<ActivityPanelFallback />}>
                        <GoogleDriveExplorer onOpenInEditor={openInEditorFromExplorer} />
                      </Suspense>
                  ) : activeActivity === 'debug' ? (
                      <div className="p-4 text-xs text-muted">Redirecting to terminal problems...</div>
                  ) : activeActivity === 'git' ? (
                      <Suspense fallback={<ActivityPanelFallback />}>
                        <SourcePanel />
                      </Suspense>
                  ) : activeActivity === 'database' ? (
                      <Suspense fallback={<ActivityPanelFallback />}>
                        <DatabaseBrowser
                          explorerJump={dbExplorerJump}
                          onExplorerJumpConsumed={() => setDbExplorerJump(null)}
                          onClose={() => setActiveActivity(null)}
                        />
                      </Suspense>
                  ) : activeActivity === 'files' ? (
                      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
                        <p className="text-[12px] text-muted">The file explorer lives in the Agent editor.</p>
                        <button
                          type="button"
                          className="text-[11px] px-3 py-2 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-canvas)] text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] transition-colors"
                          onClick={() => navigate(AGENT_EDITOR_PATH)}
                        >
                          Open editor
                        </button>
                      </div>
                  ) : location.pathname !== '/dashboard/meet' ? (
                      <div className="p-4 text-xs text-muted">Panel empty.</div>
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
          {/* Mobile activity sheet — vertical drag on handle inside panel (28–75vh, default 35) */}

          {/* 4. MAIN EDITOR AREA */}
          <main 
              className={`flex-1 flex flex-col min-w-0 min-h-0 relative max-phone:overflow-x-hidden ${narrowBlocksCenter && !isCmsFullscreen ? 'max-phone:hidden' : ''} ${isCmsFullscreen ? 'min-w-0 z-[10]' : ''} ${isCenterChatAtmospheric ? 'bg-transparent' : 'bg-[var(--dashboard-canvas)]'}`}
              onDrop={handleMainFileDrop}
              onDragOver={handleMainDragOver}
          >
              {isAgentHomePath(location.pathname) && !activeActivity && (
                <button
                  type="button"
                  className="hidden tablet-up:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 flex-col items-center gap-1 py-3 px-1 rounded-r-md border border-l-0 border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] text-muted hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/40 shadow-md transition-colors"
                  title="Open editor explorer (⌘B)"
                  aria-label="Open editor explorer"
                  onClick={() => {
                    navigate(AGENT_EDITOR_PATH);
                    engageAgentEditorWorkbench();
                    setActiveActivity('files');
                  }}
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
                      <Route path="/dashboard" element={<Navigate to={AGENT_HOME_PATH} replace />} />
                      <Route path="/dashboard/calendar" element={<Navigate to="/dashboard/collaborate" replace />} />
                      <Route path="/dashboard/home" element={<DashboardHome />} />
                      <Route path="/dashboard/overview" element={<OverviewPage />} />
                      <Route
                        path="/dashboard/finance"
                        element={
                          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-y-contain">
                            <FinanceDashboard />
                          </div>
                        }
                      />
                      <Route path="/dashboard/library" element={<Navigate to="/dashboard/artifacts" replace />} />
                      <Route path="/dashboard/artifacts" element={<LibraryPage />} />
                      <Route path="/dashboard/artifacts/tickets" element={<LibraryPage />} />
                      <Route path="/dashboard/artifacts/*" element={<LibraryPage />} />
                      <Route path="/dashboard/projects" element={<ProjectsPage />} />
                      <Route path="/dashboard/projects/:projectId" element={<ProjectDetailPage />} />
                      <Route path="/dashboard/tasks" element={<TasksPage />} />
                      <Route path="/dashboard/chats" element={<ChatsPage />} />
                      <Route path="/dashboard/launch-desk" element={<Navigate to="/dashboard/collaborate" replace />} />
                      <Route
                        path="/dashboard/collaborate"
                        element={
                          <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
                            <LaunchDeskPage />
                          </div>
                        }
                      />
                      <Route
                        path="/dashboard/book/:slug"
                        element={
                          <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                            <BookPage />
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
                        path="/dashboard/database/:databaseName"
                        element={
                          <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
                            <DatabasePage />
                          </div>
                        }
                      />
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
                        element={<Navigate to="/dashboard/settings/docs" replace />}
                      />
                      <Route
                        path="/dashboard/integrations"
                        element={
                          <Navigate to="/dashboard/settings/integrations" replace />
                        }
                      />
                      <Route
                        path="/dashboard/moviemode/:projectId?"
                        element={
                          <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
                            <MovieModePage />
                          </div>
                        }
                      />
                      <Route
                        path="/dashboard/draw"
                        element={
                          <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
                            <DrawPage
                              onEntryPhaseChange={setDrawEntryPhase}
                              onComposerHost={setDrawComposerHost}
                              onMessagesHost={setDrawMessagesHost}
                            />
                          </div>
                        }
                      />
                      <Route
                        path="/dashboard/sketch"
                        element={
                          <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
                            <SketchPage
                              onEntryPhaseChange={setSketchEntryPhase}
                              onComposerHost={setSketchComposerHost}
                              onMessagesHost={setSketchMessagesHost}
                            />
                          </div>
                        }
                      />
                      <Route
                        path="/dashboard/cms/sites"
                        element={<Navigate to="/dashboard/cms" replace />}
                      />
                      <Route
                        path="/dashboard/cms"
                        element={
                          <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
                            <CmsPage workspaceId={authWorkspaceId || undefined} />
                          </div>
                        }
                      />
                      <Route
                        path="/dashboard/cms/*"
                        element={
                          <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
                            <CmsPage workspaceId={authWorkspaceId || undefined} />
                          </div>
                        }
                      />
                      <Route
                        path="/dashboard/designstudio"
                        element={
                          <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
                            <DesignStudioPage
                              onEntryPhaseChange={setDesignStudioEntryPhase}
                              onComposerHost={setDesignStudioComposerHost}
                              onMessagesHost={setDesignStudioMessagesHost}
                            />
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
                      <Route path="/dashboard/mail" element={
                        <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
                          <MailPage />
                        </div>
                      } />
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
              {/* Editor Tabs — lazy, closeable (hidden on atmospheric /agent home) */}
              {!isCenterChatAtmospheric && (
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
                                  {activeFile ? activeFile.name : 'Code'}
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
                              className="shrink-0 h-8 w-8 p-0 inline-flex items-center justify-center rounded-md border border-[var(--dashboard-border)] bg-[var(--bg-hover)] text-main hover:bg-[var(--dashboard-panel)] hover:border-[var(--solar-cyan)]"
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
                              className="shrink-0 h-8 w-8 p-0 inline-flex items-center justify-center rounded-md border border-[var(--dashboard-border)] bg-[var(--bg-hover)] text-main hover:bg-[var(--dashboard-panel)] hover:border-[var(--solar-cyan)]"
                          >
                              <Link2 size={14} className="text-muted" strokeWidth={1.75} aria-hidden />
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
                  {openTabs.includes('cms') && (
                      <Tab
                          title="CMS"
                          icon={<PenTool size={13} className="text-[var(--solar-orange)]"/>}
                          active={activeTab === 'cms'}
                          onClick={() => setActiveTab('cms')}
                          onClose={(e) => closeTab('cms', e)}
                      />
                  )}
                  {/* Tab row tools — mobile: globe + terminal; desktop: + Browser text */}
                  <div className="ml-auto flex items-center gap-0.5 pr-2 shrink-0">
                      {!openTabs.includes('browser') && (
                        <>
                          <button
                            type="button"
                            title="Open Browser"
                            className="hidden max-phone:block p-1.5 rounded transition-colors text-muted hover:text-white hover:bg-[var(--bg-hover)]"
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
                        className={`hidden max-phone:block p-1.5 rounded transition-colors ${isTerminalOpen ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-muted hover:text-white hover:bg-[var(--bg-hover)]'}`}
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
              )}

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

                  {showAgentHomeScene && (
                      <div className="absolute inset-0 z-10 flex flex-col items-stretch min-h-0 min-w-0 w-full">
                          <AgentHome
                            displayName={agentHomeGreetingName}
                            showHero={agentHomeShowHero}
                            terminalDocked={isTerminalOpen}
                            onComposerHost={setAgentHomeComposerHost}
                            onMessagesHost={setAgentHomeMessagesHost}
                            onModeSelect={handleAgentHomeModeSelect}
                          />
                      </div>
                  )}

                  {((isAgentWorkspaceBrowser || isAgentEditorWorkbench) &&
                    activeTab === 'Workspace' &&
                    !isCenterChatAtmospheric) && (
                      <div className="absolute inset-0 z-10">
                          <WorkspaceDashboardV2 
                            onOpenFolder={() => {
                              setActiveActivity('files');
                              setNativeFolderOpenSignal(n => n + 1);
                            }}
                            onConnectWorkspace={() => setWorkspaceLauncherOpen(true)}
                            onGithubSync={() => {
                              if (isNarrowViewport) {
                                openGitHubFromChat();
                                return;
                              }
                              setSearchInitialQuery('clone ');
                              setSearchOpen(true);
                            }}
                            recentFiles={workspaceDashboardRecentFiles}
                            onOpenRecent={openRecentEntry}
                            workspaceRows={workspaceRows}
                            authWorkspaceId={authWorkspaceId}
                            onSwitchWorkspace={persistActiveWorkspace}
                            onQuickstart={openAgentQuickstart}
                            activeAgentTab={agentWorkspaceTab}
                            onAgentTabChange={handleAgentTabChange}
                            onBeginTemplate={beginQuickstartTemplate}
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

                  {isAgentEditorWorkbench && activeTab === 'code' && !activeFile && (
                      <div className="absolute inset-0 z-10">
                        <EditorWorkbenchLanes
                          onOpenFileTree={() => setActiveActivity('files')}
                          onOpenFolder={() => {
                            setActiveActivity('files');
                            setNativeFolderOpenSignal((n) => n + 1);
                          }}
                          onBrowseWeb={() => openTab('browser')}
                          onNewFile={openNewEditorFile}
                          onOpenWorkspace={() => setActiveTab('Workspace')}
                          recentFiles={mappedRecentFiles}
                          onOpenRecent={(path) => {
                            const entry = workspaceDashboardRecentFiles.find(
                              (f) =>
                                f.workspacePath === path ||
                                f.githubPath === path ||
                                f.r2Key === path ||
                                f.id === path,
                            );
                            if (entry) void openRecentEntry(entry);
                          }}
                        />
                      </div>
                  )}

                  {showMonacoWorkbench && (
                      <div ref={editorPreviewSplitRef} className="absolute inset-0 z-10 flex min-h-0 min-w-0">
                          <div
                            className="flex flex-col min-h-0 min-w-0 shrink-0"
                            style={
                              editorPreviewOpen
                                ? {
                                    flex: `0 0 ${editorPreviewEditorPct}%`,
                                    minWidth: EDITOR_PREVIEW_PANEL_MIN_PX,
                                  }
                                : { flex: '1 1 auto', width: '100%' }
                            }
                          >
                            <Suspense
                              fallback={
                                <div className="flex h-full items-center justify-center text-[12px] text-muted">
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
                            <>
                              <div
                                role="separator"
                                aria-orientation="vertical"
                                title="Drag to resize editor and preview"
                                aria-label="Resize editor and preview panels"
                                className="shrink-0 z-50 flex justify-center cursor-col-resize touch-none select-none group relative"
                                style={{ width: AGENT_RESIZER_HIT_PX }}
                                onPointerDown={beginEditorPreviewResize}
                              >
                                <span
                                  className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--dashboard-border)] group-hover:bg-[var(--solar-cyan)] group-active:bg-[var(--solar-cyan)] transition-colors"
                                  aria-hidden
                                />
                              </div>
                              <div
                                className="flex flex-col min-h-0 min-w-0 shrink-0"
                                style={{
                                  flex: `1 1 ${100 - editorPreviewEditorPct}%`,
                                  minWidth: EDITOR_PREVIEW_PANEL_MIN_PX,
                                }}
                              >
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
                            </>
                          ) : null}
                      </div>
                  )}
                  {activeTab === 'browser' && (
                      <div className="absolute inset-0 z-10 overflow-hidden">
                          <Suspense
                            fallback={
                              <div className="flex items-center justify-center h-full text-muted text-sm">
                                Loading browser…
                              </div>
                            }
                          >
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
                          </Suspense>
                      </div>
                  )}
                  {activeTab === 'cms' && (
                      <div className="absolute inset-0 z-10 overflow-hidden">
                          <Suspense
                            fallback={
                              <div className="flex items-center justify-center h-full text-muted text-sm">
                                Loading CMS studio…
                              </div>
                            }
                          >
                            <CmsStudioEditor
                              projectSlug={cmsWorkbenchContext?.project_slug ?? null}
                              pageId={cmsWorkbenchContext?.page_id ?? null}
                              panel={cmsWorkbenchContext?.studio_panel ?? 'pages'}
                              agentSamCmsShell
                              workspaceId={authWorkspaceId || ''}
                              workspaceLabel={workspaceDisplayLine}
                              publicDomain={cmsWorkspaceContext?.public_domain ?? null}
                              studioUrl={cmsWorkspaceContext?.studio_url ?? null}
                            />
                          </Suspense>
                      </div>
                  )}

                  </div>

                  {/* Agent page keeps integrated terminal mount (existing behavior). */}
                  {isTerminalOpen && (
                      <Suspense
                        fallback={
                          <div className="flex flex-1 items-center justify-center text-[11px] text-muted">
                            Loading terminal…
                          </div>
                        }
                      >
                        <XTermShell
                          ref={terminalRef}
                          onClose={() => setIsTerminalOpen(false)}
                          problems={systemProblems ?? []}
                          onProblemsTabOpen={() => void fetchGitAndProblems()}
                          iamOrigin={typeof window !== 'undefined' ? window.location.origin : 'https://inneranimalmedia.com'}
                          workspaceLabel={workspaceDisplayLine}
                          workspaceId={termWs.activeWorkspaceId || undefined}
                          targetType={termWs.recommendedTargetType}
                          splashStatus={termWs.splashStatus}
                          splashStatusLoading={termWs.statusLoading}
                          onConnected={(cwd) => termWs.markConnected(cwd, termWs.recommendedTargetType)}
                          productLabel={PRODUCT_NAME}
                          layout="page"
                          outputLines={shellOutputLines}
                          onOutputLine={handleTerminalOutputLine}
                          workspaceContext={agentWorkspaceContext}
                          sessionUserId={sessionUserId}
                        />
                      </Suspense>
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
                  <Suspense
                    fallback={
                      <div className="flex flex-1 items-center justify-center text-[11px] text-muted">
                        Loading terminal…
                      </div>
                    }
                  >
                    <XTermShell
                      ref={terminalRef}
                      iamOrigin={window.location.origin}
                      workspaceLabel={workspaceContextLabel || ''}
                      workspaceId={termWs.activeWorkspaceId || ''}
                      targetType={termWs.recommendedTargetType}
                      splashStatus={termWs.splashStatus}
                      splashStatusLoading={termWs.statusLoading}
                      onConnected={(cwd) => termWs.markConnected(cwd, termWs.recommendedTargetType)}
                      productLabel="IAM"
                      layout="drawer"
                      outputLines={shellOutputLines}
                      onOutputLine={handleTerminalOutputLine}
                      problems={systemProblems ?? []}
                      onProblemsTabOpen={() => void fetchGitAndProblems()}
                      onClose={() => setIsTerminalOpen(false)}
                      sessionUserId={sessionUserId}
                    />
                  </Suspense>
                </div>
              </div>
              )}
              {!isCmsFullscreen && agentChatLayout === 'center' ? (
                <AgentSamChatHost
                  {...agentSamChatHostProps}
                  layout="center"
                  agentW={agentW}
                  isNarrowViewport={isNarrowViewport}
                  activeActivity={activeActivity}
                  narrowNeedsBack={narrowNeedsBack}
                  mobileEdgeSwipeHandlers={mobileEdgeSwipeHandlers}
                  productLabel={PRODUCT_NAME}
                  atmosphericHomeMode={routeEntryAtmospheric}
                  composerPortalTarget={
                    designStudioEntryAtmospheric
                      ? designStudioComposerHost
                      : drawEntryAtmospheric
                        ? drawComposerHost
                        : sketchEntryAtmospheric
                          ? sketchComposerHost
                        : null
                  }
                  messagesPortalTarget={
                    designStudioEntryAtmospheric
                      ? designStudioMessagesHost
                      : drawEntryAtmospheric
                        ? drawMessagesHost
                        : sketchEntryAtmospheric
                          ? sketchMessagesHost
                        : null
                  }
                />
              ) : null}
          </main>
          </div>

          {/* 6. Optional Right Agent Panel */}
          {agentChatLayout === 'right-rail' ? (
            <AgentSamChatHost
              {...agentSamChatHostProps}
              layout="right-rail"
              agentW={agentW}
              isNarrowViewport={isNarrowViewport}
              activeActivity={activeActivity}
              narrowNeedsBack={narrowNeedsBack}
              mobileEdgeSwipeHandlers={mobileEdgeSwipeHandlers}
              productLabel={PRODUCT_NAME}
              onResizePointerDown={(e) => beginPanelResize('agent', e)}
            />
          ) : null}
      </div>
      {/* 8. STATUS BAR (FOOTER) */}
      {toastMsg && (
        <div
          className={`fixed bottom-16 left-1/2 z-[200] -translate-x-1/2 px-4 py-2 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-canvas)] text-[11px] text-main shadow-lg max-w-md text-center ${
            showStatusBar
              ? 'max-phone:[bottom:calc(56px+1.5rem+env(safe-area-inset-bottom,0px)+8px)]'
              : 'max-phone:[bottom:calc(56px+env(safe-area-inset-bottom,0px)+8px)]'
          }`}
          role="status"
        >
          {toastMsg}
        </div>
      )}



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
            style={{ bottom: `calc(${showStatusBar ? '1.5rem + ' : ''}env(safe-area-inset-bottom, 0px) + 52px)` }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--dashboard-border)] shrink-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">More</span>
              <button
                type="button"
                className="p-2 rounded-md text-muted hover:bg-[var(--bg-hover)] hover:text-main"
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
                • More → "Chats" → /dashboard/chats (full session list; sidebar teaser uses the same useAgentChatSessions hook).
              */}
              <MobileMoreRow icon={Search} label="Chats" onClick={() => { setMobileMoreOpen(false); navigate('/dashboard/chats'); }} />
              <MobileMoreRow icon={GitBranch} label="Source Control" onClick={() => { setMobileMoreOpen(false); toggleActivity('git'); }} />
              <MobileMoreRow icon={Bug} label="Run & Debug" onClick={() => { setMobileMoreOpen(false); toggleActivity('debug'); }} />
              <MobileMoreRow icon={Layers} label="Tools & MCP" onClick={() => { setMobileMoreOpen(false); toggleActivity('mcps'); }} />
              <MobileMoreRow icon={Cloud} label="Cloud Sync" onClick={() => { setMobileMoreOpen(false); toggleActivity('drive'); }} />
              <MobileMoreRow icon={Monitor} label="Engine View" onClick={() => { setMobileMoreOpen(false); navigate('/dashboard/designstudio'); }} />
              <MobileMoreRow icon={Rocket} label="Collaborate" onClick={() => { setMobileMoreOpen(false); navigate('/dashboard/collaborate'); }} />
            </div>
          </div>
        </>
      )}

      {showStatusBar ? (
      <StatusBar 
        branch={gitBranch}
        gitHash={gitHash}
        workspace={workspaceContextLabel}
        workspaceMenuItems={statusBarWorkspaceItems.length > 0 ? statusBarWorkspaceItems : undefined}
        activeWorkspaceId={authWorkspaceId}
        onWorkspaceMenuSelect={handleStatusBarWorkspacePick}
        onBranchSelect={handleStatusBarBranchSelect}
        aheadCount={gitAhead}
        behindCount={gitBehind}
        trackingBranch={gitTrackingBranch}
        syncBusy={gitSyncBusy}
        onSyncPublish={handleGitSyncPublish}
        onOpenCommandPalette={openCommandPalette}
        errorCount={errorCount}
        warningCount={warningCount}
        showCursor={activeTab === 'code'}
        line={cursorPos.line}
        col={cursorPos.col}
        version={SHELL_VERSION}
        healthOk={healthOk}
        platformHealthIssues={platformHealthIssues}
        tunnelHealthy={tunnelHealthy}
        tunnelLabel={tunnelLabel}
        terminalOk={terminalOk}
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
      ) : null}

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
            if (location.pathname.startsWith('/dashboard/database')) {
              const nextPath = databaseStudioPathForWorkspace({
                slug: ws.slug,
                github_repo: ws.github_repo ?? null,
              });
              if (nextPath !== location.pathname) {
                navigate(nextPath, { replace: true });
              }
            }
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
    </DesignStudioProvider>
  );
};

// --- Helper UI Components ---
type LucideLike = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

const MobileMoreRow: React.FC<{ icon: LucideLike; label: string; onClick: () => void }> = ({ icon: Icon, label, onClick }) => (
  <button
    type="button"
    className="flex w-full items-center gap-3 min-h-[44px] rounded-lg px-3 text-left text-[13px] text-main hover:bg-[var(--bg-hover)] transition-colors border border-transparent hover:border-[var(--dashboard-border)]"
    onClick={onClick}
  >
    <Icon size={20} strokeWidth={1.5} className="shrink-0 text-muted" />
    <span>{label}</span>
  </button>
);

const Tab: React.FC<{ title: React.ReactNode, icon: React.ReactNode, active: boolean, onClick: () => void, onClose?: (e: React.MouseEvent) => void }> = ({ title, icon, active, onClick, onClose }) => (
    <div 
        onClick={onClick}
        className={`h-full flex items-center gap-1.5 pl-3 pr-2 text-[12px] select-none cursor-pointer border-r border-[var(--dashboard-border)] relative group whitespace-nowrap shrink-0 ${
            active 
                ? 'bg-[var(--dashboard-canvas)] text-[var(--solar-cyan)]' 
                : 'bg-[var(--dashboard-panel)] text-muted hover:bg-[var(--bg-hover)]'
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
        className="text-[10px] px-2 py-0.5 rounded text-muted hover:text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] transition-colors border border-transparent hover:border-[var(--dashboard-border)] font-sans"
        title={`Open ${label}`}
    >
        + {label}
    </button>
);

export default App;
