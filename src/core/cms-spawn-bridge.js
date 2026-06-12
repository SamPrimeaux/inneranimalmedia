/**
 * CMS M3 heavy-work spawn bridge — agentsam_spawn_job + agentsam_spawn_session.
 *
 * Thresholds (documented):
 * - CMS_SPAWN_SECTION_THRESHOLD = 8 — multi-section draft promote / import mapping
 * - CMS_SPAWN_PAYLOAD_BYTES = 32768 — draft JSON or import payload size
 * - CMS_SPAWN_SESSION_TURN_THRESHOLD = 3 — multi-turn CMS editor → spawn_session handoff
 */

import { initiateHandoff } from './agent-handoff.js';
import { createSpawnJob } from './subagent-spawn-d1.js';

export const CMS_SPAWN_SECTION_THRESHOLD = 8;
export const CMS_SPAWN_PAYLOAD_BYTES = 32768;
export const CMS_SPAWN_SESSION_TURN_THRESHOLD = 3;

/**
 * @param {unknown} draftData
 */
export function cmsDraftPayloadBytes(draftData) {
  try {
    return new TextEncoder().encode(JSON.stringify(draftData || {})).byteLength;
  } catch {
    return 0;
  }
}

/**
 * @param {unknown} draftData
 */
export function cmsDraftSectionCount(draftData) {
  if (!draftData || typeof draftData !== 'object') return 0;
  const sections = /** @type {Record<string, unknown>} */ (draftData).sections;
  return sections && typeof sections === 'object' ? Object.keys(sections).length : 0;
}

/**
 * @param {{
 *   sectionCount?: number,
 *   payloadBytes?: number,
 *   importName?: string|null,
 * }} opts
 */
export function cmsExceedsSpawnThreshold(opts) {
  const sections = Number(opts.sectionCount) || 0;
  const bytes = Number(opts.payloadBytes) || 0;
  if (sections >= CMS_SPAWN_SECTION_THRESHOLD) return { spawn: true, reason: 'section_count', value: sections };
  if (bytes >= CMS_SPAWN_PAYLOAD_BYTES) return { spawn: true, reason: 'payload_bytes', value: bytes };
  if (opts.importName) return { spawn: true, reason: 'template_import', value: opts.importName };
  return { spawn: false, reason: null, value: 0 };
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   userId: string,
 *   workspaceId: string,
 *   tenantId: string|null,
 *   masterRunId: string,
 *   taskDescription: string,
 *   chunkCount: number,
 * }} opts
 */
export async function maybeSpawnCmsHeavyJob(env, ctx, opts) {
  const threshold = cmsExceedsSpawnThreshold({
    sectionCount: opts.chunkCount,
    payloadBytes: 0,
  });
  if (!threshold.spawn || !env?.DB) return { spawned: false, spawn_job_id: null, reason: threshold.reason };

  const res = await createSpawnJob(env, ctx, {
    masterRunId: opts.masterRunId,
    masterAgentSlug: 'cms_edit',
    userId: opts.userId,
    workspaceId: opts.workspaceId,
    tenantId: opts.tenantId,
    taskDescription: opts.taskDescription,
    chunkCount: Math.max(1, opts.chunkCount),
    orchestratorSlug: 'cms_edit',
    mergeStrategy: 'concat',
  });
  return {
    spawned: !!res.ok,
    spawn_job_id: res.spawnJobId || null,
    reason: threshold.reason,
    threshold: CMS_SPAWN_SECTION_THRESHOLD,
  };
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   userId: string,
 *   workspaceId: string,
 *   tenantId: string|null,
 *   parentRunId: string,
 *   parentSessionId: string,
 *   turnCount: number,
 *   goal: string,
 *   messages?: unknown[],
 * }} opts
 */
export async function maybeSpawnCmsSessionHandoff(env, ctx, opts) {
  if ((opts.turnCount || 0) < CMS_SPAWN_SESSION_TURN_THRESHOLD || !env?.DB) {
    return { spawned: false, spawn_session_id: null };
  }
  try {
    const handoff = await initiateHandoff(env, {
      userId: opts.userId,
      workspaceId: opts.workspaceId,
      tenantId: opts.tenantId,
      parentRunId: opts.parentRunId,
      parentSessionId: opts.parentSessionId,
      parentSlug: 'cms_edit',
      fallbackModelKey: 'gpt-5.4-nano',
      goal: opts.goal,
      messages: opts.messages || [],
      reason: 'budget',
      urgency: 'medium',
      depth: 1,
      triggeredBy: 'cms_edit',
    });
    return {
      spawned: true,
      spawn_session_id: handoff.spawnId || null,
      child_session_id: handoff.childSessionId || null,
    };
  } catch (e) {
    console.warn('[cms-spawn-bridge] spawn_session', e?.message ?? e);
    return { spawned: false, spawn_session_id: null, error: String(e?.message || e) };
  }
}
