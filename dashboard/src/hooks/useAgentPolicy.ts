import { useState, useEffect } from 'react';

const policyCacheByWorkspace: Record<string, Record<string, unknown> | null> = {};

export function useAgentPolicy(workspaceId: string | null | undefined) {
  const [policy, setPolicy] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId) {
      setPolicy(null);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(policyCacheByWorkspace, workspaceId)) {
      setPolicy(policyCacheByWorkspace[workspaceId]);
      return;
    }

    setLoading(true);
    fetch('/api/agent/policy', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const next = (data?.agent_policy as Record<string, unknown> | null | undefined) ?? null;
        policyCacheByWorkspace[workspaceId] = next;
        setPolicy(next);
      })
      .catch(() => setPolicy(null))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  return { policy, loading };
}
