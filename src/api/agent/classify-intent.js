/**
 * Intent classification heuristics — extracted from agent.js (P0-D tranche 1).
 * Wired into resolveRuntimeProfile (P0-A): granular taskType drives prompt routes + RAG lane fallback.
 */
import { stripUserTextForIntent } from '../../core/active-file-envelope.js';
import { isReadOnlyFileContextIntent } from '../../core/code-implementation-intent.js';
import { isPrimaryImageGenerationIntent } from '../../tools/image_generation.js';

/** Bare hostname/path without scheme, e.g. inneranimalmedia.com/work */
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
  return (
    hasSchemeUrl ||
    (hasBareDomain &&
      (/\b(go\s+to|visit|open|navigate|load|head\s+to|check\s+out|browse\s+to|in\s+(the\s+|our\s+)?browser)\b/i.test(
        lower,
      ) ||
        /\bopen\s+[\w.-]+\.[\w.-]+/i.test(t))) ||
    /(?:^|\s)to\s+https?:\/\//i.test(t)
  );
}

/** @param {string} text */
export function inferIntentHeuristically(text) {
  const stripped = stripUserTextForIntent(text);
  if (isReadOnlyFileContextIntent(stripped)) {
    return { taskType: 'ask', mode: 'agent' };
  }
  const t = stripped.toLowerCase();
  if (!t) return { taskType: 'ask', mode: 'auto' };

  const is = (pattern) => pattern.test(t);
  const hasUrlNavigate = messageHasBrowserUrlNavigation(t);

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

  if (isPrimaryImageGenerationIntent(t)) {
    return { taskType: 'agent', mode: 'agent' };
  }

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
    /\b(grep|find in codebase|which file|where is|search.*src|find.*function|locate.*file|find.*component|codebase.*search|search.*codebase)\b/,
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

  if (hasWorkflow) return { taskType: 'workflow_orchestration', mode: 'agent' };
  if (hasDeploy) return { taskType: 'deploy', mode: 'agent' };
  if (hasMultitask) return { taskType: 'multitask', mode: 'agent' };
  if (hasBrowser) return { taskType: 'browser', mode: 'agent' };
  if (hasSpawn) return { taskType: 'agent_spawn', mode: 'agent' };
  if (hasDbWrite) {
    if (hasSupabase || is(/\b(hyperdrive|postgres|pgvector|supabase)\b/)) {
      return { taskType: 'supabase_write', mode: 'agent' };
    }
    return { taskType: 'd1_write', mode: 'agent' };
  }
  if (hasDbRead && !hasSql) {
    if (hasSupabase) return { taskType: 'supabase_query', mode: 'agent' };
    return { taskType: 'd1_query', mode: 'agent' };
  }
  if (hasSupabase && hasSql) return { taskType: 'supabase_query', mode: 'agent' };
  if (hasR2) return { taskType: 'r2_ops', mode: 'agent' };
  if (hasCfOps) return { taskType: 'cf_ops', mode: 'agent' };
  if (hasShell && !hasCode) return { taskType: 'terminal_execution', mode: 'agent' };
  if (hasWebSearch) return { taskType: 'web_search', mode: 'agent' };
  if (hasVectorize) return { taskType: 'vectorize', mode: 'agent' };
  if (hasGitHub) return { taskType: 'github', mode: 'agent' };
  if (hasSql) return { taskType: 'sql_d1_generation', mode: 'agent' };
  if (hasDebug) return { taskType: 'debug', mode: 'agent' };
  if (hasSearchCode) return { taskType: 'search_code', mode: 'agent' };
  if (hasRefactor) return { taskType: 'refactor', mode: 'agent' };
  if (hasReview) return { taskType: 'review', mode: 'agent' };
  if (hasCode) return { taskType: 'code', mode: 'agent' };
  if (hasSkillCreate) return { taskType: 'plan', mode: 'agent' };
  if (hasPlan) return { taskType: 'plan', mode: 'agent' };
  if (hasSkill) return { taskType: 'skill_use', mode: 'agent' };
  if (hasTool) return { taskType: 'tool_use', mode: 'agent' };
  if (hasCms) return { taskType: 'cms_edit', mode: 'agent' };
  if (hasRecall) return { taskType: 'recall', mode: 'auto' };
  if (hasExplain) return { taskType: 'explain', mode: 'auto' };
  return { taskType: 'chat', mode: 'agent' };
}

/** @param {any} _env @param {string} lastMessageText */
export async function classifyIntent(_env, lastMessageText) {
  const { taskType: rawTt, mode } = inferIntentHeuristically(lastMessageText);
  const taskType =
    rawTt != null && String(rawTt).trim() !== '' ? String(rawTt).trim().toLowerCase() : 'chat';
  const intentRouteMap = {
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
  };
  return { intent: intentRouteMap[taskType] ?? taskType, taskType, mode: mode || 'agent' };
}
