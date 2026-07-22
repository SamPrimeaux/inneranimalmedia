import { useEffect, useState } from 'react';
import type { ChatModelRow } from '../../components/ChatAssistant/types';
import {
  fetchAgentDefaultModel,
  fetchAgentModels,
  invalidateAgentDomainCache,
} from '../agentDomainFetch';

export function useAgentModels(enabled: boolean) {
  const [models, setModels] = useState<ChatModelRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setModels([]);
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const load = (attempt: number) => {
      setLoading(true);
      fetchAgentModels()
        .then((rows) => {
          if (cancelled) return;
          setModels(rows);
          // Transient empty (auth race / empty error body) — bust cache and retry so Auto-only is not sticky.
          if (rows.length === 0 && attempt < 2) {
            invalidateAgentDomainCache();
            retryTimer = setTimeout(() => load(attempt + 1), 600 * (attempt + 1));
          }
        })
        .catch(() => {
          if (!cancelled) setModels([]);
          if (attempt < 2) {
            invalidateAgentDomainCache();
            retryTimer = setTimeout(() => load(attempt + 1), 600 * (attempt + 1));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    load(0);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [enabled]);

  return { models, loading };
}

export function useAgentDefaultModel(enabled: boolean) {
  const [defaultModelKey, setDefaultModelKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setDefaultModelKey(null);
      return;
    }
    setLoading(true);
    fetchAgentDefaultModel()
      .then(setDefaultModelKey)
      .catch(() => setDefaultModelKey(null))
      .finally(() => setLoading(false));
  }, [enabled]);

  return { defaultModelKey, loading };
}
