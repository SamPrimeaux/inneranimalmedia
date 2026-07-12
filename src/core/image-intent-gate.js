/**
 * Image-generation intent gate.
 * Fast path: D1 keyword match (zero model cost).
 * Miss + escalate cues: cheap intent_classification model (yes/no).
 * Every decision is logged to agentsam_intent_decisions (never silent).
 */

import { stripUserTextForIntent } from './active-file-envelope.js';
import { isCodeImplementationIntent } from './code-implementation-intent.js';
import { loadIntentKeywords } from './intent-keywords.js';
import { resolveModelApiKey } from '../integrations/tokens.js';
import { resolveModelForTask } from './resolveModel.js';

const COMBINED_WORK_RE =
  /\b(fix|debug|refactor|implement|deploy|migrate|sql|d1_query|terminal|wrangler|github|pull request|test suite|unit test|eslint|typescript error|bug in)\b/i;

const PLANNING_RE =
  /\b(make|create|write|build|draft)\s+(a\s+)?plan\b|\bplan\s+(for|to)\b|\b(roadmap|strategy|breakdown)\b.*\b(campaign|branding|workflow|multi[- ]?step)\b/i;

/**
 * Pasted ticket playbooks / engineering dumps mention "image" + "generate" many times
 * but are not creative image asks — must not take the Gemini fast path.
 * @param {string} m
 */
