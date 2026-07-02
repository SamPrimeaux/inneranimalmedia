import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Code2,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

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
  cover_image_url?: string | null;
  dueDate?: string;
  workspace_id?: string | null;
}

interface ChatSession {
  conversation_id?: string;
  id?: string;
  title?: string;
  updated_at?: number | string;
  last_turn_status?: string;
  project_id?: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  production:  'var(--solar-green, #4ade80)',
  active:      'var(--solar-green, #4ade80)',
  development: 'var(--solar-cyan, #22d3ee)',
  design:      'var(--solar-cyan, #22d3ee)',
  staging:     'var(--solar-yellow, #fbbf24)',
  review:      'var(--solar-yellow, #fbbf24)',
  discovery:   'var(--color-muted, #94a3b8)',
  planning:    'var(--color-muted, #94a3b8)',
  blocked:     '#f87171',
  archived:    'var(--color-muted, #94a3b8)',
  complete:    'var(--color-muted, #94a3b8)',
};

const STATUS_LABELS: Record<string, string> = {
  production:  'Production',
  active:      'Active',
  development: 'In Development',
  design:      'Design',
  staging:     'Staging',
  review:      'Review',
  discovery:   'Discovery',
  planning:    'Planning',
  blocked:     'Blocked',
  archived:    'Archived',
  complete:    'Complete',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function relTime(raw?: number | string): string {
  if (!raw) return '';
  const ts = typeof raw === 'number' ? raw * 1000 : Date.parse(String(raw));
  if (Number.isNaN(ts)) return String(raw);
  const diff = Date.now() - ts;
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// ─── ProjectDetailPage ────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingChats, setLoadingChats] = useState(true);
  const [activeTab, setActiveTab] = useState<'chats' | 'instructions' | 'memory' | 'files'>('chats');

  // edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  // new chat
  const [chatBusy, setChatBusy] = useState(false);

  // instruction / memory editors (lightweight inline)
  const [instructions, setInstructions] = useState('');
  const [memory, setMemory] = useState('');
  const [instrSaved, setInstrSaved] = useState(false);
  const [memSaved, setMemSaved] = useState(false);

  // ── load project ──
  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setLoadingProject(true);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { credentials: 'same-origin' });
      if (!r.ok) { navigate('/dashboard/projects', { replace: true }); return; }
      const data = await r.json();
      const p: Project = data.project ?? data;
      setProject(p);
      setEditName(p.name ?? '');
      setEditDesc(p.description ?? '');
    } catch {
      navigate('/dashboard/projects', { replace: true });
    } finally {
      setLoadingProject(false);
    }
  }, [projectId, navigate]);

  // ── load chats scoped to this project ──
  const loadChats = useCallback(async () => {
    if (!projectId) return;
    setLoadingChats(true);
    try {
      const r = await fetch(`/api/agent/sessions?limit=100`, { credentials: 'same-origin' });
      const rows: ChatSession[] = r.ok ? await r.json() : [];
      // filter to sessions whose project_id matches this project
      const filtered = rows.filter(
        (s) => s.project_id === projectId
      );
      setChats(filtered);
    } catch {
      setChats([]);
    } finally {
      setLoadingChats(false);
    }
  }, [projectId]);

  useEffect(() => { void loadProject(); }, [loadProject]);
  useEffect(() => { void loadChats(); }, [loadChats]);

  // ── save edit ──
  const saveEdit = async () => {
    if (!project || editBusy) return;
    setEditBusy(true);
    try {
      await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
      });
      setEditing(false);
      await loadProject();
    } finally {
      setEditBusy(false);
    }
  };

  // ── start chat ──
  const startChat = async () => {
    if (!project || chatBusy) return;
    setChatBusy(true);
    try {
      // navigate to agent with project context
      const cid = project.chat_project_id || project.id;
      window.dispatchEvent(new CustomEvent('iam:agent:start-new-chat', {
        detail: { projectContext: cid, projectName: project.name },
      }));
      navigate('/dashboard/agent');
    } finally {
      setChatBusy(false);
    }
  };

  // ── resume chat ──
  const resumeChat = (s: ChatSession) => {
    const id = s.conversation_id ?? s.id ?? '';
    if (!id) return;
    window.dispatchEvent(new CustomEvent('iam:agent:resume-chat', {
      detail: { conversationId: id, title: s.title || 'Chat' },
    }));
    navigate('/dashboard/agent');
  };

  // ── status color ──
  const statusColor = project ? (STATUS_COLORS[project.status ?? ''] ?? 'var(--color-muted)') : '';
  const statusLabel = project ? (STATUS_LABELS[project.status ?? ''] ?? project.status_raw ?? '') : '';
  const pct = Math.min(100, Math.max(0, project?.progress ?? 0));

  if (loadingProject) {
    return (
      <div className="pd-root">
        <style>{DETAIL_CSS}</style>
        <div className="pd-loading">
          <div className="pd-skel pd-skel-title" />
          <div className="pd-skel pd-skel-badge" />
          <div className="pd-skel pd-skel-desc" />
          <div className="pd-skel pd-skel-desc" style={{ width: '55%' }} />
        </div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="pd-root">
      <style>{DETAIL_CSS}</style>

      <div className="pd-main">
        {/* ── back ── */}
        <button
          type="button"
          className="pd-back"
          onClick={() => navigate('/dashboard/projects')}
        >
          <ArrowLeft size={14} />
          All projects
        </button>

        {/* ── header ── */}
        <div className="pd-header">
          <div className="pd-header-left">
            {editing ? (
              <div className="pd-edit-form">
                <input
                  autoFocus
                  className="pd-edit-input pd-edit-input--name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveEdit();
                    if (e.key === 'Escape') setEditing(false);
                  }}
                />
                <input
                  className="pd-edit-input"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Description (optional)"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveEdit();
                    if (e.key === 'Escape') setEditing(false);
                  }}
                />
                <div className="pd-edit-actions">
                  <button type="button" className="pd-btn pd-btn--primary" disabled={editBusy} onClick={() => void saveEdit()}>
                    {editBusy ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="pd-btn" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="pd-title-row">
                  <h1 className="pd-title">{project.name}</h1>
                  <button
                    type="button"
                    className="pd-icon-btn"
                    title="Edit project"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                {project.description && (
                  <p className="pd-description">{project.description}</p>
                )}
              </>
            )}

            <div className="pd-meta-row">
              <span className="pd-status" style={{ color: statusColor }}>
                <span className="pd-status-dot" style={{ background: statusColor }} />
                {statusLabel}
              </span>
              {project.priority && (
                <span className="pd-badge">{project.priority}</span>
              )}
              {project.project_type && (
                <span className="pd-badge pd-badge--type">{project.project_type}</span>
              )}
            </div>

            {(project.totalTasks ?? 0) > 0 && (
              <div className="pd-progress-row">
                <div className="pd-progress-track">
                  <div className="pd-progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="pd-progress-label">
                  {project.completedTasks ?? 0}/{project.totalTasks ?? 0} tasks · {pct}%
                </span>
              </div>
            )}
          </div>

          <div className="pd-header-right">
            <button
              type="button"
              className="pd-btn pd-btn--primary pd-btn--lg"
              onClick={() => void startChat()}
              disabled={chatBusy}
            >
              <MessageSquare size={15} />
              {chatBusy ? 'Opening…' : 'New chat'}
            </button>
          </div>
        </div>

        {/* ── tab bar ── */}
        <div className="pd-tabs">
          {(['chats', 'instructions', 'memory', 'files'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`pd-tab${activeTab === t ? ' pd-tab--active' : ''}`}
              onClick={() => setActiveTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'chats' && chats.length > 0 && (
                <span className="pd-tab-count">{chats.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── tab body ── */}
        <div className="pd-tab-body">
          {/* chats */}
          {activeTab === 'chats' && (
            <div className="pd-section">
              {loadingChats ? (
                <div className="pd-empty">
                  <div className="pd-skel pd-skel-row" />
                  <div className="pd-skel pd-skel-row" />
                  <div className="pd-skel pd-skel-row" />
                </div>
              ) : chats.length === 0 ? (
                <div className="pd-empty">
                  <MessageSquare size={32} className="pd-empty-icon" />
                  <p className="pd-empty-text">No chats linked to this project yet.</p>
                  <button
                    type="button"
                    className="pd-btn pd-btn--primary"
                    onClick={() => void startChat()}
                  >
                    <Plus size={13} />
                    Start first chat
                  </button>
                </div>
              ) : (
                <ul className="pd-chat-list">
                  {chats.map((s) => {
                    const id = s.conversation_id ?? s.id ?? '';
                    const incomplete =
                      s.last_turn_status === 'interrupted' ||
                      s.last_turn_status === 'failed' ||
                      s.last_turn_status === 'done_no_token';
                    return (
                      <li key={id} className="pd-chat-row group">
                        <button
                          type="button"
                          className="pd-chat-main"
                          onClick={() => resumeChat(s)}
                        >
                          <span className="pd-chat-title">{s.title || 'Untitled chat'}</span>
                          {incomplete && (
                            <span className="pd-chat-badge pd-chat-badge--error">Incomplete</span>
                          )}
                        </button>
                        <span className="pd-chat-time">{relTime(s.updated_at)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* instructions */}
          {activeTab === 'instructions' && (
            <div className="pd-section">
              <div className="pd-section-header">
                <div className="pd-section-label">Project instructions</div>
                <p className="pd-section-hint">
                  Instructions are included in every Agent Sam chat started from this project.
                </p>
              </div>
              <textarea
                className="pd-textarea"
                rows={10}
                value={instructions}
                onChange={(e) => { setInstructions(e.target.value); setInstrSaved(false); }}
                placeholder="e.g. Always use TypeScript. Prefer Cloudflare Workers. Target Node 20…"
              />
              <div className="pd-section-actions">
                <button
                  type="button"
                  className="pd-btn pd-btn--primary"
                  onClick={() => {
                    // TODO: persist to /api/projects/:id/instructions
                    setInstrSaved(true);
                  }}
                >
                  {instrSaved ? '✓ Saved' : 'Save instructions'}
                </button>
              </div>
            </div>
          )}

          {/* memory */}
          {activeTab === 'memory' && (
            <div className="pd-section">
              <div className="pd-section-header">
                <div className="pd-section-label">Project memory</div>
                <p className="pd-section-hint">
                  Key context Agent Sam should always know about this project.
                </p>
              </div>
              <textarea
                className="pd-textarea"
                rows={10}
                value={memory}
                onChange={(e) => { setMemory(e.target.value); setMemSaved(false); }}
                placeholder="e.g. This is a Cloudflare Workers app. D1 db id is cf87b717. Main worker is src/index.js…"
              />
              <div className="pd-section-actions">
                <button
                  type="button"
                  className="pd-btn pd-btn--primary"
                  onClick={() => {
                    // TODO: persist to /api/projects/:id/memory
                    setMemSaved(true);
                  }}
                >
                  {memSaved ? '✓ Saved' : 'Save memory'}
                </button>
              </div>
            </div>
          )}

          {/* files */}
          {activeTab === 'files' && (
            <div className="pd-section">
              <div className="pd-section-header">
                <div className="pd-section-label">Project files</div>
                <p className="pd-section-hint">
                  PDFs, docs, or reference text that Agent Sam can use during project chats.
                </p>
              </div>
              <div className="pd-files-empty">
                <FolderOpen size={32} className="pd-empty-icon" />
                <p className="pd-empty-text">No files added yet.</p>
                <button type="button" className="pd-btn pd-btn--primary">
                  <Plus size={13} />
                  Add file
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const DETAIL_CSS = `
.pd-root {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  background: var(--dashboard-canvas);
  color: var(--color-main, #e2e8f0);
  overflow-y: auto;
}

/* centered column */
.pd-main {
  max-width: 780px;
  margin: 0 auto;
  width: 100%;
  padding: 28px 24px 60px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* back link */
.pd-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-muted, #94a3b8);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-bottom: 20px;
  transition: color 0.12s;
}
.pd-back:hover { color: var(--color-main, #e2e8f0); }

/* header */
.pd-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}
.pd-header-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.pd-header-right { flex-shrink: 0; }

/* title */
.pd-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pd-title {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0;
  line-height: 1.2;
}
.pd-description {
  font-size: 14px;
  color: var(--color-muted, #94a3b8);
  line-height: 1.6;
  margin: 0;
  max-width: 560px;
}

/* meta */
.pd-meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pd-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
}
.pd-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pd-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid var(--dashboard-border);
  color: var(--color-muted, #94a3b8);
}
.pd-badge--type {
  font-weight: 400;
  text-transform: capitalize;
}

/* progress */
.pd-progress-row { display: flex; align-items: center; gap: 10px; }
.pd-progress-track {
  flex: 1;
  max-width: 240px;
  height: 4px;
  border-radius: 2px;
  background: var(--dashboard-border);
  overflow: hidden;
}
.pd-progress-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--solar-cyan, #22d3ee);
  transition: width 0.3s;
}
.pd-progress-label { font-size: 12px; color: var(--color-muted, #94a3b8); }

/* buttons */
.pd-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
  background: transparent;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s;
  white-space: nowrap;
}
.pd-btn:hover:not(:disabled) { background: var(--bg-hover); }
.pd-btn:disabled { opacity: 0.4; cursor: default; }
.pd-btn--primary {
  background: var(--bg-elevated, rgba(255,255,255,0.08));
  border-color: transparent;
  font-weight: 500;
}
.pd-btn--primary:hover:not(:disabled) { background: var(--bg-hover); }
.pd-btn--lg { padding: 8px 18px; font-size: 14px; }

.pd-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-muted, #94a3b8);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.pd-icon-btn:hover { background: var(--bg-hover); color: var(--color-main, #e2e8f0); }

/* edit form */
.pd-edit-form { display: flex; flex-direction: column; gap: 8px; }
.pd-edit-input {
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid var(--dashboard-border);
  background: var(--dashboard-panel, rgba(255,255,255,0.04));
  color: inherit;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}
.pd-edit-input--name { font-size: 18px; font-weight: 600; }
.pd-edit-input:focus { border-color: var(--solar-cyan, #22d3ee); }
.pd-edit-input::placeholder { color: var(--color-muted, #94a3b8); }
.pd-edit-actions { display: flex; gap: 8px; }

/* tabs */
.pd-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--dashboard-border);
  margin-bottom: 0;
}
.pd-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--color-muted, #94a3b8);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}
.pd-tab:hover { color: var(--color-main, #e2e8f0); }
.pd-tab--active {
  color: var(--color-main, #e2e8f0);
  border-bottom-color: var(--solar-cyan, #22d3ee);
  font-weight: 500;
}
.pd-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--bg-elevated, rgba(255,255,255,0.08));
  font-size: 10px;
  font-weight: 600;
}

/* tab body */
.pd-tab-body { padding-top: 24px; }

.pd-section { display: flex; flex-direction: column; gap: 14px; }
.pd-section-header { display: flex; flex-direction: column; gap: 4px; }
.pd-section-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-muted, #94a3b8);
  opacity: 0.7;
}
.pd-section-hint { font-size: 13px; color: var(--color-muted, #94a3b8); margin: 0; }
.pd-section-actions { display: flex; gap: 8px; }

/* textarea */
.pd-textarea {
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--dashboard-border);
  background: var(--dashboard-panel, rgba(255,255,255,0.03));
  color: inherit;
  font-size: 13px;
  line-height: 1.6;
  outline: none;
  resize: vertical;
  font-family: 'SF Mono', 'Fira Code', monospace;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.pd-textarea:focus { border-color: var(--solar-cyan, #22d3ee); }
.pd-textarea::placeholder { color: var(--color-muted, #94a3b8); }

/* chat list */
.pd-chat-list { list-style: none; margin: 0; padding: 0; }
.pd-chat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
  border-radius: 6px;
  transition: background 0.1s;
}
.pd-chat-row:hover { background: var(--bg-hover, rgba(255,255,255,0.04)); }
.pd-chat-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  padding: 12px 8px;
}
.pd-chat-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 450;
}
.pd-chat-badge {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--dashboard-border);
  font-size: 10px;
  color: var(--color-muted, #94a3b8);
}
.pd-chat-badge--error {
  border-color: rgba(239,68,68,0.4);
  color: #f87171;
}
.pd-chat-time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-muted, #94a3b8);
  padding-right: 8px;
}

/* files empty */
.pd-files-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
}

/* empty states */
.pd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 0;
  text-align: center;
}
.pd-empty-icon { color: var(--color-muted, #94a3b8); opacity: 0.4; }
.pd-empty-text { font-size: 14px; color: var(--color-muted, #94a3b8); margin: 0; }

/* loading */
.pd-loading { padding: 48px 24px; display: flex; flex-direction: column; gap: 12px; }
.pd-skel {
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--dashboard-border) 25%,
    rgba(255,255,255,0.06) 50%,
    var(--dashboard-border) 75%
  );
  background-size: 200% 100%;
  animation: pd-shimmer 1.4s ease-in-out infinite;
}
@keyframes pd-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.pd-skel-title { height: 32px; width: 50%; }
.pd-skel-badge { height: 18px; width: 20%; }
.pd-skel-desc { height: 14px; width: 80%; }
.pd-skel-row { height: 44px; width: 100%; margin-bottom: 2px; }
`;
