import { useCallback, useEffect, useMemo, useState, type FC, type MouseEvent } from 'react';
import { Archive, FolderKanban, Layers, Loader2, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  IAM_AGENT_CHAT_CONVERSATION_CHANGE,
  LS_AGENT_CHAT_CONVERSATION_ID,
} from '../../agentChatConstants';
import type { AgentSessionRow } from '../../agentSessionsCatalog';
import { groupSessionsByBucket, relativeSessionTime, sessionDisplayTitle } from '../../agentSessionsCatalog';

type ProjectOption = { id: string; name: string };

async function patchSession(id: string, patch: Record<string, unknown>) {
  await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export const AgentChatSessionList: FC<{
  variant?: 'sidebar' | 'panel';
  expanded?: boolean;
  activeConversationId?: string | null;
  onSelect?: (conversationId: string) => void;
  refreshKey?: number;
}> = ({ variant = 'panel', expanded = true, activeConversationId, onSelect, refreshKey = 0 }) => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<AgentSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/agent/sessions?limit=40', { credentials: 'same-origin' });
      const data = r.ok ? await r.json() : [];
      setSessions(Array.isArray(data) ? (data as AgentSessionRow[]) : []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey, activeConversationId]);

  useEffect(() => {
    const onChange = () => void load();
    window.addEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onChange);
    return () => window.removeEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onChange);
  }, [load]);

  useEffect(() => {
    void fetch('/api/projects', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : rows?.projects || [];
        setProjects(
          list
            .map((p: { id?: string; name?: string }) => ({
              id: String(p.id || '').trim(),
              name: String(p.name || 'Project').trim(),
            }))
            .filter((p: ProjectOption) => p.id),
        );
      })
      .catch(() => setProjects([]));
  }, []);

  const starred = useMemo(() => sessions.filter((s) => s.is_starred), [sessions]);
  const recents = useMemo(() => sessions.filter((s) => !s.is_starred), [sessions]);
  const recentGroups = useMemo(() => groupSessionsByBucket(recents), [recents]);

  const selectConversation = (id: string) => {
    if (!id) return;
    try {
      localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, id);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id } }));
    onSelect?.(id);
    setMenuFor(null);
  };

  const toggleStar = async (s: AgentSessionRow, e: MouseEvent) => {
    e.stopPropagation();
    const id = String(s.conversation_id || s.id || '').trim();
    if (!id) return;
    const next = !s.is_starred;
    setSessions((prev) => prev.map((row) => (row.id === s.id ? { ...row, is_starred: next } : row)));
    await patchSession(id, { is_starred: next ? 1 : 0 });
    void load();
  };

  const assignProject = async (s: AgentSessionRow, projectId: string | null) => {
    const id = String(s.conversation_id || s.id || '').trim();
    if (!id) return;
    await patchSession(id, { project_id: projectId });
    setMenuFor(null);
    void load();
  };

  const archiveSession = async (s: AgentSessionRow, e: MouseEvent) => {
    e.stopPropagation();
    const id = String(s.conversation_id || s.id || '').trim();
    if (!id) return;
    await patchSession(id, { is_archived: 1 });
    void load();
  };

  const openArtifacts = (s: AgentSessionRow, e: MouseEvent) => {
    e.stopPropagation();
    const sid = String(s.conversation_id || s.id || '').trim();
    navigate(sid ? `/dashboard/artifacts?session_id=${encodeURIComponent(sid)}` : '/dashboard/artifacts');
  };

  const renderRow = (s: AgentSessionRow, compact: boolean) => {
    const id = String(s.conversation_id || s.id || '').trim();
    if (!id) return null;
    const active = activeConversationId && id === activeConversationId;
    const mc = typeof s.message_count === 'number' ? s.message_count : 0;
    return (
      <div key={id} className="relative group">
        <button
          type="button"
          onClick={() => selectConversation(id)}
          title={sessionDisplayTitle(s)}
          className={`w-full text-left flex items-start gap-1.5 rounded-md transition-colors hover:bg-[var(--bg-hover)]/60 ${
            compact ? 'min-h-[32px] px-1.5 py-1' : 'min-h-[52px] px-3 py-2 border-b border-[var(--border-subtle)]'
          } ${active ? 'bg-[var(--bg-elevated)] border-l-2 border-l-[var(--solar-cyan)]' : ''}`}
        >
          <div className="flex-1 min-w-0">
            <div
              className={`truncate text-[var(--text-main)] ${compact ? 'text-[11px] font-medium' : 'text-[0.8125rem]'}`}
            >
              {sessionDisplayTitle(s)}
            </div>
            {!compact ? (
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <span className="text-[0.6875rem] text-[var(--text-muted)]">
                  {mc} msg{mc !== 1 ? 's' : ''}
                </span>
                {s.project_name ? (
                  <span className="text-[0.625rem] text-[var(--text-muted)] truncate max-w-[120px]">
                    {s.project_name}
                  </span>
                ) : null}
                {s.has_artifacts ? (
                  <code className="text-[0.625rem] font-mono text-[var(--solar-cyan)] px-1 py-px rounded border border-[var(--border-subtle)]">
                    artifacts
                  </code>
                ) : null}
              </div>
            ) : null}
          </div>
          {!compact ? (
            <span className="text-[0.6875rem] text-[var(--text-muted)] shrink-0 tabular-nums pt-0.5">
              {relativeSessionTime(s)}
            </span>
          ) : null}
        </button>
        {expanded ? (
          <div
            className={`absolute right-0 top-0 flex items-center gap-0.5 pr-0.5 ${
              compact ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
            }`}
          >
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
            <button
              type="button"
              title="Add to project"
              onClick={(e) => {
                e.stopPropagation();
                setMenuFor(menuFor === id ? null : id);
              }}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
            >
              <FolderKanban size={12} />
            </button>
            {!compact ? (
              <button
                type="button"
                title="Archive"
                onClick={(e) => void archiveSession(s, e)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <Archive size={12} />
              </button>
            ) : null}
          </div>
        ) : null}
        {menuFor === id && projects.length > 0 ? (
          <div className="absolute z-20 right-0 mt-1 min-w-[140px] rounded-md border border-[var(--dashboard-border)] bg-[var(--bg-elevated)] shadow-lg py-1">
            <button
              type="button"
              className="w-full text-left px-2 py-1 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
              onClick={() => void assignProject(s, null)}
            >
              Remove from project
            </button>
            {projects.slice(0, 8).map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-2 py-1 text-[11px] text-[var(--text-main)] hover:bg-[var(--bg-hover)] truncate"
                onClick={() => void assignProject(s, p.id)}
              >
                {p.name}
              </button>
            ))}
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
      <p className={`text-[var(--text-muted)] leading-snug ${variant === 'sidebar' ? 'px-2 text-[10px]' : 'px-3 text-[11px]'}`}>
        {variant === 'sidebar' ? 'Send a message in Agent Sam to start a chat.' : 'No chats yet. Send a message in Agent Sam.'}
      </p>
    );
  }

  if (variant === 'sidebar') {
    return (
      <div className="flex flex-col gap-2 min-h-0 overflow-y-auto chat-hide-scroll px-1">
        {starred.length > 0 ? (
          <div>
            <div className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] opacity-70">
              Starred
            </div>
            {starred.slice(0, 6).map((s) => renderRow(s, true))}
          </div>
        ) : null}
        <div>
          <div className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] opacity-70">
            Recents
          </div>
          {recents.slice(0, 8).map((s) => renderRow(s, true))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto chat-hide-scroll">
      {starred.length > 0 ? (
        <div className="mb-2">
          <div className="text-[0.6875rem] uppercase tracking-widest text-[var(--text-muted)] px-3 py-1.5">
            Starred
          </div>
          {starred.map((s) => renderRow(s, false))}
        </div>
      ) : null}
      {recentGroups.map((g) => (
        <div key={g.label}>
          <div className="text-[0.6875rem] uppercase tracking-widest text-[var(--text-muted)] px-3 py-1.5">
            {g.label}
          </div>
          {g.items.map((s) => renderRow(s, false))}
        </div>
      ))}
    </div>
  );
};
