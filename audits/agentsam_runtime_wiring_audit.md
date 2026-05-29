# Agent Sam — Runtime Wiring Audit (May 29, 2026)

**Scope:** Production runtime paths only (not schema inventory).  
**Branch:** `main` (clean tracked tree).  
**Method:** Ripgrep across `dashboard/` + `src/`, plus remote D1 samples via `wrangler.production.toml`.

---

## Executive summary

Agent Sam has **substantial** D1-driven infrastructure (routing arms, prompt routes, tool catalog, ETO, telemetry tables) but the **live chat path only partially consumes it**. The strongest E2E path today is **`agent` mode with tools + SSE**; **`ask` is a deliberate fast path with zero tools**; **`plan`/`multitask`/`debug` share most of `agent`’s pipeline but differ mainly by heuristics (workflows, plan pipeline, capability injection). The largest Cursor-parity gaps are: **no `fs_search_files` handler**, **terminal tools rarely/never logged in `agentsam_tool_chain`**, **`loadModeToolPolicy` is a no-op**, **UI `active_file_*` envelope not read in `agent.js`**, and **expensive-model blocking is incomplete outside Thompson SQL** (pinned models bypass arm filters).

---

## Files inspected (primary)

| Area | Paths |
|------|--------|
| UI modes + payload | `dashboard/components/ChatAssistant/types.ts`, `ChatAssistant.tsx`, `hooks/useAgentChatStream.ts` |
| Chat SSE handler | `src/api/agent.js` (`agentChatSseHandler`, `loadToolsForRequest`, `filterAgentToolsForRequest`) |
| Model resolution | `src/core/resolveModel.js`, `src/core/routing.js`, `src/api/agent.js` (`routingPickFromResolveModelForTask`) |
| Prompt routes + tools | `src/core/agentsam-tools-catalog.js`, `src/core/agentsam-route-tool-resolver.js`, `src/core/agentsam-mcp-tools.js` |
| Terminal | `src/core/agent-terminal-run.js`, `src/tools/terminal.js`, `src/core/terminal.js`, `src/tools/ai-dispatch.js` |
| Browser vs fetch | `src/core/capability-router.js`, `src/tools/builtin/web.js`, `src/integrations/browser-cdp.js` |
| File envelope | `src/tools/builtin/fs.js`, `dashboard/components/ChatAssistant/ChatAssistant.tsx` |
| Telemetry / learning | `src/core/agent-run-routing.js`, `src/core/usage-event-writer.js`, `src/api/command-run-telemetry.js`, `src/core/performance-eto.js` |
| MCP template commit | `a2d086b` — `agentsam-tools-catalog.js`, `agent.js` |

---

## A. Mode runtime

### UI definition

- **Types:** `AgentMode = 'ask' \| 'plan' \| 'agent' \| 'debug' \| 'multitask'` in `dashboard/components/ChatAssistant/types.ts`.
- **Labels:** `AGENT_MODES` — Agent, Plan, Debug, Multitask, Ask (`types.ts` L298–304).
- **Persistence:** `localStorage` key `LS_AGENT_CHAT_MODE` (`ChatAssistant.tsx`).

### Payload sent (every send)

From `ChatAssistant.tsx` (~L1381–1458):

| Field | Value |
|-------|--------|
| `message` | User text |
| `mode`, `agent_mode`, `runtime_intent_mode` | Same slug (e.g. `agent`) |
| `model` | `auto` or pinned `model_key` |
| `provider` | Only when **not** auto |
| `conversationId`, `workspace_id`, `contextMode` | Session / project |
| `browserContext` | JSON: dashboard route, selected element, `workspaceContext` packet |
| `workspaceContext` | Also embedded in `browserContext` |
| `active_file_path`, `active_file_source`, `active_file_*` | Monaco/GitHub/R2/Drive/local aliases |
| Optional | `task_type`, `route_key`, `quickstart_batch`, `apply_eto_after_run` |

### Backend endpoint

