---
name: plan-and-execute
description: Automatically plan and execute requirements. Creates a structured task list, executes one task at a time with visible progress, and revises the plan as context changes. Use for multi-step Agent Sam work in Plan or Agent/Multitask modes.
---

# Plan and Execute (Agent Sam)

**Canonical R2:** `inneranimalmedia-autorag/skills/plan-and-execute/SKILL.md`  
**D1 registry:** `skill_plan_and_execute` (`retrieval_strategy=r2`)

This skill aligns Cursor-style **Plan and Execute** behavior with the **Agent Sam** execution spine:

```
User goal → Plan mode (create) → agentsam_plans + agentsam_plan_tasks (D1)
         → Agent/Multitask (execute) → agentsam-task-executor → SSE → AgentPlanChecklist UI
```

## Agent Sam equivalents (not Cursor tools)

| Cursor concept | Agent Sam equivalent |
|----------------|----------------------|
| `UpdatePlan` markdown tool | D1 `agentsam_plans` / `agentsam_plan_tasks` + SSE `plan_created` / `plan_progress` / `task_complete` |
| `AskUserQuestion` | Plan terminal approval UI; `browser_request_human_input` for browser HITL; chat clarifying questions in Ask mode |
| Checkbox states `[ ]` `[>]` `[x]` `[!]` | Task `status`: `todo` · `in_progress` · `done` · `blocked` / `failed` / `skipped` |
| Plan markdown in chat | `AgentPlanChecklist.tsx` bound to `ExecutionPlanState` |

## When to use

Use when the request needs **3+ distinct steps**, feature implementation, investigation/fix cycles, refactors, or visible progress tracking.

Skip for single trivial actions, pure explanations, or brainstorming only.

## Workflow (Agent Sam)

### 1. Analyze requirements

- Read enough repo/platform context to make tasks concrete (paths, bindings, migrations, deploy gates).
- If requirements are ambiguous, ask **one focused clarifying question** in chat before planning.
- If a referenced file path is missing, ask for it before proceeding.

### 2. Create the plan (Plan mode)

- User selects **Plan** mode; spine runs `plan-controller` → `agentsam-planner.js`.
- Planner writes **2–8 tasks** to D1 with categories, capability types, and optional approval gates.
- UI receives SSE `plan_created` with `plan_id` and task list.
- **Plan mode stops after creation** — it does not auto-execute. Tell the user to switch to **Agent** or **Multitask** to run tasks.

### 3. Execute systematically (Agent / Multitask)

- Resume via `executePlan` in `agentsam-task-executor.js` (SSE events update `AgentPlanChecklist`).
- **One task in progress at a time** at the executor level.
- Risky terminal steps require **Allow** in the plan-task approval banner (`POST /api/agent/plan-task/resume`).
- Revise remaining tasks when scope changes (new D1 rows or planner re-run — do not silently skip blockers).

### 4. Task states

| Symbol (doc) | D1 / UI status |
|--------------|----------------|
| `[ ]` pending | `todo` |
| `[>]` in progress | `in_progress` / `running` |
| `[x]` completed | `done` |
| `[!]` blocked | `blocked` or `failed` |

### 5. Sub-tasks

If a task grows, split into additional `agentsam_plan_tasks` with higher `order_index` under the same `plan_id` rather than collapsing work into one vague step.

### 6. Final verification

After all tasks are `done`:

- Re-read the original goal.
- Run relevant checks (lint, `node --check`, targeted curl — not full deploy smokes unless asked).
- Summarize what shipped and what remains optional.

## Markdown plan format (human-readable mirror)

When explaining progress in chat, mirror this format (UI checklist is authoritative):

```markdown
## Task List

- [x] Completed task
- [>] Current task
- [ ] Pending task
```

## Best practices

- **Atomic tasks** — independently completable steps with clear acceptance.
- **Real paths** — cite repo files, D1 tables, wrangler bindings, not placeholders.
- **One runner** — never mark multiple tasks in progress.
- **Immediate updates** — after each task, reflect status in the checklist/SSE stream.
- **Blockers** — keep task open and add follow-up tasks instead of hiding failures.

## IAM-specific rules

- **Identity:** resolve `workspace_id` / `user_id` from session — never hardcode `ws_*` / `au_*` in hot paths.
- **Deploy:** `npm run deploy:full` only when user wants ship; no test/smoke in deploy unless explicitly requested.
- **Two workers:** in-app Agent Sam does not route through MCP for chat; MCP is OAuth connector surface.
- **RAG:** use lane semantic tools / autorag for knowledge; use `agentsam_cf_vectorize` only for raw Vectorize ops.

## Example (Agent Sam)

**User (Plan mode):** “Wire dark mode toggle on dashboard settings.”

**Outcome:** `plan_created` with tasks like: audit theme tokens → add toggle component → persist preference → verify settings page.

**User (Agent mode):** “Execute plan {plan_id}” or continue thread with plan context — executor runs tasks sequentially with SSE updates.

---

*Adapted from Cursor Plan and Execute skill for Inner Animal Media Agent Sam product.*
