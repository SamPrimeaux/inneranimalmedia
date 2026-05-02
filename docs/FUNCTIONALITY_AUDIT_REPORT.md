# Complete Functionality Audit Report

**Date:** 2026-03-12  
**Scope:** Agent dashboard (AgentDashboard.jsx, FloatingPreviewPanel.jsx, QueueIndicator.jsx), worker.js chat/sessions/queue/plan/commands, and related APIs.  
**Rule:** No deploy with placeholders; everything must be 100% functional or removed from the UI.

---

## 1. Chat Title Menu

### 1.1 Star conversation

| Field | Value |
|-------|--------|
| **What it is** | Toggle to star the current chat for quick access / favorites. |
| **Current state** | Placeholder. `onClick={() => { setShowChatMenu(false); }}` — only closes the menu. |
| **What's needed** | (1) DB: Add `is_starred` (INT 0/1 or BOOLEAN) to `agent_conversations` (or `agent_sessions` if that’s the source of the list). (2) Worker: PATCH `/api/agent/sessions/:id` (or dedicated endpoint) to accept `starred: true/false` and update the column. (3) Frontend: On Star click, call PATCH with toggled value, then update local state (e.g. `sessionStarred`) so the menu can show “Unstar” when starred. (4) Optional: session list or filter to show starred first. |
| **Complexity** | Medium (DB migration + one PATCH field + UI toggle). |

### 1.2 Add to Project

| Field | Value |
|-------|--------|
| **What it is** | Link the current conversation to a project (e.g. for time/project context). |
| **Current state** | Placeholder. `onClick={() => { setShowChatMenu(false); }}` — only closes the menu. |
| **What's needed** | (1) Worker: Ensure GET `/api/projects` returns list of projects (already exists at `/api/projects`). (2) DB: Conversation–project link: e.g. `project_id` on `agent_conversations` or a join table `agent_conversation_projects(conversation_id, project_id)`. (3) Worker: PATCH `/api/agent/sessions/:id` (or dedicated) to accept `project_id` and persist it. (4) Frontend: On “Add to Project”, open a small modal, fetch `/api/projects`, show selector, on confirm call PATCH with chosen `project_id`, close menu and modal. |
| **Complexity** | Medium (DB + API + modal + fetch projects). |

### 1.3 Delete conversation

| Field | Value |
|-------|--------|
| **What it is** | Permanently delete the current conversation and remove it from the session list. |
| **Current state** | Placeholder. `onClick={() => { setShowChatMenu(false); }}` — only closes the menu. |
| **What's needed** | (1) Worker: Add DELETE `/api/agent/sessions/:id` (or `/api/agent/conversations/:id`): delete or soft-delete rows in `agent_messages` and `agent_conversations` (and optionally `agent_sessions` if used). (2) Frontend: On Delete click, show confirmation modal (“Delete this conversation? This cannot be undone.”). On confirm: call DELETE, then `setCurrentSessionId(null)` (or switch to another session), clear messages, set session name to “New Conversation”, close menu. (3) Session list: ensure list fetch excludes or omits deleted conversations so it disappears from the list. |
| **Complexity** | Medium (DELETE endpoint + cascade/soft-delete + confirmation modal + list refresh). |

### 1.4 Rename

| Field | Value |
|-------|--------|
| **What it is** | Inline edit of conversation title (same as clicking the session name in the toolbar). |
| **Current state** | Functional. Opens existing rename flow: `setEditNameValue(sessionName); setIsEditingName(true); … focus()`. Save uses PATCH `/api/agent/sessions/${currentSessionId}` with `{ name }`. Worker updates `agent_conversations.name`. |
| **Verification** | End-to-end: menu Rename -> inline edit -> save -> PATCH -> name persists and is shown. |

---

## 2. Slash commands

| Field | Value |
|-------|--------|
| **What it is** | User types `/commandName`; system should run the command (e.g. from `agent_commands.command_text` or an execute API). |
| **Current state** | Placeholder. On send, if input starts with `/`, we find a matching command and append a **system message** that says: “Command /foo — description. **(Execution not yet wired.)**” No execution happens. |
| **What's needed** | (1) Worker: Add POST `/api/agent/commands/execute` (or similar) accepting `command_slug` or `command_name` and optional params; load command from `agent_commands`, run `command_text` or invoke the appropriate tool/script. (2) Frontend: When a slash command is matched, either (a) call the execute endpoint and append the result as assistant message, or (b) send a special message to chat that the worker interprets as “run this command” and streams the result. (3) Define semantics: run in sandbox, which tools, etc. |
| **Complexity** | Medium–Complex (execute endpoint + command runner + UI to show result). |

