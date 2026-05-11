# Agent Sam — Workspace capability surface map (Phase 1 audit)

Date: 2026-05-10  
Purpose: file/event/route map for **ChatAssistant → capability router → existing tools → UI shells**. No new tool registries; adapters call `dispatchToolCall` / existing APIs.

## Mental model

| Layer | Role |
|--------|------|
| **BrowserView** | User-facing iframe + DOM pick → context only (`iam:browser-element-selected`, `iam-browser-surface-context`). |
| **Server browser tools** | `browser_*`, `cdt_*`, `playwright_screenshot` via `src/tools/builtin/web.js` → `/api/browser/invoke` (trusted origins). |
| **Monaco** | `ChatAssistant` `onFileSelect` / `r2_file_updated` / code blocks → `App.openInMonacoFromChat`. |
| **Excalidraw / design** | `ExcalidrawView` listens `iam:excalidraw_action`; `App` collab WS relays `iam_excalidraw`. |
| **Artifacts / R2** | Tools + `scheduleAgentsamArtifactFromChatOutput` in `agent.js`; library APIs in `src/api/agent-artifacts.js`. |
| **D1 / Hyperdrive** | Dashboard DB routes, `SQLConsole`, MCP/D1 tools via `ai-dispatch` / `loadToolsForRequest`. |
| **Terminal / scripts** | `onRunInTerminal`, built-in terminal tools, approval gates in `runAgentToolLoop`. |
| **MCP** | `loadToolsForRequest` → `dispatchToolCall` → `runBuiltinTool` / MCP proxy. |
| **GitHub** | Context in chat (`githubRepoContext`); tools via registry. |
| **Workflow ledger** | `src/core/workflow-executor.js` → `agentsam_workflow_runs` (universal chat bridge when enabled). |

## Primary files (by surface)

### Chat orchestration

| File | Notes |
|------|------|
| `dashboard/components/ChatAssistant.tsx` | `fetch` + `ReadableStream` SSE; `browserElementContext`; `onBrowserNavigate`, `onFileSelect`, `onR2FileUpdated`; FormData → `/api/agent/chat`. |
| `src/api/agent.js` | `agentChatSseHandler`, `runAgentToolLoop`, `dispatchToolCall`, tool load, SSE `emit`. |
| `src/core/provider.js` | `dispatchStream` / model routing. |
| `src/tools/ai-dispatch.js` | Routes tool names to builtins (incl. `browser_*`). |
| `src/tools/builtin/web.js` | Browser/search handlers → `invokeBrowserOp`. |

### Browser (UI)

| File | Notes |
|------|------|
| `dashboard/components/BrowserView.tsx` | Iframe, `iam-navigation`, `iam-element-selected` → `iam:browser-element-selected` (includes `url`, `route_path`). |
| `dashboard/App.tsx` | `handleBrowserNavigateFromAgent` → `setBrowserUrl`, `openTab('browser')`. |
| `src/integrations/playwright.js` | Worker browser job API glue. |
| `src/core/agentsam-ops-ledger.js` | `assertBrowserTrustedOrigin`. |

### Monaco / code

| File | Notes |
|------|------|
| `dashboard/components/MonacoEditorView.tsx` | Editor surface. |
| `dashboard/App.tsx` | `openInMonacoFromChat`, `handleR2FileUpdatedFromAgent`, `openTab('code')`. |

### Excalidraw / canvas

| File | Notes |
|------|------|
| `dashboard/components/ExcalidrawView.tsx` | `iam:excalidraw_action`, `iam:canvas_update`; persists via `/api/collab/canvas/*`. |
| `dashboard/App.tsx` | Collab WS: `iam_excalidraw` → `iam:excalidraw_action`; `openTab('excalidraw')`. |

### Artifacts / R2

| File | Notes |
|------|------|
| `src/api/agent-artifacts.js` | Artifact library HTTP API. |
| `src/api/agent.js` | `scheduleAgentsamArtifactFromChatOutput`, R2-related tool paths. |
| `wrangler.production.toml` | `ASSETS`, `DASHBOARD`, `R2`, etc. |

