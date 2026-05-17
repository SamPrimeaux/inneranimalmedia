/**
 * Append-only audit rows for agentsam_skill content changes.
 */

export async function appendAgentsamSkillRevision(env, opts = {}) {
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
    return { ok: false, error: e?.message ?? String(e) };
  }
}
