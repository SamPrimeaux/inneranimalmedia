# Plans 1–7 — Python audit / analyze / suggest guide (for Claude)

**Audience:** Claude (or any agent) writing **read-only** Python tooling in this repo.  
**Repo root (only):** `/Users/samprimeaux/inneranimalmedia`  
**Do not** reference deleted paths (`~/Downloads/inneranimalmedia`, `inneranimalmedia-agentsam-dashboard`, etc.).

## Purpose

Before implementing Plans 1–7 in Worker/dashboard code, ship **seven Python scripts** that:

1. **Audit** — measure current state (D1 + grep + optional remote samples).
2. **Analyze** — classify gaps vs target architecture.
3. **Suggest** — emit a prioritized patch list (file:line, SQL, migration hints) — **no auto-edits** unless a separate `--apply` flag is explicitly requested later.

Scripts are **evidence generators** for human review and D1 `plan_task` notes — not deploy tools.

---

## Shared conventions (all 7 scripts)

### Repo layout

| Path | Role |
|------|------|
| `scripts/plan01_chat_run_spine_audit.py` … `plan07_validation_gate_audit.py` | One script per plan (names below) |
| `scripts/lib/plan_audit_common.py` | **Create once** — shared `d1_query`, `grep_repo`, `write_report`, wrangler wrapper |
| `artifacts/plan_audits/plan0N_<slug>/` | JSON + Markdown per run |
| `artifacts/plan_audits/LATEST_PLAN0N_<slug>.md` | Symlink or copy of latest |

### D1 access (production config)

Mirror `scripts/audit_run_spine_linkage.py` and `scripts/audit_agentsam_table_usage.py`:

```bash
# From repo root — confirm pwd first
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --json --command "SELECT 1"
```

Python should default:

- `DEFAULT_DB = "inneranimalmedia-business"`
- `DEFAULT_CONFIG = "wrangler.production.toml"`
- `--remote` default **True** for audits; `--local` flag for offline schema-only
- Use `./scripts/with-cloudflare-env.sh` prefix when shelling wrangler (env secrets)

### Code scan scope

| Include | Exclude |
|---------|---------|
| `src/**/*.js` | `node_modules`, `dist`, `dashboard/dist`, `.git` |
| `dashboard/**/*.{ts,tsx,js,jsx}` | `scripts/patch_results/**` backups |
| `migrations/*.sql` | Deleted / duplicate repos |

### Report shape (every script)

```json
{
  "plan_id": 1,
  "plan_slug": "chat_run_spine",
  "generated_at": "ISO8601",
  "repo_root": "/Users/samprimeaux/inneranimalmedia",
  "d1": { "db": "...", "remote": true },
  "summary": { "pass": false, "blocker_count": 3, "warning_count": 12 },
  "findings": [
    {
      "severity": "blocker|warning|info",
      "category": "d1|code|dashboard|sse|legacy",
      "title": "...",
      "evidence": "...",
      "suggestion": "...",
      "targets": ["src/api/agent.js:1209", "agentsam_workflow_runs.workflow_key"]
    }
  ],
  "suggested_patches": []
}
```

Also write human **Markdown** with: Executive summary → Findings table → Suggested patch order → SQL snippets → Grep hit appendix.

### D1 work-item ids (register when implementing fixes, not when auditing)

| Plan | `todo_id` | `plan_task_id` | `plan_id` |
|------|-----------|----------------|-----------|
| 1 | `todo_iam_chat_run_spine_p1` | `task_iam_chat_run_spine_cutover` | `plan_may14_2026_repair` |
| 2 | `todo_iam_routing_mode_split_p2` | `task_iam_routing_mode_split` | same |
| 3 | `todo_iam_prompt_trilogy_p3` | `task_iam_prompt_trilogy` | same |
| 4 | `todo_iam_tool_loop_catalog_p4` | `task_iam_tool_loop_catalog` | same |
| 5 | `todo_iam_context_budget_p5` | `task_iam_context_budget` | same |
| 6 | `todo_iam_eval_drift_governance_p6` | `task_iam_eval_drift_governance` | same |
| 7 | `todo_iam_validation_gate_p7` | `task_iam_validation_gate` | same |

---

## What `agent_chat_tool_session` is (Plan 1 context)

