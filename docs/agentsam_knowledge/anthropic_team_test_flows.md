# Anthropic specialized team — Phase-1 test flows

**Training workspace:** `ws_inneranimalmedia`  
**Quickstart batch label:** `anthropic_smoketest_quickstart`  
**Migration:** `migrations/353_anthropic_team_phase1_routing_seed.sql` (+ `352` quickstart gallery)

This doc is for **agents writing test flows** (manual QA, eval scripts, Playwright). Treat Haiku / Sonnet / Opus as three roles — not interchangeable.

---

## Active models only (no legacy)

| Logical `model_key` | API `anthropic_model_id` | Role | Auto Thompson? | Approval? |
|---------------------|--------------------------|------|----------------|-----------|
| `anthropic_haiku_4_5` | `claude-haiku-4-5-20251001` | Scout | Yes | No |
| `anthropic_sonnet_4_6` | `claude-sonnet-4-6` | Builder | Yes | No |
| `anthropic_opus_4_7` | `claude-opus-4-7` | Boss | **No** (`is_eligible=0`) | **Yes** |

**Retired for routing:** Sonnet 4.5, Opus 4.5/4.6, dot-notation Haiku keys, and any arm not using the three `anthropic_*` keys above.

Policy metadata lives in **`agentsam_model_catalog`** columns (migration **354**):

| Column | Haiku | Sonnet | Opus |
|--------|-------|--------|------|
| `routing_lane` | `scout` | `workhorse` | `orchestrator` |
| `context_window` | 200000 | 1000000 | 1000000 |
| `supports_code_execution` | 0 | 1 | 1 |
| `supports_compaction` | 0 | 1 | 1 |
| `supports_effort_scaling` | 0 | 1 | 1 |
| `thinking_policy` | `omitted` | `adaptive_and_enabled` | `adaptive_only` |

`cost_notes` mirrors the same facts. Thompson filters via `src/core/model-catalog-capabilities.js` — Haiku cannot win `agentic_code_patch` / deploy builder task types.

**Dispatch:** `src/integrations/anthropic.js` never sends `thinking: { type: 'enabled' }` for Opus 4.7; Haiku gets no compaction beta and no code_execution tool.

---

## Where data lives

| Table | Purpose |
|-------|---------|
| `agentsam_model_catalog` | Canonical model registry (`anthropic_model_id` → API) |
| `agentsam_routing_arms` | Thompson arms per `task_type` + `mode` + `workspace_id` |
| `agentsam_ai` | Dashboard model picker (`show_in_picker`, `requires_human_approval`) |
| `agentsam_subagent_profile` | Quickstart cards (`is_platform_global=1`, `output_schema_json.quickstart`) |
| `agentsam_eval_suites` / `agentsam_eval_cases` | Phase-1 regression harness |
| `agentsam_agent_run` | Per-chat spine (`routing_arm_id`, tokens, `trigger`) |
| `agentsam_performance_eto_events` | Training ledger → `applyEtoToRoutingArms` |
| `agentsam_escalation` | Per-attempt outcomes (all models in chain) |

**Supabase (observability):** `agentsam_routing_decisions`, `agentsam_eval_runs`, `agentsam_prompt_runs` — mirror only; D1 is canonical for arms.

---

## Lane A — Scout (Haiku)

**When:** classification, triage, cheap JSON, summaries — not implementation.

**Pin in chat FormData:**

```
task_type=intent_classification
mode=auto
workspace_id=ws_inneranimalmedia
model=auto
quickstart_batch=anthropic_smoketest_quickstart
apply_eto_after_run=true
```

Or use Quickstart card **Anthropic Scout (Haiku 4.5)** from `GET /api/agent/quickstart/templates`.

**Expected arm ids (workspace):** `ra_ws_scout_*` → `model_key=anthropic_haiku_4_5`

**Do not expect:** file edits, migrations, multi-step tool chains.

---

## Lane B — Builder (Sonnet)

**When:** real production work — code, Worker debug, D1/Supabase, long context.

**Pin:**

