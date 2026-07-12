/**
 * Single routing spine front-door — one decision per turn, one agentsam_intent_decisions row.
 * Consumers (image fast path, compileModeProfile, tools) read this; they do not re-regex the message.
 */
import { stripUserTextForIntent } from './active-file-envelope.js';
import {
  evaluatePrimaryImageGenerationIntent,
  isImageRevisionFollowUpCue,
} from './image-intent-gate.js';
import {
  buildClassifyResult,
  classifyIntentWithModel,
  inferIntentFromKeywords,
  inferIntentHeuristically,
  shouldEscalateChatIntent,
} from '../api/agent/classify-intent.js';

/**
 * Prior image turn in this conversation (spine authority for revision follow-ups).
 * @param {unknown} env
 * @param {string|null|undefined} conversationId
 * @returns {Promise<boolean>}
 */
async function conversationHasRecentImageGeneration(env, conversationId) {
  const cid = conversationId != null ? String(conversationId).trim() : '';
  if (!cid || !env?.DB) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT id FROM agentsam_intent_decisions
       WHERE conversation_id = ?
         AND task_type = 'image_generation'
         AND is_match = 1
         AND created_at >= unixepoch() - 7200
       ORDER BY created_at DESC
       LIMIT 1`,
    )
      .bind(cid)
      .first();
    return !!(row && row.id);
  } catch (e) {
    console.warn('[turn-decision] prior image lookup failed', e?.message ?? e);
    return false;
  }
}

/**
 * @param {unknown} env
 * @param {Record<string, unknown>} row
 */
async function logTurnDecision(env, row) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_intent_decisions (
         id, tenant_id, workspace_id, user_id, conversation_id, task_type,
         message_excerpt, matched_by, is_match, confidence, model_key, provider,
         routing_arm_id, reason, latency_ms, metadata_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
    )
      .bind(
        row.id,
        row.tenant_id ?? null,
        row.workspace_id ?? null,
        row.user_id ?? null,
        row.conversation_id ?? null,
        row.task_type,
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
      )
      .run();
  } catch (e) {
    console.warn('[turn-decision] log failed', e?.message ?? e);
  }
}

/**
 * @param {unknown} env
 * @param {string} message
 * @param {{
 *   tenantId?: string|null,
 *   workspaceId?: string|null,
 *   userId?: string|null,
 *   conversationId?: string|null,
 * }} [ctx]
 * @param {{
 *   forceImage?: boolean,
 *   composerAction?: string|null,
 *   skipChatEscalate?: boolean,
 * }} [opts]
 */
export async function resolveTurnDecision(env, message, ctx = {}, opts = {}) {
  const t0 = Date.now();
  const decisionId = `idc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const raw = String(message || '');
  const m = stripUserTextForIntent(raw).trim();
  const session = {
    tenantId: ctx.tenantId ?? null,
    workspaceId: ctx.workspaceId ?? null,
    userId: ctx.userId ?? null,
    conversationId: ctx.conversationId ?? null,
  };

  const baseLog = {
    id: decisionId,
    tenant_id: session.tenantId,
    workspace_id: session.workspaceId,
    user_id: session.userId,
    conversation_id: session.conversationId,
    message_excerpt: m,
  };

  const forceImage =
    opts.forceImage === true ||
    String(opts.composerAction || '').trim().toLowerCase() === 'create_image';

  if (forceImage) {
    const chatResult = buildClassifyResult('image_generation', 'agent', {
      confidence: 1,
      matchedBy: 'composer_action',
      escalated: false,
    });
    await logTurnDecision(env, {
      ...baseLog,
      task_type: 'image_generation',
      matched_by: 'composer_action',
      is_match: true,
      confidence: 1,
      reason: 'composer_force_image',
      latency_ms: Date.now() - t0,
      metadata: { spine: 'turn-decision-v1', imageFastPath: true, chatTaskType: chatResult.taskType },
    });
    return {
      decisionId,
      imageFastPath: true,
      imageIntent: { isMatch: true, matchedBy: 'composer_action' },
      chatResult,
      taskType: chatResult.taskType,
      matchedBy: 'composer_action',
      confidence: 1,
      escalated: false,
    };
  }

  if (!m) {
    const chatResult = buildClassifyResult('ask', 'auto', {
      confidence: 0.5,
      matchedBy: 'empty',
      escalated: false,
    });
    await logTurnDecision(env, {
      ...baseLog,
      task_type: 'chat',
      matched_by: 'neither',
      is_match: false,
      reason: 'empty',
      latency_ms: Date.now() - t0,
      metadata: { spine: 'turn-decision-v1', imageFastPath: false },
    });
    return {
      decisionId,
      imageFastPath: false,
      imageIntent: { isMatch: false, matchedBy: 'neither' },
      chatResult,
      taskType: chatResult.taskType,
      matchedBy: 'neither',
      confidence: 0.5,
      escalated: false,
    };
  }

  let imageEval = await evaluatePrimaryImageGenerationIntent(env, m, session);

  // Same-thread revision: prior image_generation + "edit it / make it blue" must stay on image path
  // (otherwise chat classifier invents cms_edit / code).
  if (!imageEval.isMatch && isImageRevisionFollowUpCue(m)) {
    const priorImage = await conversationHasRecentImageGeneration(env, session.conversationId);
    if (priorImage) {
      imageEval = {
        isMatch: true,
        matchedBy: 'revision_followup',
        reason: 'prior_image_generation_in_conversation',
      };
    }
  }

  let kw;
  try {
    kw = env?.DB
      ? await inferIntentFromKeywords(env, raw, { spineMode: true })
      : inferIntentHeuristically(raw);
  } catch (e) {
    console.warn('[turn-decision] chat keywords failed', e?.message ?? e);
    kw = env?.DB
      ? { taskType: 'chat', mode: 'agent', confidence: 0.4, matchedBy: 'keyword_error', escalateCue: true }
      : inferIntentHeuristically(raw);
  }

  // When image fast path wins, do not let chat escalate invent cms_edit / skill_use.
  let finalKw = imageEval.isMatch
    ? {
        taskType: 'image_generation',
        mode: 'agent',
        confidence: 0.95,
        matchedBy: imageEval.matchedBy || 'keyword',
      }
    : kw;
  let escalated = false;

  if (!imageEval.isMatch && !opts.skipChatEscalate && shouldEscalateChatIntent(raw, kw)) {
    escalated = true;
    const classified = await classifyIntentWithModel(env, raw, {
      userId: session.userId,
      workspaceId: session.workspaceId,
      tenantId: session.tenantId,
      fallbackTaskType: kw.taskType,
    });
    if (classified.confidence >= 0.5 || classified.matchedBy === 'classifier') {
      finalKw = classified;
    }
  }

  const chatResult = buildClassifyResult(finalKw.taskType, finalKw.mode, {
    confidence: finalKw.confidence,
    matchedBy: escalated ? finalKw.matchedBy || 'classifier' : finalKw.matchedBy || kw.matchedBy,
    escalated,
  });

  const imageFastPath = imageEval.isMatch === true;
  const primaryTaskType = imageFastPath ? 'image_generation' : chatResult.taskType;
  const primaryMatchedBy = imageFastPath ? imageEval.matchedBy : chatResult.matchedBy || 'keyword';

  await logTurnDecision(env, {
    ...baseLog,
    task_type: primaryTaskType,
    matched_by: primaryMatchedBy,
    is_match: imageFastPath ? 1 : 1,
    confidence: imageFastPath ? null : chatResult.confidence ?? null,
    model_key: finalKw.modelKey ?? null,
    provider: finalKw.provider ?? null,
    routing_arm_id: finalKw.armId ?? null,
    reason: imageFastPath
      ? `image:${imageEval.reason || imageEval.matchedBy}`
      : `${chatResult.taskType}:${finalKw.reason || chatResult.matchedBy || ''}`,
    latency_ms: Date.now() - t0,
    metadata: {
      spine: 'turn-decision-v1',
      imageFastPath,
      imageIntent: imageEval,
      chatTaskType: chatResult.taskType,
      keyword_task: kw.taskType,
      keyword_confidence: kw.confidence,
      escalated,
      final_task: chatResult.taskType,
    },
  });

  console.info(
    '[turn-decision]',
    JSON.stringify({
      decisionId,
      imageFastPath,
      taskType: primaryTaskType,
      chatTaskType: chatResult.taskType,
      matchedBy: primaryMatchedBy,
      escalated,
    }),
  );

  return {
    decisionId,
    imageFastPath,
    imageIntent: {
      isMatch: imageEval.isMatch,
      matchedBy: imageEval.matchedBy,
      reason: imageEval.reason,
    },
    chatResult,
    taskType: chatResult.taskType,
    intent: chatResult.intent,
    mode: chatResult.mode,
    matchedBy: primaryMatchedBy,
    confidence: chatResult.confidence,
    escalated,
  };
}
