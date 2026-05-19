# Cursor Minimal Agent Sam Handoff

Generated: `2026-05-19T03:48:40Z`

## Read this first

Cursor budget is low. Do not rediscover architecture. Do not run broad DB audits. Do not create new agentsam_* tables unless this file proves a concept is missing.

## Canonical doctrine

```text
Canonical run table: agentsam_agent_run
Canonical run spine: agentsam_agent_run.id
Runtime/SSE/client label agent_run_id means the same value as agentsam_agent_run.id.
Do NOT treat agent_run_id as a separate table.
Do NOT blindly add agent_run_id columns everywhere.
Make runtime/evidence rows traceable to agentsam_agent_run.id using existing columns where possible.
```

## Existing audit facts

- agentsam_* tables: **85**
- agentsam_* rows: **21,146**
- table walk generated_at: `2026-05-19T03:30:30Z`
- table walk JSON: `artifacts/agentsam_db_table_walk/LATEST_AGENTSAM_DB_TABLE_WALK.json`
- closure findings: `artifacts/agentsam_db_table_walk/AGENTSAM_DB_CURSOR_CLOSURE_FINDINGS.md`
- join paths: `artifacts/agentsam_db_table_walk/AGENTSAM_RUN_SPINE_JOIN_PATHS.md`
- platform assessment: `docs/platform_assessment/inneranimalmedia_platform_assessment.md`

## Target table summary

| Table | Rows | Existing link-ish cols | Flags | First columns |
| --- | --- | --- | --- | --- |
| agentsam_agent_run | 586 | id, conversation_id, routing_arm_id, chain_root_id, work_session_id | NO_UPDATED_AT, RUNTIME_TABLE_WITHOUT_OBVIOUS_RUN_LINK | id, user_id, workspace_id, conversation_id, status, trigger, model_id, idempotency_key, error_message, input_tokens, output_tokens, cost_usd, started_at, completed_at, created_at, agent_ai_id, person_uuid, agent_id |
| agentsam_command_run | 334 | id, session_id, conversation_id | NO_UPDATED_AT | id, workspace_id, session_id, conversation_id, user_input, normalized_intent, intent_category, tier_used, model_id, commands_json, result_json, output_text, confidence_score, success, exit_code, duration_ms, input_tokens, output_tokens |
| agentsam_patch_sessions | 19 | id | NO_TENANT_ID, NO_WORKSPACE_ID, NO_UPDATED_AT, NO_FOREIGN_KEYS_REPORTED | id, session_ts, plan_id, task_file, model_used, provider, passed, applied, tok_in, tok_out, cost_usd, latency_ms, fail_reason, created_at |
| agentsam_artifacts | 166 | id, source_run_id, source_session_id, source_message_id, source_workflow_id | NO_FOREIGN_KEYS_REPORTED | id, user_id, tenant_id, workspace_id, name, description, artifact_type, r2_key, public_url, source, tags, is_public, file_size_bytes, created_at, updated_at, workspace_slug, project_key, artifact_status |
| agentsam_execution_steps | 691 | id, execution_id | NO_TENANT_ID, NO_WORKSPACE_ID, NO_UPDATED_AT | id, execution_id, node_key, node_type, status, input_json, output_json, error_json, started_at, completed_at, latency_ms, tokens_in, tokens_out, cost_usd, quality_score, gate_results_json, approval_id, attempt |
| agentsam_mcp_tool_execution | 48 | id, session_id, workflow_id, tool_chain_id | NO_UPDATED_AT, NO_FOREIGN_KEYS_REPORTED | id, tool_id, tool_name, input_tokens, output_tokens, duration_ms, cost_usd, success, error_message, created_at, tenant_id, session_id, user_id, workflow_id, input_json, requires_approval, retry_count, output_json |
| agentsam_tool_call_log | 47 | id, session_id, workflow_id, span_id, trace_id, routing_arm_id | NO_UPDATED_AT, NO_FOREIGN_KEYS_REPORTED | id, tenant_id, session_id, tool_name, status, duration_ms, error_message, cost_usd, input_tokens, output_tokens, created_at, agent_id, user_id, workflow_id, tool_category, input_summary, output_summary, retry_count |
| agentsam_execution_context | 167 | id, command_run_id | NO_UPDATED_AT, RUNTIME_TABLE_WITHOUT_OBVIOUS_RUN_LINK | id, tenant_id, workspace_id, command_run_id, todo_id, cwd, files_json, recent_error, goal, extra_json, context_tokens, created_at, execution_step_id |
| agentsam_error_log | 112 | id, session_id, source_id | NO_UPDATED_AT, NO_FOREIGN_KEYS_REPORTED | id, workspace_id, tenant_id, session_id, error_code, error_type, error_message, source, source_id, context_json, stack_trace, resolved, created_at |
| agentsam_usage_events | 457 | id, session_id, ref_table, ref_id, routing_arm_id, conversation_id | NO_UPDATED_AT, NO_FOREIGN_KEYS_REPORTED | id, tenant_id, workspace_id, user_id, session_id, agent_name, provider, model, tokens_in, tokens_out, cost_usd, status, tool_name, reason, ref_table, ref_id, created_at, ai_model_id |
| agentsam_script_runs | 60 | id | NO_TENANT_ID, NO_UPDATED_AT, RUNTIME_TABLE_WITHOUT_OBVIOUS_RUN_LINK | id, script_id, workspace_id, triggered_by, trigger_source, cicd_run_id, git_commit_sha, git_branch, environment, status, exit_code, duration_ms, output_summary, error_message, cost_usd, started_at, completed_at, created_at |

## P0 tasks only

