import { useCallback, useEffect, useState } from 'react';
import { catalogSlugForRegistry } from '../../../lib/integrationSlugAliases';

export type OpSettings = {
  cf_d1_database_id?: string;
  cf_d1_database_name?: string;
  cf_worker_name?: string;
  cf_tunnel_id?: string;
  cf_tunnel_name?: string;
  cf_stack_configured_at?: number;
  github_repo?: string;
  workspace_root?: string;
  deploy_command?: string;
  deploy_stack_command?: string;
  deploy_worker_command?: string;
  build_command?: string;
};

export type GitStatus = {
  status?: string;
  branch?: string | null;
  repo?: string | null;
  repo_full_name?: string | null;
  checkpoint_sha?: string | null;
  ahead_by?: number | null;
  behind_by?: number | null;
};

export type KeyRow = {
  id: string;
  label?: string | null;
  provider?: string | null;
  secret_name?: string | null;
  status?: string | null;
  last_four?: string | null;
  updated_at?: string | number | null;
};

export type ConnectedItem = {
  connection?: { provider_key?: string; status?: string; account_display?: string | null };
  catalog?: { name?: string; slug?: string; icon_slug?: string };
  integration_status?: { connected?: boolean; error?: string };
};

export type WorkspaceSnapshot = {
  workspace: Record<string, unknown> | null;
  opSettings: OpSettings;
  connected: ConnectedItem[];
  git: GitStatus | null;
  health: { overall?: string; services?: Array<{ service?: string; status?: string }> } | null;
  keys: KeyRow[];
  lastDeploy: { at?: string | number | null; version?: string | null; git_sha?: string | null; status?: string | null };
  activity: Array<{ action?: string; created_at?: number | string; actor_email?: string | null }>;
  members: Array<Record<string, unknown>>;
};

const EMPTY: WorkspaceSnapshot = {
  workspace: null,
  opSettings: {},
  connected: [],
  git: null,
  health: null,
  keys: [],
  lastDeploy: {},
  activity: [],
  members: [],
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    const j = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return null;
    return j as T;
  } catch {
    return null;
  }
}

function parseOpSettings(raw: unknown): OpSettings {
  if (!raw || typeof raw !== 'object') return {};
  return raw as OpSettings;
}

