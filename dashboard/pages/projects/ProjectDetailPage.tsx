import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Paperclip,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Share2,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { deleteProject, fetchProjectMemory, updateProject, updateProjectMemory } from '../../api/projects';
import { ProjectShareModal } from '../../components/projects/ProjectShareModal';
import { uploadProjectR2File } from '../../src/lib/projectR2Upload';
import { cfImageVariants } from '../../src/lib/projectBranding';
import { useWorkspace } from '../../src/context/WorkspaceContext';
import {
  activateProjectWorkContext,
  readExecutionWorkspaceId,
} from '../../src/lib/activateProjectWorkContext';
import { chatGithubContextStorageKey } from '../../components/ChatAssistant/types';
import { useComposerConnectorSheet } from '../../hooks/useComposerConnectorSheet';
import { AgentComposerSourceChips } from '../../components/ChatAssistant/composer/AgentComposerSourceChips';
import {
  coverFromMeta,
  isProjectImageFile,
  parseProjectMeta,
  projectFilesFromMeta,
  type ProjectFileRef,
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
  priority?: string;
  priority_num?: number;
  project_type?: string;
  health?: number;
  progress?: number;
  activeTasks?: number;
  totalTasks?: number;
  completedTasks?: number;
  chat_project_id?: string | null;
  workspace_id?: string | null;
  metadata_json?: string | null;
  cover_image_url?: string | null;
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
          onClick={() => setOpen((v) => !v)}
        >
          {title}
          {badge}
          <span className="cpd-rail-chevron">
            {open ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />}
          </span>
        </button>
        {action && <div className="cpd-rail-section-action">{action}</div>}
      </div>
      {open && <div className="cpd-rail-section-body">{children}</div>}
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
    if (!previewImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewImage(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [previewImage]);

  // lock body scroll when mobile rail sheet is open
  useEffect(() => {
    if (isMobile && railOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, railOpen]);

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

  const saveMemory = async () => {
    if (!project || memBusy) return;
    setMemBusy(true);
    try {
      const res = await updateProjectMemory(project.id, { memory });
      setMemSaved(res.ok);
      if (!res.ok) setToast(res.error || 'Failed to save memory');
    } finally {
      setMemBusy(false);
    }
  };

  const saveInstructions = async () => {
    if (!project || instrBusy) return;
    setInstrBusy(true);
    try {
      const res = await updateProjectMemory(project.id, { instructions });
      setInstrSaved(res.ok);
      if (!res.ok) setToast(res.error || 'Failed to save instructions');
    } finally {
      setInstrBusy(false);
    }
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
    setFileUploading(true);
    try {
      const added: ProjectFileRef[] = [];
      for (const file of list) {
        const out = await uploadProjectR2File(project.id, file, 'files', wsForUpload);
        if (!out.ok || !out.url) {
          setToast(out.error || `Upload failed: ${file.name}`);
          break;
        }
        added.push({
          name: file.name,
          url: out.url,
          uploaded_at: Date.now(),
          kind: file.type.startsWith('image/') ? 'image' : 'document',
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
    navigate(`/dashboard/collaborate?seg=tasks&project=${encodeURIComponent(project.id)}`);
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

  // ── rail content (shared between desktop aside and mobile sheet) ──
  const railContent = (
    <>
      <RailSection
        title="Cover"
        defaultOpen={!isMobile}
        action={
          <button
            type="button"
            className="cpd-icon-btn"
            title="Set cover photo"
            disabled={coverUploading}
            onClick={() => coverInputRef.current?.click()}
          >
            <ImageIcon size={14} strokeWidth={1.5} />
          </button>
        }
      >
        {coverUrl ? (
          <div className="cpd-cover-preview">
            <img src={cfImageVariants(coverUrl).src} alt="" />
            <button
              type="button"
              className="cpd-rail-empty-btn"
              disabled={coverUploading}
              onClick={() => coverInputRef.current?.click()}
            >
              {coverUploading ? 'Uploading…' : 'Change cover photo'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="cpd-rail-empty-btn"
            disabled={coverUploading}
            onClick={() => coverInputRef.current?.click()}
          >
            {coverUploading ? 'Uploading…' : 'Set cover for home & grid previews'}
          </button>
        )}
      </RailSection>

      <RailSection
        title="Memory"
        defaultOpen={!isMobile}
        badge={<span className="cpd-rail-badge">Only you</span>}
        action={
          <button type="button" className="cpd-icon-btn" title="Edit memory" onClick={() => {}}>
            <Pencil size={13} strokeWidth={1.5} />
          </button>
        }
      >
        <textarea
          className="cpd-rail-textarea"
          rows={4}
          value={memory}
          onChange={(e) => { setMemory(e.target.value); setMemSaved(false); }}
          placeholder="Key context Agent Sam should always know about this project..."
        />
        {memory && (
          <button type="button" className="cpd-rail-save" disabled={memBusy} onClick={() => void saveMemory()}>
            {memBusy ? 'Saving…' : memSaved ? 'Saved' : 'Save memory'}
          </button>
        )}
      </RailSection>

      <RailSection
        title="Instructions"
        defaultOpen={!isMobile}
        action={
          <button type="button" className="cpd-icon-btn" title="Add instructions" onClick={() => {}}>
            <Plus size={14} strokeWidth={1.5} />
          </button>
        }
      >
        {instructions ? (
          <>
            <textarea
              className="cpd-rail-textarea"
              rows={4}
              value={instructions}
              onChange={(e) => { setInstructions(e.target.value); setInstrSaved(false); }}
            />
            <button type="button" className="cpd-rail-save" disabled={instrBusy} onClick={() => void saveInstructions()}>
              {instrBusy ? 'Saving…' : instrSaved ? 'Saved' : 'Save instructions'}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="cpd-rail-empty-btn"
            onClick={() => setInstructions(' ')}
          >
            Add instructions to tailor Agent Sam responses
          </button>
        )}
      </RailSection>

      <RailSection
        title="Files"
        defaultOpen={!isMobile}
        action={
          <button
            type="button"
            className="cpd-icon-btn"
            title="Add file"
            disabled={fileUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
        }
      >
        <div
          className={`cpd-files-drop${fileDragOver ? ' cpd-files-drop--over' : ''}`}
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
        {imageFiles.length > 0 ? (
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
        ) : null}
        {documentFiles.length > 0 ? (
          <ul className="cpd-files-list">
            {documentFiles.map((f) => (
              <li key={`${f.url}-${f.name}`}>
                <a href={f.url} target="_blank" rel="noreferrer noopener">
                  {f.name}
                </a>
                <ExternalLink size={12} aria-hidden />
              </li>
            ))}
          </ul>
        ) : null}
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
.cpd-btn:disabled { opacity: 0.5; cursor: default; }

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
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
}
.cpd-files-list a {
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