1. Stop general chat from being inserted into `agentsam_command_run`. This table should be command/tool/terminal intent only.
2. Locate writer(s) for `agentsam_patch_sessions`. If it is only smoke/legacy, do not use it for Cursor diff/apply.
3. Standardize `agentsam_artifacts.source_run_id = agentsam_agent_run.id` for generated reports/screenshots/outputs.
4. Pick `agentsam_tool_call_log` as generic tool-call ledger; use `agentsam_mcp_tool_execution` for MCP-specific details.
5. Fix MCP execution logging so `tool_key` and either `agentsam_mcp_tools_id` or `agentsam_tools_id` are populated. `tool_id` may remain legacy if documented.
6. For errors, standardize `agentsam_error_log.source='agentsam_agent_run'` and `source_id=agentsam_agent_run.id` when run-related.
7. For usage, standardize `agentsam_usage_events.ref_table='agentsam_agent_run'` and `ref_id=agentsam_agent_run.id` when run-related.

## Do not spend budget on

- New dashboard page.
- New broad database audit.
- New agentsam_* runtime tables.
- Renaming agentsam_agent_run.
- Adding agent_run_id columns blindly.
- Refactoring all telemetry tables.
- Touching catalog/config tables just because they have no run link.

## Local code search results

### `INSERT INTO agentsam_agent_run`

