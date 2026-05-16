#!/usr/bin/env python3
"""
patch_infer_intent_v2.py — line-number based replacement (avoids escape fragility)
Finds inferIntentHeuristically by line pattern, replaces the whole function body.
Run: python3 scripts/patch_infer_intent_v2.py
"""
from pathlib import Path

TARGET = Path("/Users/samprimeaux/inneranimalmedia/src/api/agent.js")

NEW_FUNCTION = '''\
function inferIntentHeuristically(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return { taskType: 'chat', mode: 'auto' };

  const is = (pattern) => pattern.test(t);

  // ── Infra / orchestration ────────────────────────────────────────────────
  const hasDeploy    = is(/\b(deploy|wrangler deploy|npm run deploy|push to prod|promote|release|cf build|cloudflare build)\b/);
  const hasCfOps     = is(/\b(wrangler|kv namespace|durable object|cloudflare queue|r2 bucket list|cf worker|worker binding|workers ai|pages project|d1 create|d1 migrate|secret put|tail log)\b/);
  const hasWorkflow  = is(/\b(run workflow|start workflow|trigger workflow|execute workflow|agentic run)\b/);
  const hasMultitask = is(/\b(orchestrate|multi[- ]?step|multi[- ]?agent|automate|end[- ]?to[- ]?end|full[- ]?stack|build[- ]?and[- ]?deploy|chain of tasks?|sequence of tasks?|parallel tasks?|run everything|autonomous)\b/);

  // ── Database ─────────────────────────────────────────────────────────────
  const hasDbWrite   = is(/\b(add to|insert into|seed|write to|upsert into|add records?|add rows?|add lessons?|add entries|add data|create records?|put into|store in d1|d1 write|populate table|bulk insert)\b/) ||
                       (is(/\b(add|insert|create|put|seed|upload)\b/) && is(/\b(d1|database|table|record|row|lesson|entry|entries)\b/));
  const hasDbRead    = is(/\b(select|count|show me|list all|fetch all|retrieve|look up|query the|read from)\b.*\b(table|row|record|d1|database|agentsam_)\b/) ||
                       is(/agentsam_[a-z_]+/) || is(/\bd1_query\b/);
  const hasSupabase  = is(/\b(supabase|postgres|postgresql|hyperdrive|pg query|pgvector|neon)\b/);
  const hasSql       = is(/\b(select|insert|update|delete|upsert|create table|drop table|alter table|migrate|pragma|join|where\s+\w|group by|order by)\b/);

  // ── Terminal / shell ─────────────────────────────────────────────────────
  const hasShell     = is(/\b(run command|bash|zsh|terminal|shell|pm2|npm run|pnpm|yarn run|git\s|ls\b|cat\s|chmod|curl\b|ssh\b|exec\b)\b/);

  // ── R2 / storage ─────────────────────────────────────────────────────────
  const hasR2        = is(/\b(r2|upload to|put file|store file|get from bucket|read from r2|list r2|r2 object|r2 bucket)\b/);

  // ── Web / browser ─────────────────────────────────────────────────────────
  const hasWebSearch = is(/\b(search the web|look it up online|google|browse|find online|search online|web search|look up.*online|find.*article|current news|latest.*on)\b/) ||
                       is(/https?:\/\//);
  const hasBrowser   = is(/\b(screenshot|inspect.*url|navigate to|open.*browser|browser.*inspect|playwright|puppeteer|headless)\b/);

  // ── Vector / RAG ─────────────────────────────────────────────────────────
  const hasVectorize = is(/\b(vectorize|embed|embedding|semantic search|rag|index.*knowledge|upsert.*vector|similarity search|knowledge base)\b/);

  // ── GitHub ───────────────────────────────────────────────────────────────
  const hasGitHub    = is(/\b(github|pull request|open pr|merge pr|git commit|git push|diff|branch|repo|repository|git blame|git log)\b/);

  // ── Codebase search ───────────────────────────────────────────────────────
  const hasSearchCode = is(/\b(grep|find in codebase|which file|where is|search.*src|find.*function|locate.*file|find.*component|codebase.*search|search.*codebase)\b/);

  // ── Code ops (lower priority than db_write) ───────────────────────────────
  const hasCode      = is(/\b(edit file|fix file|create file|implement|monaco|worker\.js|\.js\b|\.ts\b|\.jsx\b|\.tsx\b|function\s+\w|class\s+\w|component)\b/);
  const hasRefactor  = is(/\b(refactor|restructure|rename|reorganize|extract function|clean up code|move file|split|decompose)\b/);
  const hasReview    = is(/\b(review|code review|audit|check quality|analyze.*code|quality check|is this correct)\b/);
  const hasExplain   = is(/\b(explain|what is|how does|describe|tell me about|what does|how do i|walk me through|break down|eli5|summarize how)\b/);

  // ── Debug ────────────────────────────────────────────────────────────────
  const hasDebug     = is(/\b(debug|error|trace|why.*fail|not working|broken|exception|crash|stack trace|404|500|bug|fix.*error|diagnose)\b/);

  // ── Planning ─────────────────────────────────────────────────────────────
  const hasPlan      = is(/\b(plan|roadmap|architect|diagram|excalidraw|spec|wireframe|flowchart|sprint|task breakdown|prioritize|what should i work on)\b/);

  // ── Memory / recall ───────────────────────────────────────────────────────
  const hasRecall    = is(/\b(recall|remember|what did|history|past session|previous|last time|earlier today|what was|remind me)\b/);

  // ── CMS ───────────────────────────────────────────────────────────────────
  const hasCms       = is(/\b(cms|theme|liquid|shopify|content edit|cms page|cms section|cms component)\b/);

  // ── Agent / skill / tool ─────────────────────────────────────────────────
  const hasTool      = is(/\b(use tool|invoke|mcp tool|call tool|run tool|tool call)\b/);
  const hasSkill     = is(/\b(use skill|apply skill|run skill|invoke skill|skill:)\b/);
  const hasSpawn     = is(/\b(spawn subagent|delegate to|assign to agent|run.*agent|subagent|agent.*handle|have.*agent|let.*agent)\b/);

  // ── Priority-ordered classification ──────────────────────────────────────
  if (hasWorkflow)    return { taskType: 'workflow_orchestration', mode: 'agent' };
  if (hasDeploy)      return { taskType: 'deploy',                 mode: 'agent' };
  if (hasMultitask)   return { taskType: 'multitask',              mode: 'agent' };
  if (hasSpawn)       return { taskType: 'agent_spawn',            mode: 'agent' };
  if (hasDbWrite)     return { taskType: 'db_write',               mode: 'agent' };
  if (hasSupabase)    return { taskType: 'supabase',               mode: 'agent' };
  if (hasDbRead && !hasSql) return { taskType: 'db_read',          mode: 'agent' };
  if (hasR2)          return { taskType: 'r2_ops',                 mode: 'agent' };
  if (hasCfOps)       return { taskType: 'cf_ops',                 mode: 'agent' };
  if (hasShell && !hasCode) return { taskType: 'terminal_execution', mode: 'agent' };
  if (hasBrowser)     return { taskType: 'browser',                mode: 'agent' };
  if (hasWebSearch)   return { taskType: 'web_search',             mode: 'agent' };
  if (hasVectorize)   return { taskType: 'vectorize',              mode: 'agent' };
  if (hasGitHub)      return { taskType: 'github',                 mode: 'agent' };
  if (hasSql)         return { taskType: 'sql_d1_generation',      mode: 'agent' };
  if (hasDebug)       return { taskType: 'debug',                  mode: 'agent' };
  if (hasSearchCode)  return { taskType: 'search_code',            mode: 'agent' };
  if (hasRefactor)    return { taskType: 'refactor',               mode: 'agent' };
  if (hasReview)      return { taskType: 'review',                 mode: 'agent' };
  if (hasCode)        return { taskType: 'code',                   mode: 'agent' };
  if (hasPlan)        return { taskType: 'plan',                   mode: 'agent' };
  if (hasSkill)       return { taskType: 'skill_use',              mode: 'agent' };
  if (hasTool)        return { taskType: 'tool_use',               mode: 'agent' };
  if (hasCms)         return { taskType: 'cms_edit',               mode: 'agent' };
  if (hasRecall)      return { taskType: 'summary',                mode: 'auto'  };
  if (hasExplain)     return { taskType: 'explain',                mode: 'auto'  };
  return { taskType: 'chat', mode: 'agent' };
}'''

