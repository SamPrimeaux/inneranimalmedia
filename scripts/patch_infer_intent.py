#!/usr/bin/env python3
"""
patch_infer_intent.py
Script 2 of 3 — Routing repair.

Replaces inferIntentHeuristically in src/api/agent.js with a full
Cursor-replacement taxonomy: 25 task types covering D1, Supabase/Postgres,
R2, Cloudflare ops, web search, vectorize, GitHub, codebase search,
refactor, review, explain, skill_use, agent_spawn, and more.

Also fixes classifyIntent legacyMap — stops collapsing rich task types
back to 3 values.

Run: python3 scripts/patch_infer_intent.py
"""

from pathlib import Path

TARGET = Path("/Users/samprimeaux/inneranimalmedia/src/api/agent.js")

# ── Replacement for inferIntentHeuristically ──────────────────────────────────
OLD_INFER = '''function inferIntentHeuristically(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return { taskType: 'chat', mode: 'auto' };

  const is = (pattern) => pattern.test(t);
  const hasDeploy = is(/\\b(deploy|wrangler deploy|npm run deploy|push to prod|promote|release)\\b/);
  const hasSql =
    is(/\\b(select|insert|update|delete|upsert|create table|drop table|alter table|migrate|from\\s+\\w|where\\s+\\w)\\b/) ||
    is(/\\bd1_query|sql query\\b/) ||
    is(/\\b(query|count|show me|list|fetch|retrieve|lookup|look up)\\b.*\\b(table|row|record|column|database|agentsam_|d1)\\b/) ||
    is(/agentsam_[a-z_]+/);
  const hasShell = is(
    /\\b(run|bash|zsh|terminal|shell|pm2|npm run|pnpm|yarn run|git\\s|ls\\b|cat\\s|chmod|curl\\b)\\b/,
  );
  const hasCode = is(
    /\\b(write|edit|fix|create file|refactor|implement|monaco|\\.\\.js\\b|\\.ts\\b|\\.jsx\\b|worker\\.js|function|component|class)\\b/,
  );
  const hasDebug = is(/\\b(debug|error|trace|why.*fail|not working|broken|exception|crash|stack trace)\\b/);
  const hasPlan = is(/\\b(plan|roadmap|architect|diagram|excalidraw|spec|wireframe|flowchart)\\b/);
  const hasRecall = is(/\\b(recall|remember|what did|history|past session|previous|last time|earlier today)\\b/);
  const hasCms = is(/\\b(cms|theme|page|component|liquid|shopify|content edit)\\b/);
  const hasTool = is(/\\b(use tool|invoke|mcp tool|call tool|run tool)\\b/);
  const hasWorkflow = is(/\\b(run workflow|start workflow|trigger|execute workflow|pipeline)\\b/);
  const hasMultitask = is(
    /\\b(orchestrate|multi[- ]?step|multi[- ]?agent|automate|end[- ]?to[- ]?end|full[- ]?stack|build[- ]?and[- ]?deploy|create[- ]?and[- ]?launch|chain|sequence of tasks?|series of tasks?|autonomous|run everything|parallel tasks?)\\b/,
  );

  if (hasWorkflow) return { taskType: 'workflow_orchestration', mode: 'agent' };
  if (hasDeploy) return { taskType: 'deploy', mode: 'agent' };
  if (hasSql && !hasCode) return { taskType: 'sql_d1_generation', mode: 'agent' };
  if (hasShell && !hasCode) return { taskType: 'terminal_execution', mode: 'agent' };
  if (hasDebug) return { taskType: 'debug', mode: 'agent' };
  if (hasPlan) return { taskType: 'plan', mode: 'agent' };
  if (hasMultitask) return { taskType: 'multitask', mode: 'agent' };
  if (hasRecall) return { taskType: 'summary', mode: 'auto' };
  if (hasCms) return { taskType: 'cms_edit', mode: 'agent' };
  if (hasTool) return { taskType: 'tool_use', mode: 'agent' };
  if (hasCode || (hasSql && hasShell)) return { taskType: 'code', mode: 'agent' };
  return { taskType: 'chat', mode: 'agent' };
}'''

