/**
 * Daily memory pipeline — Gmail Flash triage → Pro synthesis → AUTORAG + D1 + memory lane → Resend.
 * Evening and morning share this core; morning merges ## Morning into the same YYYY-MM-DD.md file.
 */

import { insertEmailLog } from '../../core/email-log.js';
import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';
import { resolveCronTenantId } from '../cron-tenant.js';
import { snapshotGmailInboxForUser } from '../../core/gmail-inbox-snapshot.js';
import { chunkMarkdown } from '../chunk-markdown.js';
import { writeMemoryLane } from '../../core/rag-lanes.js';
import { scheduleMirrorAgentsamPlanEmbeddingToSupabase } from '../../core/agentsam-plan-supabase-public-sync.js';
import {
  alertDailyPlan,
  DailyPlanError,
  gatherMorningPlanContext,
  generateWithGemini,
  listDailyMemoryRecipients,
  resolveDailyPlanNotifyUser,
} from './daily-plan-support.js';

const WORKSPACE_ID = 'ws_inneranimalmedia';
const FLASH_MODEL = 'gemini-3.5-flash';
const PRO_MODEL = 'gemini-3.1-pro-preview';
const TRIAGE_CONCURRENCY = 8;
const MEMORY_R2_PREFIX = 'memory/';
const AUTORAG_PUBLIC = 'https://autorag.inneranimalmedia.com';

