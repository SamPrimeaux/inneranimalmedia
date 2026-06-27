import { useCallback, useEffect, useState } from 'react';
import type { AgentHomeSceneConfig } from '../types/agentHomeScene';
import { DEFAULT_AGENT_HOME_SCENE } from '../types/agentHomeScene';

export type AgentHomeSceneSource = 'default' | 'user' | 'workspace';

export function useAgentHomeScene() {
  const [config, setConfig] = useState<AgentHomeSceneConfig>(DEFAULT_AGENT_HOME_SCENE);
  const [source, setSource] = useState<AgentHomeSceneSource>('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/scene', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`scene_fetch_${res.status}`);
      const body = (await res.json()) as {
        scene?: AgentHomeSceneConfig;
        source?: AgentHomeSceneSource;
      };
      if (body.scene?.version === 1) setConfig(body.scene);
      if (body.source) setSource(body.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'scene_fetch_failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persist = useCallback(
    async (next: AgentHomeSceneConfig) => {
      const res = await fetch('/api/agent/scene', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: next }),
      });
      if (!res.ok) throw new Error(`scene_save_${res.status}`);
      const body = (await res.json()) as {
        scene?: AgentHomeSceneConfig;
        source?: AgentHomeSceneSource;
      };
      if (body.scene?.version === 1) setConfig(body.scene);
      if (body.source) setSource(body.source);
      return body;
    },
    [],
  );

  return { config, source, loading, error, refresh, persist, setConfig };
}
