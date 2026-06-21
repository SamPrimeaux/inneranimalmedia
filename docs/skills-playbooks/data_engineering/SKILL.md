# Data Engineering Agent

**Skill key:** `data_engineering`  
**Slash trigger:** `/dataeng`  
**Scope:** workspace  
**Task types:** `agent`, `debug`

## Purpose

Design, troubleshoot, and execute D1/R2 data pipelines with quality gates. Routes by message intent to `dataeng_pipeline_builder`, `dataeng_troubleshooter`, or `dataeng_transformer`, then always runs `dataeng_quality_checker`. Terminal execution (`agentsam_terminal_local`) requires explicit user approval before running destructive or mutating commands. Outputs tracked in `pipelines`, `pipeline_runs`, `agentsam_scripts`, and `agentsam_quality_reports`.

## Orchestration sequence

1. **Parent run** — User invokes `/dataeng` with build, troubleshoot, or transform request. Create parent `agentsam_agent_run` + `agentsam_spawn_job`:
   - `master_agent_slug` = `data_engineering`
   - Intent routing from message keywords:
     - `troubleshoot` → `dataeng_troubleshooter`
     - `transform` → `dataeng_transformer`
     - default → `dataeng_pipeline_builder`
   - `merged_output.intent` = selected slug
   - `status` = `pending`

2. **Primary sub-agent** (one of three):

   **dataeng_pipeline_builder** — New pipeline design:
   - Query schema via `agentsam_autorag` (`AGENTSAM_VECTORIZE_SCHEMA`) + `agentsam_d1_query`
   - Design pipeline steps; insert `pipelines` + `agentsam_scripts` rows (draft)
   - Propose terminal commands for execution
   - **STOP for approval** before `agentsam_terminal_local` — `pending_approval` = `execute`

   **dataeng_troubleshooter** — Failure diagnosis:
   - Read `pipeline_runs` failures + `agentsam_error_log`
   - Propose script patches to `agentsam_scripts`
   - Re-run with approval gate on terminal execute

   **dataeng_transformer** — SQL/JS transform design:
   - Schema-aware transforms; EXPLAIN via `agentsam_d1_query` before apply
   - Write transform script to `agentsam_scripts`
   - **STOP for approval** before terminal execute

3. **Approval gate** — User replies **approve** (or rejects/modifies). Only then:
   - Execute via `agentsam_terminal_local` or approved D1 writes
   - Insert/update `pipeline_runs` with run_id

4. **dataeng_quality_checker** — Post-run QA (always runs):
   - Null rates, duplicate counts, row count deltas
   - Insert `agentsam_quality_reports` row
   - Patch `merged_output.quality_score`, `quality_passed` (pass ≥ **70**)
   - `status` = `completed` (or `partial` if quality failed)

## Loop state (`agentsam_spawn_job`)

| Field | Usage |
|-------|--------|
| `master_run_id` | Parent `agentsam_agent_run.id` |
| `master_agent_slug` | `data_engineering` |
| `subagent_slug` | Intent slug or `dataeng_quality_checker` |
| `merged_output` | JSON handoff (see below) |
| `status` | `pending` → `awaiting_approval` → `running` → `completed` / `partial` |
| `total_cost_usd` | LLM + terminal execution cost |

### `merged_output` shape

```json
{
  "phase": "build",
  "intent": "dataeng_pipeline_builder",
  "topic": "Backfill agentsam_spawn_job cost totals from agent runs",
  "pipeline_id": "pipe_cost_backfill_001",
  "script_id": "script_backfill_cost_v1",
  "run_id": "prun_20260620_abc",
  "quality_score": 92,
  "quality_passed": true,
  "pending_approval": null
}
```

## D1 tables

| Table | Role |
|-------|------|
| `agentsam_spawn_job` | Intent, pipeline/script/run IDs, quality results |
| `pipelines` | Pipeline definitions (source, target, schedule) |
| `pipeline_runs` | Execution history, status, error messages |
| `agentsam_scripts` | SQL/JS transform and ETL scripts (versioned) |
| `agentsam_quality_reports` | Post-run QA metrics (nulls, dupes, row counts) |
| `agentsam_error_log` | Failure context for troubleshooter |

## Vector lanes

| Step | Lane | Filter |
|------|------|--------|
| Builder / transformer | SCHEMA | table definitions, column types, indexes |
| Builder | DOCUMENTS | `source_type IN ('workflows','knowledge')` — ETL patterns |
| Troubleshooter | CODE | prior pipeline scripts in repo |
| Troubleshooter | DOCUMENTS | runbooks and migration notes |

**Not used:** MEDIA, COURSES lanes.

## Sub-agent slugs

- `dataeng_pipeline_builder`
- `dataeng_troubleshooter`
- `dataeng_transformer`
- `dataeng_quality_checker`

## Config (D1 only — no .env)

| Setting | Location | Key / field |
|---------|----------|-------------|
| Targets | `agentsam_skill.metadata_json` | `targets`: `["d1","r2","pipeline"]` |
| Troubleshoot support | `agentsam_skill.metadata_json` | `supports_troubleshoot`: **true** |
| Pipeline | `agentsam_skill.metadata_json` | `pipeline` — 4 slugs (orchestrator runs intent + quality checker) |
| Quality pass threshold | orchestrator | `quality_score >= 70` → `quality_passed` |
| Terminal approval | sub-agent instructions | required before `agentsam_terminal_local` |
| Intent regex | orchestrator | `troubleshoot` / `transform` keywords in message |

## Verification

```bash
# Skill metadata
# D1: SELECT metadata_json FROM agentsam_skill WHERE id = 'skill_data_engineering';

# Sub-agent profiles (note terminal tool access)
# D1: SELECT slug, allowed_tool_globs FROM agentsam_subagent_profile WHERE slug LIKE 'dataeng_%';

# Latest pipeline run
# D1: SELECT id, pipeline_id, status, error_message FROM pipeline_runs ORDER BY created_at DESC LIMIT 5;

# Quality report
# D1: SELECT quality_score, passed, report_json FROM agentsam_quality_reports ORDER BY created_at DESC LIMIT 1;

# Spawn job from last /dataeng
# D1: SELECT merged_output, status FROM agentsam_spawn_job WHERE master_agent_slug = 'data_engineering' ORDER BY created_at DESC LIMIT 1;
```