- **`POST /api/agent/chat`** → `agentChatSseHandler` (`src/api/agent.js` L11667–11670).
- SSE consumer: `dashboard/components/ChatAssistant/hooks/useAgentChatStream.ts`.

### Mode normalization

```6139:6143:src/api/agent.js
function normalizeAgentRuntimeMode(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (['agent', 'plan', 'debug', 'multitask', 'ask', 'auto'].includes(v)) return v;
  return 'agent';
}
```

- Unknown modes → **`agent`** (not ask).
- UI never sends `auto` as mode; it sends concrete slugs.

### Runtime behavior matrix

| Mode | Tools | Model path | Distinct branches |
|------|-------|------------|-------------------|
| **ask** | **None** (fast path) | `resolveAskFastModelKey` → `resolveModelForTask(task_type:'ask')` | Early return `agentChatDirectSseHandler` L6617–6685; optional `simple_ask_greeting` route override |
| **agent** | Full `loadToolsForRequest` + enrich + `filterAgentToolsForRequest` | Auto: Thompson via `routingPickFromResolveModelForTask`; pin: explicit chain | Workflow preflight, codemode manifest, image fast path, capability router |
| **plan** | Same as agent when not in plan pipeline | Same | `enterLongWorkPlanPipeline` when work intent + word count (`requestedMode === 'plan'`) |
| **debug** | Same as agent | Same | Workflow match when `explicitSurfaceOrWorkflowIntent`; browser surface preflight |
| **multitask** | Same as agent; codemode routing task type → `multitask` | Same | `allowImmediateWorkflowMatch` always true for multitask |

**`loadModeConfig`** (`agent.js` L2669–2713): returns **hardcoded defaults** per slug; only enriches `gate_model` / `escalation_model` via `resolveModelForTask` when `workspaceId` set. **Does not read a D1 modes table.**

**`loadModeToolPolicy`** (`agent.js` L1331–1333): **stub** — always `{ allowTools: [], denyTools: [], requireApprovalTools: [] }`.

### Strongest E2E path

**`agent` + Auto model + tool-capable route** (e.g. code/debug routes): full tool load, `agentsam_agent_run` insert, tool loop, usage events, optional ETO apply.

### Mostly labels / partial behavior

| Mode | Gap |
|------|-----|
| **ask** | By design no tools; D1 `agentsam_prompt_routes.tool_keys` ignored on fast path |
| **plan** | Long plan pipeline is separate; short plan chats behave like agent |
| **debug** | No dedicated debug tool policy; relies on message heuristics + same catalog |
| **multitask** | Name implies orchestration; runtime is agent + optional workflow/codemode, not parallel subagents by default |

---

## B. Route / model runtime

### Auto model selection chain

1. **UI:** `model=auto` → `isAutoModelSelection()` (`types.ts`).
2. **Chat:** `explicitModelFromRequest = false` → `isAutoModel = true` (`agent.js` L7504–7505).
3. **Pick:** `routingPickFromResolveModelForTask` → **`resolveModelForTask`** (`agent.js` L190–217, L7655–7663).
4. **Inside resolver** (`resolveModel.js`): arm id → requested key → **Thompson** (`selectThompsonArm`) → global policy → emergency (`resolveEmergencyModel`).
5. **Parallel legacy:** `selectAutoModel` = `getDefaultModelForTask` (`routing.js` L1226–1227) — logged at L6783 but **chain assembly uses `routingPickFromResolveModelForTask`**, not this log line’s result directly.

**Tables used together (auto):**

| Table | Used in auto path? |
|-------|-------------------|
| `agentsam_routing_arms` | Yes — Thompson + emergency + `queryRoutingArmsCandidates` |
| `agentsam_model_catalog` | Yes — joined in `loadModelRecord`, tool/vision gates |
| `agentsam_ai` | Yes — picker rows, chain assembly |
| `agentsam_model_pricing` | Yes — `estimateModelRunCostUsd` / usage (not arm pick SQL) |
| `agentsam_prompt_routes` | Partial — `preferred_model` as hint when no explicit row; not authoritative for Thompson |

