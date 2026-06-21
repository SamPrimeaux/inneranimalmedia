# Deep Search Agent

**Skill key:** `deep_search`  
**Slash trigger:** `/research`  
**Scope:** workspace  
**Task types:** `plan`, `agent`

## Purpose

Two-phase cited research report: Phase 1 produces a structured plan with approval gate; Phase 2 executes per-section research with critic retry loop, then composes a final markdown report. Section findings are staged in `pipeline_kv` and aggregated in `merged_output.sections`. Output lands in R2 at `reports/{workspace_id}/{spawn_job_id}/report.md` plus a `content_items` row.

## Orchestration sequence

1. **Parent run** — User invokes `/research` with topic. Create parent `agentsam_agent_run` + `agentsam_spawn_job`:
   - `master_agent_slug` = `deep_search`
   - `subagent_slug` = `research_planner`
   - `merged_output.topic` = stripped slash message
   - `status` = `pending`

2. **research_planner** — Phase 1 plan with approval gate:
   - Generate plan JSON with `[RESEARCH]` and `[DELIVERABLE]` goals
   - Patch `merged_output.plan`
   - Set `pending_approval` = `plan`
   - **STOP** — user replies **approve** (`plan_approved` = true) to enter Phase 2

3. **research_outliner** — Structural scaffold (Phase 2 start):
   - Convert approved plan → `merged_output.outline[]` (section titles + research questions)
   - Set `phase` = `research`

4. **section_researcher** + **research_critic** — Per-section loop:
   - For each outline section (sequential in orchestrator):
     - **Researcher:** internal Vectorize + web search; write findings to `pipeline_kv` and section object
     - **Critic:** gap analysis; set `needs_retry`, `followups[]`, increment `search_iterations`
   - Stop section loop when `search_iterations >= max_search_iterations` (default **5**)
   - Aggregate into `merged_output.sections[]` and `merged_output.sources[]`

5. **report_composer** — Final report:
   - Compose cited markdown from outline + sections + sources
   - Write `content_items` row + R2 `reports/{workspace_id}/{spawn_job_id}/report.md`
   - Patch `merged_output.report_r2_key`, `content_item_id`
   - `status` = `completed`

## Loop state (`agentsam_spawn_job`)

| Field | Usage |
|-------|--------|
| `master_run_id` | Parent `agentsam_agent_run.id` |
| `master_agent_slug` | `deep_search` |
| `subagent_slug` | Current step (section loop reuses researcher/critic) |
| `subagents_spawned` | Section + retry counter |
| `merged_output` | JSON handoff (see below) |
| `status` | `pending` → `awaiting_approval` → `running` → `completed` / `partial` |
| `total_cost_usd` | Search + composition cost |

### `merged_output` shape

```json
{
  "phase": "completed",
  "topic": "Edge AI agent market landscape 2026",
  "plan": {
    "goals": [
      { "type": "RESEARCH", "description": "Map major edge AI platforms" },
      { "type": "DELIVERABLE", "description": "Executive summary with citations" }
    ]
  },
  "plan_approved": true,
  "outline": [
    { "title": "Market Overview", "questions": ["Who are the leaders?", "What is TAM?"] }
  ],
  "sections": [
    {
      "title": "Market Overview",
      "idx": 0,
      "findings": { "summary": "...", "sources": [{ "title": "...", "url": "..." }] },
      "passed": true
    }
  ],
  "sources": [{ "title": "...", "url": "..." }],
  "followups": [],
  "search_iterations": 2,
  "report_r2_key": "reports/ws_inneranimalmedia/job_xyz/report.md",
  "content_item_id": "ci_report_abc",
  "pending_approval": null
}
```

## D1 tables

| Table | Role |
|-------|------|
| `agentsam_spawn_job` | Plan, outline, sections, report R2 key |
| `pipeline_kv` | Per-section research findings (keyed by spawn job + section idx) |
| `content_items` | Final report metadata row |
| `content_revisions` | Optional revision history if report is edited post-compose |

## Vector lanes

| Step | Lane | Filter |
|------|------|--------|
| Section research | DOCUMENTS | `source_type IN ('knowledge','clients','roadmap','workflows')` |
| Section research | CODE | technical topics — implementation references |
| Section research | EXTERNAL | web search for current data and citations |
| Composer | DOCUMENTS | internal refs for cross-linking |

**Not used:** MEDIA lane unless report embeds generated visuals.

## Sub-agent slugs

- `research_planner`
- `research_outliner`
- `section_researcher` (parallelizable at profile level; orchestrator runs per-section sequentially)
- `research_critic`
- `report_composer`

## Config (D1 only — no .env)

| Setting | Location | Key / field |
|---------|----------|-------------|
| Plan approval | `agentsam_skill.metadata_json` | `pause_for_plan_approval` (default **true**) |
| Max search iterations | `agentsam_skill.metadata_json` | `max_search_iterations` (default **5**) |
| Output format | `agentsam_skill.metadata_json` | `output_format`: `markdown_report` |
| Pipeline | `agentsam_skill.metadata_json` | `pipeline` — 5 slugs above |
| R2 path | orchestrator convention | `reports/{workspace_id}/{spawn_job_id}/report.md` |
| pipeline_kv key | sub-agent convention | `{spawn_job_id}:section:{idx}` |

## Verification

```bash
# Skill metadata
# D1: SELECT metadata_json FROM agentsam_skill WHERE id = 'skill_deep_search';

# Sub-agent profiles
# D1: SELECT slug, is_parallelizable FROM agentsam_subagent_profile WHERE slug IN ('research_planner','research_outliner','section_researcher','research_critic','report_composer');

# Section findings in pipeline_kv
# D1: SELECT key, value FROM pipeline_kv WHERE key LIKE '%:<spawn_job_id>:%';

# Completed report
# D1: SELECT merged_output FROM agentsam_spawn_job WHERE master_agent_slug = 'deep_search' AND status = 'completed' ORDER BY created_at DESC LIMIT 1;
```
