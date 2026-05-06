import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';

export async function archiveOldConversations(env) {
  if (!env.DB || !env.R2) return { archived: 0, errors: [], total_candidates: 0 };
  const begun = await startCronRun(env, {
    jobName: 'archive_old_conversations',
    cronExpression: '0 0 * * *',
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  let candidates = { results: [] };
  try {
    candidates = await env.DB.prepare(
      `SELECT am.conversation_id,
        COUNT(*) AS msg_count,
        SUM(LENGTH(COALESCE(am.content, ''))) AS size_bytes,
        MAX(ac.title) AS title,
        MAX(ac.user_id) AS user_id,
        MIN(datetime(am.created_at, 'unixepoch')) AS first_msg,
        MAX(datetime(am.created_at, 'unixepoch')) AS last_msg
       FROM agent_messages am
       LEFT JOIN agent_conversations ac ON ac.id = am.conversation_id
       WHERE (ac.r2_context_key IS NULL OR ac.r2_context_key = '')
       GROUP BY am.conversation_id
       HAVING COUNT(*) > 10
       ORDER BY size_bytes DESC
       LIMIT 50`
    ).all();
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    return { archived: 0, errors: [{ error: String(e?.message || e) }], total_candidates: 0 };
  }

  const errors = [];
  let archived = 0;
  const rows = candidates.results || [];

  for (const convo of rows) {
    const cid = convo.conversation_id;
    if (!cid) continue;
    try {
      const msgs = await env.DB.prepare(
        `SELECT role, content, provider,
          datetime(created_at, 'unixepoch') AS ts
         FROM agent_messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC`
      ).bind(cid).all();

      const lines = [
        '# Conversation Archive',
        `id: ${cid}`,
        `title: ${convo.title || 'Untitled'}`,
        `messages: ${convo.msg_count}`,
        `size_bytes: ${convo.size_bytes}`,
        `first: ${convo.first_msg}`,
        `last: ${convo.last_msg}`,
        `archived_at: ${new Date().toISOString()}`,
        '---',
        '',
      ];

      for (const msg of msgs.results || []) {
        lines.push(`## [${msg.ts}] ${String(msg.role || '').toUpperCase()}`);
        if (msg.provider) lines.push(`_provider: ${msg.provider}_`);
        lines.push('');
        lines.push(String(msg.content || ''));
        lines.push('');
        lines.push('---');
        lines.push('');
      }

      const markdown = lines.join('\n');
      const r2Key = `agent-sessions/archive/${cid}.md`;

      await env.R2.put(r2Key, markdown, {
        httpMetadata: { contentType: 'text/markdown' },
        customMetadata: {
          conversation_id: cid,
          msg_count: String(convo.msg_count),
          archived_at: new Date().toISOString(),
        },
      });

      const nowSec = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `UPDATE agent_conversations
         SET r2_context_key = ?, is_archived = 1, updated_at = ?
         WHERE id = ?`
      ).bind(r2Key, nowSec, cid).run();

      const markerId = `compact_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const markerText = `ARCHIVED: ${convo.msg_count} messages archived to R2. Key: ${r2Key}`;
      try {
        await env.DB.prepare(
          `INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at, is_compaction_marker)
           VALUES (?, ?, 'system', ?, 'archive', unixepoch(), 1)`
        ).bind(markerId, cid, markerText).run();
      } catch (e1) {
        await env.DB.prepare(
          `INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at)
           VALUES (?, ?, 'system', ?, 'archive', unixepoch())`
        ).bind(markerId, cid, markerText).run().catch(() => { });
      }

      const checkName = `archive_${String(cid).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)}`;
      await env.DB.prepare(
        `INSERT INTO quality_checks
          (project_id, check_type, check_name, status,
           actual_value, expected_value, threshold_met,
           details, severity, automated, check_category, checked_at)
         VALUES ('inneranimalmedia','performance',
          ?, 'pass', ?, 'r2_archived', 1,
          ?, 'low', 1, 'conversation_archive', datetime('now'))`
      ).bind(checkName, r2Key, `Archived ${convo.msg_count} messages (${convo.size_bytes} bytes) to R2: ${r2Key}`).run();

      archived++;
    } catch (e) {
      errors.push({ conversation_id: cid, error: String(e?.message || e) });
    }
  }

  if (runId) {
    await completeCronRun(env, runId, startedAt, {
      rowsRead: rows.length,
      rowsWritten: archived,
      metadata: { total_candidates: rows.length, error_count: errors.length },
    });
  }
  return { archived, errors, total_candidates: rows.length };
}