### Pinned model

- **Path B** in `resolveModelForTask`: `requested_model_key` → `loadModelRecord` **without** re-checking arm `is_paused` / arm-level budget on the model itself (catalog `budget_exhausted` still throws).
- **Chat:** `explicitRow` from `resolveAiModelFromRequest`; chain is **only that model** (`agent.js` L7709–7711).
- **Route gate:** `validateModelAgainstRouteRequirements` runs for pinned + `route_key` (422 if fail) — L7626–7648.
- **Tool override:** If pinned model lacks `supports_tools` but tools required → `blockedToolsForRequested`, model cleared (L7465–7471).

### Expensive / pro model blocking

| Model | Runtime block? |
|-------|----------------|
| `gpt-5.5` (base) | **Yes** — SQL in `routing.js` `queryRoutingArmsCandidates` (`blockGpt55Base`) |
| `gpt-5.5-pro`, `gpt-5.4-pro`, `gpt-5-pro` | **No dedicated SQL ban**; only `agentsam_model_catalog.is_active` + picker visibility |
| Pinned picker | **Can bypass** arm SQL if catalog row active |

**Policy gap vs user rule:** Autonomous routing should block all four SKUs before provider calls; today only **`gpt-5.5`** is arm-filtered. **`launch-desk.js`** still hardcodes `gpt-5.5` (separate surface).

### Budget / eligibility enforcement

| Field | Enforced where |
|-------|----------------|
| `budget_exhausted` (arm) | Thompson SQL + `resolveModelForTask` arm path |
| `budget_exhausted` (catalog) | `loadModelRecord` throws `BUDGET_EXHAUSTED` |
| `is_paused`, `is_eligible` | Arm queries |
| `max_cost_per_call_usd` | `armMatchesRouteRequirements` vs route req `max_cost_per_1k_in` (route pin validation); **not** a global pre-call veto on auto pick |
| `requires_owner_approval`, `routing_eligible` (pricing) | **Not** in hot `resolveModelForTask` / chat pick SQL |
| `max_cost_per_run_usd` | **MISSING** — no grep hits in `src/` |
| Loop budget | **`max_tool_calls`** (mode default 15), **`max_turns`** (6) — per-turn, not USD cap |

### `fallback_model_key`

- **Thompson loop:** On `MODEL_NOT_FOUND` / `BUDGET_EXHAUSTED` / `CAPABILITY_MISMATCH`, tries `arm.fallback_model_key` (`resolveModel.js` L571–577).
- **Chat chain:** `routingPick.fallbackModelKey` from resolve path is often **null** (`routingPickFromResolveModelForTask` L216); chat uses `loadChatRoutingFallbackRows` + escalation model instead.

### Escalation

- **Static:** `modeConfig.escalation_model` from `loadModeConfig` (ask→agent arm lookup).
- **Dynamic:** `confidence < escalationThreshold` → start fallback chain at index 1 (`agent.js` L8376–8378).
- **Not evidence-based** on tool failure mid-turn (no automatic arm switch on tool error except provider retry loop).

---

## C. Prompt routes & tool selection

### Route loading

- `resolveAgentsamPromptRoute` / body `route_key` pin (`agent.js` L7103–7127).
- Priority: tenant-specific row wins; **`ORDER BY priority ASC`** (lower number = higher priority per route-tool-resolver comment).

### `mcp_template` (post `a2d086b`)

- Passed into `loadToolsForRequest` as `opts.mcpTemplate` (`agent.js` L7214).
- `selectAgentsamToolsForAgentChat` merges `loadCatalogRowsForMcpTemplate` with **+500 score boost** (`agentsam-tools-catalog.js` L554–578, L581–583).
- **Authoritative for CF MCP server tools** when `mcp_template` JSON lists server keys; still capped by `max_tools`, allowlist, blocked_capabilities.

### `loadToolsForRequest`

