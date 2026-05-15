/**
 * Supabase PostgREST writers for Agent Sam observability tables (public schema).
 */

import { supabasePostJson } from '../api/health/supabaseRest.js';

/**
 * Insert one row into public.agentsam_routing_decisions (non-blocking callers should not await).
 * @param {any} env
 * @param {Record<string, unknown>} payload
 */
export async function writeSupabaseRoutingDecision(env, payload) {
  if (!payload || typeof payload !== 'object') return { ok: false };
  const row = { ...payload };
  if (row.provider == null || String(row.provider).trim() === '') {
    row.provider = 'unknown';
  }
  return supabasePostJson(env, '/rest/v1/agentsam_routing_decisions', row, 'public');
}
