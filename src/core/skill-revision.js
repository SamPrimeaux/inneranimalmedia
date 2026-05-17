/**
 * Append-only audit rows for agentsam_skill definition changes.
 */

import { scheduleAgentsamErrorLog } from './agentsam-error-log.js';

/** Fields that warrant a revision row (not invocation metrics). */
export const SKILL_REVISION_TRACKED_FIELDS = new Set([
  'name',
  'description',
  'icon',
  'content_markdown',
  'slash_trigger',
  'globs',
  'always_apply',
  'tags',
  'sort_order',
  'is_active',
]);

export function skillPatchKeysNeedRevision(keys) {
  return (keys || []).some((k) => SKILL_REVISION_TRACKED_FIELDS.has(k));
}

/**
 * @param {any} env
 * @param {object} opts
 * @param {string} opts.skillId
 * @param {string} [opts.changedBy]
 * @param {string|null} [opts.changeNote]
 * @param {string} [opts.contentMarkdown]
 * @param {any} [workerCtx]
 */
export async function appendAgentsamSkillRevision(env, opts = {}, workerCtx = null) {
  if (!env?.DB) return { ok: false, error: 'db_unavailable' };
  const skillId = opts.skillId != null ? String(opts.skillId).trim() : '';
  if (!skillId) return { ok: false, error: 'skill_id_required' };

  const changedBy = String(opts.changedBy ?? 'system').slice(0, 200);
  const changeNote =
    opts.changeNote != null && String(opts.changeNote).trim() !== ''
      ? String(opts.changeNote).slice(0, 2000)
      : null;
  const contentMarkdown =
    opts.contentMarkdown != null ? String(opts.contentMarkdown) : null;

  try {
    if (contentMarkdown != null) {
      await env.DB.prepare(
        `INSERT INTO agentsam_skill_revision (id, skill_id, content_markdown, version, changed_by, change_note)
         VALUES (
           'skillrev_'||lower(hex(randomblob(8))),
           ?,
           ?,
           COALESCE((SELECT MAX(version) FROM agentsam_skill_revision WHERE skill_id = ?), 0) + 1,
           ?,
           ?
         )`,
      )
        .bind(skillId, contentMarkdown, skillId, changedBy, changeNote)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO agentsam_skill_revision (id, skill_id, content_markdown, version, changed_by, change_note)
         SELECT 'skillrev_'||lower(hex(randomblob(8))), id, content_markdown,
                COALESCE((SELECT MAX(version) FROM agentsam_skill_revision WHERE skill_id = agentsam_skill.id), 0) + 1,
                ?, ?
         FROM agentsam_skill WHERE id = ?`,
      )
        .bind(changedBy, changeNote, skillId)
        .run();
    }
    return { ok: true };
  } catch (e) {
    const msg = e?.message ?? String(e);
    const tid = opts.tenantId != null ? String(opts.tenantId).trim() : '';
    const wid = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';
    if (env?.DB && tid && workerCtx?.waitUntil) {
      scheduleAgentsamErrorLog(env, workerCtx, {
        workspaceId: wid || tid,
        tenantId: tid,
        sessionId: null,
        errorCode: 'skill_revision_insert_failed',
        errorType: 'agentsam_skill_revision',
        errorMessage: msg.slice(0, 8000),
        source: 'appendAgentsamSkillRevision',
        contextJson: JSON.stringify({ skill_id: skillId }),
      });
    } else {
      console.warn('[agentsam_skill_revision]', msg);
    }
    return { ok: false, error: msg };
  }
}