NEW_INFER = '''function inferIntentHeuristically(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return { taskType: 'chat', mode: 'auto' };

  const is = (pattern) => pattern.test(t);

  // ── Cloudflare / infrastructure signals ────────────────────────────────────
  const hasDeploy    = is(/\\b(deploy|wrangler deploy|npm run deploy|push to prod|promote|release|cf build|cloudflare build)\\b/);
  const hasCfOps     = is(/\\b(wrangler|kv namespace|durable object|cloudflare queue|r2 bucket list|cf worker|worker binding|workers ai|pages project|d1 create|d1 migrate|secret put|tail log)\\b/);
  const hasWorkflow  = is(/\\b(run workflow|start workflow|trigger workflow|execute workflow|pipeline|agentic run)\\b/);
  const hasMultitask = is(/\\b(orchestrate|multi[- ]?step|multi[- ]?agent|automate|end[- ]?to[- ]?end|full[- ]?stack|build[- ]?and[- ]?deploy|chain of tasks?|sequence of tasks?|parallel tasks?|run everything|autonomous)\\b/);

  // ── Database signals ───────────────────────────────────────────────────────
  const hasDbWrite   = is(/\\b(add to|insert into|seed|write to|upsert into|add records?|add rows?|add lessons?|add entries|add data|create records?|put into|store in d1|d1 write|write capability|populate table|bulk insert)\\b/) ||
                       (is(/\\b(add|insert|create|put|seed|write|upload)\\b/) && is(/\\b(d1|database|table|record|row|lesson|entry|entries)\\b/));
  const hasDbRead    = is(/\\b(select|count|show me|list all|fetch all|retrieve|look up|query the|read from)\\b.*\\b(table|row|record|d1|database|agentsam_)\\b/) ||
                       is(/agentsam_[a-z_]+/) ||
                       is(/\\bd1_query\\b/);
  const hasSupabase  = is(/\\b(supabase|postgres|postgresql|hyperdrive|pg query|pgvector|neon)\\b/);
  const hasSql       = is(/\\b(select|insert|update|delete|upsert|create table|drop table|alter table|migrate|pragma|join|where\\s+\\w|group by|order by)\\b/);

  // ── Terminal / shell signals ───────────────────────────────────────────────
  const hasShell     = is(/\\b(run command|bash|zsh|terminal|shell|pm2|npm run|pnpm|yarn run|git\\s|ls\\b|cat\\s|chmod|curl\\b|ssh\\b|exec\\b)\\b/);

  // ── R2 / storage signals ───────────────────────────────────────────────────
  const hasR2        = is(/\\b(r2|upload to|put file|store file|get from bucket|read from r2|list r2|r2 object|r2 bucket)\\b/);

  // ── Web / browser signals ──────────────────────────────────────────────────
  const hasWebSearch = is(/\\b(search the web|look it up online|google|browse|find online|search online|web search|look up.*online|find.*article|current news|latest.*on)\\b/) ||
                       is(/https?:\\/\\//);
  const hasBrowser   = is(/\\b(screenshot|inspect.*url|navigate to|open.*browser|browser.*inspect|playwright|puppeteer|headless)\\b/);

  // ── Vector / RAG signals ───────────────────────────────────────────────────
  const hasVectorize = is(/\\b(vectorize|embed|embedding|semantic search|rag|index.*knowledge|upsert.*vector|similarity search|knowledge base)\\b/);

  // ── GitHub signals ─────────────────────────────────────────────────────────
  const hasGitHub    = is(/\\b(github|pull request|open pr|merge pr|git commit|git push|diff|branch|repo|repository|git blame|git log)\\b/);

  // ── Codebase search signals ────────────────────────────────────────────────
  const hasSearchCode = is(/\\b(grep|find in codebase|which file|where is|search.*src|find.*function|locate.*file|find.*component|codebase.*search|search.*codebase)\\b/);

  // ── Code / edit signals (lower priority than db_write to avoid false match) ─
  const hasCode      = is(/\\b(edit file|fix file|create file|refactor|implement|monaco|worker\\.js|\\.js\\b|\\.ts\\b|\\.jsx\\b|tsx\\b|function\\s+\\w|class\\s+\\w|component)\\b/);
  const hasRefactor  = is(/\\b(refactor|restructure|rename|reorganize|extract function|clean up|move file|split|decompose)\\b/);
  const hasReview    = is(/\\b(review|code review|audit|check quality|analyze.*code|quality check|is this correct|look at this|read.*and.*tell)\\b/);
  const hasExplain   = is(/\\b(explain|what is|how does|describe|tell me about|what does|how do i|walk me through|break down|eli5|summarize how)\\b/);

  // ── Debug signals ──────────────────────────────────────────────────────────
  const hasDebug     = is(/\\b(debug|error|trace|why.*fail|not working|broken|exception|crash|stack trace|404|500|bug|fix.*error|diagnose)\\b/);

  // ── Planning signals ───────────────────────────────────────────────────────
  const hasPlan      = is(/\\b(plan|roadmap|architect|diagram|excalidraw|spec|wireframe|flowchart|sprint|task breakdown|prioritize|what should i work on)\\b/);

  // ── Memory / recall signals ────────────────────────────────────────────────
  const hasRecall    = is(/\\b(recall|remember|what did|history|past session|previous|last time|earlier today|what was|remind me)\\b/);

  // ── CMS signals ────────────────────────────────────────────────────────────
  const hasCms       = is(/\\b(cms|theme|liquid|shopify|content edit|cms page|cms section|cms component)\\b/);

  // ── Agent / skill / tool signals ───────────────────────────────────────────
  const hasTool      = is(/\\b(use tool|invoke|mcp tool|call tool|run tool|tool call)\\b/);
  const hasSkill     = is(/\\b(use skill|apply skill|run skill|invoke skill|skill:)\\b/);
  const hasSpawn     = is(/\\b(spawn subagent|delegate to|assign to agent|run.*agent|subagent|agent.*handle|have.*agent|let.*agent)\\b/);

  // ── Priority-ordered classification ────────────────────────────────────────
  // High-specificity infra first
  if (hasWorkflow)   return { taskType: 'workflow_orchestration', mode: 'agent' };
  if (hasDeploy)     return { taskType: 'deploy',                 mode: 'agent' };
  if (hasMultitask)  return { taskType: 'multitask',              mode: 'agent' };
  if (hasSpawn)      return { taskType: 'agent_spawn',            mode: 'agent' };

  // Database (before shell/code to avoid "write" false-matching hasCode)
  if (hasDbWrite)    return { taskType: 'db_write',               mode: 'agent' };
  if (hasSupabase)   return { taskType: 'supabase',               mode: 'agent' };
  if (hasDbRead && !hasSql) return { taskType: 'db_read',         mode: 'agent' };

  // Storage
  if (hasR2)         return { taskType: 'r2_ops',                 mode: 'agent' };

  // Cloudflare ops (non-deploy)
  if (hasCfOps)      return { taskType: 'cf_ops',                 mode: 'agent' };

  // Shell / terminal
  if (hasShell && !hasCode) return { taskType: 'terminal_execution', mode: 'agent' };

  // Web / browser
  if (hasBrowser)    return { taskType: 'browser',                mode: 'agent' };
  if (hasWebSearch)  return { taskType: 'web_search',             mode: 'agent' };

  // Vector / RAG
  if (hasVectorize)  return { taskType: 'vectorize',              mode: 'agent' };

  // GitHub
  if (hasGitHub)     return { taskType: 'github',                 mode: 'agent' };

  // SQL generation (no clear read/write intent)
  if (hasSql)        return { taskType: 'sql_d1_generation',      mode: 'agent' };

  // Debug
  if (hasDebug)      return { taskType: 'debug',                  mode: 'agent' };

  // Codebase search (before code edits)
  if (hasSearchCode) return { taskType: 'search_code',            mode: 'agent' };

  // Code operations
  if (hasRefactor)   return { taskType: 'refactor',               mode: 'agent' };
  if (hasReview)     return { taskType: 'review',                 mode: 'agent' };
  if (hasCode)       return { taskType: 'code',                   mode: 'agent' };

  // Planning
  if (hasPlan)       return { taskType: 'plan',                   mode: 'agent' };

  // Skill / tool invocation
  if (hasSkill)      return { taskType: 'skill_use',              mode: 'agent' };
  if (hasTool)       return { taskType: 'tool_use',               mode: 'agent' };

  // CMS
  if (hasCms)        return { taskType: 'cms_edit',               mode: 'agent' };

  // Memory / recall
  if (hasRecall)     return { taskType: 'summary',                mode: 'auto'  };

  // Explain / describe (low specificity — after everything else)
  if (hasExplain)    return { taskType: 'explain',                mode: 'auto'  };

  return { taskType: 'chat', mode: 'agent' };
}'''