**Not a table.** It is `workflow_key = 'agent_chat_tool_session'` on **`agentsam_workflow_runs`** rows created by the chat tool ledger in `src/api/agent.js` (`AGENT_CHAT_TOOL_LEDGER_WORKFLOW_KEY`).

**Intended (historical):** observability + SSE (`workflow_start` / `workflow_step`) for agent-mode tool batches.  
**Target (Plan 1):** stop creating these for normal chat; use **`agentsam_agent_run`** + **`agentsam_tool_call_log`** only.

---

# Plan 1 — One spine per chat turn

**Script:** `scripts/plan01_chat_run_spine_audit.py`  
**Artifact dir:** `artifacts/plan_audits/plan01_chat_run_spine/`

### Audit questions

1. How many `agentsam_workflow_runs` rows have `workflow_key = 'agent_chat_tool_session'` in last 7/30 days?
2. For recent agent chats: does every `agentsam_tool_call_log` row have non-null `agent_run_id`?
3. Are new tool sessions still creating `wrun_*` while also writing `agentsam_agent_run` (duplicate spine)?
4. Does `run_group_id` on workflow runs link to `chatAgentRunId` when column exists?
5. Do SSE consumers require `wrun_*` or can they use `agent_run_id`?

### D1 SQL targets

```sql
-- Volume of synthetic workflow runs
SELECT status, COUNT(*) AS c FROM agentsam_workflow_runs
WHERE workflow_key = 'agent_chat_tool_session'
  AND created_at >= datetime('now', '-30 days')
GROUP BY status;

-- Tool log linkage
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN agent_run_id IS NULL OR trim(agent_run_id) = '' THEN 1 ELSE 0 END) AS missing_agent_run_id
FROM agentsam_tool_call_log
WHERE created_at >= unixepoch('now', '-7 days');

-- Orphan pattern: workflow run without matching agent_run (when run_group_id used)
SELECT wr.id, wr.run_group_id, ar.id AS agent_run_id
FROM agentsam_workflow_runs wr
LEFT JOIN agentsam_agent_run ar ON ar.id = wr.run_group_id
WHERE wr.workflow_key = 'agent_chat_tool_session'
ORDER BY wr.created_at DESC LIMIT 50;
```

Extend with PRAGMA checks for: `agentsam_agent_run.assembled_prompt_hash`, `routing_arm_id`, `prompt_layer_keys_json` (Plan 3 column — flag if missing).

### Code grep targets (must scan)

| Symbol / string | Primary files |
|-----------------|---------------|
| `agent_chat_tool_session` | `src/api/agent.js`, `src/core/agentsam-workflow-debug-store.js` |
| `createAgentChatToolLedgerRun` | `src/api/agent.js` ~1209 |
| `appendAgentChatToolLedgerStep` | ~1287 |
| `finalizeAgentChatToolLedger` | ~1366 |
| `AGENT_CHAT_TOOL_LEDGER` | `src/api/agent.js` |
| `scheduleAgentsamChatAgentRunStart` | `src/core/agent-run-routing.js`, `src/api/agent.js` |
| `chatAgentRunId` | `src/api/agent.js` |
| `agentsam_tool_call_log` | `src/api/agent.js`, `src/core/agentsam-ops-ledger.js` |
| `insertChatToolSessionParentExecution` | `src/core/agent-chat-tool-execution-ledger.js` |
| `syncWorkflowRunToSupabase` | finalize ledger path |

### Dashboard / SSE targets

| File | What to find |
|------|----------------|
| `dashboard/features/agent-chat/hooks/useAgentChatStream.ts` | `workflow_step`, `workflow_start`, `run_id` |
| `dashboard/features/agent-chat/components/WorkflowRunBoard.tsx` | `workflow_step` handling |
| `dashboard/features/agent-chat/ChatAssistant.tsx` | `tool_done`, `workflow_step` |

### Suggest output examples

- Remove `INSERT INTO agentsam_workflow_runs` from `createAgentChatToolLedgerRun`; set `ledger.runId = chatAgentRunId`.
- Change SSE `run_id` to `chatAgentRunId`; keep event type or alias `tool_step`.
- Add SQL view `v_agent_chat_tool_trace` joining `agentsam_agent_run` → `agentsam_tool_call_log`.

