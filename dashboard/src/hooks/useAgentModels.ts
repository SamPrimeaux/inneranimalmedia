import { useEffect, useState } from 'react';
import type { ChatModelRow } from '../../components/ChatAssistant/types';
import { fetchAgentDefaultModel, fetchAgentModels } from '../agentDomainFetch';

export function useAgentModels(enabled: boolean) {
  const [models, setModels] = useState<ChatModelRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setModels([]);
      return;
    }
    setLoading(true);
    fetchAgentModels()
      .then(setModels)
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
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