---

## 3. Voice input

| Field | Value |
|-------|--------|
| **What it is** | Microphone button: Web Speech API for real-time speech-to-text into the textarea. |
| **Current state** | Functional. `useEffect` sets up `SpeechRecognition` (continuous, interimResults), `onresult` appends final transcript to `setInput`. `toggleMic` start/stop; unsupported browser gets `alert("Voice input is not supported...")`. Button shows recording state and pulse dot. |
| **Fallback** | The alert is the intended fallback when the API is missing. No separate “fallback” path. |
| **Verification** | Works in supported browsers; in others, alert is correct. |

---

## 4. Context gauge

| Field | Value |
|-------|--------|
| **What it is** | Shows context window usage (e.g. tokens) and optionally cost; can be a tooltip and/or click popup. |
| **Current state** | Partially implemented. Gauge: circle with `contextPct`, center “X%”. **Tooltip:** `title={`Context ${contextUsedK}k / ${contextLimitK}k — Spend $${spendDisplay}`}` (native browser tooltip on hover). **No click popup:** no onClick, no modal. |
| **What's needed** | Either (1) Treat tooltip as sufficient and document it, or (2) Add an optional click handler that opens a small popover/modal with the same info plus token/cost breakdown (e.g. from `telemetry`). |
| **Complexity** | Simple if tooltip is enough; Simple for a small popover. |

---

## 5. Queue system

| Field | Value |
|-------|--------|
| **What it is** | Show queued tasks for the session; allow per-item edit/delete/send and sequential execution. |
| **Current state** | Partially implemented. **Backend:** POST adds to `agent_request_queue`; GET `/api/agent/queue/status` returns `current`, `queue_count`, `queue` (array of items). **Frontend:** Polls every 2s; `QueueIndicator` receives `current`, `queueCount`, `onClear`. It shows “Running” + “+N queued” and a **Clear** button (dismisses indicator only). **Missing:** (1) No worker or cron that sets status to `running` and processes `payload_json` (no queue consumer). (2) No UI that lists `queueStatus.queue` with per-item edit/delete/send. So queue is “display count + dismiss” only. |
| **What's needed** | (1) **Queue processor:** A consumer (worker path, cron, or Durable Object) that picks the next `queued` row for a session, sets `running`, executes the task (e.g. run chat with payload), writes result, marks complete, then processes next. (2) **UI:** Either extend `QueueIndicator` or add a panel that maps over `queueStatus.queue`, shows each item with edit/delete/send (e.g. send = move to top / run now; delete = remove from queue via new DELETE endpoint). |
| **Complexity** | Complex (processor + semantics of “run now” / reorder / delete). |

---

## 6. Tool approval (Ask mode)

| Field | Value |
|-------|--------|
| **What it is** | In Ask mode, when the model requests an action tool, show an approval card; user can Approve & Execute or Cancel. |
| **Current state** | Functional. Worker streams `tool_approval_request` with tool name/description/parameters/preview; frontend sets `pendingToolApproval`. Card shows; Approve calls POST `/api/agent/chat/execute-approved-tool` with `tool_name` and `tool_input`; worker runs the tool and returns result; frontend clears pending and appends a system message with the result. **Cancel:** `setPendingToolApproval(null)` — no extra API; conversation continues without running the tool. |
| **Rejection handling** | Cancel is implemented (clear pending, no execution). No separate “reject and tell the model” path. |
| **Verification** | End-to-end: Ask mode -> action tool -> card -> Approve or Cancel behaves as above. |

---

## 7. Session switching / loading

| Field | Value |
|-------|--------|
| **What it is** | User switches conversation; messages and title load for the selected session. |
| **Current state** | Functional. When `currentSessionId` changes: (1) Messages: fetch GET `/api/agent/sessions/${currentSessionId}/messages`, set `messages` from response. (2) Name: fetch GET `/api/agent/sessions/${currentSessionId}`, set `sessionName` from `data.name`. Worker serves messages from `agent_messages` and name from `agent_conversations`. Session list comes from GET `/api/agent/sessions` (agent_sessions + enrichment). |
| **Verification** | Switching session loads the correct history and name. |

---

## 8. Model “Auto” mode

| Field | Value |
|-------|--------|
| **What it is** | “Auto” should pick the best model per task (e.g. by intent or provider). |
| **Current state** | Partially implemented. In the UI, “Auto” sets `selectedModel = { id: "auto", display_name: "Auto" }` and `activeModel = models[0]` (first model in list). Chat request sends `model_id: activeModel?.id` — i.e. the first model. There is no logic that chooses a different model by task or intent. |
| **What's needed** | Either (1) Keep “Auto” as “use first model” and document it, or (2) Implement real auto: e.g. backend accepts `model_id: "auto"` and selects model from context (e.g. intent from a lightweight classifier or routing table). |
| **Complexity** | Simple if “first model” is accepted; Medium for intent-based routing. |

