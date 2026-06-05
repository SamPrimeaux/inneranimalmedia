/**
 * When AgentSam should delegate to Google Antigravity (remote Linux sandbox).
 * Antigravity produces files/reports/diffs — AgentSam must validate and normalize afterward.
 *
 * Limitations (June 2026): no structured outputs, MCP, function_calling, file_search,
 * computer_use, Google Maps, background jobs; text + image input only.
 */
import { GOOGLE_MODEL_ROUTES } from './google-model-routes.js';

export const ANTIGRAVITY_MODEL_KEY = GOOGLE_MODEL_ROUTES.antigravity;

/** Task shapes that benefit from an isolated remote sandbox. */
export const USE_ANTIGRAVITY_WHEN = Object.freeze([
  'needs isolated Linux sandbox',
  'needs repo clone or mounted source',
  'needs package install + test run',
  'needs web research + generated file/artifact',
  'needs long-running multi-step attempt',
  'needs safe experiment before touching local repo',
  'needs independent second opinion against Cursor/Codex',
]);

/** Lanes where local IDE / structured routing is strictly better. */
export const AVOID_ANTIGRAVITY_WHEN = Object.freeze([
  'normal chat answer',
  'simple code snippet',
  'quick classification/routing',
  'strict JSON structured output needed',
  'direct production deploy',
  'task requires secrets inside sandbox',
  'task requires computer_use, mcp, function_calling, file_search, or google_maps',
]);

const USE_PATTERNS = [
  { re: /\b(audit|review)\b.{0,40}\b(repo|repository|codebase)\b/i, reason: 'full repo audit' },
  { re: /\b(clone|fork)\b.{0,30}\b(repo|repository)\b/i, reason: 'repo clone in sandbox' },
  { re: /\b(run tests?|npm (test|install|ci)|pytest|vitest|playwright test)\b/i, reason: 'package install + test run' },
  { re: /\b(proof[- ]of[- ]concept|poc|spike)\b/i, reason: 'research + build artifact' },
  { re: /\b(migration script|sample data)\b.{0,40}\b(run|test|validate)\b/i, reason: 'migration script validation' },
  { re: /\b(risk[- ]ranked|patch plan|security audit)\b/i, reason: 'risk-ranked patch plan' },
  { re: /\b(sandbox|isolated|remote environment)\b/i, reason: 'isolated Linux sandbox' },
  { re: /\b(d1 bloat|bloat analysis)\b/i, reason: 'D1 bloat analysis in sandbox' },
  { re: /\b(second opinion|independent scout|scout agent)\b/i, reason: 'independent second opinion' },
  { re: /\b(research|look up|current docs?)\b.{0,50}\b(build|generate|create|html|artifact)\b/i, reason: 'web research + artifact' },
  { re: /\b(ui brief|preview html|mockup html)\b/i, reason: 'UI brief → preview file' },
  { re: /\b(multi[- ]step|long[- ]running|iterative attempt)\b/i, reason: 'long-running multi-step attempt' },
  { re: /\b(safe experiment|before touching (local|prod))\b/i, reason: 'safe experiment before local edits' },
];

