import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';
import { cronTenantId } from '../cron-tenant.js';

export async function sendDailyPlanEmail(env) {
  if (!env.DB || !env.RESEND_API_KEY) return;
  if (!env.RESEND_FROM?.trim() || !env.RESEND_TO?.trim()) {
    console.warn('[daily-plan-email] RESEND_FROM or RESEND_TO not set, skipping');
    return;
  }
  const tid = cronTenantId(env);
  if (!tid) { console.warn('[daily-plan] TENANT_ID not configured; skip'); return; }

  const begun = await startCronRun(env, {
    jobName: 'daily_plan_email',
    cronExpression: '30 13 * * *',
    tenantId: tid,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));

  try {
    const [
      memoryRows,
      platformCtx,
      clientCtxRows,
      recentRuns,
      runCostToday,
      cronHealth,
      mcpActivity,
      spawnJobs,
      migrations,
      velocityRecent,
    ] = await Promise.all([
      // Live sprint memory — decision/skill/state types, recently updated
      env.DB.prepare(
        `SELECT key, value, memory_type, updated_at FROM agentsam_memory
         WHERE tenant_id = ?
           AND memory_type IN ('decision','skill','state','policy')
           AND decay_score > 0
         ORDER BY updated_at DESC LIMIT 12`
      ).bind(tid).all(),

      // Platform master project context
      safe(env.DB.prepare(
        `SELECT project_name, status, description, current_blockers, goals, notes, updated_at
         FROM agentsam_project_context
         WHERE id = 'ctx_inneranimalmedia'`
      ).first()),

      // Active client project contexts
      env.DB.prepare(
        `SELECT project_name, status, current_blockers, goals, updated_at
         FROM agentsam_project_context
         WHERE tenant_id = ?
           AND id != 'ctx_inneranimalmedia'
           AND status IN ('active','blocked_live_platform_regression')
           AND project_type != 'cms_site'
         ORDER BY updated_at DESC LIMIT 6`
      ).bind(tid).all(),

      // Recent agent runs — last 24h cost + activity
      safe(env.DB.prepare(
        `SELECT COUNT(*) as total_runs,
                ROUND(SUM(cost_usd), 4) as total_cost,
                SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) as stuck_running
         FROM agentsam_agent_run
         WHERE workspace_id = 'ws_inneranimalmedia'
           AND created_at_unix > unixepoch('now','-24 hours')`
      ).first()),

      // Cost this week
      safe(env.DB.prepare(
        `SELECT ROUND(SUM(cost_usd), 4) as week_cost
         FROM agentsam_agent_run
         WHERE workspace_id = 'ws_inneranimalmedia'
           AND created_at_unix > unixepoch('now','-7 days')`
      ).first()),

      // Cron health — last run of each job
      env.DB.prepare(
        `SELECT job_name, status, started_at, duration_ms, error_message
         FROM agentsam_cron_runs
         WHERE started_at = (
           SELECT MAX(c2.started_at) FROM agentsam_cron_runs c2
           WHERE c2.job_name = agentsam_cron_runs.job_name
         )
         ORDER BY started_at DESC LIMIT 12`
      ).all(),

      // MCP tool activity last 24h
      env.DB.prepare(
        `SELECT tool_name, COUNT(*) as calls,
                SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as ok,
                SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors
         FROM mcp_audit_log
         WHERE workspace_id = 'ws_inneranimalmedia'
           AND created_at > unixepoch('now','-24 hours')
         GROUP BY tool_name ORDER BY calls DESC LIMIT 10`
      ).all(),

      // Active/recent skill spawn jobs
      env.DB.prepare(
        `SELECT master_agent_slug, status, subagents_spawned,
                subagents_succeeded, subagents_failed,
                started_at, completed_at
         FROM agentsam_spawn_job
         WHERE workspace_id = 'ws_inneranimalmedia'
         ORDER BY started_at DESC LIMIT 5`
      ).all(),

      // Velocity — last 7 days for trend
      env.DB.prepare(
        `SELECT date, velocity_score, momentum, new_concepts, confidence_gains,
                struggle_areas, ai_collab_score, commits_count, deploys_production,
                migrations_applied, mcp_tool_calls, notes
         FROM task_velocity
         ORDER BY date DESC LIMIT 7`
      ).all(),

      // Recent migrations applied
      env.DB.prepare(
        `SELECT id, name, applied_at FROM d1_migrations
         ORDER BY applied_at DESC LIMIT 5`
      ).all(),
    ]);

    // Git log via terminal for real commit context
    let gitLog = '';
    try {
      const r = await env.TERMINAL?.fetch?.(new Request('http://internal/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'cd ~/inneranimalmedia && git log --oneline -8' }),
      }));
      if (r?.ok) gitLog = await r.text();
    } catch { /* non-fatal */ }

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      timeZone: 'America/Chicago',
    });

    const prompt = `You are Agent Sam writing Sam Primeaux's daily morning briefing. Today is ${today}.

Sam is the solo founder of Inner Animal Media — building Agent Sam, an autonomous AI agent platform on Cloudflare Workers + D1 + R2 + Vectorize. He also manages client projects (CompanionsCPAS, Fuel & Free Time, others) and runs two other brands (Inner Animals apparel, Meauxbility nonprofit). He works entirely solo with AI tools. Time is his scarcest resource.

== PLATFORM MASTER CONTEXT (ctx_inneranimalmedia) ==
${JSON.stringify(platformCtx || {})}

== LIVE SPRINT MEMORY (agentsam_memory — decision/skill/state, recent) ==
${JSON.stringify(memoryRows?.results || [])}

== ACTIVE CLIENT PROJECTS ==
${JSON.stringify(clientCtxRows?.results || [])}

== AGENT RUN ACTIVITY (last 24h) ==
${JSON.stringify(recentRuns || {})}
Week cost so far: $${runCostToday?.week_cost ?? 0}

== CRON JOB HEALTH (last run of each) ==
${JSON.stringify(cronHealth?.results || [])}

== MCP TOOL ACTIVITY (last 24h) ==
${JSON.stringify(mcpActivity?.results || [])}

== ACTIVE SKILL SPAWN JOBS ==
${JSON.stringify(spawnJobs?.results || [])}

== VELOCITY & SKILL TREND (last 7 days) ==
${JSON.stringify(velocityRecent?.results || [])}

== RECENT D1 MIGRATIONS ==
${JSON.stringify(migrations?.results || [])}

== RECENT GIT COMMITS ==
${gitLog || '(not available)'}

Write a sharp morning briefing email. Sections:

WHAT SHIPPED YESTERDAY
[Pull from git commits + migrations. Name specific commits/migrations. Max 5 bullets.]

ACTIVE SPRINT FOCUS
[From agentsam_memory decision keys — what sprint is live, what phase, what's next. Be specific.]

CLIENT WATCH
[One line per active client project. Flag any current_blockers that need action today.]

PLATFORM HEALTH
[Cron jobs: any failures? Agent runs: any stuck_running? MCP activity: normal or spiked?]

SKILL GROWTH
[From task_velocity last 7 days. Show velocity_score trend. If new_concepts/confidence_gains/struggle_areas are filled in, surface them. If NULLs, say "log today in chat to track". One paragraph max.]

COST PULSE
[24h cost + week cost. Flag if trending high. One line.]

TODAY'S TOP 3
[Most important things to do today given all the above. Specific and ordered.]

Rules: Under 400 words total. No fluff. No emojis. Blunt. Treat Sam like a technical founder who has read the codebase — no explaining what D1 is.`;

    let emailBody = '';

    const geminiKey = env.GOOGLE_AI_API_KEY || env.GEMINI_API_KEY;
    if (!emailBody && geminiKey) {
      try {
        const gRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: 'You are Agent Sam. Write a concise daily briefing. Plain text only. Under 400 words. No emojis. Blunt and specific.' }] },
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 900, temperature: 0.2 },
            })
          }
        );
        if (gRes.ok) {
          const gData = await gRes.json();
          emailBody = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          if (emailBody) console.log('[daily-plan] generated via gemini-3.1-flash-lite');
        }
      } catch (e) { console.warn('[daily-plan] Gemini failed:', e?.message); }
    }

    if (!emailBody && env.OPENAI_API_KEY) {
      try {
        const oRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: 'gpt-4.1-nano',
            messages: [
              { role: 'system', content: 'You are Agent Sam. Write a concise daily briefing. Plain text only. Under 400 words. No emojis. Blunt.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 900,
            temperature: 0.2,
          })
        });
        if (oRes.ok) {
          const oData = await oRes.json();
          emailBody = oData?.choices?.[0]?.message?.content?.trim() || '';
          if (emailBody) console.log('[daily-plan] generated via gpt-4.1-nano');
        }
      } catch (e) { console.warn('[daily-plan] OpenAI fallback failed:', e?.message); }
    }

    if (!emailBody) {
      try {
        const ai = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
          messages: [
            { role: 'system', content: 'Write a concise daily briefing. Plain text. Under 400 words. No emojis. Blunt.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 900,
        });
        emailBody = (ai?.result?.response ?? ai?.response ?? '').trim();
        if (emailBody) console.log('[daily-plan] generated via Workers AI Llama 4 Scout');
      } catch (e) { console.warn('[daily-plan] Workers AI failed:', e?.message); }
    }

    if (!emailBody) emailBody = 'Daily briefing could not be generated. Check provider keys.';

    const subject = `Agent Sam — ${today}`;
    const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',monospace;background:#0a0a0f;color:#f4f4f5;padding:40px 20px;line-height:1.7}
      .wrap{max-width:680px;margin:0 auto;background:#111;border:1px solid rgba(255,107,0,0.2);border-radius:12px;padding:40px}
      .header{border-bottom:2px solid rgba(255,107,0,0.3);padding-bottom:20px;margin-bottom:28px}
      h1{color:#ff6b00;font-size:22px;margin:0}
      .date{color:rgba(244,244,245,0.5);font-size:13px;margin-top:6px}
      pre{white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:14px;color:#f4f4f5;margin:0}
      .footer{margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.1);font-size:12px;color:rgba(244,244,245,0.4);text-align:center}
    </style></head><body><div class="wrap">
      <div class="header"><h1>Agent Sam</h1><div class="date">${subject}</div></div>
      <pre>${emailBody.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
      <div class="footer">inneranimalmedia.com &bull; gemini-3.1-flash-lite &bull; ~$0.000004</div>
    </div></body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.RESEND_FROM.trim(),
        to: [env.RESEND_TO.trim()],
        subject,
        text: emailBody,
        html: htmlBody,
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend: ${res.status} ${err}`);
    }

    console.log('[cron] daily-plan email sent to', env.RESEND_TO);
    if (runId) await completeCronRun(env, runId, startedAt, { rowsRead: 9, rowsWritten: 1, metadata: { sent: true } });

  } catch (err) {
    if (runId) await failCronRun(env, runId, startedAt, err);
    console.error('[daily-plan] FATAL:', err?.message, err?.stack);
  }
}
