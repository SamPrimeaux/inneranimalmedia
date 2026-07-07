import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  Paperclip,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Share2,
  Star,
  Trash2,
  X,
  Check,
} from 'lucide-react';
import { deleteProject, fetchProjectMemory, updateProject, updateProjectMemory } from '../../api/projects';
import { ProjectShareModal } from '../../components/projects/ProjectShareModal';
import { uploadProjectBrandAsset, uploadProjectR2File } from '../../src/lib/projectR2Upload';
import { cfImageVariants, projectAccentHue } from '../../src/lib/projectBranding';
import {
  fetchClientProjects,
  fetchTasksInsights,
  fetchTodos,
  fmtMinutes,
  postActivityHeartbeat,
  postProjectTimer,
  type AgentTodo,
  type TasksInsightsPayload,
} from '../launch-desk/ops-desk-types';
import { ProjectQuickStats, type ProjectStatsMetric, type ProjectStatsPeriod } from './ProjectQuickStats';
import { useWorkspace } from '../../src/context/WorkspaceContext';
import {
  activateProjectWorkContext,
  readExecutionWorkspaceId,
} from '../../src/lib/activateProjectWorkContext';
import { chatGithubContextStorageKey } from '../../components/ChatAssistant/types';
import { useComposerConnectorSheet } from '../../hooks/useComposerConnectorSheet';
import { AgentComposerSourceChips } from '../../components/ChatAssistant/composer/AgentComposerSourceChips';
import {
  brandAssetBrowserUrl,
  brandAssetsFromMeta,
  brandTokensFromMeta,
  coverFromMeta,
  isProjectImageFile,
  listProjectBrandAssetsFromR2,
  mergeBrandAssetLists,
  parseProjectMeta,
  projectFilesFromMeta,
  resolveProjectStorageScope,
  type BrandTokens,
  type ProjectFileRef,
  type ProjectStorageScope,
} from './projectDetailMeta';
import { resumeAgentChatSession, startProjectAgentChat } from '../../lib/openAgentConversation';
import { writeSessionProject } from '../../src/lib/freshChatSession';
import { IAM_AGENT_CHAT_CONVERSATION_CHANGE } from '../../agentChatConstants';

// ─── types ───────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  description?: string;
  status?: string;
  status_raw?: string;
  priority?: number;
  priority_num?: number;
  project_type?: string;
  health?: number;
  progress?: number;
  activeTasks?: number;
  totalTasks?: number;
  completedTasks?: number;
  chat_project_id?: string | null;
  workspace_id?: string | null;
  client_id?: string | null;
  domain?: string | null;
  worker_id?: string | null;
  metadata_json?: string | null;
  cover_image_url?: string | null;
  r2_buckets?: string | null;
}

interface ProjectTimerState {
  loading: boolean;
  running: boolean;
  minutesToday: number;
  busy: boolean;
}

interface ClientContactRow {
  client_name?: string | null;
  payment_notes?: string | null;
  client_id?: string | null;
}

interface ProjectTaskStats {
  open: number;
  loading: boolean;
}

interface ProjectTodosState {
  items: AgentTodo[];
  loading: boolean;
}

interface ChatSession {
  conversation_id?: string;
  id?: string;
  title?: string;
  updated_at?: number | string;
  last_turn_status?: string;
  project_id?: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function relTime(raw?: number | string): string {
  if (!raw) return '';
  const ts = typeof raw === 'number' ? raw * 1000 : Date.parse(String(raw));
  if (Number.isNaN(ts)) return String(raw);
  const diff = Date.now() - ts;
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 1) return `${Math.floor(d / 7)}w ago`;
  return mo === 1 ? '1 month ago' : `${mo} months ago`;
}

