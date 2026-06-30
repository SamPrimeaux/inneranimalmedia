import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  FolderOpen,
  Github,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { OverviewProject } from '../../../api/projects';
import { updateProject } from '../../../api/projects';
import {
  chatAssignProjectId,
  chatProjectIdForSession,
  fetchAgentSessions,
} from '../../../api/agentSessions';
import {
  chatsListRelativeTime,
  conversationIdFromSession,
  sessionDisplayTitle,
  type AgentSessionRow,
} from '../../../agentSessionsCatalog';
import { patchAgentSession } from '../../../hooks/useAgentChatSessions';
import {
  IAM_AGENT_ENSURE_PANEL,
  openAgentConversation,
} from '../../../lib/openAgentConversation';
import { IAM_AGENT_CHAT_COMPOSE } from '../../../agentChatConstants';

type Props = {
  project: OverviewProject;
  onBack: () => void;
  onToast?: (msg: string) => void;
  onRefresh?: () => void;
};

function IconButton({
  label,
  onClick,
  children,
  className = '',
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={`lib-proj-icon-btn ${className}`}>
      {children}
    </button>
  );
}

function AddChatsModal({
  project,
  onClose,
  onAssigned,
}: {
  project: OverviewProject;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sessions, setSessions] = useState<AgentSessionRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const rows = await fetchAgentSessions({ limit: 200, workspaceId: project.workspace_id });
      if (cancelled) return;
      setSessions(rows.filter((s) => !chatProjectIdForSession(s, project.id, project.chat_project_id)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [project]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => sessionDisplayTitle(s).toLowerCase().includes(q));
  }, [sessions, query]);

  const assignSelected = async () => {
    if (!selected.size || busy) return;
    setBusy(true);
    try {
      const pid = chatAssignProjectId(project.id, project.chat_project_id);
      await Promise.all([...selected].map((id) => patchAgentSession(id, { project_id: pid })));
      onAssigned();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lib-proj-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lib-proj-modal" role="dialog" aria-labelledby="add-chats-title">
        <div className="lib-proj-modal-head">
          <h2 id="add-chats-title">Add chats to {project.name}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="lib-proj-modal-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search past chats…"
            autoFocus
          />
        </div>
        {loading ? (
          <p className="lib-project-muted lib-proj-modal-empty">
            <Loader2 size={16} className="animate-spin inline mr-2" />
            Loading chats…
          </p>
        ) : filtered.length === 0 ? (
          <p className="lib-project-muted lib-proj-modal-empty">No unassigned chats match.</p>
        ) : (
          <ul className="lib-proj-add-chat-list">
            {filtered.map((s) => {
              const id = conversationIdFromSession(s);
              if (!id) return null;
              const checked = selected.has(id);
              return (
                <li key={id}>
                  <label className="lib-proj-add-chat-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })
                      }
                    />
                    <span className="lib-proj-add-chat-title">{sessionDisplayTitle(s)}</span>
                    <span className="lib-proj-add-chat-time">{chatsListRelativeTime(s)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <div className="lib-proj-modal-actions">
          <button type="button" className="lib-proj-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="lib-proj-btn primary"
            disabled={!selected.size || busy}
            onClick={() => void assignSelected()}
          >
            {busy ? 'Adding…' : `Add ${selected.size || ''} chat${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LibraryProjectDetail({ project, onBack, onToast, onRefresh }: Props) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [addFileOpen, setAddFileOpen] = useState(false);
  const [addChatsOpen, setAddChatsOpen] = useState(false);
  const [chats, setChats] = useState<AgentSessionRow[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [instructions, setInstructions] = useState(project.description || '');
  const [savingInstructions, setSavingInstructions] = useState(false);

  const loadChats = useCallback(async () => {
    setChatsLoading(true);
    try {
      const rows = await fetchAgentSessions({
        limit: 100,
        projectId: project.id,
        workspaceId: project.workspace_id,
      });
      setChats(rows);
    } finally {
      setChatsLoading(false);
    }
  }, [project.id, project.workspace_id]);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  const openChat = (s: AgentSessionRow) => {
    const id = conversationIdFromSession(s);
    if (!id) return;
    openAgentConversation({ id, title: sessionDisplayTitle(s), force: true });
  };

  const startNewChat = () => {
    window.dispatchEvent(new CustomEvent(IAM_AGENT_ENSURE_PANEL));
    window.dispatchEvent(
      new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
        detail: {
          message: `Continuing work on ${project.name}. `,
          ensureAgentPanel: true,
          send: false,
        },
      }),
    );
  };

  const saveInstructions = async () => {
    setSavingInstructions(true);
    try {
      const res = await updateProject(project.id, { description: instructions.trim() });
      if (!res.ok) {
        onToast?.(res.error || 'Failed to save instructions');
        return;
      }
      onToast?.('Instructions saved');
      onRefresh?.();
    } finally {
      setSavingInstructions(false);
    }
  };

  const updatedLabel = project.lastDeploy && project.lastDeploy !== '—' ? project.lastDeploy : project.dueDate;

  return (
    <div className="lib-proj-detail">
      <button type="button" className="lib-proj-back" onClick={onBack}>
        ← All projects
      </button>

      <div className="lib-proj-detail-head">
        <div>
          <h1>{project.name}</h1>
          <p>{project.description || project.stage || 'No description yet.'}</p>
        </div>
        <div className="lib-proj-detail-actions">
          <IconButton label="More" onClick={() => setMenuOpen((v) => !v)}>
            <MoreHorizontal size={18} />
          </IconButton>
          {menuOpen ? (
            <div className="lib-proj-menu" onMouseLeave={() => setMenuOpen(false)}>
              <button type="button" onClick={() => void saveInstructions()}>
                Save instructions
              </button>
              <a href={`/dashboard/collaborate?project=${encodeURIComponent(project.id)}`}>Open in Collaborate</a>
            </div>
          ) : null}
          <button type="button" className="lib-proj-btn outline">
            Share
          </button>
        </div>
      </div>

      <div className="lib-proj-detail-grid">
        <div className="lib-proj-detail-main">
          <div className="lib-proj-composer">
            <p>How can I help you on this project?</p>
            <button type="button" className="lib-proj-composer-plus" onClick={startNewChat} aria-label="New chat">
              <Plus size={15} />
            </button>
          </div>

          <div className="lib-proj-chat-toolbar">
            <span className="lib-proj-chat-count">
              {chatsLoading ? 'Loading chats…' : `${chats.length} chat${chats.length === 1 ? '' : 's'}`}
            </span>
            <button type="button" className="lib-proj-btn ghost sm" onClick={() => setAddChatsOpen(true)}>
              Add existing chats
            </button>
          </div>

          <ul className="lib-proj-chat-list">
            {chats.map((c) => {
              const id = conversationIdFromSession(c);
              if (!id) return null;
              return (
                <li key={id}>
                  <button type="button" className="lib-proj-chat-row" onClick={() => openChat(c)}>
                    <span>{sessionDisplayTitle(c)}</span>
                    <span>{chatsListRelativeTime(c)}</span>
                  </button>
                </li>
              );
            })}
            {!chatsLoading && chats.length === 0 ? (
              <li className="lib-project-muted lib-proj-chat-empty">
                No chats in this project yet. Use <strong>Add existing chats</strong> or start a new one.
              </li>
            ) : null}
          </ul>
        </div>

        <aside className="lib-proj-detail-side">
          <section className="lib-proj-card">
            <div className="lib-proj-card-head">
              <h3>Memory</h3>
              <span className="lib-proj-pill">Only you</span>
            </div>
            <p>
              {project.description
                ? project.description.slice(0, 240)
                : 'Purpose and context for this project — add a description when creating the project.'}
            </p>
            <p className="lib-proj-card-meta">Updated {updatedLabel || 'recently'}</p>
          </section>

          <section className="lib-proj-card">
            <div className="lib-proj-card-head">
              <h3>Instructions</h3>
              <IconButton label="Save instructions" onClick={() => void saveInstructions()}>
                <Plus size={14} />
              </IconButton>
            </div>
            <textarea
              className="lib-proj-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Add instructions to tailor Agent Sam responses for this project…"
              rows={4}
            />
            {savingInstructions ? <p className="lib-proj-card-meta">Saving…</p> : null}
          </section>

          <section className="lib-proj-card relative">
            <div className="lib-proj-card-head">
              <h3>Files</h3>
              <IconButton label="Add file" onClick={() => setAddFileOpen((v) => !v)}>
                <Plus size={14} />
              </IconButton>
            </div>
            {addFileOpen ? (
              <div className="lib-proj-add-file-menu">
                {[
                  { icon: <Paperclip size={16} />, label: 'Upload from device' },
                  { icon: <FileText size={16} />, label: 'Add text content' },
                  { icon: <Github size={16} />, label: 'GitHub' },
                  { icon: <FolderOpen size={16} />, label: 'Drive' },
                ].map((it) => (
                  <button key={it.label} type="button" className="lib-proj-add-file-item">
                    <span>{it.icon}</span>
                    {it.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="lib-proj-files-empty">
              <p>Add PDFs, documents, or other text to reference in this project.</p>
              <button type="button" className="lib-proj-btn ghost sm" onClick={() => navigate('/dashboard/artifacts')}>
                Open Library
              </button>
            </div>
          </section>
        </aside>
      </div>

      {addChatsOpen ? (
        <AddChatsModal
          project={project}
          onClose={() => setAddChatsOpen(false)}
          onAssigned={() => {
            onToast?.('Chats added to project');
            void loadChats();
            onRefresh?.();
          }}
        />
      ) : null}
    </div>
  );
}

export default LibraryProjectDetail;
