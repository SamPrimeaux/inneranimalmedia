import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Build-time (Vite define / SUPABASE_* from .env.cloudflare) or runtime /api/config/client */
function resolveBuildCredentials(): { url: string; anonKey: string } | null {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '')
    .trim()
    .replace(/\/$/, '');
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

let _client: SupabaseClient | null = null;
let _bootstrapPromise: Promise<SupabaseClient | null> | null = null;
let _warnedMissing = false;

function attachClient(url: string, anonKey: string): SupabaseClient {
  if (!_client) {
    _client = createClient(url, anonKey, {
      realtime: { params: { eventsPerSecond: 4 } },
    });
  }
  return _client;
}

const built = resolveBuildCredentials();
if (built) {
  attachClient(built.url, built.anonKey);
}

/**
 * Session-backed bootstrap when build omitted VITE_* (uses Worker SUPABASE_URL + SUPABASE_ANON_KEY).
 */
export async function bootstrapSupabaseFromSession(): Promise<SupabaseClient | null> {
  if (_client) return _client;
  if (_bootstrapPromise) return _bootstrapPromise;

  _bootstrapPromise = (async () => {
    const fromBuild = resolveBuildCredentials();
    if (fromBuild) return attachClient(fromBuild.url, fromBuild.anonKey);

    try {
      const res = await fetch('/api/config/client', { credentials: 'same-origin' });
      if (res.ok) {
        const cfg = (await res.json()) as { supabase_url?: string; supabase_anon_key?: string };
        const url = String(cfg.supabase_url || '')
          .trim()
          .replace(/\/$/, '');
        const anonKey = String(cfg.supabase_anon_key || '').trim();
        if (url && anonKey) return attachClient(url, anonKey);
      }
    } catch {
      /* non-fatal */
    }

    if (!_warnedMissing) {
      _warnedMissing = true;
      console.warn(
        '[supabase] No build-time credentials and /api/config/client unavailable — realtime disabled until login',
      );
    }
    return null;
  })();

  return _bootstrapPromise;
}

/** Sync handle — null until build creds or bootstrapSupabaseFromSession() completes. */
export const supabase: SupabaseClient | null = _client;

export function getSupabaseClient(): SupabaseClient | null {
  return _client;
}