function truncatePreview(text: string, max = 220): string {
  const t = String(text || '').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

type RailEditorKind = 'memory' | 'instructions' | 'cover' | 'files' | 'stats' | 'brand';

function RailEditorModal({
  open,
  title,
  mobileTitle,
  subtitle,
  onClose,
  onSave,
  saving,
  saveLabel,
  showSave = true,
  isMobile = false,
  children,
}: {
  open: boolean;
  title: string;
  mobileTitle?: string;
  subtitle?: string;
  onClose: () => void;
  onSave?: () => void;
  saving?: boolean;
  saveLabel?: string;
  showSave?: boolean;
  isMobile?: boolean;
  children: React.ReactNode;
}) {
  if (!open) return null;

  const sheetTitle = mobileTitle || title.replace(/^Set project /i, '');

  if (isMobile) {
    return (
      <div
        className="cpd-editor-sheet-backdrop"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="cpd-editor-sheet"
          role="dialog"
          aria-labelledby="cpd-editor-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="cpd-editor-sheet-grab" aria-hidden />
          <div className="cpd-editor-sheet-toolbar">
            <button
              type="button"
              className="cpd-editor-sheet-icon"
              aria-label="Close"
              disabled={saving}
              onClick={onClose}
            >
              <X size={20} strokeWidth={1.75} />
            </button>
            <h2 id="cpd-editor-title" className="cpd-editor-sheet-title">{sheetTitle}</h2>
            {showSave && onSave ? (
              <button
                type="button"
                className="cpd-editor-sheet-icon cpd-editor-sheet-icon--save"
                aria-label={saveLabel || 'Save'}
                disabled={saving}
                onClick={onSave}
              >
                <Check size={20} strokeWidth={2} />
              </button>
            ) : (
              <span className="cpd-editor-sheet-icon-spacer" aria-hidden />
            )}
          </div>
          <div className="cpd-editor-sheet-scroll">
            <div className="cpd-editor-sheet-body">{children}</div>
            {subtitle ? <p className="cpd-editor-sheet-subtitle">{subtitle}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="cpd-modal-backdrop cpd-editor-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="cpd-editor-modal"
        role="dialog"
        aria-labelledby="cpd-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cpd-editor-title" className="cpd-editor-modal-title">{title}</h2>
        {subtitle ? <p className="cpd-editor-modal-subtitle">{subtitle}</p> : null}
        <div className="cpd-editor-modal-body">{children}</div>
        <div className="cpd-editor-modal-actions">
          <button type="button" className="cpd-btn" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          {showSave && onSave ? (
            <button
              type="button"
              className="cpd-btn cpd-btn--primary"
              disabled={saving}
              onClick={onSave}
            >
              {saving ? 'Saving…' : saveLabel || 'Save'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RailPreviewCard({
  emptyLabel,
  preview,
  saved,
  onOpen,
}: {
  emptyLabel: string;
  preview: string;
  saved?: boolean;
  onOpen: () => void;
}) {
  const hasContent = Boolean(preview.trim());
  return (
    <button type="button" className="cpd-rail-preview" onClick={onOpen}>
      {hasContent ? (
        <p className="cpd-rail-preview-text">{truncatePreview(preview, 280)}</p>
      ) : (
        <p className="cpd-rail-preview-empty">{emptyLabel}</p>
      )}
      <span className="cpd-rail-preview-foot">
        {hasContent ? (saved ? 'Saved · Click to edit' : 'Unsaved · Click to edit') : 'Click to add'}
      </span>
    </button>
  );
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);
  return isMobile;
}

// ─── skeleton rows ───────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="cpd-chat-row">
      <div style={{ flex: 1 }}>
        <div className="cpd-skel" style={{ height: 14, width: '55%', marginBottom: 6 }} />
        <div className="cpd-skel" style={{ height: 11, width: '30%' }} />
      </div>
    </div>
  );
}

// ─── right panel section ─────────────────────────────────────────────────────

function RailSection({
  title,
  badge,
  action,
  children,
  defaultOpen = true,
}: {
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="cpd-rail-section">
      <div className="cpd-rail-section-header">
        <button
          type="button"
          className="cpd-rail-section-title"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {title}
          {badge}
          <span className="cpd-rail-chevron" aria-hidden>
            {open ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />}
          </span>
        </button>
        {action ? (
          <div className="cpd-rail-section-action" onClick={(e) => e.stopPropagation()}>
            {action}
          </div>
        ) : null}
      </div>
      {open ? <div className="cpd-rail-section-body">{children}</div> : null}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { workspaceId, sessionUserId, switchWorkspace, persistGithubRepo } = useWorkspace();
  const [executionWorkspaceId, setExecutionWorkspaceId] = useState<string | null>(() => readExecutionWorkspaceId());
  const activateRef = useRef<string | null>(null);
  const isMobile = useIsMobile();

  const [project, setProject] = useState<Project | null>(null);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingChats, setLoadingChats] = useState(true);

  // composer → Agent Sam panel (project linked via session project)
  const [draft, setDraft] = useState('');
  const [composerAttachments, setComposerAttachments] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerAttachRef = useRef<HTMLInputElement>(null);

  const {
    composerRef,
    attachButtonRef,
    composerSources,
    attachMenuOpen,
    toggleAttachMenu,
    removeComposerSource,
    renderAttachMenuPortal,
  } = useComposerConnectorSheet({
    workspaceId,
    sessionUserId,
    onAttachFiles: () => composerAttachRef.current?.click(),
    onCreateImage: () => {
      setDraft((prev) => (prev.trim() ? prev : 'Generate an image of '));
      textareaRef.current?.focus();
    },
    onWebSearch: () => {
      setDraft((prev) => (prev.trim() ? prev : 'Search the web for: '));
      textareaRef.current?.focus();
    },
    onDeepResearch: () => {
      setDraft((prev) => (prev.trim() ? prev : 'Research in depth: '));
      textareaRef.current?.focus();
    },
  });

  // rename
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);

  // more menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // mobile rail sheet
  const [railOpen, setRailOpen] = useState(false);

  // right rail edit states
  const [instructions, setInstructions] = useState('');
  const [instrSaved, setInstrSaved] = useState(false);
  const [instrBusy, setInstrBusy] = useState(false);
  const [memory, setMemory] = useState('');
  const [memSaved, setMemSaved] = useState(false);
  const [memBusy, setMemBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectFileRef[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [previewImage, setPreviewImage] = useState<ProjectFileRef | null>(null);
  const [taskStats, setTaskStats] = useState<ProjectTaskStats>({ open: 0, loading: true });
  const [projectTodos, setProjectTodos] = useState<ProjectTodosState>({ items: [], loading: true });
  const [tasksInsights, setTasksInsights] = useState<TasksInsightsPayload | null>(null);
  const [statsMetric, setStatsMetric] = useState<ProjectStatsMetric>('time');
  const [statsPeriod, setStatsPeriod] = useState<ProjectStatsPeriod>('week');
  const [timerState, setTimerState] = useState<ProjectTimerState>({
    loading: true,
    running: false,
    minutesToday: 0,
    busy: false,
  });
  const [brandAssets, setBrandAssets] = useState<ProjectFileRef[]>([]);
  const [brandTokens, setBrandTokens] = useState<BrandTokens>({});
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandUploading, setBrandUploading] = useState(false);
  const [brandDragOver, setBrandDragOver] = useState(false);
  const [storageScope, setStorageScope] = useState<ProjectStorageScope | null>(null);
  const [clientContact, setClientContact] = useState<ClientContactRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [railEditor, setRailEditor] = useState<RailEditorKind | null>(null);
  const [memDraft, setMemDraft] = useState('');
  const [instrDraft, setInstrDraft] = useState('');
  const brandDragDepthRef = useRef(0);
  const brandInputRef = useRef<HTMLInputElement>(null);
  const fileDragDepthRef = useRef(0);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── load project ──
  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setLoadingProject(true);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        credentials: 'same-origin',
      });
      if (!r.ok) { navigate('/dashboard/projects', { replace: true }); return; }
      const data = await r.json();
      const p: Project = data.project ?? data;
      setProject(p);
      setRenameDraft(p.name ?? '');
      setProjectFiles(projectFilesFromMeta(p.metadata_json));
      setCoverUrl(p.cover_image_url || coverFromMeta(p.metadata_json));
      setBrandTokens(brandTokensFromMeta(p.metadata_json));
      setStorageScope(resolveProjectStorageScope(p));

      if (activateRef.current !== projectId) {
        activateRef.current = projectId;
        void activateProjectWorkContext(p.id, p.name || p.id, {
          switchWorkspace,
          persistGithubRepo,
          currentWorkspaceId: workspaceId,
          githubContextStorageKey: chatGithubContextStorageKey(
            sessionUserId,
            p.workspace_id || workspaceId,
            '',
          ),
        }).then((res) => {
          if (res.ok && res.executionWorkspaceId) {
            setExecutionWorkspaceId(res.executionWorkspaceId);
          }
        });
      }
    } catch {
      navigate('/dashboard/projects', { replace: true });
    } finally {
      setLoadingProject(false);
    }
  }, [projectId, navigate, switchWorkspace, persistGithubRepo, workspaceId, sessionUserId]);

  // ── load chats ──
  const loadChats = useCallback(async () => {
    if (!projectId) return;
    setLoadingChats(true);
    try {
      const ws =
        executionWorkspaceId ||
        project?.workspace_id ||
        workspaceId ||
        readExecutionWorkspaceId();
      const params = new URLSearchParams({ limit: '200', project_id: projectId });
      if (ws) params.set('workspace_id', ws);
      const r = await fetch(`/api/agent/sessions?${params}`, { credentials: 'same-origin' });
      const rows: ChatSession[] = r.ok ? await r.json() : [];
      setChats(rows);
    } catch {
      setChats([]);
    } finally {
      setLoadingChats(false);
    }
  }, [projectId, executionWorkspaceId, project?.workspace_id, workspaceId]);

  useEffect(() => { void loadProject(); }, [loadProject]);
  useEffect(() => { void loadChats(); }, [loadChats]);

  useEffect(() => {
    const onConv = () => {
      void loadChats();
      window.setTimeout(() => void loadChats(), 1200);
      window.setTimeout(() => void loadChats(), 3200);
    };
    window.addEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onConv);
    return () => window.removeEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onConv);
  }, [loadChats]);

  const loadMemory = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetchProjectMemory(projectId);
      if (res.ok) {
        setMemory(res.memory ?? '');
        setInstructions(res.instructions ?? '');
        setMemSaved(true);
        setInstrSaved(true);
      }
    } catch {
      /* optional */
    }
  }, [projectId]);

  useEffect(() => { void loadMemory(); }, [loadMemory]);

  const loadTaskStats = useCallback(async () => {
    if (!projectId) return;
    setTaskStats((s) => ({ ...s, loading: true }));
    setProjectTodos((s) => ({ ...s, loading: true }));
    try {
      const todos = await fetchTodos({ projectId });
      setProjectTodos({ items: todos, loading: false });
      setTaskStats({ open: todos.length, loading: false });
      const insights = await fetchTasksInsights(new Date(), projectId);
      setTasksInsights(insights);
    } catch {
      setProjectTodos({ items: [], loading: false });
      setTaskStats({ open: 0, loading: false });
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    void loadTaskStats();
  }, [projectId, loadTaskStats]);

  const loadTimerState = useCallback(async () => {
    if (!projectId) return;
    setTimerState((s) => ({ ...s, loading: true }));
    try {
      const data = await fetchTasksInsights(new Date(), projectId);
      setTimerState({
        loading: false,
        running: Boolean(data.project_active_tracking),
        minutesToday: Number(data.project_today_minutes || 0),
        busy: false,
      });
    } catch {
      setTimerState((s) => ({ ...s, loading: false }));
    }
  }, [projectId]);

  useEffect(() => {
    void loadTimerState();
  }, [loadTimerState]);

  useEffect(() => {
    if (!timerState.running || !projectId) return;
    const tick = window.setInterval(() => {
      void postActivityHeartbeat({ project_id: projectId, surface: 'project_detail' }).catch(() => null);
      void loadTimerState();
    }, 60_000);
    return () => window.clearInterval(tick);
  }, [timerState.running, projectId, loadTimerState]);

  const loadBrandAssets = useCallback(async () => {
    if (!project) return;
    setBrandLoading(true);
    try {
      const scope = resolveProjectStorageScope(project);
      setStorageScope(scope);
      const fromR2 = await listProjectBrandAssetsFromR2(scope);
      const fromMeta = brandAssetsFromMeta(project.metadata_json);
      setBrandAssets(mergeBrandAssetLists(fromR2, fromMeta));
    } catch {
      setBrandAssets(brandAssetsFromMeta(project.metadata_json));
    } finally {
      setBrandLoading(false);
    }
  }, [project]);

  useEffect(() => {
    if (!project) return;
    void loadBrandAssets();
  }, [project, loadBrandAssets]);

  const loadClientContact = useCallback(async () => {
    const clientId = project?.client_id?.trim();
    if (!clientId) {
      setClientContact(null);
      return;
    }
    try {
      const clients = await fetchClientProjects();
      const row = clients.find((c) => String(c.client_id || '') === clientId);
      setClientContact(
        row
          ? {
              client_name: row.client_name,
              payment_notes: row.payment_notes,
              client_id: row.client_id,
            }
          : { client_id: clientId },
      );
    } catch {
      setClientContact({ client_id: clientId });
    }
  }, [project?.client_id]);

  useEffect(() => {
    void loadClientContact();
  }, [loadClientContact]);

  const refreshProjectContext = async () => {
    if (!project || refreshing) return;
    setRefreshing(true);
    try {
      activateRef.current = null;
      await Promise.all([
        loadProject(),
        loadMemory(),
        loadChats(),
        loadTaskStats(),
        loadTimerState(),
        loadBrandAssets(),
        loadClientContact(),
      ]);
      setToast('Project context refreshed');
    } finally {
      setRefreshing(false);
    }
  };

  const toggleProjectTimer = async () => {
    if (!project || timerState.busy) return;
    setTimerState((s) => ({ ...s, busy: true }));
    try {
      const action = timerState.running ? 'stop' : 'start';
      const res = await postProjectTimer({ action, project_id: project.id });
      if (!res.ok) {
        setToast(res.error || 'Timer update failed');
        return;
      }
      await loadTimerState();
      setToast(action === 'start' ? 'Timer started' : 'Timer stopped');
    } finally {
      setTimerState((s) => ({ ...s, busy: false }));
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  // close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!previewImage && !railEditor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewImage) setPreviewImage(null);
        else if (railEditor) setRailEditor(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [previewImage, railEditor]);

  useEffect(() => {
    const lockScroll = Boolean(railEditor || (isMobile && railOpen));
    document.body.style.overflow = lockScroll ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [railEditor, isMobile, railOpen]);

  const openRailEditor = (kind: RailEditorKind) => {
    if (kind === 'memory') setMemDraft(memory);
    if (kind === 'instructions') setInstrDraft(instructions);
    setRailEditor(kind);
    if (isMobile) setRailOpen(false);
  };

  const closeRailEditor = () => setRailEditor(null);

  // auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  // ── save rename ──
  const saveRename = async () => {
    if (!project || renameBusy) return;
    const name = renameDraft.trim();
    if (!name || name === project.name) { setRenaming(false); return; }
    setRenameBusy(true);
    try {
      await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setRenaming(false);
      await loadProject();
    } finally {
      setRenameBusy(false);
    }
  };

  const saveMemory = async (nextMemory?: string) => {
    if (!project || memBusy) return false;
    const value = nextMemory !== undefined ? nextMemory : memory;
    setMemBusy(true);
    try {
      const res = await updateProjectMemory(project.id, { memory: value });
      if (res.ok) {
        setMemory(value);
        setMemSaved(true);
        return true;
      }
      setToast(res.error || 'Failed to save memory');
      return false;
    } finally {
      setMemBusy(false);
    }
  };

  const saveInstructions = async (nextInstructions?: string) => {
    if (!project || instrBusy) return false;
    const value = nextInstructions !== undefined ? nextInstructions : instructions;
    setInstrBusy(true);
    try {
      const res = await updateProjectMemory(project.id, { instructions: value });
      if (res.ok) {
        setInstructions(value);
        setInstrSaved(true);
        return true;
      }
      setToast(res.error || 'Failed to save instructions');
      return false;
    } finally {
      setInstrBusy(false);
    }
  };

  const saveMemoryFromModal = async () => {
    const ok = await saveMemory(memDraft);
    if (ok) closeRailEditor();
  };

  const saveInstructionsFromModal = async () => {
    const ok = await saveInstructions(instrDraft);
    if (ok) closeRailEditor();
  };

  const persistProjectMeta = async (patch: Record<string, unknown>) => {
    if (!project) return false;
    const meta = { ...parseProjectMeta(project.metadata_json), ...patch };
    const res = await updateProject(project.id, { metadata_json: JSON.stringify(meta) });
    if (!res.ok) {
      setToast(res.error || 'Update failed');
      return false;
    }
    setProject((prev) => (prev ? { ...prev, metadata_json: JSON.stringify(meta) } : prev));
    return true;
  };

  const saveCoverUrl = async (url: string) => {
    const ok = await persistProjectMeta({ cover_image_url: url });
    if (ok) {
      setCoverUrl(url);
      setToast('Cover updated — home preview will use this image');
    }
  };

  const handleCoverPick = async (files: FileList | null) => {
    if (!project) return;
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      setToast('Choose an image file');
      return;
    }
    setCoverUploading(true);
    try {
      const out = await uploadProjectR2File(
        project.id,
        file,
        'cover',
        project.workspace_id || workspaceId,
      );
      if (!out.ok || !out.url) {
        setToast(out.error || 'Cover upload failed');
        return;
      }
      await saveCoverUrl(out.url);
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  const appendProjectFiles = async (files: FileList | File[] | null) => {
    if (!project) return;
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    const wsForUpload = (project.workspace_id || workspaceId || '').trim() || null;
    const scope = resolveProjectStorageScope(project);
    const useClientStorage = scope.source === 'client_r2';
    setFileUploading(true);
    try {
      const added: ProjectFileRef[] = [];
      for (const file of list) {
        const out = await uploadProjectR2File(project.id, file, 'files', wsForUpload, {
          bucket: useClientStorage ? scope.bucket : undefined,
          keyPrefix: useClientStorage ? `projects/${project.id}/files/` : undefined,
          forceR2: useClientStorage,
        });
        if (!out.ok || !out.url) {
          setToast(out.error || `Upload failed: ${file.name}`);
          break;
        }
        added.push({
          name: file.name,
          url: out.url,
          uploaded_at: Date.now(),
          kind: file.type.startsWith('image/') ? 'image' : 'document',
          r2_bucket: out.key ? scope.bucket : undefined,
          r2_key: out.key,
        });
      }
      if (!added.length) return;
      const next = [...added, ...projectFiles];
      const ok = await persistProjectMeta({ project_files: next });
      if (ok) {
        setProjectFiles(next);
        setToast(added.length === 1 ? 'File added' : `${added.length} files added`);
      }
    } finally {
      setFileUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openProjectTasks = () => {
    if (!project) return;
    const clientId = project.client_id?.trim();
    if (clientId) {
      navigate(`/dashboard/collaborate?seg=tasks&client=${encodeURIComponent(clientId)}`);
      return;
    }
    navigate(`/dashboard/collaborate?seg=tasks&project=${encodeURIComponent(project.id)}`);
  };

  const openProjectCalendar = () => {
    if (!project) return;
    const clientId = project.client_id?.trim();
    if (clientId) {
      navigate(`/dashboard/collaborate?seg=calendar&client=${encodeURIComponent(clientId)}`);
      return;
    }
    navigate(`/dashboard/collaborate?seg=calendar&project=${encodeURIComponent(project.id)}`);
  };

  const openBrandAssetBrowser = () => {
    if (!project) return;
    const scope = storageScope || resolveProjectStorageScope(project);
    navigate(brandAssetBrowserUrl(scope));
  };

  const appendBrandAssets = async (files: FileList | File[] | null) => {
    if (!project) return;
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    const scope = storageScope || resolveProjectStorageScope(project);
    setBrandUploading(true);
    try {
      const added: ProjectFileRef[] = [];
      for (const file of list) {
        if (!file.type.startsWith('image/')) {
          setToast('Brand assets must be images (PNG, SVG, WebP…)');
          continue;
        }
        const out = await uploadProjectBrandAsset(file, scope);
        if (!out.ok || !out.url) {
          setToast(out.error || `Upload failed: ${file.name}`);
          break;
        }
        added.push({
          name: file.name,
          url: out.url,
          uploaded_at: Date.now(),
          kind: 'image',
          r2_bucket: scope.bucket,
          r2_key: out.key,
        });
      }
      if (!added.length) return;
      const metaAssets = brandAssetsFromMeta(project.metadata_json);
      const nextMetaAssets = [...added, ...metaAssets].slice(0, 24);
      await persistProjectMeta({ brand_assets: nextMetaAssets });
      setBrandAssets(mergeBrandAssetLists([...added, ...brandAssets], nextMetaAssets));
      setToast(added.length === 1 ? 'Brand asset added' : `${added.length} brand assets added`);
      void loadBrandAssets();
    } finally {
      setBrandUploading(false);
      if (brandInputRef.current) brandInputRef.current.value = '';
    }
  };

  const submitDelete = async () => {
    if (!project?.id || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await deleteProject(project.id);
      if (res.ok) {
        navigate('/dashboard/projects', { replace: true });
        return;
      }
      setToast(res.error || 'Delete failed');
      setDeleteOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  // ── project-scoped chat (stay on page — context via attachments + project memory) ──
  const projectChatId = project?.id || projectId || '';

  const sendProjectChat = () => {
    if (!project) return;
    const message = draft.trim();
    const hasFiles = composerAttachments.length > 0;
    if (!message && !hasFiles) return;

    const userVisible =
      message ||
      (hasFiles
        ? `Review ${composerAttachments.length} attached file${composerAttachments.length === 1 ? '' : 's'}.`
        : '');

    startProjectAgentChat({
      projectId: projectChatId,
      projectName: project.name,
      message: userVisible,
      memory,
      instructions,
      stayOnPage: true,
    });
    setDraft('');
    setComposerAttachments([]);
    window.setTimeout(() => void loadChats(), 1500);
  };

  const resumeChat = (s: ChatSession) => {
    const id = s.conversation_id ?? s.id ?? '';
    if (!id || !project) return;
    writeSessionProject({ id: projectChatId, name: project.name });
    resumeAgentChatSession({ id, title: s.title || 'Chat', force: true });
  };

  const onComposerFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const next = Array.from(files);
    if (!next.length) return;
    setComposerAttachments((prev) => [...prev, ...next].slice(0, 12));
  };

  const imageFiles = useMemo(
    () => projectFiles.filter((f) => isProjectImageFile(f)),
    [projectFiles],
  );
  const documentFiles = useMemo(
    () => projectFiles.filter((f) => !isProjectImageFile(f)),
    [projectFiles],
  );

  const filesDropZone = (className = '') => (
    <div
      className={`cpd-files-drop${fileDragOver ? ' cpd-files-drop--over' : ''}${className ? ` ${className}` : ''}`}
      onDragEnter={(e) => {
        e.preventDefault();
        fileDragDepthRef.current += 1;
        setFileDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
        if (fileDragDepthRef.current === 0) setFileDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        fileDragDepthRef.current = 0;
        setFileDragOver(false);
        void appendProjectFiles(e.dataTransfer.files);
      }}
    >
      <FolderOpen size={24} strokeWidth={1} className="cpd-files-icon" />
      <p className="cpd-files-text">
        Drop images, PDFs, or docs here — attached to this project for Agent Sam and your team.
      </p>
      <button
        type="button"
        className="cpd-rail-empty-btn"
        disabled={fileUploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {fileUploading ? 'Uploading…' : 'Choose files'}
      </button>
    </div>
  );

  const filesGallery = imageFiles.length > 0 ? (
    <div className="cpd-files-gallery" role="list" aria-label="Project images">
      {imageFiles.map((f) => {
        const variants = cfImageVariants(f.url);
        return (
          <button
            key={`${f.url}-${f.name}`}
            type="button"
            className="cpd-files-thumb"
            role="listitem"
            title={f.name}
            onClick={() => setPreviewImage(f)}
          >
            <img
              src={variants.src}
              srcSet={variants.srcSet}
              alt={f.name}
              loading="lazy"
              draggable={false}
            />
          </button>
        );
      })}
    </div>
  ) : null;

  const filesDocList = documentFiles.length > 0 ? (
    <ul className="cpd-files-list">
      {documentFiles.map((f) => (
        <li key={`${f.url}-${f.name}`}>
          <FileText size={14} strokeWidth={1.75} aria-hidden className="cpd-files-doc-icon" />
          <a href={f.url} target="_blank" rel="noreferrer noopener">
            {f.name}
          </a>
          <ExternalLink size={12} aria-hidden />
        </li>
      ))}
    </ul>
  ) : null;

  const brandPrimary = brandTokens.primary_color?.trim();
  const brandAccent = brandTokens.accent_color?.trim() || `hsl(${projectAccentHue(project?.id || '')} 62% 48%)`;

  const brandDropZone = (className = '') => (
    <div
      className={`cpd-files-drop cpd-brand-drop${brandDragOver ? ' cpd-files-drop--over' : ''}${className ? ` ${className}` : ''}`}
      onDragEnter={(e) => {
        e.preventDefault();
        brandDragDepthRef.current += 1;
        setBrandDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        brandDragDepthRef.current = Math.max(0, brandDragDepthRef.current - 1);
        if (brandDragDepthRef.current === 0) setBrandDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        brandDragDepthRef.current = 0;
        setBrandDragOver(false);
        void appendBrandAssets(e.dataTransfer.files);
      }}
    >
      <Palette size={24} strokeWidth={1} className="cpd-files-icon" />
      <p className="cpd-files-text">
        Drop logos, icons, or color swatches — stored in{' '}
        <span className="cpd-quick-stat-mono">{storageScope?.bucket || 'project R2'}</span>
        {storageScope?.prefix ? ` · ${storageScope.prefix}` : ''}.
      </p>
      <button
        type="button"
        className="cpd-rail-empty-btn"
        disabled={brandUploading}
        onClick={() => brandInputRef.current?.click()}
      >
        {brandUploading ? 'Uploading…' : 'Choose brand images'}
      </button>
    </div>
  );

  const brandGallery = brandAssets.length > 0 ? (
    <div className="cpd-files-gallery cpd-brand-gallery" role="list" aria-label="Brand assets">
      {brandAssets.map((f) => {
        const variants = cfImageVariants(f.url);
        return (
          <button
            key={`${f.url}-${f.name}`}
            type="button"
            className="cpd-files-thumb"
            role="listitem"
            title={f.name}
            onClick={() => setPreviewImage(f)}
          >
            <img src={variants.src} srcSet={variants.srcSet} alt={f.name} loading="lazy" draggable={false} />
          </button>
        );
      })}
    </div>
  ) : null;

  // ── rail content (shared between desktop aside and mobile sheet) ──
  const railDefaultOpen = !isMobile;
  const railContent = (
    <>
      <RailSection
        title="Quick stats"
        defaultOpen={railDefaultOpen}
        action={
          <div className="cpd-rail-actions">
            <button
              type="button"
              className="cpd-icon-btn"
              title="Refresh project context"
              disabled={refreshing}
              onClick={() => void refreshProjectContext()}
            >
              <RefreshCw size={13} strokeWidth={1.5} className={refreshing ? 'cpd-spin' : undefined} />
            </button>
            <button
              type="button"
              className="cpd-icon-btn"
              title="Expand stats"
              onClick={() => openRailEditor('stats')}
            >
              <ExternalLink size={13} strokeWidth={1.5} />
            </button>
          </div>
        }
      >
        <ProjectQuickStats
          compact
          todos={projectTodos.items}
          todosLoading={projectTodos.loading}
          tasksInsights={tasksInsights}
          timerRunning={timerState.running}
          timerBusy={timerState.busy}
          timerMinutesToday={timerState.minutesToday}
          onToggleTimer={() => void toggleProjectTimer()}
          onOpenTasks={openProjectTasks}
          onOpenCalendar={openProjectCalendar}
          metric={statsMetric}
          onMetricChange={setStatsMetric}
          period={statsPeriod}
          onPeriodChange={setStatsPeriod}
        />
      </RailSection>

      <RailSection
        title="Brand assets"
        defaultOpen={false}
        action={
          <div className="cpd-rail-actions">
            <button
              type="button"
              className="cpd-icon-btn"
              title="Open asset browser"
              onClick={openBrandAssetBrowser}
            >
              <ExternalLink size={13} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className="cpd-icon-btn"
              title="Manage brand assets"
              disabled={brandUploading}
              onClick={() => brandInputRef.current?.click()}
            >
              <Plus size={14} strokeWidth={1.5} />
            </button>
          </div>
        }
      >
        <div
          className={`cpd-brand-rail${brandDragOver ? ' cpd-brand-rail--over' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault();
            brandDragDepthRef.current += 1;
            setBrandDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={() => {
            brandDragDepthRef.current = Math.max(0, brandDragDepthRef.current - 1);
            if (brandDragDepthRef.current === 0) setBrandDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            brandDragDepthRef.current = 0;
            setBrandDragOver(false);
            void appendBrandAssets(e.dataTransfer.files);
          }}
        >
          <div className="cpd-brand-swatches" aria-hidden>
            <span className="cpd-brand-swatch" style={{ background: brandPrimary || brandAccent }} />
            <span className="cpd-brand-swatch cpd-brand-swatch--muted" style={{ background: brandAccent }} />
          </div>
          {brandLoading ? (
            <p className="cpd-rail-preview-empty">Loading…</p>
          ) : brandAssets.length > 0 ? (
            <div className="cpd-rail-files-mini cpd-brand-rail-grid">
              {brandAssets.slice(0, 6).map((f) => (
                <button key={f.url} type="button" className="cpd-brand-rail-thumb" onClick={() => setPreviewImage(f)}>
                  <img src={cfImageVariants(f.url).src} alt={f.name} />
                </button>
              ))}
            </div>
          ) : (
            <p className="cpd-rail-preview-empty">Drop logos & icons here</p>
          )}
          <span className="cpd-rail-preview-foot">
            {storageScope?.source === 'client_r2'
              ? `${storageScope.bucket} · drop to upload`
              : 'Set client R2 bucket on project for client storage'}
          </span>
        </div>
      </RailSection>

      <RailSection
        title="Cover"
        defaultOpen={false}
        action={
          <button
            type="button"
            className="cpd-icon-btn"
            title="Set cover photo"
            disabled={coverUploading}
            onClick={() => openRailEditor('cover')}
          >
            <ImageIcon size={14} strokeWidth={1.5} />
          </button>
        }
      >
        <button type="button" className="cpd-rail-preview cpd-rail-preview--cover" onClick={() => openRailEditor('cover')}>
          {coverUrl ? (
            <img src={cfImageVariants(coverUrl).src} alt="" className="cpd-rail-cover-thumb" />
          ) : (
            <p className="cpd-rail-preview-empty">Set cover for home & grid previews</p>
          )}
          <span className="cpd-rail-preview-foot">{coverUrl ? 'Click to preview & change' : 'Click to add cover'}</span>
        </button>
      </RailSection>

      <RailSection
        title="Memory"
        defaultOpen={railDefaultOpen}
        badge={<span className="cpd-rail-badge">Only you</span>}
        action={
          <button
            type="button"
            className="cpd-icon-btn"
            title="Edit memory"
            onClick={() => openRailEditor('memory')}
          >
            <Pencil size={13} strokeWidth={1.5} />
          </button>
        }
      >
        <RailPreviewCard
          emptyLabel="Key context Agent Sam should always know about this project…"
          preview={memory}
          saved={memSaved}
          onOpen={() => openRailEditor('memory')}
        />
      </RailSection>

      <RailSection
        title="Instructions"
        defaultOpen={railDefaultOpen}
        action={
          <button
            type="button"
            className="cpd-icon-btn"
            title="Edit instructions"
            onClick={() => openRailEditor('instructions')}
          >
            <Pencil size={14} strokeWidth={1.5} />
          </button>
        }
      >
        <RailPreviewCard
          emptyLabel="Add instructions to tailor Agent Sam responses…"
          preview={instructions}
          saved={instrSaved}
          onOpen={() => openRailEditor('instructions')}
        />
      </RailSection>

      <RailSection
        title="Files"
        defaultOpen={false}
        action={
          <button
            type="button"
            className="cpd-icon-btn"
            title="Manage files"
            disabled={fileUploading}
            onClick={() => openRailEditor('files')}
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
        }
      >
        <button type="button" className="cpd-rail-preview" onClick={() => openRailEditor('files')}>
          {projectFiles.length > 0 ? (
            <>
              <p className="cpd-rail-preview-text">
                {projectFiles.length} file{projectFiles.length === 1 ? '' : 's'} attached
                {documentFiles.length > 0 ? ` · ${documentFiles.length} doc${documentFiles.length === 1 ? '' : 's'}` : ''}
                {imageFiles.length > 0 ? ` · ${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'}` : ''}
              </p>
              {imageFiles.length > 0 ? (
                <div className="cpd-rail-files-mini">
                  {imageFiles.slice(0, 4).map((f) => (
                    <img key={f.url} src={cfImageVariants(f.url).src} alt="" />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="cpd-rail-preview-empty">Drop images, PDFs, or docs for Agent Sam…</p>
          )}
          <span className="cpd-rail-preview-foot">Click to manage files</span>
        </button>
      </RailSection>
    </>
  );

  // ── loading skeleton ──
  if (loadingProject) {
    return (
      <div className="cpd-root">
        <style>{CSS}</style>
        <div className="cpd-left">
          <div className="cpd-back-row">
            <div className="cpd-skel" style={{ height: 13, width: 100 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 0' }}>
            <div className="cpd-skel" style={{ height: 28, width: '50%' }} />
            <div className="cpd-skel" style={{ height: 13, width: '70%' }} />
            <div className="cpd-skel" style={{ height: 13, width: '45%' }} />
          </div>
        </div>
        {!isMobile && (
          <div className="cpd-right">
            <div className="cpd-skel" style={{ height: 80, width: '100%', borderRadius: 10 }} />
          </div>
        )}
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="cpd-root">
      <style>{CSS}</style>

      {/* ── left column ── */}
      <div className="cpd-left">

        {/* back + mobile details toggle */}
        <div className="cpd-back-row">
          <button
            type="button"
            className="cpd-back"
            onClick={() => navigate('/dashboard/projects')}
          >
            <ArrowLeft size={13} strokeWidth={1.5} />
            All projects
          </button>
          {isMobile && (
            <button
              type="button"
              className="cpd-details-toggle"
              onClick={() => setRailOpen(true)}
            >
              Details
            </button>
          )}
        </div>

        {/* title row */}
        <div className="cpd-title-section">
          {renaming ? (
            <div className="cpd-rename-row">
              <input
                autoFocus
                className="cpd-rename-input"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveRename();
                  if (e.key === 'Escape') setRenaming(false);
                }}
              />
              <button
                type="button"
                className="cpd-icon-btn"
                disabled={renameBusy}
                onClick={() => void saveRename()}
              >
                {renameBusy ? '...' : 'Save'}
              </button>
              <button type="button" className="cpd-icon-btn" onClick={() => setRenaming(false)}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="cpd-title-row">
              <h1 className="cpd-title">{project.name}</h1>
              <div className="cpd-title-actions">
                <button
                  type="button"
                  className="cpd-icon-btn"
                  title="Refresh project context (memory, tasks, assets)"
                  disabled={refreshing}
                  onClick={() => void refreshProjectContext()}
                >
                  <RefreshCw size={15} strokeWidth={1.5} className={refreshing ? 'cpd-spin' : undefined} />
                </button>
                <div ref={menuRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="cpd-icon-btn"
                    title="More options"
                    onClick={() => setMenuOpen((v) => !v)}
                  >
                    <MoreHorizontal size={16} strokeWidth={1.5} />
                  </button>
                  {menuOpen && (
                    <div className="cpd-menu">
                      <button
                        type="button"
                        className="cpd-menu-item"
                        onClick={() => { openProjectTasks(); setMenuOpen(false); }}
                      >
                        <CheckSquare size={13} />
                        View tasks
                      </button>
                      <button
                        type="button"
                        className="cpd-menu-item"
                        onClick={() => { coverInputRef.current?.click(); setMenuOpen(false); }}
                      >
                        <ImageIcon size={13} />
                        Set cover photo
                      </button>
                      <button
                        type="button"
                        className="cpd-menu-item"
                        onClick={() => { setRenaming(true); setMenuOpen(false); }}
                      >
                        <Pencil size={13} />
                        Rename project
                      </button>
                      <button
                        type="button"
                        className="cpd-menu-item"
                        onClick={() => { setShareOpen(true); setMenuOpen(false); }}
                      >
                        <Share2 size={13} />
                        Share
                      </button>
                      <button
                        type="button"
                        className="cpd-menu-item cpd-menu-item--danger"
                        onClick={() => { setDeleteOpen(true); setMenuOpen(false); }}
                      >
                        <Trash2 size={13} />
                        Delete project
                      </button>
                    </div>
                  )}
                </div>
                <button type="button" className="cpd-icon-btn" title="Star project">
                  <Star size={16} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="cpd-left-scroll">
        {/* composer */}
        <div className="cpd-composer" ref={composerRef}>
          <AgentComposerSourceChips
            sources={composerSources}
            onRemove={removeComposerSource}
            className="cpd-composer-source-chips"
          />
          {composerAttachments.length > 0 ? (
            <div className="cpd-composer-attachments">
              {composerAttachments.map((f, i) => (
                <span key={`${f.name}-${i}`} className="cpd-composer-attach-chip">
                  <Paperclip size={11} aria-hidden />
                  <span className="cpd-composer-attach-name">{f.name}</span>
                  <button
                    type="button"
                    className="cpd-composer-attach-remove"
                    aria-label={`Remove ${f.name}`}
                    onClick={() =>
                      setComposerAttachments((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <textarea
            ref={textareaRef}
            className="cpd-composer-input"
            placeholder="How can I help you today?"
            value={draft}
            rows={1}
            disabled={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendProjectChat();
              }
            }}
          />
          <div className="cpd-composer-footer">
            <button
              type="button"
              ref={attachButtonRef}
              className="cpd-composer-new"
              title="Add files, tools, or connections"
              aria-expanded={attachMenuOpen}
              onClick={toggleAttachMenu}
            >
              <Plus size={14} />
            </button>
            <div className="cpd-composer-spacer" />
            <button
              type="button"
              className="cpd-composer-send"
              onClick={() => sendProjectChat()}
              disabled={!draft.trim() && composerAttachments.length === 0}
              aria-label="Send"
            >
              <Send size={14} />
            </button>
          </div>
        </div>

        {/* chat list */}
        <div className="cpd-chat-section">
          {loadingChats ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : chats.length === 0 ? (
            <div className="cpd-chat-empty">
              No chats in this project yet. Start one above — Agent Sam opens in the panel with this project linked.
            </div>
          ) : (
            <ul className="cpd-chat-list">
              {chats.map((s) => {
                const id = s.conversation_id ?? s.id ?? '';
                const incomplete =
                  s.last_turn_status === 'interrupted' ||
                  s.last_turn_status === 'failed' ||
                  s.last_turn_status === 'done_no_token';
                return (
                  <li key={id} className="cpd-chat-row group">
                    <button
                      type="button"
                      className="cpd-chat-btn"
                      onClick={() => resumeChat(s)}
                    >
                      <span className="cpd-chat-title">{s.title || 'Untitled chat'}</span>
                      {incomplete && (
                        <span className="cpd-chat-badge cpd-chat-badge--err">Incomplete</span>
                      )}
                    </button>
                    <span className="cpd-chat-time">
                      Last message {relTime(s.updated_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        </div>
      </div>

      {/* ── desktop right rail ── */}
      {!isMobile && (
        <aside className="cpd-right">
          {railContent}
        </aside>
      )}

      {/* ── mobile bottom sheet ── */}
      {isMobile && railOpen && (
        <>
          {/* backdrop */}
          <div
            className="cpd-sheet-backdrop"
            onClick={() => setRailOpen(false)}
          />
          {/* sheet */}
          <div className="cpd-sheet">
            <div className="cpd-sheet-header">
              <span className="cpd-sheet-title">Project Details</span>
              <button
                type="button"
                className="cpd-icon-btn"
                onClick={() => setRailOpen(false)}
                aria-label="Close"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div className="cpd-sheet-body">
              {railContent}
            </div>
          </div>
        </>
      )}

      <ProjectShareModal
        project={project && shareOpen ? { id: project.id, name: project.name } : null}
        onClose={() => setShareOpen(false)}
        onToast={setToast}
      />

      <RailEditorModal
        open={railEditor === 'memory'}
        isMobile={isMobile}
        title="Set project memory"
        mobileTitle="Memory"
        subtitle="Key context Agent Sam should always know about this project. Only you can see this on the project page."
        saving={memBusy}
        saveLabel="Save memory"
        onClose={closeRailEditor}
        onSave={() => void saveMemoryFromModal()}
      >
        <textarea
          className={`cpd-editor-textarea${isMobile ? ' cpd-editor-textarea--sheet' : ''}`}
          autoFocus
          value={memDraft}
          onChange={(e) => setMemDraft(e.target.value)}
          placeholder="Companions of CPAS — nonprofit rescue, companionsofcaddo.org, worker companionscpas…"
        />
      </RailEditorModal>

      <RailEditorModal
        open={railEditor === 'instructions'}
        isMobile={isMobile}
        title="Set project instructions"
        mobileTitle="Instructions"
        subtitle="Tailor how Agent Sam responds on this project. Require AGENTSAM.md sync, deploy rules, and binding format here."
        saving={instrBusy}
        saveLabel="Save instructions"
        onClose={closeRailEditor}
        onSave={() => void saveInstructionsFromModal()}
      >
        <textarea
          className={`cpd-editor-textarea${isMobile ? ' cpd-editor-textarea--sheet' : ''}`}
          autoFocus
          value={instrDraft}
          onChange={(e) => setInstrDraft(e.target.value)}
          placeholder="AGENTSAM.md required — read before any code, CMS, or deploy work…"
        />
      </RailEditorModal>

      <RailEditorModal
        open={railEditor === 'cover'}
        isMobile={isMobile}
        title="Project cover"
        mobileTitle="Cover"
        subtitle="Shown on the projects grid and home preview for this build."
        showSave={false}
        onClose={closeRailEditor}
      >
        <div className="cpd-editor-cover">
          {coverUrl ? (
            <img src={cfImageVariants(coverUrl).src} alt="" className="cpd-editor-cover-img" />
          ) : (
            <div className="cpd-editor-cover-empty">No cover image yet</div>
          )}
          <button
            type="button"
            className="cpd-btn cpd-btn--primary"
            disabled={coverUploading}
            onClick={() => coverInputRef.current?.click()}
          >
            {coverUploading ? 'Uploading…' : coverUrl ? 'Change cover photo' : 'Upload cover photo'}
          </button>
        </div>
      </RailEditorModal>

      <RailEditorModal
        open={railEditor === 'files'}
        isMobile={isMobile}
        title="Project files"
        mobileTitle="Files"
        subtitle="Images, PDFs, and docs attached for Agent Sam and your team."
        showSave={false}
        onClose={closeRailEditor}
      >
        {filesDropZone('cpd-files-drop--modal')}
        {filesGallery}
        {filesDocList}
      </RailEditorModal>

      <RailEditorModal
        open={railEditor === 'stats'}
        isMobile={isMobile}
        title="Quick stats"
        mobileTitle="Stats"
        subtitle={`${project?.name || 'Project'} · ${clientContact?.client_name || project?.client_id || ''}`}
        showSave={false}
        onClose={closeRailEditor}
      >
        <ProjectQuickStats
          todos={projectTodos.items}
          todosLoading={projectTodos.loading}
          tasksInsights={tasksInsights}
          timerRunning={timerState.running}
          timerBusy={timerState.busy}
          timerMinutesToday={timerState.minutesToday}
          onToggleTimer={() => void toggleProjectTimer()}
          onOpenTasks={() => { closeRailEditor(); openProjectTasks(); }}
          onOpenCalendar={() => { closeRailEditor(); openProjectCalendar(); }}
          metric={statsMetric}
          onMetricChange={setStatsMetric}
          period={statsPeriod}
          onPeriodChange={setStatsPeriod}
        />
        {clientContact?.payment_notes ? (
          <p className="cpd-insights-contact">{clientContact.payment_notes}</p>
        ) : null}
      </RailEditorModal>

      <RailEditorModal
        open={railEditor === 'brand'}
        isMobile={isMobile}
        title="Brand assets"
        mobileTitle="Brand"
        subtitle={
          storageScope
            ? `Uploads go to ${storageScope.bucket} · ${storageScope.prefix} — not platform inneranimalmedia when client bucket is set.`
            : 'Logos, icons, and color references for this client.'
        }
        showSave={false}
        onClose={closeRailEditor}
      >
        <div className="cpd-brand-token-row">
          <label className="cpd-brand-token-field">
            <span>Primary</span>
            <input
              type="color"
              value={brandTokens.primary_color || '#22d3ee'}
              onChange={(e) => setBrandTokens((t) => ({ ...t, primary_color: e.target.value }))}
            />
          </label>
          <label className="cpd-brand-token-field">
            <span>Accent</span>
            <input
              type="color"
              value={brandTokens.accent_color || '#6366f1'}
              onChange={(e) => setBrandTokens((t) => ({ ...t, accent_color: e.target.value }))}
            />
          </label>
          <button
            type="button"
            className="cpd-btn cpd-btn--ghost sm"
            onClick={async () => {
              if (!project) return;
              const ok = await persistProjectMeta({
                brand_tokens: { ...brandTokens, verified_at: Date.now() },
              });
              if (ok) setToast('Brand colors saved');
            }}
          >
            Save colors
          </button>
        </div>
        {brandDropZone('cpd-files-drop--modal')}
        {brandGallery}
        <button type="button" className="cpd-btn cpd-btn--ghost cpd-brand-browser-link" onClick={openBrandAssetBrowser}>
          <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
          Open full asset browser
        </button>
      </RailEditorModal>

      <input
        ref={brandInputRef}
        type="file"
        accept="image/*"
        multiple
        className="cpd-hidden-input"
        onChange={(e) => void appendBrandAssets(e.target.files)}
      />

      {deleteOpen && project && (
        <div
          className="cpd-modal-backdrop"
          role="presentation"
          onClick={() => !deleteBusy && setDeleteOpen(false)}
        >
          <div
            className="cpd-modal"
            role="dialog"
            aria-labelledby="cpd-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cpd-delete-title" className="cpd-modal-title">Delete project</h2>
            <p className="cpd-modal-body">
              <strong>{project.name}</strong>
              {project.workspace_id ? (
                <span className="cpd-modal-meta"> · {project.workspace_id}</span>
              ) : null}
            </p>
            <p className="cpd-modal-hint">
              This permanently removes the project and its memory, files metadata, and collaborators. This cannot be undone.
            </p>
            <div className="cpd-modal-actions">
              <button
                type="button"
                className="cpd-btn cpd-btn--danger"
                disabled={deleteBusy}
                onClick={() => void submitDelete()}
              >
                {deleteBusy ? 'Deleting…' : 'Delete project'}
              </button>
              <button
                type="button"
                className="cpd-btn"
                disabled={deleteBusy}
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {previewImage ? (
        <div
          className="cpd-lightbox"
          role="dialog"
          aria-label={previewImage.name}
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            className="cpd-lightbox-close"
            aria-label="Close"
            onClick={() => setPreviewImage(null)}
          >
            <X size={20} />
          </button>
          <img
            src={cfImageVariants(previewImage.url).src}
            alt={previewImage.name}
            className="cpd-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="cpd-lightbox-caption">{previewImage.name}</p>
        </div>
      ) : null}

      {toast && <div className="cpd-toast" role="status">{toast}</div>}
      {renderAttachMenuPortal()}
      <input
        ref={composerAttachRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.json"
        hidden
        onChange={(e) => {
          onComposerFiles(e.target.files);
          if (composerAttachRef.current) composerAttachRef.current.value = '';
        }}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void handleCoverPick(e.target.files)}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => void appendProjectFiles(e.target.files)}
      />
    </div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
/* root: left col + right rail */
.cpd-root {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  background: var(--dashboard-canvas);
  color: var(--color-main, #e2e8f0);
  overflow: hidden;
}

/* ── left column ── */
.cpd-left {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: visible;
  padding: 24px 0 0;
  max-width: 660px;
  margin: 0 auto;
  width: 100%;
}
.cpd-left-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 60px;
}

/* back */
.cpd-back-row {
  padding: 0 28px;
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.cpd-back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--color-muted, #94a3b8);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: color 0.12s;
}
.cpd-back:hover { color: var(--color-main, #e2e8f0); }

/* mobile details toggle */
.cpd-details-toggle {
  font-size: 12px;
  color: var(--solar-cyan, #22d3ee);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.1s;
}
.cpd-details-toggle:hover { background: rgba(34,211,238,0.08); }

/* title */
.cpd-title-section {
  padding: 0 28px;
  margin-bottom: 20px;
  position: relative;
  z-index: 60;
  overflow: visible;
}
.cpd-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  overflow: visible;
}
.cpd-title {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0;
  line-height: 1.15;
  flex: 1;
  min-width: 0;
}
.cpd-title-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  overflow: visible;
}
.cpd-rename-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cpd-rename-input {
  flex: 1;
  font-size: 22px;
  font-weight: 600;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--solar-cyan, #22d3ee);
  color: inherit;
  outline: none;
  padding: 2px 4px;
}

/* icon btn */
.cpd-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-muted, #94a3b8);
  cursor: pointer;
  font-size: 12px;
  transition: background 0.1s, color 0.1s;
}
.cpd-icon-btn:hover { background: var(--bg-hover); color: var(--color-main, #e2e8f0); }
.cpd-icon-btn:disabled { opacity: 0.4; cursor: default; }

/* more menu */
.cpd-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: auto;
  z-index: 200;
  min-width: 200px;
  border-radius: 10px;
  border: 1px solid var(--dashboard-border);
  background: var(--bg-elevated, #1e2130);
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  padding: 4px 0;
}
.cpd-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  font-size: 13px;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  transition: background 0.1s;
}
.cpd-menu-item:hover { background: var(--bg-hover); }
.cpd-menu-item--danger { color: #f87171; }
.cpd-menu-item--danger:hover { background: rgba(248, 113, 113, 0.12); }

.cpd-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.cpd-modal {
  width: min(420px, 100%);
  border-radius: 12px;
  border: 1px solid var(--dashboard-border);
  background: var(--bg-elevated, #1e2130);
  padding: 20px 22px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
}
.cpd-modal-title { margin: 0 0 10px; font-size: 18px; font-weight: 600; }
.cpd-modal-body { margin: 0 0 8px; font-size: 14px; line-height: 1.45; }
.cpd-modal-meta { color: var(--color-muted, #94a3b8); font-size: 12px; }
.cpd-modal-hint { margin: 0 0 16px; font-size: 12px; color: var(--color-muted, #94a3b8); line-height: 1.5; }
.cpd-modal-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.cpd-btn {
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
  background: transparent;
  color: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
  cursor: pointer;
}
.cpd-btn--danger {
  border-color: rgba(248, 113, 113, 0.45);
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
}
.cpd-btn--primary {
  border-color: rgba(34, 211, 238, 0.35);
  background: rgba(34, 211, 238, 0.18);
  color: var(--color-main, #e2e8f0);
}
.cpd-btn--primary:hover:not(:disabled) {
  background: rgba(34, 211, 238, 0.28);
}
.cpd-btn:disabled { opacity: 0.5; cursor: default; }

/* ── rail preview cards (Claude-style — click to expand) ── */
.cpd-rail-preview {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--dashboard-border);
  background: var(--dashboard-panel, rgba(255,255,255,0.03));
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.cpd-rail-preview:hover {
  border-color: rgba(34, 211, 238, 0.35);
  background: rgba(34, 211, 238, 0.06);
}
.cpd-rail-preview-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--color-main, #e2e8f0);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 5.5em;
  overflow: hidden;
}
.cpd-rail-preview-empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-muted, #94a3b8);
}
.cpd-rail-preview-foot {
  font-size: 10px;
  color: var(--color-muted, #94a3b8);
}
.cpd-rail-preview--cover { padding: 8px; }
.cpd-rail-cover-thumb {
  width: 100%;
  max-height: 88px;
  object-fit: cover;
  border-radius: 8px;
  display: block;
}
.cpd-rail-files-mini {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.cpd-rail-files-mini img {
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--dashboard-border);
}
.cpd-quick-stats--compact { margin: 0; }
.cpd-rail-actions { display: flex; align-items: center; gap: 2px; }
.cpd-rail-preview-inner {
  display: block;
  width: 100%;
  padding: 0;
  margin: 8px 0 0;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.cpd-rail-preview--stats { cursor: default; }
.cpd-spin { animation: cpd-spin 0.85s linear infinite; }
@keyframes cpd-spin { to { transform: rotate(360deg); } }
.cpd-timer-widget {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: 8px 10px;
  margin-bottom: 8px;
  border-radius: 10px;
  border: 1px solid var(--dashboard-border);
  background: rgba(255,255,255,0.02);
}
.cpd-timer-widget--running {
  border-color: rgba(34, 197, 94, 0.45);
  background: rgba(34, 197, 94, 0.08);
}
.cpd-timer-widget--modal { margin-bottom: 14px; }
.cpd-timer-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.cpd-timer-btn--start {
  background: rgba(34, 211, 238, 0.15);
  border-color: rgba(34, 211, 238, 0.35);
  color: #67e8f9;
}
.cpd-timer-btn--stop {
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.35);
  color: #fca5a5;
}
.cpd-timer-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.cpd-timer-label { font-size: 11px; color: var(--color-muted, #94a3b8); }
.cpd-timer-mins { font-size: 11px; font-weight: 600; margin-left: auto; }
.cpd-brand-swatches { display: flex; gap: 6px; margin-bottom: 6px; }
.cpd-brand-swatch {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.15);
}
.cpd-brand-swatch--muted { opacity: 0.72; }
.cpd-brand-drop .cpd-files-text { font-size: 12px; }
.cpd-brand-token-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 14px;
}
.cpd-brand-token-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--color-muted, #94a3b8);
}
.cpd-brand-token-field input[type="color"] {
  width: 44px;
  height: 32px;
  padding: 2px;
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
  background: transparent;
  cursor: pointer;
}
.cpd-brand-browser-link { margin-top: 12px; display: inline-flex; align-items: center; gap: 6px; }
.cpd-stats-links { display: flex; flex-wrap: wrap; gap: 10px; }
.cpd-btn--ghost {
  background: transparent;
  border: 1px solid var(--dashboard-border);
  color: inherit;
}
.cpd-btn--ghost.sm { padding: 6px 10px; font-size: 12px; }
.cpd-hidden-input { display: none; }

/* ── project insights (Collaborate Time insights parity, dark rail) ── */
.cpd-insights { padding: 2px 0 4px; }
.cpd-insights--compact .cpd-insights-donut { width: 88px; height: 88px; margin: 8px auto 10px; }
.cpd-insights--compact .cpd-insights-subhead h3 { font-size: 11px; }
.cpd-insights-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 8px;
}
.cpd-insights-kicker { font-size: 10px; color: var(--color-muted, #94a3b8); text-transform: uppercase; letter-spacing: 0.06em; }
.cpd-insights-title { font-size: 13px; font-weight: 600; color: var(--color-main, #e2e8f0); }
.cpd-insights-live {
  font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  color: #86efac; background: rgba(34, 197, 94, 0.15); border-radius: 999px; padding: 3px 8px;
}
.cpd-insights-switch, .cpd-insights-metric-switch {
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 8px;
  border: 1px solid var(--dashboard-border); border-radius: 10px; padding: 3px; background: rgba(255,255,255,0.02);
}
.cpd-insights-metric-switch { grid-template-columns: repeat(3, 1fr); margin-bottom: 10px; }
.cpd-insights-switch button, .cpd-insights-metric-switch button {
  border: 0; background: transparent; color: var(--color-muted, #94a3b8);
  font-size: 11px; font-weight: 600; padding: 6px 8px; border-radius: 8px; cursor: pointer;
}
.cpd-insights-switch button.active, .cpd-insights-metric-switch button.active {
  background: rgba(34, 211, 238, 0.14); color: #67e8f9;
}
.cpd-insights-timer-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;
}
.cpd-insights-today { font-size: 12px; color: var(--color-muted, #94a3b8); }
.cpd-insights-today strong { color: #93c5fd; font-size: 13px; margin-left: 4px; }
.cpd-insights-donut {
  width: 112px; height: 112px; border-radius: 50%; margin: 4px auto 12px; position: relative;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
}
.cpd-insights-donut::after {
  content: ''; position: absolute; inset: 22%; border-radius: 50%;
  background: var(--bg-elevated, #1e2130); box-shadow: inset 0 0 0 1px var(--dashboard-border);
}
.cpd-insights-breakdown { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.cpd-insights-break-row {
  display: grid; grid-template-columns: 10px 1fr auto; align-items: center; gap: 8px;
  font-size: 11px; color: var(--color-muted, #94a3b8);
}
.cpd-insights-break-row strong { color: var(--color-main, #e2e8f0); font-size: 11px; }
.cpd-insights-dot { width: 8px; height: 8px; border-radius: 50%; }
.cpd-insights-dot--open { background: #4285f4; }
.cpd-insights-dot--done { background: #34a853; }
.cpd-insights-dot--pct { background: #039be5; }
.cpd-insights-rule { height: 1px; background: var(--dashboard-border); margin: 10px 0; }
.cpd-insights-subhead {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;
}
.cpd-insights-subhead h3 { margin: 0; font-size: 12px; font-weight: 600; color: var(--color-main, #e2e8f0); }
.cpd-insights-subhead span { font-size: 12px; color: #93c5fd; font-weight: 700; }
.cpd-insights-empty { margin: 0 0 8px; font-size: 11px; color: var(--color-muted, #94a3b8); line-height: 1.45; }
.cpd-insights-task-list { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.cpd-insights-task-btn {
  width: 100%; text-align: left; border: 1px solid var(--dashboard-border); background: rgba(255,255,255,0.02);
  border-radius: 8px; padding: 7px 9px; cursor: pointer; color: inherit;
}
.cpd-insights-task-btn:hover { border-color: rgba(34, 211, 238, 0.35); background: rgba(34, 211, 238, 0.06); }
.cpd-insights-task-title { display: block; font-size: 11px; font-weight: 600; color: var(--color-main, #e2e8f0); }
.cpd-insights-task-cat { display: block; margin-top: 2px; font-size: 10px; color: var(--color-muted, #94a3b8); }
.cpd-insights-links { display: flex; flex-wrap: wrap; gap: 6px; }
.cpd-insights-contact {
  margin: 14px 0 0; padding-top: 12px; border-top: 1px solid var(--dashboard-border);
  font-size: 12px; line-height: 1.55; color: var(--color-muted, #94a3b8);
}
.cpd-brand-rail {
  border: 1px dashed var(--dashboard-border); border-radius: 10px; padding: 10px;
  transition: border-color 0.12s, background 0.12s;
}
.cpd-brand-rail--over { border-color: rgba(34, 211, 238, 0.55); background: rgba(34, 211, 238, 0.08); }
.cpd-brand-rail-grid { margin: 6px 0; }
.cpd-brand-rail-thumb {
  width: 40px; height: 40px; padding: 0; border: 1px solid var(--dashboard-border);
  border-radius: 8px; overflow: hidden; background: rgba(255,255,255,0.03); cursor: pointer;
}
.cpd-brand-rail-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

/* ── editor modals (large read/edit) ── */
.cpd-editor-backdrop { z-index: 520; }
.cpd-editor-modal {
  width: min(640px, 100%);
  max-height: min(88vh, 720px);
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  border: 1px solid var(--dashboard-border);
  background: var(--bg-elevated, #1e2130);
  padding: 22px 24px 20px;
  box-shadow: 0 20px 56px rgba(0, 0, 0, 0.5);
}
.cpd-editor-modal-title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.cpd-editor-modal-subtitle {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--color-muted, #94a3b8);
}
.cpd-editor-modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-bottom: 16px;
}
.cpd-editor-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
  padding-top: 4px;
}
.cpd-editor-textarea {
  width: 100%;
  min-height: min(360px, 50vh);
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--dashboard-border);
  background: var(--dashboard-canvas, rgba(0,0,0,0.2));
  color: inherit;
  font-size: 14px;
  line-height: 1.65;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
}
.cpd-editor-textarea:focus {
  border-color: var(--solar-cyan, #22d3ee);
  box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.2);
}
.cpd-editor-cover {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.cpd-editor-cover-img {
  width: 100%;
  max-height: min(420px, 55vh);
  object-fit: contain;
  border-radius: 10px;
  border: 1px solid var(--dashboard-border);
  background: rgba(0,0,0,0.2);
}
.cpd-editor-cover-empty {
  width: 100%;
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px dashed var(--dashboard-border);
  color: var(--color-muted, #94a3b8);
  font-size: 13px;
}
.cpd-files-drop--modal { min-height: 140px; }
.cpd-quick-stats--modal { margin-bottom: 16px; }
.cpd-quick-stat--wide { grid-column: 1 / -1; }

/* ── mobile editor bottom sheet (Claude-style) ── */
.cpd-editor-sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 560;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.cpd-editor-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 561;
  display: flex;
  flex-direction: column;
  max-height: min(92dvh, 720px);
  border-radius: 20px 20px 0 0;
  border-top: 1px solid var(--dashboard-border);
  background: var(--bg-elevated, #1a1d2e);
  box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.45);
  animation: cpd-sheet-in 0.28s cubic-bezier(0.32, 0.72, 0, 1);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.cpd-editor-sheet-grab {
  flex-shrink: 0;
  width: 36px;
  height: 4px;
  margin: 10px auto 4px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.45);
}
.cpd-editor-sheet-toolbar {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 12px;
  flex-shrink: 0;
}
.cpd-editor-sheet-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cpd-editor-sheet-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-main, #e2e8f0);
  cursor: pointer;
}
.cpd-editor-sheet-icon:disabled {
  opacity: 0.45;
  cursor: default;
}
.cpd-editor-sheet-icon--save {
  background: rgba(34, 211, 238, 0.16);
  color: var(--solar-cyan, #22d3ee);
}
.cpd-editor-sheet-icon-spacer {
  width: 40px;
  height: 40px;
}
.cpd-editor-sheet-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cpd-editor-sheet-body {
  flex: 1;
  min-height: 0;
}
.cpd-editor-sheet-subtitle {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--color-muted, #94a3b8);
  flex-shrink: 0;
}
.cpd-editor-textarea--sheet {
  min-height: 200px;
  height: 100%;
  font-size: 16px;
  line-height: 1.6;
  border-radius: 12px;
  padding: 16px;
}

/* ── composer ── */
.cpd-composer {
  margin: 0 28px 24px;
  border-radius: 12px;
  border: 1px solid var(--dashboard-border);
  background: var(--dashboard-panel, rgba(255,255,255,0.03));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.cpd-composer:focus-within {
  border-color: rgba(255,255,255,0.15);
  box-shadow: 0 0 0 1px rgba(255,255,255,0.06);
}
.cpd-composer-input {
  width: 100%;
  padding: 16px 16px 8px;
  background: transparent;
  border: none;
  color: inherit;
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  resize: none;
  box-sizing: border-box;
  min-height: 52px;
}
.cpd-composer-input::placeholder { color: var(--color-muted, #94a3b8); }
.cpd-composer-footer {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  gap: 8px;
}
.cpd-composer-spacer { flex: 1; }
.cpd-composer-new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--dashboard-border);
  background: transparent;
  color: var(--color-muted, #94a3b8);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.cpd-composer-new:hover { background: var(--bg-hover); color: var(--color-main, #e2e8f0); }
.cpd-composer-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: var(--color-main, #e2e8f0);
  color: var(--dashboard-canvas, #0f1117);
  cursor: pointer;
  transition: opacity 0.1s;
}
.cpd-composer-send:disabled { opacity: 0.3; cursor: default; }

.cpd-composer-source-chips {
  padding: 0 2px 8px;
}

.cpd-composer-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 2px 8px;
}
.cpd-composer-attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 180px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--dashboard-border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-muted, #94a3b8);
}
.cpd-composer-attach-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cpd-composer-attach-remove {
  display: flex;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  opacity: 0.7;
}
.cpd-composer-attach-remove:hover { opacity: 1; }
.cpd-composer-link {
  font-size: 11px;
  color: var(--solar-cyan, #22d3ee);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
}
.cpd-composer-link:hover { text-decoration: underline; }

.cpd-thread {
  margin: 0 0 16px;
  max-height: min(420px, 42vh);
  overflow-y: auto;
  border: 1px solid var(--dashboard-border);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.15);
}
.cpd-thread-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--dashboard-border);
  position: sticky;
  top: 0;
  background: var(--bg-elevated, #1a1d2e);
  z-index: 1;
}
.cpd-thread-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted, #94a3b8);
}
.cpd-thread-new {
  font-size: 11px;
  color: var(--solar-cyan, #22d3ee);
  background: none;
  border: none;
  cursor: pointer;
}
.cpd-thread-loading {
  padding: 16px 12px;
  font-size: 12px;
  color: var(--color-muted, #94a3b8);
}
.cpd-thread-messages {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}
.cpd-thread-bubble {
  max-width: 92%;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.cpd-thread-bubble--user {
  align-self: flex-end;
  background: rgba(34, 211, 238, 0.12);
  border: 1px solid rgba(34, 211, 238, 0.25);
}
.cpd-thread-bubble--assistant {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--dashboard-border);
}

/* ── chat list ── */
.cpd-chat-section {
  padding: 0 28px;
}
.cpd-chat-empty {
  font-size: 13px;
  color: var(--color-muted, #94a3b8);
  padding: 16px 0;
}
.cpd-toast {
  position: fixed;
  bottom: 72px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1400;
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid var(--dashboard-border);
  background: var(--bg-elevated, #1a1f2e);
  font-size: 13px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
}
.cpd-chat-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cpd-chat-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
  transition: background 0.1s;
  border-radius: 6px;
  cursor: pointer;
}
.cpd-chat-row:hover { background: var(--bg-hover, rgba(255,255,255,0.04)); padding-left: 8px; padding-right: 8px; margin: 0 -8px; }
.cpd-chat-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
  padding: 0;
}
.cpd-chat-title {
  font-size: 14px;
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.cpd-chat-badge {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid var(--dashboard-border);
  color: var(--color-muted, #94a3b8);
}
.cpd-chat-badge--err {
  border-color: rgba(239,68,68,0.4);
  color: #f87171;
}
.cpd-chat-time {
  font-size: 12px;
  color: var(--color-muted, #94a3b8);
}

/* ── desktop right rail ── */
.cpd-right {
  width: 320px;
  min-width: 320px;
  max-width: 320px;
  border-left: 1px solid var(--dashboard-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-shrink: 0;
  padding: 20px 0 40px;
}

/* ── rail sections (shared desktop + mobile sheet) ── */
.cpd-rail-section {
  border-bottom: 1px solid var(--dashboard-border);
  padding: 16px 20px;
}
.cpd-rail-section:last-child { border-bottom: none; }

.cpd-rail-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.cpd-rail-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  text-align: left;
}
.cpd-rail-chevron {
  display: flex;
  align-items: center;
  color: var(--color-muted, #94a3b8);
}
.cpd-rail-section-action {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cpd-rail-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--dashboard-border);
  color: var(--color-muted, #94a3b8);
  font-weight: 400;
}

.cpd-rail-section-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cpd-quick-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin: 0;
}
.cpd-quick-stat { margin: 0; min-width: 0; }
.cpd-quick-stat dt {
  margin: 0 0 2px;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-muted, #94a3b8);
}
.cpd-quick-stat dd {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-main, #e2e8f0);
}
.cpd-quick-stat-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 500;
  word-break: break-all;
}
.cpd-rail-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  color: var(--solar-cyan, #22d3ee);
  cursor: pointer;
  text-align: left;
}
.cpd-rail-link-btn:hover { text-decoration: underline; }

.cpd-rail-textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
  background: var(--dashboard-panel, rgba(255,255,255,0.03));
  color: inherit;
  font-size: 12px;
  line-height: 1.6;
  outline: none;
  resize: vertical;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.cpd-rail-textarea:focus { border-color: var(--solar-cyan, #22d3ee); }
.cpd-rail-textarea::placeholder { color: var(--color-muted, #94a3b8); }

.cpd-rail-save {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--dashboard-border);
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s;
  align-self: flex-start;
}
.cpd-rail-save:hover { background: var(--bg-hover); }

.cpd-rail-empty-btn {
  width: 100%;
  text-align: left;
  font-size: 12px;
  color: var(--color-muted, #94a3b8);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  line-height: 1.5;
  transition: color 0.1s;
}
.cpd-rail-empty-btn:hover { color: var(--color-main, #e2e8f0); }

/* files */
.cpd-files-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 10px;
  text-align: center;
  border-radius: 10px;
  border: 1px dashed var(--dashboard-border);
  transition: border-color 0.12s, background 0.12s;
}
.cpd-files-drop--over {
  border-color: var(--solar-cyan, #22d3ee);
  background: rgba(34, 211, 238, 0.06);
}
.cpd-files-icon { color: var(--color-muted, #94a3b8); opacity: 0.4; }
.cpd-files-text {
  font-size: 12px;
  color: var(--color-muted, #94a3b8);
  margin: 0;
  max-width: 240px;
  line-height: 1.5;
}
.cpd-files-text code { font-size: 10px; }
.cpd-files-gallery {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 12px;
}
.cpd-files-thumb {
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid var(--dashboard-border);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.2);
  transition: border-color 0.12s, transform 0.12s;
}
.cpd-files-thumb:hover {
  border-color: var(--solar-cyan, #22d3ee);
  transform: scale(1.02);
}
.cpd-files-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cpd-files-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cpd-files-list li {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
}
.cpd-files-doc-icon {
  flex-shrink: 0;
  color: var(--color-muted, #94a3b8);
  opacity: 0.85;
}
.cpd-files-list a {
  flex: 1;
  min-width: 0;
  color: var(--solar-cyan, #22d3ee);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cpd-lightbox {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.cpd-lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
}
.cpd-lightbox-img {
  max-width: min(960px, 92vw);
  max-height: 80vh;
  object-fit: contain;
  border-radius: 8px;
}
.cpd-lightbox-caption {
  margin: 12px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  max-width: 480px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cpd-cover-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cpd-cover-preview img {
  width: 100%;
  max-height: 120px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
}

/* ── mobile bottom sheet ── */
.cpd-sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 50;
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.cpd-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 51;
  background: var(--bg-elevated, #1a1d2e);
  border-top: 1px solid var(--dashboard-border);
  border-radius: 20px 20px 0 0;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  animation: cpd-sheet-in 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes cpd-sheet-in {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

.cpd-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--dashboard-border);
  flex-shrink: 0;
}

.cpd-sheet-title {
  font-size: 15px;
  font-weight: 600;
}

.cpd-sheet-body {
  overflow-y: auto;
  flex: 1;
  padding-bottom: env(safe-area-inset-bottom, 16px);
}

/* ── mobile overrides ── */
@media (max-width: 768px) {
  .cpd-root {
    overflow: visible;
  }
  .cpd-left {
    max-width: 100%;
    padding: 16px 0 80px;
  }
  .cpd-back-row {
    padding: 0 16px;
    margin-bottom: 14px;
  }
  .cpd-title-section {
    padding: 0 16px;
    margin-bottom: 16px;
  }
  .cpd-title {
    font-size: 22px;
  }
  .cpd-composer {
    margin: 0 16px 20px;
  }
  .cpd-chat-section {
    padding: 0 16px;
  }
  .cpd-chat-row:hover {
    padding-left: 6px;
    padding-right: 6px;
    margin: 0 -6px;
  }
}

@media (max-width: 480px) {
  .cpd-title { font-size: 20px; }
  .cpd-rail-textarea { font-size: 14px; }
  .cpd-composer-input { font-size: 16px; /* prevents iOS zoom */ }
}

/* skeleton */
.cpd-skel {
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--dashboard-border) 25%,
    rgba(255,255,255,0.06) 50%,
    var(--dashboard-border) 75%
  );
  background-size: 200% 100%;
  animation: cpd-shimmer 1.4s ease-in-out infinite;
}
@keyframes cpd-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;
