import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';

const RAG_COMPACT_MAX_MSG_CHARS = 800;
const RAG_COMPACT_HOURS = 48;

export async function compactAgentChatsToR2(env) {
  if (!env.DB || !env.R2) {
    return { conversations: 0, messages: 0, key: '', error: 'DB or R2 missing' };
  }
  const begun = await startCronRun(env, {
    jobName: 'compact_agent_chats_r2',
    cronExpression: '0 6 * * *',
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  const cutoff = Math.floor(Date.now() / 1000) - (RAG_COMPACT_HOURS * 3600);
  let rows = [];
  try {
    const out = await env.DB.prepare(
      `SELECT conversation_id, role, content, created_at
       FROM agent_messages
       WHERE created_at < ?
       ORDER BY conversation_id, created_at ASC`
    ).bind(cutoff).all();
    rows = out?.results || [];
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    return { conversations: 0, messages: 0, key: '', error: String(e?.message || e) };
  }
  const byConv = new Map();
  for (const r of rows) {
    const cid = r.conversation_id || 'unknown';
    if (!byConv.has(cid)) byConv.set(cid, []);
    const content = typeof r.content === 'string' ? r.content : String(r.content || '');
    const snippet = content.length > RAG_COMPACT_MAX_MSG_CHARS
      ? content.slice(0, RAG_COMPACT_MAX_MSG_CHARS) + '...'
      : content;
    byConv.get(cid).push({
      role: r.role || 'user',
      text: snippet.replace(/\n/g, ' ').trim(),
      created_at: r.created_at,
    });
  }
  const today = new Date().toISOString().slice(0, 10);
  const lines = [`# Compacted agent chats -- ${today}`, '', `Conversations: ${byConv.size} | Messages: ${rows.length}`, ''];
  const summaries = [];
  if (env.AI && byConv.size > 0) {
    for (const [cid, messages] of byConv) {
      const blob = messages.map((m) => `${m.role}: ${m.text}`).join('\n');
      if (blob.length < 20) continue;
      try {
        const out = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [{ role: 'user', content: `Summarize this conversation in 1-2 sentences for search. Be specific about topics and decisions.\n\n${blob.slice(0, 4000)}` }],
          max_tokens: 120,
        });
        const summary = (out?.result?.response ?? out?.response ?? (typeof out === 'string' ? out : '')).trim();
        if (summary) summaries.push({ cid, summary });
      } catch (e) {
        console.warn('[rag/compact] summary failed for', cid, e?.message);
      }
    }
  }
  if (summaries.length > 0) {
    lines.push('## Summaries (for RAG)');
    for (const { cid, summary } of summaries) {
      lines.push(`- **${cid}**: ${summary}`);
    }
    lines.push('');
  }
  for (const [cid, messages] of byConv) {
    lines.push(`## ${cid}`);
    for (const m of messages) {
      const label = m.role === 'assistant' ? 'assistant' : 'user';
      const ts = m.created_at ? new Date(m.created_at * 1000).toISOString().slice(0, 19) : '';
      lines.push(`- **${label}** ${ts ? `(${ts}) ` : ''}${m.text}`);
    }
    lines.push('');
  }
  const markdown = lines.join('\n');
  const key = `memory/compacted-chats/${today}.md`;
  try {
    await env.R2.put(key, markdown, { httpMetadata: { contentType: 'text/markdown' } });
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    return { conversations: byConv.size, messages: rows.length, key: '', error: String(e?.message || e) };
  }
  // Archive each conversation as full JSONL to R2, then delete from D1
  let deleted = 0;
  const convIds = [...byConv.keys()];
  for (const cid of convIds) {
    const msgs = byConv.get(cid);
    if (!msgs?.length) continue;
    try {
      // Write full conversation to R2
      const convKey = `conversations/${today.slice(0, 7)}/${cid}.jsonl`;
      const jsonl = msgs.map(m => JSON.stringify(m)).join("\n");
      await env.R2.put(convKey, jsonl, { httpMetadata: { contentType: "application/x-ndjson" } });
      // Update conversation record
      await env.DB.prepare(
        `UPDATE agent_conversations SET r2_context_key = ?, is_archived = 1, updated_at = ? WHERE id = ?`
      ).bind(convKey, Math.floor(Date.now() / 1000), cid).run();
      // Delete messages from D1
      const del = await env.DB.prepare(
        `DELETE FROM agent_messages WHERE conversation_id = ? AND created_at < ?`
      ).bind(cid, cutoff).run();
      deleted += del.changes ?? 0;
    } catch (e) {
      console.warn("[compact] archive/delete failed for", cid, e?.message);
    }
  }
  console.log(`[compact] archived ${convIds.length} conversations, deleted ${deleted} messages from D1`);
  if (runId) {
    await completeCronRun(env, runId, startedAt, {
      rowsRead: rows.length,
      rowsWritten: deleted,
      metadata: { key, conversations: byConv.size },
    });
  }
  return { conversations: byConv.size, messages: rows.length, key, deleted };
}
