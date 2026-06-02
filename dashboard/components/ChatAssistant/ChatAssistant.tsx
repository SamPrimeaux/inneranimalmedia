
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  Loader2,
  ChevronRight,
  Paperclip,
  Infinity,
  ListTodo,
  MessageCircle,
  RefreshCw,
  Image as ImageIconLucide,
  AtSign,
  Slash,
  FileText,
  X,
  ChevronDown,
  ChevronLeft,
  MoreHorizontal,
  GitBranch,
  LayoutDashboard,
  Zap,
  Plus,
  ExternalLink,
  FolderGit2,
  Bug,
  Target,
  Sparkles,
  Layers,
  ShieldCheck,
  Play,
} from 'lucide-react';
import { ProjectType } from '../../types';
import type { ActiveFile } from '../../types';
import { SetiFileIcon } from '../../src/components/SetiFileIcon';
import {
  IAM_AGENT_CHAT_CONVERSATION_CHANGE,
  IAM_AGENT_CHAT_NEW_THREAD,
  IAM_AGENT_CHAT_COMPOSE,
  LS_AGENT_CHAT_CONVERSATION_ID,
  type AgentChatComposeDetail,
  type QuickstartThreadDetail,
} from '../../agentChatConstants';
import type { AgentSessionRow } from '../../agentSessionsCatalog';
import type {
  ChatAssistantProps,
  ChatModelRow,
  Message,
  MessageAttachmentPreview,
  PickerItem,
  SlashCmd,
  StagedAttachment,
  ToolApprovalPayload,
  WorkflowLedgerState,
} from './types';
import type { AgentToolTraceRow } from './execution/types';
import { ExecutionTimeline, ScriptDraftPanel, shellSingleQuote } from './execution';
import {
  LS_GH_REPO,
  MENTION_CONTEXT_HEADER,
  CHAT_ATTACH_MAX_TOTAL_BYTES,
  CHAT_REQUEST_MAX_BYTES,
  MOBILE_CHAT_COMPOSER_BOTTOM_PAD,
  COMPOSER_TEXTAREA_MAX_PX_NARROW,
  COMPOSER_TEXTAREA_MAX_PX_WIDE,
  AgentMode,
  AGENT_MODES,
  AUTO_MODEL_KEY,
  LS_AGENT_CHAT_MODEL_KEY,
  LS_AGENT_CHAT_MODE,
  isAutoModelSelection,
} from './types';
import { buildMentionContext, isChatTextCodeFile, readFileAsText, getEditorDisplayPath, getEditorLightweightPath } from './mentionContext';
import {
  measureAboveAnchor,
  syncComposerTextareaHeight,
  formatFileSize,
  isAgentSamEmptyThreadGreeting,
} from './composerLayout';
import { formatHttpErrorMessage } from './streamParsing';
import { consumeAgentChatSseBody } from './hooks/useAgentChatStream';
import { initIamAgentStreamDebug, patchIamAgentStreamDebug } from './streamDebug';
import { AgentMessageList } from './components/AgentMessageList';
import { ThinkingCard } from '../../src/components/ThinkingCard';
import type { ThinkingCardState } from '../../src/components/ThinkingCard';
import { ToolApprovalModal } from '../../src/components/ToolApprovalModal';
import {
  parseAndDispatchDatabaseStudioActions,
  tryDispatchDbApplyFromAssistantMessage,
} from '../../src/lib/databaseStudioEvents';
import '../../features/agent-presence/presenceMotion.css';
import '../../features/agent-presence/presenceIcons.css';
import { useAgentPresence, AgentPresenceStatus } from '../../features/agent-presence';
import { derivePresenceState } from '../../features/agent-presence/iamDerivePresenceState';
import {
  pickAgentPresenceColorway,
  agentPresenceColorwayStyle,
} from '../../features/agent-presence/presenceColorways';

type ChatRoutingSendOpts = {
  modelKey?: string;
  task_type?: string;
  route_key?: string;
  quickstart_batch?: string;
  apply_eto_after_run?: boolean;
  workspace_id?: string;
  /** Handoff child session — bypass stale React conversationId on auto-continue. */
  conversationIdOverride?: string;
  handoffResume?: boolean;
};

function routingSendOptsFromDetail(detail?: QuickstartThreadDetail | null): ChatRoutingSendOpts | undefined {
  if (!detail) return undefined;
  const opts: ChatRoutingSendOpts = {};
  if (detail.modelKey?.trim()) opts.modelKey = detail.modelKey.trim();
  if (detail.task_type?.trim()) opts.task_type = detail.task_type.trim();
  if (detail.route_key?.trim()) opts.route_key = detail.route_key.trim();
  if (detail.quickstart_batch?.trim()) opts.quickstart_batch = detail.quickstart_batch.trim();
  if (detail.apply_eto_after_run) opts.apply_eto_after_run = true;
  if (detail.workspace_id?.trim()) opts.workspace_id = detail.workspace_id.trim();
  return Object.keys(opts).length ? opts : undefined;
}

export { IAM_AGENT_CHAT_CONVERSATION_CHANGE, IAM_AGENT_CHAT_NEW_THREAD } from '../../agentChatConstants';

