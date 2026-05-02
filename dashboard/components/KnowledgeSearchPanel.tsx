import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Loader2, BookOpen, MessageSquare } from 'lucide-react';
import {
  IAM_AGENT_CHAT_CONVERSATION_CHANGE,
  LS_AGENT_CHAT_CONVERSATION_ID,
} from '../agentChatConstants';
import type { AgentSessionRow } from '../agentSessionsCatalog';
import { groupSessionsByBucket, relativeSessionTime } from '../agentSessionsCatalog';

/**
 * Session-authenticated RAG query against /api/rag/query (D1 cosine chunks).
 * Agent chat threads live here so the right-hand chat column stays focused on the conversation.
 */
export const KnowledgeSearchPanel: React.FC<{
  onClose?: () => void;
  /** Highlights the row matching the open Agent Sam thread. */
  activeConversationId?: string;
}> = ({ onClose, activeConversationId }) => {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [context, setContext] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ chunks?: number; ms?: number; top?: number } | null>(null);

  const [sessions, setSessions] = useState<AgentSessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const loadSessions = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions, activeConversationId]);

  const sessionGroups = useMemo(() => groupSessionsByBucket(sessions), [sessions]);

  const selectConversation = useCallback((id: string) => {
    if (!id) return;
    try {
      localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, id);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(
      new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id } }),
    );
  }, []);

  const newChat = useCallback(() => {
    try {
      localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(
      new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id: null } }),
    );
  }, []);

  const run = useCallback(async () => {
    const query = q.trim();
    if (query.length < 2) {
      setErr('Enter at least 2 characters.');
      return;
    }
    setLoading(true);
    setErr(null);
    setContext(null);
    setMeta(null);
    try {
      const res = await fetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ query, top_k: 8 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof data.error === 'string' ? data.error : `Request failed (${res.status})`);
        return;
      }
      const ctx = typeof data.context === 'string' ? data.context : '';
      setContext(ctx || '(No matching chunks.)');
      setMeta({
        chunks: typeof data.chunks_injected === 'number' ? data.chunks_injected : undefined,
        ms: typeof data.duration_ms === 'number' ? data.duration_ms : undefined,
        top: typeof data.top_score === 'number' ? data.top_score : undefined,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [q]);

  return (
    <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen size={14} className="text-[var(--solar-cyan)] shrink-0" />
          <span className="text-[11px] font-bold tracking-widest uppercase truncate">Search and chats</span>
        </div>
        {onClose && (
          <button
            type="button"
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] px-2 py-1 rounded border border-[var(--border-subtle)]"
            onClick={onClose}
          >
            Close
          </button>
        )}
      </div>

      <div className="shrink-0 border-b border-[var(--border-subtle)] flex flex-col min-h-0 max-h-[min(42dvh,320px)]">
        <div className="flex items-center justify-between px-3 py-2 gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare size={14} className="text-[var(--solar-cyan)] shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] truncate">
              Agent Sam chats
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              newChat();
              void loadSessions();
            }}
            className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--solar-cyan)] hover:brightness-110 px-2 py-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors shrink-0"
          >
            New chat
          </button>
        </div>
        <div className="flex-1 min-h-[80px] overflow-y-auto chat-hide-scroll">
          {sessionsLoading ? (
            <div className="px-3 py-4 flex justify-center">
              <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-3 pb-3 text-[11px] text-[var(--text-muted)]">No chats yet. Send a message in Agent Sam.</p>
          ) : (
            sessionGroups.map((g) => (
              <div key={g.label}>
                <div className="text-[0.6875rem] uppercase tracking-widest text-[var(--text-muted)] px-3 py-1.5">
                  {g.label}
                </div>
                {g.items.map((s) => {
                  const active = activeConversationId && s.id === activeConversationId;
                  const mc = typeof s.message_count === 'number' ? s.message_count : 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectConversation(s.id)}
                      className={`w-full text-left min-h-[52px] px-3 border-b border-[var(--border-subtle)] flex items-start gap-2 py-2 transition-colors hover:bg-[var(--bg-hover)] ${
                        active ? 'bg-[var(--bg-elevated)] border-l-2 border-l-[var(--solar-cyan)] pl-[calc(0.75rem-2px)]' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="text-[0.8125rem] text-[var(--text-primary)] truncate">
                          {(s.name && String(s.name).replace(/\s+/g, ' ').trim()) || 'Untitled'}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="text-[0.6875rem] text-[var(--text-muted)]">
                            {mc} msg{mc !== 1 ? 's' : ''}
                          </span>
                          {s.has_artifacts ? (
                            <code className="text-[0.625rem] font-mono text-[var(--solar-cyan)] px-1 py-px rounded border border-[var(--border-subtle)]">
                              artifacts
                            </code>
                          ) : null}
                        </div>
                      </div>
                      <span className="text-[0.6875rem] text-[var(--text-muted)] shrink-0 tabular-nums pt-1">
                        {relativeSessionTime(s)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="p-3 border-b border-[var(--border-subtle)]/50 shrink-0 flex flex-col gap-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Knowledge</div>
        <div className="flex items-center gap-2 rounded border border-[var(--border-subtle)] px-2 py-1.5 bg-[var(--bg-app)]">
          <Search size={14} className="text-[var(--text-muted)] shrink-0" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void run()}
            placeholder="Search indexed knowledge (autorag chunks)…"
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void run()}
          className="flex items-center justify-center gap-2 py-2 rounded text-[11px] font-semibold bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/40 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Run search
        </button>
        {meta && (meta.chunks != null || meta.ms != null) && (
          <p className="text-[10px] text-[var(--text-muted)] font-mono">
            {meta.chunks != null ? `${meta.chunks} chunks` : ''}
            {meta.ms != null ? ` · ${meta.ms} ms` : ''}
            {meta.top != null ? ` · top ${meta.top.toFixed(3)}` : ''}
          </p>
        )}
        {err && <p className="text-[11px] text-[var(--solar-orange)]">{err}</p>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {context ? (
          <pre className="text-[11px] text-[var(--text-main)]/90 whitespace-pre-wrap font-mono leading-relaxed">
            {context}
          </pre>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)]">
            Knowledge results appear here. Queries run against indexed knowledge in D1 (same pipeline as Agent tools).
          </p>
        )}
      </div>
      <style>{`
        .chat-hide-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};