/** @returns {string} YYYY-MM-DD in America/Chicago */
export function chicagoDateIso(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

const GMAIL_MAX_PER_ACCOUNT = 100;

/** @param {string} dateIso @param {string|null|undefined} [userId] */
export function memoryR2Key(dateIso, userId = null) {
  const uid = userId ? String(userId).trim() : '';
  if (uid) return `${MEMORY_R2_PREFIX}users/${uid}/${dateIso}.md`;
  return `${MEMORY_R2_PREFIX}${dateIso}.md`;
}

/** @param {string|null|undefined} userId */
function userIdSuffix(userId) {
  if (!userId) return '';
  return `_${String(userId).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)}`;
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseJsonGemini(raw) {
  const cleaned = String(raw || '').replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Merge evening/morning into one daily file — never drop ## Evening when morning runs.
 * @param {string} dateIso
 * @param {string|null|undefined} existingRaw
 * @param {'evening'|'morning'} pass
 * @param {string} sectionBody
 */
export function mergeDailyMemoryMd(dateIso, existingRaw, pass, sectionBody) {
  const title = `# Daily Memory — ${dateIso}`;
  let body = String(existingRaw || '').trim();
  if (body.startsWith('# Daily Memory')) {
    body = body.replace(/^# Daily Memory[^\n]*\n+/, '').trim();
  }

  const extract = (header) => {
    const re = new RegExp(`^## ${header}\\s*$`, 'm');
    const match = re.exec(body);
    if (!match) return '';
    const start = match.index + match[0].length;
    const rest = body.slice(start);
    const next = rest.search(/^## /m);
    return (next >= 0 ? rest.slice(0, next) : rest).trim();
  };

  let evening = extract('Evening');
  let morning = extract('Morning');

  if (pass === 'evening') evening = String(sectionBody || '').trim();
  else morning = String(sectionBody || '').trim();

  const parts = [title, ''];
  if (evening) parts.push('## Evening', '', evening, '');
  if (morning) parts.push('## Morning', '', morning, '');
  return `${parts.join('\n').trim()}\n`;
}

/** @param {*} env @param {string} key */
async function readAutoragText(env, key) {
  const bucket = env?.AUTORAG_BUCKET;
  if (!bucket?.get) return '';
  try {
    const obj = await bucket.get(key);
    return obj ? await obj.text() : '';
  } catch {
    return '';
  }
}

/** @param {*} env @param {string} key @param {string} text */
async function putAutoragText(env, key, text) {
  const bucket = env?.AUTORAG_BUCKET;
  if (!bucket?.put) {
    throw new DailyPlanError('AUTORAG_BUCKET binding not configured', { stage: 'r2_put', model: '' });
  }
  await bucket.put(key, text, { httpMetadata: { contentType: 'text/markdown; charset=utf-8' } });
}

/** @param {*} env @param {object} email */
async function triageOneEmail(env, email) {
  const raw = await generateWithGemini(env, {
    modelKey: FLASH_MODEL,
    stage: 'email_triage',
    systemInstruction:
      'Triage one email for a solo founder. Return JSON only: {"label":"primary|updates|action|fyi","summary":"one line","needs_action":true,"urgency":"critical|high|normal|low|fyi","project_tag":"client or internal tag","suggested_action":"reply|schedule|archive|ignore","reason":"brief"}. No emojis.',
    userText: JSON.stringify({
      id: email.id,
      account: email.account,
      from: email.from_address,
      subject: email.subject,
      date: email.date_received,
      snippet: email.snippet,
      starred: email.is_starred,
    }),
    maxOutputTokens: 320,
    temperature: 0.1,
    json: true,
  });
  const triage = parseJsonGemini(raw);
  return { ...email, triage };
}

/** @param {*} env @param {object[]} emails */
export async function triageEmailsParallel(env, emails, concurrency = TRIAGE_CONCURRENCY) {
  if (!Array.isArray(emails) || !emails.length) {
    return { items: [], failed: 0, summary: 'No inbox messages in window.' };
  }
  const items = [];
  let failed = 0;
  for (let i = 0; i < emails.length; i += concurrency) {
    const batch = emails.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map((e) => triageOneEmail(env, e)));
    for (let j = 0; j < settled.length; j++) {
      const s = settled[j];
      if (s.status === 'fulfilled') items.push(s.value);
      else {
        failed += 1;
        items.push({ ...batch[j], triage_error: String(s.reason?.message || s.reason) });
      }
    }
  }
  const critical = items.filter((x) => x.triage?.urgency === 'critical' || x.triage?.urgency === 'high').length;
  return {
    items,
    failed,
    summary: `${items.length} emails triaged (${critical} high/critical, ${failed} flash errors).`,
  };
}

function platformContextJson(ctxData) {
  return JSON.stringify({
    platform: ctxData.platformCtx || {},
    memory: ctxData.memoryRows?.results || [],
    clients: ctxData.clientCtxRows?.results || [],
    usageToday: ctxData.usageToday || {},
    usage7d: ctxData.usage7d || {},
    deploys24h: ctxData.deploys24h || {},
    deploys7d: ctxData.deploys7d || {},
    cronHealth: ctxData.cronHealth?.results || [],
    errors24h: ctxData.errors24h?.results || [],
    openTodosByProject: ctxData.openTodosByProject?.results || [],
    chronicBlockers: ctxData.chronicBlockers?.results || [],
    calendarUpcoming: ctxData.calendarUpcoming?.results || [],
    clientRevenue: ctxData.clientRevenue?.results || [],
    founderToday: ctxData.founderToday || {},
    trackedTimeToday: ctxData.trackedTimeToday || {},
    mcpActivity: ctxData.mcpActivity?.results || [],
    gitLog: ctxData.gitLog || '',
  });
}

/** @param {*} env @param {{ triageBatch: object, ctxData: object, dateIso: string, dateDisplay: string }} p */
async function synthesizeEveningMd(env, { triageBatch, ctxData, dateIso, dateDisplay }) {
  const userText = `Date: ${dateDisplay} (${dateIso})

Write the ## Evening section body ONLY (no ## Evening header). Use ### subsections exactly:
### Email Summary
### Cross-Thread Patterns
### Priority Stack
### Client Status
### Platform Health
### Action Items
### Don't Miss
### Carry Forward

TRIAGE BATCH:
${JSON.stringify(triageBatch)}

PLATFORM CONTEXT:
${platformContextJson(ctxData)}

Rules: Professional narrative markdown. Cross-thread dedupe (same client/topic = one action). Rank by true priority. Platform health from D1 context. Do not resurrect resolved/closed memory items as active blockers. Only list blockers with verified source (triage JSON or D1 context) — if triage failed, say so instead of inferring. 1-5 minute read. No emojis. No JSON.`;

  return generateWithGemini(env, {
    modelKey: PRO_MODEL,
    stage: 'evening_synthesis',
    systemInstruction:
      'You are Agent Sam daily memory synthesizer for Sam Primeaux (Inner Animal Media). Output markdown subsection content only — no preamble, no outer ## Evening header.',
    userText,
    maxOutputTokens: 4096,
    temperature: 0.25,
  });
}

/** @param {*} env @param {{ triageBatch: object, ctxData: object, priorMd: string, yesterdayMd: string, dateIso: string, dateDisplay: string }} p */
async function synthesizeMorningMd(env, { triageBatch, ctxData, priorMd, yesterdayMd, dateIso, dateDisplay }) {
  const userText = `Date: ${dateDisplay} (${dateIso})

Write the ## Morning section body ONLY (no ## Morning header). Use ### subsections in order:
### ALERTS
### FINANCIAL
### VELOCITY
### CLIENT
### INBOX PRIORITY
### TODAY'S PLAN

LAST NIGHT MEMORY (continuity):
${(priorMd || yesterdayMd || '(none)').slice(0, 12000)}

OVERNIGHT INBOX TRIAGE:
${JSON.stringify(triageBatch)}

PLATFORM DELTA:
${platformContextJson(ctxData)}

Rules: Shorter than evening — 1-3 minute read. Action-first. ALERTS = "None." if clean. Do not carry forward blockers that are resolved in D1 memory. If triage failed, lead ALERTS with triage degradation — do not invent regressions. No emojis. Markdown only.`;

  return generateWithGemini(env, {
    modelKey: PRO_MODEL,
    stage: 'morning_synthesis',
    systemInstruction:
      'You are Agent Sam morning focus synthesizer. Output markdown subsection content only — no preamble, no outer ## Morning header.',
    userText,
    maxOutputTokens: 2800,
    temperature: 0.2,
  });
}

/** @param {string} md */
function markdownToEmailHtml(md) {
  const lines = String(md || '').split('\n');
  let html = '';
  for (const line of lines) {
    if (/^### /.test(line)) {
      html += `<h3 style="margin:22px 0 8px;font-size:15px;color:#1558b8;">${escHtml(line.slice(4))}</h3>`;
    } else if (/^## /.test(line)) {
      html += `<h2 style="margin:28px 0 10px;font-size:17px;color:#1a1c1e;border-bottom:1px solid #cdd3dc;padding-bottom:6px;">${escHtml(line.slice(3))}</h2>`;
    } else if (/^# /.test(line)) {
      html += `<h1 style="margin:0 0 16px;font-size:22px;color:#1a1c1e;">${escHtml(line.slice(2))}</h1>`;
    } else if (/^[-*] /.test(line)) {
      html += `<p style="margin:4px 0 4px 12px;font-size:14px;line-height:1.55;color:#2d3135;">• ${escHtml(line.slice(2))}</p>`;
    } else if (line.trim() === '') {
      html += '<div style="height:8px"></div>';
    } else {
      html += `<p style="margin:6px 0;font-size:14px;line-height:1.6;color:#2d3135;">${escHtml(line)}</p>`;
    }
  }
  return html;
}

/** @param {{ variant: 'evening'|'morning', title: string, subtitle: string, md: string }} p */
function brandedEmailHtml({ variant, title, subtitle, md }) {
  const accent = variant === 'evening' ? '#1558b8' : '#0d47a1';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#eef2f7;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:32px 16px;">
  <div style="background:#fff;border:1px solid #cdd3dc;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(26,28,30,0.08);">
    <div style="padding:28px 32px 20px;border-bottom:3px solid ${accent};background:linear-gradient(180deg,#f8fafc,#fff);">
      <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${accent};">Inner Animal Media</div>
      <h1 style="margin:8px 0 4px;font-size:24px;font-weight:600;color:#1a1c1e;">${escHtml(title)}</h1>
      <div style="font-size:13px;color:#5f6368;">${escHtml(subtitle)}</div>
    </div>
    <div style="padding:28px 32px 36px;">${markdownToEmailHtml(md)}</div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e4e9f1;font-size:12px;color:#5f6368;text-align:center;">
      inneranimalmedia.com · Agent Sam · ${variant === 'evening' ? 'Memory Close' : 'Focus Open'}
    </div>
  </div>
</div></body></html>`;
}

/**
 * @param {*} env
 * @param {{ mode: 'evening'|'morning', md: string, dateIso: string, tenantId: string, userId?: string|null, r2Key: string, triageBatch: object, models: object, emailSkipped?: boolean }} p
 */
async function persistMemoryArtifacts(env, p) {
  const { mode, md, dateIso, tenantId, userId, r2Key, triageBatch, models } = p;
  const ws = WORKSPACE_ID;
  const uidSuffix = userIdSuffix(userId);
  const planId = `plan_daily${uidSuffix}_${dateIso.replace(/-/g, '')}`;
  const r2Url = `${AUTORAG_PUBLIC}/${r2Key}`;
  const errors = [];
  const isPlatformMemory = !userId || !String(r2Key).includes('/users/');

  await putAutoragText(env, r2Key, md);

  if (isPlatformMemory) {
    try {
      const snap = await env.DB.prepare(
        'SELECT snapshot_date FROM daily_snapshots WHERE snapshot_date = ? LIMIT 1',
      ).bind(dateIso).first();
      if (snap?.snapshot_date) {
        await env.DB.prepare(
          'UPDATE daily_snapshots SET digest_text = ?, updated_at = unixepoch() WHERE snapshot_date = ?',
        ).bind(md, dateIso).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO daily_snapshots (
            snapshot_date, deploy_count, tokens_in, tokens_out, cost_usd, active_workflows, digest_text, created_at, updated_at
          ) VALUES (?, 0, 0, 0, 0, 0, ?, unixepoch(), unixepoch())`,
        ).bind(dateIso, md).run();
      }
    } catch (e) {
      errors.push(`daily_snapshots:${e?.message}`);
    }
  }

  const eveningBody = md.match(/## Evening\s*\n+([\s\S]*?)(?=^## Morning|\Z)/m)?.[1]?.trim() || '';
  const morningBody = md.match(/## Morning\s*\n+([\s\S]*)/m)?.[1]?.trim() || '';

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_plans (
        id, tenant_id, workspace_id, plan_date, plan_type, title, status,
        morning_brief, eod_summary, plan_md_url, r2_prefix, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'daily', ?, 'active', ?, ?, ?, ?, unixepoch(), unixepoch())
      ON CONFLICT(id) DO UPDATE SET
        morning_brief = COALESCE(excluded.morning_brief, agentsam_plans.morning_brief),
        eod_summary = COALESCE(excluded.eod_summary, agentsam_plans.eod_summary),
        plan_md_url = excluded.plan_md_url,
        r2_prefix = excluded.r2_prefix,
        updated_at = unixepoch()`,
    ).bind(
      planId,
      tenantId,
      ws,
      dateIso,
      `Daily Memory ${dateIso}`,
      mode === 'morning' ? morningBody.slice(0, 8000) : null,
      mode === 'evening' ? eveningBody.slice(0, 8000) : null,
      r2Url,
      MEMORY_R2_PREFIX,
    ).run();
  } catch (e) {
    errors.push(`agentsam_plans:${e?.message}`);
  }

  try {
    const memId = `mem_daily${uidSuffix}_${dateIso.replace(/-/g, '')}`;
    await env.DB.prepare(
      `INSERT OR REPLACE INTO agentsam_memory (
        id, tenant_id, user_id, workspace_id, memory_type, key, value, importance, is_pinned, decay_score, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'state', ?, ?, 8, 1, 1.0, 'daily_memory_pipeline', unixepoch(), unixepoch())`,
    ).bind(
      memId,
      tenantId,
      userId || null,
      ws,
      userId ? `daily_memory_${userId}_${dateIso}` : `daily_memory_${dateIso}`,
      md.slice(0, 4000),
    ).run();
  } catch (e) {
    errors.push(`agentsam_memory:${e?.message}`);
  }

  const compactionId = `cmp_daily${uidSuffix}_${mode}_${dateIso.replace(/-/g, '')}_${Date.now()}`;
  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_compaction_events (
        id, tenant_id, workspace_id, user_id, compaction_type, compaction_scope, compaction_strategy,
        source_kind, source_table, source_row_count, summary_text, summary_json, metrics_json,
        provider, model_key, status, source_url, compacted_at_epoch, created_at_epoch, updated_at_epoch
      ) VALUES (?, ?, ?, ?, 'data_summary', 'workspace', 'summarize', 'cron', 'gmail_inbox',
        ?, ?, ?, ?, 'google', ?, 'completed', ?, unixepoch(), unixepoch(), unixepoch())`,
    ).bind(
      compactionId,
      tenantId,
      ws,
      userId || null,
      triageBatch?.items?.length || 0,
      `${mode} memory ${dateIso}`,
      JSON.stringify({ triage: triageBatch, models }),
      JSON.stringify({ mode, dateIso, r2Key, emailSkipped: !!p.emailSkipped }),
      mode === 'evening' ? `${FLASH_MODEL}+${PRO_MODEL}` : `${FLASH_MODEL}+${PRO_MODEL}`,
      r2Url,
    ).run();
  } catch (e) {
    errors.push(`agentsam_compaction_events:${e?.message}`);
  }

  const memoryKeyBase = userId ? `daily_memory/${userId}/${dateIso}` : `daily_memory/${dateIso}`;
  const chunks = chunkMarkdown(md, 900, 100);
  let embedded = 0;
  for (let i = 0; i < chunks.length; i++) {
    try {
      await writeMemoryLane(env, {
        workspace_id: ws,
        user_id: userId || null,
        memory_key: `${memoryKeyBase}#${i}`,
        title: `Daily Memory ${dateIso} (${mode}) #${i}`,
        content: chunks[i],
        source: 'daily_memory_pipeline',
        source_type: 'daily_digest',
        metadata: { date: dateIso, pass: mode, chunk: i, r2_key: r2Key, user_id: userId || null },
      });
      embedded += 1;
    } catch (e) {
      errors.push(`memory_lane_${i}:${e?.message}`);
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO vectorize_indexed_docs (
        id, tenant_id, index_id, source_table, source_r2_key, chunk_index, content_preview, indexed_at, is_current
      ) VALUES (?, ?, 'agentsam-memory-oai3large-1536', 'daily_memory_pipeline', ?, ?, ?, datetime('now'), 1)
      ON CONFLICT(id) DO UPDATE SET
        source_r2_key = excluded.source_r2_key,
        chunk_index = excluded.chunk_index,
        content_preview = excluded.content_preview,
        indexed_at = excluded.indexed_at,
        is_current = 1`,
    ).bind(
      `vid_daily${uidSuffix}_${dateIso.replace(/-/g, '')}`,
      tenantId,
      r2Key,
      embedded,
      md.slice(0, 240),
    ).run();
  } catch {
    /* optional registry */
  }

  scheduleMirrorAgentsamPlanEmbeddingToSupabase(env, null, {
    planId,
    tenantId,
    workspaceId: ws,
    title: `Daily Memory ${dateIso}`,
    summary: md.slice(0, 3500),
    r2Url,
  });

  return { r2Key, r2Url, planId, embedded, errors };
}

/** @param {*} env @param {{ subject: string, textBody: string, htmlBody: string, toEmail: string, fromEmail: string }} p */
async function sendResendEmail(env, p) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: p.fromEmail,
      to: [p.toEmail],
      subject: p.subject,
      text: p.textBody,
      html: p.htmlBody,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new DailyPlanError(`Resend: ${res.status} ${err}`, { stage: 'resend', model: '' });
  }
  const data = await res.json().catch(() => ({}));
  if (env.DB) {
    await insertEmailLog(env, {
      to: p.toEmail,
      from: p.fromEmail,
      subject: p.subject,
      status: 'sent',
      externalMessageId: data.id ?? null,
      provider: 'resend',
      textContent: p.textBody.slice(0, 50000),
    });
  }
  return data;
}

/**
 * @param {*} env
 * @param {{ mode: 'evening'|'morning', ctx?: ExecutionContext|null, forceEmail?: boolean, recipient?: { userId?: string, email?: string, tenantId?: string|null, hasGmail?: boolean } }} opts
 */
export async function runDailyMemoryPipeline(env, opts) {
  const mode = opts.mode === 'morning' ? 'morning' : 'evening';
  if (!env?.DB || !env?.RESEND_API_KEY) {
    return { ok: false, skipped: true, reason: 'missing_db_or_resend' };
  }
  if (!env.RESEND_FROM?.trim()) {
    return { ok: false, skipped: true, reason: 'missing_resend_from' };
  }

  const fallback = await resolveDailyPlanNotifyUser(env);
  const recipient = opts.recipient || fallback;
  const userId = recipient?.userId ? String(recipient.userId).trim() : '';
  const deliverTo = recipient?.email ? String(recipient.email).trim().toLowerCase() : '';
  if (!userId || !deliverTo.includes('@')) {
    return { ok: false, skipped: true, reason: 'missing_recipient' };
  }

  const owner = { userId, email: deliverTo };
  const tid = recipient?.tenantId || await resolveCronTenantId(env, owner);
  if (!tid) {
    return { ok: false, skipped: true, reason: 'missing_tenant' };
  }

  const cronExpr = mode === 'evening' ? '0 0 * * *' : '30 13 * * *';
  const jobName = mode === 'evening' ? 'evening_memory_email' : 'morning_focus_email';
  const jobNameScoped = `${jobName}:${userId}`;

  const begun = await startCronRun(env, {
    jobName: jobNameScoped,
    cronExpression: cronExpr,
    tenantId: tid,
    workspaceId: WORKSPACE_ID,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();

  const dateIso = chicagoDateIso();
  const dateDisplay = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Chicago',
  });
  const r2Key = memoryR2Key(dateIso, userId);
  const partial = { r2: false, d1: false, embed: false, email: false };

  try {
    const gmailSnapshot = await snapshotGmailInboxForUser(env, {
      email: owner.email,
      userId: owner.userId,
      maxPerAccount: GMAIL_MAX_PER_ACCOUNT,
      searchAnywhere: true,
      hoursBack: mode === 'evening' ? 24 : undefined,
      sinceMidnightChicago: mode === 'morning',
    });

    const triageBatch = await triageEmailsParallel(env, gmailSnapshot.emails || []);
    const ctxData = await gatherMorningPlanContext(env, tid, owner);

    const existingMd = await readAutoragText(env, r2Key);
    const yesterdayIso = chicagoDateIso(new Date(Date.now() - 86400000));
    const yesterdayMd = await readAutoragText(env, memoryR2Key(yesterdayIso, userId));

    const sectionBody = mode === 'evening'
      ? await synthesizeEveningMd(env, { triageBatch, ctxData, dateIso, dateDisplay })
      : await synthesizeMorningMd(env, {
        triageBatch,
        ctxData,
        priorMd: existingMd,
        yesterdayMd,
        dateIso,
        dateDisplay,
      });

    const fullMd = mergeDailyMemoryMd(dateIso, existingMd, mode, sectionBody);
    partial.r2 = true;

    const persist = await persistMemoryArtifacts(env, {
      mode,
      md: fullMd,
      dateIso,
      tenantId: tid,
      userId: owner.userId,
      r2Key,
      triageBatch,
      models: { flash: FLASH_MODEL, pro: PRO_MODEL },
    });
    partial.d1 = true;
    partial.embed = persist.embedded > 0;

    const subject = mode === 'evening'
      ? `IAM Daily Memory — ${dateDisplay}`
      : `Agent Sam — ${dateDisplay}`;

    if (!opts.forceEmail) {
      const dup = await env.DB.prepare(
        `SELECT id FROM email_logs WHERE subject = ? AND lower(to_email) = ? AND status = 'sent'
         AND datetime(created_at) >= datetime('now', '-20 hours') LIMIT 1`,
      ).bind(subject, deliverTo).first().catch(() => null);
      if (dup?.id) {
        if (runId) {
          await completeCronRun(env, runId, startedAt, {
            rowsRead: triageBatch.items?.length || 0,
            rowsWritten: persist.embedded,
            metadata: {
              sent: false,
              skipped_duplicate: true,
              r2Key,
              to_email: deliverTo,
              user_id: userId,
              partial,
            },
          });
        }
        return { ok: true, skipped_email: true, r2Key, md: fullMd, persist, userId, toEmail: deliverTo };
      }
    }

    const htmlBody = brandedEmailHtml({
      variant: mode,
      title: mode === 'evening' ? 'Daily Memory Close' : 'Morning Focus',
      subtitle: dateDisplay,
      md: fullMd,
    });

    await sendResendEmail(env, {
      subject,
      textBody: fullMd,
      htmlBody,
      toEmail: deliverTo,
      fromEmail: env.RESEND_FROM.trim(),
    });
    partial.email = true;

    if (runId) {
      await completeCronRun(env, runId, startedAt, {
        rowsRead: triageBatch.items?.length || 0,
        rowsWritten: persist.embedded + 1,
        metadata: {
          sent: true,
          mode,
          r2Key,
          to_email: deliverTo,
          user_id: userId,
          gmail_query: gmailSnapshot.query || null,
          gmail_accounts: gmailSnapshot.accounts?.length || 0,
          inbox_count: gmailSnapshot.emails?.length || 0,
          embed_chunks: persist.embedded,
          persist_errors: persist.errors,
        },
      });
    }

    await alertDailyPlan(env, {
      ok: true,
      title: mode === 'evening' ? 'Evening memory sent' : 'Morning brief sent',
      body: `${subject} → ${deliverTo} · R2 ${r2Key}`,
      userId: owner.userId,
      tenantId: tid,
      tag: mode === 'evening' ? 'evening-memory-ok' : 'morning-focus-ok',
    }, opts.ctx ?? null);

    return {
      ok: true,
      sent: true,
      mode,
      r2Key,
      md: fullMd,
      persist,
      partial,
      userId,
      toEmail: deliverTo,
      gmail_count: gmailSnapshot.emails?.length || 0,
    };
  } catch (err) {
    if (runId) await failCronRun(env, runId, startedAt, err);
    const stage = err instanceof DailyPlanError ? err.stage : 'daily_memory_pipeline';
    const model = err instanceof DailyPlanError ? err.model : '';
    const msg = String(err?.message || err);
    console.error(`[daily-memory/${mode}] FATAL:`, msg, err?.stack);

    await alertDailyPlan(env, {
      ok: false,
      title: `[FAIL] Daily memory ${mode} — ${stage}${model ? ` (${model})` : ''}`,
      body: `${msg}\n\nPartial: ${JSON.stringify(partial)}`,
      userId: owner.userId,
      tenantId: tid,
      tag: `daily-memory-${mode}-fail`,
    }, opts.ctx ?? null);

    if (partial.r2) {
      return { ok: false, partial: true, error: msg, partialState: partial };
    }
    throw err;
  }
}

/** @param {*} env @param {{ mode: 'evening'|'morning', ctx?: ExecutionContext|null, forceEmail?: boolean }} opts */
export async function runDailyMemoryPipelineAllRecipients(env, opts) {
  const recipients = await listDailyMemoryRecipients(env);
  if (!recipients.length) {
    return { ok: false, skipped: true, reason: 'no_recipients' };
  }

  const results = [];
  for (const recipient of recipients) {
    try {
      const out = await runDailyMemoryPipeline(env, { ...opts, recipient });
      results.push({ userId: recipient.userId, email: recipient.email, ...out });
    } catch (err) {
      results.push({
        userId: recipient.userId,
        email: recipient.email,
        ok: false,
        error: String(err?.message || err),
      });
    }
  }

  const sent = results.filter((r) => r.sent).length;
  return { ok: true, recipients: results.length, sent, results };
}

/** @param {*} env @param {ExecutionContext|null} [ctx] */
export async function sendEveningMemoryEmail(env, ctx = null) {
  return runDailyMemoryPipelineAllRecipients(env, { mode: 'evening', ctx, forceEmail: false });
}

/** @param {*} env @param {ExecutionContext|null} [ctx] @param {{ forceEmail?: boolean }} [opts] */
export async function sendMorningFocusEmail(env, ctx = null, opts = {}) {
  return runDailyMemoryPipelineAllRecipients(env, {
    mode: 'morning',
    ctx,
    forceEmail: !!opts.forceEmail,
  });
}

/** Back-compat midnight cron entry */
export async function sendDailyDigest(env) {
  return sendEveningMemoryEmail(env);
}
