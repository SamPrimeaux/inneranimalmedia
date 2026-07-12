/**
 * Chat intent classification — Layer 1 D1 keywords + Layer 2 Sol escalate.
 * Bootstrap = sync heuristic (parity / no DB). Priority order is law.
 */
import { stripUserTextForIntent } from '../../core/active-file-envelope.js';
import { isReadOnlyFileContextIntent } from '../../core/code-implementation-intent.js';
import { isPrimaryImageGenerationIntent } from '../../tools/image_generation.js';
import {
  CHAT_INTENT_TASK_PRIORITY,
  chatIntentPurpose,
  loadClassificationKeywords,
} from '../../core/classification-keywords.js';
import { resolveModelForTask } from '../../core/resolveModel.js';
import { dispatchComplete } from '../../core/provider.js';

const CANONICAL_TASK_TYPES = new Set([
  ...CHAT_INTENT_TASK_PRIORITY,
  'chat',
  'ask',
  'project_question',
  'supabase_write',
  'supabase_query',
]);

const INTENT_ROUTE_MAP = {
  workflow_orchestration: 'workflow_orchestration',
  deploy: 'deploy',
  multitask: 'multitask',
  agent_spawn: 'agent_spawn',
  d1_write: 'd1_write',
  d1_query: 'd1_query',
  d1_migrate: 'd1_migrate',
  supabase_write: 'supabase_write',
  supabase_query: 'supabase_query',
  db_write: 'db_write',
  db_read: 'db_read',
  r2_ops: 'r2_ops',
  cf_ops: 'cf_ops',
  terminal_execution: 'terminal_execution',
  browser: 'browser',
  web_search: 'agent_research',
  vectorize: 'vectorize',
  github: 'github',
  sql_d1_generation: 'db_query',
  debug: 'debug',
  search_code: 'search_code',
  refactor: 'refactor',
  review: 'review',
  code: 'code',
  plan: 'plan',
  skill_use: 'skill_use',
  tool_use: 'tool_use',
  cms_edit: 'cms_edit',
  image_generation: 'image_generation',
  summary: 'summary',
  explain: 'explain',
  recall: 'recall',
  chat: 'chat',
  ask: 'ask',
  project_question: 'project_qna_fast',
};

const MODE_FOR_TASK = {
  recall: 'auto',
  explain: 'auto',
  ask: 'auto',
};

function messageHasBareDomainUrl(text) {
  return /\b[\w-]+(?:\.[\w-]+)+(?:\/[\w./%-]*)?/i.test(String(text || ''));
}

/** @param {string} text */
export function messageHasBrowserUrlNavigation(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  const hasSchemeUrl = /https?:\/\//i.test(t);
  const hasBareDomain = messageHasBareDomainUrl(t);
  if (!hasSchemeUrl && !hasBareDomain) return false;
  const navCue =
    /\b(go\s+to|visit|open|navigate|load|head\s+to|check\s+out|browse\s+to|in\s+(the\s+|our\s+)?browser)\b/i.test(
      lower,
    ) ||
    /\bopen\s+[\w.-]+\.[\w.-]+/i.test(t) ||
    /(?:^|\s)to\s+https?:\/\//i.test(t);
  return (hasSchemeUrl || hasBareDomain) && navCue;
}

function buildResult(taskType, mode, extra = {}) {
  const tt =
    taskType != null && String(taskType).trim() !== '' ? String(taskType).trim().toLowerCase() : 'chat';
  const m = mode || MODE_FOR_TASK[tt] || 'agent';
  return {
    intent: INTENT_ROUTE_MAP[tt] ?? tt,
    taskType: tt,
    mode: m,
    ...extra,
  };
}

/** @deprecated use buildClassifyResult — spine export */
export const buildClassifyResult = buildResult;

/**
 * Sync bootstrap (no D1). Kept for parity / cold path.
 * @param {string} text
 */