# ── Fix legacyMap — stop collapsing rich task types back to 3 values ─────────
OLD_LEGACY = '''  const legacyMap = {
    sql_d1_generation: 'sql',
    terminal_execution: 'shell',
    code: 'shell',
  };
  return { intent: legacyMap[taskType] ?? 'question', taskType, mode: mode || 'agent' };'''

NEW_LEGACY = '''  // Route intent directly from taskType — no collapsing
  const intentRouteMap = {
    workflow_orchestration: 'workflow_orchestration',
    deploy:                 'deploy',
    multitask:              'multitask',
    agent_spawn:            'agent_spawn',
    db_write:               'db_write',
    db_read:                'db_read',
    supabase:               'supabase',
    r2_ops:                 'r2_ops',
    cf_ops:                 'cf_ops',
    terminal_execution:     'terminal_execution',
    browser:                'agent_general',
    web_search:             'agent_research',
    vectorize:              'vectorize',
    github:                 'github',
    sql_d1_generation:      'db_query',
    debug:                  'debug',
    search_code:            'search_code',
    refactor:               'refactor',
    review:                 'review',
    code:                   'code',
    plan:                   'plan',
    skill_use:              'skill_use',
    tool_use:               'tool_use',
    cms_edit:               'cms_edit',
    summary:                'summary',
    explain:                'explain',
    chat:                   'chat',
  };
  return { intent: intentRouteMap[taskType] ?? taskType, taskType, mode: mode || 'agent' };'''

def apply(source, old, new, label):
    if old not in source:
        print(f"  [FAIL] {label} — target not found")
        return source, False
    result = source.replace(old, new, 1)
    print(f"  [OK]   {label}")
    return result, True

def main():
    print("=" * 64)
    print("  patch_infer_intent.py — full intent taxonomy")
    print("=" * 64)

    if not TARGET.exists():
        print(f"  ERROR: {TARGET} not found")
        return

    source = TARGET.read_text()

    if 'hasDbWrite' in source:
        print("  Already patched — hasDbWrite present")
        return

    source, ok1 = apply(source, OLD_INFER,   NEW_INFER,   "inferIntentHeuristically replacement")
    source, ok2 = apply(source, OLD_LEGACY,  NEW_LEGACY,  "classifyIntent legacyMap → intentRouteMap")

    if not all([ok1, ok2]):
        print("\n  Patch(es) failed — file NOT written")
        return

    TARGET.write_text(source)
    print(f"\n  Written: {TARGET}")
    print("  Next: python3 scripts/patch_wire_selectautomodel.py")
    print("=" * 64)

if __name__ == "__main__":
    main()