export const ChatAssistant: React.FC<ChatAssistantProps> = ({
  activeProject,
  activeFileContent,
  activeFileName,
  activeFile,
  editorCursorLine,
  editorCursorColumn,
  messages,
  setMessages,
  onFileSelect,
  onRunInTerminal,
  onR2FileUpdated,
  onBrowserNavigate,
  onGlbFileSelect,
  onOpenGitHubIntegration,
  onMobileOpenDashboard,
  onOpenCodeTab,
  onLoadingChange,
  onApprovalRequired,
  agentRunId = null,
  onAgentRunContext,
  onOpenChatHistory,
  agentsamPolicy = null,
  workspaceId = null,
  syncedHostConversationId,
  agentChatShellTabs,
  activeAgentChatShellTabId,
  onAgentChatShellTabSelect,
  onAgentChatShellNewTab,
  activeWorkbenchTab,
  browserUrl: browserUrlProp,
  openFilePaths,
  activePlanId,
}) => {
  const agentsamPolicyRef = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    agentsamPolicyRef.current = agentsamPolicy;
  }, [agentsamPolicy]);

  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => { onLoadingChange?.(isLoading); }, [isLoading, onLoadingChange]);
  const [thinkingState, setThinkingState] =
    useState<ThinkingCardState | null>(null);
  const [presenceState, setPresenceState] = useState<string>('idle');
  const [subagentWork, setSubagentWork] = useState<{ state: string; detail?: string } | null>(null);
  useEffect(() => {
    if (!isLoading) setSubagentWork(null);
  }, [isLoading]);
  const thinkingStartRef = useRef<number>(0);
  const presenceColorwayRef = useRef(pickAgentPresenceColorway());
  const presenceColorwayStyle = useMemo(
    () => agentPresenceColorwayStyle(presenceColorwayRef.current),
    [],
  );

  const readIsDarkTheme = () => document.documentElement.getAttribute('data-theme') !== 'light';
  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    typeof document !== 'undefined' ? readIsDarkTheme() : true,
  );
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setIsDarkTheme(readIsDarkTheme());
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const [input, setInput] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  /** After SSE `done`, ignore duplicate terminal events for this request. */
  const streamFinalizedRef = useRef(false);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const messageQueueRef = useRef<string[]>([]);
  useEffect(() => {
    messageQueueRef.current = messageQueue;
  }, [messageQueue]);
  const handleSendRef = useRef<(override?: string) => Promise<void>>(async () => {});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachButtonRef = useRef<HTMLButtonElement>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [attachMenuStyle, setAttachMenuStyle] = useState<React.CSSProperties | null>(null);
  const [modeMenuStyle, setModeMenuStyle] = useState<React.CSSProperties | null>(null);
  const [modelPickerStyle, setModelPickerStyle] = useState<React.CSSProperties | null>(null);
  const [modes] = useState(AGENT_MODES);
  const [mode, setMode] = useState<AgentMode>(() => {
    if (typeof localStorage === 'undefined') return 'agent';
    try {
      const stored = localStorage.getItem(LS_AGENT_CHAT_MODE);
      if (stored && AGENT_MODES.some((m) => m.id === stored)) return stored as AgentMode;
    } catch {
      /* ignore */
    }
    return 'agent';
  });
  const [isModeOpen, setIsModeOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [defaultModelKey, setDefaultModelKey] = useState<string | null>(null);

  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  /** Structured BrowserView selection — appended to next Agent Sam message as JSON context. */
  const [browserElementContext, setBrowserElementContext] = useState<Record<string, unknown> | null>(null);
  /** Latest `iam-browser-surface-context` from BrowserView (URL, route, viewport). */
  const browserSurfaceRef = useRef<Record<string, unknown> | null>(null);
  /** Latest `iam-database-surface-context` from DatabasePage. */
  const databaseSurfaceRef = useRef<Record<string, unknown> | null>(null);
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  /** Optional workflow run stream (`agent_universal_autonomous_run` / graph SSE). */
  const [workflowLedger, setWorkflowLedger] = useState<{
    runId: string | null;
    stepsTotal: number | null;
    stepsCompleted: number;
    currentNodeKey: string | null;
    runCost: number | null;
    runTokensIn: number | null;
    runTokensOut: number | null;
    lastError: string | null;
  }>({
    runId: null,
    stepsTotal: null,
    stepsCompleted: 0,
    currentNodeKey: null,
    runCost: null,
    runTokensIn: null,
    runTokensOut: null,
    lastError: null,
  });
  const activePlanIdRef = useRef<string | null>(activePlanId?.trim() || null);
  useEffect(() => {
    activePlanIdRef.current = activePlanId?.trim() || null;
  }, [activePlanId]);
  const totalStagedBytes = useMemo(
    () => attachments.reduce((sum, a) => sum + (a.file.size || 0), 0),
    [attachments]
  );
  const [composerDragging, setComposerDragging] = useState(false);
  const composerDragDepthRef = useRef(0);
  const [conversationId, setConversationId] = useState<string>(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(LS_AGENT_CHAT_CONVERSATION_ID) || '' : ''
  );
  const [threadTitle, setThreadTitle] = useState<string>('');

  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  const [mobileHubTab, setMobileHubTab] = useState<'agents' | 'automations' | 'dashboard'>('agents');
  const [mobileThreadTab, setMobileThreadTab] = useState<'chat' | 'context'>('chat');
  const [repoDrawerOpen, setRepoDrawerOpen] = useState(false);
  const [ghRepos, setGhRepos] = useState<Array<{ id: string | number; full_name: string; name: string; default_branch?: string }>>(
    []
  );
  const [ghReposLoading, setGhReposLoading] = useState(false);
  const [ghReposAuthed, setGhReposAuthed] = useState(true);
  const [githubRepoContext, setGithubRepoContext] = useState<string | null>(() => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(LS_GH_REPO) : null;
    } catch {
      return null;
    }
  });
  const [repoSearch, setRepoSearch] = useState('');

  useEffect(() => {
    const onLegacy = (ev: Event) => {
      const d = (ev as CustomEvent<Record<string, unknown>>).detail;
      if (d && typeof d === 'object' && d.type === 'browser_element_selected') {
        setBrowserElementContext(d);
      }
    };
    const onSelectedBridge = (ev: Event) => {
      const d = (ev as CustomEvent<Record<string, unknown>>).detail;
      if (d && typeof d === 'object') {
        setBrowserElementContext({ ...d, type: 'browser_element_selected' });
      }
    };
    window.addEventListener('iam:browser-element-selected', onLegacy as EventListener);
    window.addEventListener('iam:browser-selected-element', onSelectedBridge as EventListener);
    return () => {
      window.removeEventListener('iam:browser-element-selected', onLegacy as EventListener);
      window.removeEventListener('iam:browser-selected-element', onSelectedBridge as EventListener);
    };
  }, []);

  useEffect(() => {
    const onSurface = (ev: Event) => {
      const d = (ev as CustomEvent<Record<string, unknown>>).detail;
      if (d && typeof d === 'object') browserSurfaceRef.current = d;
    };
    const onDatabaseSurface = (ev: Event) => {
      const d = (ev as CustomEvent<Record<string, unknown>>).detail;
      if (d && typeof d === 'object') databaseSurfaceRef.current = d;
    };
    window.addEventListener('iam-browser-surface-context', onSurface as EventListener);
    window.addEventListener('iam-database-surface-context', onDatabaseSurface as EventListener);
    return () => {
      window.removeEventListener('iam-browser-surface-context', onSurface as EventListener);
      window.removeEventListener('iam-database-surface-context', onDatabaseSurface as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!agentsamPolicy) return;
    const ar = String(agentsamPolicy.auto_run_mode || '').toLowerCase();
    if (ar === 'disabled' || ar === 'manual') setMode('ask');
    else if (ar === 'allowlist' || ar === 'auto') setMode('agent');
  }, [agentsamPolicy]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const u = () => setIsNarrow(mq.matches);
    mq.addEventListener('change', u);
    return () => mq.removeEventListener('change', u);
  }, []);

  useEffect(() => {
    console.log('[ChatAssistant] canonical mounted agent-app-sse-v1');
  }, []);

  useEffect(() => {
    syncComposerTextareaHeight(
      textareaRef.current,
      isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE,
    );
  }, [isNarrow]);

  const loadGhRepos = useCallback(async () => {
    setGhReposLoading(true);
    try {
      const res = await fetch('/api/integrations/github/repos', { credentials: 'same-origin' });
      if (!res.ok) {
        setGhReposAuthed(false);
        setGhRepos([]);
        return;
      }
      setGhReposAuthed(true);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.repos || [];
      setGhRepos(Array.isArray(list) ? list : []);
    } catch {
      setGhReposAuthed(false);
      setGhRepos([]);
    } finally {
      setGhReposLoading(false);
    }
  }, []);

  useEffect(() => {
    if (repoDrawerOpen) void loadGhRepos();
  }, [repoDrawerOpen, loadGhRepos]);

  const [sessions, setSessions] = useState<AgentSessionRow[]>([]);
  const hydratedFromLsRef = useRef(false);

  const loadSessions = useCallback(async () => {
    try {
      const r = await fetch('/api/agent/sessions', { credentials: 'same-origin' });
      const data = r.ok ? await r.json() : [];
      setSessions(Array.isArray(data) ? (data as AgentSessionRow[]) : []);
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions, conversationId]);

  useEffect(() => {
    if (typeof window === 'undefined' || hydratedFromLsRef.current) return;
    hydratedFromLsRef.current = true;
    if (onAgentChatShellNewTab) {
      return;
    }
    const id = localStorage.getItem(LS_AGENT_CHAT_CONVERSATION_ID)?.trim();
    if (id) {
      queueMicrotask(() => {
        window.dispatchEvent(
          new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id } })
        );
      });
    }
  }, [onAgentChatShellNewTab]);

  useEffect(() => {
    if (typeof syncedHostConversationId !== 'string') return;
    setConversationId(syncedHostConversationId);
    try {
      if (syncedHostConversationId) localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, syncedHostConversationId);
      else localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
    } catch {
      /* ignore */
    }
  }, [syncedHostConversationId]);

  const handleNewChat = useCallback(() => {
    setMobileThreadTab('chat');
    setThreadTitle('New Chat');
    setPythonDraftHint(null);
    if (onAgentChatShellNewTab) {
      onAgentChatShellNewTab();
      return;
    }
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
    setConversationId('');
    window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id: null } }));
  }, [onAgentChatShellNewTab]);

  useEffect(() => {
    const onExternal = (e: Event) => {
      const raw = (e as CustomEvent<{ id?: string | null }>).detail?.id;
      if (raw === null || raw === undefined) {
        setMobileThreadTab('chat');
        setThreadTitle('New Chat');
        if (typeof localStorage !== 'undefined') localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
        setConversationId('');
        return;
      }
      if (typeof raw === 'string' && raw.trim()) {
        const id = raw.trim();
        setMobileThreadTab('chat');
        try {
          localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, id);
        } catch {
          /* ignore */
        }
        setConversationId(id);
      }
    };
    window.addEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onExternal);
    
    const onExternalSend = (e: Event) => {
      const detail = (e as CustomEvent<QuickstartThreadDetail>).detail;
      const msg = detail?.message?.trim();
      if (!msg) return;
      void handleSend(msg, routingSendOptsFromDetail(detail));
    };
    window.addEventListener('iam-agent-external-send', onExternalSend);

    const onNewThreadMessage = (e: Event) => {
      const detail = (e as CustomEvent<QuickstartThreadDetail>).detail;
      const msg = detail?.message?.trim();
      if (!msg) return;
      setMobileThreadTab('chat');
      setThreadTitle('New Chat');
      setPythonDraftHint(null);
      queueMicrotask(() => {
        void handleSend(msg, routingSendOptsFromDetail(detail));
      });
    };
    window.addEventListener(IAM_AGENT_CHAT_NEW_THREAD, onNewThreadMessage);

    const onCompose = (e: Event) => {
      const detail = (e as CustomEvent<AgentChatComposeDetail>).detail;
      const msg = detail?.message ?? '';
      if (!msg) return;
      if (detail?.send) {
        void handleSend(msg.trim(), routingSendOptsFromDetail(detail as QuickstartThreadDetail));
        return;
      }
      setMobileThreadTab('chat');
      setInput(msg);
      const start = detail.selectionStart ?? msg.length;
      const end = detail.selectionEnd ?? start;
      queueMicrotask(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        try {
          el.setSelectionRange(start, end);
        } catch {
          /* ignore */
        }
        syncComposerTextareaHeight(
          el,
          isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE,
        );
      });
    };
    window.addEventListener(IAM_AGENT_CHAT_COMPOSE, onCompose);

    return () => {
      window.removeEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onExternal);
      window.removeEventListener('iam-agent-external-send', onExternalSend);
      window.removeEventListener(IAM_AGENT_CHAT_NEW_THREAD, onNewThreadMessage);
      window.removeEventListener(IAM_AGENT_CHAT_COMPOSE, onCompose);
    };
  }, [handleSend, isNarrow]);

  const [pendingToolApproval, setPendingToolApproval] = useState<{
    tool: ToolApprovalPayload;
  } | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);

  const [toolTraceRows, setToolTraceRows] = useState<AgentToolTraceRow[]>([]);
  const [pythonDraftHint, setPythonDraftHint] = useState<string | null>(null);
  const [draftSyntaxBusy, setDraftSyntaxBusy] = useState(false);
  const [draftRunBusy, setDraftRunBusy] = useState(false);

  const runDraftTerminalCommand = useCallback(async (label: string, cmd: string) => {
    const id = `local-script-${Date.now()}`;
    setToolTraceRows((prev) => [
      ...prev,
      {
        id,
        toolName: label,
        status: 'running',
        lines: [`$ ${cmd}`],
        startedAtLabel: new Date().toLocaleTimeString(),
        local: true,
      },
    ]);
    try {
      const res = await fetch('/api/agent/terminal/run', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      const j = (await res.json().catch(() => ({}))) as { output?: string; error?: string };
      const out = (j.output ?? j.error ?? '').slice(0, 12000);
      const ok = res.ok && !j.error;
      setToolTraceRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: ok ? 'done' : 'error',
                lines: [`$ ${cmd}`, out || (res.ok ? '(no stdout/stderr captured)' : `HTTP ${res.status}`)],
              }
            : r,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setToolTraceRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'error', lines: [...r.lines, msg] } : r)),
      );
    }
  }, []);

  const handlePythonDraftOpened = useCallback((fileName: string) => {
    setPythonDraftHint(fileName);
  }, []);

  const handleDraftSyntaxCheck = useCallback(async () => {
    const wp = activeFile?.workspacePath?.trim();
    const name = activeFile?.name || activeFileName || '';
    if (!wp || wp.startsWith('mcp_tool:') || !/\.py$/i.test(name)) return;
    setDraftSyntaxBusy(true);
    try {
      const cmd = `python3 -m py_compile ${shellSingleQuote(wp)}`;
      await runDraftTerminalCommand('Syntax check (py_compile)', cmd);
    } finally {
      setDraftSyntaxBusy(false);
    }
  }, [activeFile, activeFileName, runDraftTerminalCommand]);

  const handleDraftRunScript = useCallback(async () => {
    const wp = activeFile?.workspacePath?.trim();
    const name = activeFile?.name || activeFileName || '';
    if (!wp || wp.startsWith('mcp_tool:') || !/\.py$/i.test(name)) return;
    setDraftRunBusy(true);
    try {
      const cmd = `python3 ${shellSingleQuote(wp)}`;
      await runDraftTerminalCommand('Run Python script', cmd);
    } finally {
      setDraftRunBusy(false);
    }
  }, [activeFile, activeFileName, runDraftTerminalCommand]);

  const { presence, logoMotion } = useAgentPresence({
    isLoading,
    mode,
    thinkingState,
    pendingToolApproval,
    approvalBusy,
    toolTraceRows,
    workflowLedger,
    draftSyntaxBusy,
    draftRunBusy,
    subagentWork,
  });

  const [chatModels, setChatModels] = useState<ChatModelRow[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState<string>(() => {
    if (typeof localStorage === 'undefined') return AUTO_MODEL_KEY;
    try {
      const stored = localStorage.getItem(LS_AGENT_CHAT_MODEL_KEY);
      if (stored != null && String(stored).trim() !== '') {
        return isAutoModelSelection(stored) ? AUTO_MODEL_KEY : String(stored).trim();
      }
    } catch {
      /* ignore */
    }
    return AUTO_MODEL_KEY;
  });

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionItems, setMentionItems] = useState<PickerItem[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStyle, setMentionStyle] = useState<React.CSSProperties | null>(null);
  const mentionQueryRef = useRef<{ start: number; end: number } | null>(null);

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashItems, setSlashItems] = useState<SlashCmd[]>([]);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashStyle, setSlashStyle] = useState<React.CSSProperties | null>(null);
  const slashQueryRef = useRef<{ start: number; end: number } | null>(null);

  const catalogCacheRef = useRef<{ at: number; items: PickerItem[] } | null>(null);
  const commandsCacheRef = useRef<{ at: number; items: SlashCmd[] } | null>(null);

  const measureAttachMenu = useCallback(() => {
    setAttachMenuStyle(measureAboveAnchor(attachButtonRef.current, 240, 420));
  }, []);

  const measureModeMenu = useCallback(() => {
    setModeMenuStyle(measureAboveAnchor(modeButtonRef.current, 200, 320));
  }, []);

  const measureModelPickerMenu = useCallback(() => {
    setModelPickerStyle(measureAboveAnchor(modelButtonRef.current, 280, 360, 320));
  }, []);

  useLayoutEffect(() => {
    if (!attachMenuOpen) {
      setAttachMenuStyle(null);
      return;
    }
    measureAttachMenu();
    const h = () => measureAttachMenu();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
    };
  }, [attachMenuOpen, measureAttachMenu]);

  useLayoutEffect(() => {
    if (!isModeOpen) {
      setModeMenuStyle(null);
      return;
    }
    measureModeMenu();
    const h = () => measureModeMenu();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
    };
  }, [isModeOpen, measureModeMenu]);

  useLayoutEffect(() => {
    if (!isModelPickerOpen) {
      setModelPickerStyle(null);
      return;
    }
    measureModelPickerMenu();
    const h = () => measureModelPickerMenu();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
    };
  }, [isModelPickerOpen, measureModelPickerMenu]);

  useLayoutEffect(() => {
    if (!mentionOpen && !slashOpen) return;
    const clampW = slashOpen ? 320 : 280;
    const st = measureAboveAnchor(textareaRef.current, 220, 280, clampW);
    if (mentionOpen) setMentionStyle(st);
    if (slashOpen) setSlashStyle(st);
    const h = () => {
      const s = measureAboveAnchor(textareaRef.current, 220, 280, clampW);
      if (mentionOpen) setMentionStyle(s);
      if (slashOpen) setSlashStyle(s);
    };
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
    };
  }, [mentionOpen, slashOpen, input]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_AGENT_CHAT_MODE, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_AGENT_CHAT_MODEL_KEY, selectedModelKey);
    } catch {
      /* ignore */
    }
  }, [selectedModelKey]);

  useEffect(() => {
    fetch('/api/agent/models?show_in_picker=1', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const rows: ChatModelRow[] = (data as Record<string, unknown>[]).map((raw) => ({
          id: String(raw.id ?? raw.model_key ?? ''),
          name: String(raw.name ?? raw.display_name ?? raw.model_key ?? ''),
          provider: String(raw.provider ?? ''),
          model_key: String(raw.model_key ?? ''),
          api_platform: String(raw.api_platform ?? ''),
          picker_group:
            raw.picker_group != null && String(raw.picker_group).trim()
              ? String(raw.picker_group).trim()
              : '',
          size_class: raw.size_class != null ? String(raw.size_class) : '',
          input_rate_per_mtok: raw.input_rate_per_mtok != null ? Number(raw.input_rate_per_mtok) : null,
          output_rate_per_mtok: raw.output_rate_per_mtok != null ? Number(raw.output_rate_per_mtok) : null,
        }));
        setChatModels(rows);
        setSelectedModelKey((prev) => {
          if (isAutoModelSelection(prev)) return AUTO_MODEL_KEY;
          if (prev && rows.some((m) => m.model_key === prev)) return prev;
          return AUTO_MODEL_KEY;
        });
      })
      .catch(() => {});
  }, []);

  const prevSelectedModelKeyRef = useRef('');
  useEffect(() => {
    const prev = prevSelectedModelKeyRef.current;
    prevSelectedModelKeyRef.current = selectedModelKey;
    if (!selectedModelKey || prev || isLoading) return;
    const q = messageQueueRef.current;
    if (!q.length) return;
    const next = q[0];
    setMessageQueue((prevQ) => prevQ.slice(1));
    void handleSendRef.current(next);
  }, [selectedModelKey, isLoading]);

  useEffect(() => {
    fetch('/api/settings/default-model', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d: { default_model?: string | null }) => {
        setDefaultModelKey(typeof d.default_model === 'string' && d.default_model.trim() ? d.default_model.trim() : null);
      })
      .catch(() => setDefaultModelKey(null));
  }, []);

  const modeLabel = modes.find((m) => m.id === mode)?.label ?? mode;

  const modelPickerLabel = useMemo(() => {
    if (isAutoModelSelection(selectedModelKey)) return 'Auto';
    const row = chatModels.find((m) => m.model_key === selectedModelKey);
    return row?.name || selectedModelKey || 'Auto';
  }, [chatModels, selectedModelKey]);

  const modeIcon = useMemo(() => {
    const sz = 12;
    const cls = 'shrink-0 text-[var(--dashboard-muted)]';
    switch (mode) {
      case 'plan':
        return <ListTodo size={sz} className={cls} />;
      case 'debug':
        return <Bug size={sz} className={cls} />;
      case 'multitask':
        return <RefreshCw size={sz} className={cls} />;
      case 'ask':
        return <MessageCircle size={sz} className={cls} />;
      default:
        return <Infinity size={sz} className={cls} />;
    }
  }, [mode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('iam-chat-mode', { detail: { label: modeLabel, slug: mode.toLowerCase() } }));
  }, [modeLabel, mode]);

  async function loadCatalog(): Promise<PickerItem[]> {
    const now = Date.now();
    if (catalogCacheRef.current && now - catalogCacheRef.current.at < 60000) {
      return catalogCacheRef.current.items;
    }
    const res = await fetch('/api/agent/context-picker/catalog');
    if (!res.ok) return [];
    const data = await res.json();
    const items: PickerItem[] = [];
    (data.tables || []).forEach((t: string) => {
      items.push({ id: `table:${t}`, label: t, kind: 'table' });
    });
    (data.workflows || []).forEach((w: { id?: string; name?: string }) => {
      items.push({ id: `wf:${w.id}`, label: w.name || w.id || '', kind: 'workflow' });
    });
    (data.commands || []).forEach((c: { slug?: string; name?: string }) => {
      items.push({ id: `cmd:${c.slug}`, label: c.name || c.slug || '', kind: 'command' });
    });
    (data.memory_keys || []).forEach((k: string) => {
      items.push({ id: `mem:${k}`, label: k, kind: 'memory' });
    });
    (data.workspaces || []).forEach((w: { id?: string; name?: string }) => {
      items.push({ id: `ws:${w.id}`, label: w.name || w.id || '', kind: 'workspace' });
    });
    catalogCacheRef.current = { at: now, items };
    return items;
  }

  async function loadCommands(): Promise<SlashCmd[]> {
    const now = Date.now();
    if (commandsCacheRef.current && now - commandsCacheRef.current.at < 60000) {
      return commandsCacheRef.current.items;
    }
    const res = await fetch('/api/agent/commands');
    if (!res.ok) return [];
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [];
    const items = arr.map((r: { id?: string; slug: string; description?: string }) => ({
      id: r.id,
      slug: r.slug,
      description: r.description ?? null,
    }));
    commandsCacheRef.current = { at: now, items };
    return items;
  }

  const syncPickers = useCallback(
    async (value: string, cursor: number) => {
      const before = value.slice(0, cursor);
      const atMatch = before.match(/@([^\s@]*)$/);
      if (atMatch) {
        if (Number(agentsamPolicyRef.current?.agent_autocomplete) === 0) {
          setMentionOpen(false);
          mentionQueryRef.current = null;
          return;
        }
        const q = atMatch[1];
        const start = cursor - atMatch[0].length;
        mentionQueryRef.current = { start, end: cursor };
        const all = await loadCatalog();
        const f = all.filter((it) => it.label.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
        setMentionItems(f);
        setMentionIndex(0);
        setMentionOpen(f.length > 0);
        setSlashOpen(false);
        return;
      }
      setMentionOpen(false);
      mentionQueryRef.current = null;

      const slashMatch = before.match(/(?:^|\s)(\/[\w-]*)$/);
      if (slashMatch) {
        const full = slashMatch[1];
        const q = full.slice(1);
        const start = cursor - full.length;
        slashQueryRef.current = { start, end: cursor };
        const all = await loadCommands();
        const f = all
          .filter((c) => c.slug.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 40);
        setSlashItems(f);
        setSlashIndex(0);
        setSlashOpen(f.length > 0);
        return;
      }
      setSlashOpen(false);
      slashQueryRef.current = null;
    },
    []
  );

  const displayMessages = useMemo(() => messages, [messages]);

  const showEmptyThreadPlaceholder = useMemo(() => {
    if (displayMessages.length === 0) return true;
    return displayMessages.every(
      (m) => m.role === 'assistant' && isAgentSamEmptyThreadGreeting(m.content)
    );
  }, [displayMessages]);

  useEffect(() => {
    if (!conversationId.trim()) return;
    const row = sessions.find((s) => s.id === conversationId);
    const n = row?.name && String(row.name).replace(/\s+/g, ' ').trim();
    if (n) setThreadTitle(n);
  }, [conversationId, sessions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayMessages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setInput(v);
    const el = e.target;
    const maxPx = isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE;
    syncComposerTextareaHeight(el, maxPx);
    syncPickers(v, el.selectionStart);
  };

  const addFilesFromList = (list: FileList | null, asImage: boolean) => {
    if (!list?.length) return;
    Array.from(list).forEach((file) => {
      const id = crypto.randomUUID();
      const isImg = asImage || file.type.startsWith('image/');
      const previewUrl = isImg ? URL.createObjectURL(file) : null;
      setAttachments((prev) => [
        ...prev,
        { id, file, type: isImg ? 'image' : 'file', previewUrl },
      ]);
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const a = prev.find((x) => x.id === id);
      if (a?.previewUrl) URL.revokeObjectURL(a.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  /** Clears the composer only. Do not revoke blob URLs here — after send they are kept on the user message (`attachmentPreviews`) for history thumbnails. */
  const clearAttachments = () => {
    setAttachments([]);
  };

  const insertAtCursor = (newValue: string, selStart: number, selEnd: number) => {
    setInput(newValue);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(selStart, selEnd);
        syncComposerTextareaHeight(
          el,
          isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE,
        );
      }
    });
  };

  const applyMention = (item: PickerItem) => {
    const el = textareaRef.current;
    const q = mentionQueryRef.current;
    if (!el || !q) return;
    const v = input;
    const before = v.slice(0, q.start);
    const after = v.slice(q.end);
    const insert = `@${item.label} `;
    const next = before + insert + after;
    const pos = before.length + insert.length;
    setMentionOpen(false);
    mentionQueryRef.current = null;
    insertAtCursor(next, pos, pos);
  };

  const applySlash = (cmd: SlashCmd) => {
    const el = textareaRef.current;
    const q = slashQueryRef.current;
    if (!el || !q) return;
    const v = input;
    const before = v.slice(0, q.start);
    const after = v.slice(q.end);
    const insert = `/${cmd.slug} `;
    const next = before + insert + after;
    const pos = before.length + insert.length;
    setSlashOpen(false);
    slashQueryRef.current = null;
    insertAtCursor(next, pos, pos);

    void (async () => {
      try {
        const res = await fetch('/api/agent/commands/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            slug: cmd.slug,
            command_slug: cmd.slug,
            command_id: cmd.id,
            session_id: conversationId || undefined,
            conversation_id: conversationId || undefined,
            agent_run_id: agentRunId?.trim() || undefined,
            workspace_id: workspaceId?.trim() || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 202 && (data.approval_id || data.command_run_id)) {
          onApprovalRequired?.(data.command_run_id || data.approval_id);
        }
        if (!res.ok && data?.error) {
          console.warn('[slash-command]', data.error);
        }
      } catch (e) {
        console.warn('[slash-command] execute failed', e);
      }
    })();
  };

  const stripEmptyAssistantTail = useCallback((prev: Message[]) => {
    const next = [...prev];
    const last = next[next.length - 1];
    if (last?.role === 'assistant' && last.content === '') next.pop();
    return next;
  }, []);

  /** Markdown images in assistant replies: open Monaco with embed (falls back to new tab). */
  const handleChatImagePreview = useCallback(
    (src: string) => {
      if (onFileSelect) {
        onOpenCodeTab?.();
        onFileSelect({
          name: 'chat-image-preview.md',
          content: `# Chat image\n\n![preview](${src})\n`,
          originalContent: '',
        });
        return;
      }
      window.open(src, '_blank', 'noopener,noreferrer');
    },
    [onFileSelect, onOpenCodeTab],
  );


  const compactToolLabel = useCallback((toolName: string) => {
    const n = String(toolName || '').toLowerCase();
    if (n === 'browser_navigate' || n === 'browser_open_url' || n === 'cdt_navigate_page') return 'Opening browser preview…';
    if (n.includes('monaco') || n === 'r2_write' || n.includes('write')) return 'Editing code…';
    if (n === 'cdt_take_screenshot' || n === 'playwright_screenshot' || n === 'browser_screenshot') {
      return 'Capturing browser screenshot…';
    }
    if (n.startsWith('browser_') || n.startsWith('cdt_') || n.startsWith('playwright_')) return 'Browser tool…';
    return toolName;
  }, []);

  const handleThinkingEvent = useCallback((ev: { type: string; tool_name?: string; text?: string; ok?: boolean; output_preview?: string; command_run_id?: string; approval_id?: string; plan_id?: string }) => {
    setPresenceState(derivePresenceState(ev));
    if (ev.type === 'thinking_start') {
      setThinkingState({ steps: [], thinkingText: '', status: 'thinking', startedAt: Date.now() });
    } else if (ev.type === 'thinking') {
      setThinkingState(prev => prev ? { ...prev, thinkingText: (prev.thinkingText || '') + (ev.text || '') } : prev);
    } else if (ev.type === 'plan_thinking') {
      setThinkingState({
        steps: [],
        thinkingText: ev.text || 'Creating plan…',
        status: 'thinking',
        startedAt: Date.now(),
      });
    } else if (ev.type === 'plan_created' || ev.type === 'plan_progress') {
      if (ev.plan_id?.trim()) activePlanIdRef.current = ev.plan_id.trim();
      setThinkingState(prev => ({
        steps: prev?.steps ?? [],
        thinkingText: ev.text || 'Running plan…',
        status: 'working',
        startedAt: prev?.startedAt ?? Date.now(),
      }));
    } else if (ev.type === 'tool_start') {
      const id = ev.tool_name || String(Date.now());
      const label = compactToolLabel(id);
      setThinkingState(prev => {
        const base = prev ?? { steps: [], thinkingText: label, status: 'working', startedAt: Date.now() };
        if (base.steps.find(s => s.id === id)) return { ...base, thinkingText: label, status: 'working' };
        return {
          ...base,
          status: 'working',
          thinkingText: label,
          steps: [...base.steps, { id, name: label, status: 'running' as const }],
        };
      });
    } else if (ev.type === 'tool_done' || ev.type === 'workflow_step') {
      const id = ev.tool_name || '';
      setThinkingState(prev => {
        if (!prev) return prev;
        const exists = prev.steps.find(s => s.id === id);
        const stepStatus: 'error' | 'done' = ev.ok === false ? 'error' : 'done';
        const updated = exists
          ? prev.steps.map(s => s.id === id ? { ...s, status: stepStatus, preview: ev.output_preview?.slice(0, 120) } : s)
          : [...prev.steps, { id, name: id, status: stepStatus, preview: ev.output_preview?.slice(0, 120) }];
        return { ...prev, steps: updated };
      });
    } else if (ev.type === 'tool_error') {
      setThinkingState(prev => prev ? { ...prev, steps: prev.steps.map(s => s.id === ev.tool_name ? { ...s, status: 'error' as const } : s) } : prev);
    } else if (ev.type === 'tool_blocked' || ev.type === 'approval_required') {
      if (ev.command_run_id) onApprovalRequired?.(ev.command_run_id);
      setThinkingState(prev => prev ? { ...prev, status: 'blocked' } : prev);
    } else if (ev.type === 'workflow_complete' || ev.type === 'done') {
      setThinkingState(prev => prev ? { ...prev, status: 'done' } : prev);
    } else if (ev.type === 'workflow_error' || ev.type === 'error') {
      setThinkingState(prev => prev ? { ...prev, status: 'error' } : prev);
    }
  }, [onApprovalRequired, compactToolLabel]);

  const handleApprovePendingTool = useCallback(async () => {
    if (!pendingToolApproval) return;
    const { tool } = pendingToolApproval;
    setApprovalBusy(true);
    try {
      if (tool.plan_terminal) {
        const { plan_id, task_id, command_run_id, approval_id } = tool.plan_terminal;
        const approveRes = await fetch(`/api/agent/proposals/${encodeURIComponent(approval_id)}/approve`, {
          method: 'POST',
          credentials: 'same-origin',
        });
        if (!approveRes.ok) {
          const errText = await approveRes.text().catch(() => '');
          throw new Error(errText || `Approve failed (${approveRes.status})`);
        }
        const resumeRes = await fetch('/api/agent/plan-task/resume', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_id,
            task_id,
            command_run_id,
            approval_id,
            session_id: conversationId || undefined,
            conversationId: conversationId || undefined,
          }),
        });
        if (!resumeRes.ok || !resumeRes.body) {
          const errText = await resumeRes.text().catch(() => '');
          throw new Error(errText || `Resume failed (${resumeRes.status})`);
        }
        setPendingToolApproval(null);
        setIsLoading(false);
        setPresenceState('idle');
        abortControllerRef.current = null;
        streamFinalizedRef.current = false;
        const reader = resumeRes.body.getReader();
        streamReaderRef.current = reader;
        const resumeSignal = new AbortController().signal;
        const tail =
          messages.length && messages[messages.length - 1]?.role === 'assistant'
            ? String(messages[messages.length - 1].content || '')
            : '';
        await consumeAgentChatSseBody({
          signal: resumeSignal,
          reader,
          streamFinalizedRef,
          streamReaderRef,
          setMessages,
          setIsLoading,
          setWorkflowLedger,
          setToolTraceRows,
          onPythonDraftOpened: handlePythonDraftOpened,
          setConversationId,
          stripEmptyAssistantTail,
          loadSessions,
          onBrowserNavigate,
          onR2FileUpdated,
          onThinkingEvent: handleThinkingEvent,
          onSubagentEvent: (ev) => {
            const t = String(ev.type || '');
            const fanoutId = ev.fanout_id ? ` (${ev.fanout_id})` : '';
            const slug = ev.subagent_slug ? ` (${ev.subagent_slug})` : '';
            const status = ev.status ? `: ${ev.status}` : '';
            if (t === 'agentsam_subagent_fanout_started')
              setSubagentWork({ state: 'multitask_fanout', detail: `Fanout started${fanoutId}` });
            else if (t === 'agentsam_subagent_run_started')
              setSubagentWork({ state: 'subagent_spawn', detail: `Subagent started${slug}` });
            else if (t === 'agentsam_subagent_run_progress')
              setSubagentWork({ state: 'parallel_work', detail: `Subagent progress${slug}` });
            else if (t === 'agentsam_subagent_action_required')
              setSubagentWork({ state: 'approval_required', detail: 'Subagent action required' });
            else if (t === 'agentsam_subagent_run_result')
              setSubagentWork({ state: 'merge_results', detail: `Subagent result${slug}${status}` });
            else if (t === 'agentsam_subagent_fanout_result')
              setSubagentWork({ state: 'merge_results', detail: `Fanout result${fanoutId}${status}` });
          },
          onAgentRunContext,
          onFileSelect: onFileSelect
            ? (f) => onFileSelect({ name: f.name, content: f.content, originalContent: f.originalContent ?? '' })
            : undefined,
          onToolApprovalRequest: () => {},
          mergeIntoLastAssistant: true,
          initialAssistantBuffer: tail,
        });
        streamReaderRef.current = null;
        const q = messageQueueRef.current;
        if (q.length > 0) {
          const next = q[0];
          setMessageQueue((prev) => prev.slice(1));
          void handleSendRef.current(next);
        }
        return;
      }

      const res = await fetch('/api/agent/chat/execute-approved-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: tool.name,
          tool_input: tool.parameters ?? {},
          conversation_id: conversationId || undefined,
          agent_run_id: agentRunId?.trim() || undefined,
        }),
      });
      const j = (await res.json()) as { success?: boolean; error?: string; result?: unknown };
      setPendingToolApproval(null);
      const resultStr =
        typeof j.result === 'string' ? j.result : JSON.stringify(j.result ?? null, null, 2);
      const suffix = j.success
        ? `\n\n---\nTool **${tool.name}** completed.\n\`\`\`\n${resultStr.slice(0, 12000)}\n\`\`\``
        : `\n\n---\nTool **${tool.name}** failed: ${j.error ?? 'unknown error'}`;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: last.content + suffix };
        }
        return next;
      });
    } catch (e) {
      console.error('[ChatAssistant] execute-approved-tool', e);
      setPendingToolApproval(null);
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: `${last.content}\n\n[Approve request failed: ${msg}]` };
        }
        return next;
      });
    } finally {
      setApprovalBusy(false);
    }
  }, [pendingToolApproval, conversationId, setMessages, messages, onBrowserNavigate, onR2FileUpdated, onFileSelect, loadSessions, stripEmptyAssistantTail, setWorkflowLedger, setToolTraceRows, handlePythonDraftOpened, setConversationId]);

  const handleDenyPendingTool = useCallback(async () => {
    if (!pendingToolApproval) return;
    const { tool } = pendingToolApproval;
    if (tool.plan_terminal?.approval_id) {
      try {
        await fetch(`/api/agent/proposals/${encodeURIComponent(tool.plan_terminal.approval_id)}/deny`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } catch (e) {
        console.warn('[ChatAssistant] plan terminal deny', e);
      }
    }
    const wasPlanTerminal = !!tool.plan_terminal;
    setPendingToolApproval(null);
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'assistant') {
        next[next.length - 1] = {
          ...last,
          content: `${last.content}\n\n[${wasPlanTerminal ? 'Terminal command' : 'Tool execution'} cancelled.]`,
        };
      }
      return next;
    });
  }, [pendingToolApproval, setMessages]);

  async function handleSend(overrideMessage?: string, sendOpts?: ChatRoutingSendOpts) {
    const text = overrideMessage ?? input;
    const rawModelKey = (sendOpts?.modelKey?.trim() || selectedModelKey || AUTO_MODEL_KEY).trim();
    const useAutoRouting = isAutoModelSelection(rawModelKey);
    const effectiveModelKey = useAutoRouting
      ? AUTO_MODEL_KEY
      : rawModelKey || chatModels[0]?.model_key || AUTO_MODEL_KEY;
    if ((!text && attachments.length === 0) || (isLoading && !overrideMessage)) return;
    onAgentRunContext?.(null);
    if (!useAutoRouting && !effectiveModelKey) {
      if (overrideMessage?.trim()) {
        setMessageQueue((prev) => (prev.includes(overrideMessage) ? prev : [...prev, overrideMessage]));
      }
      return;
    }
    const nextStoredKey = useAutoRouting ? AUTO_MODEL_KEY : effectiveModelKey;
    if (sendOpts?.modelKey?.trim()) {
      const picked = isAutoModelSelection(sendOpts.modelKey) ? AUTO_MODEL_KEY : sendOpts.modelKey.trim();
      if (picked !== selectedModelKey) setSelectedModelKey(picked);
    } else if (nextStoredKey !== selectedModelKey) {
      setSelectedModelKey(nextStoredKey);
    }
    setThinkingState(null);
    
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    streamFinalizedRef.current = false;
    const signal = abortControllerRef.current.signal;

    if (totalStagedBytes > CHAT_ATTACH_MAX_TOTAL_BYTES) return;

    const userMessage = text || '(attachment)';
    setPendingToolApproval(null);
    setWorkflowLedger({
      runId: null,
      stepsTotal: null,
      stepsCompleted: 0,
      currentNodeKey: null,
      runCost: null,
      runTokensIn: null,
      runTokensOut: null,
      lastError: null,
    });
    setInput('');
    requestAnimationFrame(() => {
      syncComposerTextareaHeight(
        textareaRef.current,
        isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE,
      );
    });
    const attachmentPreviews: MessageAttachmentPreview[] = attachments.map((a) => ({
      previewUrl: a.previewUrl,
      type: a.type,
      name: a.file.name,
    }));
    const newMessages: Message[] = [
      ...messages,
      {
        role: 'user',
        content: userMessage,
        ...(attachmentPreviews.length ? { attachmentPreviews } : {}),
      },
    ];
    setMessages(newMessages);
    setIsLoading(true);
    setMentionOpen(false);
    setSlashOpen(false);
    setToolTraceRows([]);
    setPythonDraftHint(null);

    const attachContextFiles: Array<{ name: string; content: string }> = [];
    for (const a of attachments) {
      if (a.type !== 'file') continue;
      const lower = a.file.name.toLowerCase();
      if (lower.endsWith('.glb')) {
        onGlbFileSelect?.(a.file);
        continue;
      }
      if (isChatTextCodeFile(a.file)) {
        try {
          const text = await readFileAsText(a.file);
          onFileSelect?.({ name: a.file.name, content: text, originalContent: text });
          attachContextFiles.push({ name: a.file.name, content: text });
        } catch {
          /* skip unreadable */
        }
      }
    }

    const skipMentionContext =
      userMessage.startsWith('/run ') || userMessage.startsWith('/claude ');
    let messageForApi = skipMentionContext
      ? userMessage
      : await buildMentionContext(userMessage, {
          activeFileName,
          activeFileContent: activeFileContent ?? null,
          activeFile: activeFile ?? null,
          editorCursorLine,
          editorCursorColumn,
          attachContextFiles: attachContextFiles.length ? attachContextFiles : undefined,
        });
    const ghCtx = githubRepoContext?.trim();
    const openIsLocal =
      activeFile &&
      !activeFile.githubPath &&
      !activeFile.r2Key &&
      !!(activeFile.workspacePath?.trim() || activeFile.handle);
    if (ghCtx) {
      messageForApi += `${MENTION_CONTEXT_HEADER}### Selected GitHub repository\nThe user chose **${ghCtx}** as context for remote repo work.${
        openIsLocal
          ? ' A **local workspace file** is open in Monaco — use ### Open file (editor) content as authoritative; do NOT github_file to verify the open buffer. Use github_file only for other paths under this repo when the user asks.'
          : ` Prefer github_file with repo="${ghCtx}" when reading remote files not already open in the editor.`
      }`;
    }

    const snap =
      browserElementContext && typeof browserElementContext === 'object' ? browserElementContext : null;
    if (snap) {
      messageForApi += `\n\n### BrowserView selection (structured)\n\`\`\`json\n${JSON.stringify(snap, null, 2)}\n\`\`\`\n`;
    }

    const effectiveWsId = (() => {
      const fromQuickstart = sendOpts?.workspace_id?.trim();
      if (fromQuickstart && fromQuickstart !== 'global') return fromQuickstart;
      const fromProp = workspaceId != null ? String(workspaceId).trim() : '';
      if (fromProp && fromProp !== 'global') return fromProp;
      if (typeof window === 'undefined') return '';
      const w = String((window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__ || '').trim();
      return w && w !== 'global' ? w : '';
    })();

    const effectiveConvId =
      sendOpts?.conversationIdOverride?.trim() ||
      conversationId ||
      (() => {
        const id = crypto.randomUUID();
        setConversationId(id);
        try {
          localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, id);
        } catch (_) {}
        return id;
      })();
    if (sendOpts?.conversationIdOverride?.trim() && sendOpts.conversationIdOverride.trim() !== conversationId) {
      setConversationId(sendOpts.conversationIdOverride.trim());
    }
    const form = new FormData();
    form.append('message', messageForApi);
    form.append('mode', mode);
    form.append('agent_mode', mode);
    form.append('runtime_intent_mode', mode);
    form.append('model', effectiveModelKey);
    if (!useAutoRouting) {
      const selectedModelProvider =
        chatModels.find((m) => m.model_key === effectiveModelKey)?.provider || 'anthropic';
      form.append('provider', selectedModelProvider);
    }
    form.append('conversationId', effectiveConvId);
    form.append('contextMode', String(activeProject));
    if (effectiveWsId) form.append('workspace_id', effectiveWsId);
    if (sendOpts?.task_type?.trim()) form.append('task_type', sendOpts.task_type.trim());
    if (sendOpts?.route_key?.trim()) form.append('route_key', sendOpts.route_key.trim());
    if (sendOpts?.quickstart_batch?.trim()) {
      form.append('quickstart_batch', sendOpts.quickstart_batch.trim());
    }
    if (sendOpts?.apply_eto_after_run) {
      form.append('apply_eto_after_run', 'true');
    }
    try {
      const browserCtxPayload: Record<string, unknown> = {
        ...(browserSurfaceRef.current && typeof browserSurfaceRef.current === 'object' ? browserSurfaceRef.current : {}),
        dashboard_route: typeof window !== 'undefined' ? window.location.pathname : '',
      };
      if (snap && typeof snap === 'object') {
        browserCtxPayload.selected_element = snap;
      }
      if (databaseSurfaceRef.current && typeof databaseSurfaceRef.current === 'object') {
        browserCtxPayload.databaseContext = databaseSurfaceRef.current;
      }
      const browserUrlFromSurface =
        typeof browserSurfaceRef.current?.url === 'string'
          ? String(browserSurfaceRef.current.url).trim()
          : '';
      const openFilesList = [
        ...(openFilePaths || []),
        activeFile ? getEditorLightweightPath(activeFile) || activeFile.name || '' : '',
      ]
        .map((p) => String(p || '').trim())
        .filter(Boolean);
      const workspaceContextPacket = {
        activeTab: String(activeWorkbenchTab || 'Workspace'),
        browserUrl: browserUrlProp?.trim() || browserUrlFromSurface || null,
        openFiles: [...new Set(openFilesList)].slice(0, 32),
        plan_id: activePlanIdRef.current || null,
        workflow_run_id: workflowLedger.runId || null,
      };
      browserCtxPayload.workspaceContext = workspaceContextPacket;
      form.append('workspaceContext', JSON.stringify(workspaceContextPacket));
      form.append('browserContext', JSON.stringify(browserCtxPayload));
    } catch {
      /* ignore */
    }
    attachments.forEach((a) => form.append('files', a.file));

    if (activeFile) {
      const activePath = getEditorLightweightPath(activeFile) || activeFile.name || '';
      if (activePath) form.append('active_file_path', activePath);
      const activeSource = activeFile.githubRepo
        ? 'github'
        : activeFile.r2Key
          ? 'r2'
          : activeFile.driveFileId
            ? 'drive'
            : activeFile.workspacePath || activeFile.handle
              ? 'local'
              : 'buffer';
      form.append('active_file_source', activeSource);
      form.append('active_file_r2_bucket', activeFile.r2Bucket ?? '');
      form.append('active_file_r2_key', activeFile.r2Key ?? '');
      form.append('active_file_github_repo', activeFile.githubRepo ?? '');
      form.append('active_file_github_path', activeFile.githubPath ?? '');
      form.append('active_file_github_branch', activeFile.githubBranch ?? '');
      if (activeFile.githubSha) form.append('active_file_github_sha', activeFile.githubSha);
      form.append('active_file_drive_id', activeFile.driveFileId ?? '');
      form.append('active_file_workspace_path', activeFile.workspacePath ?? '');
      if (activeFileContent != null && activeFileContent !== '') {
        form.append(
          'active_file_content',
          activeFileContent.slice(0, 48000),
        );
      }
    }
    const ghCtxForm = githubRepoContext?.trim();
    if (ghCtxForm) form.append('github_repo_context', ghCtxForm);

    const applyAssistantError = (msg: string) => {
      setMessages((prev) => [...stripEmptyAssistantTail(prev), { role: 'assistant', content: msg }]);
    };

    try {
      const streamDebugId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dbg_${Date.now()}`;
      initIamAgentStreamDebug(streamDebugId);
      const chatHeaders: Record<string, string> = {};
      if (effectiveWsId) chatHeaders['x-iam-workspace-id'] = effectiveWsId;

      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        body: form,
        headers: chatHeaders,
        signal,
        credentials: 'same-origin',
      });

      patchIamAgentStreamDebug({
        response_headers_at: Date.now(),
        http_status: response.status,
      });

      if (!response.ok) {
        patchIamAgentStreamDebug({
          error_at: Date.now(),
        });
        const errBody = await response.text().catch(() => '');
        applyAssistantError(formatHttpErrorMessage(response.status, errBody || response.statusText || ''));
        return;
      }
      if (!response.body) {
        patchIamAgentStreamDebug({
          error_at: Date.now(),
        });
        applyAssistantError('Empty response body from chat endpoint');
        return;
      }

      const reader = response.body.getReader();
      streamReaderRef.current = reader;
      let handoffResume: {
        next_session_id: string;
        fallback_model_key?: string;
      } | null = null;
      await consumeAgentChatSseBody({
        signal,
        reader,
        streamFinalizedRef,
        streamReaderRef,
        setMessages,
        setIsLoading,
        setWorkflowLedger,
        setToolTraceRows,
        onPythonDraftOpened: handlePythonDraftOpened,
        setConversationId,
        stripEmptyAssistantTail,
        loadSessions,
        onBrowserNavigate,
        onR2FileUpdated,
        onThinkingEvent: handleThinkingEvent,
        onSubagentEvent: (ev) => {
          const t = String(ev.type || '');
          const fanoutId = ev.fanout_id ? ` (${ev.fanout_id})` : '';
          const slug = ev.subagent_slug ? ` (${ev.subagent_slug})` : '';
          const status = ev.status ? `: ${ev.status}` : '';
          if (t === 'agentsam_subagent_fanout_started')
            setSubagentWork({ state: 'multitask_fanout', detail: `Fanout started${fanoutId}` });
          else if (t === 'agentsam_subagent_run_started')
            setSubagentWork({ state: 'subagent_spawn', detail: `Subagent started${slug}` });
          else if (t === 'agentsam_subagent_run_progress')
            setSubagentWork({ state: 'parallel_work', detail: `Subagent progress${slug}` });
          else if (t === 'agentsam_subagent_action_required')
            setSubagentWork({ state: 'approval_required', detail: 'Subagent action required' });
          else if (t === 'agentsam_subagent_run_result')
            setSubagentWork({ state: 'merge_results', detail: `Subagent result${slug}${status}` });
          else if (t === 'agentsam_subagent_fanout_result')
            setSubagentWork({ state: 'merge_results', detail: `Fanout result${fanoutId}${status}` });
        },
        onAgentRunContext,
        onFileSelect: onFileSelect
          ? (f) => onFileSelect({ name: f.name, content: f.content, originalContent: f.originalContent ?? '' })
          : undefined,
        onAgentHandoff: (payload) => {
          handoffResume = payload;
        },
        onToolApprovalRequest: (tool) => {
          setPendingToolApproval({ tool });
          setIsLoading(false);
          abortControllerRef.current = null;
          const q = messageQueueRef.current;
          if (q.length > 0) {
            const next = q[0];
            setMessageQueue((prev) => prev.slice(1));
            void handleSendRef.current(next);
          }
        },
      });
      streamReaderRef.current = null;
      if (handoffResume?.next_session_id) {
        const childSession = handoffResume.next_session_id;
        const fallbackModel = handoffResume.fallback_model_key?.trim();
        setConversationId(childSession);
        try {
          localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, childSession);
        } catch {
          /* ignore */
        }
        streamFinalizedRef.current = false;
        abortControllerRef.current = new AbortController();
        await handleSendRef.current('Continue', {
          conversationIdOverride: childSession,
          handoffResume: true,
          ...(fallbackModel ? { modelKey: fallbackModel } : {}),
        });
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        patchIamAgentStreamDebug({ abort_at: Date.now() });
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            next[next.length - 1] = {
              ...last,
              content: `${last.content}${last.content.trim() ? '\n\n' : ''}Stopped.`,
            };
          }
          return next;
        });
      } else {
        console.error('Chat request failed:', error);
        streamFinalizedRef.current = true;
        const msg = error instanceof Error ? error.message : String(error);
        patchIamAgentStreamDebug({ error_at: Date.now() });
        setMessages((prev) => [...stripEmptyAssistantTail(prev), { role: 'assistant', content: msg }]);
      }
    } finally {
      streamReaderRef.current?.cancel().catch(() => {});
      streamReaderRef.current = null;
      setIsLoading(false);
      setPresenceState('idle');
      clearAttachments();
      abortControllerRef.current = null;

      const lastMsg = messagesRef.current[messagesRef.current.length - 1];
      if (lastMsg?.role === 'assistant' && typeof lastMsg.content === 'string') {
        const ds =
          databaseSurfaceRef.current?.datasource === 'hyperdrive' ? 'hyperdrive' : 'd1';
        const isSa = agentsamPolicy?.is_superadmin === true || agentsamPolicy?.is_superadmin === 1;
        const activeDatasourceBinding =
          databaseSurfaceRef.current?.datasource_binding != null
            ? String(databaseSurfaceRef.current.datasource_binding).trim()
            : null;
        parseAndDispatchDatabaseStudioActions(lastMsg.content, {
          datasource: ds,
          isSuperadmin: isSa,
          activeDatasourceBinding,
        });
        tryDispatchDbApplyFromAssistantMessage(lastMsg.content, {
          datasource: ds,
          isSuperadmin: isSa,
          activeDatasourceBinding,
        });
      }

      if (messageQueue.length > 0) {
        const next = messageQueue[0];
        setMessageQueue((prev) => prev.slice(1));
        void handleSendRef.current(next);
      }
    }
  }

  handleSendRef.current = handleSend;

  const canSend =
    (isAutoModelSelection(selectedModelKey) || !!selectedModelKey) &&
    (input.trim().length > 0 || attachments.length > 0) &&
    !isLoading &&
    totalStagedBytes <= CHAT_ATTACH_MAX_TOTAL_BYTES;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && mentionItems.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        applyMention(mentionItems[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    if (slashOpen && slashItems.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, slashItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        applySlash(slashItems[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const modEnter = Number(agentsamPolicyRef.current?.submit_with_mod_enter) === 1;
      if (modEnter && !(e.ctrlKey || e.metaKey)) {
        return;
      }
      e.preventDefault();
      if (isLoading) {
        setMessageQueue((prev) => [...prev, input]);
        setInput('');
      } else {
        handleSend();
      }
    }
  };

  const mobileAgentsThread = isNarrow && mobileHubTab === 'agents';
  const hubBodyVisible = isNarrow && mobileHubTab !== 'agents';
  const messagesVisible =
    !isNarrow || (mobileHubTab === 'agents' && mobileThreadTab === 'chat');
  const contextTabVisible =
    isNarrow && mobileHubTab === 'agents' && mobileThreadTab === 'context';
  const composerVisible =
    !isNarrow || (mobileHubTab === 'agents' && mobileThreadTab === 'chat');
  const composerFlexOrder = 'order-5';

  const filteredGhRepos = useMemo(() => {
    const q = repoSearch.trim().toLowerCase();
    if (!q) return ghRepos;
    return ghRepos.filter((r) => (r.full_name || '').toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q));
  }, [ghRepos, repoSearch]);

  const modelPickerGroups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, ChatModelRow[]>();
    for (const m of chatModels) {
      const g = (m.picker_group || m.provider || 'Other').trim() || 'Other';
      if (!byGroup.has(g)) {
        byGroup.set(g, []);
        order.push(g);
      }
      byGroup.get(g)!.push(m);
    }
    return order.map((g) => ({ group: g, models: byGroup.get(g)! }));
  }, [chatModels]);

  const pickModelKey = useCallback((modelKey: string) => {
    setSelectedModelKey(isAutoModelSelection(modelKey) ? AUTO_MODEL_KEY : modelKey);
    setIsModelPickerOpen(false);
    setAttachMenuOpen(false);
  }, []);

  const composerPillClass =
    'flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 min-h-[28px] text-[11px] font-medium text-[var(--dashboard-text)] hover:bg-[var(--bg-hover)] border border-[var(--dashboard-border)] rounded-full transition-colors';

  const renderModelPickerList = useCallback(
    (onPick: (modelKey: string) => void) => (
      <>
        <button
          type="button"
          className={`mx-1 mb-1 flex w-[min(100%,calc(100vw-3rem))] min-w-0 flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-all hover:bg-[var(--dashboard-panel)] ${
            isAutoModelSelection(selectedModelKey)
              ? 'bg-[var(--dashboard-panel)]/80 text-[var(--solar-cyan)]'
              : 'text-[var(--dashboard-text)]'
          }`}
          onClick={() => onPick(AUTO_MODEL_KEY)}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold tracking-tight">Auto</span>
            {isAutoModelSelection(selectedModelKey) ? (
              <Sparkles size={10} className="shrink-0 animate-pulse" />
            ) : null}
          </div>
          <span className="text-[9px] text-[var(--dashboard-muted)] leading-tight">
            Thompson routing · workspace policy
          </span>
        </button>
        <div className="mx-2 mb-1 border-t border-[var(--dashboard-border)]" role="separator" />
        {modelPickerGroups.map(({ group, models }) => (
        <div key={group} className="pb-1">
          <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--dashboard-muted)] opacity-60">
            {group}
          </div>
          {models.map((m) => {
            const isSession = !isAutoModelSelection(selectedModelKey) && selectedModelKey === m.model_key;
            const isDefault = defaultModelKey != null && defaultModelKey === m.model_key;
            const rateIn = m.input_rate_per_mtok;
            const rateOut = m.output_rate_per_mtok;
            return (
              <button
                key={m.id}
                type="button"
                className={`mx-1 flex w-[min(100%,calc(100vw-3rem))] min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-all hover:bg-[var(--dashboard-panel)] ${
                  isSession ? 'bg-[var(--dashboard-panel)]/80 text-[var(--solar-cyan)]' : 'text-[var(--dashboard-text)]'
                }`}
                onClick={() => onPick(m.model_key)}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="truncate text-[11px] font-bold tracking-tight">{m.name}</span>
                    {m.size_class ? (
                      <span className="shrink-0 rounded border border-[var(--dashboard-border)] px-1 py-0 text-[8px] font-bold uppercase tracking-wide text-[var(--dashboard-muted)]">
                        {m.size_class}
                      </span>
                    ) : null}
                    {isDefault ? (
                      <span className="shrink-0 rounded bg-[var(--solar-cyan)]/15 px-1 py-0 text-[8px] font-bold uppercase tracking-wide text-[var(--solar-cyan)]">
                        Default
                      </span>
                    ) : null}
                  </div>
                  {rateIn != null && rateOut != null ? (
                    <span className="text-[9px] text-[var(--dashboard-muted)]">
                      ${rateIn.toFixed(2)} in · ${rateOut.toFixed(2)} out / MTok
                    </span>
                  ) : null}
                </div>
                {isSession ? <Sparkles size={10} className="shrink-0 animate-pulse" /> : null}
              </button>
            );
          })}
        </div>
        ))}
      </>
    ),
    [modelPickerGroups, defaultModelKey, selectedModelKey],
  );

  return (
    <>
      <div
        data-chat-assistant-contract="agent-app-sse-v1"
        className="flex flex-col h-full min-h-0 max-w-full overflow-x-hidden overflow-y-hidden bg-[var(--dashboard-panel)] w-full min-w-0"
        style={presenceColorwayStyle}
      >
        <style>{`
        .agent-content strong { color: var(--solar-cyan); font-weight: 700; }
        .agent-content h1, .agent-content h2, .agent-content h3 { color: var(--text-heading); font-weight: 700; margin-bottom: 0.75rem; }
        .agent-content ul, .agent-content ol { padding-left: 1.5rem; margin-bottom: 1rem; }
        .agent-content li { margin-bottom: 0.4rem; }
        .agent-content p + p { margin-top: 0.75rem; }
        .agent-content pre, .agent-content code { max-width: 100%; }
        .chat-hide-scroll::-webkit-scrollbar { display: none; }
      `}</style>

        {isNarrow && (
          <header className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2.5 border-b border-[var(--dashboard-border)] shrink-0 bg-[var(--dashboard-panel)] z-10">
            <nav className="flex items-center justify-center gap-2 sm:gap-3 min-w-0 max-w-full overflow-x-auto chat-hide-scroll [scrollbar-width:none]">
              {(['agents', 'automations', 'dashboard'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setMobileHubTab(tab)}
                  className={`shrink-0 text-[13px] font-medium transition-colors whitespace-nowrap ${
                    mobileHubTab === tab ? 'text-[var(--dashboard-text)]' : 'text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)]'
                  }`}
                >
                  {tab === 'agents' ? 'Agents' : tab === 'automations' ? 'Automations' : 'Dashboard'}
                </button>
              ))}
            </nav>
            <div
              className="w-7 h-7 rounded-full bg-[var(--bg-hover)] border border-[var(--dashboard-border)] flex items-center justify-center text-[9px] text-[var(--dashboard-muted)] shrink-0"
              aria-hidden
            >
              ·
            </div>
          </header>
        )}

        {isNarrow && mobileAgentsThread && (
          <div className="shrink-0 border-b border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] z-10">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  onOpenChatHistory?.();
                  setMobileThreadTab('chat');
                }}
                className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)]"
                aria-label="Open chat history"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="flex-1 text-[14px] font-semibold text-[var(--dashboard-text)] truncate">{threadTitle}</span>
              <button
                type="button"
                onClick={handleNewChat}
                className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] transition-colors"
                title="New chat"
                aria-label="New chat"
              >
                <Plus size={18} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--dashboard-muted)]"
                aria-label="More options"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
            <div className="flex gap-2 px-3 pb-2">
              <button
                type="button"
                onClick={() => setMobileThreadTab('chat')}
                className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${
                  mobileThreadTab === 'chat'
                    ? 'bg-[var(--scene-bg)] text-[var(--dashboard-text)] border border-[var(--dashboard-border)]'
                    : 'text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)]'
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setMobileThreadTab('context')}
                className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${
                  mobileThreadTab === 'context'
                    ? 'bg-[var(--scene-bg)] text-[var(--dashboard-text)] border border-[var(--dashboard-border)]'
                    : 'text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)]'
                }`}
              >
                Context
              </button>
            </div>
            <div className="px-3 pb-2">
              <AgentPresenceStatus presence={presence} showBadge={false} className="opacity-95" />
            </div>
          </div>
        )}

        {!isNarrow && (
          <div className="flex-shrink-0 flex items-start gap-2.5 px-3 py-2 border-b border-[var(--dashboard-border)]">
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex-1 text-[13px] font-semibold text-[var(--dashboard-text)] truncate min-w-0">
                  {threadTitle || 'Chat'}
                </span>
                {onOpenChatHistory && (
                  <button
                    type="button"
                    onClick={() => onOpenChatHistory()}
                    className="shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] px-2 py-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    Chats
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] transition-colors"
                  title="New chat"
                  aria-label="New chat"
                >
                  <Plus size={18} strokeWidth={2} />
                </button>

                <button
                  type="button"
                  onClick={() => onOpenCodeTab?.()}
                  title="Code editor"
                  aria-label="Open code editor"
                  className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[var(--bg-hover)] transition-colors text-[var(--dashboard-muted)]"
                >
                  <SetiFileIcon filename={activeFile?.name || 'code.ts'} size={16} />
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[var(--bg-hover)] transition-colors text-[var(--dashboard-muted)]"
                  aria-label="More options"
                >
                  <MoreHorizontal size={15} />
                </button>
              </div>
              <AgentPresenceStatus presence={presence} className="pl-0.5" />
            </div>
          </div>
        )}

        {!isNarrow && onAgentChatShellNewTab && agentChatShellTabs && agentChatShellTabs.length > 0 && (
          <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1 border-b border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/60 overflow-x-auto chat-hide-scroll [scrollbar-width:none]">
            {agentChatShellTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onAgentChatShellTabSelect?.(tab.id)}
                className={`shrink-0 max-w-[min(160px,40vw)] truncate px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  tab.id === activeAgentChatShellTabId
                    ? 'bg-[var(--scene-bg)] text-[var(--solar-cyan)] border border-[var(--dashboard-border)]'
                    : 'text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)] hover:bg-[var(--bg-hover)] border border-transparent'
                }`}
                title={tab.title}
              >
                {tab.title}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {hubBodyVisible && (
          <div className="order-1 flex-1 min-h-0 overflow-y-auto chat-hide-scroll px-4 py-4 space-y-4">
            {mobileHubTab === 'automations' ? (
              <>
                <h2 className="text-[16px] font-semibold text-[var(--text-heading)]">Automations and GitHub</h2>
                <p className="text-[12px] text-[var(--dashboard-muted)] leading-relaxed">
                  Open the full GitHub repository browser (same as the Deploy tab) to work in any connected repo, browse
                  files, and open them in the editor.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenGitHubIntegration?.()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] text-[13px] font-medium text-[var(--dashboard-text)] hover:bg-[var(--bg-hover)]"
                >
                  <FolderGit2 size={18} className="text-[var(--solar-cyan)]" />
                  Open GitHub repos
                </button>
                <button
                  type="button"
                  onClick={() => window.open('https://github.com/new', '_blank', 'noopener,noreferrer')}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] text-[13px] font-medium text-[var(--dashboard-text)] hover:bg-[var(--bg-hover)]"
                >
                  <Zap size={18} className="text-[var(--solar-yellow)]" />
                  Create new repository on GitHub
                </button>
              </>
            ) : (
              <>
                <h2 className="text-[16px] font-semibold text-[var(--text-heading)]">Workspace</h2>
                <p className="text-[12px] text-[var(--dashboard-muted)] leading-relaxed">
                  Return to the main editor, welcome screen, and tabs. Inner Animal Media themes from Settings still apply
                  everywhere via your workspace <code className="text-[var(--solar-cyan)]">cms_themes</code> row.
                </p>
                <button
                  type="button"
                  onClick={() => onMobileOpenDashboard?.()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] text-[13px] font-medium text-[var(--dashboard-text)] hover:bg-[var(--bg-hover)]"
                >
                  <LayoutDashboard size={18} className="text-[var(--solar-cyan)]" />
                  Open dashboard / editor
                </button>
              </>
            )}
          </div>
        )}

        {messagesVisible && (
          <>
          {thinkingState && (
          <ThinkingCard
            steps={thinkingState.steps}
            thinkingText={thinkingState.thinkingText}
            status={thinkingState.status}
            startedAt={thinkingState.startedAt}
          />
        )}
          {(() => {
            if (showEmptyThreadPlaceholder || !pythonDraftHint || !/\.py$/i.test(pythonDraftHint)) return null;
            return (
            <div className="px-3 sm:px-4 shrink-0">
              <ScriptDraftPanel
                fileName={pythonDraftHint}
                workspacePath={activeFile?.workspacePath ?? null}
                onFocusEditor={() => onOpenCodeTab?.()}
                onSyntaxCheck={handleDraftSyntaxCheck}
                onRunScript={handleDraftRunScript}
                syntaxBusy={draftSyntaxBusy}
                runBusy={draftRunBusy}
              />
            </div>
            );
          })()}
        <AgentMessageList
            scrollRef={scrollRef}
            showEmptyThreadPlaceholder={showEmptyThreadPlaceholder}
            displayMessages={displayMessages}
            isLoading={isLoading}
            logoMotion={logoMotion}
            presenceState={presenceState}
            isDarkTheme={isDarkTheme}
            toolTraceRows={toolTraceRows}
            setToolTraceRows={setToolTraceRows}
            workspaceId={workspaceId ?? null}
            workflowLedger={workflowLedger}
            onFileSelect={onFileSelect}
            onRunInTerminal={onRunInTerminal}
            onImagePreview={handleChatImagePreview}
          />
          </>
        )}

        {contextTabVisible && (
          <div className="order-4 flex-1 min-h-0 overflow-y-auto chat-hide-scroll px-4 py-4 space-y-4 border-t border-[var(--dashboard-border)]">
            <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] p-4 space-y-3">
              <h3 className="text-[12px] font-semibold text-[var(--text-heading)] uppercase tracking-wide">Editor</h3>
              <p className="text-[12px] text-[var(--dashboard-muted)] font-mono break-all">
                {activeFile ? getEditorDisplayPath(activeFile, activeFileName) : 'No file open'}
              </p>
              <button
                type="button"
                onClick={() => onOpenCodeTab?.()}
                className="w-full py-2.5 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] text-[13px] font-medium text-[var(--dashboard-text)] hover:bg-[var(--bg-hover)]"
              >
                Open code editor
              </button>
            </div>
            <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] p-4 space-y-3">
              <h3 className="text-[12px] font-semibold text-[var(--text-heading)] uppercase tracking-wide">GitHub</h3>
              <p className="text-[12px] text-[var(--dashboard-muted)]">
                {githubRepoContext?.trim()
                  ? `Selected repo: ${githubRepoContext}`
                  : 'Pick a repository from the Agents home screen (repo button below the composer).'}
              </p>
              <button
                type="button"
                onClick={() => onOpenGitHubIntegration?.(githubRepoContext?.trim() ? { expandRepoFullName: githubRepoContext.trim() } : undefined)}
                className="w-full py-2.5 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] text-[13px] font-medium text-[var(--dashboard-text)] hover:bg-[var(--bg-hover)] flex items-center justify-center gap-2"
              >
                <GitBranch size={16} className="text-[var(--solar-cyan)]" />
                Open GitHub browser
              </button>
              <button
                type="button"
                onClick={() => window.open('https://github.com/new', '_blank', 'noopener,noreferrer')}
                className="w-full py-2.5 rounded-lg border border-[var(--dashboard-border)] text-[13px] font-medium text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)] hover:bg-[var(--bg-hover)] flex items-center justify-center gap-2"
              >
                <ExternalLink size={16} />
                Create new repo on GitHub
              </button>
            </div>
          </div>
        )}

        {composerVisible && (
        <div
          className={`${composerFlexOrder} flex-shrink-0 w-full min-w-0 max-w-full px-3 pt-2 bg-[var(--dashboard-panel)] border-t border-[var(--dashboard-border)] space-y-2`}
          style={{
            paddingBottom: isNarrow ? MOBILE_CHAT_COMPOSER_BOTTOM_PAD : 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          }}
        >
          <ToolApprovalModal
            workspaceId={workspaceId}
            agentRunId={agentRunId}
            toolExecutionActive={isLoading}
            chatSessionId={conversationId}
            onOpenInEditor={onFileSelect}
          />
          {pendingToolApproval && (
            <div role="region" aria-label="Plan task approval" className="w-full min-w-0 max-w-full shrink-0">
              <div className="relative w-full min-w-0 rounded-2xl border border-white/[0.08] bg-[color-mix(in_srgb,var(--dashboard-panel)_72%,transparent)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-amber-400/20 overflow-hidden">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-black/[0.12]" aria-hidden />
                <div className="relative px-3 py-2.5 border-b border-white/[0.06]">
                  <p className="text-[0.8125rem] font-medium text-[var(--dashboard-text)]">
                    {pendingToolApproval.tool.plan_terminal ? 'Plan task approval' : 'Tool approval'}
                  </p>
                  <p className="mt-0.5 text-[0.6875rem] font-mono text-[var(--solar-cyan)] truncate">
                    {pendingToolApproval.tool.name}
                  </p>
                </div>
                {pendingToolApproval.tool.preview ? (
                  <pre className="m-0 max-h-[min(24vh,160px)] overflow-auto px-3 py-2 text-[0.6875rem] font-mono text-[var(--dashboard-text)]/90 whitespace-pre-wrap break-words border-b border-white/[0.05] bg-black/20">
                    {pendingToolApproval.tool.preview}
                  </pre>
                ) : null}
                <div className="relative flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    disabled={approvalBusy}
                    onClick={() => void handleApprovePendingTool()}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[2rem] px-3.5 rounded-lg text-[0.75rem] font-semibold text-[var(--solar-base03)] bg-[var(--solar-cyan)] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_4px_14px_rgba(34,211,238,0.22)] hover:brightness-110 disabled:opacity-45"
                  >
                    <Play size={13} className="fill-current" aria-hidden />
                    {approvalBusy ? 'Running…' : 'Run'}
                  </button>
                  <button
                    type="button"
                    disabled={approvalBusy}
                    onClick={handleDenyPendingTool}
                    className="inline-flex items-center justify-center min-h-[2rem] px-2.5 rounded-lg text-[0.72rem] font-medium text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)] hover:bg-white/[0.04] disabled:opacity-45"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
          {workflowLedger.runId ? (
            <div className="px-3 py-1.5 text-[0.625rem] font-mono text-[var(--dashboard-muted)] border-b border-[var(--dashboard-border)]/60 bg-[var(--scene-bg)]/80">
              Workflow{' '}
              <span className="text-[var(--solar-cyan)]">{workflowLedger.runId.slice(0, 18)}</span>
              {workflowLedger.stepsTotal != null
                ? ` · steps ${workflowLedger.stepsCompleted}/${workflowLedger.stepsTotal}`
                : ` · steps ${workflowLedger.stepsCompleted}`}
              {workflowLedger.currentNodeKey ? ` · ${workflowLedger.currentNodeKey}` : ''}
              {workflowLedger.runCost != null ? ` · $${workflowLedger.runCost.toFixed(4)}` : ''}
              {workflowLedger.lastError ? ` · err: ${workflowLedger.lastError.slice(0, 120)}` : ''}
            </div>
          ) : null}
          {browserElementContext ? (
            <div className="flex items-start gap-2 rounded-lg border border-[var(--solar-cyan)]/25 bg-[var(--scene-bg)] px-3 py-2 text-[0.6875rem]">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[var(--text-heading)]">BrowserView · selected element</div>
                <div className="text-[var(--dashboard-muted)] truncate font-mono mt-0.5">
                  &lt;{String(browserElementContext.tag || browserElementContext.tagName || '?')}
                  {browserElementContext.id ? `#${String(browserElementContext.id)}` : ''}
                  {browserElementContext.className
                    ? `.${String(browserElementContext.className).split(/\s+/)[0]}`
                    : ''}
                  &gt;
                  {String(browserElementContext.selector || browserElementContext.path || '').slice(0, 80)
                    ? ` · ${String(browserElementContext.selector || browserElementContext.path).slice(0, 80)}`
                    : ''}
                </div>
                {browserElementContext.computed_styles &&
                typeof browserElementContext.computed_styles === 'object' ? (
                  <div className="text-[var(--dashboard-muted)] mt-1 opacity-80 line-clamp-2">
                    {Object.entries(browserElementContext.computed_styles as Record<string, unknown>)
                      .slice(0, 4)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(' · ')}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="shrink-0 px-2 py-1 rounded border border-[var(--dashboard-border)] text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)]"
                onClick={() => setBrowserElementContext(null)}
              >
                Clear
              </button>
            </div>
          ) : null}
          {attachments.length > 0 && (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1 chat-hide-scroll">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="relative flex-shrink-0 flex items-center gap-2 bg-[var(--scene-bg)] border border-[var(--dashboard-border)] rounded-lg pl-1 pr-7 py-1"
                  >
                    {a.type === 'image' && a.previewUrl ? (
                      <img
                        src={a.previewUrl}
                        alt=""
                        className="w-12 h-12 rounded-md object-cover"
                        style={{ width: 48, height: 48, borderRadius: 6 }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-[var(--dashboard-panel)] flex items-center justify-center border border-[var(--dashboard-border)]">
                        <FileText size={18} className="text-[var(--dashboard-muted)]" />
                      </div>
                    )}
                    {a.type === 'file' && (
                      <div className="min-w-0 max-w-[140px]">
                        <div className="text-[0.625rem] font-mono text-[var(--dashboard-text)] truncate">
                          {a.file.name.length > 24 ? `${a.file.name.slice(0, 21)}...` : a.file.name}
                        </div>
                        <div className="text-[0.6875rem] text-[var(--dashboard-muted)]">{formatFileSize(a.file.size)}</div>
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      className="absolute top-0.5 right-0.5 p-0.5 rounded text-[var(--dashboard-muted)] hover:text-[var(--solar-red)] hover:bg-[var(--bg-hover)]"
                      onClick={() => removeAttachment(a.id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.625rem] font-mono px-0.5 -mt-0.5 pb-0.5">
                <span
                  className={
                    totalStagedBytes > CHAT_ATTACH_MAX_TOTAL_BYTES ? 'text-[var(--solar-red)]' : 'text-[var(--dashboard-muted)]'
                  }
                >
                  Total: {(totalStagedBytes / (1024 * 1024)).toFixed(2)} MB / {(CHAT_REQUEST_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB
                </span>
                {totalStagedBytes > CHAT_ATTACH_MAX_TOTAL_BYTES ? (
                  <span className="text-[var(--solar-red)]">
                    Over {(CHAT_ATTACH_MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB combined — remove files before send
                  </span>
                ) : null}
              </div>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="*/*"
            className="hidden"
            onChange={(e) => {
              addFilesFromList(e.target.files, false);
              e.target.value = '';
            }}
          />
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              addFilesFromList(e.target.files, true);
              e.target.value = '';
            }}
          />

          <div
            className={`flex flex-col bg-[var(--scene-bg)] border rounded-xl transition-all shadow-inner overflow-visible ${
              composerDragging
                ? 'border-[var(--solar-cyan)]/70 ring-1 ring-[var(--solar-cyan)]/35'
                : 'border-[var(--dashboard-border)] focus-within:border-[var(--solar-cyan)]/80 focus-within:ring-2 focus-within:ring-[var(--solar-cyan)]/20 focus-within:shadow-[0_0_12px_color-mix(in_srgb,var(--solar-cyan)_18%,transparent)]'
            }`}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              composerDragDepthRef.current += 1;
              setComposerDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              composerDragDepthRef.current = Math.max(0, composerDragDepthRef.current - 1);
              if (composerDragDepthRef.current === 0) setComposerDragging(false);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              composerDragDepthRef.current = 0;
              setComposerDragging(false);
              addFilesFromList(e.dataTransfer.files, false);
            }}
          >
            <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={onKeyDown}
                onSelect={(ev) => syncPickers(ev.currentTarget.value, ev.currentTarget.selectionStart)}
                onClick={(ev) => syncPickers(ev.currentTarget.value, ev.currentTarget.selectionStart)}
                placeholder="Message Agent Sam..."
                rows={1}
                className={`w-full min-w-0 bg-transparent px-3 pt-2.5 pb-1 focus:outline-none text-[var(--dashboard-text)] placeholder:text-[var(--text-placeholder-strong)] resize-none font-sans leading-relaxed ${
                  isNarrow ? 'text-base' : 'text-[0.8125rem]'
                }`}
                style={{
                  minHeight: '44px',
                  maxHeight: isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE,
                }}
              />
            <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-0.5 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 shrink">
                <button
                  type="button"
                  ref={modeButtonRef}
                  onClick={() => {
                    setIsModeOpen((o) => !o);
                    setIsModelPickerOpen(false);
                    setAttachMenuOpen(false);
                  }}
                  className={`${composerPillClass} max-w-[9rem]`}
                  title={`Conversation mode: ${modeLabel}`}
                  aria-expanded={isModeOpen}
                  aria-haspopup="listbox"
                >
                  {modeIcon}
                  <span className="truncate">{modeLabel}</span>
                  <ChevronDown size={12} className="shrink-0 opacity-60" />
                </button>
                <button
                  type="button"
                  ref={modelButtonRef}
                  onClick={() => {
                    setIsModelPickerOpen((o) => !o);
                    setIsModeOpen(false);
                    setAttachMenuOpen(false);
                  }}
                  className={`${composerPillClass} max-w-[10rem]`}
                  title={
                    isAutoModelSelection(selectedModelKey)
                      ? 'Model: Auto (Thompson routing)'
                      : `Model: ${modelPickerLabel}`
                  }
                  aria-expanded={isModelPickerOpen}
                  aria-haspopup="listbox"
                >
                  <span className="truncate">{modelPickerLabel}</span>
                  <ChevronDown size={12} className="shrink-0 opacity-60" />
                </button>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  ref={attachButtonRef}
                  className="flex-shrink-0 p-2 text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] rounded-lg transition-all"
                  title="Attach files"
                  onClick={() => {
                    setAttachMenuOpen((o) => !o);
                    setIsModeOpen(false);
                    setIsModelPickerOpen(false);
                  }}
                >
                  <Paperclip size={16} strokeWidth={2} />
                </button>
                <button
                type="button"
                onClick={() => {
                  if (isLoading) {
                    abortControllerRef.current?.abort();
                    streamReaderRef.current?.cancel().catch(() => {});
                    setIsLoading(false);
                  } else {
                    handleSend();
                  }
                }}
                disabled={!isLoading && !canSend}
                className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-[0.6875rem] font-bold transition-all relative ${
                  canSend || isLoading
                    ? 'bg-[var(--solar-cyan)] text-[var(--solar-base03)] shadow-[0_0_16px_color-mix(in_srgb,var(--solar-cyan)_25%,transparent)] hover:brightness-110'
                    : 'text-[var(--text-chrome-muted)] bg-[var(--bg-disabled)] cursor-not-allowed'
                } ${isLoading ? 'agent-send-pulse' : ''} ${
                  pendingToolApproval && !isLoading ? 'agent-send-approval ring-1 ring-[var(--solar-yellow)]/45' : ''
                }`}
                title={
                  isLoading ? 'Stop' : pendingToolApproval ? 'Approval required — confirm below' : 'Send'
                }
              >
                {isLoading ? (
                  <>
                    <X size={12} className="text-red-600" />
                    {messageQueue.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold border border-[var(--dashboard-panel)]">
                        {messageQueue.length}
                      </span>
                    )}
                  </>
                ) : pendingToolApproval ? (
                  <ShieldCheck size={14} className="text-[var(--solar-base03)]" />
                ) : (
                  <ArrowUp size={14} strokeWidth={2.5} />
                )}
              </button>
              </div>
            </div>
          </div>
          {mobileAgentsThread && mobileThreadTab === 'chat' && (
            <button
              type="button"
              onClick={() => setRepoDrawerOpen(true)}
              className="flex w-full items-center gap-1.5 text-left text-[11px] text-[var(--dashboard-muted)] transition-colors hover:text-[var(--dashboard-text)] py-2 px-1 rounded-lg hover:bg-[var(--bg-hover)]"
            >
              <FolderGit2 size={14} className="shrink-0 text-[var(--solar-cyan)]" />
              <span className="min-w-0 flex-1 truncate">
                {githubRepoContext?.trim() || 'Select GitHub repository'}
              </span>
              <ChevronDown size={14} className="shrink-0 opacity-60" />
            </button>
          )}
        </div>
        )}

        </div>

      </div>

      {repoDrawerOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[70] bg-[var(--text-main)]/50"
            aria-label="Close repository picker"
            onClick={() => setRepoDrawerOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[80] flex max-h-[min(72dvh,520px)] flex-col rounded-t-2xl border-t border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] shadow-[0_-8px_32px_color-mix(in_srgb,var(--text-main)_12%,transparent)]">
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-[var(--dashboard-border)]" aria-hidden />
            <div className="shrink-0 border-b border-[var(--dashboard-border)] px-4 py-3">
              <h3 className="text-[14px] font-semibold text-[var(--dashboard-text)]">Repositories</h3>
              <input
                type="search"
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
                placeholder="Search repos"
                className="mt-2 w-full rounded-lg border border-[var(--dashboard-border)] bg-[var(--scene-bg)] py-2 px-3 text-[13px] text-[var(--dashboard-text)] placeholder:text-[var(--text-placeholder-strong)] outline-none focus:border-[var(--solar-cyan)]"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto chat-hide-scroll p-2">
              {!ghReposAuthed && !ghReposLoading ? (
                <div className="space-y-3 px-2 py-6 text-center">
                  <p className="text-[12px] text-[var(--dashboard-muted)]">Connect GitHub to list repositories.</p>
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = '/api/oauth/github/start?return_to=/dashboard/agent';
                    }}
                    className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--scene-bg)] px-4 py-2 text-[12px] font-medium text-[var(--dashboard-text)]"
                  >
                    Connect GitHub
                  </button>
                </div>
              ) : ghReposLoading ? (
                <div className="flex justify-center py-8 text-[var(--dashboard-muted)]">
                  <Loader2 className="animate-spin" size={24} />
                </div>
              ) : filteredGhRepos.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-[var(--dashboard-muted)]">No repositories match.</p>
              ) : (
                filteredGhRepos.map((repo) => {
                  const full = String(repo.full_name || '');
                  const selected = githubRepoContext === full;
                  return (
                    <div key={String(repo.id)} className="mb-1 flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            localStorage.setItem(LS_GH_REPO, full);
                          } catch {
                            /* ignore */
                          }
                          setGithubRepoContext(full);
                          setRepoDrawerOpen(false);
                        }}
                        className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-[var(--bg-hover)] ${
                          selected ? 'bg-[var(--scene-bg)] ring-1 ring-[var(--solar-cyan)]/40' : ''
                        }`}
                      >
                        <span className="truncate font-medium text-[var(--dashboard-text)]">{full}</span>
                        {repo.default_branch ? (
                          <span className="shrink-0 text-[10px] text-[var(--dashboard-muted)]">{repo.default_branch}</span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        title="Browse files in Deploy tab"
                        onClick={() => {
                          try {
                            localStorage.setItem(LS_GH_REPO, full);
                          } catch {
                            /* ignore */
                          }
                          setGithubRepoContext(full);
                          setRepoDrawerOpen(false);
                          onOpenGitHubIntegration?.({ expandRepoFullName: full });
                        }}
                        className="shrink-0 rounded-lg border border-[var(--dashboard-border)] px-2 py-2 text-[11px] text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)]"
                      >
                        Files
                      </button>
                    </div>
                  );
                })
              )}
              <button
                type="button"
                onClick={() => window.open('https://github.com/new', '_blank', 'noopener,noreferrer')}
                className="mt-2 w-full rounded-lg border border-dashed border-[var(--dashboard-border)] py-3 text-[12px] font-medium text-[var(--dashboard-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--dashboard-text)]"
              >
                Create new repository on GitHub
              </button>
            </div>
          </div>
        </>
      )}

      {typeof document !== 'undefined' &&
        attachMenuOpen &&
        attachMenuStyle &&
        createPortal(
          <div
            className="bg-[var(--scene-bg)] border border-[var(--dashboard-border)] rounded-xl shadow-2xl flex flex-col text-[0.6875rem] overflow-y-auto overflow-x-hidden py-1 min-w-0"
            style={attachMenuStyle}
            role="menu"
          >
            <button
              type="button"
              className="flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--dashboard-panel)] text-[var(--dashboard-text)] transition-colors"
              onClick={() => {
                setAttachMenuOpen(false);
                fileInputRef.current?.click();
              }}
            >
              <Paperclip size={14} className="text-[var(--dashboard-muted)] shrink-0" />
              <span>Upload File</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--dashboard-panel)] text-[var(--dashboard-text)]"
              onClick={() => {
                setAttachMenuOpen(false);
                const el = textareaRef.current;
                if (!el) return;
                const start = el.selectionStart;
                const v = input.slice(0, start) + '@' + input.slice(start);
                const pos = start + 1;
                setInput(v);
                requestAnimationFrame(() => {
                  el.focus();
                  el.setSelectionRange(pos, pos);
                  syncPickers(v, pos);
                });
              }}
            >
              <AtSign size={14} className="text-[var(--dashboard-muted)] shrink-0" />
              <span>Mention</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--dashboard-panel)] text-[var(--dashboard-text)]"
              onClick={() => {
                setAttachMenuOpen(false);
                const el = textareaRef.current;
                if (!el) return;
                const start = el.selectionStart;
                const v = input.slice(0, start) + '/' + input.slice(start);
                const pos = start + 1;
                setInput(v);
                requestAnimationFrame(() => {
                  el.focus();
                  el.setSelectionRange(pos, pos);
                  syncPickers(v, pos);
                });
              }}
            >
              <Slash size={14} className="text-[var(--dashboard-muted)] shrink-0" />
              <span>Command</span>
            </button>
            <div className="border-t border-[var(--dashboard-border)] my-1 mx-2" role="separator" />
            <button
              type="button"
              className="flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--dashboard-panel)] text-[var(--dashboard-text)] transition-colors"
              onClick={() => {
                setAttachMenuOpen(false);
                imageInputRef.current?.click();
              }}
            >
              <ImageIconLucide size={14} className="text-[var(--dashboard-muted)] shrink-0" />
              <span>Image</span>
            </button>
          </div>,
          document.body
        )}

      {typeof document !== 'undefined' &&
        isModelPickerOpen &&
        modelPickerStyle &&
        createPortal(
          <div
            className="flex max-h-[min(360px,calc(100dvh-6rem))] min-w-0 flex-col overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] py-1 text-[0.6875rem] shadow-2xl"
            style={modelPickerStyle}
            role="listbox"
            aria-label="Model picker"
          >
            <div className="border-b border-[var(--dashboard-border)]/70 px-3 py-2 text-[9px] font-black uppercase tracking-[0.15em] text-[var(--dashboard-muted)]">
              Models — this chat only
            </div>
            {renderModelPickerList(pickModelKey)}
          </div>,
          document.body,
        )}

      {typeof document !== 'undefined' &&
        isModeOpen &&
        modeMenuStyle &&
        createPortal(
          <div
            className="bg-[var(--scene-bg)] border border-[var(--dashboard-border)] rounded-xl shadow-2xl p-1 flex flex-col text-[0.6875rem] overflow-y-auto overflow-x-hidden min-w-0"
            style={modeMenuStyle}
          >
            {modes.map((m) => {
              const MenuIcon =
                m.id === 'plan'
                  ? ListTodo
                  : m.id === 'debug'
                    ? Bug
                    : m.id === 'multitask'
                      ? RefreshCw
                      : m.id === 'ask'
                        ? MessageCircle
                        : Infinity;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`mx-1 flex w-full min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--dashboard-panel)] ${
                    mode === m.id ? 'bg-[var(--dashboard-panel)]' : ''
                  }`}
                  onClick={() => {
                    setMode(m.id);
                    setIsModeOpen(false);
                  }}
                >
                  <MenuIcon
                    size={14}
                    className={`mt-0.5 shrink-0 ${mode === m.id ? 'text-[var(--solar-cyan)]' : 'text-[var(--dashboard-muted)]'}`}
                  />
                  <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <div
                      className={`text-[11px] font-bold ${mode === m.id ? 'text-[var(--solar-cyan)]' : 'text-[var(--dashboard-text)]'}`}
                    >
                      {m.label}
                    </div>
                    <div className="text-[9px] text-[var(--dashboard-muted)] leading-tight">{m.description}</div>
                  </div>
                </button>
              );
            })}
          </div>,
          document.body
        )}

      {typeof document !== 'undefined' &&
        mentionOpen &&
        mentionStyle &&
        mentionItems.length > 0 &&
        createPortal(
          <div
            className="bg-[var(--scene-bg)] border border-[var(--dashboard-border)] rounded-xl shadow-2xl flex flex-col text-[0.6875rem] overflow-y-auto overflow-x-hidden p-1 min-w-0"
            style={mentionStyle}
          >
            {mentionItems.map((it, i) => (
              <button
                key={it.id}
                type="button"
                className={`px-3 py-1.5 text-left rounded-lg truncate ${
                  i === mentionIndex ? 'bg-[var(--dashboard-panel)] text-[var(--solar-cyan)]' : 'text-[var(--dashboard-muted)] hover:bg-[var(--dashboard-panel)]'
                }`}
                onMouseEnter={() => setMentionIndex(i)}
                onClick={() => applyMention(it)}
              >
                <span className="text-[0.6875rem] uppercase text-[var(--dashboard-muted)] mr-2">{it.kind}</span>
                {it.label}
              </button>
            ))}
          </div>,
          document.body
        )}

      {typeof document !== 'undefined' &&
        slashOpen &&
        slashStyle &&
        slashItems.length > 0 &&
        createPortal(
          <div
            className="bg-[var(--scene-bg)] border border-[var(--dashboard-border)] rounded-xl shadow-2xl flex flex-col text-[0.6875rem] overflow-y-auto overflow-x-hidden p-1 max-w-[min(320px,calc(100vw-2rem))] min-w-0"
            style={slashStyle}
          >
            {slashItems.map((c, i) => (
              <button
                key={c.slug}
                type="button"
                className={`px-3 py-1.5 text-left rounded-lg ${
                  i === slashIndex ? 'bg-[var(--dashboard-panel)] text-[var(--solar-cyan)]' : 'text-[var(--dashboard-muted)] hover:bg-[var(--dashboard-panel)]'
                }`}
                onMouseEnter={() => setSlashIndex(i)}
                onClick={() => applySlash(c)}
              >
                <div className="font-mono font-bold">/{c.slug}</div>
                {c.description && (
                  <div className="text-[0.625rem] text-[var(--dashboard-muted)] truncate">{c.description}</div>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
};

export {
  normalizeAssistantSseText,
  looksLikeRawProviderLeak,
  ssePayloadLooksReasoningOnly,
  isStreamErrorPayload,
  extractMonacoInvokesFromBuffer,
  hideIncompleteMonacoInvokeTail,
  looksLikeEmbeddedFileDumpStart,
  formatHttpErrorMessage,
} from './streamParsing';