export function isEngineeringTicketOrPlaybookDump(m) {
  const text = String(m || '');
  if (!text.trim()) return false;
  const tktHits = (text.match(/\btkt_[a-z0-9_]+\b/gi) || []).length;
  if (tktHits >= 3) return true;
  if (/\bopen tickets playbook\b/i.test(text)) return true;
  if (
    tktHits >= 1 &&
    /\b(what it is|recommended steps|deliverable)\b/i.test(text) &&
    /\b(pass|fail)\b/i.test(text)
  ) {
    return true;
  }
  // Long paste with ticket/status board language
  if (
    text.length >= 2500 &&
    tktHits >= 1 &&
    /\b(in_review|blocked_by|status_reason|agentsam_tickets)\b/i.test(text)
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string} message
 */
export function isExplicitImagePlanningIntent(message) {
  const m = String(message || '').trim();
  if (!m) return false;
  if (PLANNING_RE.test(m)) return true;
  if (/\bmulti[- ]?step\b.*\b(image|generation|workflow|creative|visual)\b/i.test(m)) return true;
  if (/\b(image\s+generation\s+)?workflow\b/i.test(m) && /\b(plan|design|create|build|draft)\b/i.test(m)) {
    return true;
  }
  if (/\b(create|write|draft|make)\s+(prompts?|a\s+set\s+of\s+prompts?)\s+for\b/i.test(m)) return true;
  return false;
}

/**
 * @param {string} m
 * @param {{ nounRe: RegExp, verbRe: RegExp }} kw
 */
function matchesKeywordPrimary(m, kw) {
  if (/^(what|how|why|when|where|explain|describe|define)\b/i.test(m) && !kw.verbRe.test(m)) {
    return false;
  }
  if (/\b(edit|modify|change|upscale|remove\s+background|inpaint|outpaint)\b/i.test(m) && kw.nounRe.test(m)) {
    return true;
  }
  if (/\b(hero\s+image|dashboard\s+hero|landing\s+page\s+hero|hero\s+banner|hero\s+section)\b/i.test(m)) {
    return true;
  }
  if (/\bmake\s+me\s+(a\s+)?/i.test(m) && kw.nounRe.test(m)) return true;
  if (
    /\b(an?\s+)?(image|photo|photograph|illustration|artwork|render|graphic|poster|wallpaper|banner|thumbnail)\s+(of|for|showing)\b/i.test(
      m,
    )
  ) {
    return true;
  }
  if (kw.verbRe.test(m) && kw.nounRe.test(m)) return true;
  if (/\b(sci[- ]?fi|cyberpunk|futuristic|cinematic|neon)\b/i.test(m) && kw.nounRe.test(m)) {
    return true;
  }
  if (kw.nounRe.test(m) && m.split(/\s+/).length >= 3 && /\b(poster|wallpaper|banner|thumbnail|illustration|favicon|app icon)\b/i.test(m)) {
    return true;
  }
  if (/\b(imgx_|dall[- ]?e|imagen|gpt-image|image gen)\b/i.test(m)) return true;
  if (/\b(visual asset|marketing asset|brand asset|social preview)\b/i.test(m)) return true;
  return false;
}

/**
 * @param {string} m
 * @param {{ verbRe: RegExp, escalateRe: RegExp|null }} kw
 */
function shouldEscalateToClassifier(m, kw) {
  const words = m.split(/\s+/).filter(Boolean).length;
  if (words < 4) return false;
  if (kw.verbRe.test(m)) return true;
  if (kw.escalateRe && kw.escalateRe.test(m)) return true;
  // Descriptive "of a …" creatives without listed noun (the photo/mug class of bugs)
  if (/\b(of|showing|featuring)\s+(a|an|the)\b/i.test(m) && words >= 6) return true;
  if (/\b(clean|cinematic|product|brand|mockup|lifestyle)\b/i.test(m) && words >= 6) return true;
  return false;
}

/**
 * @param {unknown} env
 * @param {object} row
 */
async function logIntentDecision(env, row) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_intent_decisions (
         id, tenant_id, workspace_id, user_id, conversation_id, task_type,
         message_excerpt, matched_by, is_match, confidence, model_key, provider,
         routing_arm_id, reason, latency_ms, metadata_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        row.id || `idc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
        row.tenant_id ?? null,
        row.workspace_id ?? null,
        row.user_id ?? null,
        row.conversation_id ?? null,
        row.task_type || 'image_generation',
        row.message_excerpt != null ? String(row.message_excerpt).slice(0, 280) : null,
        row.matched_by,
        row.is_match ? 1 : 0,
        row.confidence ?? null,
        row.model_key ?? null,
        row.provider ?? null,
        row.routing_arm_id ?? null,
        row.reason != null ? String(row.reason).slice(0, 500) : null,
        row.latency_ms ?? null,
        JSON.stringify(row.metadata || {}).slice(0, 2000),
        Math.floor(Date.now() / 1000),
      )
      .run();
  } catch (e) {
    console.warn('[intent-gate] log failed', e?.message ?? e);
  }
}

function extractJsonObject(text) {
  const clean = String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(clean.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Cheap yes/no image-generation classifier via Thompson intent_classification arm.
 * @param {unknown} env
 * @param {string} message
 * @param {{ userId?: string|null, workspaceId?: string|null, tenantId?: string|null }} ctx
 */
async function classifyImageIntentWithModel(env, message, ctx) {
  const t0 = Date.now();
  let modelKey = null;
  let provider = null;
  let armId = null;

  try {
    const resolved = await resolveModelForTask(env, {
      task_type: 'intent_classification',
      workspace_id: ctx.workspaceId || null,
      tenant_id: ctx.tenantId || null,
      mode: 'auto',
    });
    modelKey = resolved?.model_key || resolved?.modelKey || null;
    provider = resolved?.provider || null;
    armId = resolved?.routing_arm_id || resolved?.arm_id || null;
  } catch (e) {
    console.warn('[intent-gate] resolveModel', e?.message ?? e);
  }

  const prompt =
    'Answer ONLY with JSON: {"is_image_generation":true|false,"confidence":0-1,"reason":"short"}.\n' +
    'True only if the user wants you to GENERATE/CREATE a still image, photo, illustration, logo, mockup, or similar visual asset NOW.\n' +
    'False for chat, coding, planning, video, or questions ABOUT images.\n\n' +
    `User: ${String(message || '').slice(0, 1500)}`;

  let text = '';
  try {
    if (provider === 'workers_ai' && env?.AI && modelKey) {
      const out = await env.AI.run(modelKey, {
        messages: [
          { role: 'system', content: 'You classify image-generation intent. JSON only.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 80,
        temperature: 0,
      });
      text =
        typeof out === 'string'
          ? out
          : out?.response || out?.result?.response || JSON.stringify(out?.result || out || '');
    } else {
      // Prefer Gemini flash-lite for non-WAI arms (cheap + JSON)
      const geminiModel = 'gemini-3.1-flash-lite';
      const apiKey =
        (env?.GEMINI_API_KEY && String(env.GEMINI_API_KEY).trim()) ||
        (env?.GOOGLE_AI_API_KEY && String(env.GOOGLE_AI_API_KEY).trim()) ||
        (await resolveModelApiKey(env, 'google', geminiModel, ctx.userId));
      if (!apiKey) {
        return {
          isMatch: false,
          confidence: 0,
          reason: 'classifier_no_api_key',
          modelKey,
          provider,
          armId,
          latencyMs: Date.now() - t0,
        };
      }
      modelKey = modelKey || geminiModel;
      provider = provider || 'google';
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}` +
        `:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 80 },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return {
          isMatch: false,
          confidence: 0,
          reason: `classifier_http_${res.status}`,
          modelKey,
          provider,
          armId,
          latencyMs: Date.now() - t0,
        };
      }
      for (const c of data?.candidates || []) {
        for (const p of c?.content?.parts || []) {
          if (typeof p?.text === 'string') text += p.text;
        }
      }
    }
  } catch (e) {
    return {
      isMatch: false,
      confidence: 0,
      reason: `classifier_error:${e?.message || e}`,
      modelKey,
      provider,
      armId,
      latencyMs: Date.now() - t0,
    };
  }

  const parsed = extractJsonObject(text);
  const isMatch = parsed?.is_image_generation === true || parsed?.is_image_generation === 'true';
  return {
    isMatch,
    confidence: Number(parsed?.confidence),
    reason: parsed?.reason != null ? String(parsed.reason).slice(0, 200) : 'classifier',
    modelKey,
    provider,
    armId,
    latencyMs: Date.now() - t0,
  };
}

/**
 * Sync keyword-only check (bootstrap/cache). Prefer {@link resolvePrimaryImageGenerationIntent} on hot paths.
 * @param {string} message
 * @param {{ nounRe?: RegExp, verbRe?: RegExp }|null} [kw]
 */
export function isPrimaryImageGenerationIntentSync(message, kw = null) {
  const m = stripUserTextForIntent(message).trim();
  if (!m || isExplicitImagePlanningIntent(m)) return false;
  if (isEngineeringTicketOrPlaybookDump(m)) return false;
  const nounsVerbs = kw || {
    nounRe:
      /\b(images?|photos?|photographs?|product\s+photos?|heroes?|hero\s+images?|posters?|wallpapers?|illustrations?|artworks?|graphics?|thumbnails?|banners?|logos?|renders?|concept\s+arts?|covers?|visuals?|backgrounds?|icons?|avatars?|pictures?|art|mockups?|favicons?|og\s+images?|social\s+cards?|app\s+icons?|splash\s+screens?|ui\s+assets?)\b/i,
    verbRe:
      /\b(generate|create|make|design|render|draw|paint|produce|craft|build|illustrate|visualize)\b/i,
  };
  if (matchesKeywordPrimary(m, nounsVerbs)) return true;
  if (isCodeImplementationIntent(m)) return false;
  if (COMBINED_WORK_RE.test(m) && m.split(/\s+/).filter(Boolean).length > 14) return false;
  return false;
}

/**
 * Evaluate image fast-path without logging — spine logs once via turn-decision.
 * @param {unknown} env
 * @param {string} message stripped intent text
 * @param {{ tenantId?: string|null, workspaceId?: string|null, userId?: string|null }} [ctx]
 */
export async function evaluatePrimaryImageGenerationIntent(env, message, ctx = {}) {
  const m = String(message || '').trim();

  if (!m) {
    return { isMatch: false, matchedBy: 'neither', reason: 'empty' };
  }

  if (isExplicitImagePlanningIntent(m)) {
    return { isMatch: false, matchedBy: 'rejected_guard', reason: 'explicit_planning' };
  }

  if (isEngineeringTicketOrPlaybookDump(m)) {
    return { isMatch: false, matchedBy: 'rejected_guard', reason: 'engineering_ticket_dump' };
  }

  const kw = await loadIntentKeywords(env, 'image_generation');
  if (matchesKeywordPrimary(m, kw)) {
    return {
      isMatch: true,
      matchedBy: 'keyword',
      reason: `keyword_source=${kw.source}`,
      metadata: { keyword_source: kw.source },
    };
  }

  if (isCodeImplementationIntent(m)) {
    return { isMatch: false, matchedBy: 'rejected_guard', reason: 'code_implementation' };
  }
  if (COMBINED_WORK_RE.test(m) && m.split(/\s+/).filter(Boolean).length > 14) {
    return { isMatch: false, matchedBy: 'rejected_guard', reason: 'combined_work' };
  }

  if (!shouldEscalateToClassifier(m, kw)) {
    return {
      isMatch: false,
      matchedBy: 'neither',
      reason: 'no_keyword_no_escalate_cue',
      metadata: { keyword_source: kw.source },
    };
  }

  const classified = await classifyImageIntentWithModel(env, m, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    tenantId: ctx.tenantId,
  });
  return {
    isMatch: !!classified.isMatch,
    matchedBy: 'classifier',
    reason: classified.reason,
    confidence: classified.confidence,
    modelKey: classified.modelKey,
    provider: classified.provider,
    armId: classified.armId,
    latencyMs: classified.latencyMs,
    metadata: { keyword_source: kw.source },
  };
}

/**
 * Image fast-path slice — use precomputedTurnDecision from spine when present.
 */
export async function resolvePrimaryImageGenerationIntent(env, message, ctx = {}) {
  if (ctx.precomputedTurnDecision) {
    const td = ctx.precomputedTurnDecision;
    return {
      isMatch: td.imageFastPath === true,
      matchedBy: td.imageIntent?.matchedBy || 'neither',
      decisionId: td.decisionId,
    };
  }
  const { resolveTurnDecision } = await import('./turn-decision.js');
  const td = await resolveTurnDecision(env, message, ctx, {});
  return {
    isMatch: td.imageFastPath === true,
    matchedBy: td.imageIntent?.matchedBy || 'neither',
    decisionId: td.decisionId,
  };
}

/**
 * Broader image signal (tool injection) — keyword + escalate-hint aware, sync-safe with bootstrap.
 * @param {string} message
 * @param {{ nounRe: RegExp, verbRe: RegExp, escalateRe: RegExp|null }|null} [kw]
 */
export function hasImageGenerationIntentSync(message, kw = null) {
  const m = stripUserTextForIntent(message).trim();
  if (!m || isExplicitImagePlanningIntent(m) || isEngineeringTicketOrPlaybookDump(m)) return false;
  if (isPrimaryImageGenerationIntentSync(m, kw)) return true;
  if (
    /\b(also|and then|plus|as well|while you'?re at it|when done)\b[\s\S]{0,48}\b(generate|create|make|design|render|draw)\b/i.test(
      m,
    )
  ) {
    return true;
  }
  return false;
}