export function inferIntentHeuristically(text) {
  const stripped = stripUserTextForIntent(text);
  if (isReadOnlyFileContextIntent(stripped)) {
    return { taskType: 'ask', mode: 'agent', confidence: 0.85, matchedBy: 'bootstrap_special' };
  }
  const t = stripped.toLowerCase();
  if (!t) return { taskType: 'ask', mode: 'auto', confidence: 0.5, matchedBy: 'bootstrap_empty' };

  const is = (pattern) => pattern.test(t);
  const hasUrlNavigate = messageHasBrowserUrlNavigation(t);

  if (isPrimaryImageGenerationIntent(t)) {
    return { taskType: 'agent', mode: 'agent', confidence: 0.9, matchedBy: 'bootstrap_image' };
  }

  const hasDeploy = is(
    /\b(deploy|wrangler deploy|npm run deploy|push to prod|promote|release|cf build|cloudflare build)\b/,
  );
  const hasCfOps = is(
    /\b(wrangler|kv namespace|durable object|cloudflare queue|r2 bucket list|cf worker|worker binding|workers ai|pages project|d1 create|d1 migrate|secret put|tail log)\b/,
  );
  const hasWorkflow = is(/\b(run workflow|start workflow|trigger workflow|execute workflow|agentic run)\b/);
  const hasMultitask = is(
    /\b(orchestrate|multi[- ]?step|multi[- ]?agent|automate|end[- ]?to[- ]?end|full[- ]?stack|build[- ]?and[- ]?deploy|chain of tasks?|sequence of tasks?|parallel tasks?|run everything|autonomous)\b/,
  );
  const hasDbWrite =
    is(
      /\b(add to|insert into|seed|write to|upsert into|add records?|add rows?|add lessons?|add entries|add data|create records?|put into|store in d1|d1 write|populate table|bulk insert)\b/,
    ) ||
    (is(/\b(add|insert|create|put|seed|upload)\b/) && is(/\b(d1|database|table|record|row|lesson|entry|entries)\b/));
  const hasDbRead =
    is(/\b(select|count|show me|list all|fetch all|retrieve|look up|query the|read from)\b.*\b(table|row|record|d1|database|agentsam_)\b/) ||
    is(/\b(what|which)\s+tables?\b/i) ||
    is(/agentsam_[a-z_]+/) ||
    is(/\bd1_query\b/);
  const hasSupabase = is(/\b(supabase|postgres|postgresql|hyperdrive|pg query|pgvector|neon)\b/);
  const hasSql = is(
    /\b(select|insert|update|delete|upsert|create table|drop table|alter table|migrate|pragma|join|where\s+\w|group by|order by)\b/,
  );
  const hasShell = is(
    /\b(run command|bash|zsh|terminal|shell|pm2|npm run|pnpm|yarn run|git\s|ls\b|cat\s|chmod|curl\b|ssh\b|exec\b)\b/,
  );
  const hasR2 = is(/\b(r2|upload to|put file|store file|get from bucket|read from r2|list r2|r2 object|r2 bucket)\b/);
  const hasWebSearch =
    is(
      /\b(search the web|look it up online|google|find online|search online|web search|look up.*online|find.*article|current news|latest.*on)\b/,
    ) ||
    (is(/https?:\/\//) && is(/\b(search|google|look\s+up|find\s+online)\b/) && !hasUrlNavigate);
  const hasBrowser =
    hasUrlNavigate ||
    (messageHasBareDomainUrl(t) &&
      /\b(open|visit|go to|navigate|load|browse|check out|head to)\b/i.test(t)) ||
    /\bin (the |our )?browser\b/i.test(t) ||
    is(
      /\b(screenshot|inspect\s+https?:\/\/|inspect.*url|navigate\s+to|open\s+(the\s+)?browser|browser.*inspect|playwright|puppeteer|headless|double footer|visual (bug|issue|glitch)|dom inspect)\b/,
    );
  const hasVectorize = is(
    /\b(vectorize|embed|embedding|semantic search|rag|index.*knowledge|upsert.*vector|similarity search|knowledge base)\b/,
  );
  const hasGitHub = is(/\b(github|pull request|open pr|merge pr|git commit|git push|diff|branch|repo|repository|git blame|git log)\b/);
  const hasSearchCode = is(
    /\b(grep|find in codebase|which file|where is|find where|is defined|search.*src|find.*function|locate.*file|find.*component|codebase.*search|search.*codebase)\b/,
  );
  const hasCode =
    is(/\b(edit file|fix file|create file|implement|worker\.js|\.js\b|\.ts\b|\.jsx\b|\.tsx\b|function\s+\w|class\s+\w|component)\b/) ||
    (is(/\bmonaco\b/) && is(/\b(edit|change|modify|patch|save|sync|write|apply)\b/));
  const hasRefactor = is(/\b(refactor|restructure|rename|reorganize|extract function|clean up code|move file|split|decompose)\b/);
  const hasReview = is(/\b(review|code review|audit|check quality|analyze.*code|quality check|is this correct)\b/);
  const hasExplain = is(/\b(explain|what is|how does|describe|tell me about|what does|how do i|walk me through|break down|eli5|summarize how)\b/);
  const hasDebug = is(/\b(debug|error|trace|why.*fail|not working|broken|exception|crash|stack trace|404|500|bug|fix.*error|diagnose)\b/);
  const hasPlan = is(/\b(plan|roadmap|architect|diagram|excalidraw|spec|wireframe|flowchart|sprint|task breakdown|prioritize|what should i work on)\b/);
  const hasRecall = is(/\b(recall|remember|what did|history|past session|previous|last time|earlier today|what was|remind me)\b/);
  const hasCms = is(/\b(cms|theme|liquid|shopify|content edit|cms page|cms section|cms component)\b/);
  const hasSkillCreate =
    is(/\b(create|make|build|write|add|new)\b.{0,40}\b(skill|skills)\b/) &&
    !is(/\b(SKILL\.md|src\/skills\/|agentsam_skill|playwright)\b/);
  const hasTool = is(/\b(use tool|invoke|mcp tool|call tool|run tool|tool call)\b/);
  const hasSkill = is(/\b(use skill|apply skill|run skill|invoke skill|skill:)\b/);
  const hasSpawn = is(/\b(spawn subagent|delegate to|assign to agent|run.*agent|subagent|agent.*handle|have.*agent|let.*agent)\b/);

  const hit = (taskType) => ({ taskType, mode: MODE_FOR_TASK[taskType] || 'agent', confidence: 0.88, matchedBy: 'bootstrap' });

  if (hasWorkflow) return hit('workflow_orchestration');
  if (hasDeploy) return hit('deploy');
  if (hasMultitask) return hit('multitask');
  if (hasSpawn) return hit('agent_spawn');
  if (hasDbWrite) {
    if (hasSupabase || is(/\b(hyperdrive|postgres|pgvector|supabase)\b/)) return hit('supabase_write');
    return hit('d1_write');
  }
  if (hasDbRead && !hasSql) {
    if (hasSupabase) return hit('supabase_query');
    return hit('d1_query');
  }
  if (hasSupabase && hasSql) return hit('supabase_query');
  if (hasR2) return hit('r2_ops');
  if (hasCfOps) return hit('cf_ops');
  if (hasShell && !hasCode) return hit('terminal_execution');
  if (hasWebSearch) return hit('web_search');
  if (hasVectorize) return hit('vectorize');
  if (hasGitHub) return hit('github');
  if (hasSql) return hit('sql_d1_generation');
  if (hasDebug) return hit('debug');
  if (hasSearchCode) return hit('search_code');
  if (hasRefactor) return hit('refactor');
  if (hasReview) return hit('review');
  if (hasCode) return hit('code');
  if (hasSkillCreate) return hit('plan');
  if (hasPlan) return hit('plan');
  if (hasBrowser) return hit('browser');
  if (hasSkill) return hit('skill_use');
  if (hasTool) return hit('tool_use');
  if (hasCms) return hit('cms_edit');
  const hasProjectQuestion =
    is(/\b(what('?s| is| are| does)|how does|tell me about|remind me|status of|show me|where is|summarize|describe|who is|which)\b/) &&
    !hasDeploy && !hasDbWrite && !hasCode && !hasShell && !hasRefactor && !hasDebug && !hasBrowser;
  if (hasProjectQuestion) return { taskType: 'project_question', mode: 'agent', confidence: 0.8, matchedBy: 'bootstrap' };
  if (hasRecall) return hit('recall');
  if (hasExplain) return hit('explain');
  return { taskType: 'chat', mode: 'agent', confidence: 0.35, matchedBy: 'bootstrap_fallback' };
}

/**
 * Layer 1: D1 keyword bundles (bootstrap fallback per purpose).
 * @param {unknown} env
 * @param {string} lastMessageText
 * @param {{ spineMode?: boolean }} [opts] — spine: no parallel image/heuristic reroutes
 */
export async function inferIntentFromKeywords(env, lastMessageText, opts = {}) {
  const spineMode = opts.spineMode === true;
  const stripped = stripUserTextForIntent(lastMessageText);
  if (isReadOnlyFileContextIntent(stripped)) {
    return { taskType: 'ask', mode: 'agent', confidence: 0.85, matchedBy: 'special', source: 'special' };
  }
  const t = stripped.toLowerCase();
  if (!t) return { taskType: 'ask', mode: 'auto', confidence: 0.5, matchedBy: 'empty', source: 'empty' };

  if (!spineMode && isPrimaryImageGenerationIntent(t)) {
    return { taskType: 'agent', mode: 'agent', confidence: 0.9, matchedBy: 'image_primary', source: 'special' };
  }

  // Structural URL navigation (not bare https://)
  const urlNavigate = messageHasBrowserUrlNavigation(t);

  const purposes = [...CHAT_INTENT_TASK_PRIORITY, 'escalate'].map((tt) =>
    tt === 'escalate' ? 'chat_intent_escalate' : chatIntentPurpose(tt),
  );
  const loaded = await Promise.all(purposes.map((p) => loadClassificationKeywords(env, p)));
  /** @type {Map<string, { re: RegExp, patterns: string[], source: string }>} */
  const byPurpose = new Map();
  purposes.forEach((p, i) => byPurpose.set(p, loaded[i]));

  let escalateCue = false;
  const esc = byPurpose.get('chat_intent_escalate');
  if (esc?.patterns?.length && esc.re.test(t)) escalateCue = true;

  for (const taskType of CHAT_INTENT_TASK_PRIORITY) {
    const pack = byPurpose.get(chatIntentPurpose(taskType));
    if (!pack?.patterns?.length) continue;
    if (!pack.re.test(t)) continue;
    // browser from keywords only; urlNavigate also qualifies as browser but after code lanes
    if (taskType === 'browser' && !urlNavigate && !pack.re.test(t)) continue;
    const longHit = pack.patterns.some((pat) => pat.includes(' ') && t.includes(pat.toLowerCase()));
    const confidence = longHit ? 0.92 : 0.82;
    return {
      taskType,
      mode: MODE_FOR_TASK[taskType] || 'agent',
      confidence,
      matchedBy: 'keyword',
      source: pack.source,
      escalateCue,
    };
  }

  if (urlNavigate) {
    return {
      taskType: 'browser',
      mode: 'agent',
      confidence: 0.85,
      matchedBy: 'url_navigate',
      source: 'special',
      escalateCue,
    };
  }

  if (spineMode) {
    return {
      taskType: 'chat',
      mode: 'agent',
      confidence: 0.45,
      matchedBy: 'neither',
      source: 'no_keyword',
      escalateCue: escalateCue || true,
    };
  }

  // Compound leftovers that flat keywords miss (bootstrap only — not spine authority)
  const boot = inferIntentHeuristically(stripped);
  return { ...boot, escalateCue: escalateCue || boot.confidence < 0.8 };
}

function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * @param {string} text
 * @param {{ confidence: number, taskType: string, escalateCue?: boolean }} kw
 */
export function shouldEscalateChatIntent(text, kw) {
  const words = wordCount(text);
  if (words < 5) return false;
  if (kw.escalateCue) return true;
  if (Number(kw.confidence) < 0.8) return true;
  const soft = ['chat', 'ask', 'explain', 'project_question'].includes(String(kw.taskType || ''));
  return soft && words >= 8;
}

function extractJsonObject(text) {
  const raw = String(text || '');
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Layer 2: Sol (or intent_classification arm) JSON classify.
 * @param {unknown} env
 * @param {string} message
 * @param {{ userId?: string|null, workspaceId?: string|null, tenantId?: string|null, fallbackTaskType?: string }} ctx
 */
export async function classifyIntentWithModel(env, message, ctx = {}) {
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
    console.warn('[chat-intent] resolveModel', e?.message ?? e);
  }

  const allowed = [...CANONICAL_TASK_TYPES].join(', ');
  const prompt =
    'Classify the user message into exactly one task_type for an agentic coding platform.\n' +
    `Allowed task_type values: ${allowed}.\n` +
    'Answer ONLY with JSON: {"task_type":"...","confidence":0-1,"reason":"short"}.\n' +
    'Prefer code/search_code/debug/plan over browser when the user wants implementation or repo work.\n' +
    'Prefer browser only for explicit navigate/open/screenshot/automation of a live page.\n' +
    'Prefer chat for soft conversation.\n\n' +
    `User: ${String(message || '').slice(0, 2500)}`;

  let text = '';
  try {
    const out = await dispatchComplete(env, {
      modelKey: modelKey || 'gpt-5.6-sol',
      systemPrompt: 'You classify agent task intent. JSON only. No markdown.',
      messages: [{ role: 'user', content: prompt }],
      userId: ctx.userId || null,
      options: {
        maxOutputTokens: 120,
        reasoningEffort: 'low',
        verbosity: 'low',
      },
    });
    text =
      typeof out === 'string'
        ? out
        : out?.output_text ||
          out?.text ||
          out?.content ||
          out?.choices?.[0]?.message?.content ||
          JSON.stringify(out || {});
  } catch (e) {
    console.warn('[chat-intent] model classify failed', e?.message ?? e);
    return {
      taskType: ctx.fallbackTaskType || 'chat',
      mode: 'agent',
      confidence: 0,
      matchedBy: 'classifier_error',
      modelKey,
      provider,
      armId,
      latencyMs: Date.now() - t0,
      reason: String(e?.message || e).slice(0, 200),
    };
  }

  const parsed = extractJsonObject(text);
  let taskType = String(parsed?.task_type || '').trim().toLowerCase();
  if (!CANONICAL_TASK_TYPES.has(taskType)) {
    taskType = ctx.fallbackTaskType || 'chat';
  }
  return {
    taskType,
    mode: MODE_FOR_TASK[taskType] || 'agent',
    confidence: Number(parsed?.confidence) || 0.7,
    matchedBy: 'classifier',
    modelKey,
    provider,
    armId,
    latencyMs: Date.now() - t0,
    reason: parsed?.reason != null ? String(parsed.reason).slice(0, 200) : 'classifier',
  };
}

/**
 * @param {any} env
 * @param {string} lastMessageText
 * @param {{ session?: { userId?: string, workspaceId?: string, tenantId?: string, conversationId?: string }, skipEscalate?: boolean, turnDecision?: import('../core/turn-decision.js').TurnDecision|null }} [opts]
 */
export async function classifyIntent(env, lastMessageText, opts = {}) {
  if (opts.turnDecision?.chatResult) {
    return opts.turnDecision.chatResult;
  }

  const { resolveTurnDecision } = await import('../core/turn-decision.js');
  const td = await resolveTurnDecision(env, lastMessageText, opts.session || {}, {
    skipChatEscalate: opts.skipEscalate === true,
  });
  return td.chatResult;
}
