/**
 * Append-only audit rows for agentsam_rules_document changes.
 */

import { scheduleAgentsamErrorLog } from './agentsam-error-log.js';

/**
 * @param {any} env
 * @param {object} opts
 * @param {string} opts.documentId
 * @param {string} [opts.createdBy]
 * @param {string} [opts.bodyMarkdown]
 * @param {number} [opts.version]
 * @param {any} [workerCtx]
 */
export async function appendAgentsamRulesRevision(env, opts = {}, workerCtx = null) {
  if (!env?.DB) return { ok: false, error: 'db_unavailable' };
  const documentId = opts.documentId != null ? String(opts.documentId).trim() : '';
  if (!documentId) return { ok: false, error: 'document_id_required' };

  const createdBy = String(opts.createdBy ?? 'system').slice(0, 200);
  const bodyMarkdown = opts.bodyMarkdown != null ? String(opts.bodyMarkdown) : '';
  const version =
    opts.version != null && Number.isFinite(Number(opts.version))
      ? Number(opts.version)
      : null;

  try {
    const ver =
      version ??
      ((
        await env.DB.prepare(
          `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM agentsam_rules_revision WHERE document_id = ?`,
        )
          .bind(documentId)
          .first()
      )?.v ?? 1);

    await env.DB.prepare(
      `INSERT INTO agentsam_rules_revision (id, document_id, body_markdown, version, created_by)
       VALUES ('ardrev_' || lower(hex(randomblob(8))), ?, ?, ?, ?)`,
    )
      .bind(documentId, bodyMarkdown, ver, createdBy)
      .run();
    return { ok: true, version: ver };
  } catch (e) {
    const msg = e?.message ?? String(e);
    if (env?.DB && workerCtx?.waitUntil) {
      scheduleAgentsamErrorLog(env, workerCtx, {
        workspaceId: opts.workspaceId != null ? String(opts.workspaceId) : '',
        tenantId: opts.tenantId != null ? String(opts.tenantId) : '',
        errorCode: 'rules_revision_insert_failed',
        errorMessage: msg.slice(0, 8000),
        source: 'appendAgentsamRulesRevision',
      });
    }
    return { ok: false, error: msg };
  }
}