- Branded path: `selectAgentsamToolsForAgentChat` when `opts.agentChat` + `useBrandedCatalog`.
- Filters: MCP allowlist, `tool_categories` from route row, mode policy (stub), preferred keys from capability aliases.
- **Does not** filter by budget USD; approval via `requires_approval` on tool rows + `validateToolCall`.

### `loadModeToolPolicy`

**Stub** — returns empty allow/deny. **Tiny patch (no new table):** read `loadModeConfig(...).tool_policy_json` if column exists, else map `modeSlug` → rows in existing `agentsam_route_tool_resolver` DEFAULT_ROUTE_TOOL `blocked_capabilities` / `optional_capabilities` (already in `agentsam-route-tool-resolver.js`).

### Tools wrongly blocked / missing

- Default route profile **`chat`** blocks `terminal_execute` / `terminal_run` (`agentsam-route-tool-resolver.js` L74).
- **`code` / `debug`** profiles allow terminal optional — but only if route_key resolves to those profiles.
- **`fs_search_files`**: aliased in `agentsam-capability-aliases.js` but **no handler** in `src/tools/` → tool calls fail at dispatch.
- D1 `agentsam_tool_chain`: **zero rows** for `terminal_run`, `terminal_execute`, `fs_search_files`, `workspace_search` (May 2026 sample); top tools are legacy `agentsam_*` names.

---

## D. Terminal / Cursor parity

| Question | Answer |
|----------|--------|
| Headless `/api/agent/terminal/run`? | **Yes** — `src/tools/terminal.js` POSTs with session cookie; no dashboard panel required |
| PTY path | `executeScopedAgentTerminalRun` → `runTerminalCommand` → `PTY_SERVICE.fetch(/exec)` or HTTP fallback (`terminal.js` L670+) |
| Gates | `agentsam_user_policy.can_run_pty`, bootstrap capabilities, `terminal_execute` catalog row, approval for non-safe commands (`agent-terminal-run.js`) |
| Safe commands today | `pwd`, `whoami`, `hostname`, `date`, `uname`, `echo`, `ls`, `printenv`, `python3 -m py_compile` (L19–28) — **no `rg`, `git`, `jq`, `node --check`** |
| Agent tool dispatch | `terminal_run` / `terminal_execute` → `termHandlers.run_command` → same API (`ai-dispatch.js` L229–233) |
| `fs_search_files` | **Catalog/migration only** — no runtime handler; `workspace_search` proxies weak `list_dir` search (`storage.js` L36–38) |

---

## E. MYBROWSER vs fetch

| Rule | Status |
|------|--------|
| Browser for DOM/screenshot/automation | **Yes** — `MYBROWSER` / `browser-cdp.js`, `runBrowserBuiltinTool` |
| Plain URL / API | **fetch** + `assertFetchDomainAllowed`; capability router sets `should_use_browser` false for conceptual asks (`capability-router.js`) |
| Over-selection risk | `messageHasBrowserUrlNavigation`, `shouldEnsureBrowserCapabilityTools`, `taskType === 'browser'` |
| `search_web` | Returns `{ error: 'Search API key missing' }` if no `TAVILY_API_KEY` / `SEARCH_API_KEY` (`web.js` L72–74) — still exposable in catalog; wastes tool turns |

---

## F. Storage / file surfaces

| Surface | UI sends | Backend chat reads | Write path |
|---------|----------|-------------------|------------|
| Local / workspace | `active_file_workspace_path`, `active_file_source=local` | **Not in `agent.js`** — only `workspaceContext.openFiles` text | `fs.js` / `change_sets` via tools |
| R2 | `active_file_r2_*` | Tool params only (`fs.js` resolveFileEnvelope) | `change_sets` + R2 apply |
| GitHub | `active_file_github_*` | Same | `change_sets` + GitHub API |
| Drive | `active_file_drive_id` | Same | Drive apply in `fs.js` |
| Monaco | Open files in `workspaceContext` | Injected as **text context**, not automatic read | SSE `file` events / `apply_change_set` tool |

