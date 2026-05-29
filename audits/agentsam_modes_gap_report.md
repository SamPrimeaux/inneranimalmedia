# Agent Sam — Modes Gap Report

**Date:** 2026-05-29  
**Companion:** `audits/agentsam_runtime_wiring_audit.md`

---

## Mode truth table (runtime)

| Mode | UI label | POST fields | Normalized backend | Tools | Model | Workflows / surfaces | E2E maturity |
|------|----------|-------------|-------------------|-------|-------|----------------------|--------------|
| **ask** | Ask | `mode=ask` (+ aliases) | `ask` | **0** (fast path) | `resolveAskFastModelKey` → `resolveModelForTask(ask)` | No workflow preflight on fast path | **Strong** for chat-only Q&A; **weak** for data/code |
| **agent** | Agent | `mode=agent` | `agent` | Full catalog + codemode optional | Auto: Thompson; Pin: explicit chain | Yes — `resolveWorkflowForMessage`, browser preflight | **Strongest** general path |
| **plan** | Plan | `mode=plan` | `plan` | Same as agent (when not in plan pipeline) | Same as agent | **Long work** → `enterLongWorkPlanPipeline` (plan SSE) | **Split** — pipeline strong; casual plan mode ≈ agent |
| **debug** | Debug | `mode=debug` | `debug` | Same as agent | Same as agent | Browser/debug workflows when message matches | **Medium** — label ≠ isolated debug toolset |
| **multitask** | Multitask | `mode=multitask` | `multitask` | Same; codemode uses `task_type multitask` | Same as agent | Workflow match always allowed | **Medium** — name overpromises vs orchestration |

---

## Payload contract (UI → Worker)

**Source:** `dashboard/components/ChatAssistant/ChatAssistant.tsx`

```text
POST /api/agent/chat (multipart/form-data)
  message
  mode, agent_mode, runtime_intent_mode   # same value
  model                                   # "auto" or model_key
  provider                                # only if pinned model
  conversationId
  contextMode                             # active project
  workspace_id
  browserContext                          # JSON string
  workspaceContext                        # inside browserContext + optional duplicate
  active_file_path, active_file_source
  active_file_r2_bucket, active_file_r2_key
  active_file_github_repo, active_file_github_path, active_file_github_branch
  active_file_drive_id, active_file_workspace_path
  files[]                                 # attachments
  optional: task_type, route_key, quickstart_batch, apply_eto_after_run
```

**Backend entry:** `agentChatSseHandler` — `normalizeAgentRuntimeMode(body.mode ?? body.agent_mode ?? body.runtime_intent_mode ?? body.execution_mode)`.

---

## Per-mode behavior detail

### Ask

**Branch:** `if (requestedMode === 'ask')` → immediate `agentChatDirectSseHandler` with `tools: []` (`agent.js` L6617–6684).

| Aspect | Behavior |
|--------|----------|
| Prompt route | Loaded (`resolveAgentsamPromptRoute`) — affects system prompt only |
| `tool_keys` / `mcp_template` | **Ignored** for execution (no tool loop) |
| Exception | `askDataPlaneIntent` regex can still set `agentLikeTooling` **after** fast path — **unreachable** today because of early return |
| Subagent | Default `codex-default` profile may attach to body before fast path |
| Model | Route `preferred_model` / `fallback_model` fed into `resolveAskFastModelKey` as `requested_model_key` hint |

**Gap:** Users expect “Ask” = safe questions only, but D1 may define rich `tool_keys` on ask routes — **never executed**.

**Gap:** `simple_ask_greeting` override applies only on **non-fast** path (code after ask return) — dead for pure ask sends.

---

### Agent

**Branch:** Full handler after ask return.

| Aspect | Behavior |
|--------|----------|
| `agentLikeTooling` | true when mode is agent, debug, multitask, or ask with surface/data intent |
| Tool load | `loadToolsForRequest(..., agentChat: true, mcpTemplate, routeKey)` |
| Intent | `classifyIntent` + `gateRewriteAndClassify` |
| Capability | `evaluateCapabilityDecision` → browser/monaco/terminal flags |
| Model | Chain: Thompson pick + escalation + tier filter + granite auto filter |
| Limits | `max_tool_calls` default 15, `max_turns` 6 |