NEW_LEGACY = '''\
  // Route intent directly — no collapsing to legacy 3-value set
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

OLD_LEGACY = '''\
  const legacyMap = {
    sql_d1_generation: 'sql',
    terminal_execution: 'shell',
    code: 'shell',
  };
  return { intent: legacyMap[taskType] ?? 'question', taskType, mode: mode || 'agent' };'''

def main():
    print("="*60)
    print("  patch_infer_intent_v2.py — line-based replacement")
    print("="*60)

    if not TARGET.exists():
        print(f"  ERROR: {TARGET} not found"); return

    lines = TARGET.read_text().splitlines(keepends=True)

    # Find inferIntentHeuristically start line
    start_idx = None
    for i, line in enumerate(lines):
        if 'function inferIntentHeuristically(text)' in line:
            start_idx = i
            break

    if start_idx is None:
        print("  FAIL: inferIntentHeuristically not found"); return

    print(f"  Found inferIntentHeuristically at line {start_idx + 1}")

    if 'hasDbWrite' in lines[start_idx + 1] if start_idx + 1 < len(lines) else False:
        print("  Already patched — hasDbWrite present"); return

    # Find end of function (matching closing brace at col 0)
    depth = 0
    end_idx = None
    for i in range(start_idx, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if depth == 0 and i > start_idx:
            end_idx = i
            break

    if end_idx is None:
        print("  FAIL: could not find end of function"); return

    print(f"  Function ends at line {end_idx + 1}")
    print(f"  Replacing {end_idx - start_idx + 1} lines")

    # Replace
    new_lines = (
        lines[:start_idx] +
        [NEW_FUNCTION + '\n'] +
        lines[end_idx + 1:]
    )

    source = ''.join(new_lines)

    # Also patch legacyMap → intentRouteMap
    if OLD_LEGACY in source:
        source = source.replace(OLD_LEGACY, NEW_LEGACY, 1)
        print("  [OK] legacyMap → intentRouteMap")
    else:
        print("  [WARN] legacyMap not found — may already be patched")

    TARGET.write_text(source)
    print(f"  Written: {TARGET}")
    print("  Run patch_wire_selectautomodel_v2.py next.")
    print("="*60)

if __name__ == "__main__":
    main()