### Pass criteria (script should compute booleans)

- [ ] `findings` includes count of `agent_chat_tool_session` runs last 7d
- [ ] % `tool_call_log` with `agent_run_id` populated
- [ ] List of code paths still inserting workflow_runs for chat tools
- [ ] Dashboard files that hardcode `wrun_*` expectation

**Reuse:** `scripts/audit_run_spine_linkage.py` — extend or call for `agent_run_id` column coverage.

---

# Plan 2 — Split routing from mode

**Script:** `scripts/plan02_routing_mode_split_audit.py`

### Audit questions

1. Where does code still read **`agent_mode_configs`** for **model** selection (not just tool caps)?
2. Is `model_preference` column gone (migration 339)?
3. Are `routing_arm_id` and Supabase `agentsam_routing_decisions` populated on recent `agentsam_agent_run` rows?
4. When is Thompson enabled vs deterministic?

### D1 SQL targets

```sql
PRAGMA table_info(agent_mode_configs);
PRAGMA table_info(agentsam_agent_run);

SELECT COUNT(*) AS runs_7d,
  SUM(CASE WHEN routing_arm_id IS NOT NULL AND trim(routing_arm_id) != '' THEN 1 ELSE 0 END) AS with_arm
FROM agentsam_agent_run
WHERE created_at >= datetime('now', '-7 days');

SELECT task_type, mode, COUNT(*) FROM agentsam_routing_arms
WHERE is_active = 1 GROUP BY task_type, mode;
```

### Code grep targets

| Target | Files |
|--------|-------|
| `agent_mode_configs` | `src/api/agent.js` (`loadModeConfig`), `src/core/gate.js`, `src/api/terminal.js` |
| `escalation_model` | `src/api/agent.js` (~6140, ~6743) |
| `resolveRoutingArm` | `src/core/routing.js` |
| `pickRoutingArmByThompson` | `src/core/thompson.js` |
| `isThompsonRoutingSamplingEnabled` | `src/core/routing-thompson-flag.js` |
| `agentsam_routing_arms` | `src/core/provider.js`, `src/core/resolveModel.js` |
| `writeSupabaseRoutingDecision` | `src/core/agent-run-routing.js`, integrations |

### Suggest output

- Remove `escalationRow` from `modeConfig` in model failover chain.
- Document matrix: concern → owning table (from hypothesis 2).
- Flag dead code: `src/core/gate.js` `runModeGate` if unreferenced.

**Reuse:** `scripts/routing_audit.py` — extend TARGETS dict.

---

# Plan 3 — Prompt trilogy (routes → versions → cache)

**Script:** `scripts/plan03_prompt_trilogy_audit.py`

### Audit questions

1. For each **active** `agentsam_prompt_routes` row: are all `prompt_layer_keys` present in **`agentsam_prompt_versions`** (`is_active = 1`)?
2. How many routes still use only `["core_identity"]`?
3. Is `agentsam_prompt_cache_keys` write-only (inserts, no read path)?
4. Is legacy **`ai_compiled_context_cache`** still used on chat hot path?
5. Does `agentsam_agent_run` have columns to pin `assembled_prompt_hash`?

### D1 SQL targets

```sql
SELECT route_key, prompt_layer_keys, max_tools, token_budget, include_rag
FROM agentsam_prompt_routes WHERE is_active = 1 ORDER BY priority ASC;

SELECT prompt_key, COUNT(*) AS versions, MAX(is_active) AS any_active
FROM agentsam_prompt_versions GROUP BY prompt_key;

SELECT COUNT(*) AS cache_rows,
  SUM(read_count) AS total_reads
FROM agentsam_prompt_cache_keys;
```

Python should **parse** `prompt_layer_keys` JSON per route and diff against `prompt_versions.prompt_key`.

### Code grep targets

| Target | Files |
|--------|-------|
| `resolveAgentsamPromptRoute` | `src/api/agent.js` ~516 |
| `buildSystemPrompt` | `src/api/agent.js` ~676 |
| `agentsam_prompt_versions` | `buildSystemPrompt` query ~747 |
| `logPromptCacheUsage` | `src/api/agent.js` ~305 |
| `ai_compiled_context_cache` | `src/api/agent.js` ~9511 |
| `sp:v1:` KV cache | `buildSystemPrompt` |
| `getActivePromptByWeight` | `src/api/agentsam.js` (unused on chat?) |

