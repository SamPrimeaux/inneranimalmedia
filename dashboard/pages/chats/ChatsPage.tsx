import React, { useCallback, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  IAM_AGENT_CHAT_CONVERSATION_CHANGE,
  LS_AGENT_CHAT_CONVERSATION_ID,
} from '../../agentChatConstants';
import {
  chatsListRelativeTime,
  conversationIdFromSession,
  sessionDisplayTitle,
  sessionSortMs,
  type AgentSessionRow,
} from '../../agentSessionsCatalog';
import { AGENT_HOME_PATH } from '../../lib/agentRoutes';
import { useAgentChatSessions } from '../../hooks/useAgentChatSessions';

function openConversation(conversationId: string) {
  const id = conversationId.trim();
  if (!id) return;
  try {
    localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, id);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id } }));
}

export default function ChatsPage() {
  const navigate = useNavigate();
  const { sessions, loading, projects, reload, patchSession } = useAgentChatSessions({ limit: 200 });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => sessionSortMs(b) - sessionSortMs(a)),
    [sessions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((s) => {
      const title = sessionDisplayTitle(s).toLowerCase();
      const project = String(s.project_name || '').toLowerCase();
      return title.includes(q) || project.includes(q);
    });
  }, [sorted, query]);

  const selectedCount = selected.size;
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(conversationIdFromSession(s)));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.map((s) => conversationIdFromSession(s)).filter(Boolean)));
  };

  const clearSelection = () => {
    setSelected(new Set());
    setMoveOpen(false);
  };

  const navigateToChat = useCallback(
    (conversationId: string) => {
      openConversation(conversationId);
      navigate(AGENT_HOME_PATH);
    },
    [navigate],
  );

  const archiveSelected = async () => {
    if (!selectedCount || busy) return;
    setBusy(true);
    try {
      await Promise.all(
        [...selected].map((id) => patchSession(id, { is_archived: 1 })),
      );
      clearSelection();
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const moveSelectedToProject = async (projectId: string | null) => {
    if (!selectedCount || busy) return;
    setBusy(true);
    try {
      await Promise.all(
        [...selected].map((id) => patchSession(id, { project_id: projectId })),
      );
      clearSelection();
      setMoveOpen(false);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const rowBadge = (s: AgentSessionRow) => {
    if (s.project_name) {
      return (
        <span className="shrink-0 max-w-[160px] truncate rounded border border-[var(--dashboard-border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
          {s.project_name}
        </span>
      );
    }
    if (s.session_type === 'shared' || String(s.status || '').toLowerCase() === 'shared') {
      return (
        <span className="shrink-0 rounded border border-[var(--dashboard-border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
          Shared
        </span>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 bg-[var(--dashboard-canvas)] text-[var(--text-main)]">
      <header className="shrink-0 border-b border-[var(--dashboard-border)] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Chats</h1>
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-[var(--text-muted)] tabular-nums min-w-[5.5rem] text-right">
              {selectedCount} selected
            </span>
            <button
              type="button"
              disabled={!filtered.length || busy}
              onClick={toggleAllVisible}
              className="rounded-md border border-[var(--dashboard-border)] px-2.5 py-1 hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              Select all
            </button>
            <div className="relative">
              <button
                type="button"
                disabled={!selectedCount || busy}
                onClick={() => setMoveOpen((v) => !v)}
                className="rounded-md border border-[var(--dashboard-border)] px-2.5 py-1 hover:bg-[var(--bg-hover)] disabled:opacity-40"
              >
                Move to project
              </button>
              {moveOpen && selectedCount > 0 ? (
                <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-md border border-[var(--dashboard-border)] bg-[var(--bg-elevated)] py-1 shadow-lg">
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                    onClick={() => void moveSelectedToProject(null)}
                  >
                    Remove from project
                  </button>
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="block w-full truncate px-3 py-1.5 text-left text-[11px] hover:bg-[var(--bg-hover)]"
                      onClick={() => void moveSelectedToProject(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              disabled={!selectedCount || busy}
              onClick={() => void archiveSelected()}
              className="rounded-md border border-[var(--dashboard-border)] px-2.5 py-1 text-red-400 hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              Delete
            </button>
            <button
              type="button"
              disabled={!selectedCount || busy}
              onClick={clearSelection}
              className="rounded-md border border-[var(--dashboard-border)] px-2.5 py-1 hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
        <div className="relative mt-4">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats..."
            className="w-full rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--solar-cyan)]/50"
          />
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
          </div>
        ) : !filtered.length ? (
          <p className="px-6 py-8 text-sm text-[var(--text-muted)]">
            {query.trim() ? 'No chats match your search.' : 'No chats yet. Send a message in Agent Sam to start one.'}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {filtered.map((s) => {
              const id = conversationIdFromSession(s);
              if (!id) return null;
              const checked = selected.has(id);
              return (
                <li key={id} className="flex items-center gap-3 px-4 py-3 sm:px-6 hover:bg-[var(--bg-hover)]/40">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(id)}
                    className="shrink-0 rounded border-[var(--dashboard-border)]"
                    aria-label={`Select ${sessionDisplayTitle(s)}`}
                  />
                  <button
                    type="button"
                    onClick={() => navigateToChat(id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                      {sessionDisplayTitle(s)}
                    </span>
                    {rowBadge(s)}
                  </button>
                  <span className="shrink-0 text-[12px] text-[var(--text-muted)] tabular-nums">
                    {chatsListRelativeTime(s)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