```text
scripts/build_cursor_minimal_handoff.py:51:    "INSERT INTO agentsam_agent_run",
src/api/cursor-agent.js:76:        INSERT INTO agentsam_agent_run
scripts/d1-refinements-optional-post-audit.sql:20:INSERT INTO agentsam_agent_run (id, user_id, workspace_id, conversation_id, status, trigger, created_at, completed_at)
src/core/resolveModel.js:371:  `INSERT INTO agentsam_agent_run (id, user_id, status, trigger, started_at, created_at)
src/core/agent-run-routing.js:198:          `INSERT INTO agentsam_agent_run (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
src/core/agent-run-routing.js:350:          `INSERT INTO agentsam_agent_run (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
```

### `INSERT INTO agentsam_command_run`

```text
scripts/build_cursor_minimal_handoff.py:52:    "INSERT INTO agentsam_command_run",
src/api/command-run-telemetry.js:550:          `INSERT INTO agentsam_command_run
src/api/command-run-telemetry.js:819:          `INSERT INTO agentsam_command_run
scripts/agentsam-cms-3-theme-matrix.mjs:307:    INSERT INTO agentsam_command_run (
scripts/smoke-agentsam-openai-graph-e2e.mjs:356:    INSERT INTO agentsam_command_run (
scripts/smoke/smoke_command_pipeline.py:176:        """INSERT INTO agentsam_command_run
src/core/agent-terminal-run.js:192:        `INSERT INTO agentsam_command_run
src/core/agentsam-task-executor.js:170:        `INSERT INTO agentsam_command_run
src/core/agentsam-planner.js:523:          `INSERT INTO agentsam_command_run
src/tools/terminal-dispatch.js:96:            `INSERT INTO agentsam_command_run
```

### `INSERT INTO agentsam_patch_sessions`

```text
scripts/build_cursor_minimal_handoff.py:53:    "INSERT INTO agentsam_patch_sessions",
```

### `INSERT INTO agentsam_artifacts`

```text
src/api/agent.js:353:              `INSERT INTO agentsam_artifacts
src/api/agent.js:362:              `INSERT INTO agentsam_artifacts
scripts/rebuild_all_agentsam_artifacts.py:312:    return f"INSERT INTO agentsam_artifacts ({cols}) VALUES ({vals});"
scripts/smoke/agentsam_full_mirrored_eval_series.py:924:INSERT INTO agentsam_artifacts (
scripts/build_cursor_minimal_handoff.py:54:    "INSERT INTO agentsam_artifacts",
scripts/agentsam-cms-3-theme-matrix.mjs:266:    INSERT INTO agentsam_artifacts (
scripts/e2e/openai-website-build-e2e.mjs:405:    INSERT INTO agentsam_artifacts (
scripts/patch_results/backups/20260516_160912/src/api/agent.js:348:              `INSERT INTO agentsam_artifacts
scripts/patch_results/backups/20260516_160912/src/api/agent.js:357:              `INSERT INTO agentsam_artifacts
scripts/study-agentsam-commands-for-scripts.mjs:101:INSERT INTO agentsam_artifacts (
src/core/agentsam-plan-excalidraw-artifact.js:105:    .prepare(`INSERT INTO agentsam_artifacts (${names.join(', ')}) VALUES (${ph.join(', ')})`)
```

### `INSERT INTO agentsam_execution_steps`

```text
scripts/audit_agentsam_full.py:532:     r'INSERT INTO agentsam_execution_steps',
src/core/workspace-capability-actions/index.js:266:  const sql = `INSERT INTO agentsam_execution_steps (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})`;
src/api/agent.js:3233:              `INSERT INTO agentsam_execution_steps (${parts.join(', ')}) VALUES (${vals.join(', ')})`,
scripts/build_cursor_minimal_handoff.py:55:    "INSERT INTO agentsam_execution_steps",
src/core/agent-chat-tool-execution-ledger.js:212:  const sql = `INSERT INTO agentsam_execution_steps (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})`;
scripts/agentsam-cms-3-theme-matrix.mjs:324:    INSERT INTO agentsam_execution_steps (
src/core/workflow-executor.js:648:  const sql = `INSERT INTO agentsam_execution_steps (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})`;
src/core/agentsam-planner.js:350:    .prepare(`INSERT INTO agentsam_execution_steps (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})`)
scripts/smoke-agentsam-openai-graph-e2e.mjs:315:    INSERT INTO agentsam_execution_steps (
scripts/patch_results/backups/20260516_160912/src/api/agent.js:3187:              `INSERT INTO agentsam_execution_steps (${parts.join(', ')}) VALUES (${vals.join(', ')})`,
```

### `INSERT INTO agentsam_mcp_tool_execution`

```text
scripts/build_cursor_minimal_handoff.py:56:    "INSERT INTO agentsam_mcp_tool_execution",
migrations/325_agentsam_strip_iam_hardcoded_defaults.sql:195:INSERT INTO agentsam_mcp_tool_execution_new SELECT * FROM agentsam_mcp_tool_execution;
```

### `INSERT INTO agentsam_tool_call_log`

```text
src/api/mcp.js:136:        `INSERT INTO agentsam_tool_call_log
src/api/workflow/summary.js:166:      INSERT INTO agentsam_tool_call_log
src/api/workflow/summary.js:180:      INSERT INTO agentsam_tool_call_log
scripts/build_cursor_minimal_handoff.py:57:    "INSERT INTO agentsam_tool_call_log",
src/core/agent-terminal-run.js:47:        `INSERT INTO agentsam_tool_call_log
src/core/agentsam-ops-ledger.js:221:        `INSERT INTO agentsam_tool_call_log (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
src/tools/db.js:37:      `INSERT INTO agentsam_tool_call_log
```

### `INSERT INTO agentsam_execution_context`

```text
src/api/command-run-telemetry.js:686:            `INSERT INTO agentsam_execution_context
scripts/audit_agentsam_full.py:276:        'caller_pattern': r'INSERT INTO agentsam_execution_context',
scripts/build_cursor_minimal_handoff.py:58:    "INSERT INTO agentsam_execution_context",
migrations/272_execution_chain_alignment.sql:48:INSERT INTO agentsam_execution_context_new SELECT
```

### `INSERT INTO agentsam_error_log`

```text
scripts/build_cursor_minimal_handoff.py:59:    "INSERT INTO agentsam_error_log",
scripts/record-d1-deploy-complete.mjs:63:    `INSERT INTO agentsam_error_log (${parts.join(', ')}) VALUES (${vals.join(', ')})`,
scripts/smoke/smoke_command_pipeline.py:110:            """INSERT INTO agentsam_error_log
scripts/record-d1-deploy-failure.mjs:90:    `INSERT INTO agentsam_error_log (${parts.join(', ')}) VALUES (${vals.join(', ')})`,
src/core/agentsam-error-log.js:62:          `INSERT INTO agentsam_error_log (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
```

### `INSERT INTO agentsam_usage_events`

```text
scripts/audit_agentsam_full.py:559:     r'writeUsageEvent|INSERT INTO agentsam_usage_events',
scripts/build_cursor_minimal_handoff.py:60:    "INSERT INTO agentsam_usage_events",
scripts/agentsam_routing_repair.py:373:       AND INSERT INTO agentsam_usage_events (model_key, event_type, routing_arm_id, ...)
scripts/study-agentsam-commands-for-scripts.mjs:221:INSERT INTO agentsam_usage_events (
scripts/smoke/smoke_register_workflow.py:297:             d1_exec('''INSERT INTO agentsam_usage_events
scripts/smoke/smoke_todo_fix.py:557:        d1_exec("""INSERT INTO agentsam_usage_events
src/api/telemetry.js:173:        `INSERT INTO agentsam_usage_events (
src/api/telemetry.js:200:        `INSERT INTO agentsam_usage_events (
src/api/telemetry.js:317:      `INSERT INTO agentsam_usage_events (
src/core/usage-event-writer.js:61:      INSERT INTO agentsam_usage_events (
```

### `INSERT INTO agentsam_script_runs`

```text
scripts/build_cursor_minimal_handoff.py:61:    "INSERT INTO agentsam_script_runs",
src/core/agentsam-script-runs.js:42:        `INSERT INTO agentsam_script_runs (
scripts/run-with-agentsam-script-telemetry.mjs:83:  const insertSql = `INSERT INTO agentsam_script_runs (
migrations/325_agentsam_strip_iam_hardcoded_defaults.sql:131:INSERT INTO agentsam_script_runs_new SELECT * FROM agentsam_script_runs;
```

### `agentsam_command_run`

```text
scripts/sql/upsert-agentsam-project-context-universal-runtime.sql:103:    "agentsam_command_run",
scripts/audit_agentsam_full.py:208:    'agentsam_command_run':                   ['workspace_id', 'tenant_id'],
src/api/analytics/agent.js:274:  const crCols = await pragmaTableInfo(db, 'agentsam_command_run');
src/api/analytics/agent.js:282:         FROM agentsam_command_run cr
src/api/analytics/agent.js:333:      agentsam_command_run: hasCommandRun,
scripts/agentsam-command-workflow-designer.py:8:  agentsam_command_runs, agentsam_workflows, agentsam_mcp_workflows,
scripts/agentsam-command-workflow-designer.py:64:    "agentsam_command_runs",
scripts/agentsam-command-workflow-designer.py:483:    for table in ["agentsam_command_runs", "agentsam_workflow_runs", "agentsam_tool_chain", "agentsam_usage_events", "agentsam_analytics"]:
scripts/agentsam-command-workflow-designer.py:828:        "command_refs": grep(r"agentsam_commands|agentsam_command_pattern|agentsam_slash_commands|command_runs|agentsam_command_runs"),
scripts/agentsam-command-workflow-designer.py:941:            "tables": ["agentsam_command_runs", "agentsam_workflow_runs", "agentsam_tool_chain", "agentsam_usage_events", "agentsam_analytics"],
migrations/271_approval_queue_lock_chain.sql:14:  command_run_id  TEXT    REFERENCES agentsam_command_run(id)     ON DELETE SET NULL,
scripts/reports/pipeline_e2e_20260514T001913.json:256:    "agentsam_command_run": {
scripts/reports/pipeline_e2e_20260514T001913.json:257:      "table": "agentsam_command_run",
scripts/reports/pipeline_e2e_20260514T001913.json:634:    "agentsam_command_run": {
scripts/reports/pipeline_e2e_20260514T001913.json:635:      "table": "agentsam_command_run",
src/api/agent.js:8559:        .prepare(`UPDATE agentsam_command_run SET approval_status = 'approved' WHERE id = ?`)
src/api/agent.js:8587:        .prepare(`UPDATE agentsam_command_run SET approval_status = 'denied' WHERE id = ?`)
src/api/agent.js:8725:          .prepare(`UPDATE agentsam_command_run SET approval_status = 'approved' WHERE id = ?`)
docs/learn/r2-course-library-readme.md:312:agentsam_command_run
scripts/build_cursor_minimal_handoff.py:38:    "agentsam_command_run",
scripts/build_cursor_minimal_handoff.py:52:    "INSERT INTO agentsam_command_run",
scripts/build_cursor_minimal_handoff.py:62:    "agentsam_command_run",
scripts/build_cursor_minimal_handoff.py:199:    lines.append("1. Stop general chat from being inserted into `agentsam_command_run`. This table should be command/tool/terminal intent only.")
scripts/build_cursor_minimal_handoff.py:228:    lines.append("- A normal chat message does not create an `agentsam_command_run` row.")
docs/learn/LEARNING_OS_RECONCILIATION.md:199:    agentsam_command_run
scripts/audit_agentsam_only_d1_and_codebase.py:50:    "agentsam_command_run",
docs/learn/courses/software-engineering-builder-os.md:75:    agentsam_command_run
src/api/command-run-telemetry.js:2: * agentsam_command_run + agentsam_execution_context — async telemetry (waitUntil).
src/api/command-run-telemetry.js:13:/** Must match CHECK on agentsam_command_run.intent_category (or NULL). */
src/api/command-run-telemetry.js:380:      'daily', 'agentsam_command_run',
src/api/command-run-telemetry.js:550:          `INSERT INTO agentsam_command_run
src/api/command-run-telemetry.js:819:          `INSERT INTO agentsam_command_run
docs/platform_assessment/inneranimalmedia_platform_assessment.md:412:| terminal | `agentsam_command_run`, terminal history/session tables if outside `agentsam_` prefix |
docs/source-map.md:200:- `agentsam_command_run`
src/api/overview.js:193:       FROM agentsam_command_run
src/api/overview.js:201:       FROM agentsam_command_run
src/api/overview.js:210:       FROM agentsam_command_run
scripts/build_agentsam_cursor_gap_pack.py:201:    "agentsam_command_run",
src/api/dashboard.js:492:                    "UPDATE agentsam_command_run SET status = ?, completed_at = ?, output_text = COALESCE(?, output_text), exit_code = COALESCE(?, exit_code) WHERE id = ?"
src/core/agentsam-plan-supabase-public-sync.js:368:            .prepare(`SELECT * FROM agentsam_command_run WHERE id IN (${placeholders})`)
src/core/agent-terminal-run.js:192:        `INSERT INTO agentsam_command_run
docs/db-audit/timestamp_audit_20260513T212528.md:80:| `agentsam_command_run` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
docs/db-audit/timestamp_canonical_map.json:62:  "agentsam_command_run": {
scripts/agentsam-cms-3-theme-matrix.mjs:307:    INSERT INTO agentsam_command_run (
docs/db-audit/agentsam_audit_20260514T040915.md:603:### `agentsam_command_run` — 280 rows
docs/db-audit/agentsam_audit_20260514T040915.md:1801:| `agentsam_approval_queue` | `command_run_id` | `agentsam_command_run` | ✅ 0 | 0.0% |
docs/db-audit/agentsam_audit_20260513T211935.md:571:### `agentsam_command_run` — 181 rows
src/core/agentsam-task-executor.js:106:      .prepare(`SELECT approval_status FROM agentsam_command_run WHERE id = ? LIMIT 1`)
src/core/agentsam-task-executor.js:170:        `INSERT INTO agentsam_command_run
src/core/agentsam-task-executor.js:328:    .prepare(`SELECT * FROM agentsam_command_run WHERE id = ? LIMIT 1`)
src/core/agentsam-task-executor.js:349: * Opt-in terminal: only after an approved agentsam_command_run, or executeCommand() did not
src/core/agentsam-task-executor.js:381:      .prepare(`SELECT selected_command_id FROM agentsam_command_run WHERE id = ? LIMIT 1`)
src/core/agentsam-task-executor.js:395:        '[terminal] NOT EXECUTED: link an approved agentsam_command_run (set plan task command_run_id after approval), or set handler_key to an agentsam_commands.id so the command approval gate can run.',
src/core/agentsam-task-executor.js:1022:                  `UPDATE agentsam_command_run SET approval_status = 'approved', success = 1, exit_code = 0, duration_ms = ?, output_text = ?, error_message = NULL WHERE id = ?`,
src/core/agentsam-task-executor.js:1029:                  `UPDATE agentsam_command_run SET approval_status = 'approved', success = 0, exit_code = COALESCE(exit_code, 1), duration_ms = ?, error_message = ? WHERE id = ?`,
scripts/agentsam-true-e2e-workflow-runner.py:19:       agentsam_command_run
scripts/agentsam-true-e2e-workflow-runner.py:100:    "agentsam_command_run",
scripts/agentsam-true-e2e-workflow-runner.py:557:    statements.append(insert_sql("agentsam_command_run", command_run_values, schemas))
scripts/agentsam-true-e2e-workflow-runner.py:754:LEFT JOIN agentsam_command_run r ON r.id=a.command_run_id
docs/audits/agentsam/agentsam_audit_20260508T061622Z.json:2314:    "table": "agentsam_command_run",
docs/audits/agentsam/agentsam_audit_20260508T061622Z.json:2323:      "sqlite_autoindex_agentsam_command_run_1",
docs/audits/agentsam/agentsam_audit_20260508T061622Z.json:2324:      "idx_agentsam_command_run_workspace",
docs/audits/agentsam/agentsam_audit_20260508T061622Z.json:2325:      "idx_agentsam_command_run_created",
docs/audits/agentsam/agentsam_audit_20260508T061622Z.json:2326:      "idx_agentsam_command_run_selected_command",
docs/audits/agentsam/agentsam_audit_20260508T061622Z.json:2327:      "idx_agentsam_command_run_workspace_created"
docs/audits/agentsam/agentsam_audit_20260508T061622Z.json:2819:      "JOIN to agentsam_command_run for 'commands never executed' detection"
docs/audits/agentsam/agentsam_audit_20260508T061622Z.json:11271:      "JOIN to agentsam_command_run for usage frequency"
docs/audits/agentsam/agentsam_SUGGESTIONS_20260508T061622Z.md:63:## `agentsam_command_run`  🟢 ACTIVE
docs/audits/agentsam/agentsam_SUGGESTIONS_20260508T061622Z.md:1411:- JOIN to agentsam_command_run for 'commands never executed' detection
docs/audits/agentsam/agentsam_SUGGESTIONS_20260508T061622Z.md:2014:- JOIN to agentsam_command_run for usage frequency
docs/audits/agentsam/agentsam_audit_20260508T061622Z.txt:10:  agentsam_command_run                                    rows=76         last=3.1h ago      idx=5
docs/audits/agentsam/agentsam_audit_20260508T061622Z.txt:114:  agentsam_command_run: missing ['command_id', 'command_slug', 'status', 'started_at', 'model_key']
scripts/generate_source_map.py:83:        "agentsam_plan_tasks","agentsam_approval_queue","agentsam_command_run",
docs/audits/agentsam-chatassistant-workflow-readiness.md:181:- Plain chat persists to chat/session/telemetry/tool-related tables, including `agentsam_command_run`, `agentsam_agent_run`, `agentsam_usage_events`, `agent_costs`, `agentsam_tool_call_log`, MCP execution logs, and `agentsam_tool_chain`.
src/core/memory.js:473:       'agentsam_command_run',
src/core/memory.js:487:     FROM agentsam_command_run acr
src/core/memory.js:585:     FROM agentsam_command_run acr
docs/db/live-inspection/agentsam_execution_performance_metrics.sample.json:739:        "source_table": "agentsam_command_run",
docs/db/live-inspection/agentsam_execution_performance_metrics.sample.json:795:        "source_table": "agentsam_command_run",
docs/db/live-inspection/agentsam_execution_performance_metrics.sample.json:851:        "source_table": "agentsam_command_run",
docs/db/live-inspection/agentsam_execution_performance_metrics.sample.json:907:        "source_table": "agentsam_command_run",
docs/db/live-inspection/agentsam_execution_performance_metrics.sample.json:963:        "source_table": "agentsam_command_run",
docs/db/live-inspection/agentsam_execution_performance_metrics.sample.json:1019:        "source_table": "agentsam_command_run",
docs/db/live-inspection/agentsam_execution_performance_metrics.sample.json:1075:        "source_table": "agentsam_command_run",
docs/db/live-inspection/agentsam_execution_performance_metrics.sample.json:1131:        "source_table": "agentsam_command_run",
docs/db/live-inspection/agentsam_execution_performance_metrics.sample.json:1187:        "source_table": "agentsam_command_run",
docs/db/live-inspection/agentsam_execution_performance_metrics.sample.json:1243:        "source_table": "agentsam_command_run",
docs/db/live-inspection/agentsam_execution_performance_metrics.sample.json:1299:        "source_table": "agentsam_command_run",
docs/db/live-inspection/agentsam_execution_performance_metrics.sample.json:1355:        "source_table": "agentsam_command_run",
scripts/patch_eval_schema.py:18:    "agentsam_command_run":   {"id","tenant_id","workspace_id","selected_command_slug","success","created_at"},
scripts/patch_eval_schema.py:32:    "agentsam_command_run":   {"id","tenant_id","workspace_id","selected_command_slug","created_at"},
scripts/smoke-agentsam-openai-graph-e2e.mjs:356:    INSERT INTO agentsam_command_run (
scripts/smoke-agentsam-openai-graph-e2e.mjs:806:    LEFT JOIN agentsam_command_run cr
scripts/maintenance/execution-performance-rollup-backfill.sql:120:FROM agentsam_command_run acr
docs/db/FRONTEND_GAPS.md:22:- ✅ `agentsam_command_run`
scripts/write_learn_area_readme.py:343:    agentsam_command_run
docs/db/agentsam-d1-context/2026-05-07_agentsam-frontend-gaps.md:48:- `agentsam_command_run` — rows: `69`
docs/db/agentsam-d1-context/2026-05-07_agentsam-index.md:43:| `agentsam_command_run` | 69 | agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, workspace_id,  |
src/api/agentsam.js:330:              .prepare(`SELECT * FROM agentsam_command_run WHERE id IN (${placeholders})`)
scripts/agentsam-agent-chat-plan-workflow.py:74:    "agentsam_command_run",
src/core/agentsam-planner.js:8: *   → agentsam_command_run (risky tasks) → agentsam_plan_tasks → agentsam_approval_queue
src/core/agentsam-planner.js:523:          `INSERT INTO agentsam_command_run
docs/db/agentsam-d1-context/2026-05-07_agentsam-schema.json:1952:      "create_sql": "CREATE TABLE \"agentsam_approval_queue\" (\n  id              TEXT    PRIMARY KEY DEFAULT ('appr_' || lower(hex(randomblob(8)))),\n  tenant_id       TEXT    NOT NULL,\n  workspace_id    TEXT,\n  user_id         TEXT    NOT NULL,\n  session_id      TEXT,\n\n  -- Chain linkage — all three locked with FKs\

...[truncated 193952 chars]
```

### `agentsam_patch_sessions`

```text
scripts/build_cursor_minimal_handoff.py:39:    "agentsam_patch_sessions",
scripts/build_cursor_minimal_handoff.py:53:    "INSERT INTO agentsam_patch_sessions",
scripts/build_cursor_minimal_handoff.py:63:    "agentsam_patch_sessions",
scripts/build_cursor_minimal_handoff.py:200:    lines.append("2. Locate writer(s) for `agentsam_patch_sessions`. If it is only smoke/legacy, do not use it for Cursor diff/apply.")
docs/platform_assessment/inneranimalmedia_platform_assessment.md:414:| patches/diffs | `change_sets`, `change_set_items`, `agentsam_patch_sessions` |
```

### `execute-approved-tool`

```text
docs/codebase-index/ws_inneranimalmedia/route-map.md:205:## POST /api/agent/chat/execute-approved-tool
docs/codebase-index/ws_inneranimalmedia/route-map.md:212:- **Code:** `if (pathLower === '/api/agent/chat/execute-approved-tool' && method === 'POST') {`
scripts/sql/upsert-agentsam-project-context-universal-runtime.sql:171:    "/api/agent/chat/execute-approved-tool",
dashboard/features/agent-chat/ChatAssistant.tsx:982:      const res = await fetch('/api/agent/chat/execute-approved-tool', {
dashboard/features/agent-chat/ChatAssistant.tsx:1007:      console.error('[ChatAssistant] execute-approved-tool', e);
docs/AGENT_SAM_DASHBOARD_TECHNICAL_INVENTORY.md:38:| Tool execution | **Fully working** | Tools from `mcp_registered_tools` (DB). Action tools require approval: stream `tool_approval_request` → UI card → POST `/api/agent/chat/execute-approved-tool` → invokeMcpToolFromChat. See "Tools registered" below. |
docs/AGENT_SAM_DASHBOARD_TECHNICAL_INVENTORY.md:76:3. **Approve:** POST `/api/agent/chat/execute-approved-tool` with `tool_name`, `tool_input`, `conversation_id`; worker calls `invokeMcpToolFromChat` (built-in or MCP remote), returns `{ success, result }`; frontend appends system message with result and clears pending.
docs/AGENT_SAM_DASHBOARD_TECHNICAL_INVENTORY.md:135:- **Worker:** `[agent/chat] model_id`, `[execute-approved-tool] tool_name/tool_input/result`, AISEARCH failures, MCP invoke warnings.
docs/inneranimalmedia-function-index.json:3798:    "purpose": "Invoke MCP tool from chat (same logic as /api/mcp/invoke). Returns { result } or { error }. opts.skipApprovalCheck: when true, skip requires_approval check (caller is execute-approved-tool). opts.suppressTelemetry: when true, skip recordMcpToolCall (workflow runner records its ow",
docs/PLATFORM_TABLES_AUDIT_AND_WIRING.md:12:- **Writer exists but path rarely runs** — e.g. `ai_rag_search_history` only on `/api/search` and `invokeMcpToolFromChat` knowledge_search; `mcp_tool_calls` only for non-builtin tools when invoked via Anthropic/execute-approved-tool.
docs/PLATFORM_TABLES_AUDIT_AND_WIRING.md:175:| Worker read | Many: tool list for chat, boot, execute-approved-tool, knowledge sync, route list. |
docs/inneranimalmedia-function-index.md:1390:- **Purpose:** Invoke MCP tool from chat (same logic as /api/mcp/invoke). Returns { result } or { error }. opts.skipApprovalCheck: when true, skip requires_approval check (caller is execute-approved-tool). opts.suppressTelemetry: when true, skip recordMcpToolCall (workflow runner records its ow
docs/AGENT_SAM_DASHBOARD_FEATURE_STATUS_REPORT.md:75:| **Approval flow** | Working end-to-end | SSE `tool_approval_request` → UI card (Approve / Cancel) → POST `/api/agent/chat/execute-approved-tool` → `invokeMcpToolFromChat`. Works in non-streaming tool loop and in Anthropic streaming (chatWithToolsAnthropic). |
scripts/build_cursor_minimal_handoff.py:64:    "execute-approved-tool",
docs/iam-docs/sessions/2026-03-24-25-platform-sprint-overview.md:111:5. **Cursor Cloud Agents** — E2E: approval flow + `execute-approved-tool` + `cursor_get_agent` poll until terminal state.
docs/audits/agentsam-chatassistant-workflow-readiness.md:328:Also, `ChatAssistant` posts approvals to `/api/agent/chat/execute-approved-tool`, but no backend handler for that path was found under `src/`.
migrations/137_mcp_tool_calls_table.sql:1:-- 137: Create mcp_tool_calls so recordMcpToolCall() and chat/execute-approved-tool can log tool runs.
docs/cursor-session-log.md:171:- `worker.js` **13075–13126**: `invokeMcpToolFromChat` — all three tools before `toolRow` fetch; `cursor_run_agent` blocked unless `opts.skipApprovalCheck` (execute-approved-tool).
docs/agent-api-contract-audit.md:90:| Chat stream, tools, catalog | `dashboard/components/ChatAssistant.tsx` — `/api/agent/chat`, `/api/agent/chat/execute-approved-tool`, `/api/agent/sessions`, `/api/agent/models`, `/api/agent/modes`, `/api/agent/commands`, `/api/agent/context-picker/catalog` |
dashboard/dist/agent-core.js:1114:`,originalContent:""});return}window.open(m,"_blank","noopener,noreferrer")},[c,C]),Wi=v.useCallback(m=>{if(m.type==="thinking_start")P({steps:[],thinkingText:"",status:"thinking",startedAt:Date.now()});else if(m.type==="thinking")P(j=>j&&{...j,thinkingText:(j.thinkingText||"")+(m.text||"")});else if(m.type==="tool_start"){const j=m.tool_name||String(Date.now());P(A=>{const z=A??{steps:[],thinkingText:"",status:"working",startedAt:Date.now()};return z.steps.find(G=>G.id===j)?z:{...z,status:"working",steps:[...z.steps,{id:j,name:j,status:"running"}]}})}else if(m.type==="tool_done"||m.type==="workflow_step"){const j=m.tool_name||"";P(A=>{var ne;if(!A)return A;const G=A.steps.find(te=>te.id===j)?A.steps.map(te=>{var _e;return te.id===j?{...te,status:m.ok===!1?"error":"done",preview:(_e=m.output_preview)==null?void 0:_e.slice(0,120)}:te}):[...A.steps,{id:j,name:j,status:m.ok===!1?"error":"done",preview:(ne=m.output_preview)==null?void 0:ne.slice(0,120)}];return{...A,steps:G}})}else m.type==="tool_error"?P(j=>j&&{...j,steps:j.steps.map(A=>A.id===m.tool_name?{...A,status:"error"}:A)}):m.type==="tool_blocked"||m.type==="approval_required"?(m.command_run_id&&(k==null||k(m.command_run_id)),P(j=>j&&{...j,status:"blocked"})):m.type==="workflow_complete"||m.type==="done"?P(j=>j&&{...j,status:"done"}):(m.type==="workflow_error"||m.type==="error")&&P(j=>j&&{...j,status:"error"})},[k]),el=v.useCallback(async()=>{var j;if(!qe)return;const{tool:m}=qe;Ni(!0);try{if(m.plan_terminal){const{plan_id:te,task_id:_e,command_run_id:Me,approval_id:Nt}=m.plan_terminal,Je=await fetch(`/api/agent/proposals/${encodeURIComponent(Nt)}/approve`,{method:"POST",credentials:"same-origin"});if(!Je.ok){const tt=await Je.text().catch(()=>"");throw new Error(tt||`Approve failed (${Je.status})`)}const et=await fetch("/api/agent/plan-task/resume",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan_id:te,task_id:_e,command_run_id:Me,approval_id:Nt,session_id:ot||void 0,conversationId:ot||void 0})});if(!et.ok||!et.body){const tt=await et.text().catch(()=>"");throw new Error(tt||`Resume failed (${et.status})`)}$t(null),re(!1),fe.current=null,me.current=!1;const yt=et.body.getReader();b.current=yt;const Ot=new AbortController().signal,pr=o.length&&((j=o[o.length-1])==null?void 0:j.role)==="assistant"?String(o[o.length-1].content||""):"";await ma({signal:Ot,reader:yt,streamFinalizedRef:me,streamReaderRef:b,setMessages:s,setIsLoading:re,setWorkflowLedger:it,setToolTraceRows:xt,onPythonDraftOpened:or,setConversationId:gt,stripEmptyAssistantTail:rn,loadSessions:Jt,onBrowserNavigate:d,onR2FileUpdated:p,onThinkingEvent:Wi,onFileSelect:c?tt=>c({name:tt.name,content:tt.content,originalContent:tt.originalContent??""}):void 0,onToolApprovalRequest:()=>{},mergeIntoLastAssistant:!0,initialAssistantBuffer:pr}),b.current=null;const Be=y.current;if(Be.length>0){const tt=Be[0];ke($n=>$n.slice(1)),we.current(tt)}return}const z=await(await fetch("/api/agent/chat/execute-approved-tool",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tool_name:m.name,tool_input:m.parameters??{},conversation_id:ot||void 0})})).json();$t(null);const G=typeof z.result=="string"?z.result:JSON.stringify(z.result??null,null,2),ne=z.success?`
dashboard/dist/agent-core.js:1123:Tool **${m.name}** failed: ${z.error??"unknown error"}`;s(te=>{const _e=[...te],Me=_e[_e.length-1];return(Me==null?void 0:Me.role)==="assistant"&&(_e[_e.length-1]={...Me,content:Me.content+ne}),_e})}catch(A){console.error("[ChatAssistant] execute-approved-tool",A),$t(null);const z=A instanceof Error?A.message:String(A);s(G=>{const ne=[...G],te=ne[ne.length-1];return(te==null?void 0:te.role)==="assistant"&&(ne[ne.length-1]={...te,content:`${te.content}
docs/autorag-knowledge/architecture/worker-routing.md:95:- Conversations, messages, sessions, models, chat streaming, tool execution, boot, file attach, playwright job polling, `execute-approved-tool`, spend telemetry, context index search logging, etc.
docs/FUNCTIONALITY_AUDIT_REPORT.md:97:| **Current state** | Functional. Worker streams `tool_approval_request` with tool name/description/parameters/preview; frontend sets `pendingToolApproval`. Card shows; Approve calls POST `/api/agent/chat/execute-approved-tool` with `tool_name` and `tool_input`; worker runs the tool and returns result; frontend clears pending and appends a system message with the result. **Cancel:** `setPendingToolApproval(null)` — no extra API; conversation continues without running the tool. |
docs/AGENT_SAM_ASSESSMENT.md:184:| /api/agent/chat/execute-approved-tool | POST | 3976 |
docs/worker-function-index.json:2860:    "purpose": "Invoke MCP tool from chat (same logic as /api/mcp/invoke). Returns { result } or { error }. opts.skipApprovalCheck: when true, skip requires_approval check (caller is execute-approved-tool). opts.suppressTelemetry: when true, skip recordMcpToolCall (workflow runner records its ow",
docs/KNOWLEDGE_SEARCH_SLOW_ANALYSIS_AND_FAST_PATH.md:10:| **invokeMcpToolFromChat** (MCP/execute-approved-tool path) | Same tool by name | Lines 4526-4600 |
docs/MCP_TOOL_CALLS_AND_TERMINAL_HISTORY_LOGGING.md:9:### Path A: `recordMcpToolCall(env, opts)` (canonical for chat + execute-approved-tool)
docs/MCP_TOOL_CALLS_AND_TERMINAL_HISTORY_LOGGING.md:13:  - POST `/api/agent/chat/execute-approved-tool`
docs/MCP_TOOL_CALLS_AND_TERMINAL_HISTORY_LOGGING.md:45:   If for some reason `env.DB` is not set on the request that runs `invokeMcpToolFromChat` (e.g. execute-approved-tool), `recordMcpToolCall` returns immediately and no INSERT runs. In normal deployment the fetch handler receives the same `env` (including D1 binding `DB`), so this is less likely if other DB reads/writes work.
scripts/repo_inventory_20260513T145148.txt:79:  /api/agent/chat/execute-approved-tool
scripts/audit_agent_remaster_report.md:73:  - L843: `console.error('[ChatAssistant] execute-approved-tool', e);`
docs/METRICS_QUIZ_AND_TRACKING_CHECKLIST.md:72:  **Yes** only if you test via (1) Anthropic model with tool use (e.g. “use knowledge_search to find X”), or (2) POST /api/agent/chat/execute-approved-tool with tool_name=knowledge_search.  
docs/METRICS_QUIZ_AND_TRACKING_CHECKLIST.md:82:- [ ] **execute-approved-tool:** Call POST /api/agent/chat/execute-approved-tool with tool_name=knowledge_search, tool_input={query: "agent modes"}; expect mcp_tool_calls row.
docs/METRICS_QUIZ_AND_TRACKING_CHECKLIST.md:118:| 4. knowledge_search **tool** (Anthropic or execute-approved-tool) | Yes |
docs/METRICS_QUIZ_AND_TRACKING_CHECKLIST.md:126:- [ ] **knowledge_search via invokeMcpToolFromChat:** Use Anthropic and a prompt that triggers knowledge_search, or call execute-approved-tool; expect one row per invocation.
docs/METRICS_QUIZ_AND_TRACKING_CHECKLIST.md:187:- [ ] Invoke knowledge_search via Anthropic (tool use) or execute-approved-tool; mcp_tool_calls has a row with tool_name = 'knowledge_search'.
docs/METRICS_QUIZ_AND_TRACKING_CHECKLIST.md:194:- [ ] knowledge_search via invokeMcpToolFromChat (Anthropic or execute-approved-tool); ai_rag_search_history has a new row.
docs/METRICS_QUIZ_AND_TRACKING_CHECKLIST.md:216:- **mcp_tool_calls:** knowledge_search writes only when invoked via invokeMcpToolFromChat (Anthropic tool use or execute-approved-tool), not via runToolLoop.
scripts/audit/iam_audit_chunks.ndjson:127:{"id": "e4d5fe0636a2", "section": "OTHER", "title": "File: artifacts/key_hygiene_audit/key_hygiene_audit.json", "text": "[SECTION:OTHER] File: artifacts/key_hygiene_audit/key_hygiene_audit.json\n\nFile: artifacts/key_hygiene_audit/key_hygiene_audit.json (28739 lines, 33296.8 KB)\nComponents: THRESHOLD, AgentTab, OverviewPage, BK, WorkflowPanel, ErrorInbox, RagHealth, DAYS, ORIGIN, COUNT, DB, DRY\nAPI routes: /api/agent/alignment-sync, /api/agent/allowlist, /api/agent/approval/pending, /api/agent/boot, /api/agent/bootstrap, /api/agent/chat, /api/agent/chat/execute-approved-tool\\\\\\, /api/

...[truncated 11001 chars]
```

### `/api/fs/list`

```text
scripts/build_cursor_minimal_handoff.py:65:    "/api/fs/list",
src/tools/fs.js:17:      // For this dashboard, we primarily use the /api/fs/list endpoint
src/tools/fs.js:19:      const res = await fetch(`${origin}/api/fs/list`, {
```

### `/api/fs/read`

```text
scripts/build_cursor_minimal_handoff.py:66:    "/api/fs/read",
src/tools/fs.js:44:      const res = await fetch(`${origin}/api/fs/read`, {
```

### `/api/fs/write`

```text
scripts/build_cursor_minimal_handoff.py:67:    "/api/fs/write",
src/tools/fs.js:63:      const res = await fetch(`${origin}/api/fs/write`, {
```

## Acceptance criteria

- A normal chat message does not create an `agentsam_command_run` row.
- A real command/tool approval does create the correct runtime/evidence row.
- A generated artifact can be traced by `agentsam_artifacts.source_run_id` to `agentsam_agent_run.id`.
- A tool call can be traced through `agentsam_tool_call_log` by tool_key/handler_key/route_key and session/workflow/run evidence.
- MCP tool executions populate registry identity via `tool_key` and/or `agentsam_mcp_tools_id` / `agentsam_tools_id`.
- Errors and usage events point back through existing `source/source_id` or `ref_table/ref_id` conventions.

## Final instruction

Make the smallest patch that fixes P0. Report exact files changed and smoke commands. Do not broaden scope.