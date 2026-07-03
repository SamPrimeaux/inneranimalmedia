import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';
import { cronTenantId } from '../cron-tenant.js';

export async function sendDailyDigest(env) {
  const digestBegun = env?.DB
    ? await startCronRun(env, {
        jobName: 'daily_digest_email',
        cronExpression: '0 0 * * *',
        tenantId: cronTenantId(env),
        workspaceId: null,
      })
    : null;
  const runId = digestBegun?.runId ?? null;
  const startedAt = digestBegun?.startedAt ?? Date.now();

  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let telemetryToday = {};
  let deploysToday = {};
  let deploysFailed = { results: [] };
  let mcpToday = {};
  let mcpTopTools = { results: [] };
  let ragToday = {};
  let sseStatus = { results: [] };
  let qualityFails = { results: [] };
  let archiveStatus = {};
  let msgTableSize = {};
  let readyPrune = {};
  let providerTop = { results: [] };
  let roadmap = { results: [] };
  let pending = { results: [{ count: 0 }] };
  let activeProjects = { results: [] };
  let hookHealth = { results: [] };

  if (env.DB) {
    [
      telemetryToday,
      deploysToday,
      deploysFailed,
      mcpToday,
      mcpTopTools,
      ragToday,
      sseStatus,
      qualityFails,
      archiveStatus,
      msgTableSize,
      readyPrune,
      providerTop,
      roadmap,
      pending,
      activeProjects,
      hookHealth,
    ] = await Promise.all([
      safe(env.DB.prepare(
        `SELECT COALESCE(SUM(ai_calls), 0) AS calls,
          COALESCE(SUM(tokens_in), 0) AS tokens_in,
          COALESCE(SUM(tokens_out), 0) AS tokens_out,
          ROUND(COALESCE(SUM(cost_usd), 0), 4) AS cost_usd,
          (
            SELECT COUNT(DISTINCT j.key)
            FROM agentsam_usage_rollups_daily r2,
                 json_each(COALESCE(r2.provider_breakdown_json, '{}')) j
            WHERE r2.day = date('now')
          ) AS models_used
         FROM agentsam_usage_rollups_daily
         WHERE day = date('now')`
      ).first()),
      safe(env.DB.prepare(
        `SELECT COUNT(*) AS total,
          COUNT(CASE WHEN environment = 'production' THEN 1 END) AS prod,
          COUNT(CASE WHEN status = 'success' THEN 1 END) AS success,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed
         FROM deployments
         WHERE created_at >= unixepoch('now', 'start of day')`
      ).first()),
      safe(env.DB.prepare(
        `SELECT id, worker_name, environment, status, description
         FROM deployments
         WHERE created_at >= unixepoch('now', 'start of day') AND status = 'failed'
         ORDER BY created_at DESC LIMIT 20`
      ).all()),
      safe(env.DB.prepare(
        `SELECT COUNT(*) AS calls, COUNT(DISTINCT tool_name) AS unique_tools
         FROM agentsam_mcp_tool_execution
         WHERE created_at > CAST(strftime('%s', 'now', '-1 day') AS INTEGER)`
      ).first()),
      safe(env.DB.prepare(
        `SELECT tool_name, COUNT(*) AS c
         FROM agentsam_mcp_tool_execution
         WHERE created_at > CAST(strftime('%s', 'now', '-1 day') AS INTEGER)
         GROUP BY tool_name
         ORDER BY c DESC
         LIMIT 3`
      ).all()),
      // rag_query_log, agent_platform_context, quality_checks, agent_conversations, agent_messages — dead tables, removed
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve(null),
      safe(env.DB.prepare(
        `SELECT j.key AS provider,
                ROUND(SUM(CAST(json_extract(j.value, '$.cost_usd') AS REAL)), 4) AS cost_usd
         FROM agentsam_usage_rollups_daily r,
              json_each(COALESCE(r.provider_breakdown_json, '{}')) j
         WHERE r.day = date('now')
         GROUP BY j.key
         HAVING provider IS NOT NULL AND provider != ''
         ORDER BY cost_usd DESC
         LIMIT 3`
      ).all()),
      // roadmap_steps dead — use agentsam_todo for open work items
      safe(env.DB.prepare(
        `SELECT id, title, status, priority FROM agentsam_todo
         WHERE workspace_id = 'ws_inneranimalmedia'
           AND status NOT IN ('done','completed','cancelled')
         ORDER BY priority DESC, created_at DESC
         LIMIT 10`
      ).all()),
      // notification_outbox dead
      Promise.resolve(null),
      safe(env.DB.prepare(
        `SELECT project_name, status, priority, current_blockers
         FROM agentsam_project_context
         WHERE status = 'active'
         ORDER BY priority DESC
         LIMIT 5`
      ).all()),
      safe(env.DB.prepare(
        `SELECT hook_id, status, COUNT(*) as count, MAX(ran_at) as latest
         FROM agentsam_hook_execution
         WHERE ran_at > datetime('now', '-7 days')
         GROUP BY hook_id, status`
      ).all()),
    ]);
  }

  const tt = telemetryToday || {};
  const dt = deploysToday || {};
  const steps = roadmap?.results ?? [];
  const done = steps.filter((r) => r.status === 'completed').length;
  const total = steps.length || 1;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const inProgressTitles = steps.filter((r) => r.status === 'in_progress').map((r) => r.title).join(', ');
  const notStartedTitles = steps.filter((r) => r.status === 'not_started').map((r) => r.title).join(', ');
  const pendingCount = pending?.results?.[0]?.count ?? 0;

  const liveJson = JSON.stringify({
    telemetryToday: tt,
    deploysToday: dt,
    mcpToday,
    ragToday,
    roadmapPct: { done, total, pct },
    pendingCount,
  });

  let digestText = 'IAM daily digest (live metrics in HTML).';
  if (env.ANTHROPIC_API_KEY) {
    try {
      const aiSummary = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `You are writing a short nightly digest blurb for Sam Primeaux (Inner Animal Media). Plain english, no emojis.

Live data (today, UTC window for telemetry = start of day):
${liveJson}

Write 3-5 sentences: AI spend and deploy activity, then one sentence on what to watch tomorrow. Under 120 words.`,
          }],
        }),
      });
      const aiResult = await aiSummary.json();
      digestText = aiResult.content?.[0]?.text ?? digestText;
    } catch (e) {
      digestText = `Digest narrative failed: ${e?.message ?? e}.`;
    }
  }

  const failedList = (deploysFailed?.results ?? []).map((r) => `${r.worker_name || r.id} (${r.environment})`).join('; ') || 'none';
  const provRows = providerTop?.results ?? [];
  const provHtml = provRows.length
    ? `<ul>${provRows.map((r) => `<li>${esc(r.provider)}: $${esc(r.cost_usd)}</li>`).join('')}</ul>`
    : '<p>None</p>';
  const toolsRows = mcpTopTools?.results ?? [];
  const toolsHtml = toolsRows.length
    ? `<ul>${toolsRows.map((r) => `<li>${esc(r.tool_name)}: ${esc(r.c)}</li>`).join('')}</ul>`
    : '<p>None</p>';
  const sseRows = sseStatus?.results ?? [];
  const sseHtml = sseRows.length
    ? `<ul>${sseRows.map((r) => `<li><strong>${esc(r.memory_key)}</strong>: ${esc(r.memory_value)}</li>`).join('')}</ul>`
    : '<p>No sse_audit rows (defaults: Anthropic tools path may buffer; Workers AI may need stream; Gemini input_tokens may be 0; OpenAI streaming OK).</p>';
  const qfRows = qualityFails?.results ?? [];
  const qfHtml = qfRows.length
    ? `<ul>${qfRows.map((r) => `<li>[${esc(r.severity)}] ${esc(r.check_name)}: ${esc((r.details || '').slice(0, 200))}</li>`).join('')}</ul>`
    : '<p>None open.</p>';
  const projRows = activeProjects?.results ?? [];
  const projHtml = projRows.length
    ? `<ul>${projRows.map((r) => {
      const p = r && typeof r === 'object' ? r : {};
      const prio = p.priority != null ? String(p.priority) : '';
      const blockers = p.current_blockers != null ? String(p.current_blockers).trim() : '';
      const warn = blockers ? ' ⚠' : '';
      const usage = p.cursor_usage_percent != null ? String(p.cursor_usage_percent) : '';
      const tokens = p.tokens_used != null ? String(p.tokens_used) : '';
      return `<li><strong>${esc(p.project_name)}</strong> (P${esc(prio)})${warn}<br/>` +
        `${blockers ? `<span style="color:#b45309"><strong>Blockers:</strong> ${esc(blockers)}</span><br/>` : ''}` +
        `<span style="opacity:0.8">Cursor:</span> ${esc(usage)}% | <span style="opacity:0.8">Tokens:</span> ${esc(tokens)}</li>`;
    }).join('')}</ul>`
    : '<p>None.</p>';
  const hhRows = hookHealth?.results ?? [];
  const hookMap = new Map();
  for (const r of hhRows) {
    const hookId = r && typeof r === 'object' ? String(r.hook_id || '') : '';
    const status = r && typeof r === 'object' ? String(r.status || '') : '';
    const count = r && typeof r === 'object' ? Number(r.count) || 0 : 0;
    const latest = r && typeof r === 'object' ? r.latest : null;
    if (!hookId) continue;
    if (!hookMap.has(hookId)) hookMap.set(hookId, { ok: 0, fail: 0, latest: null });
    const row = hookMap.get(hookId);
    if (status.toLowerCase().includes('success')) row.ok += count;
    else row.fail += count;
    if (latest && (!row.latest || String(latest) > String(row.latest))) row.latest = latest;
  }
  const hookHtml = hookMap.size
    ? `<ul>${Array.from(hookMap.entries()).map(([hookId, v]) => {
      const last = v.latest != null ? String(v.latest) : '';
      return `<li><strong>${esc(hookId)}</strong>: ` +
        `<span style="color:var(--solar-green,#16a34a)">success ${esc(v.ok)}</span>, ` +
        `<span style="color:var(--solar-red,#dc2626)">fail ${esc(v.fail)}</span>` +
        `${last ? ` — last: ${esc(last)}` : ''}` +
        `</li>`;
    }).join('')}</ul>`
    : '<p>No runs recorded.</p>';

  const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>IAM Daily Digest</title></head><body style="font-family:system-ui,sans-serif;line-height:1.5">
