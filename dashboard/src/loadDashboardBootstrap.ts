/**
 * Single mount fetch for /dashboard/* — replaces parallel status-bar + workspace bootstrap calls.
 */

export type DashboardBootstrapPayload = {
  ok?: boolean;
  fetched_at?: number;
  me?: {
    user?: { id?: string | null; name?: string | null; email?: string | null; avatar_url?: string | null };
    workspace?: { id?: string; name?: string; slug?: string } | null;
  };
  workspaces?: {
    data?: Array<{
      id: string;
      name?: string;
      slug?: string;
      status?: string;
      github_repo?: string | null;
      database_studio_name?: string | null;
      handle?: string;
    }>;
    current?: string | null;
  };
  status?: {
    health?: { status?: string };
    sandbox?: { ok?: boolean };
    notifications?: Array<{ id?: string; title?: string; message?: string; created_at?: string }>;
    git?: { branch?: string | null; repo_full_name?: string | null; git_hash?: string | null };
    problems?: {
      worker_errors?: unknown[];
      mcp_tool_errors?: unknown[];
      audit_failures?: unknown[];
      checked_at?: string;
    };
    tunnel?: { healthy?: boolean; status?: string };
    terminal?: { status?: string };
  };
  agent?: {
    models?: unknown[];
    default_model?: string | null;
  };
  client?: {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    supabase_url?: string;
    supabase_anon_key?: string;
  } | null;
};

declare global {
  interface Window {
    __IAM_DASHBOARD_BOOTSTRAP__?: DashboardBootstrapPayload | null;
  }
}

export function isDashboardBootstrapPath(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/dashboard');
}

export async function loadDashboardBootstrap(): Promise<DashboardBootstrapPayload | null> {
  try {
    const r = await fetch('/api/dashboard/bootstrap', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const body = (await r.json()) as DashboardBootstrapPayload;
    if (typeof window !== 'undefined') {
      window.__IAM_DASHBOARD_BOOTSTRAP__ = body;
      window.dispatchEvent(new CustomEvent('iam_dashboard_bootstrap', { detail: body }));
    }
    return body;
  } catch {
    return null;
  }
}

export function readDashboardBootstrapCache(maxAgeMs = 30_000): DashboardBootstrapPayload | null {
  const cached = typeof window !== 'undefined' ? window.__IAM_DASHBOARD_BOOTSTRAP__ : null;
  if (!cached?.fetched_at) return null;
  if (Date.now() - Number(cached.fetched_at) > maxAgeMs) return null;
  return cached;
}