**Authoritative for repo files:** PTY workspace on VM (production edits), not browser localStorage. R2/GitHub are **deployment/artifact** surfaces.

---

## G. Telemetry / learning loop

| Step | Wired? | Evidence |
|------|--------|----------|
| `agentsam_agent_run` per model call | **Most chat turns** | `scheduleAgentsamChatAgentRunStart` / finalize (`agent-run-routing.js`); sample rows often have **`mode` null** on older `tool_use` rows |
| `agentsam_tool_chain` | **When `scheduleToolCallLog` / command-run telemetry runs** | Top names are `agentsam_db_query`, not `terminal_run` |
| `agentsam_usage_events` | **Yes** | `scheduleAgentsamUsageEventFromChat` (`agent.js` L8800+) |
| ETO events | **Yes** | `agentsam_performance_eto_events` — 170+ from `agentsam_usage_events` |
| ETO → Thompson | **Partial** | `applyEtoToRoutingArms` exists; cron + post-chat `waitUntil`; **67/170 applied** in sample; pinned runs skip `shouldApplyEtoAfterRun` unless batch/benchmark |
| Missing link | **Tool failure → arm penalty** | Tool errors don’t consistently write ETO with `routing_arm_id` |

---

## Top 5 waste-causing runtime gaps

1. **`ask` fast path + zero tools** — users in Ask mode get no code search/terminal even for “grep X in repo”.
2. **`fs_search_files` registered but not implemented** — model may call a dead tool; capability aliases promise ripgrep.
3. **Terminal tools not appearing in production telemetry** — catalog vs dispatch mismatch or agents never receiving `terminal_*` in manifest.
4. **Pinned models skip Thompson filters** — pro/expensive SKUs reachable if active in `agentsam_ai` picker.
5. **`search_web` + Tavily** — tool surfaces without key → failed turns and token burn on retries.

---

## Top 5 smallest high-leverage patches

1. **Implement `fs_search_files`** — PTY `rg --json` via `/api/agent/terminal/run`, cap results, workspace-scoped (see terminal parity plan).
2. **Hard-block pro SKUs in `loadModelRecord` or `resolveAiModelFromRequest`** — reject `gpt-5.5`, `gpt-5.5-pro`, `gpt-5.4-pro`, `gpt-5-pro` unless `quickstart_batch` / explicit approval flag.
3. **Wire `loadModeToolPolicy` from `agentsam-route-tool-resolver` defaults** — map `modeSlug` → blocked/optional capabilities (no new table).
4. **Expand `isLikelySafeShellCommand`** — add `git status`, `git diff`, `rg`, `jq`, `node --check` (read-only patterns).
5. **Single structured log line** on model/tool rejection — `console.log('[agent] candidate_rejected', { kind, id, reason })` in resolver + `selectAgentsamToolsForAgentChat`.

---

## D1 samples (remote, May 29 2026)

- **`agentsam_routing_arms`:** Active arms for `mode IN (ask, agent, plan, multitask, debug)`; many `task_type=chat` Workers AI models at priority 50; `max_cost_per_call_usd` often null.
- **Expensive models in arms:** Query for `gpt-5.5*` / `gpt-5.4-pro` / `gpt-5-pro` returned **empty** (not in active arms).
- **`agentsam_tool_chain`:** No terminal/fs_search rows; dominant tools are legacy `agentsam_*` MCP names.
- **`agentsam_performance_eto_events`:** `agentsam_usage_events` source — 170 events, 67 applied to Thompson.

---

## Alignment report (session bookkeeping)

| Field | Value |
|-------|--------|
| `todo_id` | *(not registered — audit-only deliverable)* |
| `plan_task_id` | — |
| `workflow_run_id` | — |
| Files changed | `audits/agentsam_runtime_wiring_audit.md`, `audits/agentsam_modes_gap_report.md`, `audits/agentsam_terminal_cursor_parity_plan.md` |
| Validation | Code trace + D1 remote SELECTs (wrangler production config) |