const AVOID_PATTERNS = [
  { re: /^\s*(what is|explain|define|how does)\b/i, reason: 'normal chat answer' },
  { re: /\b(json only|structured output|return json|schema:\s*\{)/i, reason: 'strict JSON structured output' },
  { re: /\b(deploy to prod|production deploy|wrangler deploy|npm run deploy)\b/i, reason: 'direct production deploy' },
  { re: /\b(api key|secret|password|token)\b.{0,30}\b(sandbox|antigravity)\b/i, reason: 'secrets inside sandbox' },
  { re: /\b(mcp|computer_use|file_search|google maps|function calling)\b/i, reason: 'unsupported Antigravity capability' },
  { re: /\b(edit this (file|component)|change line \d+|quick fix)\b/i, reason: 'simple local edit — Cursor wins' },
  { re: /^\s*(hi|hello|thanks|ok|yes|no)\b/i, reason: 'normal chat answer' },
];

/**
 * @param {string} message
 * @param {{ wantsStructuredOutput?: boolean, hasLocalEditIntent?: boolean, requiresMcp?: boolean }} [ctx]
 * @returns {{ recommend: boolean, score: number, reasons: string[], avoidReasons: string[], model_key: string }}
 */
export function evaluateAntigravityIntent(message, ctx = {}) {
  const m = String(message || '').trim();
  if (!m || m.length < 12) {
    return { recommend: false, score: 0, reasons: [], avoidReasons: ['message too short'], model_key: ANTIGRAVITY_MODEL_KEY };
  }

  /** @type {string[]} */
  const reasons = [];
  /** @type {string[]} */
  const avoidReasons = [];

  for (const { re, reason } of USE_PATTERNS) {
    if (re.test(m)) reasons.push(reason);
  }
  for (const { re, reason } of AVOID_PATTERNS) {
    if (re.test(m)) avoidReasons.push(reason);
  }

  if (ctx.wantsStructuredOutput) avoidReasons.push('strict JSON structured output needed');
  if (ctx.requiresMcp) avoidReasons.push('task requires mcp');
  if (ctx.hasLocalEditIntent && reasons.length === 0) {
    avoidReasons.push('simple local edit — use IDE lane');
  }

  let score = Math.min(1, reasons.length * 0.22);
  if (avoidReasons.length) score -= avoidReasons.length * 0.28;
  score = Math.max(0, Math.min(1, score));

  const recommend = score >= 0.45 && reasons.length > 0 && avoidReasons.length === 0;

  return {
    recommend,
    score,
    reasons: [...new Set(reasons)],
    avoidReasons: [...new Set(avoidReasons)],
    model_key: ANTIGRAVITY_MODEL_KEY,
  };
}

/**
 * Merge Antigravity hint into capability-router decision.
 * @param {Record<string, unknown>} decision
 * @param {string} message
 * @returns {Record<string, unknown>}
 */
export function applyAntigravityOverlay(decision, message) {
  const d = decision && typeof decision === 'object' ? { ...decision } : {};
  const evalResult = evaluateAntigravityIntent(message, {
    wantsStructuredOutput: /\b(json only|structured output|return json)\b/i.test(String(message || '')),
    hasLocalEditIntent: !!d.should_use_monaco && !/\b(audit|clone|sandbox|full repo)\b/i.test(String(message || '')),
    requiresMcp: /\bmcp\b/i.test(String(message || '')),
  });

  d.should_use_antigravity = evalResult.recommend;
  d.antigravity_score = evalResult.score;
  d.antigravity_reasons = evalResult.reasons;
  d.antigravity_avoid_reasons = evalResult.avoidReasons;
  d.antigravity_model_key = evalResult.model_key;

  if (evalResult.recommend) {
    const opt = Array.isArray(d.optional_capabilities) ? [...d.optional_capabilities] : [];
    if (!opt.includes('antigravity')) opt.push('antigravity');
    d.optional_capabilities = opt;
    if (d.execution_lane === 'none' || !d.execution_lane) {
      d.execution_lane = 'antigravity_sandbox';
    }
  }

  return d;
}

/**
 * Composer toggle forces Antigravity even when heuristics would avoid it (user opt-in).
 * @param {Record<string, unknown>} decision
 * @param {boolean} composerEnabled
 */
export function applyComposerAntigravityToggle(decision, composerEnabled) {
  const d = decision && typeof decision === 'object' ? { ...decision } : {};
  if (!composerEnabled) return d;
  d.should_use_antigravity = true;
  d.antigravity_score = Math.max(Number(d.antigravity_score) || 0, 0.95);
  d.antigravity_reasons = [...new Set([...(d.antigravity_reasons || []), 'composer_toggle'])];
  d.antigravity_avoid_reasons = [];
  d.antigravity_model_key = d.antigravity_model_key || ANTIGRAVITY_MODEL_KEY;
  d.execution_lane = 'antigravity_sandbox';
  const opt = Array.isArray(d.optional_capabilities) ? [...d.optional_capabilities] : [];
  if (!opt.includes('antigravity')) opt.push('antigravity');
  d.optional_capabilities = opt;
  return d;
}