export function useWorkspaceSnapshot(workspaceId?: string | null) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(EMPTY);
  const [healthChecking, setHealthChecking] = useState(false);

  const ws = workspaceId?.trim() || '';
  const qp = ws ? `?workspace_id=${encodeURIComponent(ws)}` : '';

  const load = useCallback(async () => {
    if (!ws) {
      setSnapshot(EMPTY);
      setLoading(false);
      setError('No active workspace');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [
        settingsRes,
        opRes,
        connectedRes,
        gitRes,
        healthRes,
        keysRes,
        cicdRes,
        auditRes,
        membersRes,
      ] = await Promise.all([
        fetchJson<{ workspace?: Record<string, unknown> }>(`/api/settings/workspace${qp}`),
        fetchJson<{ settings_json?: OpSettings }>(`/api/workspace/settings${qp}`),
        fetchJson<{ items?: ConnectedItem[] }>('/api/settings/integrations/connected'),
        fetchJson<GitStatus>(`/api/agent/git/status${qp}`),
        fetchJson<{ overall?: string; services?: Array<{ service?: string; status?: string }> }>(
          `/api/workspaces/${encodeURIComponent(ws)}/health`,
        ),
        fetchJson<{ items?: KeyRow[] }>(`/api/settings/keys${qp}`),
        fetchJson<{
          extra?: {
            dashboard_versions?: Array<{ deployed_at?: string; version?: string; git_sha?: string }>;
            cicd_pipeline_runs?: Array<{ completed_at?: string; status?: string; commit_hash?: string }>;
          };
        }>('/api/settings/cicd'),
        fetchJson<{ events?: Array<{ action?: string; created_at?: number; actor_email?: string }> }>(
          `/api/workspaces/${encodeURIComponent(ws)}/audit`,
        ),
        fetchJson<{ members?: Array<Record<string, unknown>> }>('/api/settings/workspace/members'),
      ]);

      const dv = cicdRes?.extra?.dashboard_versions?.[0];
      const run = cicdRes?.extra?.cicd_pipeline_runs?.[0];

      setSnapshot({
        workspace: settingsRes?.workspace ?? null,
        opSettings: parseOpSettings(opRes?.settings_json),
        connected: connectedRes?.items ?? [],
        git: gitRes,
        health: healthRes,
        keys: keysRes?.items ?? [],
        lastDeploy: {
          at: dv?.deployed_at ?? run?.completed_at ?? null,
          version: dv?.version ?? null,
          git_sha: dv?.git_sha ?? run?.commit_hash ?? null,
          status: run?.status ?? 'success',
        },
        activity: auditRes?.events ?? [],
        members: membersRes?.members ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workspace');
      setSnapshot(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [qp, ws]);

  useEffect(() => {
    void load();
  }, [load]);

  const runHealthCheck = useCallback(async () => {
    if (!ws) return;
    setHealthChecking(true);
    try {
      const healthRes = await fetchJson<{ overall?: string; services?: Array<{ service?: string; status?: string }> }>(
        `/api/workspaces/${encodeURIComponent(ws)}/health`,
      );
      if (healthRes) {
        setSnapshot((s) => ({ ...s, health: healthRes }));
      }
    } finally {
      setHealthChecking(false);
    }
  }, [ws]);

  return { loading, error, snapshot, reload: load, runHealthCheck, healthChecking };
}

export function isIntegrationConnected(items: ConnectedItem[], registryKey: string): boolean {
  const key = registryKey.toLowerCase();
  const item = items.find(
    (i) => String(i.connection?.provider_key || '').toLowerCase() === key,
  );
  if (!item) return false;
  const st = String(item.connection?.status || '').toLowerCase();
  return st === 'connected' || item.integration_status?.connected === true;
}

export function connectedSubtitle(item: ConnectedItem | undefined): string {
  if (!item) return 'Not connected';
  const st = String(item.connection?.status || '').toLowerCase();
  if (st === 'connected' || item.integration_status?.connected) {
    return item.connection?.account_display || 'Connected';
  }
  if (st === 'degraded' || item.integration_status?.error) return 'Needs attention';
  return 'Not connected';
}

export type ServiceTileDef = {
  id: string;
  title: string;
  iconSlug: string;
  registryKey: string;
  settingsPath: string;
};

export const PROJECT_SERVICE_TILES: ServiceTileDef[] = [
  { id: 'github', title: 'GitHub', iconSlug: 'github', registryKey: 'github', settingsPath: '/dashboard/settings/integrations' },
  { id: 'cloudflare', title: 'Cloudflare', iconSlug: 'cloudflare', registryKey: 'cloudflare_oauth', settingsPath: '/dashboard/settings/integrations' },
  { id: 'supabase', title: 'Supabase', iconSlug: 'supabase', registryKey: 'supabase_oauth', settingsPath: '/dashboard/settings/integrations' },
  { id: 'openai', title: 'OpenAI', iconSlug: 'openai_api', registryKey: 'openai', settingsPath: '/dashboard/settings/keys' },
  { id: 'google_drive', title: 'Google Drive', iconSlug: 'google_workspace', registryKey: 'google_drive', settingsPath: '/dashboard/settings/integrations' },
  { id: 'resend', title: 'Resend', iconSlug: 'resend', registryKey: 'resend', settingsPath: '/dashboard/settings/keys' },
  { id: 'cloudflare_r2', title: 'R2', iconSlug: 'cf_r2', registryKey: 'cloudflare_r2', settingsPath: '/dashboard/settings/storage' },
  { id: 'local_tunnel', title: 'Local Machine', iconSlug: 'cf_workers', registryKey: 'local_tunnel', settingsPath: '/dashboard/settings/integrations' },
];

export function findConnectedItem(items: ConnectedItem[], registryKey: string): ConnectedItem | undefined {
  return items.find(
    (i) => String(i.connection?.provider_key || '').toLowerCase() === registryKey.toLowerCase(),
  );
}

export function tileIconSlug(def: ServiceTileDef, item?: ConnectedItem): string {
  return item?.catalog?.icon_slug || catalogSlugForRegistry(def.registryKey) || def.iconSlug;
}
