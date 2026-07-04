import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { Files, FolderKanban, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type { AgentSessionRow } from '../../../agentSessionsCatalog';
import { conversationIdFromSession, sessionDisplayTitle } from '../../../agentSessionsCatalog';
import type { AgentChatProjectOption } from '../../../hooks/useAgentChatSessions';
import { deleteAgentSession, patchAgentSession } from '../../../hooks/useAgentChatSessions';
import { IAM_AGENT_CHAT_CONVERSATION_CHANGE } from '../../../agentChatConstants';

type Props = {
  conversationId: string;
  threadTitle: string;
  session: AgentSessionRow | null;
  projects: AgentChatProjectOption[];
  onTitleChange: (title: string) => void;
  onReloadSessions: () => void | Promise<void>;
  onDeletedActive?: (id: string) => void;
  onNewChat: () => void;
  onToggleScratchpad: () => void;
  scratchpadOpen?: boolean;
  /** Total file count (uploaded + agent-generated) — shows badge on the icon. */
  scratchpadFileCount?: number;
  compact?: boolean;
  /** When embedded in a merged shell row, omit bottom border. */
  embedded?: boolean;
  /** Cursor-style mobile thread: adds View button; scratchpad stays available. */
  mobileThreadChrome?: boolean;
  onView?: () => void;
};

export const AgentChatThreadHeader: FC<Props> = ({
  conversationId,
  threadTitle,
  session,
  projects,
  onTitleChange,
  onReloadSessions,
  onDeletedActive,
  onNewChat,
  onToggleScratchpad,
  scratchpadOpen = false,
  scratchpadFileCount = 0,
  compact = false,
  embedded = false,
  mobileThreadChrome = false,
  onView,
}) => {
  const convId = String(conversationId || '').trim();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const displayTitle = useMemo(() => {
    const t = threadTitle.trim();
    if (t && t.toLowerCase() !== 'new chat') return t;
    if (session) return sessionDisplayTitle(session);
    return convId ? 'Chat' : 'New chat';
  }, [threadTitle, session, convId]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setProjectOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (busy || !convId) return;
      setBusy(true);
      try {
        await fn();
        await onReloadSessions();
        setMenuOpen(false);
        setProjectOpen(false);
      } finally {
        setBusy(false);
      }
    },
    [busy, convId, onReloadSessions],
  );

  const saveTitle = useCallback(() => {
    const title = editValue.trim();
    if (!title || !convId) {
      setEditing(false);
      return;
    }
    void run(async () => {
      await patchAgentSession(convId, { title });
      onTitleChange(title);
      window.dispatchEvent(
        new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id: convId, title } }),
      );
      setEditing(false);
    });
  }, [convId, editValue, onTitleChange, run]);

  const toggleStar = () =>
    void run(async () => {
      const next = !session?.is_starred;
      await patchAgentSession(convId, { is_starred: next ? 1 : 0 });
    });

  const assignProject = (projectId: string | null) =>
    void run(async () => {
      const p = projects.find((x) => x.id === projectId);
      const resolved = p?.chat_project_id || projectId;
      await patchAgentSession(convId, { project_id: resolved });
    });

  const deleteChat = () => {
    if (!convId) return;
    if (!window.confirm(`Delete "${displayTitle}"? This removes the chat from your history.`)) return;
    void run(async () => {
      await deleteAgentSession(convId);
      onDeletedActive?.(convId);
    });
  };

  const canMutate = Boolean(convId && session);

  return (
    <div
      ref={rootRef}
      className={`flex items-center gap-1.5 sm:gap-2 min-w-0 ${
        embedded ? '' : 'border-b border-[var(--dashboard-border)]'
      } bg-[var(--dashboard-panel)]/80 backdrop-blur-sm ${
        compact ? 'px-2 py-1.5' : 'px-2.5 sm:px-3 py-2'
      }`}
    >
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        {canMutate ? (
          <button
            type="button"
            disabled={busy}
            onClick={toggleStar}
            className="shrink-0 p-1 rounded-md hover:bg-[var(--bg-hover)] text-[var(--dashboard-muted)]"
            title={session?.is_starred ? 'Unstar chat' : 'Star chat'}
            aria-label={session?.is_starred ? 'Unstar chat' : 'Star chat'}
          >
            <Star
              size={15}
              className={session?.is_starred ? 'text-[var(--solar-yellow)]' : ''}
              fill={session?.is_starred ? 'currentColor' : 'none'}
            />
          </button>
        ) : null}

        {editing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle();
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={() => saveTitle()}
            className="flex-1 min-w-0 rounded-md border border-[var(--dashboard-border)] bg-[var(--scene-bg)] px-2 py-1 text-[13px] font-semibold text-[var(--dashboard-text)] outline-none focus:border-[var(--solar-cyan)]"
          />
        ) : (
          <button
            type="button"
            disabled={!canMutate || busy}
            onClick={() => {
              if (!canMutate) return;
              setEditValue(displayTitle);
              setEditing(true);
            }}
            className="flex-1 min-w-0 flex items-center gap-1.5 text-left group disabled:cursor-default"
            title={canMutate ? 'Rename chat' : undefined}
          >
            <span className="truncate text-[13px] font-semibold text-[var(--dashboard-text)]">{displayTitle}</span>
            {canMutate ? (
              <Pencil
                size={12}
                className="shrink-0 opacity-0 group-hover:opacity-60 text-[var(--dashboard-muted)]"
              />
            ) : null}
          </button>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onToggleScratchpad}
          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
            scratchpadOpen
              ? 'bg-[var(--bg-hover)] text-[var(--solar-cyan)]'
              : 'text-[var(--dashboard-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--dashboard-text)]'
          }`}
          title="Scratchpad"
          aria-label="Toggle scratchpad"
        >
          <StickyNote size={16} strokeWidth={1.75} />
        </button>

        {!mobileThreadChrome ? (
          <button
            type="button"
            onClick={onNewChat}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] transition-colors"
            title="New chat"
            aria-label="New chat"
          >
            <Plus size={18} strokeWidth={2} />
          </button>
        ) : onView ? (
          <button
            type="button"
            onClick={onView}
            className="px-2.5 py-1 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] text-[11px] font-semibold text-[var(--dashboard-text)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            View
          </button>
        ) : null}

        {canMutate ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--dashboard-muted)]"
              aria-label="Chat options"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[168px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-1 shadow-lg">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditValue(displayTitle);
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-[var(--bg-hover)] disabled:opacity-50"
                >
                  <Pencil size={13} />
                  Rename
                </button>
                <div className="relative">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setProjectOpen((v) => !v)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-[var(--bg-hover)] disabled:opacity-50"
                  >
                    <FolderKanban size={13} />
                    Move to project
                  </button>
                  {projectOpen ? (
                    <div className="absolute right-full top-0 z-50 mr-1 w-[200px] max-h-[220px] overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-1 shadow-lg">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => assignProject(null)}
                        className="block w-full px-3 py-1.5 text-left text-[10px] text-muted hover:bg-[var(--bg-hover)]"
                      >
                        Remove from project
                      </button>
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          disabled={busy}
                          onClick={() => assignProject(p.id)}
                          className="block w-full truncate px-3 py-1.5 text-left text-[10px] hover:bg-[var(--bg-hover)]"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={deleteChat}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-red-400 hover:bg-[var(--bg-hover)] disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export function findSessionRow(
  sessions: AgentSessionRow[],
  conversationId: string,
): AgentSessionRow | null {
  const id = String(conversationId || '').trim();
  if (!id) return null;
  return (
    sessions.find((s) => conversationIdFromSession(s) === id || s.id === id || s.conversation_id === id) ??
    null
  );
}
