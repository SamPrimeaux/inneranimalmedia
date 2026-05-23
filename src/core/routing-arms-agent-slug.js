/**
 * Per-subagent routing arms: agent_slug = agentsam_subagent_profile.id.
 * Profile default_model_id seeds cold-start Beta(1,1); Thompson updates arms after dispatch.
 */

import { SCOUT_TASK_TYPES } from './model-catalog-capabilities.js';
import { pragmaTableInfo } from './retention.js';

function modesForColdStart(taskType, mode) {
  const tt = String(taskType || '').trim();
  const m = String(mode || 'agent').trim() || 'agent';
  const modes = [m];
  if (m === 'agent' && SCOUT_TASK_TYPES.has(tt) && !modes.includes('auto')) modes.push('auto');
  return modes;
}

const ARMS = 'agentsam_routing_arms';
const NEUTRAL_ALPHA = 1.0;
const NEUTRAL_BETA = 1.0;

/** @param {string | null | undefined} agentSlug profile id (asp_*) */
export function normalizeAgentSlug(agentSlug) {
  return agentSlug != null ? String(agentSlug).trim() : '';
}

/** SQL bind fragment + params for agent-scoped arm lookup. */
export function agentSlugSqlFilter(agentSlug, alias = 'ra') {
  const slug = normalizeAgentSlug(agentSlug);
  if (!slug) {
    return { clause: ` AND COALESCE(${alias}.agent_slug, '') = ''`, binds: [] };
  }
  return { clause: ` AND ${alias}.agent_slug = ?`, binds: [slug] };
}

/**
 * On first (agent_slug, task_type, mode) dispatch, seed neutral prior arm from profile.default_model_id.
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function ensureAgentRoutingArmsColdStart(db, opts = {}) {
  const agentSlug = normalizeAgentSlug(opts.agentSlug);
  if (!db || !agentSlug) return { ok: false, reason: 'missing_agent_slug' };

  const cols = await pragmaTableInfo(db, ARMS);
  if (!cols.has('agent_slug')) return { ok: false, reason: 'agent_slug_column_missing' };

  const ws = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';
  if (!ws) return { ok: false, reason: 'missing_workspace' };

  const profile = opts.profile && typeof opts.profile === 'object' ? opts.profile : null;
  const defaultMk = String(profile?.default_model_id || opts.defaultModelKey || '').trim();
  if (!defaultMk) return { ok: false, reason: 'missing_default_model' };

  const tt =
    opts.taskType != null && String(opts.taskType).trim() !== ''
      ? String(opts.taskType).trim()
      : 'chat';
  const modes = modesForColdStart(tt, opts.mode || 'agent');
  let seeded = 0;

  let provider = 'unknown';
  try {
    const cat = await db
      .prepare(
        `SELECT provider FROM agentsam_model_catalog WHERE model_key = ? AND is_active = 1 LIMIT 1`,
      )
      .bind(defaultMk)
      .first();
    if (cat?.provider) provider = String(cat.provider);
    else {
      const ai = await db
        .prepare(
          `SELECT provider FROM agentsam_ai WHERE model_key = ? AND mode = 'model' AND status = 'active' LIMIT 1`,
        )
        .bind(defaultMk)
        .first();
      if (ai?.provider) provider = String(ai.provider);
    }
  } catch {
    /* keep unknown */
  }

  for (const modeTry of modes) {
    const exists = await db
      .prepare(
        `SELECT 1 AS ok FROM ${ARMS}
         WHERE workspace_id = ? AND task_type = ? AND mode = ? AND agent_slug = ?
         LIMIT 1`,
      )
      .bind(ws, tt, modeTry, agentSlug)
      .first()
      .catch(() => null);
    if (exists?.ok) continue;

    const armId = `ra_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    try {
      await db
        .prepare(
          `INSERT OR IGNORE INTO ${ARMS} (
            id, workspace_id, task_type, mode, model_key, provider, agent_slug,
            success_alpha, success_beta, is_active, is_eligible, is_paused,
            decayed_score, priority, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, 0.5, 60, unixepoch())`,
        )
        .bind(
          armId,
          ws,
          tt,
          modeTry,
          defaultMk,
          provider,
          agentSlug,
          NEUTRAL_ALPHA,
          NEUTRAL_BETA,
        )
        .run();
      seeded += 1;
    } catch (e) {
      console.warn('[routing-arms-agent-slug] cold_start_insert', {
        agentSlug,
        taskType: tt,
        mode: modeTry,
        modelKey: defaultMk,
        error: e?.message ?? e,
      });
    }
  }

  return { ok: true, seeded, agentSlug, taskType: tt, defaultModelKey: defaultMk };
}

/**
 * Merge agent-scoped arms with workspace-global arms (agent_slug '').
 * Agent rows first so Thompson explores per-agent bandit; globals fill gaps.
 * @param {Record<string, unknown>[]} agentRows
 * @param {Record<string, unknown>[]} globalRows
 */
export function mergeAgentAndGlobalRoutingArms(agentRows, globalRows) {
  const seen = new Set();
  const out = [];
  for (const row of [...(agentRows || []), ...(globalRows || [])]) {
    const mk = String(row?.model_key || '').trim();
    const key = `${row?.task_type || ''}|${row?.mode || ''}|${mk}`;
    if (!mk || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
