import { cronTenantId } from '../cron-tenant.js';

export async function sendDailyDigest(env) {
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
        `SELECT COUNT(*) AS calls,
          COALESCE(SUM(input_tokens), 0) AS tokens_in,
          COALESCE(SUM(output_tokens), 0) AS tokens_out,
          ROUND(COALESCE(SUM(computed_cost_usd), 0), 4) AS cost_usd,
          COUNT(DISTINCT model_used) AS models_used
         FROM agent_telemetry
         WHERE timestamp > CAST(strftime('%s', 'now', '-1 day') AS INTEGER)`
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
      safe(env.DB.prepare(
        `SELECT COUNT(*) AS queries, AVG(top_score) AS avg_score
         FROM rag_query_log
         WHERE date(created_at) = date('now')`
      ).first()),
      safe(env.DB.prepare(
        `SELECT memory_key, memory_value
         FROM agent_platform_context
         WHERE memory_key LIKE 'sse_audit_%'
         ORDER BY updated_at DESC
         LIMIT 20`
      ).all()),
      safe(env.DB.prepare(
        `SELECT check_name, severity, details
         FROM quality_checks
         WHERE status IN ('fail', 'failed', 'warn', 'warning') AND automated = 1
         ORDER BY
           CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           checked_at DESC
         LIMIT 10`
      ).all()),
      safe(env.DB.prepare(
        `SELECT COUNT(*) AS archived_convos FROM agent_conversations WHERE is_archived = 1`
      ).first()),
      safe(env.DB.prepare(
        `SELECT COUNT(*) AS total_msgs,
          ROUND(SUM(LENGTH(COALESCE(content, ''))) / 1024.0 / 1024.0, 2) AS size_mb,
          COUNT(DISTINCT conversation_id) AS convos
         FROM agent_messages`
      ).first()),
      safe(env.DB.prepare(
        `SELECT COUNT(*) AS ready FROM agent_conversations
         WHERE is_archived = 1 AND r2_context_key IS NOT NULL AND r2_context_key != ''`
      ).first()),
      safe(env.DB.prepare(
        `SELECT provider, ROUND(SUM(computed_cost_usd), 4) AS cost_usd
         FROM agent_telemetry
         WHERE created_at >= unixepoch('now', 'start of day') AND provider IS NOT NULL
         GROUP BY provider
         ORDER BY cost_usd DESC
         LIMIT 3`
      ).all()),
      safe(env.DB.prepare(
        `SELECT id, title, status FROM roadmap_steps WHERE plan_id = 'plan_iam_dashboard_v1' ORDER BY order_index ASC LIMIT 100`
      ).all()),
      safe(env.DB.prepare(
        `SELECT COUNT(*) AS count FROM notification_outbox WHERE status = 'pending'`
      ).all()),
      safe(env.DB.prepare(
        `SELECT project_name, status, priority, current_blockers,
                cursor_usage_percent, tokens_used
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

<h2>1. Today's AI spend (agent_telemetry)</h2>
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

  const toEmail = env.RESEND_TO || 'support@inneranimalmedia.com';
  if (env.RESEND_API_KEY) {
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
          from: env.RESEND_FROM || 'support@inneranimalmedia.com',
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
          env.RESEND_FROM || 'support@inneranimalmedia.com',
          subject,
          resendResult.id ?? null
        ).run().catch(() => { });
      }
      const today = new Date().toISOString().slice(0, 10);
      await env.R2.put('memory/daily/' + today + '.md', textBody).catch(() => { });
      const memFacts = [
        { key: 'active_priorities', value: 'Last digest: ' + today + '. ' + textBody.slice(0, 400), score: 0.9, type: 'user_context' },
        { key: 'what_works_today', value: textBody.slice(0, 600), score: 1.0, type: 'execution_outcome' },
      ];
      const digestMemTid = cronTenantId(env);
      if (digestMemTid) {
        for (const f of memFacts) {
          await env.DB.prepare(
            'INSERT INTO agentsam_memory (tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch()) ON CONFLICT(key) DO UPDATE SET value=excluded.value, importance_score=excluded.importance_score, updated_at=unixepoch()'
          ).bind(digestMemTid, 'agent-sam-primary', f.type, f.key, f.value, f.score).run().catch(() => { });
        }
      }
      await env.DB.prepare('DELETE FROM ai_compiled_context_cache').run().catch(() => { });

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

      return { ok: true, sent: true, to: toEmail };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e), digestText: textBody };
    }
  }
  return { ok: true, sent: false, digestText: textBody };
}
