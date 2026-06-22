import { useMemo, type FC, type MouseEvent } from 'react';
import { Archive, FolderKanban, Layers, Loader2, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { conversationIdFromSession, sessionDisplayTitle } from '../../agentSessionsCatalog';
import type { AgentSessionRow } from '../../agentSessionsCatalog';
import { resumeAgentChatSession } from '../../lib/openAgentConversation';
import { useAgentChatSessions } from '../../hooks/useAgentChatSessions';

const RECENT_TEASER_LIMIT = 8;

export const AgentChatSessionList: FC<{
  variant?: 'sidebar';
  expanded?: boolean;
  activeConversationId?: string | null;
  onSelect?: (conversationId: string, title?: string) => void;
  refreshKey?: number;
}> = ({ variant = 'sidebar', expanded = true, activeConversationId, onSelect, refreshKey = 0 }) => {
  const navigate = useNavigate();
  const { sessions, loading, projects, reload, patchSession } = useAgentChatSessions({
    limit: 40,
    refreshKey,
  });

  const starred = useMemo(() => sessions.filter((s) => s.is_starred), [sessions]);
  const recents = useMemo(() => sessions.filter((s) => !s.is_starred), [sessions]);

  const selectConversation = (s: AgentSessionRow) => {
    const id = conversationIdFromSession(s);
    if (!id) return;
    const title = sessionDisplayTitle(s);
    if (onSelect) {
      onSelect(id, title);
      return;
    }
    resumeAgentChatSession({ id, title, force: true });
  };

  const toggleStar = async (s: AgentSessionRow, e: MouseEvent) => {
    e.stopPropagation();
    const id = conversationIdFromSession(s);
    if (!id) return;
    const next = !s.is_starred;
    await patchSession(id, { is_starred: next ? 1 : 0 });
    void reload();
  };

  const assignProject = async (s: AgentSessionRow, projectId: string | null) => {
    const id = conversationIdFromSession(s);
    if (!id) return;
    await patchSession(id, { project_id: projectId });
    void reload();
  };

  const archiveSession = async (s: AgentSessionRow, e: MouseEvent) => {
    e.stopPropagation();
    const id = conversationIdFromSession(s);
    if (!id) return;
    await patchSession(id, { is_archived: 1 });
    void reload();
  };

  const openArtifacts = (s: AgentSessionRow, e: MouseEvent) => {
    e.stopPropagation();
    const sid = conversationIdFromSession(s);
    navigate(sid ? `/dashboard/artifacts?session_id=${encodeURIComponent(sid)}` : '/dashboard/artifacts');
  };

  const renderRow = (s: AgentSessionRow) => {
    const id = conversationIdFromSession(s);
    if (!id) return null;
    const active = activeConversationId && id === activeConversationId;
    return (
      <div key={id} className="relative group">
        <button
          type="button"
          onClick={() => selectConversation(s)}
          title={sessionDisplayTitle(s)}
          className={`w-full text-left flex items-start gap-1.5 rounded-md transition-colors hover:bg-[var(--bg-hover)]/60 min-h-[32px] px-1.5 py-1 ${
            active ? 'bg-[var(--bg-elevated)] border-l-2 border-l-[var(--solar-cyan)]' : ''
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="truncate text-[11px] font-medium text-[var(--text-main)]">
              {sessionDisplayTitle(s)}
            </div>
          </div>
        </button>
        {expanded ? (
          <div className="absolute right-0 top-0 flex items-center gap-0.5 pr-0.5 opacity-0 group-hover:opacity-100">
            <button
              type="button"
              title={s.is_starred ? 'Unstar' : 'Star'}
              onClick={(e) => void toggleStar(s, e)}
              className={`p-1 rounded hover:bg-[var(--bg-hover)] ${s.is_starred ? 'text-[var(--solar-yellow)]' : 'text-[var(--text-muted)]'}`}
            >
              <Star size={12} fill={s.is_starred ? 'currentColor' : 'none'} />
            </button>
            {s.has_artifacts ? (
              <button
                type="button"
                title="View artifacts"
                onClick={(e) => openArtifacts(s, e)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)]"
              >
                <Layers size={12} />
              </button>
            ) : null}
            {projects.length > 0 ? (
              <button
                type="button"
                title="Add to project"
                onClick={(e) => {
                  e.stopPropagation();
                  const pid = projects[0]?.id;
                  if (pid) void assignProject(s, pid);
                }}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <FolderKanban size={12} />
              </button>
            ) : null}
            <button
              type="button"
              title="Archive"
              onClick={(e) => void archiveSession(s, e)}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
            >
              <Archive size={12} />
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`flex justify-center ${variant === 'sidebar' ? 'py-2' : 'py-4'}`}>
        <Loader2 size={16} className="animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (!sessions.length) {
    return (
      <p className="px-2 text-[10px] text-[var(--text-muted)] leading-snug">
        Send a message in Agent Sam to start a chat.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 min-h-0 max-h-[42vh] overflow-y-auto chat-hide-scroll px-1">
      {starred.length > 0 ? (
        <div>
          <div className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] opacity-70">
            Starred
          </div>
          {starred.map((s) => renderRow(s))}
        </div>
      ) : null}
      <div>
        <div className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] opacity-70">
          Recents
        </div>
        {recents.slice(0, RECENT_TEASER_LIMIT).map((s) => renderRow(s))}
      </div>
      <style>{`.chat-hide-scroll::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
};
