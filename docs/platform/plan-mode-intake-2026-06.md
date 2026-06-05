# Plan Mode intake — end-to-end spec (2026-06)

Monaco-first plan delivery + Cursor-style **Questions** card. Mobile is a runtime requirement (≤430px), not a follow-up.

## Surfaces

| Surface | Role |
|---------|------|
| **Chat thread** | Explore status, Questions card, summary, Run plan |
| **Monaco** | Canonical plan doc `plan-{plan_id}.md` (R2) |
| **D1** | Plans, tasks, workflow runs, intake batches (SSOT) |
| **Supabase `agentsam.agentsam_plans`** | Embed-only mirror (`summary`, `embedding`, `r2_url`) |

No Plan Workbench panel.

---

## D1 tables

### Existing (unchanged SSOT)

- **`agentsam_plans`** — plan row; `morning_brief` / `session_notes` for legacy intake only
- **`agentsam_plan_tasks`** — executable tasks; `status` includes `blocked`
- **`agentsam_workflow_runs`** + **`agentsam_execution_steps`** — `agent_chat_plan` spine
- **`agentsam_approval_queue`** — terminal/tool gates (separate from intake questions)
- **`agentsam_chat_sessions`** — thread metadata
- **`agentsam_artifacts`** — R2 plan markdown + excalidraw maps

### New: `agentsam_plan_intake_batches` (migration `563`)

Persists Q&A batches across turns and devices.

| Column | Purpose |
|--------|---------|
| `id` | `pintake_*` batch id |
| `tenant_id`, `workspace_id`, `user_id`, `session_id` | Scoping |
| `phase` | `pre_plan` \| `mid_plan` \| `roadblock` |
| `status` | `pending` \| `answered` \| `skipped` \| `expired` \| `superseded` |
| `goal_text` | Original user goal |
| `explore_summary_json` | RAG explore synthesis + findings |
| `questions_json` | LLM-generated questions |
| `answers_json` | User selections on Continue |
| `optional_details` | Freeform “Add more optional details” |
| `plan_id`, `workflow_run_id` | Set when plan exists / after submit |
| `parent_batch_id` | Chained mid-sprint batches |
| `roadblock_context_json` | Task error, step id, unexpected state |

Indexes: `(workspace_id, session_id, status)`, `plan_id`, pending by user.

---

## Flow A — Pre-plan (default)

```
User (Plan mode) → POST /api/agent/chat
  → plan-controller (execution_kind: plan_pipeline)
    1. plan_explore_start / plan_explore_progress / plan_explore_step (RAG + codebase Vectorize)
    2. LLM: needs_questions? + up to 3 questions
    3a. If questions → INSERT batch → SSE plan_questions_batch → done (pause)
    3b. If clear goal → createPlan → monaco_file_generated → plan_created → done
```

**Continue / Skip** → `POST /api/agent/plan/intake/submit` (SSE)

- Updates batch `answered` or `skipped`
- Builds enriched goal from selections + optional details + explore notes
- Runs `createPlan` → same Monaco + embed mirror path

---

## Flow B — Mid-sprint roadblock

When execution hits something unexpected (`agentsam_plan_tasks.status = blocked`, approval denied, missing binding, etc.):

1. Executor calls `emitPlanRoadblockQuestions()` (`plan-intake-stream.js`)
2. New batch: `phase: roadblock`, `plan_id` set, `roadblock_context_json` populated
3. Same **Questions** card in chat (badge: Roadblock)
4. User Continue → intake submit → either:
   - **Re-plan** (new tasks appended / plan markdown updated), or
   - **Resume** with amended goal (executor picks up next `todo` task)

Roadblock batches link via `parent_batch_id` for audit.

Executor: first `blocked` task per run calls `emitPlanRoadblockQuestions()` (`agentsam-task-executor.js`).

---

## SSE events

| Event | When |
|-------|------|
| `plan_explore_start` | Explore begins |
| `plan_explore_progress` | Explore summary (files/searches/findings) |
| `plan_explore_step` | Per-file explore step label |
| `plan_questions_batch` | Batched card payload |
| `plan_thinking` | Creating plan |
| `monaco_file_generated` | Open `plan-{id}.md` |
| `plan_created` | Summary + Run plan chips |

Legacy `attached_question` still supported for agent/debug modes.

---

## UI — Questions card (`AgentQuestionsCard`)

- **Desktop:** lettered choices, 16px question, optional details textarea
- **Mobile (≤430px):** 44px touch targets, 17px question, 16px inputs, sticky Skip/Continue
- **Pagination:** 1 of N when multiple questions
- **Skip** (Esc): submits `skip: true`
- **Continue →:** requires all questions answered (or Other text); does **not** auto-send on chip tap

---

## Supabase

Embed-only upsert on `plan_created` — no full task mirror. See `agentsam-plan-supabase-public-sync.js`.

---

## API

| Method | Path | Body |
|--------|------|------|
| POST | `/api/agent/chat` | Plan mode message; `/plan` prefix or `@plan` refine forces plan pipeline |
| POST | `/api/agent/plan/intake/submit` | `{ batch_id, selections, optional_details, skip, session_id }` |
| POST | `/api/agent/plan/refine` | `{ plan_id, refinement }` — SSE → updated Monaco plan |
| POST | `/api/agent/plan/revert` | `{ plan_id }` — reset blocked tasks to `todo` |
| POST | `/api/agent/plan/execute` | `{ plan_id }` |
| GET | `/api/agentsam/plans` | Recent plans library |
| GET | `/api/agentsam/plans/:id/markdown` | Latest plan markdown artifact URL |
| Slash | `/plan` | `agentsam_commands` migration `564` → `plan.start` enables Plan mode |

---

## Mobile layout

- Fullscreen chat overlay (`max-phone:fixed inset-0`) — Questions card is full thread width
- Card uses `isNarrow` prop from `PHONE_MQ` (430px)
- No side panels; Monaco opens via `iam:agent-open-surface` when user returns to editor tab

---

## Non-goals

- Do not mirror full plan schema to Supabase
- Do not resurrect Plan Workbench panel
- Do not use modal dialogs for questions