<h1>IAM Daily Digest</h1>
<p>${esc(digestText)}</p>

<h2>1. Today's AI spend (agentsam_usage_rollups_daily)</h2>
<p>Cost USD: <strong>${esc(tt.cost_usd)}</strong> | Calls: ${esc(tt.calls)} | Tokens in/out: ${esc(tt.tokens_in)} / ${esc(tt.tokens_out)} | Models used: ${esc(tt.models_used)}</p>
<h3>Top providers</h3>${provHtml}

<h2>2. Deployments (deployments)</h2>
<p>Total ${esc(dt.total)} | Prod ${esc(dt.prod)} | Success ${esc(dt.success)} | Failed ${esc(dt.failed)}</p>
<p>Failed: ${esc(failedList)}</p>

<h2>3. MCP tool usage (agentsam_mcp_tool_execution)</h2>
<p>Calls: ${esc(mcpToday?.calls)} | Unique tools: ${esc(mcpToday?.unique_tools)}</p>
<h3>Top 3 tools</h3>${toolsHtml}

<h2>4. RAG (rag_query_log)</h2>
<p>Queries: ${esc(ragToday?.queries)} | Avg top_score: ${esc(ragToday?.avg_score)}</p>

<h2>5. Streaming status (agent_platform_context sse_audit_*)</h2>
${sseHtml}
<p>Reference: Anthropic tools SSE partial; Workers AI may need stream; Gemini input_tokens bug; OpenAI working.</p>

