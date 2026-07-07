import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';
import { cronTenantId } from '../cron-tenant.js';
import {
  alertDailyPlan,
  DailyPlanError,
  gatherMorningPlanContext,
  generateWithGemini,
  resolveDailyPlanNotifyUser,
  triageInboxForDailyPlan,
} from './daily-plan-support.js';

/**
 * Morning plan cron — Gemini-only (3.1-flash-lite triage → 3.5-flash synthesis).
 * Fail loud: push + Resend alert on any model/send failure. No OpenAI/Workers AI fallback.
 *
 * @param {*} env
 * @param {ExecutionContext} [ctx]
 */
export async function sendDailyPlanEmail(env, ctx = null) {
  if (!env.DB || !env.RESEND_API_KEY) return;
  if (!env.RESEND_FROM?.trim() || !env.RESEND_TO?.trim()) {
    console.warn('[daily-plan-email] RESEND_FROM or RESEND_TO not set, skipping');
    return;
  }
  const tid = cronTenantId(env);
  if (!tid) {
    console.warn('[daily-plan] TENANT_ID not configured; skip');
    return;
  }

  const owner = await resolveDailyPlanNotifyUser(env);
  const begun = await startCronRun(env, {
    jobName: 'daily_plan_email',
    cronExpression: '30 13 * * *',
    tenantId: tid,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();

  try {
    const ctxData = await gatherMorningPlanContext(env, tid, owner);
    const inboxTriage = await triageInboxForDailyPlan(env, ctxData.gmailSnapshot?.emails || []);

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      timeZone: 'America/Chicago',
    });

    const prompt = `You are Agent Sam writing Sam Primeaux's daily morning briefing. Today is ${today}.

Sam is the solo founder of Inner Animal Media — building Agent Sam on Cloudflare Workers + D1 + R2 + Vectorize. He manages client projects and works solo with AI tools. Time is his scarcest resource.

== PLATFORM MASTER CONTEXT (agentsam_project_context.ctx_inneranimalmedia) ==
${JSON.stringify(ctxData.platformCtx || {})}

== LIVE SPRINT MEMORY (agentsam_memory — decision/skill/state/policy) ==
${JSON.stringify(ctxData.memoryRows?.results || [])}

== ACTIVE CLIENT PROJECTS (agentsam_project_context) ==
${JSON.stringify(ctxData.clientCtxRows?.results || [])}

== EMAIL WATCH — LIVE GMAIL (${ctxData.gmailSnapshot?.source || 'none'}, accounts: ${JSON.stringify(ctxData.gmailSnapshot?.accounts || [])}) ==
Raw inbox (last 48h): ${JSON.stringify(ctxData.gmailSnapshot?.emails || [])}

== EMAIL WATCH — TRIAGE (gemini-3.1-flash-lite) ==
${JSON.stringify(inboxTriage)}

== PLATFORM EMAIL LOG (email_logs, last 24h) ==
${JSON.stringify(ctxData.emailLogs24h?.results || [])}

== NOTIFICATION OUTBOX (pending/failed) ==
${JSON.stringify(ctxData.pendingNotifications?.results || [])}

== AGENT RUN ACTIVITY (agentsam_agent_run, last 24h) ==
${JSON.stringify(ctxData.recentRuns || {})}
Week cost: $${ctxData.runCostToday?.week_cost ?? 0}

== CRON HEALTH (agentsam_cron_runs) ==
${JSON.stringify(ctxData.cronHealth?.results || [])}

== MCP TOOL ACTIVITY (agentsam_mcp_tool_execution, last 24h) ==
${JSON.stringify(ctxData.mcpActivity?.results || [])}

== SKILL SPAWN JOBS (agentsam_spawn_job) ==
${JSON.stringify(ctxData.spawnJobs?.results || [])}

== VELOCITY (task_velocity, last 7 days) ==
${JSON.stringify(ctxData.velocityRecent?.results || [])}

== RECENT MIGRATIONS (d1_migrations) ==
${JSON.stringify(ctxData.migrations?.results || [])}

== RECENT GIT COMMITS ==
${ctxData.gitLog || '(not available)'}

Write a sharp morning briefing. Sections:

WHAT SHIPPED YESTERDAY
[git + migrations. Max 5 bullets.]

EMAIL WATCH
[From triage: urgent replies, archive candidates, accounts needing attention. Be specific — names/subjects.]

ACTIVE SPRINT FOCUS
[From agentsam_memory decision keys.]

CLIENT WATCH
[One line per active client project; flag blockers.]

PLATFORM HEALTH
[Cron failures, stuck runs, MCP spikes.]

SKILL GROWTH
[task_velocity trend — one paragraph.]

COST PULSE
[24h + week cost. One line.]

TODAY'S TOP 3
[Ordered, specific — include email actions if triage flagged any.]

Rules: Under 450 words. No fluff. No emojis. Blunt.`;

    const emailBody = await generateWithGemini(env, {
      modelKey: 'gemini-3.5-flash',
      stage: 'daily_synthesis',
      systemInstruction:
        'You are Agent Sam. Write a concise daily briefing. Plain text only. Under 450 words. No emojis. Blunt and specific.',
      userText: prompt,
      maxOutputTokens: 1024,
      temperature: 0.2,
    });

    console.log('[daily-plan] generated via gemini-3.5-flash');

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
      <pre>${emailBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      <div class="footer">inneranimalmedia.com &bull; gemini-3.1-flash-lite triage + gemini-3.5-flash synthesis</div>
    </div></body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.RESEND_FROM.trim(),
        to: [env.RESEND_TO.trim()],
        subject,
        text: emailBody,
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend: ${res.status} ${err}`);
    }

    console.log('[cron] daily-plan email sent to', env.RESEND_TO);
    if (runId) {
      await completeCronRun(env, runId, startedAt, {
        rowsRead: 12,
        rowsWritten: 1,
        metadata: {
          sent: true,
          gmail_accounts: ctxData.gmailSnapshot?.accounts?.length || 0,
          inbox_count: ctxData.gmailSnapshot?.emails?.length || 0,
        },
      });
    }

    await alertDailyPlan(env, {
      ok: true,
      title: 'Morning brief ready',
      body: `Agent Sam daily plan sent — ${today}`,
      userId: owner.userId,
      tenantId: tid,
      tag: 'daily-plan-ok',
    }, ctx);
  } catch (err) {
    if (runId) await failCronRun(env, runId, startedAt, err);
    const stage = err instanceof DailyPlanError ? err.stage : 'daily_plan';
    const model = err instanceof DailyPlanError ? err.model : '';
    const detail = err instanceof DailyPlanError ? err.detail : '';
    const msg = String(err?.message || err);
    console.error('[daily-plan] FATAL:', msg, err?.stack);

    await alertDailyPlan(env, {
      ok: false,
      title: `[FAIL] Daily plan — ${stage}${model ? ` (${model})` : ''}`,
      body: `${msg}${detail ? `\n\nDetail: ${detail}` : ''}`,
      userId: owner.userId,
      tenantId: tid,
      tag: 'daily-plan-fail',
    }, ctx);
    throw err;
  }
}
