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

    const prompt = `You are Agent Sam producing Sam Primeaux's daily operational brief for ${today}.

Sam is the solo founder of Inner Animal Media — building Agent Sam on Cloudflare Workers + D1 + R2 + Vectorize. Time is his scarcest resource.

PATTERN RECOGNITION RULES (apply before writing):
- plan task / todo status='carried' for 3+ days → CHRONIC BLOCKER
- daily AI cost > 120% of 7-day average → COST SPIKE
- error volume up >15% vs prior day → QUALITY REGRESSION
- deploy count 0 for 2+ consecutive days → VELOCITY STALL
- founder_metrics.burnout_risk in ('high','critical') → lead with wellness alert
- client_revenue payment_status → 'overdue' → flag immediately

== PLATFORM CONTEXT ==
${JSON.stringify(ctxData.platformCtx || {})}

== MEMORY (decision/skill/state) ==
${JSON.stringify(ctxData.memoryRows?.results || [])}

== CLIENT PROJECTS (blockers) ==
${JSON.stringify(ctxData.clientCtxRows?.results || [])}

== FINANCIAL — usage rollups (deduped) ==
Today: ${JSON.stringify(ctxData.usageToday || {})}
7d window: ${JSON.stringify(ctxData.usage7d || {})}
Billing month: ${JSON.stringify(ctxData.billingMonth?.results || [])}
Client revenue: ${JSON.stringify(ctxData.clientRevenue?.results || [])}
Finance monthly: ${JSON.stringify(ctxData.financeMonthly?.results || [])}
Agent run 24h: ${JSON.stringify(ctxData.recentRuns || {})}

== VELOCITY ==
task_velocity (7d): ${JSON.stringify(ctxData.velocityRecent?.results || [])}
Deploys 24h/7d: ${JSON.stringify(ctxData.deploys24h || {})} / ${JSON.stringify(ctxData.deploys7d || {})}
Plan tasks by status: ${JSON.stringify(ctxData.planTasks?.results || [])}
Chronic blockers: ${JSON.stringify(ctxData.chronicBlockers?.results || [])}
Tracked minutes today: ${JSON.stringify(ctxData.trackedTimeToday || {})}
Task activity 24h: ${JSON.stringify(ctxData.taskActivityRecent?.results || [])}
Migrations: ${JSON.stringify(ctxData.migrations?.results || [])}
Git: ${ctxData.gitLog || '(n/a)'}

== QUALITY ==
ETO 24h: ${JSON.stringify(ctxData.eto24h || {})}
Errors 24h: ${JSON.stringify(ctxData.errors24h?.results || [])}
Guardrails blocked: ${JSON.stringify(ctxData.guardrails24h?.results || [])}
Model health (non-green): ${JSON.stringify(ctxData.modelHealth?.results || [])}
Analytics 7d: ${JSON.stringify(ctxData.analytics7d?.results || [])}
Flaky tools: ${JSON.stringify(ctxData.toolStatsFlaky?.results || [])}
Exec perf 24h: ${JSON.stringify(ctxData.execPerf24h?.results || [])}
Health daily: ${JSON.stringify(ctxData.healthDaily?.results || [])}
Compaction 24h: ${JSON.stringify(ctxData.compaction24h || {})}

== CLIENT ==
Open todos by project: ${JSON.stringify(ctxData.openTodosByProject?.results || [])}
Calendar today+tomorrow: ${JSON.stringify(ctxData.calendarUpcoming?.results || [])}
Stripe webhooks 48h: ${JSON.stringify(ctxData.stripeWebhooks?.results || [])}

== SELF / OPS ==
Founder metrics: ${JSON.stringify(ctxData.founderToday || {})}
Cron health: ${JSON.stringify(ctxData.cronHealth?.results || [])}
MCP tools 24h: ${JSON.stringify(ctxData.mcpActivity?.results || [])}
Spawn jobs: ${JSON.stringify(ctxData.spawnJobs?.results || [])}
Email logs 24h: ${JSON.stringify(ctxData.emailLogs24h?.results || [])}
Pending notifications: ${JSON.stringify(ctxData.pendingNotifications?.results || [])}

== GMAIL TRIAGE ==
Accounts: ${JSON.stringify(ctxData.gmailSnapshot?.accounts || [])}
Triage: ${JSON.stringify(inboxTriage)}

OUTPUT SECTIONS (in order, plain text):

1. ALERTS — blockers, spikes, regressions (write "None." if clean)
2. TODAY'S FINANCIAL SNAPSHOT — AI spend vs 7d avg, month cumulative if inferable
3. VELOCITY — shipped yesterday, in-flight, chronic blockers, deploy cadence
4. CLIENT STATUS — one line per active client with open task count
5. INBOX PRIORITY — from triage; names and subjects
6. TOMORROW'S PLAN — 3–5 specific tasks from blockers + inbox
7. MONTHLY ARC — week-over-week narrative; if day-of-month > 15, add month-end trajectory

Rules: Under 550 words. No fluff. No emojis. Blunt. ALERTS empty on good days.`;

    const emailBody = await generateWithGemini(env, {
      modelKey: 'gemini-3.5-flash',
      stage: 'daily_synthesis',
      systemInstruction:
        'You are Agent Sam. Write a concise daily briefing. Plain text only. Under 450 words. No emojis. Blunt and specific.',
      userText: prompt,
      maxOutputTokens: 1400,
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
