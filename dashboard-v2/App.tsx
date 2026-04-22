
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useLocation, Routes, Route, Navigate } from 'react-router-dom';
import { VoxelEngine } from './services/VoxelEngine';
import { StudioSidebar } from './components/StudioSidebar';
import { UIOverlay } from './components/UIOverlay';
import { ChatAssistant } from './components/ChatAssistant';
import { WorkspaceDashboard } from './components/WorkspaceDashboard';
import { MCPPanel } from './components/MCPPanel';
import { IAM_AGENT_CHAT_CONVERSATION_CHANGE, LS_AGENT_CHAT_CONVERSATION_ID } from './agentChatConstants';
import { WorkspaceLauncher } from './components/WorkspaceLauncher';
import { XTermShell, XTermShellHandle } from './components/XTermShell';
import { ExtensionsPanel } from './components/ExtensionsPanel';
import { MonacoEditorView, type EditorModelMeta } from './components/MonacoEditorView';
import { LocalExplorer } from './components/LocalExplorer';
import { BrowserView } from './components/BrowserView';
import { SettingsPanel } from './components/SettingsPanel';
import { ToolLauncherBar } from './components/ToolLauncherBar';
import { StatusBar, type AgentNotificationRow } from './components/StatusBar';
import { ExcalidrawView } from './components/ExcalidrawView';
import { DatabaseBrowser, type DatabaseExplorerJump } from './components/DatabaseBrowser';
import { UnifiedSearchBar, type UnifiedSearchNavigate } from './components/UnifiedSearchBar';
import { GitHubActionsPanel } from './components/GitHubActionsPanel';
import { GitHubExplorer } from './components/GitHubExplorer';
import { KnowledgeSearchPanel } from './components/KnowledgeSearchPanel';
// import { ProblemsDebugPanel } from './components/ProblemsDebugPanel';
import { WorkspaceExplorerPanel } from './components/WorkspaceExplorerPanel';
import { GoogleDriveExplorer } from './components/GoogleDriveExplorer';
import { R2Explorer } from './components/R2Explorer';
import { PlaywrightConsole } from './components/PlaywrightConsole';
import { SourcePanel } from './components/SourcePanel';
import { ProjectType, AppState, GameEntity, GenerationConfig, ArtStyle, SceneConfig, CADTool, CustomAsset, CADPlane, type ActiveFile } from './types';
import { SHELL_VERSION } from './src/shellVersion';
import {
  fetchAndApplyActiveCmsTheme,
  applyCachedCmsThemeFallback,
  migrateLegacyThemeLocalStorage,
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
import { useEditor } from './src/EditorContext';
import { CalendarPage } from './components/CalendarPage';
import { Sparkles, Files, Search, GitBranch, PlayCircle, Blocks, Box, Settings, PanelLeft, PanelLeftClose, PanelRightClose, Terminal as TermIcon, LayoutTemplate, Network, Layers, Monitor, ChevronDown, Bug, Github, Database, FolderOpen, Globe, PenTool, Cloud, X as XIcon, Columns2, PanelBottom, Eye, MessageSquare, MoreHorizontal, ChevronLeft, Link2, HardDrive, Package, Plane } from 'lucide-react';

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

const App: React.FC = () => {
  const { tabs, activeTabId, openFile, updateActiveContent, saveActiveFile } = useEditor();
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VoxelEngine | null>(null);
  const terminalRef = useRef<XTermShellHandle>(null);
  const collabWsRef = useRef<WebSocket | null>(null);
  
  const [activeProject, setActiveProject] = useState<ProjectType>(ProjectType.SANDBOX);
  const [appState, setAppState] = useState<AppState>(AppState.EDITING);
  const [voxelCount, setVoxelCount] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customAssets, setCustomAssets] = useState<CustomAsset[]>([]);
  
  // History Management
  const [undoStack, setUndoStack] = useState<GameEntity[]>([]);
  const [redoStack, setRedoStack] = useState<GameEntity[]>([]);

  // IDE State
  type TabId = 'Workspace' | 'welcome' | 'engine' | 'code' | 'browser' | 'glb' | 'excalidraw';
  const [activeActivity, setActiveActivity] = useState<'cad' | 'files' | 'search' | 'mcps' | 'git' | 'debug' | 'remote' | 'actions' | 'projects' | 'settings' | 'drive' | 'playwright' | null>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? null : 'files',
  );
  const [agentPosition, setAgentPosition] = useState<'right' | 'left' | 'off'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'off' : 'right',
  );
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  /** Layout: optional split editor chrome (reserved for Monaco split view). */
  const [splitLayout, setSplitLayout] = useState(false);
  /** Mirrored from Lab shell for Output tab (build / r2 / help). */
  const [shellOutputLines, setShellOutputLines] = useState<string[]>([]);

  const [ideWorkspace, setIdeWorkspace] = useState<IdeWorkspaceSnapshot>(() => ({ source: 'none' }));
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);
  const [gitBranch, setGitBranch] = useState(() => 'main');
  const [agentChatConversationId, setAgentChatConversationId] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(LS_AGENT_CHAT_CONVERSATION_ID)?.trim() || '' : '',
  );
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
  const [isWorkspaceLauncherOpen, setWorkspaceLauncherOpen] = useState(false);

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

  // IAM_COLLAB real-time sync — canvas + theme updates
  useEffect(() => {
    const workspaceId = 'global';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/api/collab/room/${workspaceId}`;
    const ws = new WebSocket(wsUrl);
    collabWsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'theme_update' && msg.cssVars) {
          Object.entries(msg.cssVars).forEach(([k, v]) => {
            document.documentElement.style.setProperty(k, v as string);
          });
        }
        if (msg.type === 'canvas_update') {
          window.dispatchEvent(new CustomEvent('iam:canvas_update', { detail: msg.elements }));
        }
      } catch (_) {}
    };
    ws.onerror = () => {}; // suppress unhandled rejection noise
    return () => {
      try { ws.close(); } catch (_) {}
    };
  }, []);

  /** From GET /api/settings/workspaces (`current` = default_workspace_id); drives theme ?workspace= */
  const [authWorkspaceId, setAuthWorkspaceId] = useState<string | null>(null);
  /** Rows from same API — used for human-readable workspace name in chrome + chat. */
  const [workspaceRows, setWorkspaceRows] = useState<Array<{ id: string; name: string }>>([]);

  const workspaceDisplayName = useMemo(() => {
    const id = authWorkspaceId?.trim();
    if (id && workspaceRows.length > 0) {
      const row = workspaceRows.find((w) => w.id === id);
      if (row?.name?.trim()) return row.name.trim();
      return id;
    }
    return formatWorkspaceStatusLine(ideWorkspace);
  }, [authWorkspaceId, workspaceRows, ideWorkspace]);

  useEffect(() => {
    fetch('/api/settings/workspaces', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { current?: string; data?: Array<{ id?: string; name?: string }> } | null) => {
        if (d?.current && typeof d.current === 'string') setAuthWorkspaceId(d.current);
        if (Array.isArray(d?.data)) {
          setWorkspaceRows(
            d.data
              .filter((r) => r && typeof r.id === 'string')
              .map((r) => ({ id: r.id as string, name: typeof r.name === 'string' ? r.name : r.id as string })),
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.title = `${workspaceDisplayName} — ${PRODUCT_NAME}`;
  }, [workspaceDisplayName]);

  const idePersistRef = useRef({
    ideWorkspace: { source: 'none' } as IdeWorkspaceSnapshot,
    gitBranch: 'main',
    recentFiles: [] as RecentFileEntry[],
  });
  useEffect(() => {
    idePersistRef.current = { ideWorkspace, gitBranch, recentFiles };
  }, [ideWorkspace, gitBranch, recentFiles]);

  const hydrateGenRef = useRef(0);
  const prevAgentConvRef = useRef<string>('');
  useEffect(() => {
    const id = agentChatConversationId?.trim() || '';
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
    });
    return () => {
      cancelled = true;
    };
  }, [agentChatConversationId]);

  useEffect(() => {
    const id = agentChatConversationId?.trim();
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
  }, [agentChatConversationId, ideWorkspace, gitBranch, recentFiles]);
  
  const mappedRecentFiles = useMemo(() => {
    return recentFiles.map(f => ({
      name: f.name,
      path: f.workspacePath || f.githubPath || f.r2Key || f.id,
      label: f.label
    }));
  }, [recentFiles]);

  // Tabs: only 'welcome' is open by default. Others open on demand and can be closed.
  const [openTabs, setOpenTabs] = useState<TabId[]>(['welcome']);
  const [activeTab, setActiveTab] = useState<TabId>('Workspace');
  
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

  const handleCommandExecution = useCallback((cmdText: string) => {
    terminalRef.current?.runCommand(cmdText);
    setCmdHubOpen(false);
  }, []);

  const handleSendMessage = useCallback((msg: string) => {
    if (!msg.trim()) return;
    if (agentPosition === 'off') setAgentPosition('right');
    window.dispatchEvent(new CustomEvent('iam-agent-external-send', { detail: { message: msg } }));
  }, [agentPosition]);

  const lastPersistedTabRef = useRef<TabId | null>(null);
  useEffect(() => {
    lastPersistedTabRef.current = null;
  }, [agentChatConversationId]);

  useEffect(() => {
    const id = agentChatConversationId?.trim();
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
  }, [activeTab, agentChatConversationId, ideWorkspace, gitBranch, recentFiles]);

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

  const openTab = (tab: TabId) => {
    setOpenTabs(prev => prev.includes(tab) ? prev : [...prev, tab]);
    setActiveTab(tab);
    if (tab === 'engine' && activeActivity !== 'cad') {
      setActiveActivity('cad');
    }
  };

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

  const startResize = (panel: 'sidebar' | 'agent', e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panel === 'sidebar' ? sidebarW : agentW;
    
    const onMove = (pe: PointerEvent) => {
      const delta = pe.clientX - startX;
      if (panel === 'sidebar') 
        setSidebarW(Math.max(180, Math.min(480, startW + delta)));
      if (panel === 'agent') 
        setAgentW(Math.max(280, Math.min(600, startW - delta)));
    };
    
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>(() => [
    { role: 'assistant', content: buildAgentSamGreeting(formatWorkspaceStatusLine({ source: 'none' })) },
  ]);

  useEffect(() => {
    setChatMessages((prev) => {
      if (prev.length !== 1 || prev[0].role !== 'assistant') return prev;
      const next = buildAgentSamGreeting(workspaceDisplayName);
      if (prev[0].content === next) return prev;
      return [{ role: 'assistant', content: next }];
    });
  }, [workspaceDisplayName]);

  useEffect(() => {
    const onConv = (e: Event) => {
      const raw = (e as CustomEvent<{ id?: string | null }>).detail?.id;
      const id = typeof raw === 'string' ? raw.trim() : '';
      setAgentChatConversationId(id);
      if (!id) {
        setChatMessages([{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayName) }]);
        return;
      }
      void fetch(`/api/agent/sessions/${encodeURIComponent(id)}/messages`, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: unknown) => {
          if (!Array.isArray(rows) || rows.length === 0) {
            setChatMessages([{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayName) }]);
            return;
          }
          const mapped: { role: 'user' | 'assistant'; content: string }[] = [];
          for (const row of rows) {
            if (!row || typeof row !== 'object') continue;
            const o = row as { role?: string; content?: unknown };
            const role = o.role === 'user' ? 'user' : o.role === 'assistant' ? 'assistant' : null;
            if (!role) continue;
            const raw = o.content;
            const content =
              typeof raw === 'string'
                ? raw
                : raw != null && typeof raw === 'object'
                  ? JSON.stringify(raw)
                  : '';
            mapped.push({ role, content: content.trim() ? content : '(empty)' });
          }
          if (mapped.length === 0) {
            setChatMessages([{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayName) }]);
            return;
          }
          setChatMessages(mapped);
        })
        .catch(() => {
          setChatMessages([{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayName) }]);
        });
    };
    window.addEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onConv);
    return () => window.removeEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onConv);
  }, [workspaceDisplayName]);

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
      setActiveFile({
        name: file.name,
        content: file.content,
        originalContent: file.originalContent !== undefined ? file.originalContent : file.content ?? '',
        githubPath: file.githubPath,
        githubSha: file.githubSha,
        r2Key: file.r2Key,
        r2Bucket: file.r2Bucket,
      });
      revealMainWorkspaceIfNarrow();
      setOpenTabs((prev) => (prev.includes('code') ? prev : [...prev, 'code']));
      setActiveTab('code');
      if (isNarrowViewport) {
        setToastMsg('Opened in code editor. Tap Chat (bottom) to return to Agent Sam.');
      }
    },
    [revealMainWorkspaceIfNarrow, isNarrowViewport],
  );

  const focusCodeEditorFromChat = useCallback(() => {
    revealMainWorkspaceIfNarrow();
    setOpenTabs((prev) => (prev.includes('code') ? prev : [...prev, 'code']));
    setActiveTab('code');
    if (isNarrowViewport) {
      setToastMsg('Code editor opened. Tap Chat to return to Agent Sam.');
    }
  }, [revealMainWorkspaceIfNarrow, isNarrowViewport]);

  const consumeGithubExpandRepo = useCallback(() => setGithubExpandRepo(null), []);

  useEffect(() => {
    if (!activeFile) return;
    const t = window.setTimeout(() => {
      setRecentFiles((prev) => mergeRecentFromActiveFile(prev, activeFile));
    }, 450);
    return () => window.clearTimeout(t);
  }, [activeFile]);

  const openRecentEntry = useCallback(
    async (entry: RecentFileEntry) => {
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
          const res = await fetch(
            `/api/r2/file?bucket=${encodeURIComponent(entry.r2Bucket)}&key=${encodeURIComponent(entry.r2Key)}`,
            { credentials: 'same-origin' },
          );
          if (!res.ok) throw new Error('r2');
          const data = await res.json();
          const content = typeof data.content === 'string' ? data.content : '';
          setActiveFile({
            name: entry.name,
            content,
            originalContent: content,
            r2Key: entry.r2Key,
            r2Bucket: entry.r2Bucket,
          });
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
      } else {
        setIsTerminalOpen(o => !o);
      }
    };

    window.addEventListener('iam-run-command', onRun as EventListener);
    window.addEventListener('iam-terminal-toggle', onToggle as EventListener);
    
    return () => {
      window.removeEventListener('iam-run-command', onRun as EventListener);
      window.removeEventListener('iam-terminal-toggle', onToggle as EventListener);
    };
  }, []);

  const toggleActivity = (activity: 'cad' | 'files' | 'search' | 'mcps' | 'git' | 'debug' | 'remote' | 'actions' | 'projects' | 'settings' | 'drive' | 'playwright' | 'database') => {
    setActiveActivity((prev) => {
      if (prev === activity) return null;
      if (activity === 'debug') {
        setIsTerminalOpen(true);
        setTimeout(() => terminalRef.current?.setActiveTab('problems'), 50);
        return null; // Don't open a sidebar for debug anymore
      }
      if (activity === 'cad') {
        openTab('engine');
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

  const fetchLiveStatus = useCallback(async () => {
    const cred = { credentials: 'same-origin' as const };

    try {
      const hr = await fetch('/api/health');
      const hj = await hr.json().catch(() => ({}));
      if (hr.ok) setHealthOk(!!hj.ok);
      else setHealthOk(false);
    } catch {
      setHealthOk(false);
    }

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

    try {
      const ter = await fetch('/api/agent/terminal/config-status', cred);
      const tej = await ter.json().catch(() => ({}));
      if (ter.ok) setTerminalOk(!!tej.terminal_configured);
    } catch {
      /* ignore */
    }

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

    try {
      const nr = await fetch('/api/agent/notifications', cred);
      const nj = await nr.json().catch(() => ({}));
      if (nr.ok && Array.isArray(nj.notifications)) {
        setAgentNotifications(nj.notifications as AgentNotificationRow[]);
      }
    } catch {
      /* ignore */
    }

    fetch('/api/agent/telemetry', { method: 'GET', credentials: 'same-origin' }).catch(() => {});
  }, []);

  useEffect(() => {
    void fetchLiveStatus();
    const interval = window.setInterval(() => void fetchLiveStatus(), 20000);
    return () => clearInterval(interval);
  }, [fetchLiveStatus]);

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
      revealMainWorkspaceIfNarrow();
      setBrowserAddressDisplay(null);
      setBrowserTabTitle(null);
      setBrowserUrl(event.url.trim());
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

  /** Open current buffer in Browser tab: HTML/HTM/SVG blobs; Markdown wrapped in HTML; JSX/TSX info + source. */
  const openEditorPreview = useCallback(() => {
    if (!activeFile?.content) return;
    const name = activeFile.name || '';
    if (!isRenderablePreviewFilename(name)) return;

    if (htmlPreviewBlobRef.current) {
      URL.revokeObjectURL(htmlPreviewBlobRef.current);
      htmlPreviewBlobRef.current = null;
    }

    let blob: Blob;

    if (/\.(html|htm)$/i.test(name)) {
      blob = new Blob([activeFile.content], { type: 'text/html; charset=utf-8' });
    } else if (/\.svg$/i.test(name)) {
      blob = new Blob([activeFile.content], { type: 'image/svg+xml;charset=utf-8' });
    } else if (/\.md$/i.test(name)) {
      const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtmlForPreview(
        name
      )}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:52rem;margin:1rem auto;padding:0 1rem;line-height:1.5;color:var(--text-main, #111)}</style></head><body><pre style="white-space:pre-wrap;font-family:Menlo,Monaco,'Courier New',monospace;font-size:13px">${escapeHtmlForPreview(
        activeFile.content
      )}</pre></body></html>`;
      blob = new Blob([doc], { type: 'text/html; charset=utf-8' });
    } else if (/\.(jsx|tsx)$/i.test(name)) {
      const isTsx = /\.tsx$/i.test(name);
      const srcEsc = escapeHtmlForPreview(activeFile.content.slice(0, 12000));
      const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtmlForPreview(
        name
      )}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:52rem;margin:2rem auto;padding:1rem;line-height:1.5;color:var(--text-main, #111)}.note{margin-bottom:1rem;padding:0.75rem;border:1px solid #ccc;border-radius:6px;background:#f5f5f5}</style></head><body><p class="note"><strong>React preview requires a build step.</strong> ${isTsx ? 'TSX' : 'JSX'} must be compiled (Vite, webpack, etc.). Use your dev server URL for the real preview.</p><p style="font-size:12px;color:#555">Source (truncated)</p><pre style="white-space:pre-wrap;font-family:Menlo,Monaco,'Courier New',monospace;font-size:12px">${srcEsc}</pre></body></html>`;
      blob = new Blob([doc], { type: 'text/html; charset=utf-8' });
    } else {
      return;
    }

    const u = URL.createObjectURL(blob);
    htmlPreviewBlobRef.current = u;
    setBrowserAddressDisplay(previewAddressBarLabel(activeFile));
    setBrowserTabTitle(activeFile.name?.trim() ? `Preview · ${activeFile.name.trim()}` : 'Preview');
    setBrowserUrl(u);
    setOpenTabs((prev) => (prev.includes('browser') ? prev : [...prev, 'browser']));
    setActiveTab('browser');
  }, [activeFile]);

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

  // Themes: cms_themes + settings.appearance.theme via GET /api/themes/active (workspace_id scopes rows)
  useEffect(() => {
    migrateLegacyThemeLocalStorage();
    fetchAndApplyActiveCmsTheme(authWorkspaceId)
      .then((payload) => {
        const hasVars =
          payload?.data &&
          typeof payload.data === 'object' &&
          Object.keys(payload.data).length > 0;
        if (!hasVars) applyCachedCmsThemeFallback();
      })
      .catch(() => {
        applyCachedCmsThemeFallback();
      });
  }, [authWorkspaceId]);

  // Cmd+J Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
            setIsTerminalOpen(p => !p);
            e.preventDefault();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [genConfig, setGenConfig] = useState<GenerationConfig>({
    style: ArtStyle.CYBERPUNK,
    density: 5,
    usePhysics: true,
    cadTool: CADTool.NONE,
    cadPlane: CADPlane.XZ,
    extrusion: 1
  });

  const [sceneConfig, setSceneConfig] = useState<SceneConfig>({
    ambientIntensity: 1.5,
    sunColor: '#ffffff',
    castShadows: true,
    showPhysicsDebug: false
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new VoxelEngine(
      containerRef.current,
      (s) => setAppState(s),
      (c) => setVoxelCount(c)
    );
    engineRef.current = engine;
    
    // Wire up engine events for history
    engine.setOnEntityCreated((entity) => {
      setUndoStack(prev => [...prev, entity]);
      setRedoStack([]); // Clear redo on new action
    });

    // Initial sync
    engine.updateLighting(sceneConfig);
    engine.setCADPlane(genConfig.cadPlane);
    engine.setExtrusion(genConfig.extrusion);

    const handleResize = () => engine.handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      engine.cleanup();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.updateLighting(sceneConfig);
  }, [sceneConfig]);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    engineRef.current?.removeEntity(last.id);
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, last]);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    engineRef.current?.spawnEntity(next);
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, next]);
  };

  const handleProjectSwitch = (type: ProjectType) => {
    setActiveProject(type);
    engineRef.current?.setProjectType(type);
    setGenConfig(prev => ({ ...prev, cadTool: CADTool.NONE }));
    setUndoStack([]);
    setRedoStack([]);
    // Auto-surface the engine canvas when a 3D project is picked
    openTab('engine');
    setActiveActivity('cad');
  };

  const handleUpdateGenConfig = (cfg: Partial<GenerationConfig>) => {
    const next = { ...genConfig, ...cfg };
    setGenConfig(next);
    
    if (cfg.cadTool !== undefined) engineRef.current?.setCADTool(cfg.cadTool);
    if (cfg.cadPlane !== undefined) engineRef.current?.setCADPlane(cfg.cadPlane);
    if (cfg.extrusion !== undefined) engineRef.current?.setExtrusion(cfg.extrusion);
  };

  const handleSpawnModel = (name: string, url: string, scale: number) => {
    if (activeTab !== 'engine') openTab('engine');
    engineRef.current?.spawnEntity({
      id: `asset_${Date.now()}`,
      name: name,
      type: 'prop',
      modelUrl: url,
      scale: scale,
      position: { x: (Math.random() - 0.5) * 10, y: 10, z: (Math.random() - 0.5) * 10 },
      behavior: { type: 'dynamic', mass: 10, restitution: 0.2 }
    });
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const glb = files.find(f => f.name.toLowerCase().endsWith('.glb'));
    if (glb) {
      const url = URL.createObjectURL(glb);
      handleSpawnModel(glb.name, url, 1);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleAddCustomAsset = (name: string, url: string) => {
    const newAsset: CustomAsset = {
      id: `custom_${Date.now()}`,
      name,
      url
    };
    setCustomAssets(prev => [...prev, newAsset]);
  };

  const handleRemoveCustomAsset = (id: string) => {
    setCustomAssets(prev => prev.filter(a => a.id !== id));
  };

  const handleSave = async (id: string) => {
    try {
      const dataToSave = { undoStack, genConfig, sceneConfig }; 
      await fetch(`/api/cad/upload/${id}`, {
          method: 'POST',
          body: JSON.stringify(dataToSave)
      });
      alert(`Project saved as ${id} to R2!`);
    } catch(err) {
      console.error(err);
      alert('Save failed');
    }
  };

  const handleLoad = async (id: string) => {
    try {
      const res = await fetch(`/api/cad/get/${id}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      
      engineRef.current?.clearWorld();
      setUndoStack([]);
      setRedoStack([]);
      
      if (data.undoStack) {
          data.undoStack.forEach((ent: GameEntity) => {
              engineRef.current?.spawnEntity(ent);
              setUndoStack(prev => [...prev, ent]);
          });
      }
      if (data.genConfig) handleUpdateGenConfig(data.genConfig);
      if (data.sceneConfig) setSceneConfig(data.sceneConfig);
      
      alert(`Project loaded from R2!`);
    } catch(err) {
      console.error(err);
      alert('Load failed');
    }
  };

  const handleCommand = async (prompt: string) => {
    if (prompt.startsWith('save ')) {
        const id = prompt.replace('save ', '').trim();
        await handleSave(id);
        return;
    }
    if (prompt.startsWith('load ')) {
        const id = prompt.replace('load ', '').trim();
        await handleLoad(id);
        return;
    }

    setIsGenerating(true);
    try {
      const styleGuidelines = {
        [ArtStyle.CYBERPUNK]: "Neon accents, high-contrast, glowing colors (emissive), sharp technological angles.",
        [ArtStyle.BRUTALIST]: "Monolithic shapes, concrete-gray color schemes, massive proportions, minimal decoration.",
        [ArtStyle.ORGANIC]: "Soft curves, earth tones (greens/browns), flowing bio-inspired shapes.",
        [ArtStyle.LOW_POLY]: "Basic geometric primitives, simple color blocking, retro 90s game look."
      };
      const densityMultiplier = genConfig.density * 50;
      
      const fullPrompt = `
          PROJECT: ${activeProject}
          STYLE PRESET: ${genConfig.style}
          STYLE GUIDELINES: ${styleGuidelines[genConfig.style]}
          PHYSICS ENABLED: ${genConfig.usePhysics}
          DETAIL LEVEL (DENSITY): ${genConfig.density}/10 (Use roughly ${densityMultiplier} voxels per entity)
          
          COMMAND: "${prompt}"
          
          Return a JSON array of NEW entities. 
          Behaviors: 'static', 'dynamic', 'hover', 'rotate'.
          If physics is enabled, use 'dynamic' for objects that should fall and collide.
          Include 'mass' (0.5 to 10), 'restitution' (0 to 1), and 'friction' (0 to 1) in behavior if dynamic.
          Colors: Use hex strings appropriate for ${genConfig.style}.
      `;

      const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: fullPrompt })
      });
      const data = await response.json();

      if (data.response && engineRef.current) {
        const entities: any[] = JSON.parse(data.response);
        entities.forEach(ent => {
            const formattedVoxels = ent.voxels.map((v: any) => ({
                ...v,
                color: typeof v.color === 'string' ? parseInt(v.color.replace('#', ''), 16) : v.color
            }));
            const finalEntity = { ...ent, voxels: formattedVoxels };
            engineRef.current?.spawnEntity(finalEntity);
            setUndoStack(prev => [...prev, finalEntity]);
        });
        setRedoStack([]);
      }
    } catch (err) {
      console.error("Studio Operation Failed", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const narrowBlocksCenter = isNarrowViewport && (!!activeActivity || agentPosition !== 'off');
  const narrowNeedsBack = narrowBlocksCenter;

  const statusIndentLabel = useMemo(
    () => `${editorMeta.insertSpaces ? 'Spaces' : 'Tabs'}: ${editorMeta.tabSize}`,
    [editorMeta.insertSpaces, editorMeta.tabSize],
  );

  return (
    <div className="w-full h-[100dvh] bg-[var(--bg-app)] overflow-hidden text-[var(--text-main)] font-sans flex flex-col">
      {/* 1. TOP WINDOW BAR */}
      <div className="h-10 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] flex items-center justify-between px-3 shrink-0">
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
                title={workspaceDisplayName}
                onClick={() => setActiveTab('Workspace')}
              />
              <button
                type="button"
                onClick={() => toggleActivity(activeActivity ? activeActivity : 'files')}
                className="shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors ml-1"
                title={activeActivity ? "Close sidebar" : "Open sidebar"}
              >
                {activeActivity ? <PanelLeftClose size={18} strokeWidth={1.75} /> : <PanelLeft size={18} strokeWidth={1.75} />}
              </button>
          </div>

          {/* Unified search (Cmd+K) + Knowledge panel (RAG / chats list) */}
          <div className="flex-1 flex justify-center items-center min-w-0 px-2 gap-2">
              <UnifiedSearchBar
                workspaceLabel={workspaceDisplayName}
                recentFiles={mappedRecentFiles}
                onNavigate={(nav, _q) => handleUnifiedNavigate(nav)}
                onRunCommand={(cmd) => terminalRef.current?.runCommand(cmd)}
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
                  title="Toggle split editor layout"
                  className={`p-1.5 rounded transition-colors ${splitLayout ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
                  onClick={() => setSplitLayout((v) => !v)}
              >
                  <Columns2 size={15} strokeWidth={1.75} />
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
                  onClick={() => setIsTerminalOpen((p) => !p)}
              >
                  <TermIcon size={15} strokeWidth={1.75} />
              </button>
              <button
                  type="button"
                  title="Settings"
                  className={`p-1.5 rounded transition-colors ${activeActivity === 'settings' ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
                  onClick={() => toggleActivity('settings')}
              >
                  <Settings size={15} strokeWidth={1.75} />
              </button>
          </div>
      </div>

      <div className="flex flex-1 overflow-hidden max-md:pb-[52px]">
          {/* 2. ACTIVITY BAR (Extreme Left) — hidden ≤768px; use bottom tab bar + More */}
          <div className="hidden md:flex w-12 bg-[var(--bg-panel)] flex-col items-center py-4 gap-4 border-r border-[var(--border-subtle)] shrink-0 z-50">
              <ActivityIcon icon={PenTool} title="Draw" active={openTabs.includes('excalidraw')} onClick={() => openTab('excalidraw')} />
              <ActivityIcon icon={Search} title="Search" active={activeActivity === 'search'} onClick={() => toggleActivity('search')} />
              <ActivityIcon icon={GitBranch} title="Source Control" active={activeActivity === 'git'} onClick={() => toggleActivity('git')} />
              <ActivityIcon icon={Network} title="Remote Explorers" active={activeActivity === 'remote'} onClick={() => toggleActivity('remote')} />
              <ActivityIcon icon={Layers} title="Tools & MCP" active={activeActivity === 'mcps'} onClick={() => toggleActivity('mcps')} />
              <ActivityIcon icon={Github} title="GitHub Actions" active={activeActivity === 'actions'} onClick={() => toggleActivity('actions')} />
              <ActivityIcon
                  icon={Database}
                  title="D1 Explorer"
                  active={activeActivity === 'database'}
                  onClick={() => toggleActivity('database')}
              />
              <ActivityIcon icon={Cloud} title="Cloud Sync" active={activeActivity === 'drive'} onClick={() => toggleActivity('drive')} />
              <ActivityIcon icon={Monitor} title="Playwright Jobs" active={activeActivity === 'playwright'} onClick={() => toggleActivity('playwright')} />
              
              <div className="flex-1" />
              <ActivityIcon icon={FolderOpen} title="Projects" active={activeActivity === 'projects'} onClick={() => toggleActivity('projects')} />
              <ActivityIcon 
                icon={Plane} 
                title="Studio Engine" 
                active={activeActivity === 'cad'} 
                onClick={() => {
                  if (activeActivity === 'cad') {
                    setActiveActivity(null);
                  } else {
                    toggleActivity('cad');
                    openTab('engine');
                  }
                }} 
              />
              <ActivityIcon icon={Settings} title="Settings" active={activeActivity === 'settings'} onClick={() => toggleActivity('settings')} />
          </div>

          {/* Optional Left Agent Panel */}
          {agentPosition === 'left' && (
              <>
                <div 
                    className={`bg-[var(--bg-panel)] flex flex-col shrink-0 transition-opacity relative group z-30 opacity-100 glass-panel max-md:fixed max-md:inset-0 max-md:z-[45] max-md:w-full max-md:max-w-none max-md:shrink ${
                      activeActivity ? 'max-md:hidden' : ''
                    }`}
                    style={
                      isNarrowViewport
                        ? { borderRight: '1px solid var(--border-subtle)' }
                        : { width: agentW, borderRight: '1px solid var(--border-subtle)' }
                    }
                    {...(narrowNeedsBack && !activeActivity ? mobileEdgeSwipeHandlers : {})}
                >
                    <div className="h-10 max-md:hidden border-b border-[var(--border-subtle)] flex items-center px-4 font-semibold text-[11px] tracking-widest uppercase text-[var(--text-muted)] shrink-0">{PRODUCT_NAME}</div>
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    <ChatAssistant 
                        activeProject={activeProject} 
                        activeFileContent={activeFile?.content}
                        activeFileName={activeFile?.name}
                        activeFile={activeFile}
                        editorCursorLine={cursorPos.line}
                        editorCursorColumn={cursorPos.col}
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
                          openTab('engine');
                          if (engineRef.current) {
                            engineRef.current.spawnEntity({
                              id: `chat-glb-${Date.now()}`,
                              name: file.name.replace(/\.glb$/i, ''),
                              type: 'prop',
                              position: { x: 0, y: 1, z: 0 },
                              behavior: { type: 'dynamic', mass: 10, restitution: 0.2 },
                              modelUrl: glbUrl,
                              scale: 1,
                            });
                          }
                        }}
                        onRunInTerminal={runInTerminal}
                        onR2FileUpdated={handleR2FileUpdatedFromAgent}
                        onBrowserNavigate={handleBrowserNavigateFromAgent}
                        onOpenGitHubIntegration={openGitHubFromChat}
                        onMobileOpenDashboard={openDashboardFromChat}
                        onOpenCodeTab={focusCodeEditorFromChat}
                    />
                    </div>
                </div>
                {/* Grab Bar */}
                <div 
                  className="max-md:hidden w-1 cursor-col-resize hover:bg-[var(--solar-cyan)] active:bg-[var(--solar-cyan)] transition-colors shrink-0 z-50"
                  onPointerDown={(e) => startResize('agent', e)}
                />
              </>
          )}

          <div 
              className={`transition-all duration-75 shrink-0 bg-[var(--bg-panel)] flex flex-col z-40 overflow-hidden shadow-2xl md:shadow-none hover:border-[var(--solar-cyan)] relative group
              ${activeActivity ? 'absolute inset-y-0 left-0 md:relative md:left-0 max-md:!w-full max-md:z-[46] max-md:inset-0 border-r border-[var(--border-subtle)] opacity-100 pointer-events-auto' : 'border-none opacity-0 pointer-events-none'} glass-panel`}
              style={{ width: activeActivity ? sidebarW : 0 }}
              {...(narrowNeedsBack && !!activeActivity ? mobileEdgeSwipeHandlers : {})}
          >
              <div className="w-full h-full flex flex-col relative">                  
                  {activeActivity === 'cad' ? (
                      <StudioSidebar 
                          activeProject={activeProject} 
                          onSwitchProject={handleProjectSwitch}
                          onExport={() => engineRef.current?.exportForBlender()}
                          genConfig={genConfig}
                          onUpdateGenConfig={handleUpdateGenConfig}
                          sceneConfig={sceneConfig}
                          onUpdateSceneConfig={(cfg) => setSceneConfig(prev => ({ ...prev, ...cfg }))}
                          onSpawnModel={handleSpawnModel}
                          customAssets={customAssets}
                          onAddCustomAsset={handleAddCustomAsset}
                          onRemoveCustomAsset={handleRemoveCustomAsset}
                          isEmbedded={true}
                      />
                  ) : activeActivity === 'search' ? (
                      <KnowledgeSearchPanel
                        onClose={() => setActiveActivity(null)}
                        activeConversationId={agentChatConversationId}
                      />
                  ) : activeActivity === 'files' ? (
                      <LocalExplorer
                          nativeFolderOpenSignal={nativeFolderOpenSignal}
                          onWorkspaceRootChange={({ folderName }) => {
                              setIdeWorkspace({ source: 'local', folderName });
                          }}
                          onFileSelect={(file) => {
                          setActiveFile({ ...file, originalContent: file.content });
                          openTab('code');
                          revealMainWorkspaceIfNarrow();
                      }}
                          onOpenInEditor={(file) => {
                              setActiveFile(file);
                              openTab('code');
                              revealMainWorkspaceIfNarrow();
                          }}
                      />
                  ) : activeActivity === 'mcps' ? (
                      <MCPPanel />
                  ) : activeActivity === 'settings' ? (
                      <SettingsPanel
                          workspaceId={authWorkspaceId}
                          onClose={() => setActiveActivity(null)}
                          onFileSelect={(file) => {
                              setActiveFile({ ...file, originalContent: file.content });
                              openTab('code');
                              revealMainWorkspaceIfNarrow();
                          }}
                      />
                  ) : activeActivity === 'actions' ? (
                      <GitHubExplorer
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
                  ) : activeActivity === 'remote' ? (
                      <R2Explorer
                          onOpenInEditor={(file) => {
                              setActiveFile(file);
                              openTab('code');
                              revealMainWorkspaceIfNarrow();
                          }}
                      />
                  ) : activeActivity === 'playwright' ? (
                      <PlaywrightConsole />
                  ) : activeActivity === 'debug' ? (
                      <div className="p-4 text-xs text-[var(--text-muted)]">Redirecting to terminal problems...</div>
                  ) : activeActivity === 'git' ? (
                      <SourcePanel />
                  ) : activeActivity === 'projects' ? (
                      <WorkspaceExplorerPanel
                        ideWorkspace={ideWorkspace}
                        workspaceTitle={workspaceDisplayName}
                        recentFiles={recentFiles}
                        onRefreshRecent={() => {
                          const sid = agentChatConversationId?.trim();
                          if (!sid) return;
                          void hydrateIdeFromApi(sid).then((b) => setRecentFiles(b.recentFiles));
                        }}
                        onClearRecentFiles={() => {
                          setRecentFiles([]);
                          const sid = agentChatConversationId?.trim();
                          if (sid) {
                            void persistIdeToApi(sid, {
                              v: IDE_PERSIST_VERSION,
                              ideWorkspace,
                              gitBranch,
                              recentFiles: [],
                            });
                          }
                        }}
                        onOpenRecent={(e) => void openRecentEntry(e)}
                        onOpenLocalFolder={() => {
                          setActiveActivity('files');
                          setNativeFolderOpenSignal((n) => n + 1);
                        }}
                        onOpenFilesActivity={() => setActiveActivity('files')}
                        onOpenGitHubActivity={() => setActiveActivity('actions')}
                        onOpenWorkspace={(name, path) => {
                          setIdeWorkspace({ source: 'pinned', name, pathHint: path });
                        }}
                      />
                  ) : activeActivity === 'database' ? (
                      <DatabaseBrowser
                          explorerJump={dbExplorerJump}
                          onExplorerJumpConsumed={() => setDbExplorerJump(null)}
                          onClose={() => setActiveActivity(null)}
                      />
                  ) : (
                      <div className="p-4 text-xs text-[var(--text-muted)]">Panel empty.</div>
                  )}
              </div>
          </div>

          {/* Sidebar Grab Bar */}
          {activeActivity && (
            <div 
              className="w-1 cursor-col-resize hover:bg-[var(--solar-cyan)] active:bg-[var(--solar-cyan)] transition-colors shrink-0 z-50 hidden md:block"
              onPointerDown={(e) => startResize('sidebar', e)}
            />
          )}

          {/* 4. MAIN EDITOR AREA */}
              {/* Dashboard page routes rendered in center slot */}
              {location.pathname !== '/dashboard/agent' && (
                <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
                  <Routes>
                    <Route path="/dashboard/calendar" element={<CalendarPage />} />
                    <Route path="/dashboard/agent" element={<></>} />
                  </Routes>
                </div>
              )}
          <main 
              className={`flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--bg-app)] relative ${narrowBlocksCenter ? 'max-md:hidden' : ''}`}
              onDrop={handleFileDrop}
              onDragOver={handleDragOver}
          >
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
                              className="shrink-0 h-8 w-8 p-0 inline-flex items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--text-main)] hover:bg-[var(--bg-panel)] hover:border-[var(--solar-cyan)]"
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
                              className="shrink-0 h-8 w-8 p-0 inline-flex items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--text-main)] hover:bg-[var(--bg-panel)] hover:border-[var(--solar-cyan)]"
                          >
                              <Link2 size={14} className="text-[var(--text-muted)]" strokeWidth={1.75} aria-hidden />
                              <span className="sr-only">Copy R2 path</span>
                          </button>
                      )}
                      </>
                  )}
                  {openTabs.includes('engine') && (
                      <Tab
                          title="Voxel"
                          icon={<Box size={13} className="text-[var(--solar-magenta)]"/>}
                          active={activeTab === 'engine'}
                          onClick={() => setActiveTab('engine')}
                          onClose={(e) => closeTab('engine', e)}
                      />
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

                  {/* Quick-open buttons for closed panels */}
                  <div className="ml-auto flex items-center gap-0.5 pr-2 shrink-0">
                      {!openTabs.includes('browser') && <QuickOpen label="Browser" onClick={() => openTab('browser')} />}
                  </div>

                  {/* Decorative line below tabs */}
                  <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--border-subtle)] z-[-1]" />
              </div>

              {/* Editor + optional aux bottom + terminal — flex column so drawer respects drag height */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                  <div className="flex-1 min-h-0 relative flex flex-col">
                  {/* 3D CANVAS MOUNT - Permanently in DOM to avoid WebGL context loss */}
                  <div 
                      ref={containerRef} 
                      className={`absolute inset-0 z-0 transition-opacity duration-300 ${activeTab === 'engine' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                      style={{ background: 'var(--scene-bg)' }}
                  />
                  
                  {activeTab === 'Workspace' && (
                      <div className="absolute inset-0 z-10">
                          <WorkspaceDashboard 
                            onOpenFolder={() => {
                              setActiveActivity('files');
                              setNativeFolderOpenSignal(n => n + 1);
                            }}
                            onConnectWorkspace={() => setWorkspaceLauncherOpen(true)}
                            onGithubSync={() => setActiveActivity('actions')}
                            recentFiles={recentFiles}
                            workspaceRows={workspaceRows}
                            authWorkspaceId={authWorkspaceId}
                            onSwitchWorkspace={(id) => setAuthWorkspaceId(id)}
                            onSendMessage={handleSendMessage}
                          />
                      </div>
                  )}

                  {activeTab === 'engine' && (
                      <div className="relative z-10 w-full h-full pointer-events-none flex flex-col justify-end pb-8">
                          <ToolLauncherBar onNavigate={(url) => {
                              setBrowserAddressDisplay(null);
                              setBrowserTabTitle(null);
                              setBrowserUrl(url);
                              openTab('browser');
                          }} />
                      </div>
                  )}

                  {activeTab === 'code' && (
                      <div className="absolute inset-0 z-10" data-editor-split={splitLayout ? 'true' : undefined}>
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
                          <BrowserView url={browserUrl} addressDisplay={browserAddressDisplay} />
                      </div>
                  )}

                  {activeTab === 'excalidraw' && (
                      <div className="absolute inset-0 z-10 flex flex-col">
                          <ExcalidrawView />
                      </div>
                  )}
                  </div>

                  {isTerminalOpen && (
                      <XTermShell
                          ref={terminalRef}
                          onClose={() => setIsTerminalOpen(false)}
                          problems={systemProblems ?? []}
                          iamOrigin={typeof window !== 'undefined' ? window.location.origin : 'https://inneranimalmedia.com'}
                          workspaceCdCommand="cd /Users/samprimeaux/inneranimalmedia"
                          workspaceLabel={workspaceDisplayName}
                          workspaceId={authWorkspaceId || undefined}
                          productLabel={PRODUCT_NAME}
                          outputLines={shellOutputLines}
                          onOutputLine={(line) =>
                            setShellOutputLines((prev) => [...prev.slice(-250), line])
                          }
                      />
                  )}
              </div>
          </main>

          {/* 6. Optional Right Agent Panel */}
          {agentPosition === 'right' && (
              <>
                {/* Agent Grab Bar */}
                <div 
                  className="max-md:hidden w-1 cursor-col-resize hover:bg-[var(--solar-cyan)] active:bg-[var(--solar-cyan)] transition-colors shrink-0 z-50"
                  onPointerDown={(e) => startResize('agent', e)}
                />
                <div 
                    className={`bg-[var(--bg-panel)] flex flex-col shrink-0 transition-opacity z-30 relative group opacity-100 glass-panel max-md:fixed max-md:inset-0 max-md:z-[45] max-md:w-full max-md:max-w-none max-md:shrink ${
                      isNarrowViewport && activeActivity ? 'max-md:hidden' : ''
                    }`}
                    style={
                      isNarrowViewport
                        ? { borderLeft: '1px solid var(--border-subtle)' }
                        : { width: agentW, borderLeft: '1px solid var(--border-subtle)' }
                    }
                    {...(narrowNeedsBack && !activeActivity ? mobileEdgeSwipeHandlers : {})}
                >
                    <div className="h-10 max-md:hidden border-b border-[var(--border-subtle)] flex items-center px-4 font-semibold text-[11px] tracking-widest uppercase text-[var(--text-muted)] shrink-0">{PRODUCT_NAME}</div>
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                         <ChatAssistant 
                            activeProject={activeProject} 
                            activeFileContent={activeFile?.content}
                            activeFileName={activeFile?.name}
                            activeFile={activeFile}
                            editorCursorLine={cursorPos.line}
                            editorCursorColumn={cursorPos.col}
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
                              openTab('engine');
                              if (engineRef.current) {
                                engineRef.current.spawnEntity({
                                  id: `chat-glb-${Date.now()}`,
                                  name: file.name.replace(/\.glb$/i, ''),
                                  type: 'prop',
                                  position: { x: 0, y: 1, z: 0 },
                                  behavior: { type: 'dynamic', mass: 10, restitution: 0.2 },
                                  modelUrl: glbUrl,
                                  scale: 1,
                                });
                              }
                            }}
                            onRunInTerminal={runInTerminal}
                            onR2FileUpdated={handleR2FileUpdatedFromAgent}
                            onBrowserNavigate={handleBrowserNavigateFromAgent}
                            onOpenGitHubIntegration={openGitHubFromChat}
                            onMobileOpenDashboard={openDashboardFromChat}
                            onOpenCodeTab={focusCodeEditorFromChat}
                         />
                    </div>
                </div>
              </>
          )}
      </div>
      
      {/* 8. STATUS BAR (FOOTER) */}
      {toastMsg && (
        <div
          className="fixed bottom-16 left-1/2 z-[200] -translate-x-1/2 px-4 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[11px] text-[var(--text-main)] shadow-lg max-w-md text-center max-md:[bottom:calc(56px+1.5rem+env(safe-area-inset-bottom,0px)+8px)]"
          role="status"
        >
          {toastMsg}
        </div>
      )}

      {/* Mobile (≤768px): bottom tab bar above StatusBar */}
      <nav
        className="md:hidden fixed inset-x-0 z-[90] flex items-stretch justify-around gap-0 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 backdrop-blur-sm"
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
          className={`flex flex-1 flex-col items-center justify-center min-h-[44px] gap-0.5 px-0.5 text-[10px] font-medium leading-tight ${activeActivity === 'database' ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'}`}
          onClick={() => toggleActivity('database')}
        >
          <Database size={24} strokeWidth={1.5} aria-hidden />
          <span>Database</span>
        </button>
        <button
          type="button"
          className={`flex flex-1 flex-col items-center justify-center min-h-[44px] gap-0.5 px-0.5 text-[10px] font-medium leading-tight ${activeActivity === 'projects' ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'}`}
          onClick={() => toggleActivity('projects')}
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
          className={`flex flex-1 flex-col items-center justify-center min-h-[44px] gap-0.5 px-0.5 text-[10px] font-medium leading-tight ${activeActivity === 'settings' ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'}`}
          onClick={() => toggleActivity('settings')}
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
            className="md:hidden fixed left-2 right-2 z-[96] max-h-[min(72vh,calc(100dvh-10rem))] flex flex-col rounded-t-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl overflow-hidden"
            style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px) + 52px)' }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
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
              <MobileMoreRow icon={Network} label="Remote Explorers" onClick={() => { setMobileMoreOpen(false); toggleActivity('remote'); }} />
              <MobileMoreRow icon={Layers} label="Tools & MCP" onClick={() => { setMobileMoreOpen(false); toggleActivity('mcps'); }} />
              <MobileMoreRow icon={Cloud} label="Cloud Sync" onClick={() => { setMobileMoreOpen(false); toggleActivity('drive'); }} />
              <MobileMoreRow icon={Monitor} label="Playwright Jobs" onClick={() => { setMobileMoreOpen(false); toggleActivity('playwright'); }} />
              <MobileMoreRow icon={Monitor} label="Engine View" onClick={() => { setMobileMoreOpen(false); toggleActivity('cad'); }} />
            </div>
          </div>
        </>
      )}

      <StatusBar 
        branch={gitBranch}
        workspace={authWorkspaceId || formatWorkspaceStatusLine(ideWorkspace)}
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
        onGitBranchClick={() => toggleActivity('git')}
        onWorkspaceClick={() => toggleActivity('projects')}
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
          onOpenLocalFolder={() => {
            setWorkspaceLauncherOpen(false);
            setActiveActivity('files');
            setNativeFolderOpenSignal(n => n + 1);
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
    className="flex w-full items-center gap-3 min-h-[44px] rounded-lg px-3 text-left text-[13px] text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors border border-transparent hover:border-[var(--border-subtle)]"
    onClick={onClick}
  >
    <Icon size={20} strokeWidth={1.5} className="shrink-0 text-[var(--text-muted)]" />
    <span>{label}</span>
  </button>
);

const ActivityIcon: React.FC<{ icon: any, active: boolean, onClick: () => void, title?: string }> = ({ icon: Icon, active, onClick, title }) => (
    <div 
        onClick={onClick}
        title={title}
        className={`p-3 cursor-pointer transition-colors relative ${active ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
    >
        {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-9 bg-[var(--solar-cyan)] rounded-r-md"></div>}
        <Icon size={25} strokeWidth={1} />
    </div>
);

const Tab: React.FC<{ title: React.ReactNode, icon: React.ReactNode, active: boolean, onClick: () => void, onClose?: (e: React.MouseEvent) => void }> = ({ title, icon, active, onClick, onClose }) => (
    <div 
        onClick={onClick}
        className={`h-full flex items-center gap-1.5 pl-3 pr-2 text-[12px] select-none cursor-pointer border-r border-[var(--border-subtle)] relative group whitespace-nowrap shrink-0 ${
            active 
                ? 'bg-[var(--bg-app)] text-[var(--solar-cyan)]' 
                : 'bg-[var(--bg-panel)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
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
        {!active && <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--border-subtle)]" />}
    </div>
);

const QuickOpen: React.FC<{ label: string, onClick: () => void }> = ({ label, onClick }) => (
    <button
        onClick={onClick}
        className="text-[10px] px-2 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] transition-colors border border-transparent hover:border-[var(--border-subtle)] font-mono"
        title={`Open ${label}`}
    >
        + {label}
    </button>
);

export default App;