---

## 9. Plan mode execution flow

| Field | Value |
|-------|--------|
| **What it is** | Plan mode produces an execution plan; user approves; then the plan steps should run. |
| **Current state** | Partially implemented. **Plan creation:** Worker has `generate_execution_plan` tool; inserts into `agent_execution_plans` and returns `plan_id`. **UI:** When stream sends `state: WAITING_APPROVAL` with `plan_id`, frontend shows `ExecutionPlanCard` with Approve/Reject. **Approve:** Frontend calls POST `/api/agent/plan/approve` with `plan_id`; worker updates plan status to `approved`; frontend sets `agentState` to EXECUTING. **Missing:** No worker path or queue consumer that (1) reads the approved plan’s steps and (2) executes them (e.g. run tools, apply changes). So “Approve” only updates DB and UI state; execution does not run. |
| **What's needed** | A plan executor: after approval, load plan steps from `agent_execution_plans`, interpret each step (e.g. tool call, code apply), run them in order, and stream or store results. This can be tied to the queue (e.g. “plan execution” as a task type) or a dedicated “run approved plan” endpoint. |
| **Complexity** | Complex (executor + step semantics + error handling). |

---

## 10. Debug mode

| Field | Value |
|-------|--------|
| **What it is** | Mode intended for enhanced error analysis and diagnostics. |
| **Current state** | Unclear. Worker accepts `mode: 'debug'` and passes it to `chatWithToolsAnthropic`; there is no branch that treats `debug` differently from `agent` (e.g. no extra logging, no different system prompt, no “diagnostic” tools). Frontend only sets `mode` and uses `--mode-debug` for styling. |
| **What's needed** | Define behavior: e.g. (1) Stronger system prompt for “you are in debug mode, focus on errors and root cause,” and/or (2) Backend: enable additional diagnostic tools or verbose logging when `mode === 'debug'`. Then implement. |
| **Complexity** | Simple (prompt + optional tools) to Medium (if new tools or logs). |

---

## 11. Other placeholders / partial areas

| Item | State | Notes |
|------|--------|------|
| **FloatingPreviewPanel save failure** | Uses `alert("Save failed: ...")` | Intentional user feedback; not a placeholder. |
| **FloatingPreviewPanel terminal WS** | `console.log("WS readyState:", ...)` | Debug log; can be removed or guarded for production. |
| **Provider border color** | Uses hex (`#D97757`, etc.) in `providerBorderColor` | Violates “no hex in JSX/CSS” rule; should use CSS vars. |

---

## 12. Summary: Remove or implement

| Feature | Recommendation |
|---------|----------------|
| **Star** | Implement (DB + PATCH + UI toggle) or remove the Star menu item. |
| **Add to Project** | Implement (projects fetch + project_id storage + modal) or remove the menu item. |
| **Delete conversation** | Implement (DELETE endpoint + confirmation modal + list update) or remove the menu item. |
| **Rename** | Keep; already functional. |
| **Slash commands** | Implement (execute endpoint + run command_text or equivalent) or change copy to “Commands are for reference only” and do not imply execution. |
| **Voice input** | Keep; functional; alert is correct fallback. |
| **Context gauge** | Keep; tooltip is sufficient unless you add an explicit “click for details” popover. |
| **Queue** | Either (1) Implement queue processor + per-item UI (edit/delete/send), or (2) Simplify UI to “N tasks queued” with no Clear (or Clear only dismisses banner) and document that execution is not automated yet. |
| **Tool approval Cancel** | Keep; functional. |
| **Session load / switch** | Keep; functional. |
| **Auto model** | Document as “first model” or implement real auto-selection. |
| **Plan execution** | Implement plan executor after approve, or document that “Approve” only records approval and execution is not yet implemented. |
| **Debug mode** | Define and implement (prompt/tools) or remove from mode dropdown. |

---

## 13. Implementation priority (suggested)

1. **High (placeholders in main UI):** Delete conversation (DELETE + confirm + list), Star (DB + PATCH + toggle), Slash command execution or honest copy.
2. **Medium:** Add to Project (project_id + modal), Queue processor or simplified queue UX, Plan executor or clear documentation.
3. **Lower:** Context click popover (optional), Auto model semantics, Debug mode definition, Remove console.log/hex in provider color.