### Suggest output

- Migration SQL: expand `prompt_layer_keys` per route_key.
- Missing version keys list.
- Proposed `agentsam_agent_run` columns: `assembled_prompt_hash`, `prompt_layer_keys_json`.
- Deprecation map: `ai_compiled_context_cache` → `agentsam_prompt_cache_keys` read-through.

---

# Plan 4 — Tool loop (catalog-native, parallel, bounded)

**Script:** `scripts/plan04_tool_loop_catalog_audit.py`

### Audit questions

1. Is `AGENT_CHAT_MINIMUM_AGENTSAM_TOOLS` defined in code but not verified against `agentsam_tools`?
2. Does chat still append to `step_results_json` on workflow runs?
3. Are approvals written to todo vs approval queue tables?
4. Is `scheduleToolCallLog` (ops-ledger) used on all dispatch paths?

### Code grep targets

| Target | Files |
|--------|-------|
| `AGENT_CHAT_MINIMUM_AGENTSAM_TOOLS` | `src/api/agent.js` |
| `selectMcpToolsForDeterministicAgentChat` | `src/api/agent.js`, route resolver |
| `dispatchToolCall` / `dispatchToolCallWithBudget` | `src/tools/`, `src/api/agent.js` |
| `scheduleToolCallLog` | `src/core/agentsam-ops-ledger.js` |
| `createApprovalRequest` | `src/api/agent.js` |
| `agentsam_todo` + approval | grep both |
| `step_results_json` | `appendAgentChatToolLedgerStep` |

### D1 SQL targets

```sql
SELECT tool_name, is_active FROM agentsam_tools
WHERE tool_name IN ('d1_query','github_file','terminal_run','r2_read','r2_write','cdt_take_screenshot');

SELECT tool_name, COUNT(*) FROM agentsam_tool_call_log
WHERE created_at >= unixepoch('now', '-7 days')
GROUP BY tool_name ORDER BY COUNT(*) DESC LIMIT 30;
```

### Suggest output

- Minimum-tools migration seed vs constant diff.
- Parallelization hook point in tool loop (line range).
- SSE rename map: `workflow_step` → `tool_step`.

---

# Plan 5 — Context pipeline (route budgets)

**Script:** `scripts/plan05_context_budget_audit.py`

### Audit questions

1. Does `buildSystemPrompt` enforce `token_budget` from route or ignore it?
2. Are `include_rag`, `include_workspace_ctx`, `memory_limit` hard gates or hints?
3. Is context duplicated across `agent_messages`, `agentsam_context_digest`, vector RAG?

### Code targets

| Function | File |
|----------|------|
| `buildSystemPrompt` | `src/api/agent.js` |
| `resolveVectorContext` | `src/api/agent.js` ~612 |
| `fetchActivePlanContextFragment` | `src/api/agent.js` |
| `isSimpleAskMessage` | `src/api/agent.js` |
| `agentsam_context_digest` | `buildSystemPrompt` digest query |

### D1

```sql
SELECT route_key, token_budget, memory_limit, include_rag, include_workspace_ctx, max_tools
FROM agentsam_prompt_routes WHERE is_active = 1;
```

### Suggest output

- Per-route recommended caps vs current code behavior (table).
- Single-injector rule: prefer `agentsam_context_digest` only.

---

# Plan 6 — Eval → routing governance

**Script:** `scripts/plan06_eval_drift_governance_audit.py`

### Audit questions

1. Are paused arms correlated with `agentsam_model_drift_signals`?
2. Does `triggerEvalAfterNRuns` run and update arm quality?
3. Can any code path select `is_paused = 1` or `is_degraded = 1` catalog models?

### D1 SQL targets

```sql
SELECT severity, COUNT(*) FROM agentsam_model_drift_signals
WHERE COALESCE(acknowledged,0) = 0 GROUP BY severity;

SELECT id, model_key, is_paused, pause_reason, drift_signal_id
FROM agentsam_routing_arms WHERE is_paused = 1;

SELECT suite_id, COUNT(*) FROM agentsam_eval_cases GROUP BY suite_id;
SELECT status, COUNT(*) FROM agentsam_eval_runs
WHERE run_at >= datetime('now', '-30 days') GROUP BY status;
```