```
task_type=agentic_code_patch
route_key=code
mode=agent
workspace_id=ws_inneranimalmedia
model=auto
quickstart_batch=anthropic_smoketest_quickstart
apply_eto_after_run=true
```

Quickstart: **Anthropic Builder (Sonnet 4.6)**.

**Expected arms:** `ra_ws_build_*` → `anthropic_sonnet_4_6`

**Compare against:** `gpt-5.4-mini`, `gemini-2.5-flash`, Workers AI coders via Thompson on same `task_type` after ETO volume.

---

## Lane C — Boss (Opus) — gated

**When:** owner-approved or critical review only.

**Pin (explicit — never rely on Auto):**

```
task_type=owner_approved_boss_check
route_key=deploy_validation
model=anthropic_opus_4_7
workspace_id=ws_inneranimalmedia
```

**Arms:** `ra_ws_boss_*` with `is_eligible=0`, `is_paused=1`, `pause_reason=owner_gated_not_auto_route`.

**Test flow must:**

1. Request tool/model approval in UI if policy requires it.
2. Confirm Opus does **not** appear in escalation chain for a normal `task_type=chat` Auto message.
3. Only invoke Opus when `task_type` is a boss task_type (see migration 353 list).

---

## End-to-end smoketest checklist (one Builder run)

1. Deploy Worker (API routes) + frontend if UI changed.
2. Run migration 353 on D1 remote (once).
3. Open `/dashboard/agent/quickstart` → **Anthropic Builder** → Begin in chat.
4. Send: `Summarize how POST /api/agent/chat picks anthropic_sonnet_4_6 for task_type agentic_code_patch.`
5. Verify D1:

```sql
SELECT id, routing_arm_id, task_type, trigger, model_id, input_tokens, output_tokens, cost_usd, status
FROM agentsam_agent_run
WHERE workspace_id = 'ws_inneranimalmedia'
  AND (id LIKE 'arun_anthropic_smoketest%' OR trigger = 'anthropic_smoketest_quickstart')
ORDER BY created_at DESC LIMIT 5;

SELECT routing_arm_id, model_key, alpha_delta, beta_delta, applied_to_thompson_at
FROM agentsam_performance_eto_events
WHERE workspace_id = 'ws_inneranimalmedia'
ORDER BY created_at DESC LIMIT 10;

SELECT task_type, mode, model_key, is_eligible, is_paused, workflow_agent
FROM agentsam_routing_arms
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key LIKE 'anthropic_%'
ORDER BY workflow_agent, task_type;
```

6. Optional: `POST /api/agent/routing/apply-eto` or rely on `apply_eto_after_run=true`.

---

## Eval suites (automated phase-1)

| Suite id | Model under test | Sample case id |
|----------|------------------|----------------|
| `evs_anthropic_phase1_scout` | `anthropic_haiku_4_5` | `evc_scout_intent_deploy` |
| `evs_anthropic_phase1_builder` | `anthropic_sonnet_4_6` | `evc_builder_worker_health` |
| `evs_anthropic_phase1_boss` | `anthropic_opus_4_7` | `evc_boss_migration_gate` |

Wire eval runner to pass `model_key` explicitly per suite; boss suite must set approval flag in runner metadata.

---

## Anti-patterns (fail the test)

- Opus selected on Auto chat without boss `task_type`
- `routing_arm_id` that is an md5 hash (`arm_<32 hex>`) instead of D1 `ra_*` id
- Training on smoke rows without `anthropic_smoketest_quickstart` batch label (ETO may discard generic smoke)
- Health-only deploy validation marked success
- Using deprecated picker keys (`claude-sonnet-4.5`, `claude-opus-4.6`) for new arms

---

## Files touched by seed

- `migrations/353_anthropic_team_phase1_routing_seed.sql`
- `migrations/352_seed_quickstart_platform_subagents.sql` (generic quickstart; 353 adds Anthropic team cards)
- `src/core/agent-quickstart-templates.js`
- `GET /api/agent/quickstart/templates`
- `docs/agentsam_knowledge/chat_assistant_quickstart_flow.md`