<h2>6. Open quality issues</h2>
${qfHtml}

<h2>7. Conversation archive</h2>
<p>Messages in D1: ${esc(msgTableSize?.total_msgs)} rows, ${esc(msgTableSize?.size_mb)} MB, ${esc(msgTableSize?.convos)} convos.</p>
<p>Archived (is_archived): ${esc(archiveStatus?.archived_convos)} | Ready to prune (archived + R2 key): ${esc(readyPrune?.ready)}</p>

<h2>Active Projects</h2>
${projHtml}

<h2>Hook Health (last 7 days)</h2>
${hookHtml}

<h2>8. Tomorrow priorities</h2>
<ul>
<li>P1: Anthropic tools SSE (chatWithToolsAnthropic stream:true)</li>
<li>P1: spend_ledger INSERT in streamDoneDbWrites</li>
<li>P2: Workers AI stream:true + async iterator</li>
<li>P2: Gemini input_tokens fallback</li>
<li>Run: scripts/model-smoke-test.sh and scripts/batch-api-test.sh</li>
</ul>

<h2>Roadmap snapshot</h2>
<p>${done}/${total} steps (${pct}%). In progress: ${esc(inProgressTitles || 'none')}. Not started: ${esc(notStartedTitles || 'none')}. Pending notifications: ${esc(pendingCount)}</p>
</body></html>`;

  const textBody = [
    digestText,
    '',
    `AI spend today: $${tt.cost_usd} (${tt.calls} calls, tokens ${tt.tokens_in}/${tt.tokens_out})`,
    `Deploys: total ${dt.total} prod ${dt.prod} failed ${dt.failed}`,
    `MCP: ${mcpToday?.calls} calls`,
    `RAG queries: ${ragToday?.queries}`,
    `Archived convos: ${archiveStatus?.archived_convos}; D1 messages: ${msgTableSize?.total_msgs}`,
  ].join('\n');

  const toEmail = typeof env.RESEND_TO === 'string' && env.RESEND_TO.trim() ? env.RESEND_TO.trim() : '';
  const fromEmail = typeof env.RESEND_FROM === 'string' && env.RESEND_FROM.trim() ? env.RESEND_FROM.trim() : '';
  if (env.RESEND_API_KEY && toEmail && fromEmail) {
    try {
      const subject = `IAM Daily Digest -- ${new Date().toISOString().slice(0, 10)}`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [toEmail],
          subject,
          text: textBody,
          html: htmlBody,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Resend: ${res.status} ${err}`);
      }
      const resendResult = await res.json().catch(() => ({}));
      if (env.DB) {
        await env.DB.prepare(
          `INSERT INTO email_logs
           (id, to_email, from_email, subject, status, resend_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'sent', ?, datetime('now'), datetime('now'))`
        ).bind(
          crypto.randomUUID(),
          toEmail,
          fromEmail,
          subject,
          resendResult.id ?? null
        ).run().catch(() => { });
      }
      const today = new Date().toISOString().slice(0, 10);
      await env.R2.put('memory/daily/' + today + '.md', textBody).catch(() => { });
      // Write digest snapshot to memory with correct schema (workspace_id scoped, no legacy columns)
      const digestMemTid = cronTenantId(env);
      const digestMemWs = 'ws_inneranimalmedia';
      const digestMemUid = 'au_871d920d1233cbd1';
      if (digestMemTid && env.DB) {
        await env.DB.prepare(
          `INSERT INTO agentsam_memory
            (id, tenant_id, user_id, workspace_id, memory_type, key, value, importance, is_pinned, decay_score, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'fact', ?, ?, 5, 0, 1.0, 'daily_digest_cron', unixepoch(), unixepoch())
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = unixepoch()`
        ).bind(
          'mem_digest_' + today.replace(/-/g, ''),
          digestMemTid,
          digestMemUid,
          digestMemWs,
          'daily_digest_' + today,
          textBody.slice(0, 800),
        ).run().catch(() => { });
      }
      const { purgeStaleAgentBootstrapCache } = await import('../../core/agent-bootstrap-project-context.js');
      await purgeStaleAgentBootstrapCache(env.DB, { maxAgeSec: 0 });

      const digestSummary = `Spend $${tt.cost_usd ?? 0} | Deploys ${dt.total ?? 0} | MCP ${mcpToday?.calls ?? 0} | RAG ${ragToday?.queries ?? 0}`;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO daily_snapshots (
          snapshot_date, deploy_count, tokens_in, tokens_out, cost_usd,
          active_workflows, digest_text, created_at, updated_at
        ) VALUES (
          date('now'), ?, ?, ?, ?,
          15, ?, unixepoch(), unixepoch()
        )`
      ).bind(
        dt.total ?? 0,
        tt.tokens_in ?? 0,
        tt.tokens_out ?? 0,
        tt.cost_usd ?? 0,
        digestSummary
      ).run().catch(() => { });

      if (runId) {
        await completeCronRun(env, runId, startedAt, {
          rowsRead: 20,
          rowsWritten: 5,
          metadata: { sent: true },
        });
      }
      return { ok: true, sent: true, to: toEmail };
    } catch (e) {
      if (runId) await failCronRun(env, runId, startedAt, e);
      return { ok: false, error: String(e?.message ?? e), digestText: textBody };
    }
  }
  if (runId) {
    await completeCronRun(env, runId, startedAt, {
      rowsRead: 15,
      rowsWritten: 0,
      metadata: { sent: false, reason: 'missing_resend_or_addresses' },
    });
  }
  return { ok: true, sent: false, digestText: textBody };
}
