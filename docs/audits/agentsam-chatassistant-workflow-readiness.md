# Agent Sam ChatAssistant Workflow Readiness Audit

Date: 2026-05-10

Scope: audit the real `/dashboard/agent` ChatAssistant path through backend chat, model routing, tool execution, workflow execution, live updates, and persistence. This is read-only architecture work except for this report.

## Executive Summary

`/dashboard/agent` is not yet ready to run extensive Cursor-level autonomous workflow protocols from one normal chat message.

The system has several important pieces already working:

- `ChatAssistant` can send authenticated, streamed chat requests to `/api/agent/chat`.
- The backend chat path can classify/gate, resolve model chains from `agentsam_ai`, stream model output, load DB-registered MCP tools, execute many built-in tools, and persist chat/tool telemetry.
- The workflow graph executor can create `agentsam_workflow_runs`, walk `agentsam_workflow_nodes` and `agentsam_workflow_edges`, update `current_node_key`, `heartbeat_at`, `steps_completed`, `step_results_json`, tokens, cost, and approval state.

The blocker is that these pieces are split. Plain chat does not start a universal workflow run, and graph workflow nodes do not yet execute the same real model/tool loop used by chat. The existing workflow executor is a ledger shell with stubbed `agent`, noop `db_query`, and mostly non-executing internal `mcp_tool` behavior.

## A. Current Chat Execution Path

### Frontend Path

Primary component:

- `dashboard/components/ChatAssistant.tsx`

Mounting and shell context:

- `dashboard/App.tsx`
- `dashboard/components/BrowserView.tsx`
- `dashboard/components/MonacoEditorView.tsx`

Submit path:

1. `ChatAssistant.handleSend()` builds the user message.
2. It enriches the message with active file, mention context, selected GitHub repo context, attachments, and `browserElementContext`.
3. It builds `FormData` with:
   - `message`
   - `mode`
   - `model`
   - `provider`
   - `conversationId`
   - `contextMode`
   - repeated `files`
4. It posts to `/api/agent/chat` with `credentials: 'same-origin'`.
5. It reads `response.body.getReader()` as SSE-like `data:` frames.

Relevant code:

```1326:1425:dashboard/components/ChatAssistant.tsx
async function handleSend(overrideMessage?: string) {
  const text = overrideMessage ?? input;
  if ((!text && attachments.length === 0) || (isLoading && !overrideMessage) || !selectedModelKey) return;
  // ...
  form.append('message', messageForApi);
  form.append('mode', mode);
  form.append('model', selectedModelKey);
  const selectedModelProvider = chatModels.find((m) => m.model_key === selectedModelKey)?.provider || 'anthropic';
  form.append('provider', selectedModelProvider);
  form.append('conversationId', effectiveConvId);
  form.append('contextMode', String(activeProject));
  // ...
  const response = await fetch('/api/agent/chat', {
    method: 'POST',
    body: form,
    signal,
    credentials: 'same-origin',
  });
```

Streaming is not browser `EventSource`; it is `fetch` plus `ReadableStream` parsing:

```1436:1487:dashboard/components/ChatAssistant.tsx
const reader = response.body.getReader();
streamReaderRef.current = reader;
const decoder = new TextDecoder();
let assistantContent = '';
let assistantStreamBuf = '';
let sseCarry = '';
// ...
sseCarry += decoder.decode(value, { stream: true });
const parts = sseCarry.split('\n\n');
// ...
const dataStr = line.replace(/^data:\s*/i, '').trim();
if (dataStr === '[DONE]') break sseLoop;
let data: unknown;
try {
  data = JSON.parse(dataStr);
```

Model picker:

- Models load from `/api/agent/models?show_in_picker=1`.
- `selectedModelKey` is passed as `model`.
- `/api/settings/default-model` is displayed as the default badge, but it does not reliably drive session auto-selection.
- Frontend `auto` is currently more mode/behavior oriented than a clear model router selection.

Workflow awareness:

- `ChatAssistant` can list workflows from `/api/agent/context-picker/catalog`, but it treats them as mention text (`wf:${id}` items).
- It does not load `agentsam_workflows`, nodes, edges, or active `agentsam_workflow_runs`.
- It has no live workflow run state model.

State locations:

- Tool approval: `pendingToolApproval` in `ChatAssistant.tsx`.
- Tool display: `execPanel` in `ChatAssistant.tsx`.
- Browser selected element: `browserElementContext` in `ChatAssistant.tsx`, set from `BrowserView` events.
- Monaco context: active file props flow from `App.tsx`; Monaco Cmd+I emits `iam:agent-refactor`, but this is not wired into the chat submit path.
- Workflow state: not a first-class ChatAssistant state. Existing workflow data is shown elsewhere in overview/analytics.

### Backend Path

Primary route:

- `POST /api/agent/chat`

Route dispatcher:

- `src/core/production-dispatch.js`
- `src/api/agent.js`

Handler:

- `agentChatSseHandler()` in `src/api/agent.js`

Request body:

- Accepts `multipart/form-data` or JSON.
- ChatAssistant uses multipart `FormData`.
- Server reads `message`, `mode`, `model`, `provider`, `conversationId`, `contextMode`, and `files`.

Response:

- `text/event-stream`
- Frames are written as `data: {"type": "...", ...}\n\n`
- Events include `context`, `text`, `error`, `tool_call`, `tool_start`, `tool_output`, `tool_done`, `tool_result`, `tool_blocked`, `approval_required`, `done`, plus file/browser side events.

Backend route evidence:

```2498:2637:src/api/agent.js
export async function agentChatSseHandler(env, request, ctx, opts = {}) {
  const { ingestBypass, identity } = opts;
  const contentType = request.headers.get('content-type') || '';
  let body = {};
  // ...
  const gate = await gateRewriteAndClassify(env, modeConfig, message, tenantId);
  const intentSlug = String(gate.intent || 'auto').toLowerCase().trim() || 'auto';
  const intentResult = await classifyIntent(env, message);

  const workflowMatch = await resolveWorkflowForMessage(env, intentResult.taskType, message, workspaceId);
  if (workflowMatch) {
    const actor = authUser || { id: userId, tenant_id: tenantId, email: null };
    return executeWorkflowAndStream(env, workflowMatch.workflow_key, message, actor, workspaceId, ctx);
  }
```

Important split:

- Plain chat continues into `runAgentToolLoop()`.
- Only a keyword/task workflow match calls `executeWorkflowAndStream()`.
- Plain chat does not create an `agentsam_workflow_runs` row.

Model routing:

- Canonical table is `agentsam_ai`, not `agentsam_ai_models`.
- `/api/agent/models` also reads from `agentsam_ai`.
- `resolveAiModelFromRequest()` resolves explicit user-selected model.
- Auto fallback uses `getDefaultModelForTask()`, Thompson arms, prompt routes, mode config, fallback rows, and workspace tier filtering.
- Provider dispatch goes through `src/core/provider.js`, which reads `agentsam_ai.api_platform`.

Tool path:

- `agentChatSseHandler()` loads tools with `loadToolsForRequest()`.
- Tool registry reads `agentsam_mcp_tools`.
- `runAgentToolLoop()` calls model stream, collects tool calls, validates tools, gates approvals, and dispatches tool calls through `dispatchToolCall()`.
- `dispatchToolCall()` routes to `src/tools/ai-dispatch.js` for built-ins.

Persistence:

- Plain chat persists to chat/session/telemetry/tool-related tables, including `agentsam_command_run`, `agentsam_agent_run`, `agentsam_usage_events`, `agent_costs`, `agentsam_tool_call_log`, MCP execution logs, and `agentsam_tool_chain`.
- Plain chat does not persist `agentsam_workflow_runs.step_results_json` or `current_node_key`.
- Chat cost fields are often scheduled with `costUsd: 0`, with later estimate fallback in some usage paths.

## B. What Currently Works

Verified code paths:

- `ChatAssistant` sends streamed authenticated requests to `/api/agent/chat` with `credentials: 'same-origin'`.
- `ChatAssistant` passes selected model key and provider to the backend.
- `ChatAssistant` appends BrowserView selected element JSON to the next chat message.
- `/api/agent/chat` resolves identity/workspace and rejects missing workspace context.
- `/api/agent/chat` supports multipart form and JSON.
- `/api/agent/chat` loads models from `agentsam_ai` and exposes them via `/api/agent/models`.
- Backend model routing supports explicit model selection and an auto chain using routing arms, prompt routes, mode preferences, and workspace tier filters.
- `gpt-5.4-nano` and `gpt-5.4-mini` are present in the static routing fallback list in `src/core/routing.js`.
- `provider.dispatchStream()` still supports OpenAI, Anthropic, Google/Gemini, Vertex, Workers AI, and Ollama based on `agentsam_ai.api_platform`.
- The chat tool loop can load `agentsam_mcp_tools`, validate tool calls, request approvals, and call built-in tools.
- Built-in tool handlers exist for browser/playwright, D1-style tools, R2, terminal, GitHub, knowledge search, and related surfaces through the chat tool dispatcher.
- `executeWorkflowGraph()` loads `agentsam_workflows`, `agentsam_workflow_nodes`, and `agentsam_workflow_edges`.
- `executeWorkflowGraph()` creates `agentsam_workflow_runs`.
- `executeWorkflowGraph()` updates `current_node_key`, `heartbeat_at`, `steps_completed`, and `step_results_json` after each node.
- `executeWorkflowGraph()` aggregates node usage into run-level `input_tokens`, `output_tokens`, `cost_usd`, and `model_used` when node outputs include usage.
- `approval_gate` workflow nodes create `agentsam_approval_queue` rows and mark workflow runs as awaiting approval.
- `executeWorkflowAndStream()` can emit workflow SSE events (`workflow_start`, `workflow_step`, `workflow_complete`, `workflow_error`, `workflow_approval_required`).
- Historical run surfaces exist in overview/analytics, especially `ToolWaterfall`, `WorkflowPanel`, and `overview-bundle`.

Workflow graph persistence evidence:

```472:563:src/core/workflow-executor.js
export async function executeWorkflowGraph(env, opts) {
  // ...
  const workflow = await env.DB.prepare(
    `SELECT * FROM agentsam_workflows WHERE workflow_key = ? AND is_active = 1 LIMIT 1`,
  )
    .bind(workflowKey)
    .first();
  // ...
  const nRes = await env.DB.prepare(
    `SELECT * FROM agentsam_workflow_nodes
       WHERE workflow_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY sort_order ASC`,
  )
  // ...
  await env.DB.prepare(
    `INSERT INTO agentsam_workflow_runs (
      id, workflow_id, workflow_key, tenant_id, workspace_id,
      user_id, user_email, trigger_type, status,
      input_json, output_json, step_results_json, metadata_json,
      steps_total, steps_completed, environment,
      graph_mode, current_node_key,
      started_at, created_at, updated_at
    ) VALUES (
```

Per-step updates:

```624:689:src/core/workflow-executor.js
await env.DB
  .prepare(
    `UPDATE agentsam_workflow_runs SET
        current_node_key = ?,
        heartbeat_at     = unixepoch(),
        updated_at       = datetime('now')
      WHERE id = ?`,
  )
// ...
await env.DB
  .prepare(
    `UPDATE agentsam_workflow_runs SET
        steps_completed   = ?,
        step_results_json = ?,
        updated_at        = datetime('now')
      WHERE id = ?`,
  )
```

## C. What Is Missing

### Chat Is Not Yet the Universal Workflow Entrypoint

Plain `/api/agent/chat` does not create an `agentsam_workflow_runs` row. It only enters workflow mode if `resolveWorkflowForMessage()` matches an existing workflow shortcut.

Required behavior is:

`/api/agent/chat` should always create a run for `workflow_key = 'agent_universal_autonomous_run'` when running in autonomous Agent Sam mode, then stream the workflow-run state back to the UI.

### Universal Workflow Nodes Are Not Real Runtime Steps Yet

The graph executor has node dispatch, but key node types are stubs:

```79:188:src/core/workflow-executor.js
async function dispatchNode(env, node, input, runContext) {
  // ...
  switch (nodeType) {
    case 'agent': {
      const { agentChatStep } = await import('./agent-step.js').catch(() => ({ agentChatStep: null }));
      if (agentChatStep) {
        return agentChatStep(env, { handler_key: handlerKey, input, runContext });
      }
      const prompt = JSON.stringify(input);
      return { ok: true, output: { result: prompt, note: 'agent_stub' } };
    }
    // ...
    case 'db_query': {
      return { ok: true, output: { logged: false, note: 'db_query noop — use dedicated analytics pipeline' } };
    }
```

Gaps:

- `src/core/agent-step.js` does not exist.
- `agent` nodes do not call OpenAI/mini/nano.
- `db_query` nodes do not query D1 or Hyperdrive.
- `branch` nodes always return `branch: 'default'`.
- `mcp_tool` nodes for `builtin`, `r2`, `terminal`, and `proxy` only return `tool_dispatched`; they do not execute the same real tool dispatcher used by chat.
- `script` and `webhook` are allowed table node types but are not implemented in `dispatchNode()`.
- There is no dynamic loop node that repeats `execute_next_step -> observe_result -> decide_continue_or_finish` beyond static DAG traversal. The current executor also detects cycles and stops, so it cannot represent the universal loop as a cyclic edge graph.

### Live Chat UI Does Not Consume Workflow SSE

Backend can emit:

- `workflow_start`
- `workflow_step`
- `workflow_complete`
- `workflow_error`
- `workflow_approval_required`

`ChatAssistant` currently handles:

- text-like chunks
- `tool_approval_request`
- `r2_file_updated`
- `browser_navigate`
- `tool_start`
- `tool_output`
- `tool_done`
- `conversation_id`

There is no first-class active run state, generated plan state, current node display, workflow step timeline, raw run inspector, or workflow approval card in `ChatAssistant`.

### Approval Event Names Do Not Align

Backend chat tool loop emits `approval_required`.

`ChatAssistant` opens the approval modal on `tool_approval_request`.

Also, `ChatAssistant` posts approvals to `/api/agent/chat/execute-approved-tool`, but no backend handler for that path was found under `src/`.

### OpenAI Tool Streaming Is Not Fully Wired

The chat loop is strong for Anthropic-style tool use. For OpenAI streaming, `chatWithToolsOpenAI()` proxies OpenAI SSE, but the generic SSE text consumer path does not parse streamed `delta.tool_calls` into the same tool loop. That matters for `gpt-5.4-nano -> gpt-5.4-mini` autonomous protocols where OpenAI models need to select and call tools.

### Workflow Runs Miss Some Required Ledger Fields

Graph runs update tokens, cost, model, steps, current node, and final status, but:

- `duration_ms` is not set on graph `agentsam_workflow_runs`.
- `supabase_sync_*` fields are not updated by the graph executor.
- Initial graph run insert does not explicitly set `input_tokens = 0`, `output_tokens = 0`, `cost_usd = 0`, relying on D1 defaults.
- Plain chat telemetry persists outside `agentsam_workflow_runs`, so the live run ledger is incomplete for normal chat.

### Tool Registry Exists, But Workflow Executor Does Not Use It Fully

The chat tool registry is DB-driven through `agentsam_mcp_tools` and built-in dispatch. The graph executor does a much narrower lookup by `tool_key` and does not call the chat tool dispatcher for internal tools.

This prevents `agent_universal_autonomous_run` from executing:

- browser inspection
- D1 query/write gates
- R2 publish
- GitHub file read/patch paths
- terminal validation
- Hyperdrive checks
- artifact registration

from workflow nodes unless each is separately bridged.

### `/dashboard/agent` Has Historical/Adjacent Run UI, Not Live Run UI

Existing UI surfaces:

- `dashboard/components/overview/panels/ToolWaterfall.tsx`
- `dashboard/components/overview/panels/WorkflowPanel.tsx`
- `dashboard/components/analytics/tabs/OverviewTab.tsx`
- `dashboard/pages/library/LibraryPage.tsx`
- `dashboard/components/BrowserView.tsx`
- `dashboard/components/MonacoEditorView.tsx`

Missing in the main ChatAssistant path:

- no `LiveExecutionPanel` component
- no workflow SSE consumer
- no active `run_id` state
- no `current_node_key` state
- no `steps_completed / steps_total` state
- no raw `agentsam_workflow_runs` inspector
- no artifact card attached to workflow completion
- no browser/Monaco handoff attached to workflow step results

## D. Required Minimal Patch Plan

Smallest patch plan to make:

`chat message -> universal workflow run -> dynamic plan -> tool loop -> persisted step ledger -> live UI timeline -> final answer`

work without new tables or workflow buttons:

1. Make `/api/agent/chat` start the universal workflow in autonomous mode.
   - In `agentChatSseHandler()`, after identity/workspace resolution and basic command gating, create or delegate to `agent_universal_autonomous_run`.
   - Preserve a fallback for plain non-agent chat modes if needed.
   - Return workflow SSE to the existing stream, not a separate button/action.

2. Add a real graph agent step executor.
   - Add `src/core/agent-step.js`.
   - Implement handlers:
     - `openai.nano.understand_request`
     - `registry.discover_agent_capabilities`
     - `openai.mini.build_execution_plan`
     - `approval.dynamic_risk_budget_gate`
     - `agent_loop.execute_next_step`
     - `openai.nano.observe_result`
     - `agent_loop.decide_continue_or_finish`
     - `agent_loop.persist_final_answer`
   - Reuse existing model routing/provider code instead of duplicating OpenAI clients.

3. Bridge workflow node tool execution to the existing chat tool dispatcher.
   - Export or wrap `dispatchToolCall()` / `validateToolCall()` safely.
   - Let workflow `mcp_tool` and `agent_loop.execute_next_step` call registered tools from `agentsam_mcp_tools`.
   - Preserve approval gates for high-risk actions.

4. Implement dynamic loop state inside one graph node handler.
   - Do not make cyclic graph edges.
   - Keep `execute_next_step` as the handler-owned loop that repeatedly:
     - chooses next action
     - executes one tool/model step
     - observes
     - updates run row
     - checks max steps/cost/tokens/time/risk
   - Append each loop iteration to `step_results_json`.

5. Persist complete run ledger fields.
   - On run create, explicitly set `workflow_key`, `status`, `input_json`, `step_results_json`, `current_node_key`, `steps_total`, `input_tokens = 0`, `output_tokens = 0`, `cost_usd = 0`, `heartbeat_at`.
   - On every step, update `current_node_key`, `steps_completed`, `step_results_json`, `input_tokens`, `output_tokens`, `cost_usd`, `heartbeat_at`.
   - On finish, set `output_json`, `duration_ms`, `completed_at`, `kill_reason` if any.

6. Normalize approval events.
   - Either emit `tool_approval_request` from the backend or teach `ChatAssistant` to handle `approval_required` and `workflow_approval_required`.
   - Add or correct the backend approval execution endpoint used by `ChatAssistant`, or switch the UI to the existing workflow approval endpoint.

7. Teach `ChatAssistant` to consume workflow SSE.
   - No new UI yet; minimally store:
     - `activeRunId`
     - `workflowEvents`
     - `currentNodeKey`
     - `stepsCompleted`
     - `stepsTotal`
     - `runCost`
     - `runTokens`
     - `approval`
   - Render existing `execPanel` rows from workflow events until a proper live panel is built.

8. Wire artifact completion.
   - Use existing `agentsam_artifacts` and Library API.
   - On successful website generation, persist/register the artifact and emit an SSE event that ChatAssistant can surface and Library can refresh.

## E. File Map

Frontend files to inspect/change:

- `dashboard/components/ChatAssistant.tsx`
- `dashboard/App.tsx`
- `dashboard/components/BrowserView.tsx`
- `dashboard/components/MonacoEditorView.tsx`
- `dashboard/pages/library/LibraryPage.tsx`
- `dashboard/api/artifacts.ts`
- `dashboard/components/overview/panels/ToolWaterfall.tsx`
- `dashboard/components/overview/panels/WorkflowPanel.tsx`

Backend files to inspect/change:

- `src/api/agent.js`
- `src/core/workflow-executor.js`
- `src/core/workflows.js`
- `src/core/provider.js`
- `src/core/routing.js`
- `src/integrations/openai.js`
- `src/tools/ai-dispatch.js`
- `src/core/agentsam-mcp-tools.js`
- `src/core/agent-terminal-run.js`
- `src/core/mcp-tool-execution.js`
- `src/core/agent-costs.js`
- `src/core/agent-run-routing.js`
- `src/api/command-run-telemetry.js`

New code file likely needed:

- `src/core/agent-step.js`

Seed already created:

- `migrations/318_seed_agent_universal_autonomous_run.sql`

Audit report:

- `docs/audits/agentsam-chatassistant-workflow-readiness.md`

## F. No-New-Table Rule

Existing tables are enough for the next patch.

Confirmed sufficient:

- `agentsam_workflows`
- `agentsam_workflow_nodes`
- `agentsam_workflow_edges`
- `agentsam_workflow_runs`
- `agentsam_ai`
- `agentsam_scripts`
- `agentsam_commands`
- `agentsam_mcp_tools`
- `agentsam_approval_queue`
- `agentsam_execution_steps`
- `agentsam_executions`
- `agentsam_artifacts`
- existing telemetry/cost/tool log tables

Note: the user mentioned `agentsam_ai_models`, but this codebase uses `agentsam_ai` as the canonical model registry. The report and patch plan should follow the actual code, not introduce a parallel model table.

No new table is required for:

- universal chat run creation
- model routing
- dynamic planning
- tool dispatch
- approval gates
- step ledger persistence
- cost/token/duration capture
- artifact registration
- live UI stream state

## G. First Executable Target

Recommended first end-to-end chat command:

> Build a website with gpt-5.4-nano and gpt-5.4-mini, validate it, persist the run, and publish/register the artifact.

Why this is the right target:

- It matches the successful proof already completed.
- It exercises cheap model routing:
  - nano for classify/validate/summarize
  - mini for planning/generation
- It exercises the universal workflow ledger:
  - create `agentsam_workflow_runs`
  - write `step_results_json`
  - update `current_node_key`
  - persist tokens/cost/duration
- It exercises tool execution:
  - generate files
  - run local validation
  - publish/register artifact
- It creates a user-visible final output through existing artifact/library concepts.

Minimum acceptance criteria:

- A normal `/dashboard/agent` chat message starts `agent_universal_autonomous_run` without a workflow button.
- The run row is visible in D1 while active.
- `current_node_key`, `steps_completed`, `step_results_json`, `input_tokens`, `output_tokens`, `cost_usd`, and `heartbeat_at` change during execution.
- The final row has `status = 'completed'`, `duration_ms`, `completed_at`, and `output_json`.
- The UI stream shows the plan, active step/tool, validation result, final answer, and artifact reference.
- No new tables, no smoke workflow, no workflow button.

## Bottom Line

Agent Sam has the ingredients for an autonomous runtime, but the global `ChatAssistant` is not yet wired as that runtime.

The shortest path is not more UI and not more workflows. It is to connect `/api/agent/chat` to `agent_universal_autonomous_run`, implement the missing graph `agent-step` / tool-loop bridge, persist every loop iteration into `agentsam_workflow_runs`, and teach `ChatAssistant` to read the workflow SSE events it already receives over the same stream.
