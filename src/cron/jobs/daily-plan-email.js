import { cronTenantId } from '../cron-tenant.js';

export async function sendDailyPlanEmail(env) {
  if (!env.DB || !env.RESEND_API_KEY) return;
  const planTid = cronTenantId(env);
  if (!planTid) {
    console.warn('[daily-plan] TENANT_ID not configured; skip');
    return;
  }
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  try {
    const [tasks, cicdPipelines, sprintMemory, deployments, velocity, projects, memory, proposals, overnightSuite, telemetryToday, todayPlan, blockedProviders] = await Promise.all([
      env.DB.prepare(`SELECT title, description, priority, status, tags FROM agentsam_todo
        WHERE tenant_id=? AND status IN ('todo','in_progress','blocked')
        ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, updated_at DESC LIMIT 10`).bind(planTid).all(),
      env.DB.prepare(
        `SELECT run_id, env, status, branch, commit_hash, notes, completed_at
         FROM cicd_pipeline_runs
         ORDER BY datetime(COALESCE(completed_at, '1970-01-01')) DESC
         LIMIT 8`
      ).all(),
      env.DB.prepare(
        `SELECT key, value FROM project_memory
         WHERE project_id='inneranimalmedia'
           AND (key LIKE '%SPRINT%' OR key LIKE '%CIDI%' OR key IN ('CIDI_THREE_STEP_SYSTEM','AGENT_DASHBOARD_UI_CONTEXT'))
         ORDER BY updated_at DESC LIMIT 8`
      ).all(),
      env.DB.prepare(`SELECT id, version, description, status, timestamp FROM deployments
        ORDER BY timestamp DESC LIMIT 5`).all(),
      env.DB.prepare(`SELECT velocity_score, momentum, sprint_goal, sprint_progress_percent,
        bugs_fixed, features_shipped, notes FROM task_velocity ORDER BY date DESC LIMIT 1`).all(),
      env.DB.prepare(`SELECT name, status, client_name FROM projects
        WHERE status NOT IN ('archived','completed') ORDER BY updated_at DESC LIMIT 6`).all(),
      env.DB.prepare(`SELECT key, value FROM project_memory
        WHERE project_id='inneranimalmedia' ORDER BY updated_at DESC LIMIT 8`).all(),
      env.DB.prepare(`SELECT command_name, rationale, risk_level FROM agent_command_proposals
        WHERE status='pending' ORDER BY created_at DESC LIMIT 4`).all(),
      safe(env.DB.prepare(`SELECT key, value, updated_at FROM project_memory
        WHERE project_id='inneranimalmedia' AND key='OVERNIGHT_API_SUITE_LAST' LIMIT 1`).first()),
      safe(env.DB.prepare(
        `SELECT COUNT(*) AS calls,
          COALESCE(SUM(input_tokens), 0) AS tokens_in,
          COALESCE(SUM(output_tokens), 0) AS tokens_out,
          ROUND(COALESCE(SUM(computed_cost_usd), 0), 4) AS cost_usd,
          COUNT(DISTINCT model_used) AS models_used
         FROM agent_telemetry
         WHERE created_at >= unixepoch('now', 'start of day')`
      ).first()),
      // Today's plan from agentsam_plans + tasks
      safe(env.DB.prepare(
        `SELECT p.title, p.morning_brief, p.default_model, p.blocked_providers,
                COUNT(t.id) AS tasks_total,
                SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) AS tasks_done,
                SUM(CASE WHEN t.status='blocked' THEN 1 ELSE 0 END) AS tasks_blocked
         FROM agentsam_plans p
         LEFT JOIN agentsam_plan_tasks t ON t.plan_id = p.id
         WHERE p.plan_date = date('now')
         GROUP BY p.id
         LIMIT 1`
      ).first()),
      // Blocked providers from agentsam_routing_arms
      safe(env.DB.prepare(
        `SELECT GROUP_CONCAT(DISTINCT provider) AS blocked
         FROM agentsam_routing_arms
         WHERE is_active = 0
         GROUP BY 1`
      ).first()),
    ]);
    console.log('[daily-plan] D1 queries complete — tasks:', tasks?.results?.length, 'cicd:', cicdPipelines?.results?.length, 'sprintMem:', sprintMemory?.results?.length);

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const planCtx = todayPlan ? `\nTODAY'S PLAN (from agentsam_plans):\nTitle: ${todayPlan.title}\nTasks: ${todayPlan.tasks_total} total | ${todayPlan.tasks_done} done | ${todayPlan.tasks_blocked} blocked\nMorning Brief: ${todayPlan.morning_brief?.slice(0, 400) || 'none'}\nBlocked providers: ${todayPlan.blocked_providers || '[]'}` : '';
    const budgetCtx = `\nPROVIDER BUDGET STATUS:\nOpenAI: ~$36 remaining (ACTIVE)\nGoogle/Gemini: ACTIVE (near-free)\nWorkers AI: ACTIVE (free tier)\nAnthropic: DISABLED (zero budget)\nCursor: DISABLED (zero budget)`;

    const prompt = `You are Agent Sam writing Sam Primeaux's daily morning briefing. Today is ${today}.${planCtx}${budgetCtx}

OPEN TASKS (live from D1, ordered by priority):
${JSON.stringify(tasks.results)}

CICD PIPELINE RUNS (recent; live from cicd_pipeline_runs):
${JSON.stringify(cicdPipelines.results)}

SPRINT / CIDI CONTEXT (project_memory keys; current sprint status):
${JSON.stringify(sprintMemory.results)}

RECENT DEPLOYMENTS:
${JSON.stringify(deployments.results)}

SPRINT VELOCITY:
${JSON.stringify(velocity.results?.[0] || {})}

ACTIVE CLIENT PROJECTS:
${JSON.stringify(projects.results)}

PROJECT MEMORY (most recent context):
${JSON.stringify(memory.results)}

PENDING AGENT PROPOSALS:
${JSON.stringify(proposals.results)}

OVERNIGHT API SUITE (last run; written by scripts/overnight-api-suite.mjs with WRITE_OVERNIGHT_TO_D1=1):
${JSON.stringify(overnightSuite || {})}

AI TELEMETRY TODAY (UTC calendar day; same window as daily digest):
${JSON.stringify(telemetryToday || {})}

Write a plain-text morning briefing email with these exact sections:

TOP 3 MUST-DO TODAY
[Ordered by urgency + dependency. Be specific — exact steps, exact file names, exact commands where relevant.]

SPRINT / PIPELINE NEXT STEP
[Use CICD PIPELINE RUNS + SPRINT / CIDI CONTEXT above — not legacy roadmap_steps. Name the highest-leverage pipeline or memory item to tackle today and how to start.]

QUICK WINS (under 30 mins each)
[2-3 small tasks from the list. Be specific.]

WATCH OUT
[Any blockers, broken things, failing proposals, or risks. Be blunt.]

DELEGATE TO AGENT SAM
[What to ask Agent Sam to do autonomously today — specific tool calls or queries.]

CLIENT PROJECTS
[One line each on any active client needing attention today.]

OVERNIGHT METRICS
[If OVERNIGHT SUITE row has JSON in value, summarize tier pass/fail, ab_fails, and tier_c_target. If empty or missing, say no overnight row yet. Include AI TELEMETRY TODAY numbers: calls, tokens_in/out, cost_usd, models_used.]

Rules: Under 450 words. No fluff. No emojis. Direct and actionable. Treat Sam like a technical founder with limited time and limited AI spend this week.`;

    let emailBody = '';

    // Priority 1: Gemini Flash — $0.000004/call (750x cheaper than Haiku)
    const geminiKey = env.GOOGLE_AI_API_KEY || env.GEMINI_API_KEY;
    if (!emailBody && geminiKey) {
      try {
        const gRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: 'You are Agent Sam writing a concise daily morning briefing. Plain text only. Under 450 words. No fluff. No emojis. Direct and actionable.' }] },
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 900, temperature: 0.3 },
            })
          }
        );
        if (gRes.ok) {
          const gData = await gRes.json();
          emailBody = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          if (emailBody) console.log('[daily-plan] generated via Gemini Flash');
        }
      } catch (e) { console.warn('[daily-plan] Gemini Flash failed:', e?.message); }
    }

    // Priority 2: OpenAI gpt-5.4-nano via Responses API
    if (!emailBody && env.OPENAI_API_KEY) {
      try {
        const oRes = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: 'gpt-5.4-nano',
            input: [
              { role: 'system', content: 'You are Agent Sam writing a concise daily morning briefing. Plain text only. Under 450 words. No fluff. Direct and actionable.' },
              { role: 'user', content: prompt }
            ],
            reasoning: { effort: 'low' },
            text: { verbosity: 'low' },
            max_output_tokens: 900,
          })
        });
        if (oRes.ok) {
          const oData = await oRes.json();
          emailBody = oData?.output_text?.trim() || '';
          if (emailBody) console.log('[daily-plan] generated via gpt-5.4-nano');
        }
      } catch (e) { console.warn('[daily-plan] OpenAI fallback failed:', e?.message); }
    }

    // Priority 3: Workers AI — free, no external budget needed
    if (!emailBody) {
      try {
        const ai = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
          messages: [{ role: 'system', content: 'Write a concise daily briefing. Plain text. Under 450 words. No emojis.' }, { role: 'user', content: prompt }],
          max_tokens: 900,
        });
        emailBody = (ai?.result?.response ?? ai?.response ?? '').trim();
        if (emailBody) console.log('[daily-plan] generated via Workers AI Llama 4 Scout (free)');
      } catch (e) { console.warn('[daily-plan] Workers AI failed:', e?.message); }
    }

    if (!emailBody) emailBody = 'Daily plan could not be generated. Check provider budgets.';
    console.log('[daily-plan] email body length', emailBody.length);

    const subject = `IAM Daily Plan — ${today}`;
    // Wrap plain text in minimal HTML for better email client rendering
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
      <div class="footer">inneranimalmedia.com &bull; Generated by Gemini Flash &bull; $0.000004</div>
    </div></body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.RESEND_FROM || 'Inner Animal Media <support@inneranimalmedia.com>',
        to: [env.RESEND_TO || 'support@inneranimalmedia.com'],
        subject,
        text: emailBody,
        html: htmlBody,
      })
    });
    console.log('[daily-plan] Resend status', res.status);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend: ${res.status} ${err}`);
    }
    console.log('[cron] daily-plan email sent');
  } catch (err) {
    console.error('[daily-plan] FATAL:', err?.message, err?.stack);
  }
}
