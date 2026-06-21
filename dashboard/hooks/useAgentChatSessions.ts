import { useCallback, useEffect, useState } from 'react';
import { IAM_AGENT_CHAT_CONVERSATION_CHANGE } from '../agentChatConstants';
import type { AgentSessionRow } from '../agentSessionsCatalog';
import { conversationIdFromSession } from '../agentSessionsCatalog';

export type AgentChatProjectOption = { id: string; name: string };

export async function patchAgentSession(id: string, patch: Record<string, unknown>) {
  await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

/**
 * Canonical Agent Sam session list — sidebar teaser and /dashboard/chats share this hook.
 */
export function useAgentChatSessions(opts?: { limit?: number; refreshKey?: number }) {
  const limit = opts?.limit ?? 40;
  const [sessions, setSessions] = useState<AgentSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<AgentChatProjectOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/agent/sessions?limit=${limit}`, { credentials: 'same-origin' });
      const data = r.ok ? await r.json() : [];
      const rows = Array.isArray(data) ? (data as AgentSessionRow[]) : [];
      const deduped = [...rows
        .reduce((map, row) => {
          const id = conversationIdFromSession(row);
          if (!id) return map;
          const prev = map.get(id);
          if (!prev) map.set(id, row);
          return map;
        }, new Map<string, AgentSessionRow>())
        .values()];
      setSessions(deduped);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load, opts?.refreshKey]);

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
            .filter((p: AgentChatProjectOption) => p.id),
        );
      })
      .catch(() => setProjects([]));
  }, []);

  return {
    sessions,
    loading,
    projects,
    reload: load,
    patchSession: patchAgentSession,
    setSessions,
  };
}