### D1 / database UI

| File | Notes |
|------|------|
| `dashboard/App.tsx` | Rail → `/dashboard/database`. |
| `dashboard/components/SQLConsole.tsx` | Monaco + SQL execution surface. |

### MCP

| File | Notes |
|------|------|
| `dashboard/.../McpPage.tsx`, `MCPPanel` | Alternate chat clients. |
| `src/api/agent.js` | `mcpPanelAgentChatSse`, shared `runAgentToolLoop`. |

## Events (browser shell ↔ chat)

| Event | Direction | Payload / use |
|-------|-----------|----------------|
| `iam:browser-element-selected` | BrowserView → ChatAssistant | DOM pick; appended to next message. |
| `iam-browser-surface-context` | BrowserView → global | Current URL, route, viewport for FormData `browserContext`. |
| `iam:agent-open-surface` | ChatAssistant / SSE → App | Open `browser` / `excalidraw` / `code` tab. |
| `iam:excalidraw_action` | WS / tools → ExcalidrawView | `{ action, params }`. |
| SSE `browser_navigate` | Worker → ChatAssistant | `onBrowserNavigate` opens Browser tab. |
| SSE `capability_selected` | Worker → ChatAssistant | Nano capability routing decision (Phase 2+). |

## Implemented bridge (incremental)

| Piece | Location |
|--------|-----------|
| Capability router (nano + heuristic fallback) | `src/core/capability-router.js` |
| Agent mode: classify → system prompt + SSE | `src/api/agent.js` (`capability_selected`, `surface_open`, aliases) |
| Browser surface snapshot on navigate / URL change | `dashboard/components/BrowserView.tsx` → `iam-browser-surface-context` |
| FormData `browserContext` + SSE surface / capability handling | `dashboard/components/ChatAssistant.tsx` |
| Shell opens Browser / Excalidraw / Code from SSE | `dashboard/App.tsx` → `iam:agent-open-surface` |
| Workflow ledger strip (minimal) | `ChatAssistant` state + SSE `workflow_*` |

## Next implementation slices (reference)

1. **Capability adapters**: map `needs_capabilities` → concrete tool names + args validation (still `dispatchToolCall` only).  
2. **Persistence**: append capability steps into `agentsam_workflow_runs.step_results_json` when chat is tied to universal workflow.  
3. **Proof prompts**: browser inspect URL, Monaco file, Excalidraw scene, full multi-surface flow — exercise trusted origins + tool allowlists.  
4. **`approval_required` vs `tool_approval_request`**: normalize SSE types if backend emits both.

## Real Action Runtime Status

| Layer | Status |
|--------|--------|
| Router | Wired (`src/core/capability-router.js` → agent chat system prompt + SSE `capability_selected`). |
| UI surface opening | Wired (SSE `surface_open` / `agent_surface_open`; browser URL via `browser_navigate`). |
| Browser adapter | Wired (`src/core/workspace-capability-actions/browser.js` → `runBuiltinTool`, trusted origins, registry-gated tools, `agentsam_workflow_runs`). |
| Monaco adapter | Scaffolded / minimal (`monaco.js`: `surface_open` code tab, draft artifact, explicit-write-only tool path). |
| Excalidraw adapter | Scaffolded / minimal (`excalidraw.js`: scene JSON in `output_json`, optional `excalidraw_*` builtins). |
| Workflow ledger | Required for every action path (`runWorkspaceCapabilityAction` inserts/finalizes D1 run + SSE `workflow_*`). |
| Tool registry dedupe | Required (`src/core/tool-registry.js`: `agentsam_tools` + `agentsam_mcp_tools`, scope-ranked by workspace/tenant/user). |

**Shell workflow (D1 FK):** `wf_workspace_capability_runtime` — migration `migrations/319_workspace_capability_mcp_workflow.sql`. Per-run labels use `workflow_key` `workspace_capability_browser` \| `workspace_capability_monaco` \| `workspace_capability_excalidraw`.

**E2E:** `scripts/e2e/workspace-capability-real-action.mjs` (ingest-authenticated `POST /api/agent/chat`, browser prompt only).