### Code targets

| Target | Files |
|--------|-------|
| `triggerEvalAfterNRuns` | `src/core/eval-runner.js` |
| `syncRoutingArmPauseFromDrift` | `src/core/routing-cron.js` |
| `queryRoutingArmsCandidates` | `src/core/routing.js` |
| `pickRoutingArmByThompson` | `src/core/thompson.js` |

### Suggest output

- Dashboard gap: no drift panel → component paths to add.
- Prompt hash regression hook location (after Plan 3 column exists).

**Reuse:** `scripts/e2e_agentsam_eval_runner.py`

---

# Plan 7 — Validation gate

**Script:** `scripts/plan07_validation_gate_audit.py`

### Audit questions

1. Does `scripts/verify_dashboard_asset_integrity.py` exist and run?
2. Are plan tasks marked `done` without Playwright proof in `output_summary`?
3. What docs/rules require validation vs what CI enforces?

### Repo targets (no D1 required, optional plan_tasks sample)

| Path | Check |
|------|-------|
| `.cursor/rules/agentsam-d1-cursor-session-sync.mdc` | HEALTH_ONLY_FALSE_SUCCESS |
| `docs/agentsam_knowledge/dashboard_r2_asset_deploy_tactics.md` | chunk 404 pattern |
| `scripts/verify_dashboard_asset_integrity.py` | exists / stub |
| `package.json` | `validate:deploy` or similar scripts |
| `grep` for `playwright` in `scripts/` |

### D1 (optional)

```sql
SELECT id, status, output_summary FROM agentsam_plan_tasks
WHERE status = 'done' AND plan_id = 'plan_may14_2026_repair'
ORDER BY completed_at DESC LIMIT 20;
```

Flag tasks with `done` but no substring `playwright`, `screenshot`, `verify_dashboard`, `chunk` in `output_summary`.

### Suggest output

- Minimal `validate:deploy` shell script outline.
- Pre-close checklist for `agentsam_plan_tasks`.

---

## Master runner (optional 8th script)

**Script:** `scripts/plan_audits_run_all.py`

- Runs plans 01–07 sequentially (subprocess).
- Writes `artifacts/plan_audits/LATEST_MASTER_SUMMARY.md` with pass/fail per plan.
- Exit code non-zero if any plan has `blocker` severity findings.

---

## Execution order for Claude

1. Implement `scripts/lib/plan_audit_common.py` (copy patterns from `audit_run_spine_linkage.py`).
2. Implement **Plan 01** and **Plan 04** first (spine + tools — highest overlap).
3. Plan 02, 03, 05 (routing + prompts + context).
4. Plan 06, 07 (governance + ship gates).
5. `plan_audits_run_all.py`.

---

## Anti-patterns (do not do in audit scripts)

- Hardcode `tenant_id`, `workspace_id`, `ws_*`, `au_*` in SQL filters (use aggregates only).
- Write to D1 except optional `--register-finding` mode (default **read-only**).
- Scan `~/Downloads` or backup trees under `scripts/patch_results/` as primary evidence.
- Mark plan tasks `done` from script output (human / Worker lifecycle only).

---

## Quick reference — canonical tables per concern

| Concern | Table(s) |
|---------|----------|
| Chat turn container | `agentsam_agent_run` |
| Per-tool steps | `agentsam_tool_call_log` |
| Model pick (Thompson) | `agentsam_routing_arms` + `agentsam_model_catalog` |
| Route policy | `agentsam_prompt_routes` + `agentsam_route_requirements` |
| Prompt bodies | `agentsam_prompt_versions` |
| Prompt cache index | `agentsam_prompt_cache_keys` (target read-through) |
| Legacy chat tool workflow label | `agentsam_workflow_runs.workflow_key = 'agent_chat_tool_session'` |
| Eval loop | `agentsam_eval_suites` → `cases` → `runs` → `model_drift_signals` |
| Mode UX (legacy) | `agent_mode_configs` (shrink, not routing) |

---

*Generated for Plans 1–7 execution prep. Update when sprint `plan_id` rotates.*
