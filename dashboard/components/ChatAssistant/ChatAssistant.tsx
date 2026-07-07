
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import './chat-composer-glass.css';
import './chat-startup-center.css';
import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { PHONE_MQ } from '../../lib/breakpoints';
import { setChatActivityBusy } from '../../src/pwa/chatActivityGate';
import { preserveLiveCadTraceRows } from '../../lib/cadToolTrace';
import { useEditor } from '../../src/EditorContext';
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
  MousePointer2,
} from 'lucide-react';
import { ProjectType } from '../../types';
import type { ActiveFile } from '../../types';
import { SetiFileIcon } from '../../src/components/SetiFileIcon';
import {
  IAM_AGENT_CHAT_CONVERSATION_CHANGE,
  IAM_AGENT_CHAT_NEW_THREAD,
  IAM_AGENT_CHAT_COMPOSE,
  IAM_AGENT_MOBILE_CODE_FOCUS,
  LS_AGENT_CHAT_CONVERSATION_ID,
  type AgentChatComposeDetail,
  type QuickstartThreadDetail,
} from '../../agentChatConstants';
import {
  buildChatProjectContext,
  CHAT_RUNTIME_LANE_USER_APP,
} from '../../lib/chatProjectContext';
import { notifyAgentChatSessionsRefresh } from '../../lib/openAgentConversation';
import { replaceAgentConversationUrl, isAgentCenterChatHome } from '../../lib/agentRoutes';
import type { AgentSessionRow } from '../../agentSessionsCatalog';
import { sessionDisplayTitle } from '../../agentSessionsCatalog';
import type {
  AgentGeneratedFile,
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
import { useWorkspace } from '../../src/context/WorkspaceContext';
import { useAgentModels, useAgentDefaultModel } from '../../src/hooks/useAgentModels';
import {
  githubRepoContextStorageKey,
  chatGithubContextStorageKey,
  readChatGithubContext,
  writeChatGithubContext,
  MENTION_CONTEXT_HEADER,
  CHAT_ATTACH_MAX_TOTAL_BYTES,
  CHAT_REQUEST_MAX_BYTES,
  resolveComposerImageHandlingMode,
  resolveAttachmentFileForUpload,
  isImageAttachmentFile,
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
import {
  buildMentionContext,
  browserElementMentionToken,
  browserMentionInMessage,
  isChatTextCodeFile,
  readFileAsText,
  getEditorDisplayPath,
  getEditorLightweightPath,
} from './mentionContext';
import {
  measureAboveAnchor,
  measureBelowComposerAnchor,
  syncComposerTextareaHeight,
  formatFileSize,
  isAgentSamEmptyThreadGreeting,
} from './composerLayout';
import { RepoPickerBottomSheet } from './RepoPickerBottomSheet';
import { ContextHubDrawer, type ContextHubLane } from './ContextHubDrawer';
import {
  buildGithubContextEnvelope,
  fetchGithubFileContent,
} from '../../types/contextEnvelope';
import { detectClientSurface } from '../../src/lib/clientSurface';
import { dashboardComposerBottomPad } from '../../config/shellChrome';
import {
  readStoredExecLane,
  writeStoredExecLane,
  isPlatformOperatorFromPolicy,
  LS_EXEC_LANE_MOBILE,
  type ExecLane,
} from '../../src/lib/execLane';
import { applyFreshChatSessionDefaults, readSessionEnabledConnectors, flattenSessionEnabledTools, readSessionProject } from '../../src/lib/freshChatSession';
import { formatHttpErrorMessage } from './streamParsing';
import { consumeAgentChatSseBody } from './hooks/useAgentChatStream';
import { initIamAgentStreamDebug, patchIamAgentStreamDebug } from './streamDebug';
import { AgentMessageList } from './components/AgentMessageList';
import { PlanRecentPicker } from './components/PlanRecentPicker';
import { PlanStartOverBar } from './components/PlanStartOverBar';
import { suggestPlanMode, nextAgentMode, isPlanSlashMessage } from '../../lib/plan-mode-utils';
import { AgentMobileHomePanel } from './components/AgentMobileHomePanel';
import { AgentChatThreadHeader, findSessionRow } from './components/AgentChatThreadHeader';
import { AgentMobileContextPanel } from './components/AgentMobileContextPanel';
import { AgentChatFilesPanel } from './components/AgentChatFilesPanel';
import type { AgentChatProjectOption } from '../../hooks/useAgentChatSessions';
import { AgentComposerSourceChips } from './composer/AgentComposerSourceChips';
import { ComposerConnectorSheet } from './components/ComposerConnectorSheet';
import {
  ComposerStartupChips,
  ComposerStartupGreeting,
} from './components/ComposerStartupChips';
import type { ComposerAvailableConnector } from '../../src/hooks/useAvailableConnectors';
import { AgentComposerMicButton } from './composer/AgentComposerMicButton';
import {
  composerSourcesStorageKey,
  readComposerSources,
  writeComposerSources,
} from './composer/composerSourcesStorage';
import type { ChatComposerSource } from './composer/types';
import { WEB_SEARCH_SOURCE, WEB_SEARCH_SOURCE_ID, SANDBOX_AGENT_SOURCE, SANDBOX_AGENT_SOURCE_ID } from './composer/types';
import type { ThinkingCardState } from '../../src/components/ThinkingCard';
import type { ActiveSubagentRow, PlanQuestionsBatchPayload } from './types';
import { deriveHeroThinkingState } from './components/deriveHeroThinking';
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
  formatThinkingStepName,
  simplifyToolName,
  formatBrowserLiveSseStepName,
  upsertThinkingStep,
} from '../../features/agent-chat/formatThinkingStepName';
import {
  pickAgentPresenceColorway,
  agentPresenceColorwayStyle,
} from '../../features/agent-presence/presenceColorways';

type ChatRoutingSendOpts = {
  modelKey?: string;
  subagent_slug?: string;
  task_type?: string;
  route_key?: string;
  quickstart_batch?: string;
  quickstart_card?: string;
  apply_eto_after_run?: boolean;
  workspace_id?: string;
  force_plan_mode?: boolean;
  project_slug?: string;
  page_id?: string | null;
  bootstrap_cache_key?: string | null;
  collab_room?: string | null;
  live_session_id?: string | null;
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
  if (detail.quickstart_card?.trim()) opts.quickstart_card = detail.quickstart_card.trim();
  if (detail.apply_eto_after_run) opts.apply_eto_after_run = true;
  if (detail.workspace_id?.trim()) opts.workspace_id = detail.workspace_id.trim();
  if (detail.force_plan_mode) opts.force_plan_mode = true;
  if (detail.project_slug?.trim()) opts.project_slug = detail.project_slug.trim();
  if (detail.page_id != null && String(detail.page_id).trim()) {
    opts.page_id = String(detail.page_id).trim();
  }
  if (detail.bootstrap_cache_key?.trim()) {
    opts.bootstrap_cache_key = detail.bootstrap_cache_key.trim();
  }
  if (detail.collab_room?.trim()) opts.collab_room = detail.collab_room.trim();
  if (detail.live_session_id?.trim()) opts.live_session_id = detail.live_session_id.trim();
  return Object.keys(opts).length ? opts : undefined;
}

export { IAM_AGENT_CHAT_CONVERSATION_CHANGE, IAM_AGENT_CHAT_NEW_THREAD } from '../../agentChatConstants';

export const ChatAssistant: React.FC<ChatAssistantProps> = ({
  activeProject,
  designStudioSceneId,
  designStudioBlueprintId,
  designStudioCadJobId,
  activeFileContent,
  defaultSubagentSlug,
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
  onDeleteActiveChat,
  onOpenQuickstart,
  agentsamPolicy = null,
  workspaceId = null,
  syncedHostConversationId,
  agentChatShellTabs,
  activeAgentChatShellTabId,
  onAgentChatShellTabSelect,
  onAgentChatShellTabClose,
  onAgentChatShellNewTab,
  showAgentWorkbenchTabs = true,
  activeWorkbenchTab,
  browserUrl: browserUrlProp,
  openFilePaths,
  activePlanId,
  onActivePlanChange,
  cmsContext = null,
  hostWorkspaceContext = null,
  dashboardRouteKey = null,
  dashboardRouteLabel = null,
  routeQuickActions = [],
  atmosphericHomeMode = false,
  composerPortalTarget = null,
  messagesPortalTarget = null,
  composerPlaceholder: composerPlaceholderOverride,
  onToggleScratchpad,
  scratchpadOpen: scratchpadOpenProp = false,
  scratchpadFileCount = 0,
  availableConnectors = [],
  availableConnectorsLoading = false,
  onOpenEditor,
}) => {
  const { sessionUserId, workspaceId: ctxWorkspaceId, workspaces } = useWorkspace();
  const location = useLocation();
  const effectiveWsId = (workspaceId || ctxWorkspaceId || '').trim() || null;
  const agentL2Enabled = Boolean(sessionUserId);
  const { models: chatModels } = useAgentModels(agentL2Enabled);
  const { defaultModelKey } = useAgentDefaultModel(agentL2Enabled);

  const agentsamPolicyRef = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    agentsamPolicyRef.current = agentsamPolicy;
  }, [agentsamPolicy]);

  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => { onLoadingChange?.(isLoading); }, [isLoading, onLoadingChange]);
  useEffect(() => {
    setChatActivityBusy(isLoading);
    return () => setChatActivityBusy(false);
  }, [isLoading]);
  const [thinkingState, setThinkingState] =
    useState<ThinkingCardState | null>(null);
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [presenceState, setPresenceState] = useState<string>('idle');
  useEffect(() => {
    const browserLane = [
      'browser_live',
      'browser_debug',
      'browser_human_input',
      'browser_capture',
      'browser',
    ].includes(presenceState);
    window.dispatchEvent(
      new CustomEvent('iam-agent-browser-presence', {
        detail: { active: browserLane, state: presenceState },
      }),
    );
  }, [presenceState]);
  const [activeSubagents, setActiveSubagents] = useState<ActiveSubagentRow[]>([]);
  useEffect(() => {
    if (!isLoading) setActiveSubagents([]);
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
  const handleSendRef = useRef<
    (override?: string, sendOpts?: ChatRoutingSendOpts) => Promise<void>
  >(async () => {});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerGlassRef = useRef<HTMLDivElement>(null);
  const pendingSubagentSlugRef = useRef<string | null>(null);
  const attachButtonRef = useRef<HTMLButtonElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [localScratchpadOpen, setLocalScratchpadOpen] = useState(false);
  const scratchpadOpen = onToggleScratchpad ? scratchpadOpenProp : localScratchpadOpen;
  const handleToggleScratchpad = useCallback(() => {
    if (onToggleScratchpad) onToggleScratchpad();
    else setLocalScratchpadOpen((v) => !v);
  }, [onToggleScratchpad]);
  const [chatProjects, setChatProjects] = useState<AgentChatProjectOption[]>([]);
  const [attachMenuStyle, setAttachMenuStyle] = useState<React.CSSProperties | null>(null);
  const [composerSources, setComposerSources] = useState<ChatComposerSource[]>([]);
  const composerSourcesKey = composerSourcesStorageKey(sessionUserId, effectiveWsId);
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
  const [localActivePlanId, setLocalActivePlanId] = useState<string | null>(null);
  const [isModeOpen, setIsModeOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);

  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [composerToast, setComposerToast] = useState<string | null>(null);
  /** Structured BrowserView selection — appended to next Agent Sam message as JSON context. */
  const [browserElementContext, setBrowserElementContext] = useState<Record<string, unknown> | null>(null);
  /** Latest DOM pick — silent attach for Agent Sam (no composer tokens). */
  const pickedElementRef = useRef<Record<string, unknown> | null>(null);
  /** Latest `iam-browser-surface-context` from BrowserView (URL, route, viewport). */
  const browserSurfaceRef = useRef<Record<string, unknown> | null>(null);
  /** Latest `iam-database-surface-context` from DatabasePage. */
  const databaseSurfaceRef = useRef<Record<string, unknown> | null>(null);
  /** Latest `iam-designstudio-surface-context` from DesignStudioPage. */
  const designStudioSurfaceRef = useRef<Record<string, unknown> | null>(null);
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
  const totalStagedBytes = useMemo(
    () => attachments.reduce((sum, a) => sum + (a.file.size || 0), 0),
    [attachments]
  );

  useEffect(() => {
    if (!composerToast) return;
    const t = window.setTimeout(() => setComposerToast(null), 4500);
    return () => clearTimeout(t);
  }, [composerToast]);
  const [composerDragging, setComposerDragging] = useState(false);
  const composerDragDepthRef = useRef(0);
  const [conversationId, setConversationId] = useState<string>(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(LS_AGENT_CHAT_CONVERSATION_ID) || '' : ''
  );
  const [threadTitle, setThreadTitle] = useState<string>('');

  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_MQ).matches
  );
  const resolvedActivePlanId = useMemo(
    () =>
      activePlanId?.trim() ||
      localActivePlanId?.trim() ||
      activePlanIdRef.current?.trim() ||
      null,
    [activePlanId, localActivePlanId],
  );
  useEffect(() => {
    activePlanIdRef.current = resolvedActivePlanId;
  }, [resolvedActivePlanId]);
  const [runPlanBusy, setRunPlanBusy] = useState(false);
  const [planIntakeBusy, setPlanIntakeBusy] = useState(false);
  const [planSuggestDismissed, setPlanSuggestDismissed] = useState(false);
  const [activePlanTitle, setActivePlanTitle] = useState<string | null>(null);
  const [mobileHubTab, setMobileHubTab] = useState<'agents' | 'automations' | 'dashboard'>('agents');
  const [mobileThreadTab, setMobileThreadTab] = useState<'chat' | 'context'>('chat');
  const [mobileContextFocusId, setMobileContextFocusId] = useState<string | null>(null);
  const [repoDrawerOpen, setRepoDrawerOpen] = useState(false);
  const [contextHubOpen, setContextHubOpen] = useState(false);
  const [contextHubInitialLane, setContextHubInitialLane] = useState<ContextHubLane>('hub');
  const [execLane, setExecLane] = useState<ExecLane>(() =>
    readStoredExecLane(detectClientSurface(), isPlatformOperatorFromPolicy(agentsamPolicy)),
  );
  const [githubRepoContext, setGithubRepoContext] = useState<string | null>(null);
  const [chatGithubFilePath, setChatGithubFilePath] = useState<string | null>(null);
  const [chatGithubBranch, setChatGithubBranch] = useState('main');
  const [chatGithubFileContent, setChatGithubFileContent] = useState<string | null>(null);
  const [chatGithubContentTruncated, setChatGithubContentTruncated] = useState(false);
  const [chatGithubContentSha, setChatGithubContentSha] = useState<string | null>(null);
  const [runtimeChecks, setRuntimeChecks] = useState<
    { id: string; ok: boolean; label: string; providerKey?: string; iconSlug?: string }[]
  >([]);
  const [runtimeChecksLoading, setRuntimeChecksLoading] = useState(false);

  const refreshRuntimeChecks = useCallback(async () => {
    setRuntimeChecksLoading(true);
    const rows: { id: string; ok: boolean; label: string; providerKey?: string; iconSlug?: string }[] =
      [];
    try {
      const [wr, sr, gr, wg] = await Promise.all([
        fetch('/api/health', { credentials: 'same-origin' }),
        fetch('/api/sandbox/health', { credentials: 'same-origin' }),
        fetch('/api/mail/gmail/status', { credentials: 'same-origin' }),
        fetch('/api/terminal/wrangler-guide?lane=sandbox', { credentials: 'same-origin' }),
      ]);
      const wj = await wr.json().catch(() => ({}));
      rows.push({
        id: 'worker',
        ok: wr.ok && wj.status === 'ok',
        label: 'Worker',
        iconSlug: 'cloudflare',
      });
      const sj = await sr.json().catch(() => ({}));
      rows.push({
        id: 'sandbox',
        ok: sr.ok && sj.ok === true,
        label: 'CF sandbox',
        providerKey: 'cloudflare_oauth',
        iconSlug: 'cloudflare',
      });
      const gj = await gr.json().catch(() => ({}));
      rows.push({
        id: 'gmail',
        ok: gr.ok && !!gj.connected,
        label: 'Gmail',
        providerKey: 'gmail',
        iconSlug: 'gmail',
      });
      const wgj = await wg.json().catch(() => ({}));
      const whoamiOk =
        wg.ok &&
        wgj.wrangler_whoami?.ok === true &&
        !/Unable to authenticate|Not logged in/i.test(
          `${wgj.wrangler_whoami?.stdout ?? ''}${wgj.wrangler_whoami?.stderr ?? ''}`,
        );
      rows.push({
        id: 'wrangler',
        ok: whoamiOk,
        label: 'Wrangler',
        providerKey: 'cloudflare_oauth',
        iconSlug: 'cloudflare',
      });
    } catch {
      rows.push({ id: 'worker', ok: false, label: 'Worker', iconSlug: 'cloudflare' });
    }
    setRuntimeChecks(rows);
    setRuntimeChecksLoading(false);
  }, []);

  const saveGithubRepoSelection = useCallback(
    (
      full: string,
      filePath?: string | null,
      branch = 'main',
      fileMeta?: {
        content?: string | null;
        contentSha?: string | null;
        contentTruncated?: boolean;
      },
    ) => {
      setGithubRepoContext(full);
      if (filePath !== undefined) {
        setChatGithubFilePath(filePath?.trim() || null);
        if (!filePath?.trim()) {
          setChatGithubFileContent(null);
          setChatGithubContentTruncated(false);
          setChatGithubContentSha(null);
        }
      }
      setChatGithubBranch(branch.trim() || 'main');
      if (fileMeta !== undefined) {
        setChatGithubFileContent(fileMeta.content?.trim() ? fileMeta.content : null);
        setChatGithubContentTruncated(!!fileMeta.contentTruncated);
        setChatGithubContentSha(fileMeta.contentSha?.trim() || null);
      }
      const key = chatGithubContextStorageKey(sessionUserId, effectiveWsId, conversationId);
      writeChatGithubContext(key, {
        repo: full,
        path: filePath?.trim() || null,
        branch: branch.trim() || 'main',
        content: fileMeta?.content?.trim() || null,
        content_truncated: fileMeta?.contentTruncated ?? false,
        content_sha: fileMeta?.contentSha?.trim() || null,
      });
    },
    [sessionUserId, effectiveWsId, conversationId],
  );

  const openContextHub = useCallback((lane: ContextHubLane = 'hub') => {
    setContextHubInitialLane(lane);
    setContextHubOpen(true);
    setAttachMenuOpen(false);
    setIsModeOpen(false);
    setIsModelPickerOpen(false);
  }, []);

  const openRepoPicker = useCallback(() => {
    if (isNarrow) openContextHub('github');
    else setRepoDrawerOpen(true);
  }, [isNarrow, openContextHub]);

  const handleExecLaneChange = useCallback((lane: ExecLane) => {
    setExecLane(lane);
    writeStoredExecLane(lane);
  }, []);

  const { setQuestionsIntake } = useEditor();
  const lastQuestionsBatchIdRef = useRef<string | null>(null);

  const clearBrowserElementContext = useCallback(() => {
    setBrowserElementContext(null);
    setInput((prev) => prev.replace(/@browser(?::[^\s@]+)?\s*/g, ' ').replace(/\s+/g, ' ').trim());
  }, []);

  const attachBrowserSelectionToComposer = useCallback((detail: Record<string, unknown>) => {
    const ctx = { ...detail, type: 'browser_element_selected' };
    setBrowserElementContext(ctx);
    const token = browserElementMentionToken(ctx);
    const insert = `@${token} `;
    setInput((prev) => {
      if (new RegExp(`@${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(prev)) return prev;
      const base = prev.replace(/@browser(?::[^\s@]+)?\s*/g, ' ').trim();
      return base ? `${base} ${insert}` : insert;
    });
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
      syncComposerTextareaHeight(
        el,
        isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE,
      );
    });
  }, [isNarrow]);

  const attachBrowserSelectionSilently = useCallback((detail: Record<string, unknown>) => {
    pickedElementRef.current = { ...detail, type: 'browser_element_selected' };
  }, []);

  useEffect(() => {
    const onLegacy = (ev: Event) => {
      const d = (ev as CustomEvent<Record<string, unknown>>).detail;
      if (d && typeof d === 'object' && d.type === 'browser_element_selected') {
        attachBrowserSelectionSilently(d);
      }
    };
    const onSelectedBridge = (ev: Event) => {
      const d = (ev as CustomEvent<Record<string, unknown>>).detail;
      if (d && typeof d === 'object') {
        attachBrowserSelectionSilently(d);
      }
    };
    const onContextAttach = (ev: Event) => {
      const d = (ev as CustomEvent<{ browser_element?: Record<string, unknown> }>).detail;
      if (d?.browser_element && typeof d.browser_element === 'object') {
        pickedElementRef.current = d.browser_element;
      }
    };
    window.addEventListener('iam:browser-element-selected', onLegacy as EventListener);
    window.addEventListener('iam:browser-selected-element', onSelectedBridge as EventListener);
    window.addEventListener('iam:agent-context-attach', onContextAttach as EventListener);
    return () => {
      window.removeEventListener('iam:browser-element-selected', onLegacy as EventListener);
      window.removeEventListener('iam:browser-selected-element', onSelectedBridge as EventListener);
      window.removeEventListener('iam:agent-context-attach', onContextAttach as EventListener);
    };
  }, [attachBrowserSelectionSilently]);

  useEffect(() => {
    const onSurface = (ev: Event) => {
      const d = (ev as CustomEvent<Record<string, unknown>>).detail;
      if (d && typeof d === 'object') browserSurfaceRef.current = d;
    };
    const onDatabaseSurface = (ev: Event) => {
      const d = (ev as CustomEvent<Record<string, unknown>>).detail;
      if (d && typeof d === 'object') databaseSurfaceRef.current = d;
    };
    const onDesignStudioSurface = (ev: Event) => {
      const d = (ev as CustomEvent<Record<string, unknown>>).detail;
      if (d && typeof d === 'object') designStudioSurfaceRef.current = d;
    };
    window.addEventListener('iam-browser-surface-context', onSurface as EventListener);
    window.addEventListener('iam-database-surface-context', onDatabaseSurface as EventListener);
    window.addEventListener('iam-designstudio-surface-context', onDesignStudioSurface as EventListener);
    return () => {
      window.removeEventListener('iam-browser-surface-context', onSurface as EventListener);
      window.removeEventListener('iam-database-surface-context', onDatabaseSurface as EventListener);
      window.removeEventListener(
        'iam-designstudio-surface-context',
        onDesignStudioSurface as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (!agentsamPolicy) return;
    const ar = String(agentsamPolicy.auto_run_mode || '').toLowerCase();
    if (ar === 'disabled' || ar === 'manual') setMode('ask');
    else if (ar === 'allowlist' || ar === 'auto') setMode('agent');
  }, [agentsamPolicy]);

  useEffect(() => {
    if (!agentsamPolicy || typeof window === 'undefined') return;
    const surface = detectClientSurface();
    if (!surface.startsWith('mobile') || !isPlatformOperatorFromPolicy(agentsamPolicy)) return;
    try {
      const stored = localStorage.getItem(LS_EXEC_LANE_MOBILE);
      if (!stored) setExecLane('remote');
    } catch {
      /* ignore */
    }
  }, [agentsamPolicy]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(PHONE_MQ);
    const u = () => setIsNarrow(mq.matches);
    mq.addEventListener('change', u);
    return () => mq.removeEventListener('change', u);
  }, []);

  useEffect(() => {
    console.log('[ChatAssistant] canonical mounted agent-app-sse-v1');
  }, []);

  useEffect(() => {
    const convId = conversationId.trim();
    if (convId) {
      const draftKey = chatGithubContextStorageKey(sessionUserId, effectiveWsId, 'draft');
      const chatKey = chatGithubContextStorageKey(sessionUserId, effectiveWsId, convId);
      const draft = readChatGithubContext(draftKey);
      const existing = readChatGithubContext(chatKey);
      if (draft?.repo && !existing?.repo) {
        writeChatGithubContext(chatKey, draft);
      }
    }
    const chatKey = chatGithubContextStorageKey(sessionUserId, effectiveWsId, conversationId);
    let ctx = readChatGithubContext(chatKey);
    if (!ctx?.repo && effectiveWsId) {
      const legacyKey = githubRepoContextStorageKey(sessionUserId, effectiveWsId);
      ctx = readChatGithubContext(legacyKey);
    }
    if (!ctx?.repo && effectiveWsId) {
      const row = workspaces.find((w) => w.id === effectiveWsId);
      const wsRepo = row?.github_repo?.trim();
      if (wsRepo) ctx = { repo: wsRepo, path: null, branch: 'main' };
    }
    setGithubRepoContext(ctx?.repo?.trim() || null);
    setChatGithubFilePath(ctx?.path?.trim() || null);
    setChatGithubBranch(ctx?.branch?.trim() || 'main');
    setChatGithubFileContent(ctx?.content?.trim() || null);
    setChatGithubContentTruncated(!!ctx?.content_truncated);
    setChatGithubContentSha(ctx?.content_sha?.trim() || null);
  }, [sessionUserId, effectiveWsId, conversationId, workspaces]);

  useEffect(() => {
    syncComposerTextareaHeight(
      textareaRef.current,
      isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE,
    );
  }, [isNarrow]);

  const [sessions, setSessions] = useState<AgentSessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const hydratedFromLsRef = useRef(false);
  const sessionsLoadInFlightRef = useRef<Promise<void> | null>(null);

  const loadSessions = useCallback(async () => {
    if (sessionsLoadInFlightRef.current) return sessionsLoadInFlightRef.current;
    const run = (async () => {
      setSessionsLoading(true);
      try {
        const r = await fetch('/api/agent/sessions', { credentials: 'same-origin' });
        const data = r.ok ? await r.json() : [];
        setSessions(Array.isArray(data) ? (data as AgentSessionRow[]) : []);
      } catch {
        setSessions([]);
      } finally {
        setSessionsLoading(false);
      }
    })();
    sessionsLoadInFlightRef.current = run;
    try {
      await run;
    } finally {
      if (sessionsLoadInFlightRef.current === run) sessionsLoadInFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions, conversationId]);

  useEffect(() => {
    void fetch('/api/projects', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : rows?.projects || [];
        setChatProjects(
          list
            .map((p: { id?: string; name?: string; chat_project_id?: string | null }) => ({
              id: String(p.id || '').trim(),
              name: String(p.name || 'Project').trim(),
              chat_project_id: p.chat_project_id ?? null,
            }))
            .filter((p: AgentChatProjectOption) => p.id),
        );
      })
      .catch(() => setChatProjects([]));
  }, [conversationId]);

  useEffect(() => {
    setMobileThreadTab('chat');
    setMobileContextFocusId(null);
  }, [conversationId]);

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

  const resetFreshChatContext = useCallback(() => {
    applyFreshChatSessionDefaults({
      composerSourcesKey,
      githubContextStorageKey: chatGithubContextStorageKey(sessionUserId, effectiveWsId, ''),
      onClearGithubState: () => {
        setGithubRepoContext(null);
        setChatGithubFilePath(null);
        setChatGithubBranch('main');
        setChatGithubFileContent(null);
        setChatGithubContentTruncated(false);
        setChatGithubContentSha(null);
      },
      onClearAttachments: () => setAttachments([]),
    });
    setComposerSources([]);
    setExecLane('auto');
    writeStoredExecLane('auto');
  }, [composerSourcesKey, sessionUserId, effectiveWsId]);

  const handleNewChat = useCallback(() => {
    setMobileThreadTab('chat');
    setThreadTitle('New Chat');
    setPythonDraftHint(null);
    if (onAgentChatShellNewTab) {
      resetFreshChatContext();
      onAgentChatShellNewTab();
      return;
    }
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
    setConversationId('');
    resetFreshChatContext();
    window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id: null } }));
  }, [onAgentChatShellNewTab, resetFreshChatContext]);

  useEffect(() => {
    const onExternal = (e: Event) => {
      const raw = (e as CustomEvent<{ id?: string | null }>).detail?.id;
      if (raw === null || raw === undefined) {
        setMobileThreadTab('chat');
        setThreadTitle('New Chat');
        if (typeof localStorage !== 'undefined') localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
        setConversationId('');
        resetFreshChatContext();
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

    const onMobileCodeFocus = () => {
      onOpenCodeTab?.();
    };
    window.addEventListener(IAM_AGENT_MOBILE_CODE_FOCUS, onMobileCodeFocus);
    
    const onExternalSend = (e: Event) => {
      const detail = (e as CustomEvent<QuickstartThreadDetail>).detail;
      const msg = detail?.message?.trim();
      if (!msg) return;
      void handleSendRef.current(msg, routingSendOptsFromDetail(detail));
    };
    window.addEventListener('iam-agent-external-send', onExternalSend);

    const onNewThreadMessage = (e: Event) => {
      const detail = (e as CustomEvent<QuickstartThreadDetail>).detail;
      const msg = detail?.message?.trim();
      if (!msg) return;
      if (detail.ensureAgentPanel !== false) return;
      setMobileThreadTab('chat');
      setThreadTitle('New Chat');
      setPythonDraftHint(null);
      queueMicrotask(() => {
        void handleSendRef.current(msg, routingSendOptsFromDetail(detail));
      });
    };
    window.addEventListener(IAM_AGENT_CHAT_NEW_THREAD, onNewThreadMessage);

    const onCompose = (e: Event) => {
      const detail = (e as CustomEvent<AgentChatComposeDetail>).detail;
      const msg = detail?.message ?? '';
      if (!msg) return;
      if (detail?.send) {
        void handleSendRef.current(msg.trim(), routingSendOptsFromDetail(detail as QuickstartThreadDetail));
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
      window.removeEventListener(IAM_AGENT_MOBILE_CODE_FOCUS, onMobileCodeFocus);
      window.removeEventListener('iam-agent-external-send', onExternalSend);
      window.removeEventListener(IAM_AGENT_CHAT_NEW_THREAD, onNewThreadMessage);
      window.removeEventListener(IAM_AGENT_CHAT_COMPOSE, onCompose);
    };
  }, [isNarrow, resetFreshChatContext, onOpenCodeTab]);

  const [pendingToolApproval, setPendingToolApproval] = useState<{
    tool: ToolApprovalPayload;
  } | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);

  useEffect(() => {
    setComposerSources(readComposerSources(composerSourcesKey));
  }, [composerSourcesKey]);

  useEffect(() => {
    writeComposerSources(composerSourcesKey, composerSources);
  }, [composerSourcesKey, composerSources]);

  const policyWebSearch = Number(agentsamPolicy?.web_search_enabled ?? 1) === 1;

  const activeComposerSourceIds = useMemo(
    () => new Set(composerSources.map((s) => s.id)),
    [composerSources],
  );

  const toggleComposerSource = useCallback((source: ChatComposerSource, enabled: boolean) => {
    setComposerSources((prev) => {
      if (enabled) {
        if (prev.some((s) => s.id === source.id)) return prev;
        return [...prev, source];
      }
      return prev.filter((s) => s.id !== source.id);
    });
  }, []);

  const sourceFromConnector = useCallback(
    (item: ComposerAvailableConnector): ChatComposerSource => ({
      id: `oauth:${item.providerKey}`,
      label: item.name,
      kind: 'oauth',
      providerKey: item.providerKey,
    }),
    [],
  );

  const startWebSearchLane = useCallback(() => {
    if (policyWebSearch) toggleComposerSource(WEB_SEARCH_SOURCE, true);
    setInput((prev) => (prev.trim() ? prev : 'Search the web for: '));
    if (mode === 'ask') setMode('agent');
    textareaRef.current?.focus();
  }, [policyWebSearch, toggleComposerSource, mode]);

  const startImageGenerationPrompt = useCallback(() => {
    setInput('Generate an image of ');
    pendingSubagentSlugRef.current = 'genmedia_image_gen';
    textareaRef.current?.focus();
  }, []);

  const startDeepResearchPrompt = useCallback(() => {
    setMode('plan');
    setInput((prev) => (prev.trim() ? prev : 'Research in depth: '));
    textareaRef.current?.focus();
  }, []);

  const removeComposerSource = useCallback((id: string) => {
    setComposerSources((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const scrollToPendingApproval = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, []);
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

  const activePlanRunningCount = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'assistant' || !m.executionPlan?.tasks?.length) continue;
      return m.executionPlan.tasks.filter((t) => t.status === 'running').length;
    }
    return 0;
  }, [messages]);

  const { presence } = useAgentPresence({
    isLoading,
    mode,
    thinkingState,
    pendingToolApproval,
    approvalBusy,
    toolTraceRows,
    workflowLedger,
    draftSyntaxBusy,
    draftRunBusy,
    subagentWork: activeSubagents[0]
      ? { state: activeSubagents[0].state, detail: activeSubagents[0].label }
      : null,
    activePlanRunningCount,
  });

  useEffect(() => {
    setPresenceState(presence.state);
  }, [presence.state]);

  useEffect(() => {
    if (isLoading) {
      setLoadingStartedAt((t) => t ?? Date.now());
      return;
    }
    setLoadingStartedAt(null);
  }, [isLoading]);

  const heroThinking = deriveHeroThinkingState({
    thinkingState,
    isLoading,
    presence,
    loadingStartedAt,
    pendingApproval: !!pendingToolApproval,
  });

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
  const selectedModelKeyRef = useRef(selectedModelKey);
  const userPinnedModelRef = useRef(!isAutoModelSelection(selectedModelKey));
  selectedModelKeyRef.current = selectedModelKey;

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
    setAttachMenuStyle(measureBelowComposerAnchor(composerGlassRef.current, 480));
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

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const node = e.target as Node;
      if (attachButtonRef.current?.contains(node)) return;
      if (attachMenuRef.current?.contains(node)) return;
      setAttachMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAttachMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [attachMenuOpen]);

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
    if (!chatModels.length) return;
    if (userPinnedModelRef.current && !isAutoModelSelection(selectedModelKeyRef.current)) return;
    setSelectedModelKey((prev) => {
      if (isAutoModelSelection(prev)) return AUTO_MODEL_KEY;
      if (prev && chatModels.some((m) => m.model_key === prev)) return prev;
      return AUTO_MODEL_KEY;
    });
  }, [chatModels]);

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
    const items: PickerItem[] = [
      { id: 'browser:surface', label: 'browser', kind: 'browser' },
    ];
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

  const assistantStreaming = useMemo(() => {
    const last = displayMessages[displayMessages.length - 1];
    return last?.role === 'assistant' && typeof last.content === 'string' && last.content.trim().length > 0;
  }, [displayMessages]);

  const effectiveThinking = thinkingState ?? heroThinking;

  const showInlinePresence = useMemo(() => {
    if (!isLoading || !effectiveThinking) return false;
    if (effectiveThinking.status === 'done' || effectiveThinking.status === 'error') return false;
    if (assistantStreaming) return false;
    if (pendingToolApproval) return false;
    return (
      effectiveThinking.status === 'thinking' ||
      effectiveThinking.status === 'working' ||
      effectiveThinking.status === 'blocked'
    );
  }, [isLoading, effectiveThinking, assistantStreaming, pendingToolApproval]);

  const showHeaderPresence =
    isLoading && !showInlinePresence && !isNarrow && presence.state !== 'idle';

  const showEmptyThreadPlaceholder = useMemo(() => {
    if (displayMessages.length === 0) return true;
    return displayMessages.every(
      (m) => m.role === 'assistant' && isAgentSamEmptyThreadGreeting(m.content)
    );
  }, [displayMessages]);

  const mobileAgentHomeMode =
    isNarrow &&
    mobileHubTab === 'agents' &&
    mobileThreadTab === 'chat' &&
    showEmptyThreadPlaceholder &&
    !conversationId.trim();

  const activeSessionRow = useMemo(
    () => findSessionRow(sessions, conversationId),
    [sessions, conversationId],
  );

  const showThreadHeader = useMemo(() => {
    if (mobileAgentHomeMode) return false;
    if (showEmptyThreadPlaceholder && !conversationId.trim()) return false;
    return true;
  }, [mobileAgentHomeMode, showEmptyThreadPlaceholder, conversationId]);

  const openAgentGeneratedFile = useCallback(
    (file: AgentGeneratedFile) => {
      if (file.content) {
        onFileSelect?.({
          name: file.filename,
          content: file.content,
          workspacePath: file.workspacePath,
        });
        return;
      }
      if (file.r2Url) {
        void fetch(file.r2Url, { credentials: 'include' })
          .then((r) => r.text())
          .then((content) =>
            onFileSelect?.({
              name: file.filename,
              content,
              workspacePath: file.workspacePath,
            }),
          )
          .catch((e) => console.warn('[ChatAssistant] scratchpad open failed', e));
      }
    },
    [onFileSelect],
  );

  const renderThreadHeader = (compact = false, embedded = false, mobileThreadChrome = false) =>
    showThreadHeader ? (
      <>
        <AgentChatThreadHeader
          conversationId={conversationId}
          threadTitle={threadTitle}
          session={activeSessionRow}
          projects={chatProjects}
          onTitleChange={setThreadTitle}
          onReloadSessions={loadSessions}
          onDeletedActive={onDeleteActiveChat}
          onNewChat={handleNewChat}
          onToggleScratchpad={handleToggleScratchpad}
          scratchpadOpen={scratchpadOpen}
          scratchpadFileCount={scratchpadFileCount}
          compact={compact}
          embedded={embedded}
          mobileThreadChrome={mobileThreadChrome}
          onView={mobileThreadChrome ? () => onOpenCodeTab?.() : undefined}
        />
        {scratchpadOpen && isNarrow && !embedded ? (
          <AgentChatFilesPanel
            messages={displayMessages}
            stagedCount={attachments.length}
            onAttach={() => {
              setAttachMenuOpen(true);
              textareaRef.current?.focus();
            }}
            onClose={handleToggleScratchpad}
            onOpenFile={openAgentGeneratedFile}
          />
        ) : null}
      </>
    ) : null;

  const shellTabsVisible =
    showAgentWorkbenchTabs &&
    Boolean(onAgentChatShellNewTab && agentChatShellTabs && agentChatShellTabs.length > 0);

  const renderShellTabStrip = (className = '') =>
    shellTabsVisible ? (
      <div
        className={`flex items-center gap-1 min-w-0 overflow-x-auto chat-hide-scroll [scrollbar-width:none] ${className}`}
      >
        {agentChatShellTabs!.map((tab) => (
          <div
            key={tab.id}
            className={`group/tab flex items-center shrink-0 max-w-[min(176px,40vw)] rounded-md border transition-colors ${
              tab.id === activeAgentChatShellTabId
                ? 'bg-[var(--scene-bg)] border-[var(--dashboard-border)]'
                : 'border-transparent hover:bg-[var(--bg-hover)]'
            }`}
          >
            <button
              type="button"
              onClick={() => onAgentChatShellTabSelect?.(tab.id)}
              className={`min-w-0 flex-1 truncate px-2 sm:px-2.5 py-1 text-[11px] font-medium text-left transition-colors ${
                tab.id === activeAgentChatShellTabId
                  ? 'text-[var(--solar-cyan)]'
                  : 'text-[var(--dashboard-muted)] group-hover/tab:text-[var(--dashboard-text)]'
              }`}
              title={tab.title}
            >
              {tab.title}
            </button>
            {onAgentChatShellTabClose ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAgentChatShellTabClose(tab.id);
                }}
                className="shrink-0 mr-0.5 p-0.5 rounded text-[var(--dashboard-muted)] opacity-70 hover:opacity-100 hover:text-[var(--dashboard-text)] hover:bg-[var(--bg-hover)]"
                title="Close chat"
                aria-label={`Close ${tab.title}`}
              >
                <X size={11} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={handleNewChat}
          className="shrink-0 p-1 rounded-md text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)] hover:bg-[var(--bg-hover)] border border-transparent"
          title="New chat"
          aria-label="New chat"
        >
          <Plus size={14} strokeWidth={1.75} />
        </button>
      </div>
    ) : null;

  useEffect(() => {
    if (!conversationId.trim()) return;
    const row = sessions.find((s) => s.id === conversationId || s.conversation_id === conversationId);
    const n = row ? sessionDisplayTitle(row) : '';
    if (n && n !== 'New chat') setThreadTitle(n);
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

  const handleComposerPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const fileItems: File[] = [];
    for (const item of cd.items) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) fileItems.push(f);
      }
    }
    if (fileItems.length) {
      e.preventDefault();
      const dt = new DataTransfer();
      fileItems.forEach((f) => dt.items.add(f));
      const allImages = fileItems.every(
        (f) => !String(f.type || '').trim() || String(f.type).startsWith('image/'),
      );
      addFilesFromList(dt.files, allImages);
      return;
    }
    const text = cd.getData('text/plain');
    if (!text) return;
    const el = e.currentTarget;
    const start = el.selectionStart ?? input.length;
    const end = el.selectionEnd ?? input.length;
    e.preventDefault();
    const next = input.slice(0, start) + text + input.slice(end);
    const caret = start + text.length;
    insertAtCursor(next, caret, caret);
  };

  const addFilesFromList = (list: FileList | null, asImage: boolean) => {
    if (!list?.length) return;
    Array.from(list).forEach((file) => {
      const id = crypto.randomUUID();
      const isImg = asImage || isImageAttachmentFile(file);
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

  const appendSpeechToInput = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      setInput((prev) => {
        const sep = prev && !prev.endsWith(' ') ? ' ' : '';
        return prev + sep + t;
      });
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          syncComposerTextareaHeight(
            el,
            isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE,
          );
        }
      });
    },
    [isNarrow],
  );

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
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 202 && (data.approval_id || data.command_run_id)) {
          onApprovalRequired?.(data.command_run_id || data.approval_id);
        }
        let dispatchPayload: Record<string, unknown> | null = null;
        if (typeof data?.output_text === 'string') {
          try {
            dispatchPayload = JSON.parse(data.output_text) as Record<string, unknown>;
          } catch {
            dispatchPayload = null;
          }
        } else if (data && typeof data === 'object') {
          dispatchPayload = data as Record<string, unknown>;
        }
        const threadMsg =
          typeof dispatchPayload?.user_message === 'string'
            ? dispatchPayload.user_message
            : null;
        if (dispatchPayload?.plan_mode === true || dispatchPayload?.force_plan_mode === true) {
          setMode('plan');
          setPlanSuggestDismissed(true);
        }
        if (threadMsg) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: threadMsg, id: `slash-${Date.now()}` },
          ]);
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


  const handleSubagentEvent = useCallback(
    (ev: {
      type: string;
      fanout_id?: string;
      subagent_slug?: string;
      subagent_run_id?: string;
      status?: string;
      conversation_id?: string;
      task_title?: string;
    }) => {
      const t = String(ev.type || '');
      const slug = ev.subagent_slug ? ev.subagent_slug.replace(/^agentsam_/i, '') : 'subagent';
      const id = ev.subagent_run_id || `${slug}-${ev.fanout_id || 'fanout'}`;
      const label = (ev.task_title || slug).slice(0, 40);

      if (t === 'agentsam_subagent_fanout_result' || (t === 'agentsam_subagent_run_result' && ev.status !== 'running')) {
        setActiveSubagents((prev) => prev.filter((r) => r.id !== id));
        return;
      }

      const state =
        t === 'agentsam_subagent_fanout_started'
          ? 'multitask_fanout'
          : t === 'agentsam_subagent_run_started'
            ? 'subagent_spawn'
            : t === 'agentsam_subagent_run_progress'
              ? 'parallel_work'
              : t === 'agentsam_subagent_action_required'
                ? 'approval_required'
                : 'delegate_subtask';

      setActiveSubagents((prev) => {
        const existing = prev.find((r) => r.id === id);
        const stepCount = (existing?.stepCount || 0) + (t === 'agentsam_subagent_run_progress' ? 1 : 0);
        const row: ActiveSubagentRow = {
          id,
          slug,
          label,
          state,
          conversationId: ev.conversation_id || existing?.conversationId || null,
          startedAt: existing?.startedAt ?? Date.now(),
          stepCount,
        };
        if (existing) return prev.map((r) => (r.id === id ? row : r));
        return [...prev, row];
      });
    },
    [],
  );

  const handleStopSubagent = useCallback(
    (_id: string) => {
      abortControllerRef.current?.abort();
      streamReaderRef.current?.cancel().catch(() => {});
      setIsLoading(false);
    },
    [],
  );

  const handleThinkingEvent = useCallback((ev: {
    type: string;
    tool_name?: string;
    text?: string;
    ok?: boolean;
    output_preview?: string;
    command_run_id?: string;
    approval_id?: string;
    plan_id?: string;
    url?: string;
    title?: string;
    reason?: string;
    live_view_url?: string;
    node_key?: string;
    execution_lane?: string;
    lane?: string;
    label?: string;
  }) => {
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
        surface: 'plan',
      });
    } else if (ev.type === 'plan_created' || ev.type === 'plan_progress') {
      if (ev.plan_id?.trim()) {
        activePlanIdRef.current = ev.plan_id.trim();
        setLocalActivePlanId(ev.plan_id.trim());
        onActivePlanChange?.(ev.plan_id.trim());
      }
      if (typeof (ev as { plan_title?: string }).plan_title === 'string') {
        setActivePlanTitle(String((ev as { plan_title?: string }).plan_title).trim() || null);
      }
      setThinkingState(prev => ({
        steps: prev?.steps ?? [],
        thinkingText: ev.text || 'Running plan…',
        status: 'working',
        startedAt: prev?.startedAt ?? Date.now(),
      }));
    } else if (ev.type === 'tool_start') {
      const id = ev.tool_name || ev.node_key || String(Date.now());
      const name = formatThinkingStepName(ev);
      setThinkingState(prev => {
        const base = prev ?? { steps: [], thinkingText: name, status: 'working', startedAt: Date.now() };
        if (base.steps.find(s => s.id === id)) return { ...base, thinkingText: name, status: 'working' };
        return {
          ...base,
          status: 'working',
          thinkingText: name,
          steps: [...base.steps, { id, name, status: 'running' as const }],
        };
      });
    } else if (ev.type === 'browser_session_starting') {
      setThinkingState(prev => {
        const base = prev ?? { steps: [], thinkingText: '', status: 'working', startedAt: Date.now() };
        return {
          ...base,
          status: 'working',
          steps: upsertThinkingStep(base.steps, {
            id: 'browser_session',
            name: formatBrowserLiveSseStepName(ev.type),
            status: 'running',
          }),
        };
      });
    } else if (ev.type === 'browser_url_committed' || ev.type === 'browser_navigated') {
      setThinkingState(prev => {
        const base = prev ?? { steps: [], thinkingText: '', status: 'working', startedAt: Date.now() };
        const label =
          ev.type === 'browser_navigated' && ev.url
            ? `Navigated to ${ev.url}`
            : formatBrowserLiveSseStepName(ev.type);
        return {
          ...base,
          status: 'working',
          steps: upsertThinkingStep(base.steps, {
            id: `browser_nav_${String(ev.url || Date.now())}`,
            name: label,
            status: 'done',
          }),
        };
      });
    } else if (ev.type === 'browser_scrolled') {
      setThinkingState(prev => {
        const base = prev ?? { steps: [], thinkingText: '', status: 'working', startedAt: Date.now() };
        const dir = String((ev as { direction?: string }).direction || 'down');
        return {
          ...base,
          status: 'working',
          steps: upsertThinkingStep(base.steps, {
            id: `browser_scroll_${dir}_${Date.now()}`,
            name: dir === 'up' ? 'Scrolled up' : 'Scrolled down',
            status: 'done',
          }),
        };
      });
    } else if (ev.type === 'browser_session_ready' || ev.type === 'browser_live_view_ready') {
      setThinkingState(prev => {
        const base = prev ?? { steps: [], thinkingText: '', status: 'working', startedAt: Date.now() };
        return {
          ...base,
          status: 'working',
          steps: upsertThinkingStep(base.steps, {
            id: 'browser_live_view',
            name: formatBrowserLiveSseStepName(ev.type),
            status: 'done',
            preview: ev.url || ev.title || ev.live_view_url || undefined,
          }),
        };
      });
    } else if (ev.type === 'browser_action_started') {
      const id = ev.tool_name ? `browser_action_${ev.tool_name}` : 'browser_action';
      setThinkingState(prev => {
        const base = prev ?? { steps: [], thinkingText: '', status: 'working', startedAt: Date.now() };
        return {
          ...base,
          status: 'working',
          steps: upsertThinkingStep(base.steps, {
            id,
            name: formatThinkingStepName(ev) || formatBrowserLiveSseStepName(ev.type),
            status: 'running',
          }),
        };
      });
    } else if (ev.type === 'browser_action_done') {
      const id = ev.tool_name ? `browser_action_${ev.tool_name}` : 'browser_action';
      setThinkingState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: upsertThinkingStep(prev.steps, {
            id,
            name: formatThinkingStepName(ev) || formatBrowserLiveSseStepName(ev.type),
            status: ev.ok === false ? 'error' : 'done',
            preview: ev.url || ev.output_preview,
          }),
        };
      });
    } else if (ev.type === 'browser_human_input_required') {
      setThinkingState(prev => {
        const base = prev ?? { steps: [], thinkingText: '', status: 'blocked', startedAt: Date.now() };
        return {
          ...base,
          status: 'blocked',
          steps: upsertThinkingStep(base.steps, {
            id: 'browser_human_input',
            name: formatBrowserLiveSseStepName(ev.type),
            status: 'blocked',
            preview: ev.reason || 'Complete the step, then click Continue.',
          }),
        };
      });
    } else if (ev.type === 'browser_human_input_resumed') {
      setThinkingState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          status: 'working',
          steps: upsertThinkingStep(prev.steps, {
            id: 'browser_human_input',
            name: formatBrowserLiveSseStepName(ev.type),
            status: 'done',
          }),
        };
      });
    } else if (ev.type === 'browser_human_input_cancelled') {
      setThinkingState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          status: 'working',
          steps: upsertThinkingStep(prev.steps, {
            id: 'browser_human_input',
            name: formatBrowserLiveSseStepName(ev.type),
            status: 'error',
          }),
        };
      });
    } else if (ev.type === 'browser_live_view_refresh') {
      setThinkingState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: upsertThinkingStep(prev.steps, {
            id: 'browser_live_view',
            name: formatBrowserLiveSseStepName(ev.type),
            status: 'done',
            preview: ev.url || ev.live_view_url,
          }),
        };
      });
    } else if (ev.type === 'browser_session_closed') {
      setThinkingState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: upsertThinkingStep(prev.steps, {
            id: 'browser_session',
            name: formatBrowserLiveSseStepName(ev.type),
            status: 'done',
          }),
        };
      });
    } else if (ev.type === 'tool_done' || ev.type === 'workflow_step') {
      const id = ev.tool_name || ev.node_key || '';
      const name = id ? formatThinkingStepName(ev) : 'Working';
      setThinkingState(prev => {
        if (!prev) return prev;
        const exists = prev.steps.find(s => s.id === id);
        const stepStatus: 'error' | 'done' = ev.ok === false ? 'error' : 'done';
        const updated = exists
          ? prev.steps.map(s => s.id === id ? { ...s, name, status: stepStatus, preview: ev.output_preview?.slice(0, 120) } : s)
          : [...prev.steps, { id, name, status: stepStatus, preview: ev.output_preview?.slice(0, 120) }];
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
  }, [onApprovalRequired, onActivePlanChange]);

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
          onSubagentEvent: handleSubagentEvent,
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

      const queueApprovalId = (tool.approval_id || tool.proposal_id || '').trim();
      if (queueApprovalId) {
        const patchRes = await fetch(`/api/agent/approval/${encodeURIComponent(queueApprovalId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ status: 'approved' }),
        });
        if (!patchRes.ok) {
          const errText = await patchRes.text().catch(() => '');
          throw new Error(errText || `Approval failed (${patchRes.status})`);
        }
      }

      const res = await fetch('/api/agent/chat/execute-approved-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          tool_name: tool.name,
          tool_input: {
            ...(tool.parameters ?? {}),
            ...(queueApprovalId ? { approval_id: queueApprovalId } : {}),
          },
          conversation_id: conversationId || undefined,
          agent_run_id: agentRunId?.trim() || undefined,
          approval_id: queueApprovalId || undefined,
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
    const queueApprovalId = (tool.approval_id || tool.proposal_id || '').trim();
    if (queueApprovalId && !tool.plan_terminal) {
      try {
        await fetch(`/api/agent/approval/${encodeURIComponent(queueApprovalId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ status: 'denied' }),
        });
      } catch (e) {
        console.warn('[ChatAssistant] approval deny', e);
      }
    }
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

  const handlePlanIntakeSubmit = useCallback(
    async (payload: {
      batchId: string;
      selections: Record<string, string>;
      optionalDetails: string;
      skip: boolean;
    }) => {
      const batchId = payload.batchId.trim();
      if (!batchId || planIntakeBusy) return;
      setPlanIntakeBusy(true);
      setMessages((prev) =>
        prev.map((m) =>
          m.planQuestionsBatch?.batch_id === batchId
            ? { ...m, planQuestionsBatch: { ...m.planQuestionsBatch, submitted: true } }
            : m,
        ),
      );
      setThinkingState({
        steps: [],
        thinkingText: payload.skip ? 'Skipping questions — creating plan…' : 'Creating plan from your answers…',
        status: 'thinking',
        startedAt: Date.now(),
        surface: 'plan',
      });
      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      streamFinalizedRef.current = false;
      setIsLoading(true);
      setPresenceState('thinking');
      try {
        const res = await fetch('/api/agent/plan/intake/submit', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batch_id: batchId,
            selections: payload.selections,
            optional_details: payload.optionalDetails,
            skip: payload.skip,
            session_id: conversationId || undefined,
            sessionId: conversationId || undefined,
          }),
          signal,
        });
        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => '');
          throw new Error(errText || `Plan intake submit failed (${res.status})`);
        }
        const reader = res.body.getReader();
        streamReaderRef.current = reader;
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
          onSubagentEvent: handleSubagentEvent,
          onAgentRunContext,
          onFileSelect: onFileSelect
            ? (f) => onFileSelect({ name: f.name, content: f.content, originalContent: f.originalContent ?? '' })
            : undefined,
          onToolApprovalRequest: (tool) => {
            setPendingToolApproval({ tool });
            setIsLoading(false);
            abortControllerRef.current = null;
          },
        });
        streamReaderRef.current = null;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        console.error('[ChatAssistant] plan intake submit', e);
        const msg = e instanceof Error ? e.message : String(e);
        setMessages((prev) => {
          const next = [...prev];
          next.push({ role: 'assistant', content: `[Plan intake failed: ${msg}]` });
          return next;
        });
        setThinkingState((prev) => (prev ? { ...prev, status: 'error' } : prev));
      } finally {
        setPlanIntakeBusy(false);
        setIsLoading(false);
        setPresenceState('idle');
        abortControllerRef.current = null;
      }
    },
    [
      planIntakeBusy,
      conversationId,
      setMessages,
      handleThinkingEvent,
      handlePythonDraftOpened,
      stripEmptyAssistantTail,
      loadSessions,
      onBrowserNavigate,
      onR2FileUpdated,
      onAgentRunContext,
      onFileSelect,
    ],
  );

  /**
   * Sync the latest plan_questions_batch into the shared EditorContext so
   * MonacoEditorView's 'questions_intake' tab can render QuestionsIntakePage
   * with live busy/onSubmit. Auto-opens the Questions tab once per new
   * batch_id; doesn't re-focus it on every render after that, so it doesn't
   * fight the user if they've switched away.
   */
  useEffect(() => {
    let latest: PlanQuestionsBatchPayload | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const candidate = messages[i]?.planQuestionsBatch;
      if (candidate) {
        latest = candidate;
        break;
      }
    }

    if (!latest) {
      if (lastQuestionsBatchIdRef.current !== null) {
        lastQuestionsBatchIdRef.current = null;
        setQuestionsIntake(null);
      }
      return;
    }

    if (latest.submitted) {
      setQuestionsIntake({ batch: latest, busy: false, onSubmit: () => {} });
      return;
    }

    setQuestionsIntake({
      batch: latest,
      busy: planIntakeBusy,
      onSubmit: (payload) => void handlePlanIntakeSubmit(payload),
    });

    if (lastQuestionsBatchIdRef.current !== latest.batch_id) {
      lastQuestionsBatchIdRef.current = latest.batch_id;
      onFileSelect?.({
        name: 'Questions',
        content: '',
        fileKind: 'questions_intake',
        workspacePath: `questions:${latest.batch_id}`,
      });
    }
  }, [messages, planIntakeBusy, handlePlanIntakeSubmit, onFileSelect, setQuestionsIntake]);

  const handleRunPlan = useCallback(async (planId: string) => {
    const pid = planId.trim();
    if (!pid || runPlanBusy) return;
    setRunPlanBusy(true);
    setLocalActivePlanId(pid);
    activePlanIdRef.current = pid;
    onActivePlanChange?.(pid);
    setThinkingState({
      steps: [],
      thinkingText: 'Running plan…',
      status: 'working',
      startedAt: Date.now(),
    });
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    streamFinalizedRef.current = false;
    setIsLoading(true);
    setPresenceState('working');
    try {
      const res = await fetch('/api/agent/plan/execute', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: pid,
          session_id: conversationId || undefined,
          sessionId: conversationId || undefined,
        }),
        signal,
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `Plan execute failed (${res.status})`);
      }
      const reader = res.body.getReader();
      streamReaderRef.current = reader;
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
        onSubagentEvent: handleSubagentEvent,
        onAgentRunContext,
        onFileSelect: onFileSelect
          ? (f) => onFileSelect({ name: f.name, content: f.content, originalContent: f.originalContent ?? '' })
          : undefined,
        onToolApprovalRequest: (tool) => {
          setPendingToolApproval({ tool });
          setIsLoading(false);
          abortControllerRef.current = null;
        },
      });
      streamReaderRef.current = null;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      console.error('[ChatAssistant] plan execute', e);
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: `${last.content}\n\n[Plan execute failed: ${msg}]` };
        } else {
          next.push({ role: 'assistant', content: `[Plan execute failed: ${msg}]` });
        }
        return next;
      });
      setThinkingState((prev) => (prev ? { ...prev, status: 'error' } : prev));
    } finally {
      setRunPlanBusy(false);
      setIsLoading(false);
      setPresenceState('idle');
      abortControllerRef.current = null;
    }
  }, [
    runPlanBusy,
    conversationId,
    setMessages,
    handleThinkingEvent,
    handlePythonDraftOpened,
    stripEmptyAssistantTail,
    loadSessions,
    onBrowserNavigate,
    onR2FileUpdated,
    onAgentRunContext,
    onFileSelect,
    onActivePlanChange,
  ]);

  const handleOpenRecentPlan = useCallback(
    async (planId: string) => {
      const pid = planId.trim();
      if (!pid) return;
      setLocalActivePlanId(pid);
      activePlanIdRef.current = pid;
      onActivePlanChange?.(pid);
      try {
        const res = await fetch(`/api/agentsam/plans/${encodeURIComponent(pid)}/markdown`, {
          credentials: 'same-origin',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const publicUrl = typeof data.public_url === 'string' ? data.public_url.trim() : '';
        if (typeof data.title === 'string' && data.title.trim()) setActivePlanTitle(data.title.trim());
        if (publicUrl) {
          const contentRes = await fetch(publicUrl, { credentials: 'same-origin' });
          const md = await contentRes.text();
          onOpenCodeTab?.();
          onFileSelect?.({
            name: `plan-${pid}.md`,
            content: md,
            originalContent: md,
          });
        }
      } catch (e) {
        console.warn('[ChatAssistant] open recent plan', e);
      }
    },
    [onActivePlanChange, onFileSelect, onOpenCodeTab],
  );

  async function handleSend(overrideMessage?: string, sendOpts?: ChatRoutingSendOpts) {
    if (pendingSubagentSlugRef.current && !sendOpts?.subagent_slug?.trim()) {
      sendOpts = { ...(sendOpts ?? {}), subagent_slug: pendingSubagentSlugRef.current };
      pendingSubagentSlugRef.current = null;
    }
    const rawText = overrideMessage ?? input;
    let text = rawText;
    let sendMode: AgentMode = mode;
    if (sendOpts?.force_plan_mode) {
      sendMode = 'plan';
      setMode('plan');
      setPlanSuggestDismissed(true);
    }
    if (isPlanSlashMessage(rawText)) {
      sendMode = 'plan';
      setMode('plan');
      setPlanSuggestDismissed(true);
      text = rawText.replace(/^\/plan\b\s*/i, '').trim();
      if (!text && !overrideMessage) {
        setInput('');
        return;
      }
    }
    const rawModelKey = (
      sendOpts?.modelKey?.trim() ||
      selectedModelKeyRef.current ||
      selectedModelKey ||
      AUTO_MODEL_KEY
    ).trim();
    const useAutoRouting = isAutoModelSelection(rawModelKey);
    const effectiveModelKey = useAutoRouting
      ? AUTO_MODEL_KEY
      : rawModelKey || chatModels[0]?.model_key || AUTO_MODEL_KEY;
    if ((!text && attachments.length === 0) || (isLoading && !overrideMessage)) return;
    const stagedAttachments = [...attachments];
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

    if (totalStagedBytes > CHAT_ATTACH_MAX_TOTAL_BYTES) {
      setComposerToast('Attachments exceed 90 MB — remove files before sending.');
      return;
    }

    const userMessage = text || '(attachment)';
    const terminalTurn =
      /\b(git|npm|wrangler|shell|status|deploy|command|whoami)\b/i.test(userMessage) ||
      execLane === 'remote' ||
      execLane === 'sandbox';
    setThinkingState({
      steps: [],
      thinkingText: terminalTurn ? 'Running command…' : 'Thinking…',
      status: terminalTurn ? 'working' : 'thinking',
      startedAt: Date.now(),
      surface: terminalTurn ? 'terminal' : null,
    });
    setPresenceState(terminalTurn ? 'terminal' : 'thinking');
    setLoadingStartedAt(Date.now());

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    streamFinalizedRef.current = false;
    const signal = abortControllerRef.current.signal;

    const sendWorkspaceId = (() => {
      const fromQuickstart = sendOpts?.workspace_id?.trim();
      if (fromQuickstart && fromQuickstart !== 'global') return fromQuickstart;
      const fromProp = workspaceId != null ? String(workspaceId).trim() : '';
      if (fromProp && fromProp !== 'global') return fromProp;
      if (typeof window === 'undefined') return '';
      const w = String((window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__ || '').trim();
      return w && w !== 'global' ? w : '';
    })();

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
    const attachmentPreviews: MessageAttachmentPreview[] = stagedAttachments.map((a) => ({
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
    // Pre-seed the assistant bubble before SSE starts — eliminates the empty-flash
    // race where the UI clears input, renders nothing, then re-renders on first SSE chunk.
    setMessages([...newMessages, { role: 'assistant', content: '' }]);
    setIsLoading(true);
    setMentionOpen(false);
    setSlashOpen(false);
    setToolTraceRows((prev) => preserveLiveCadTraceRows(prev));
    setPythonDraftHint(null);

    const attachContextFiles: Array<{ name: string; content: string }> = [];
    for (const a of stagedAttachments) {
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
          browserElementContext:
            browserElementContext && typeof browserElementContext === 'object'
              ? browserElementContext
              : null,
          contextEnvelope: buildGithubContextEnvelope({
            conversationId: conversationId.trim() || null,
            workspaceId: sendWorkspaceId || null,
            repo: githubRepoContext?.trim() || '',
            path: chatGithubFilePath,
            branch: chatGithubBranch,
            content: chatGithubFileContent,
            contentSha: chatGithubContentSha,
            contentTruncated: chatGithubContentTruncated,
          }),
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
    if (snap && !browserMentionInMessage(userMessage)) {
      messageForApi += `\n\n### BrowserView selection (structured)\n\`\`\`json\n${JSON.stringify(snap, null, 2)}\n\`\`\`\n`;
    }

    const effectiveConvId =
      sendOpts?.conversationIdOverride?.trim() ||
      conversationId ||
      (() => {
        const id = crypto.randomUUID();
        setConversationId(id);
        replaceAgentConversationUrl(id);
        try {
          localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, id);
        } catch (_) {}
        notifyAgentChatSessionsRefresh(id);
        window.setTimeout(() => void loadSessions(), 800);
        window.setTimeout(() => void loadSessions(), 2500);
        return id;
      })();
    if (sendOpts?.conversationIdOverride?.trim() && sendOpts.conversationIdOverride.trim() !== conversationId) {
      setConversationId(sendOpts.conversationIdOverride.trim());
    }
    const form = new FormData();
    form.append('message', messageForApi);
    form.append('mode', sendMode);
    form.append('agent_mode', sendMode);
    form.append('runtime_intent_mode', sendMode);
    if (resolvedActivePlanId) form.append('plan_id', resolvedActivePlanId);
    form.append('model', effectiveModelKey);
    if (!useAutoRouting) {
      const selectedModelProvider =
        chatModels.find((m) => m.model_key === effectiveModelKey)?.provider || 'anthropic';
      form.append('provider', selectedModelProvider);
    }
    form.append('conversationId', effectiveConvId);
    const sessionProject = readSessionProject();
    if (sessionProject?.id) form.append('project_id', sessionProject.id);
    form.append('contextMode', String(activeProject));
    if (designStudioSceneId?.trim()) form.append('scene_snapshot_id', designStudioSceneId.trim());
    if (designStudioBlueprintId?.trim()) form.append('blueprint_id', designStudioBlueprintId.trim());
    if (designStudioCadJobId?.trim()) form.append('cad_job_id', designStudioCadJobId.trim());
    if (sendWorkspaceId) form.append('workspace_id', sendWorkspaceId);
    if (sendOpts?.task_type?.trim()) form.append('task_type', sendOpts.task_type.trim());
    else if (
      designStudioSurfaceRef.current?.surface === 'design_studio' &&
      /\billustration_create\b|\b(openscad|freecad|model_3d)\b|\b(make|create|generate)\b.*\b(chair|model|glb|3d|object|cube)\b/i.test(
        messageForApi,
      )
    ) {
      form.append('task_type', 'cad_generation');
    }
    if (sendOpts?.route_key?.trim()) form.append('route_key', sendOpts.route_key.trim());
    else if (designStudioSurfaceRef.current?.surface === 'design_studio') {
      form.append('route_key', 'design_studio');
    } else if (dashboardRouteKey?.trim()) form.append('route_key', dashboardRouteKey.trim());
    const effectiveSubagentSlug =
      sendOpts?.subagent_slug?.trim() ||
      defaultSubagentSlug?.trim() ||
      (designStudioSurfaceRef.current?.surface === 'design_studio' ? 'cadcreator' : '') ||
      '';
    if (effectiveSubagentSlug) form.append('subagent_slug', effectiveSubagentSlug);
    if (sendOpts?.quickstart_batch?.trim()) {
      form.append('quickstart_batch', sendOpts.quickstart_batch.trim());
    }
    if (sendOpts?.quickstart_card?.trim()) {
      form.append('quickstart_card', sendOpts.quickstart_card.trim());
    }
    if (sendOpts?.apply_eto_after_run) {
      form.append('apply_eto_after_run', 'true');
    }
    if (sendOpts?.force_plan_mode) {
      form.append('force_plan_mode', 'true');
    }
    if (sendOpts?.project_slug?.trim()) form.append('project_slug', sendOpts.project_slug.trim());
    if (sendOpts?.page_id?.trim()) form.append('page_id', sendOpts.page_id.trim());
    if (sendOpts?.bootstrap_cache_key?.trim()) {
      form.append('bootstrap_cache_key', sendOpts.bootstrap_cache_key.trim());
    }
    if (sendOpts?.collab_room?.trim()) form.append('collab_room', sendOpts.collab_room.trim());
    if (sendOpts?.live_session_id?.trim()) {
      form.append('live_session_id', sendOpts.live_session_id.trim());
    }
    try {
      const browserCtxPayload: Record<string, unknown> = {
        ...(browserSurfaceRef.current && typeof browserSurfaceRef.current === 'object' ? browserSurfaceRef.current : {}),
        dashboard_route: typeof window !== 'undefined' ? window.location.pathname : '',
        dashboard_route_label: dashboardRouteLabel || null,
        dashboard_route_key: dashboardRouteKey || null,
      };
      if (snap && typeof snap === 'object') {
        browserCtxPayload.selected_element = snap;
      }
      if (databaseSurfaceRef.current && typeof databaseSurfaceRef.current === 'object') {
        browserCtxPayload.databaseContext = databaseSurfaceRef.current;
      }
      if (designStudioSurfaceRef.current && typeof designStudioSurfaceRef.current === 'object') {
        browserCtxPayload.designStudioContext = designStudioSurfaceRef.current;
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
      const picked = pickedElementRef.current;
      if (picked && typeof picked === 'object') {
        browserCtxPayload.selected_element = picked;
        browserCtxPayload.picked_element = picked;
      }
      const workspaceContextPacket = {
        ...(hostWorkspaceContext && typeof hostWorkspaceContext === 'object' ? hostWorkspaceContext : {}),
        activeTab: String(activeWorkbenchTab || 'Workspace'),
        browserUrl: browserUrlProp?.trim() || browserUrlFromSurface || null,
        openFiles: [...new Set(openFilesList)].slice(0, 32),
        plan_id: activePlanIdRef.current || null,
        workflow_run_id: workflowLedger.runId || null,
        dashboard_path: typeof window !== 'undefined' ? window.location.pathname : null,
        dashboard_route_key: dashboardRouteKey || null,
        client_surface: detectClientSurface(),
        exec_lane: execLane,
        platform_operator_lane: isPlatformOperatorFromPolicy(agentsamPolicy),
        assume_mac_local: false,
        browser_surface:
          browserSurfaceRef.current && typeof browserSurfaceRef.current === 'object'
            ? browserSurfaceRef.current
            : null,
        picked_element: picked && typeof picked === 'object' ? picked : null,
        project_slug: cmsContext?.project_slug ?? null,
        page_id: cmsContext?.page_id ?? null,
        studio_panel: cmsContext?.studio_panel ?? null,
        live_session_id: cmsContext?.live_session_id ?? null,
        collab_room: cmsContext?.collab_room ?? null,
        bootstrap_cache_key: cmsContext?.bootstrap_cache_key ?? null,
        preview_url: cmsContext?.preview_url ?? null,
        public_domain: cmsContext?.public_domain ?? null,
        cms_hosting: cmsContext?.cms_hosting ?? null,
        api_profile: cmsContext?.api_profile ?? null,
        capabilities: cmsContext?.capabilities ?? null,
        r2_bucket: cmsContext?.r2_bucket ?? null,
        r2_key: cmsContext?.r2_key ?? null,
        composer_sources: composerSources.map((s) => ({
          id: s.id,
          label: s.label,
          kind: s.kind,
          provider_key: s.providerKey ?? null,
        })),
        web_search_enabled: composerSources.some((s) => s.id === WEB_SEARCH_SOURCE_ID),
        enabled_connectors: readSessionEnabledConnectors(),
        enabled_tools: flattenSessionEnabledTools(),
        session_project_id: readSessionProject()?.id || null,
        designStudioContext:
          designStudioSurfaceRef.current && typeof designStudioSurfaceRef.current === 'object'
            ? designStudioSurfaceRef.current
            : null,
      };
      browserCtxPayload.workspaceContext = workspaceContextPacket;
      form.append('workspaceContext', JSON.stringify(workspaceContextPacket));
      form.append('browserContext', JSON.stringify(browserCtxPayload));
      pickedElementRef.current = null;
    } catch {
      /* ignore */
    }
    for (const a of stagedAttachments) {
      const uploadFile = await resolveAttachmentFileForUpload(a);
      if (a.type === 'image' || isImageAttachmentFile(uploadFile)) {
        form.append('images', uploadFile, uploadFile.name || 'image.png');
        form.append('files', uploadFile, uploadFile.name || 'image.png');
      } else {
        form.append('files', uploadFile, uploadFile.name || 'attachment');
      }
    }
    form.append('image_handling_mode', resolveComposerImageHandlingMode(userMessage));
    clearAttachments();

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
    } else if (githubRepoContext?.trim()) {
      form.append('active_file_source', 'github');
      form.append('active_file_github_repo', githubRepoContext.trim());
      if (chatGithubFilePath?.trim()) {
        form.append('active_file_github_path', chatGithubFilePath.trim());
      }
      form.append('active_file_github_branch', chatGithubBranch.trim() || 'main');
      if (chatGithubContentSha?.trim()) {
        form.append('active_file_github_sha', chatGithubContentSha.trim());
      }
      if (chatGithubFileContent?.trim()) {
        form.append('active_file_content', chatGithubFileContent.slice(0, 48000));
      }
    }
    const ghCtxForm = githubRepoContext?.trim();
    if (ghCtxForm) form.append('github_repo_context', ghCtxForm);

    const activePathForProject =
      (activeFile ? getEditorLightweightPath(activeFile) || activeFile.name || '' : '').trim() ||
      chatGithubFilePath?.trim() ||
      '';
    const projectPayload = buildChatProjectContext({
      githubRepo: ghCtxForm || activeFile?.githubRepo || null,
      branch: activeFile?.githubBranch || chatGithubBranch || 'main',
      activeFilePath: activePathForProject || null,
    });
    form.append('project', JSON.stringify(projectPayload));
    form.append('runtime_lane', CHAT_RUNTIME_LANE_USER_APP);

    const contextEnvelopePayload = buildGithubContextEnvelope({
      conversationId: effectiveConvId,
      workspaceId: sendWorkspaceId || null,
      repo: githubRepoContext?.trim() || '',
      path: chatGithubFilePath,
      branch: chatGithubBranch,
      content: chatGithubFileContent,
      contentSha: chatGithubContentSha,
      contentTruncated: chatGithubContentTruncated,
      execLane,
    });
    if (contextEnvelopePayload?.focus?.github?.path) {
      form.append('context_envelope', JSON.stringify(contextEnvelopePayload));
    }

    const applyAssistantError = (msg: string) => {
      setMessages((prev) => [...stripEmptyAssistantTail(prev), { role: 'assistant', content: msg }]);
    };

    try {
      const streamDebugId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dbg_${Date.now()}`;
      initIamAgentStreamDebug(streamDebugId);
      const chatHeaders: Record<string, string> = {};
      if (sendWorkspaceId) chatHeaders['x-iam-workspace-id'] = sendWorkspaceId;

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
        onSubagentEvent: handleSubagentEvent,
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
          streamFinalizedRef.current = true;
          abortControllerRef.current = null;
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
      setBrowserElementContext(null);
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
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      setMode((m) => nextAgentMode(m));
      setIsModeOpen(false);
      return;
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
  const mobileActiveAgentThread = mobileAgentsThread && Boolean(conversationId.trim());
  const showMobileHubNav = isNarrow && !atmosphericHomeMode && !mobileActiveAgentThread;
  const hubBodyVisible = isNarrow && mobileHubTab !== 'agents';
  const messagesVisible =
    !mobileAgentHomeMode &&
    (!isNarrow || (mobileHubTab === 'agents' && mobileThreadTab === 'chat'));
  const contextTabVisible =
    isNarrow && mobileHubTab === 'agents' && mobileThreadTab === 'context';

  const composerVisible =
    !isNarrow || (mobileHubTab === 'agents' && mobileThreadTab === 'chat');
  const composerPortaled = Boolean(atmosphericHomeMode && composerPortalTarget);
  const centerChatComposerColumn =
    !composerPortaled &&
    !isNarrow &&
    isAgentCenterChatHome(location.pathname, location.search);
  const desktopStartupCenterMode =
    centerChatComposerColumn &&
    showEmptyThreadPlaceholder &&
    !conversationId.trim();
  const designStudioPortalStartup =
    atmosphericHomeMode &&
    composerPortaled &&
    showEmptyThreadPlaceholder &&
    !conversationId.trim();
  const entryPortalStartup = designStudioPortalStartup;
  const hideOverlayMessagesForPortalStartup =
    entryPortalStartup || (composerPortaled && showEmptyThreadPlaceholder);
  const composerFlexOrder = desktopStartupCenterMode
    ? ''
    : mobileAgentHomeMode
      ? 'order-3'
      : 'order-5';
  const showMobileRepoConnector =
    isNarrow &&
    mobileThreadTab === 'chat' &&
    composerVisible &&
    (mobileAgentsThread || atmosphericHomeMode);
  const mobileRepoConnectorLabel = (() => {
    const repo = githubRepoContext?.trim();
    if (!repo) return 'Connect GitHub repository';
    const file = chatGithubFilePath?.trim();
    if (file) {
      const short = file.length > 28 ? `…${file.slice(-27)}` : file;
      return `${repo} · ${short}`;
    }
    return repo;
  })();
  const messagesPortaled = Boolean(
    atmosphericHomeMode &&
      messagesPortalTarget &&
      messagesVisible &&
      !showEmptyThreadPlaceholder,
  );
  const composerPlaceholder = composerPlaceholderOverride ?? (composerPortaled
    ? 'Tell Agent Sam what to do'
    : mobileAgentHomeMode
      ? 'What should we work on?'
      : 'Message Agent Sam...');

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

  const modelPickerByokHint = useMemo(() => {
    const platforms = new Set<string>();
    for (const m of chatModels) {
      if (m.billing_key_source === 'byok' || m.byok_configured) continue;
      const p = (m.api_platform || m.provider || '').trim().toLowerCase();
      if (p) platforms.add(p);
    }
    return platforms;
  }, [chatModels]);

  const pickModelKey = useCallback((modelKey: string) => {
    const next = isAutoModelSelection(modelKey) ? AUTO_MODEL_KEY : modelKey.trim();
    userPinnedModelRef.current = !isAutoModelSelection(next);
    selectedModelKeyRef.current = next;
    setSelectedModelKey(next);
    try {
      localStorage.setItem(LS_AGENT_CHAT_MODEL_KEY, next);
    } catch {
      /* ignore */
    }
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
                    {isDefault && !isSession ? (
                      <span
                        className="shrink-0 rounded bg-[var(--dashboard-border)] px-1 py-0 text-[8px] font-bold uppercase tracking-wide text-[var(--dashboard-muted)]"
                        title="Workspace default model (Thompson routing when Auto is selected)"
                      >
                        Workspace default
                      </span>
                    ) : null}
                    {m.byok_configured || m.billing_key_source === 'byok' ? (
                      <span className="shrink-0 rounded border border-emerald-500/40 px-1 py-0 text-[8px] font-bold uppercase tracking-wide text-emerald-400/90">
                        BYOK
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
        {modelPickerByokHint.size > 0 ? (
          <div className="mx-2 mt-1 border-t border-[var(--dashboard-border)] pt-2">
            <p className="px-2 pb-1 text-[9px] leading-snug text-[var(--dashboard-muted)]">
              Paste your OpenAI, Anthropic, or Cloudflare AI keys to run models on your quota (BYOK).
            </p>
            <button
              type="button"
              className="mx-1 mb-1 w-[calc(100%-0.5rem)] rounded-lg border border-[var(--dashboard-border)] px-3 py-2 text-left text-[10px] font-semibold text-[var(--solar-cyan)] hover:bg-[var(--dashboard-panel)]"
              onClick={() => {
                window.location.assign('/dashboard/settings/keys');
              }}
            >
              Connect provider keys → Settings
            </button>
          </div>
        ) : null}
      </>
    ),
    [modelPickerGroups, defaultModelKey, selectedModelKey, modelPickerByokHint],
  );

  return (
    <>
      <div
        data-chat-assistant-contract="agent-app-sse-v1"
        className={`flex flex-col h-full min-h-0 max-w-full overflow-x-hidden overflow-y-hidden w-full min-w-0 ${
          atmosphericHomeMode ? 'bg-transparent pointer-events-none' : 'bg-[var(--dashboard-panel)]'
        }`}
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

        {showMobileHubNav && (
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
            {renderThreadHeader(true, false, true)}
            <div className="flex gap-2 px-3 pb-2">
              <button
                type="button"
                onClick={() => setMobileThreadTab('chat')}
                className={`flex-1 min-w-0 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                  mobileThreadTab === 'chat'
                    ? 'bg-[var(--scene-bg)] text-[var(--dashboard-text)] border border-[var(--dashboard-border)]'
                    : 'text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)] border border-transparent'
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setMobileThreadTab('context')}
                className={`flex-1 min-w-0 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                  mobileThreadTab === 'context'
                    ? 'bg-[var(--scene-bg)] text-[var(--dashboard-text)] border border-[var(--dashboard-border)]'
                    : 'text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)] border border-transparent'
                }`}
              >
                Context
              </button>
            </div>
            {showHeaderPresence ? (
              <div className="px-3 pb-2">
                <AgentPresenceStatus presence={presence} mode={mode} showBadge={false} className="opacity-95" />
              </div>
            ) : null}
          </div>
        )}

        {/* AgentPresenceLogo: built but unwired — chat header has no stable avatar slot without layout churn. */}
        {!isNarrow && !atmosphericHomeMode && (showThreadHeader || shellTabsVisible) ? (
          <div className="flex-shrink-0 flex flex-col min-w-0 border-b border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/60">
            <div className="flex items-stretch min-w-0 gap-1 sm:gap-2 overflow-x-auto chat-hide-scroll [scrollbar-width:none]">
              {showThreadHeader ? (
                <div className="flex-1 min-w-0">{renderThreadHeader(true, true)}</div>
              ) : null}
              {renderShellTabStrip('px-2 py-1 shrink-0 max-w-[min(100%,280px)] sm:max-w-none')}
            </div>
            {scratchpadOpen && isNarrow ? (
              <AgentChatFilesPanel
                messages={displayMessages}
                stagedCount={attachments.length}
                onAttach={() => {
                  setAttachMenuOpen(true);
                  textareaRef.current?.focus();
                }}
                onClose={handleToggleScratchpad}
                onOpenFile={openAgentGeneratedFile}
              />
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-1 min-h-0 overflow-hidden min-w-0">
        <div className={`flex flex-col flex-1 min-h-0 overflow-hidden min-w-0${desktopStartupCenterMode ? ' iam-chat-startup-center' : ''}`}>
        {mobileAgentHomeMode ? (
          <div className="order-2 shrink-0 flex justify-center pt-2 pb-1 px-3">
            <img
              src={
                isDarkTheme
                  ? 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/dbb316af-9c97-4959-f09f-bf58b2783d00/avatar'
                  : 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/11f6af46-0a3c-482a-abe8-83edc5a8a200/avatar'
              }
              alt="Inner Animal Media"
              width={48}
              height={48}
              className="object-contain opacity-90"
            />
          </div>
        ) : null}
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

        {messagesVisible && !desktopStartupCenterMode && !hideOverlayMessagesForPortalStartup && (() => {
          const block = (
          <>
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
            suppressEmptyPlaceholder={mobileAgentHomeMode || composerPortaled || desktopStartupCenterMode}
            displayMessages={displayMessages}
            isLoading={isLoading}
            mode={mode}
            presence={presence}
            thinkingState={effectiveThinking}
            showInlinePresence={showInlinePresence}
            isNarrow={isNarrow}
            activeSubagents={activeSubagents}
            onStopSubagent={handleStopSubagent}
            onSendUserMessage={(text) => void handleSendRef.current(text)}
            isDarkTheme={isDarkTheme}
            toolTraceRows={toolTraceRows}
            setToolTraceRows={setToolTraceRows}
            workspaceId={workspaceId ?? null}
            workflowLedger={workflowLedger}
            onFileSelect={onFileSelect}
            onRunInTerminal={onRunInTerminal}
            onImagePreview={handleChatImagePreview}
            onRunPlan={(planId) => void handleRunPlan(planId)}
            runPlanBusy={runPlanBusy}
            onPlanIntakeSubmit={(p) => void handlePlanIntakeSubmit(p)}
            planIntakeBusy={planIntakeBusy}
            pendingToolApproval={pendingToolApproval?.tool ?? null}
            approvalBusy={approvalBusy}
            onApprovePendingTool={() => void handleApprovePendingTool()}
            onDenyPendingTool={() => void handleDenyPendingTool()}
            mobileEnvelopeDiffs={isNarrow && mobileAgentsThread}
            onOpenDiffTab={() => {
              setMobileContextFocusId(null);
              setMobileThreadTab('context');
            }}
            onOpenDiffFile={(entryId) => {
              setMobileContextFocusId(entryId);
              setMobileThreadTab('context');
            }}
          />
          </>
          );
          if (messagesPortaled && messagesPortalTarget && typeof document !== 'undefined') {
            return createPortal(
              <div className="agent-home-messages-portal pointer-events-auto flex flex-col flex-1 min-h-0 overflow-hidden w-full">
                {renderThreadHeader(true)}
                {block}
              </div>,
              messagesPortalTarget,
            );
          }
          if (messagesPortaled) return null;
          return block;
        })()}

        {mobileAgentHomeMode ? (
          <div className="order-4 flex flex-col flex-1 min-h-0 overflow-hidden min-w-0">
            <AgentMobileHomePanel
              sessions={sessions}
              sessionsLoading={sessionsLoading}
              workspaces={workspaces}
              activeWorkspaceId={effectiveWsId}
              defaultRepoLabel={githubRepoContext}
              onQuickstart={onOpenQuickstart}
            />
          </div>
        ) : null}

        {contextTabVisible ? (
          <div className="order-4 flex flex-col flex-1 min-h-0 overflow-hidden border-t border-[var(--dashboard-border)]">
            <AgentMobileContextPanel
              messages={displayMessages}
              githubRepoContext={githubRepoContext}
              runtimeChecks={runtimeChecks}
              runtimeChecksLoading={runtimeChecksLoading}
              onRefreshRuntime={() => void refreshRuntimeChecks()}
              onChooseRepo={() => openRepoPicker()}
              initialExpandedId={mobileContextFocusId}
              onOpenInEditor={(file) => onFileSelect?.(file)}
            />
          </div>
        ) : null}

        {composerVisible && mode === 'plan' && resolvedActivePlanId ? (
          <div className={`${composerFlexOrder} flex-shrink-0 w-full min-w-0 max-w-full px-3 pt-1`}>
            <PlanStartOverBar
              planId={resolvedActivePlanId}
              planTitle={activePlanTitle ?? undefined}
              isNarrow={isNarrow}
              onReverted={() => {
                setMessages((prev) => [
                  ...prev,
                  {
                    role: 'assistant',
                    content: 'Plan tasks reset — blocked steps are back to **todo**. Use **Run plan** to retry.',
                  },
                ]);
              }}
              onRefineHint={() => {
                setInput((prev) => (prev.trim().startsWith('@plan') ? prev : `@plan ${prev}`.trim()));
                textareaRef.current?.focus();
              }}
            />
          </div>
        ) : null}

        {composerVisible && mode === 'plan' ? (
          <div className={`${composerFlexOrder} flex-shrink-0 w-full min-w-0 max-w-full px-3`}>
            <PlanRecentPicker
              workspaceId={effectiveWsId}
              activePlanId={resolvedActivePlanId}
              onOpenPlan={(pid) => void handleOpenRecentPlan(pid)}
              onRunPlan={(pid) => void handleRunPlan(pid)}
              runPlanBusy={runPlanBusy}
              isNarrow={isNarrow}
            />
          </div>
        ) : null}

        {composerVisible &&
        !planSuggestDismissed &&
        mode !== 'plan' &&
        suggestPlanMode(input) &&
        !isLoading ? (
          <div className={`${composerFlexOrder} flex-shrink-0 w-full min-w-0 max-w-full px-3`}>
            <div
              className={`flex items-center gap-2 rounded-xl border border-[var(--solar-cyan)]/25 bg-[var(--solar-cyan)]/8 ${
                isNarrow ? 'flex-wrap px-2.5 py-2' : 'px-3 py-2'
              }`}
            >
              <Sparkles size={14} className="shrink-0 text-[var(--solar-cyan)]" />
              <span className="min-w-0 flex-1 text-[11px] text-[var(--dashboard-text)]">
                Complex goal — try <strong>Plan mode</strong> (Shift+Tab or /plan) to explore first.
              </span>
              <button
                type="button"
                onClick={() => {
                  setMode('plan');
                  setPlanSuggestDismissed(true);
                }}
                className="rounded-full border border-[var(--solar-cyan)]/40 px-2.5 py-1 min-h-[32px] text-[10px] font-semibold text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/12"
              >
                Switch to Plan
              </button>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setPlanSuggestDismissed(true)}
                className="p-1 rounded-md text-[var(--dashboard-muted)] hover:bg-[var(--bg-hover)]"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : null}

        {composerVisible && (() => {
          const shell = (
        <div
          className={`${composerFlexOrder} iam-chat-composer-shell flex-shrink-0 w-full min-w-0 max-w-full ${
            composerPortaled || centerChatComposerColumn
              ? 'iam-chat-composer-shell--atmospheric'
              : 'px-3'
          } pt-2 space-y-2`}
          style={{
            paddingBottom:
              composerPortaled && isNarrow
                ? 'calc(3.5rem + env(safe-area-inset-bottom, 0px) + 8px)'
                : isNarrow && !mobileAgentHomeMode
                  ? MOBILE_CHAT_COMPOSER_BOTTOM_PAD
                  : dashboardComposerBottomPad(location.pathname, isNarrow, desktopStartupCenterMode ? 12 : 20),
          }}
        >
          <ToolApprovalModal
            workspaceId={workspaceId}
            agentRunId={agentRunId}
            toolExecutionActive={isLoading}
            chatSessionId={conversationId}
            onOpenInEditor={onFileSelect}
          />
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
            ref={composerGlassRef}
            className={`iam-chat-composer-glass flex flex-col rounded-xl transition-all overflow-visible ${
              composerPortaled || centerChatComposerColumn ? 'iam-chat-composer-glass--atmospheric' : ''
            } ${
              composerDragging
                ? 'border-[var(--solar-cyan)]/70 ring-1 ring-[var(--solar-cyan)]/35'
                : 'focus-within:border-[var(--solar-cyan)]/80 focus-within:ring-2 focus-within:ring-[var(--solar-cyan)]/20'
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
            {browserElementContext ? (
              <div className="flex items-center gap-2 px-2 pt-2 pb-0 min-w-0">
                <div
                  className="flex items-center gap-1.5 min-w-0 max-w-full rounded-lg border border-[var(--solar-cyan)]/35 bg-[var(--solar-cyan)]/10 pl-2 pr-1 py-1 text-[0.6875rem] font-mono text-[var(--solar-cyan)]"
                  title="Browser element attached to this message — ask what it is, how to style it, etc."
                >
                  <MousePointer2 size={12} className="shrink-0" aria-hidden />
                  <span className="truncate">
                    @{browserElementMentionToken(browserElementContext)}
                  </span>
                  <button
                    type="button"
                    aria-label="Remove browser element from message"
                    className="shrink-0 p-0.5 rounded text-[var(--dashboard-muted)] hover:text-[var(--solar-red)] hover:bg-[var(--bg-hover)]"
                    onClick={clearBrowserElementContext}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ) : null}
            <div className="px-2 pt-2 pb-0 min-w-0">
              <AgentComposerSourceChips sources={composerSources} onRemove={removeComposerSource} />
            </div>
            <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onPaste={handleComposerPaste}
                onKeyDown={onKeyDown}
                onSelect={(ev) => syncPickers(ev.currentTarget.value, ev.currentTarget.selectionStart)}
                onClick={(ev) => syncPickers(ev.currentTarget.value, ev.currentTarget.selectionStart)}
                placeholder={composerPlaceholder}
                rows={1}
                className={`w-full min-w-0 bg-transparent px-3 pt-2.5 pb-1 focus:outline-none text-[var(--dashboard-text)] placeholder:text-[var(--text-placeholder-strong)] resize-none font-sans leading-relaxed ${
                  isNarrow ? 'text-base' : 'text-[0.8125rem]'
                }`}
                style={{
                  minHeight: '44px',
                  maxHeight: isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE,
                }}
              />
            <div className="iam-composer-toolbar flex items-center justify-between gap-2 px-2 pb-2 pt-0.5 min-w-0">
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
                <AgentComposerMicButton onTranscript={appendSpeechToInput} disabled={isLoading} />
                <button
                  type="button"
                  ref={attachButtonRef}
                  className="flex-shrink-0 p-2 text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] rounded-lg transition-all"
                  title="Add files, web search, or sources"
                  aria-expanded={attachMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    if (isNarrow) {
                      openContextHub('hub');
                    } else {
                      setAttachMenuOpen((o) => !o);
                    }
                    setIsModeOpen(false);
                    setIsModelPickerOpen(false);
                  }}
                >
                  <Plus size={16} strokeWidth={2} />
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
                    ? 'bg-[var(--accent,var(--accent-secondary,var(--solar-cyan)))] text-[var(--dashboard-canvas)] shadow-[0_0_16px_var(--accent-glow,color-mix(in_srgb,var(--accent-secondary,var(--solar-cyan))_25%,transparent))] hover:bg-[var(--accent-hover,var(--accent-secondary,var(--solar-cyan)))] hover:brightness-110'
                    : 'text-[var(--text-chrome-muted)] bg-[var(--accent-muted,var(--bg-disabled))] cursor-not-allowed'
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
                  <ShieldCheck size={14} className="text-[var(--dashboard-canvas)]" />
                ) : (
                  <ArrowUp size={14} strokeWidth={2.5} />
                )}
              </button>
              </div>
            </div>
          </div>
          {showMobileRepoConnector && (
            <button
              type="button"
              onClick={() => openRepoPicker()}
              className="flex w-full items-center gap-1.5 text-left text-[11px] text-[var(--dashboard-muted)] transition-colors hover:text-[var(--dashboard-text)] py-2 px-1 rounded-lg hover:bg-[var(--bg-hover)]"
              aria-label="Connect GitHub repository for this chat"
            >
              <FolderGit2 size={14} className="shrink-0 text-[var(--solar-cyan)]" />
              <span className="min-w-0 flex-1 truncate">{mobileRepoConnectorLabel}</span>
              <ChevronDown size={14} className="shrink-0 opacity-60" />
            </button>
          )}
        </div>
          );
          const wrappedShell = desktopStartupCenterMode || entryPortalStartup ? (
            <div
              className={`iam-chat-startup-stack order-2 shrink-0 w-full${
                composerPortaled ? ' pointer-events-auto' : ''
              }`}
            >
              {!entryPortalStartup ? (
                <ComposerStartupGreeting isDarkTheme={isDarkTheme} />
              ) : null}
              {shell}
              {!entryPortalStartup ? (
                <ComposerStartupChips
                  className="mt-2"
                  onCreateImage={startImageGenerationPrompt}
                  onWebSearch={startWebSearchLane}
                  onOpenEditor={() => onOpenEditor?.()}
                />
              ) : null}
            </div>
          ) : (
            shell
          );
          if (composerPortaled) {
            if (!composerPortalTarget || typeof document === 'undefined') return null;
            return createPortal(wrappedShell, composerPortalTarget);
          }
          return wrappedShell;
        })()}

        </div>

        </div>

      </div>

      {!isNarrow ? (
        <RepoPickerBottomSheet
          open={repoDrawerOpen}
          onClose={() => setRepoDrawerOpen(false)}
          workspaceId={effectiveWsId}
          githubRepoContext={githubRepoContext}
          githubFilePath={chatGithubFilePath}
          onSelectRepo={(full) => saveGithubRepoSelection(full, null)}
          onSelectFile={(repo, path, branch, meta) =>
            saveGithubRepoSelection(repo, path, branch, meta)
          }
          onBrowseFiles={(full) => onOpenGitHubIntegration?.({ expandRepoFullName: full })}
        />
      ) : (
        <ContextHubDrawer
          open={contextHubOpen}
          onClose={() => setContextHubOpen(false)}
          initialLane={contextHubInitialLane}
          workspaceId={effectiveWsId}
          githubRepoContext={githubRepoContext}
          githubFilePath={chatGithubFilePath}
          pinnedLabel={mobileRepoConnectorLabel !== 'Connect GitHub repository' ? mobileRepoConnectorLabel : undefined}
          onClearPinned={() => {
            if (githubRepoContext?.trim()) saveGithubRepoSelection(githubRepoContext.trim(), null);
          }}
          onSelectRepo={(full) => saveGithubRepoSelection(full, null)}
          onSelectFile={(repo, path, branch, meta) =>
            saveGithubRepoSelection(repo, path, branch, meta)
          }
          onBrowseFiles={(full) => onOpenGitHubIntegration?.({ expandRepoFullName: full })}
          activeSourceIds={activeComposerSourceIds}
          webSearchAllowed={policyWebSearch}
          sandboxAgentAllowed={false}
          onUploadFile={() => fileInputRef.current?.click()}
          onUploadImage={() => imageInputRef.current?.click()}
          onToggleWebSearch={() => {
            const on = activeComposerSourceIds.has(WEB_SEARCH_SOURCE_ID);
            toggleComposerSource(WEB_SEARCH_SOURCE, !on);
          }}
          onToggleSource={toggleComposerSource}
          execLane={execLane}
          onExecLaneChange={handleExecLaneChange}
        />
      )}

      {typeof document !== 'undefined' &&
        !isNarrow &&
        attachMenuOpen &&
        attachMenuStyle &&
        createPortal(
          <div ref={attachMenuRef}>
            <ComposerConnectorSheet
              style={attachMenuStyle}
              connectors={availableConnectors}
              connectorsLoading={availableConnectorsLoading}
              activeSourceIds={activeComposerSourceIds}
              webSearchAllowed={policyWebSearch}
              sandboxAgentAllowed={false}
              onClose={() => setAttachMenuOpen(false)}
              onAttachFiles={() => {
                setAttachMenuOpen(false);
                fileInputRef.current?.click();
              }}
              onCreateImage={startImageGenerationPrompt}
              onWebSearch={startWebSearchLane}
              onDeepResearch={startDeepResearchPrompt}
              onToggleSource={toggleComposerSource}
              sourceFromConnector={sourceFromConnector}
            />
          </div>,
          document.body,
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
      {composerToast ? (
        <div
          role="status"
          className="fixed bottom-16 left-1/2 z-[200] -translate-x-1/2 px-4 py-2 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-canvas)] text-[11px] text-main shadow-lg max-w-md text-center"
        >
          {composerToast}
        </div>
      ) : null}
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