**Strongest E2E:** Yes — tool loop, `agentsam_agent_run`, usage events, optional ETO.

---

### Plan

| Aspect | Behavior |
|--------|----------|
| Same tooling as agent | Unless `enterLongWorkPlanPipeline` |
| Pipeline trigger | `requestedMode === 'plan'` + work intent + word count ≥ 3 (and not skill-creator / image fast paths) |
| Pipeline output | Plan SSE (`plan_created`, tasks, terminal proposals) |
| Route defaults | `plan` profile blocks terminal in **default resolver** — but agent mode tool load may still add terminal via catalog enrich |

**Gap:** “Plan” in UI does not mean “no execution” — only long messages enter structured plan flow.

---

### Debug

| Aspect | Behavior |
|--------|----------|
| Tooling | `agentLikeTooling` includes debug |
| Workflow | `allowImmediateWorkflowMatch` if message has debug/browser/monaco keywords |
| Surface preflight | `resolveSurfaceWorkflowForMessage` → browser workflow keys |
| Default route profile | `debug` allows develop/inspect lanes; terminal not blocked in profile |

**Gap:** No separate debug system prompt or mandatory `d1_query` / snapshot tools — depends on catalog ranking.

---

### Multitask

| Aspect | Behavior |
|--------|----------|
| Workflow | `allowImmediateWorkflowMatch` true without extra keywords |
| Codemode | `resolvedRoutingTaskType` may become `multitask` → codemode manifest |
| Subagents | Policy `allow_subagent_spawn` gates spawn tools |

**Gap:** No true multi-agent scheduler in chat handler — mostly marketing label + workflow hooks.

---

## Mode vs D1 routing arms

Sample query: arms exist per `mode` column with `task_type` often `chat` or canonical types. Thompson uses `resolveRoutingMode(task_type, mode)` — when UI sends `mode=agent` and intent normalizes `task_type=ask`, arm lookup may use **mode agent + task ask** (mismatch possible).

**Recommendation:** Always pass `body.task_type` pin from UI when mode is known, or set `intentResult.taskType` from `requestedMode` for arm lookup consistency.

---

## `loadModeToolPolicy` — smallest useful patch

**Current:**

```javascript
async function loadModeToolPolicy(_env, _modeSlug) {
  return { allowTools: [], denyTools: [], requireApprovalTools: [] };
}
```

**Proposed (no new table):** Import `resolveAgentChatRouteToolRequirements` from `agentsam-route-tool-resolver.js` with synthetic `route_key = modeSlug` or map:

| modeSlug | route_key for policy |
|----------|---------------------|
| ask | `chat` or `simple_ask_greeting` |
| agent | `code` |
| debug | `debug` |
| plan | `plan` |
| multitask | `tool_use` or `deploy` |

Translate `blocked_capabilities` → deny tool names via existing capability→tool maps in `agentsam-capability-aliases.js`.

---

## Mode-related quality flags

| Flag | Condition |
|------|-----------|
| `ASK_FAST_PATH_NO_TOOLS` | User asks for grep/file ops in Ask mode |
| `MODE_LABEL_ONLY` | plan/debug/multitask without pipeline/workflow hit |
| `MODE_ARM_MISMATCH` | `agentsam_agent_run.mode` null or inconsistent with UI |
| `STUB_MODE_TOOL_POLICY` | `loadModeToolPolicy` empty |

---

## Suggested E2E proof (per mode)

| Mode | Test message | Pass criteria |
|------|--------------|---------------|
| ask | “What is agentsam_prompt_routes?” | No tools; fast reply; `agentsam_agent_run` with mode=ask |
| agent | “Grep for `agentChatSseHandler` in src/api” | Tool call `fs_search_files` or terminal rg; `tool_chain` row |
| plan | “Make a plan to add finance chart” | `plan_created` SSE or plan artifact |
| debug | “Screenshot dashboard overview and list console errors” | Browser tool success |
| multitask | “Run workflow X and summarize” | Workflow SSE or run id |

---

## Files

- `dashboard/components/ChatAssistant/types.ts` — mode types
- `dashboard/components/ChatAssistant/ChatAssistant.tsx` — payload
- `src/api/agent.js` — `normalizeAgentRuntimeMode`, ask fast path, `agentLikeTooling`
- `src/core/agentsam-route-tool-resolver.js` — default per-route tool policy
