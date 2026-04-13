/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { VoxelEngine }        from './services/VoxelEngine';
import { StudioSidebar }      from './components/StudioSidebar';
import { UIOverlay }          from './components/UIOverlay';
import { ChatAssistant }      from './components/ChatAssistant';
import { WorkspaceDashboard } from './components/WorkspaceDashboard';
import { CommandCenter }      from './components/CommandCenter';
import { MCPPanel }           from './components/MCPPanel';
import { IAM_AGENT_CHAT_CONVERSATION_CHANGE, LS_AGENT_CHAT_CONVERSATION_ID } from './agentChatConstants';
import { WorkspaceLauncher }  from './components/WorkspaceLauncher';
import { GorillaModeShell, type GorillaModeHandle } from './components/GorillaModeShell';
import { MonacoEditorView, type EditorModelMeta } from './components/MonacoEditorView';
import { LocalExplorer }      from './components/LocalExplorer';
import { BrowserView }        from './components/BrowserView';
import { SettingsPanel }      from './components/SettingsPanel';
import { ToolLauncherBar }    from './components/ToolLauncherBar';
import { StatusBar, type AgentNotificationRow } from './components/StatusBar';
import { ExcalidrawView }     from './components/ExcalidrawView';
import { DatabaseBrowser }    from './components/DatabaseBrowser';
import { UnifiedSearchBar, type SearchNavigate } from './components/UnifiedSearchBar';
import { GitHubExplorer }     from './components/GitHubExplorer';
import { KnowledgeSearchPanel } from './components/KnowledgeSearchPanel';
import { ProblemsDebugPanel } from './components/ProblemsDebugPanel';
import { WorkspaceExplorerPanel } from './components/WorkspaceExplorerPanel';
import { GoogleDriveExplorer } from './components/GoogleDriveExplorer';
import { R2Explorer }         from './components/R2Explorer';
import { PlaywrightConsole }  from './components/PlaywrightConsole';
import { SourcePanel }        from './components/SourcePanel';
import {
  ProjectType, AppState, GameEntity, GenerationConfig,
  ArtStyle, SceneConfig, CADTool, CustomAsset, CADPlane, type ActiveFile,
} from './types';
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
import {
  Search, GitBranch, Blocks, Box, Settings,
  PanelLeft, PanelLeftClose, PanelRightClose, Terminal as TermIcon,
  LayoutTemplate, Network, Layers, Monitor, Bug, Github,
  Database, FolderOpen, Globe, PenTool, Cloud, X as XIcon, Columns2,
  Eye, MessageSquare, MoreHorizontal, ChevronLeft, Link2, LayoutGrid,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
// Product name is the one truly static string — it is the product.
const PRODUCT_NAME = 'Agent Sam';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtmlForPreview(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isRenderablePreviewFilename(name: string): boolean {
  return /\.(html?|svg|md|jsx|tsx)$/i.test(name.trim());
}

function previewButtonTitle(name: string): string {
  if (/\.(html|htm)$/i.test(name)) return 'Preview HTML in Browser tab';
  if (/\.svg$/i.test(name))        return 'Preview SVG in Browser tab';
  if (/\.md$/i.test(name))         return 'Preview Markdown in Browser tab';
  if (/\.jsx$/i.test(name))        return 'Open JSX preview in Browser tab';
  if (/\.tsx$/i.test(name))        return 'Open TSX preview in Browser tab';
  return 'Preview in Browser tab';
}

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

function buildAgentSamGreeting(workspaceDisplayLine: string): string {
  const w = workspaceDisplayLine.trim();
  if (!w || w === 'No workspace') {
    return `${PRODUCT_NAME}: pick a workspace in Settings or open a local folder, then tell me what you want to build.`;
  }
  return `Hi! I'm ${PRODUCT_NAME}. Current workspace: ${w}. What should we work on?`;
}

// ─── LucideLike type ──────────────────────────────────────────────────────────
type LucideLike = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

// ─── App ──────────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const { tabs, activeTabId, openFile, updateActiveContent, saveActiveFile } = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef    = useRef<VoxelEngine | null>(null);
  const terminalRef  = useRef<GorillaModeHandle>(null);
  const collabWsRef  = useRef<WebSocket | null>(null);

  const [activeProject, setActiveProject] = useState<ProjectType>(ProjectType.SANDBOX);
  const [appState, setAppState]           = useState<AppState>(AppState.EDITING);
  const [voxelCount, setVoxelCount]       = useState<number>(0);
  const [isGenerating, setIsGenerating]   = useState(false);
  const [customAssets, setCustomAssets]   = useState<CustomAsset[]>([]);
  const [undoStack, setUndoStack]         = useState<GameEntity[]>([]);
  const [redoStack, setRedoStack]         = useState<GameEntity[]>([]);

  // ── Workspace config from API ─────────────────────────────────────────────
  const [workspaceCdCommand, setWorkspaceCdCommand] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetch('/api/agentsam/config', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (typeof d?.workspace_cd_command === 'string' && d.workspace_cd_command.trim())
          setWorkspaceCdCommand(d.workspace_cd_command.trim());
      })
      .catch(() => {});
  }, []);

  // ── IDE State ─────────────────────────────────────────────────────────────
  type TabId = 'Workspace' | 'welcome' | 'engine' | 'code' | 'browser' | 'glb' | 'excalidraw' | 'database' | 'overview';

  const [activeActivity, setActiveActivity] = useState<
    'cad' | 'files' | 'search' | 'mcps' | 'git' | 'debug' | 'remote' |
    'actions' | 'projects' | 'settings' | 'drive' | 'playwright' | null
  >(() => typeof window !== 'undefined' && window.innerWidth < 768 ? null : 'files');

  const [agentPosition, setAgentPosition] = useState<'right' | 'left' | 'off'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'off' : 'right'
  );

  const [isTerminalOpen, setIsTerminalOpen]     = useState(false);
  const [splitLayout, setSplitLayout]           = useState(false);
  const [shellOutputLines, setShellOutputLines] = useState<string[]>([]);
  const [ideWorkspace, setIdeWorkspace]         = useState<IdeWorkspaceSnapshot>(() => ({ source: 'none' }));
  const [recentFiles, setRecentFiles]           = useState<RecentFileEntry[]>([]);
  const [gitBranch, setGitBranch]               = useState(() => 'main');
  const [agentChatConversationId, setAgentChatConversationId] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(LS_AGENT_CHAT_CONVERSATION_ID)?.trim() || '' : ''
  );
  const [errorCount, setErrorCount]     = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [healthOk, setHealthOk]         = useState<boolean | null>(null);
  const [tunnelHealthy, setTunnelHealthy] = useState<boolean | null>(null);
  const [tunnelLabel, setTunnelLabel]   = useState<string | null>(null);
  const [terminalOk, setTerminalOk]     = useState<boolean | null>(null);
  const [lastDeployLine, setLastDeployLine] = useState<string | null>(null);
  const [editorMeta, setEditorMeta]     = useState<EditorModelMeta>({
    tabSize: 2, insertSpaces: true, eol: 'LF', encoding: 'UTF-8',
  });
  const [agentNotifications, setAgentNotifications] = useState<AgentNotificationRow[]>([]);
  const [cursorPos, setCursorPos]       = useState({ line: 1, col: 1 });
  const [nativeFolderOpenSignal, setNativeFolderOpenSignal] = useState(0);
  const [mobileMoreOpen, setMobileMoreOpen]   = useState(false);
  const [isWorkspaceLauncherOpen, setWorkspaceLauncherOpen] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  const mobileSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [githubExpandRepo, setGithubExpandRepo] = useState<string | null>(null);

  const [browserUrl, setBrowserUrl]               = useState<string>('');
  const [browserAddressDisplay, setBrowserAddressDisplay] = useState<string | null>(null);
  const [browserTabTitle, setBrowserTabTitle]     = useState<string | null>(null);
  const [glbViewerUrl, setGlbViewerUrl]           = useState<string>('');
  const [glbViewerFilename, setGlbViewerFilename] = useState('');
  const [toastMsg, setToastMsg]                   = useState<string | null>(null);

  // ── Workspace / auth ──────────────────────────────────────────────────────
  const [authWorkspaceId, setAuthWorkspaceId] = useState<string | null>(null);
  const [workspaceRows, setWorkspaceRows]     = useState<Array<{
    id:          string;
    name:        string;
    environment?: string;
  }>>([]);

  const workspaceDisplayName = useMemo(() => {
    const id = authWorkspaceId?.trim();
    if (id && workspaceRows.length > 0) {
      const row = workspaceRows.find(w => w.id === id);
      if (row?.name?.trim()) return row.name.trim();
      return id;
    }
    return formatWorkspaceStatusLine(ideWorkspace);
  }, [authWorkspaceId, workspaceRows, ideWorkspace]);

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

  useEffect(() => {
    document.title = `${workspaceDisplayName} — ${PRODUCT_NAME}`;
  }, [workspaceDisplayName]);

  // ── IAM_COLLAB realtime — authWorkspaceId, not hardcoded ─────────────────
  useEffect(() => {
    const roomId = authWorkspaceId || 'default';
    const proto  = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl  = `${proto}//${window.location.host}/api/collab/room/${roomId}`;
    const ws     = new WebSocket(wsUrl);
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
    ws.onerror = () => {};
    return () => { try { ws.close(); } catch (_) {} };
  }, [authWorkspaceId]);

  // ── Responsive ────────────────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const fn = () => setIsNarrowViewport(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // ── IDE persist ───────────────────────────────────────────────────────────
  const idePersistRef = useRef({
    ideWorkspace: { source: 'none' } as IdeWorkspaceSnapshot,
    gitBranch: 'main',
    recentFiles: [] as RecentFileEntry[],
  });
  useEffect(() => {
    idePersistRef.current = { ideWorkspace, gitBranch, recentFiles };
  }, [ideWorkspace, gitBranch, recentFiles]);

  const hydrateGenRef    = useRef(0);
  const prevAgentConvRef = useRef<string>('');

  useEffect(() => {
    const id   = agentChatConversationId?.trim() || '';
    const prev = prevAgentConvRef.current;
    prevAgentConvRef.current = id;
    if (prev && prev !== id) {
      const s = idePersistRef.current;
      void persistIdeToApi(prev, { v: IDE_PERSIST_VERSION, ideWorkspace: s.ideWorkspace, gitBranch: s.gitBranch, recentFiles: s.recentFiles });
    }
    if (!id) return;
    const gen = ++hydrateGenRef.current;
    let cancelled = false;
    void hydrateIdeFromApi(id).then(b => {
      if (cancelled || hydrateGenRef.current !== gen) return;
      setIdeWorkspace(b.ideWorkspace);
      setGitBranch(b.gitBranch);
      setRecentFiles(b.recentFiles);
    });
    return () => { cancelled = true; };
  }, [agentChatConversationId]);

  useEffect(() => {
    const id = agentChatConversationId?.trim();
    if (!id) return;
    const t = window.setTimeout(() => {
      void persistIdeToApi(id, { v: IDE_PERSIST_VERSION, ideWorkspace, gitBranch, recentFiles });
    }, 650);
    return () => clearTimeout(t);
  }, [agentChatConversationId, ideWorkspace, gitBranch, recentFiles]);

  const mappedRecentFiles = useMemo(() =>
    recentFiles.map(f => ({
      name:  f.name,
      path:  f.workspacePath || f.githubPath || f.r2Key || f.id,
      label: f.label,
    })),
    [recentFiles]
  );

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [openTabs, setOpenTabs] = useState<TabId[]>(['overview', 'Workspace']);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const activeFile = tabs.find(t => t.id === activeTabId) || null;
  const { updateActiveFile } = useEditor();

  const setActiveFile = useCallback((updates: Partial<ActiveFile> | ((prev: ActiveFile | null) => ActiveFile | null)) => {
    if (typeof updates === 'object' && updates !== null && 'content' in updates && 'name' in updates) {
      openFile(updates as ActiveFile);
    } else {
      updateActiveFile(updates);
    }
  }, [openFile, updateActiveFile]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 4500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const openTab = (tab: TabId) => {
    setOpenTabs(prev => prev.includes(tab) ? prev : [...prev, tab]);
    setActiveTab(tab);
  };

  const closeTab = (tab: TabId, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tab === 'browser') { setBrowserAddressDisplay(null); setBrowserTabTitle(null); }
    const next = openTabs.filter(t => t !== tab);
    setOpenTabs(next);
    if (activeTab === tab) setActiveTab(next.length > 0 ? next[next.length - 1] : 'Workspace');
  };

  // ── Resizable panels ──────────────────────────────────────────────────────
  const [sidebarW, setSidebarW] = useState(260);
  const [agentW, setAgentW]     = useState(360);

  const startResize = (panel: 'sidebar' | 'agent', e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panel === 'sidebar' ? sidebarW : agentW;
    const onMove = (pe: PointerEvent) => {
      const delta = pe.clientX - startX;
      if (panel === 'sidebar') setSidebarW(Math.max(180, Math.min(480, startW + delta)));
      if (panel === 'agent')   setAgentW(Math.max(280, Math.min(600, startW - delta)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── Chat messages ─────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>(() => [
    { role: 'assistant', content: buildAgentSamGreeting(formatWorkspaceStatusLine({ source: 'none' })) },
  ]);

  useEffect(() => {
    setChatMessages(prev => {
      if (prev.length !== 1 || prev[0].role !== 'assistant') return prev;
      const next = buildAgentSamGreeting(workspaceDisplayName);
      if (prev[0].content === next) return prev;
      return [{ role: 'assistant', content: next }];
    });
  }, [workspaceDisplayName]);

  useEffect(() => {
    const onConv = (e: Event) => {
      const raw = (e as CustomEvent<{ id?: string | null }>).detail?.id;
      const id  = typeof raw === 'string' ? raw.trim() : '';
      setAgentChatConversationId(id);
      if (!id) {
        setChatMessages([{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayName) }]);
        return;
      }
      void fetch(`/api/agent/sessions/${encodeURIComponent(id)}/messages`, { credentials: 'same-origin' })
        .then(r => r.ok ? r.json() : [])
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
            const content = typeof raw === 'string' ? raw : raw != null ? JSON.stringify(raw) : '';
            mapped.push({ role, content: content.trim() ? content : '(empty)' });
          }
          setChatMessages(mapped.length
            ? mapped
            : [{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayName) }]
          );
        })
        .catch(() => setChatMessages([{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayName) }]));
    };
    window.addEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onConv);
    return () => window.removeEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onConv);
  }, [workspaceDisplayName]);

  // ── Navigation helpers ────────────────────────────────────────────────────
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
    setOpenTabs(prev => prev.includes('Workspace') ? prev : [...prev, 'Workspace']);
  }, [narrowBackToCenter]);

  const revealMainWorkspaceIfNarrow = useCallback(() => {
    if (isNarrowViewport) narrowBackToCenter();
  }, [isNarrowViewport, narrowBackToCenter]);

  const openInMonacoFromChat = useCallback(
    (file: Pick<ActiveFile, 'name' | 'content'> & Partial<ActiveFile>) => {
      setActiveFile({
        name: file.name, content: file.content,
        originalContent: file.originalContent !== undefined ? file.originalContent : file.content ?? '',
        githubPath: file.githubPath, githubSha: file.githubSha,
        r2Key: file.r2Key, r2Bucket: file.r2Bucket,
      });
      revealMainWorkspaceIfNarrow();
      setOpenTabs(prev => prev.includes('code') ? prev : [...prev, 'code']);
      setActiveTab('code');
      if (isNarrowViewport) setToastMsg('Opened in code editor. Tap Chat (bottom) to return.');
    },
    [revealMainWorkspaceIfNarrow, isNarrowViewport]
  );

  const focusCodeEditorFromChat = useCallback(() => {
    revealMainWorkspaceIfNarrow();
    setOpenTabs(prev => prev.includes('code') ? prev : [...prev, 'code']);
    setActiveTab('code');
    if (isNarrowViewport) setToastMsg('Code editor opened. Tap Chat to return.');
  }, [revealMainWorkspaceIfNarrow, isNarrowViewport]);

  const consumeGithubExpandRepo = useCallback(() => setGithubExpandRepo(null), []);

  useEffect(() => {
    if (!activeFile) return;
    const t = window.setTimeout(() => setRecentFiles(prev => mergeRecentFromActiveFile(prev, activeFile)), 450);
    return () => window.clearTimeout(t);
  }, [activeFile]);

  const openRecentEntry = useCallback(async (entry: RecentFileEntry) => {
    const applySnapshots = (msg?: string) => {
      const work = entry.snapshotWorking || '';
      const orig = entry.snapshotOriginal !== null ? entry.snapshotOriginal : work;
      setActiveFile({ name: entry.name, content: work, originalContent: orig, workspacePath: entry.workspacePath, githubRepo: entry.githubRepo, githubPath: entry.githubPath, githubBranch: entry.githubBranch, r2Key: entry.r2Key, r2Bucket: entry.r2Bucket, driveFileId: entry.driveFileId });
      if (msg) setToastMsg(msg);
      revealMainWorkspaceIfNarrow();
      setOpenTabs(p => p.includes('code') ? p : [...p, 'code']);
      setActiveTab('code');
    };
    try {
      if (entry.githubRepo && entry.githubPath && entry.githubBranch) {
        const [owner, repo] = entry.githubRepo.split('/');
        if (!owner || !repo) throw new Error('bad repo');
        const qs  = new URLSearchParams({ path: entry.githubPath, ref: entry.githubBranch });
        const res = await fetch(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents?${qs}`, { credentials: 'same-origin' });
        const data = await res.json();
        if (!res.ok || data.type !== 'file' || typeof data.content !== 'string') throw new Error('github');
        const raw    = String(data.content).replace(/\n/g, '');
        const binary = atob(raw);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const text = new TextDecoder().decode(bytes);
        setActiveFile({ name: data.name || entry.name, content: text, originalContent: text, githubPath: entry.githubPath, githubRepo: entry.githubRepo, githubSha: typeof data.sha === 'string' ? data.sha : undefined, githubBranch: entry.githubBranch });
      } else if (entry.r2Bucket && entry.r2Key) {
        const res  = await fetch(`/api/r2/file?bucket=${encodeURIComponent(entry.r2Bucket)}&key=${encodeURIComponent(entry.r2Key)}`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('r2');
        const data = await res.json();
        const content = typeof data.content === 'string' ? data.content : '';
        setActiveFile({ name: entry.name, content, originalContent: content, r2Key: entry.r2Key, r2Bucket: entry.r2Bucket });
      } else if (entry.driveFileId) {
        const res  = await fetch(`/api/integrations/gdrive/file?fileId=${encodeURIComponent(entry.driveFileId)}`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('drive');
        const data = await res.json();
        const content = typeof data.content === 'string' ? data.content : '';
        setActiveFile({ name: entry.name, content, originalContent: content, driveFileId: entry.driveFileId });
      } else {
        applySnapshots();
        return;
      }
      revealMainWorkspaceIfNarrow();
      setOpenTabs(p => p.includes('code') ? p : [...p, 'code']);
      setActiveTab('code');
    } catch {
      applySnapshots('Opened from cached snapshot. Use Repos or Files to refresh from remote if needed.');
    }
  }, [revealMainWorkspaceIfNarrow]);

  // ── Terminal events ───────────────────────────────────────────────────────
  useEffect(() => {
    const onRun = (e: Event) => {
      const d = (e as CustomEvent<{ cmd: string }>).detail;
      if (!d?.cmd) return;
      setIsTerminalOpen(true);
      requestAnimationFrame(() => terminalRef.current?.runCommand(d.cmd));
    };
    const onToggle = (e: Event) => {
      const d = (e as CustomEvent<{ open?: boolean }>).detail;
      if (d && typeof d.open === 'boolean') setIsTerminalOpen(d.open);
      else setIsTerminalOpen(o => !o);
    };
    window.addEventListener('iam-run-command', onRun as EventListener);
    window.addEventListener('iam-terminal-toggle', onToggle as EventListener);
    return () => {
      window.removeEventListener('iam-run-command', onRun as EventListener);
      window.removeEventListener('iam-terminal-toggle', onToggle as EventListener);
    };
  }, []);

  // ── Tool launcher events → browser panel ─────────────────────────────────
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ external_url?: string }>).detail;
      const url = d?.external_url?.trim();
      if (!url) return;
      setBrowserAddressDisplay(null);
      setBrowserTabTitle(null);
      setBrowserUrl(url);
      setOpenTabs(prev => prev.includes('browser') ? prev : [...prev, 'browser']);
      setActiveTab('browser');
    };
    // Listen for any iam-tool:* event that carries an external_url
    ['iam-tool:meshy', 'iam-tool:spline', 'iam-tool:blender'].forEach(ev =>
      window.addEventListener(ev, h as EventListener)
    );
    const onDraw = () => {
      setOpenTabs(prev => prev.includes('excalidraw') ? prev : [...prev, 'excalidraw']);
      setActiveTab('excalidraw');
    };
    window.addEventListener('iam-tool:draw', onDraw);
    return () => {
      ['iam-tool:meshy', 'iam-tool:spline', 'iam-tool:blender'].forEach(ev =>
        window.removeEventListener(ev, h as EventListener)
      );
      window.removeEventListener('iam-tool:draw', onDraw);
    };
  }, []);

  // ── DB navigation via CustomEvent (replaces explorerJump prop) ───────────
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ table?: string; sql?: string; dbTarget?: string }>).detail;
      setOpenTabs(prev => prev.includes('database') ? prev : [...prev, 'database']);
      setActiveTab('database');
    };
    window.addEventListener('iam-db-navigate', h as EventListener);
    return () => window.removeEventListener('iam-db-navigate', h as EventListener);
  }, []);

  const toggleActivity = (activity: typeof activeActivity extends null ? never : NonNullable<typeof activeActivity>) => {
    setActiveActivity(prev => prev === activity ? null : activity);
  };

  const openAgentThreadFromProblems = useCallback((sessionId: string) => {
    const id = sessionId.trim();
    if (!id) return;
    try { localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, id); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id } }));
    setAgentPosition(p => p === 'off' ? 'right' : p);
    setActiveActivity(null);
  }, []);

  const handleUnifiedNavigate = useCallback((nav: SearchNavigate) => {
    if (nav.kind === 'table') {
      // Navigate DB panel via event — no prop needed
      window.dispatchEvent(new CustomEvent('iam-db-navigate', { detail: { table: nav.name, dbTarget: 'd1' } }));
      return;
    }
    if (nav.kind === 'conversation') {
      try { localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, nav.id); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id: nav.id } }));
      setAgentPosition(p => p === 'off' ? 'right' : p);
      return;
    }
    if (nav.kind === 'knowledge') {
      if (nav.url && /^https?:\/\//i.test(nav.url)) { window.open(nav.url, '_blank', 'noopener,noreferrer'); return; }
      setActiveActivity('search');
      return;
    }
    if (nav.kind === 'sql') {
      const sql = nav.sql?.trim();
      if (!sql) return;
      window.dispatchEvent(new CustomEvent('iam-db-navigate', { detail: { sql, dbTarget: 'd1' } }));
      return;
    }
    if (nav.kind === 'file' || nav.kind === 'recent_file') {
      const path = nav.path?.trim();
      if (path) setToastMsg(`File: ${path}`);
      return;
    }
    if (nav.kind === 'file_change') {
      setActiveActivity('git');
      return;
    }
    if (nav.kind === 'deployment') {
      const t = 'summary' in nav ? nav.summary?.trim() : '';
      if (t) void navigator.clipboard?.writeText(t).catch(() => {});
    }
    if (nav.kind === 'command') {
      // Shell fires these directly; App handles any UI commands
      if (nav.cmd === 'db')      { openTab('database'); return; }
      if (nav.cmd === 'draw')    { openTab('excalidraw'); return; }
      if (nav.cmd === 'voxel')   { openTab('engine'); return; }
      if (nav.cmd === 'browser') { openTab('browser'); return; }
      if (nav.cmd === 'terminal') { setIsTerminalOpen(p => !p); return; }
      if (nav.cmd === 'mcp')     { toggleActivity('mcps'); return; }
      if (nav.cmd === 'deploy')  { toggleActivity('actions'); return; }
      if (nav.cmd === 'theme')   { toggleActivity('settings'); return; }
      if (nav.cmd === 'new-chat') {
        window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id: null } }));
        return;
      }
      // Default: send to terminal
      terminalRef.current?.runCommand(nav.cmd);
    }
  }, []);

  // ── Live status polling ───────────────────────────────────────────────────
  const fetchLiveStatus = useCallback(async () => {
    const cred = { credentials: 'same-origin' as const };
    try {
      const hr = await fetch('/api/health');
      const hj = await hr.json().catch(() => ({}));
      setHealthOk(hr.ok ? !!hj.ok : false);
    } catch { setHealthOk(false); }
    try {
      const r = await fetch('/api/agent/git/status', cred);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.branch) setGitBranch(String(d.branch));
    } catch { /* ignore */ }
    try {
      const r = await fetch('/api/agent/problems', cred);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d && typeof d === 'object') {
        const mcp    = Array.isArray(d.mcp_tool_errors) ? d.mcp_tool_errors.length : 0;
        const audits = Array.isArray(d.audit_failures) ? d.audit_failures : [];
        const wx     = Array.isArray(d.worker_errors) ? d.worker_errors.length : 0;
        const warnA  = audits.filter((a: { event_type?: string }) => String(a?.event_type || '').toLowerCase().includes('warn'));
        setErrorCount(mcp + wx + (audits.length - warnA.length));
        setWarningCount(warnA.length);
      }
    } catch { /* ignore */ }
    try {
      const r = await fetch('/api/tunnel/status', cred);
      const j = await r.json().catch(() => ({}));
      if (r.ok && typeof j.healthy === 'boolean') {
        setTunnelHealthy(j.healthy);
        const n = typeof j.connections === 'number' ? j.connections : 0;
        setTunnelLabel(j.status ? `${j.status} · ${n} conn` : `${n} conn`);
      } else if (r.status === 401) {
        setTunnelHealthy(null); setTunnelLabel(null);
      } else {
        setTunnelHealthy(false);
        setTunnelLabel(j?.error ? String(j.error).slice(0, 72) : `tunnel ${r.status}`);
      }
    } catch { setTunnelHealthy(null); setTunnelLabel(null); }
    try {
      const r = await fetch('/api/agent/terminal/config-status', cred);
      const j = await r.json().catch(() => ({}));
      if (r.ok) setTerminalOk(!!j.terminal_configured);
    } catch { /* ignore */ }
    try {
      const r = await fetch('/api/overview/deployments', cred);
      const j = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(j.deployments) && j.deployments[0]) {
        const d = j.deployments[0] as { worker_name?: string; environment?: string; status?: string };
        const bits = [d.worker_name, d.environment, d.status].filter(Boolean).map(String);
        setLastDeployLine(bits.join(' · ') || null);
      } else { setLastDeployLine(null); }
    } catch { setLastDeployLine(null); }
    try {
      const r = await fetch('/api/agent/notifications', cred);
      const j = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(j.notifications)) setAgentNotifications(j.notifications as AgentNotificationRow[]);
    } catch { /* ignore */ }
    fetch('/api/agent/telemetry', { method: 'GET', credentials: 'same-origin' }).catch(() => {});
  }, []);

  useEffect(() => {
    void fetchLiveStatus();
    const interval = window.setInterval(() => void fetchLiveStatus(), 20000);
    return () => clearInterval(interval);
  }, [fetchLiveStatus]);

  const markNotificationRead = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/agent/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', credentials: 'same-origin' });
      if (r.ok) setAgentNotifications(prev => prev.filter(n => n.id !== id));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!isNarrowViewport || activeActivity == null) return;
    setAgentPosition('off');
  }, [activeActivity, isNarrowViewport]);

  const cycleAgentPosition = useCallback(() => {
    setAgentPosition(p => p === 'right' ? 'left' : p === 'left' ? 'off' : 'right');
  }, []);

  const onChatLayoutToggle = useCallback(() => {
    if (!isNarrowViewport) { cycleAgentPosition(); return; }
    if (activeActivity) { setActiveActivity(null); return; }
    cycleAgentPosition();
  }, [isNarrowViewport, activeActivity, cycleAgentPosition]);

  const mobileEdgeSwipeHandlers = useMemo(() => ({
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
  }), [isNarrowViewport, narrowBackToCenter]);

  const isDirty = !!activeFile && activeFile.originalContent !== undefined && activeFile.content !== activeFile.originalContent;

  // ── File operations ───────────────────────────────────────────────────────
  const handleR2FileUpdatedFromAgent = useCallback(async (event: { type: 'r2_file_updated'; bucket: string; key: string }) => {
    if (event.type !== 'r2_file_updated' || !event.bucket || !event.key) return;
    try {
      const res  = await fetch(`/api/r2/file?bucket=${encodeURIComponent(event.bucket)}&key=${encodeURIComponent(event.key)}`, { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      const content  = typeof data.content === 'string' ? data.content : '';
      const baseName = event.key.split('/').pop() || event.key;
      setActiveFile({ name: baseName, content, originalContent: content, r2Key: event.key, r2Bucket: event.bucket });
      revealMainWorkspaceIfNarrow();
      setOpenTabs(prev => prev.includes('code') ? prev : [...prev, 'code']);
      setActiveTab('code');
      if (isNarrowViewport) setToastMsg('Opened R2 file in editor. Tap Chat to return.');
    } catch (e) { console.error(e); }
  }, [isNarrowViewport, revealMainWorkspaceIfNarrow]);

  const handleBrowserNavigateFromAgent = useCallback((event: { type: 'browser_navigate'; url: string }) => {
    if (event.type !== 'browser_navigate' || !event.url?.trim()) return;
    revealMainWorkspaceIfNarrow();
    setBrowserAddressDisplay(null);
    setBrowserTabTitle(null);
    setBrowserUrl(event.url.trim());
    setOpenTabs(prev => prev.includes('browser') ? prev : [...prev, 'browser']);
    setActiveTab('browser');
    if (isNarrowViewport) setToastMsg('Browser tab opened. Tap Chat to return.');
  }, [revealMainWorkspaceIfNarrow, isNarrowViewport]);

  const htmlPreviewBlobRef = useRef<string | null>(null);
  useEffect(() => () => { if (htmlPreviewBlobRef.current) URL.revokeObjectURL(htmlPreviewBlobRef.current); }, []);

  const openEditorPreview = useCallback(() => {
    if (!activeFile?.content) return;
    const name = activeFile.name || '';
    if (!isRenderablePreviewFilename(name)) return;
    if (htmlPreviewBlobRef.current) { URL.revokeObjectURL(htmlPreviewBlobRef.current); htmlPreviewBlobRef.current = null; }
    let blob: Blob;
    if (/\.(html|htm)$/i.test(name)) {
      blob = new Blob([activeFile.content], { type: 'text/html; charset=utf-8' });
    } else if (/\.svg$/i.test(name)) {
      blob = new Blob([activeFile.content], { type: 'image/svg+xml;charset=utf-8' });
    } else if (/\.md$/i.test(name)) {
      const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${escapeHtmlForPreview(name)}</title><style>body{font-family:system-ui;max-width:52rem;margin:1rem auto;padding:0 1rem;line-height:1.5}</style></head><body><pre style="white-space:pre-wrap;font-size:13px">${escapeHtmlForPreview(activeFile.content)}</pre></body></html>`;
      blob = new Blob([doc], { type: 'text/html; charset=utf-8' });
    } else if (/\.(jsx|tsx)$/i.test(name)) {
      const isTsx  = /\.tsx$/i.test(name);
      const srcEsc = escapeHtmlForPreview(activeFile.content.slice(0, 12000));
      const doc    = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${escapeHtmlForPreview(name)}</title></head><body><p><strong>React preview requires a build step.</strong> ${isTsx ? 'TSX' : 'JSX'} must be compiled.</p><pre style="white-space:pre-wrap;font-size:12px">${srcEsc}</pre></body></html>`;
      blob = new Blob([doc], { type: 'text/html; charset=utf-8' });
    } else { return; }
    const u = URL.createObjectURL(blob);
    htmlPreviewBlobRef.current = u;
    setBrowserAddressDisplay(previewAddressBarLabel(activeFile));
    setBrowserTabTitle(activeFile.name?.trim() ? `Preview · ${activeFile.name.trim()}` : 'Preview');
    setBrowserUrl(u);
    setOpenTabs(prev => prev.includes('browser') ? prev : [...prev, 'browser']);
    setActiveTab('browser');
  }, [activeFile]);

  const guessMimeForDrive = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'application/javascript; charset=utf-8', json: 'application/json; charset=utf-8', md: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8', ts: 'text/typescript; charset=utf-8', tsx: 'text/typescript; charset=utf-8', jsx: 'text/javascript; charset=utf-8', svg: 'image/svg+xml', csv: 'text/csv; charset=utf-8' };
    return map[ext] || 'text/plain; charset=utf-8';
  };

  const handleSaveFile = useCallback(async (content: string) => {
    if (!activeFile) return;
    if (activeFile.driveFileId) {
      try {
        const res = await fetch('/api/drive/file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ fileId: activeFile.driveFileId, content, mimeType: guessMimeForDrive(activeFile.name || 'file.txt') }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setToastMsg(typeof data.error === 'string' ? data.error : 'Drive save failed'); return; }
        setActiveFile(prev => prev ? { ...prev, content, originalContent: content } : null);
        setToastMsg('Saved to Google Drive');
      } catch { setToastMsg('Drive save failed'); }
      return;
    }
    if (activeFile.handle) {
      try {
        const writable = await activeFile.handle.createWritable();
        await writable.write(content);
        await writable.close();
        setActiveFile(prev => prev ? { ...prev, content, originalContent: content } : null);
      } catch (err) { console.error('Save failed:', err); }
      return;
    }
    if (activeFile.r2Key) {
      try {
        const res = await fetch('/api/r2/file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ bucket: activeFile.r2Bucket ?? 'DASHBOARD', key: activeFile.r2Key, content }) });
        if (!res.ok) { console.error('R2 save failed', await res.text()); return; }
        setActiveFile(prev => prev ? { ...prev, content, originalContent: content } : null);
      } catch (e) { console.error(e); }
      return;
    }
    if (activeFile.githubPath && activeFile.githubRepo) {
      const [owner, repo] = activeFile.githubRepo.split('/');
      if (!owner || !repo) return;
      const base64 = btoa(unescape(encodeURIComponent(content)));
      try {
        const res  = await fetch(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ path: activeFile.githubPath, message: `Update via ${PRODUCT_NAME}`, content: base64, sha: activeFile.githubSha, ...(activeFile.githubBranch ? { branch: activeFile.githubBranch } : {}) }) });
        const data = await res.json().catch(() => ({}));
        setActiveFile(prev => prev ? { ...prev, content, originalContent: content, githubSha: data.content?.sha || data.sha || prev.githubSha } : null);
        setToastMsg('Saved to GitHub');
      } catch { setToastMsg('GitHub save failed'); }
      return;
    }
    setActiveFile(prev => prev ? { ...prev, content, originalContent: content } : null);
  }, [activeFile]);

  const handleSave = async (id: string) => {
    try {
      await fetch(`/api/cad/upload/${id}`, { method: 'POST', body: JSON.stringify({ undoStack, genConfig, sceneConfig }) });
      setToastMsg(`Project saved as ${id}`);
    } catch { setToastMsg('Save failed'); }
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
      setToastMsg('Project loaded');
    } catch { setToastMsg('Load failed'); }
  };

  const runInTerminal = useCallback((cmd: string) => {
    if (!isTerminalOpen) setIsTerminalOpen(true);
    setTimeout(() => terminalRef.current?.runCommand(cmd), 100);
  }, [isTerminalOpen]);

  const writeToTerminal = useCallback((text: string) => {
    if (!isTerminalOpen) setIsTerminalOpen(true);
    setTimeout(() => terminalRef.current?.writeToTerminal(text), 100);
  }, [isTerminalOpen]);

  // ── Themes ────────────────────────────────────────────────────────────────
  useEffect(() => {
    migrateLegacyThemeLocalStorage();
    fetchAndApplyActiveCmsTheme(authWorkspaceId)
      .then(payload => {
        const hasVars = payload?.data && typeof payload.data === 'object' && Object.keys(payload.data).length > 0;
        if (!hasVars) applyCachedCmsThemeFallback();
      })
      .catch(() => applyCachedCmsThemeFallback());
  }, [authWorkspaceId]);

  // Cmd+J toggles terminal
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') { setIsTerminalOpen(p => !p); e.preventDefault(); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  // ── 3D engine ─────────────────────────────────────────────────────────────
  const [genConfig, setGenConfig]     = useState<GenerationConfig>({ style: ArtStyle.CYBERPUNK, density: 5, usePhysics: true, cadTool: CADTool.NONE, cadPlane: CADPlane.XZ, extrusion: 1 });
  const [sceneConfig, setSceneConfig] = useState<SceneConfig>({ ambientIntensity: 1.5, sunColor: '#ffffff', castShadows: true, showPhysicsDebug: false });

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new VoxelEngine(containerRef.current, s => setAppState(s), c => setVoxelCount(c));
    engineRef.current = engine;
    engine.setOnEntityCreated(entity => { setUndoStack(prev => [...prev, entity]); setRedoStack([]); });
    engine.updateLighting(sceneConfig);
    engine.setCADPlane(genConfig.cadPlane);
    engine.setExtrusion(genConfig.extrusion);
    const handleResize = () => engine.handleResize();
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); engine.cleanup(); };
  }, []);

  useEffect(() => { engineRef.current?.updateLighting(sceneConfig); }, [sceneConfig]);

  const handleUndo = () => {
    if (!undoStack.length) return;
    const last = undoStack[undoStack.length - 1];
    engineRef.current?.removeEntity(last.id);
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, last]);
  };

  const handleRedo = () => {
    if (!redoStack.length) return;
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
    openTab('engine');
    setActiveActivity('cad');
  };

  const handleUpdateGenConfig = (cfg: Partial<GenerationConfig>) => {
    const next = { ...genConfig, ...cfg };
    setGenConfig(next);
    if (cfg.cadTool !== undefined)   engineRef.current?.setCADTool(cfg.cadTool);
    if (cfg.cadPlane !== undefined)  engineRef.current?.setCADPlane(cfg.cadPlane);
    if (cfg.extrusion !== undefined) engineRef.current?.setExtrusion(cfg.extrusion);
  };

  const handleSpawnModel = (name: string, url: string, scale: number) => {
    const entity: GameEntity = { id: `asset_${Date.now()}`, name, type: 'prop', modelUrl: url, scale, position: { x: (Math.random() - 0.5) * 10, y: 10, z: (Math.random() - 0.5) * 10 }, behavior: { type: 'dynamic', mass: 10, restitution: 0.2 } };
    engineRef.current?.spawnEntity(entity);
    setUndoStack(prev => [...prev, entity]);
    setRedoStack([]);
  };

  const handleAddCustomAsset    = (name: string, url: string) => setCustomAssets(prev => [...prev, { id: `custom_${Date.now()}`, name, url }]);
  const handleRemoveCustomAsset = (id: string)                 => setCustomAssets(prev => prev.filter(a => a.id !== id));

  const handleCommand = async (prompt: string) => {
    if (prompt.startsWith('save ')) { await handleSave(prompt.replace('save ', '').trim()); return; }
    if (prompt.startsWith('load ')) { await handleLoad(prompt.replace('load ', '').trim()); return; }
    setIsGenerating(true);
    try {
      const styleGuidelines = { [ArtStyle.CYBERPUNK]: 'Neon accents, high-contrast, glowing colors.', [ArtStyle.BRUTALIST]: 'Monolithic shapes, concrete-gray, massive proportions.', [ArtStyle.ORGANIC]: 'Soft curves, earth tones, flowing bio-inspired shapes.', [ArtStyle.LOW_POLY]: 'Basic geometric primitives, simple color blocking.' };
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: `PROJECT: ${activeProject}\nSTYLE: ${genConfig.style}\nGUIDELINES: ${styleGuidelines[genConfig.style]}\nPHYSICS: ${genConfig.usePhysics}\nDENSITY: ${genConfig.density}/10\nCOMMAND: "${prompt}"\n\nReturn a JSON array of NEW entities.` }) });
      const data = await res.json();
      if (data.response && engineRef.current) {
        const entities: unknown[] = JSON.parse(data.response);
        entities.forEach(ent => {
          const e = ent as Record<string, unknown>;
          const formatted = { ...e, voxels: (e.voxels as unknown[]).map((v: unknown) => { const vx = v as Record<string, unknown>; return { ...vx, color: typeof vx.color === 'string' ? parseInt(vx.color.replace('#', ''), 16) : vx.color }; }) };
          engineRef.current?.spawnEntity(formatted as GameEntity);
          setUndoStack(prev => [...prev, formatted as GameEntity]);
        });
        setRedoStack([]);
      }
    } catch (err) { console.error('Studio Operation Failed', err); }
    finally { setIsGenerating(false); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const narrowBlocksCenter = isNarrowViewport && (!!activeActivity || agentPosition !== 'off');
  const narrowNeedsBack    = narrowBlocksCenter;
  const statusIndentLabel  = useMemo(() => `${editorMeta.insertSpaces ? 'Spaces' : 'Tabs'}: ${editorMeta.tabSize}`, [editorMeta]);

  const lastPersistedTabRef = useRef<TabId | null>(null);
  useEffect(() => { lastPersistedTabRef.current = null; }, [agentChatConversationId]);
  useEffect(() => {
    const id = agentChatConversationId?.trim();
    if (!id) return;
    const prev = lastPersistedTabRef.current;
    lastPersistedTabRef.current = activeTab;
    if (prev === null || prev === activeTab) return;
    void persistIdeToApi(id, { v: IDE_PERSIST_VERSION, ideWorkspace, gitBranch, recentFiles });
  }, [activeTab, agentChatConversationId, ideWorkspace, gitBranch, recentFiles]);

  useEffect(() => {
    if (!glbViewerUrl.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(glbViewerUrl);
  }, [glbViewerUrl]);

  const handleSendMessage = useCallback((msg: string) => {
    if (!msg.trim()) return;
    if (agentPosition === 'off') setAgentPosition('right');
    window.dispatchEvent(new CustomEvent('iam-agent-external-send', { detail: { message: msg } }));
  }, [agentPosition]);

  // ── Chat panel content ────────────────────────────────────────────────────
  const chatPanelContent = (
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
        const url = URL.createObjectURL(file);
        setGlbViewerUrl(prev => { if (prev.startsWith('blob:')) URL.revokeObjectURL(prev); return url; });
        setGlbViewerFilename(file.name);
        openTab('engine');
        engineRef.current?.spawnEntity({ id: `chat-glb-${Date.now()}`, name: file.name.replace(/\.glb$/i, ''), type: 'prop', position: { x: 0, y: 1, z: 0 }, behavior: { type: 'dynamic', mass: 10, restitution: 0.2 }, modelUrl: url, scale: 1 });
      }}
      onRunInTerminal={runInTerminal}
      onR2FileUpdated={handleR2FileUpdatedFromAgent}
      onBrowserNavigate={handleBrowserNavigateFromAgent}
      onOpenGitHubIntegration={openGitHubFromChat}
      onMobileOpenDashboard={openDashboardFromChat}
      onOpenCodeTab={focusCodeEditorFromChat}
    />
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-[100dvh] bg-[var(--bg-app)] overflow-hidden text-[var(--text-main)] font-sans flex flex-col">

      {/* TOP BAR */}
      <div className="h-10 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-1 opacity-80 pl-1 shrink-0 min-w-0">
          {narrowNeedsBack && (
            <button type="button" className="md:hidden shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]" onClick={narrowBackToCenter} aria-label="Back">
              <ChevronLeft size={18} strokeWidth={1.75} />
            </button>
          )}
          <img
            src="/api/branding/logo"
            alt=""
            className="w-7 h-7 object-contain drop-shadow shrink-0 cursor-pointer"
            title={workspaceDisplayName}
            onClick={() => setActiveTab('Workspace')}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <button type="button" onClick={() => toggleActivity(activeActivity ?? 'files')} className="shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] ml-1">
            {activeActivity ? <PanelLeftClose size={18} strokeWidth={1.75} /> : <PanelLeft size={18} strokeWidth={1.75} />}
          </button>
        </div>

        <div className="flex-1 flex justify-center items-center min-w-0 px-2 gap-2">
          <UnifiedSearchBar
            workspaceLabel={workspaceDisplayName}
            recentFiles={mappedRecentFiles}
            onNavigate={(nav, _q) => handleUnifiedNavigate(nav)}
            onRunCommand={(cmd) => terminalRef.current?.runCommand(cmd)}
          />
        </div>

        <div className="flex gap-0.5 items-center mr-1 shrink-0">
          <button type="button" title="More (mobile)" className="md:hidden p-1.5 rounded transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]" onClick={() => setMobileMoreOpen(true)}>
            <MoreHorizontal size={15} strokeWidth={1.75} />
          </button>
          <button type="button" title="Toggle split editor" className={`p-1.5 rounded transition-colors ${splitLayout ? 'text-[var(--color-primary)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'}`} onClick={() => setSplitLayout(v => !v)}>
            <Columns2 size={15} strokeWidth={1.75} />
          </button>
          <button type="button" title="Toggle agent panel" className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] rounded transition-colors" onClick={onChatLayoutToggle}>
            {agentPosition === 'left' ? <PanelLeftClose size={15} strokeWidth={1.75} /> : <PanelRightClose size={15} strokeWidth={1.75} />}
          </button>
          <button type="button" title="Terminal (Cmd+J)" className={`p-1.5 rounded transition-colors ${isTerminalOpen ? 'text-[var(--color-primary)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'}`} onClick={() => setIsTerminalOpen(p => !p)}>
            <TermIcon size={15} strokeWidth={1.75} />
          </button>
          <button type="button" title="Settings" className={`p-1.5 rounded transition-colors ${activeActivity === 'settings' ? 'text-[var(--color-primary)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'}`} onClick={() => toggleActivity('settings')}>
            <Settings size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden max-md:pb-[52px]">

        {/* ACTIVITY BAR */}
        <div className="hidden md:flex w-12 bg-[var(--bg-panel)] flex-col items-center py-4 gap-4 border-r border-[var(--border-subtle)] shrink-0 z-50">
          <ActivityIcon icon={PenTool}   title="Draw"           active={openTabs.includes('excalidraw')} onClick={() => openTab('excalidraw')} />
          <ActivityIcon icon={Search}    title="Search"         active={activeActivity === 'search'}     onClick={() => toggleActivity('search')} />
          <ActivityIcon icon={GitBranch} title="Source Control" active={activeActivity === 'git'}        onClick={() => toggleActivity('git')} />
          <ActivityIcon icon={Bug}       title="Run & Debug"    active={activeActivity === 'debug'}      onClick={() => toggleActivity('debug')} />
          <ActivityIcon icon={Network}   title="Remote"         active={activeActivity === 'remote'}     onClick={() => toggleActivity('remote')} />
          <ActivityIcon icon={Layers}    title="Tools & MCP"    active={activeActivity === 'mcps'}       onClick={() => toggleActivity('mcps')} />
          <ActivityIcon icon={Github}    title="GitHub"         active={activeActivity === 'actions'}    onClick={() => toggleActivity('actions')} />
          <ActivityIcon icon={Database}  title="Database"       active={openTabs.includes('database')}   onClick={() => { openTab('database'); setActiveActivity(null); }} />
          <ActivityIcon icon={Cloud}     title="Cloud Sync"     active={activeActivity === 'drive'}      onClick={() => toggleActivity('drive')} />
          <ActivityIcon icon={Monitor}   title="Playwright"     active={activeActivity === 'playwright'} onClick={() => toggleActivity('playwright')} />
          <div className="flex-1" />
          <ActivityIcon icon={FolderOpen} title="Projects"      active={activeActivity === 'projects'}   onClick={() => toggleActivity('projects')} />
          {/* Studio (was "Engine View") — Box icon distinguishes from Monitor/Playwright */}
          <ActivityIcon icon={Box}       title="Studio"         active={activeActivity === 'cad'}        onClick={() => toggleActivity('cad')} />
          <ActivityIcon icon={Settings}  title="Settings"       active={activeActivity === 'settings'}   onClick={() => toggleActivity('settings')} />
        </div>

        {/* LEFT AGENT */}
        {agentPosition === 'left' && (
          <>
            <div
              className={`bg-[var(--bg-panel)] flex flex-col shrink-0 transition-opacity relative group z-30 opacity-100 glass-panel max-md:fixed max-md:inset-0 max-md:z-[45] max-md:w-full max-md:max-w-none max-md:shrink ${activeActivity ? 'max-md:hidden' : ''}`}
              style={isNarrowViewport ? { borderRight: '1px solid var(--border-subtle)' } : { width: agentW, borderRight: '1px solid var(--border-subtle)' }}
              {...(narrowNeedsBack && !activeActivity ? mobileEdgeSwipeHandlers : {})}
            >
              <div className="h-10 max-md:hidden border-b border-[var(--border-subtle)] flex items-center px-4 font-semibold text-[11px] tracking-widest uppercase text-[var(--text-muted)] shrink-0">{PRODUCT_NAME}</div>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{chatPanelContent}</div>
            </div>
            <div className="max-md:hidden w-1 cursor-col-resize hover:bg-[var(--color-primary)] active:bg-[var(--color-primary)] transition-colors shrink-0 z-50" onPointerDown={e => startResize('agent', e)} />
          </>
        )}

        {/* SIDEBAR */}
        <div
          className={`transition-all duration-75 shrink-0 bg-[var(--bg-panel)] flex flex-col z-40 overflow-hidden shadow-2xl md:shadow-none relative group glass-panel
          ${activeActivity ? 'absolute inset-y-0 left-0 md:relative md:left-0 max-md:!w-full max-md:z-[46] max-md:inset-0 border-r border-[var(--border-subtle)] opacity-100 pointer-events-auto' : 'border-none opacity-0 pointer-events-none'}`}
          style={{ width: activeActivity ? sidebarW : 0 }}
          {...(narrowNeedsBack && !!activeActivity ? mobileEdgeSwipeHandlers : {})}
        >
          <div className="w-full h-full flex flex-col relative">
            {activeActivity === 'cad'        && <StudioSidebar activeProject={activeProject} onSwitchProject={handleProjectSwitch} onExport={() => engineRef.current?.exportForBlender()} genConfig={genConfig} onUpdateGenConfig={handleUpdateGenConfig} sceneConfig={sceneConfig} onUpdateSceneConfig={cfg => setSceneConfig(prev => ({ ...prev, ...cfg }))} onSpawnModel={handleSpawnModel} customAssets={customAssets} onAddCustomAsset={handleAddCustomAsset} onRemoveCustomAsset={handleRemoveCustomAsset} isEmbedded />}
            {activeActivity === 'search'     && <KnowledgeSearchPanel onClose={() => setActiveActivity(null)} activeConversationId={agentChatConversationId} />}
            {activeActivity === 'files'      && <LocalExplorer nativeFolderOpenSignal={nativeFolderOpenSignal} onWorkspaceRootChange={({ folderName }) => setIdeWorkspace({ source: 'local', folderName })} onFileSelect={f => { setActiveFile({ ...f, originalContent: f.content }); openTab('code'); revealMainWorkspaceIfNarrow(); }} onOpenInEditor={f => { setActiveFile(f); openTab('code'); revealMainWorkspaceIfNarrow(); }} />}
            {activeActivity === 'mcps'       && <MCPPanel />}
            {activeActivity === 'settings'   && <SettingsPanel workspaceId={authWorkspaceId} onClose={() => setActiveActivity(null)} onFileSelect={f => { setActiveFile({ ...f, originalContent: f.content }); openTab('code'); revealMainWorkspaceIfNarrow(); }} />}
            {activeActivity === 'actions'    && <GitHubExplorer expandRepoFullName={githubExpandRepo} onExpandRepoConsumed={consumeGithubExpandRepo} onOpenInEditor={f => { setActiveFile(f); openTab('code'); revealMainWorkspaceIfNarrow(); }} />}
            {activeActivity === 'drive'      && <GoogleDriveExplorer onOpenInEditor={f => { setActiveFile(f); openTab('code'); revealMainWorkspaceIfNarrow(); }} />}
            {activeActivity === 'remote'     && <R2Explorer onOpenInEditor={f => { setActiveFile(f); openTab('code'); revealMainWorkspaceIfNarrow(); }} />}
            {activeActivity === 'playwright' && <PlaywrightConsole />}
            {activeActivity === 'debug'      && <ProblemsDebugPanel onClose={() => setActiveActivity(null)} onNavigateToAgentThread={openAgentThreadFromProblems} onOpenMcpPanel={() => setActiveActivity('mcps')} />}
            {activeActivity === 'git'        && <SourcePanel />}
            {activeActivity === 'projects'   && (
              <WorkspaceExplorerPanel
                ideWorkspace={ideWorkspace}
                workspaceTitle={workspaceDisplayName}
                recentFiles={recentFiles}
                onRefreshRecent={() => { const sid = agentChatConversationId?.trim(); if (!sid) return; void hydrateIdeFromApi(sid).then(b => setRecentFiles(b.recentFiles)); }}
                onClearRecentFiles={() => { setRecentFiles([]); const sid = agentChatConversationId?.trim(); if (sid) void persistIdeToApi(sid, { v: IDE_PERSIST_VERSION, ideWorkspace, gitBranch, recentFiles: [] }); }}
                onOpenRecent={e => void openRecentEntry(e)}
                onOpenLocalFolder={() => { setActiveActivity('files'); setNativeFolderOpenSignal(n => n + 1); }}
                onOpenFilesActivity={() => setActiveActivity('files')}
                onOpenGitHubActivity={() => setActiveActivity('actions')}
                onOpenWorkspace={(name, path) => setIdeWorkspace({ source: 'pinned', name, pathHint: path })}
              />
            )}
            {!activeActivity && <div className="p-4 text-xs text-[var(--text-muted)]">Panel empty.</div>}
          </div>
        </div>

        {activeActivity && (
          <div className="w-1 cursor-col-resize hover:bg-[var(--color-primary)] active:bg-[var(--color-primary)] transition-colors shrink-0 z-50 hidden md:block" onPointerDown={e => startResize('sidebar', e)} />
        )}

        {/* MAIN EDITOR */}
        <div className={`flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--bg-app)] relative ${narrowBlocksCenter ? 'max-md:hidden' : ''}`}>

          {/* Tab bar — no QuickOpen pills */}
          <div className="h-10 flex items-center shrink-0 pl-0 relative z-10 overflow-x-auto overflow-y-hidden no-scrollbar">
            {openTabs.includes('Workspace')  && <Tab title="Workspace" icon={<Layers size={13} className="text-[var(--color-primary)]" />}  active={activeTab === 'Workspace'}  onClick={() => setActiveTab('Workspace')}  onClose={e => closeTab('Workspace', e)} />}
            {openTabs.includes('code') && (
              <>
                <Tab
                  title={<span className="flex items-center gap-1">{activeFile ? activeFile.name : 'Untitled.ts'}{isDirty && <span className="text-[var(--color-primary)] text-[10px] animate-pulse-dirty">●</span>}</span>}
                  icon={<LayoutTemplate size={13} className={activeFile ? 'text-[var(--color-primary)]' : 'text-[var(--text-muted)]'} />}
                  active={activeTab === 'code'} onClick={() => setActiveTab('code')} onClose={e => closeTab('code', e)}
                />
                {activeFile && isRenderablePreviewFilename(activeFile.name) && (
                  <button type="button" onClick={e => { e.stopPropagation(); openEditorPreview(); }} title={previewButtonTitle(activeFile.name)} className="shrink-0 h-8 w-8 p-0 inline-flex items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--text-main)] hover:bg-[var(--bg-panel)] hover:border-[var(--color-primary)]">
                    <Eye size={15} className="text-[var(--color-primary)]" strokeWidth={1.75} aria-hidden />
                  </button>
                )}
                {activeFile?.r2Key?.trim() && activeFile?.r2Bucket?.trim() && (
                  <button type="button" onClick={e => { e.stopPropagation(); void navigator.clipboard.writeText(`${activeFile.r2Bucket!.trim()}/${activeFile.r2Key!.trim()}`); setToastMsg('R2 path copied'); }} title="Copy R2 path" className="shrink-0 h-8 w-8 p-0 inline-flex items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-hover)] hover:border-[var(--color-primary)]">
                    <Link2 size={14} className="text-[var(--text-muted)]" strokeWidth={1.75} aria-hidden />
                  </button>
                )}
              </>
            )}
            {openTabs.includes('engine')     && <Tab title="Studio"   icon={<Box size={13} />}       active={activeTab === 'engine'}    onClick={() => setActiveTab('engine')}    onClose={e => closeTab('engine', e)} />}
            {openTabs.includes('browser')    && <Tab title={browserTabTitle ?? 'Browser'} icon={<Globe size={13} />} active={activeTab === 'browser'}  onClick={() => setActiveTab('browser')}   onClose={e => closeTab('browser', e)} />}
            {openTabs.includes('excalidraw') && <Tab title="Draw"     icon={<PenTool size={13} />}   active={activeTab === 'excalidraw'} onClick={() => setActiveTab('excalidraw')} onClose={e => closeTab('excalidraw', e)} />}
            {openTabs.includes('overview')   && <Tab title="Overview" icon={<LayoutGrid size={13} />} active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} onClose={e => closeTab('overview', e)} />}
            {openTabs.includes('database')   && <Tab title="Database" icon={<Database size={13} />}  active={activeTab === 'database'}  onClick={() => setActiveTab('database')}  onClose={e => closeTab('database', e)} />}
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--border-subtle)] z-[-1]" />
          </div>

          {/* Editor body */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
            <div className="flex-1 min-h-0 relative flex flex-col">
              <div ref={containerRef} className={`absolute inset-0 z-0 transition-opacity duration-300 ${activeTab === 'engine' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} style={{ background: 'var(--scene-bg)' }} />
              {activeTab === 'Workspace'  && (
                <div className="absolute inset-0 z-10">
                  <WorkspaceDashboard
                    onOpenFolder={() => { setActiveActivity('files'); setNativeFolderOpenSignal(n => n + 1); }}
                    onConnectWorkspace={() => setWorkspaceLauncherOpen(true)}
                    onGithubSync={() => setActiveActivity('actions')}
                    recentFiles={recentFiles}
                    workspaceRows={workspaceRows}
                    authWorkspaceId={authWorkspaceId}
                    onSwitchWorkspace={id => setAuthWorkspaceId(id)}
                    onSendMessage={handleSendMessage}
                  />
                </div>
              )}
              {activeTab === 'engine' && (
                <div className="relative z-10 w-full h-full pointer-events-none flex flex-col justify-end pb-8">
                  <UIOverlay
                    voxelCount={voxelCount}
                    appState={appState}
                    activeProject={activeProject}
                    isGenerating={isGenerating}
                    onTogglePlay={() => {}}
                    onClear={() => { engineRef.current?.clearWorld(); setUndoStack([]); setRedoStack([]); }}
                    genConfig={genConfig}
                    onUpdateGenConfig={handleUpdateGenConfig}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    canUndo={undoStack.length > 0}
                    canRedo={redoStack.length > 0}
                  />
                  <div className="pointer-events-auto">
                    <ToolLauncherBar
                      onToolEvent={(eventName, detail) => {
                        // External URLs → browser panel (handled by event listener above)
                        // Draw → excalidraw (handled by event listener above)
                      }}
                      onImportGlb={(file) => {
                        const url = URL.createObjectURL(file);
                        setGlbViewerUrl(prev => { if (prev.startsWith('blob:')) URL.revokeObjectURL(prev); return url; });
                        setGlbViewerFilename(file.name);
                        openTab('engine');
                        engineRef.current?.spawnEntity({ id: `glb-${Date.now()}`, name: file.name.replace(/\.glb$/i, ''), type: 'prop', position: { x: 0, y: 1, z: 0 }, behavior: { type: 'dynamic', mass: 10, restitution: 0.2 }, modelUrl: url, scale: 1 });
                      }}
                    />
                  </div>
                </div>
              )}
              {activeTab === 'code'      && (
                <div className="absolute inset-0 z-10" data-editor-split={splitLayout ? 'true' : undefined}>
                  <MonacoEditorView
                    fileData={activeFile}
                    onSave={handleSaveFile}
                    onCursorPositionChange={(line, col) => setCursorPos({ line, col })}
                    onEditorModelMeta={setEditorMeta}
                  />
                </div>
              )}
              {activeTab === 'browser'   && <div className="absolute inset-0 z-10 overflow-hidden"><BrowserView url={browserUrl} addressDisplay={browserAddressDisplay} /></div>}
              {activeTab === 'excalidraw' && <div className="absolute inset-0 z-10 flex flex-col"><ExcalidrawView /></div>}
              {activeTab === 'overview'  && <div className="absolute inset-0 z-10 overflow-hidden"><CommandCenter /></div>}
              {activeTab === 'database'  && (
                <div className="absolute inset-0 z-10 flex flex-col min-h-0 overflow-hidden bg-[var(--bg-app)]">
                  <DatabaseBrowser
                    onClose={() => {
                      const next = openTabs.filter(t => t !== 'database');
                      setOpenTabs(next);
                      if (activeTab === 'database') setActiveTab(next.length > 0 ? next[next.length - 1] : 'Workspace');
                    }}
                  />
                </div>
              )}
            </div>

            {isTerminalOpen && (
              <GorillaModeShell
                ref={terminalRef}
                onClose={() => setIsTerminalOpen(false)}
                workspaceLabel={workspaceDisplayName}
                workspaceId={authWorkspaceId || ''}
                productLabel={PRODUCT_NAME}
                workspaceCdCommand={workspaceCdCommand}
                showWelcomeBar={false}
                outputLines={shellOutputLines.map(text => ({ text }))}
              />
            )}
          </div>
        </div>

        {/* RIGHT AGENT */}
        {agentPosition === 'right' && (
          <>
            <div className="max-md:hidden w-1 cursor-col-resize hover:bg-[var(--color-primary)] active:bg-[var(--color-primary)] transition-colors shrink-0 z-50" onPointerDown={e => startResize('agent', e)} />
            <div
              className={`bg-[var(--bg-panel)] flex flex-col shrink-0 transition-opacity z-30 relative group opacity-100 glass-panel max-md:fixed max-md:inset-0 max-md:z-[45] max-md:w-full max-md:max-w-none max-md:shrink ${isNarrowViewport && activeActivity ? 'max-md:hidden' : ''}`}
              style={isNarrowViewport ? { borderLeft: '1px solid var(--border-subtle)' } : { width: agentW, borderLeft: '1px solid var(--border-subtle)' }}
              {...(narrowNeedsBack && !activeActivity ? mobileEdgeSwipeHandlers : {})}
            >
              <div className="h-10 max-md:hidden border-b border-[var(--border-subtle)] flex items-center px-4 font-semibold text-[11px] tracking-widest uppercase text-[var(--text-muted)] shrink-0">{PRODUCT_NAME}</div>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{chatPanelContent}</div>
            </div>
          </>
        )}
      </div>

      {/* TOAST */}
      {toastMsg && (
        <div className="fixed bottom-16 left-1/2 z-[200] -translate-x-1/2 px-4 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[11px] text-[var(--text-main)] shadow-lg max-w-md text-center max-md:[bottom:calc(56px+1.5rem+env(safe-area-inset-bottom,0px)+8px)]" role="status">
          {toastMsg}
        </div>
      )}

      {/* MOBILE BOTTOM TAB BAR */}
      <nav className="md:hidden fixed inset-x-0 z-[90] flex items-stretch justify-around border-t border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 backdrop-blur-sm" style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }} aria-label="Primary">
        <MobileNavBtn label="Chat"     icon={MessageSquare} active={agentPosition !== 'off' && !activeActivity} onClick={onChatLayoutToggle} />
        <MobileNavBtn label="Database" icon={Database}      active={openTabs.includes('database')}               onClick={() => { openTab('database'); setActiveActivity(null); }} />
        <MobileNavBtn label="Explorer" icon={FolderOpen}    active={activeActivity === 'projects'}               onClick={() => toggleActivity('projects')} />
        <MobileNavBtn label="Deploy"   icon={Github}        active={activeActivity === 'actions'}                onClick={() => toggleActivity('actions')} />
        <MobileNavBtn label="Settings" icon={Settings}      active={activeActivity === 'settings'}               onClick={() => toggleActivity('settings')} />
      </nav>

      {/* MOBILE MORE SHEET */}
      {mobileMoreOpen && (
        <>
          <button type="button" className="md:hidden fixed inset-0 z-[95] bg-[var(--text-main)]/25 backdrop-blur-[2px]" aria-label="Close" onClick={() => setMobileMoreOpen(false)} />
          <div className="md:hidden fixed left-2 right-2 z-[96] max-h-[min(72vh,calc(100dvh-10rem))] flex flex-col rounded-t-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl overflow-hidden" style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px) + 52px)' }}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">More</span>
              <button type="button" className="p-2 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" onClick={() => setMobileMoreOpen(false)}>
                <XIcon size={18} strokeWidth={1.75} />
              </button>
            </div>
            <div className="overflow-y-auto p-2 flex flex-col gap-0.5">
              {[
                { icon: PenTool,   label: 'Draw',           action: () => { setMobileMoreOpen(false); setActiveActivity(null); setAgentPosition('off'); openTab('excalidraw'); } },
                { icon: Search,    label: 'Search',         action: () => { setMobileMoreOpen(false); toggleActivity('search'); } },
                { icon: GitBranch, label: 'Source Control', action: () => { setMobileMoreOpen(false); toggleActivity('git'); } },
                { icon: Bug,       label: 'Run & Debug',    action: () => { setMobileMoreOpen(false); toggleActivity('debug'); } },
                { icon: Network,   label: 'Remote',         action: () => { setMobileMoreOpen(false); toggleActivity('remote'); } },
                { icon: Layers,    label: 'Tools & MCP',    action: () => { setMobileMoreOpen(false); toggleActivity('mcps'); } },
                { icon: Cloud,     label: 'Cloud Sync',     action: () => { setMobileMoreOpen(false); toggleActivity('drive'); } },
                { icon: Monitor,   label: 'Playwright',     action: () => { setMobileMoreOpen(false); toggleActivity('playwright'); } },
                { icon: Box,       label: 'Studio',         action: () => { setMobileMoreOpen(false); toggleActivity('cad'); } },
              ].map(({ icon, label, action }) => (
                <MobileMoreRow key={label} icon={icon} label={label} onClick={action} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* STATUS BAR */}
      <StatusBar
        branch={gitBranch}
        workspace={workspaceDisplayName}
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
        onBrandClick={() => window.open(window.location.origin, '_blank', 'noopener,noreferrer')}
        onGitBranchClick={() => toggleActivity('git')}
        onWorkspaceClick={() => toggleActivity('projects')}
        onErrorsClick={() => toggleActivity('debug')}
        onWarningsClick={() => toggleActivity('mcps')}
        onCursorClick={() => { if (isNarrowViewport) narrowBackToCenter(); openTab('code'); }}
        onVersionClick={() => {}}
        onFormatClick={() => window.dispatchEvent(new CustomEvent('iam-format-document'))}
      />

      {isWorkspaceLauncherOpen && (
        <WorkspaceLauncher
          onClose={() => setWorkspaceLauncherOpen(false)}
          onOpenLocalFolder={() => { setWorkspaceLauncherOpen(false); setActiveActivity('files'); setNativeFolderOpenSignal(n => n + 1); }}
          onConnectWorkspace={() => setWorkspaceLauncherOpen(false)}
        />
      )}
    </div>
  );
};

// ─── Helper UI Components ─────────────────────────────────────────────────────

const MobileMoreRow: React.FC<{ icon: LucideLike; label: string; onClick: () => void }> = ({ icon: Icon, label, onClick }) => (
  <button type="button" className="flex w-full items-center gap-3 min-h-[44px] rounded-lg px-3 text-left text-[13px] text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors border border-transparent hover:border-[var(--border-subtle)]" onClick={onClick}>
    <Icon size={20} strokeWidth={1.5} className="shrink-0 text-[var(--text-muted)]" />
    <span>{label}</span>
  </button>
);

const MobileNavBtn: React.FC<{ icon: LucideLike; label: string; active: boolean; onClick: () => void }> = ({ icon: Icon, label, active, onClick }) => (
  <button type="button" className={`flex flex-1 flex-col items-center justify-center min-h-[44px] gap-0.5 px-0.5 text-[10px] font-medium leading-tight ${active ? 'text-[var(--color-primary)]' : 'text-[var(--text-muted)]'}`} onClick={onClick}>
    <Icon size={24} strokeWidth={1.5} aria-hidden />
    <span>{label}</span>
  </button>
);

const ActivityIcon: React.FC<{ icon: LucideLike; active: boolean; onClick: () => void; title?: string }> = ({ icon: Icon, active, onClick, title }) => (
  <div onClick={onClick} title={title} className={`p-3 cursor-pointer transition-colors relative ${active ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
    {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-9 bg-[var(--color-primary)] rounded-r-md" />}
    <Icon size={25} strokeWidth={1} />
  </div>
);

const Tab: React.FC<{
  title:    React.ReactNode;
  icon:     React.ReactNode;
  active:   boolean;
  onClick:  () => void;
  onClose?: (e: React.MouseEvent) => void;
}> = ({ title, icon, active, onClick, onClose }) => (
  <div onClick={onClick} className={`h-full flex items-center gap-1.5 pl-3 pr-2 text-[12px] select-none cursor-pointer border-r border-[var(--border-subtle)] relative group whitespace-nowrap shrink-0 ${active ? 'bg-[var(--bg-app)] text-[var(--color-primary)]' : 'bg-[var(--bg-panel)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}`}>
    {active && <div className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--color-primary)]" />}
    {icon}
    <span className="max-w-[120px] truncate">{title}</span>
    {onClose && (
      <button
        onClick={onClose}
        className={`ml-1 p-0.5 rounded transition-all hover:bg-[var(--solar-red)]/20 hover:text-[var(--solar-red)] ${active ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-50 hover:!opacity-100'}`}
        title="Close tab"
      >
        <XIcon size={11} />
      </button>
    )}
    {!active && <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--border-subtle)]" />}
  </div>
);

export default App;
