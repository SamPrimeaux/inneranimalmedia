import { useCallback, useEffect, useState } from 'react';
import type { ChatComposerSource } from './types';
import { IAM_MCP_PLATFORM_SOURCE, IAM_MCP_PLATFORM_SOURCE_ID } from './types';

export type ConnectableIntegration = {
  providerKey: string;
  label: string;
  status: string;
  connectUrl: string;
  connected: boolean;
};

type SummaryProvider = {
  provider_key?: string;
  display_name?: string;
  status?: string;
};

function connectUrlForProvider(providerKey: string): string {
  const returnTo = encodeURIComponent(
    typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/dashboard/agent',
  );
  switch (providerKey) {
    case 'google_drive':
      return `/api/oauth/google/start?connectDrive=1&return_to=${returnTo}`;
    case 'google_gmail':
      return `/api/mail/gmail/start`;
    case 'github':
      return `/api/oauth/github/start?return_to=${returnTo}`;
    case 'mcp_servers':
      return `/dashboard/settings?section=integrations&focus=mcp_servers`;
    default:
      return `/api/integrations/${encodeURIComponent(providerKey)}/connect?return_to=${returnTo}`;
  }
}

export function useComposerIntegrations(isSuperadmin: boolean) {
  const [loading, setLoading] = useState(true);
  const [connectables, setConnectables] = useState<ConnectableIntegration[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/integrations/summary', { credentials: 'same-origin' });
      if (!r.ok) {
        setConnectables([]);
        return;
      }
      const d = (await r.json()) as {
        providers?: SummaryProvider[];
        capabilities?: { is_superadmin?: boolean };
      };
      const superadminUser = isSuperadmin || !!d.capabilities?.is_superadmin;
      const list: ConnectableIntegration[] = [];

      if (superadminUser) {
        list.push({
          providerKey: IAM_MCP_PLATFORM_SOURCE_ID,
          label: IAM_MCP_PLATFORM_SOURCE.label,
          status: 'connected',
          connectUrl: 'https://mcp.inneranimalmedia.com',
          connected: true,
        });
      }

      const want = new Set(['google_drive', 'google_gmail', 'github', 'mcp_servers']);
      for (const p of d.providers || []) {
        const key = String(p.provider_key || '').trim();
        if (!want.has(key)) continue;
        const connected = p.status === 'connected';
        list.push({
          providerKey: key,
          label: String(p.display_name || key.replace(/_/g, ' ')),
          status: String(p.status || 'disconnected'),
          connectUrl: connectUrlForProvider(key),
          connected,
        });
      }

      setConnectables(list);
    } catch {
      setConnectables([]);
    } finally {
      setLoading(false);
    }
  }, [isSuperadmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function sourceFromIntegration(item: ConnectableIntegration): ChatComposerSource {
    if (item.providerKey === IAM_MCP_PLATFORM_SOURCE_ID) {
      return { ...IAM_MCP_PLATFORM_SOURCE };
    }
    return {
      id: `oauth:${item.providerKey}`,
      label: item.label,
      kind: 'oauth',
      providerKey: item.providerKey,
    };
  }

  return { loading, connectables, refresh, sourceFromIntegration };
}
