# COMPREHENSIVE AGENT SAM ASSESSMENT
**Evidence only. No guessing.**
**Generated:** 2026-03-16

---

## 1. FILE INVENTORY

### Commands run
```bash
find static/dashboard/agent -type f \( -name "*.jsx" -o -name "*.js" -o -name "*.css" \)
find dashboard -name "agent.html"
find agent-dashboard -type f \( -name "*.jsx" -o -name "*.js" -o -name "*.css" \)  # filtered to source only below
```

### Agent-related files (source + built)

| File path | Line count | Last modified |
|-----------|------------|--------------|
| `static/dashboard/agent/agent-dashboard.js` | 80 (bundle summary; file ~274KB) | 2026-03-16 12:00 |
| `static/dashboard/agent.html` | 2003 | 2026-03-16 15:46 |
| `dashboard/agent.html` | 1269 | 2026-03-16 15:46 |
| `dashboard/pages/agent.html` | (exists in find) | - |
| `agent-dashboard/src/AgentDashboard.jsx` | 3131 | 2026-03-16 11:54 |
| `agent-dashboard/src/AnimatedStatusText.jsx` | 92 | 2026-03-12 14:03 |
| `agent-dashboard/src/ExecutionPlanCard.jsx` | 90 | 2026-03-12 14:13 |
| `agent-dashboard/src/FloatingPreviewPanel.jsx` | 1425 | 2026-03-12 17:30 |
| `agent-dashboard/src/QueueIndicator.jsx` | 96 | 2026-03-12 19:50 |
| `agent-dashboard/src/main.jsx` | 9 | 2026-03-11 14:06 |
| `agent-dashboard/src/index.css` | 110 | - |
| `agent-dashboard/dist/agent-dashboard.js` | (build output) | - |
| `agent-dashboard/dist/agent-dashboard.css` | (build output) | - |

**Note:** `static/dashboard/agent/` contains only the built bundle `agent-dashboard.js` (no separate .jsx/.css). Source lives in `agent-dashboard/src/`.

---

## 2. REACT COMPONENTS AUDIT

### Command
```bash
grep -r "export default\|export function\|export const" agent-dashboard/src/*.jsx
```

### Components

| Component | File |
|-----------|------|
| AgentDashboard (export default) | agent-dashboard/src/AgentDashboard.jsx:149 |
| QueueIndicator (export default) | agent-dashboard/src/QueueIndicator.jsx:1 |
| FloatingPreviewPanel (export default) | agent-dashboard/src/FloatingPreviewPanel.jsx:89 |
| ExecutionPlanCard (export default) | agent-dashboard/src/ExecutionPlanCard.jsx:1 |
| AnimatedStatusText (export default) | agent-dashboard/src/AnimatedStatusText.jsx:8 |

**Entry:** `main.jsx` renders `<AgentDashboard />` into `#agent-dashboard-root`.

---

## 3. FEATURE DETECTION (What's Built)

Searches run in **agent-dashboard/src/** (source). Built bundle is single JS file.

### a) Monaco Editor
**YES.**  
- FloatingPreviewPanel.jsx:2 `import Editor from "@monaco-editor/react";`
- FloatingPreviewPanel.jsx:3 `import { DiffEditor } from "@monaco-editor/react";`
- FloatingPreviewPanel.jsx:155 `monacoEditorRef`
- FloatingPreviewPanel.jsx:466 `monacoEditorRef.current?.getValue()`
- FloatingPreviewPanel.jsx:551 `monacoEditorRef.current.setValue(saved)`
- FloatingPreviewPanel.jsx:1298 `<DiffEditor`
- FloatingPreviewPanel.jsx:1312 `monacoEditorRef.current = editors;`
- FloatingPreviewPanel.jsx:1342 `<Editor`
- FloatingPreviewPanel.jsx:1349 `monacoEditorRef.current = editor;`

### b) File Browser/Tree
**NO.**  
- No matches for: `FileTree`, `file-browser`, `files-panel`, `file.*tree` in agent-dashboard/src.

Files UI is a flat list (R2/GDrive/GitHub) in FloatingPreviewPanel, not a tree component.

### c) Terminal Integration
**YES.**  
- AgentDashboard.jsx:246 `activeTab` "terminal"
- AgentDashboard.jsx:1475,1477,1480 `title="Terminal"`, `setActiveTab("terminal")`
- FloatingPreviewPanel.jsx:5,6 TAB_LABELS "Terminal", TAB_ORDER
- FloatingPreviewPanel.jsx:22 `sh: "shell", bash: "shell", zsh: "shell"`
- FloatingPreviewPanel.jsx:117-122 terminal state/refs
- FloatingPreviewPanel.jsx:575-675 Terminal WebSocket, `/api/agent/terminal/ws`, `sendTerminalKey`, `runCommandInTerminal`, `/api/agent/terminal/run`
- FloatingPreviewPanel.jsx:1392-1409 TERMINAL TAB UI, `terminalOutputRef`, `terminalInputRef`, `sendTerminalKey`

### d) Browser Preview
**YES.**  
- FloatingPreviewPanel.jsx:51,70,75,810,850,938 iframes (View tab, PDF, Browser tab)

### e) Diff View
**YES.**  
- FloatingPreviewPanel.jsx:3 `DiffEditor` from @monaco-editor/react
- FloatingPreviewPanel.jsx:1298 `<DiffEditor` (original/modified from chat)

### f) Chat Handler
**YES.**  
- AgentDashboard.jsx:865 `const sendMessage = async () => {`
- AgentDashboard.jsx:2731,2843 `sendMessage()` (button/onSubmit)

---

## 4. COMPONENT WIRING (What's Connected)

### a) AgentDashboard.jsx – props passed to FloatingPreviewPanel

```jsx
<FloatingPreviewPanel
  open={previewOpen}
  onClose={() => setPreviewOpen(false)}
  activeTab={activeTab}
  onTabChange={setActiveTab}
  previewHtml={previewHtml}
  onPreviewHtmlChange={setPreviewHtml}
  browserUrl={browserUrl}
  onBrowserUrlChange={setBrowserUrl}
  codeContent={codeContent}
  onCodeContentChange={setCodeContent}
  isDarkTheme={true}
  activeThemeSlug={activeThemeSlug}
  proposedFileChange={proposedFileChange}
  onProposedChangeResolved={() => setProposedFileChange(null)}
  monacoDiffFromChat={monacoDiffFromChat}
  onMonacoDiffResolved={() => setMonacoDiffFromChat(null)}
  connectedIntegrations={connectedIntegrations}
  runCommandRunnerRef={runCommandRunnerRef}
  availableCommands={availableCommands}
/>
```

**Not passed:** `onFileContextChange`, `onBrowserScreenshotUrl`. FloatingPreviewPanel accepts them in its signature but AgentDashboard does not pass `onFileContextChange`.

### b) FloatingPreviewPanel.jsx – callbacks exposed (props + internal)

**Props (callbacks):**  
`onClose`, `onTabChange`, `onPreviewHtmlChange`, `onBrowserUrlChange`, `onCodeContentChange`, `onFileContextChange`, `onProposedChangeResolved`, `onMonacoDiffResolved`.

**Internal handlers (used in panel):**  
- `saveFileToR2` (462), `handleKeepChangesFromChat` (516), `handleUndoFromChat` (543), `handleUndoChanges` (548)  
- `onFileContextChange?.({ filename: codeFilename, content: codeContent, bucket: filesBucket })` called in useEffect (559-562).

### c) Chat component – what it receives from parent

Chat UI is **inline in AgentDashboard.jsx** (no separate chat component file). It uses:
- State: `messages`, `input`, `currentSessionId`, `sessionName`, `model`, `mode`, etc.
- Refs: `messagesEndRef`, `textareaRef`, `abortControllerRef`
- Handlers: `sendMessage` (865), session/context/bootstrap from parent state
- No dedicated "Chat" component with a props interface; everything is in AgentDashboard.

---

## 5. API ENDPOINTS (What Worker Supports)

Grep: `pathLower === '/api/agent...'`, `pathLower === '/api/r2...'`, `pathLower === '/api/terminal...'` in worker.js.

### Agent-related

| Endpoint | Method | worker.js line |
|----------|--------|----------------|
| /api/agent/commands/execute | POST | 652 |
| /api/agent/boot | GET | 2685 |
| /api/agent/conversations/search | GET | 2722 |
| /api/agent/terminal/ws | GET | 2812 |
| /api/agent/terminal/run | POST | 2875 |
| /api/agent/terminal/complete | POST | 2896 |
| /api/agent/models | GET | 3088 |
| /api/agent/sessions | GET | 3097 |
| /api/agent/chat | POST | 3157 |
| /api/agent/playwright | POST | 3780 |
| /api/agent/mcp | (branch) | 3794 |
| /api/agent/cicd | (branch) | 3801 |
| /api/agent/telemetry | (branch) | 3812 |
| /api/agent/rag/query | POST | 3823 |
| /api/agent/rag/index-memory | POST | 3840 |
| /api/agent/rag/compact-chats | POST | 3853 |
| /api/agent/queue | POST | 3873 |
| /api/agent/queue/status | GET | 3898 |
| /api/agent/plan/approve | POST | 3942 |
| /api/agent/plan/reject | POST | 3959 |
| /api/agent/chat/execute-approved-tool | POST | 3976 |
| /api/agent/today-todo | GET | 4077 |
| /api/agent/today-todo | PUT | 4103 |
| /api/agent/context/bootstrap | GET | 4128 |
| /api/agent/bootstrap | GET | 4150 |

### R2

| Endpoint | Method | worker.js line |
|----------|--------|----------------|
| /api/r2/stats | GET | 2209 |
| /api/r2/sync | POST | 2232 |
| /api/r2/buckets | GET | 2265 |
| /api/r2/list | GET | 2302 |
| /api/r2/search | GET | 2372 |
| /api/r2/upload | POST | 2404 |
| /api/r2/delete | DELETE | 2417 |
| /api/r2/file | DELETE | 2427 |
| /api/r2/url | GET | 2439 |
| /api/r2/buckets/bulk-action | POST | 2447 |
| /api/r2/buckets/{name}/object/{key} | GET, PUT | 2591 objectKeyMatch, 2621 PUT |

### Terminal

| Endpoint | Method | worker.js line |
|----------|--------|----------------|
| /api/terminal/session/register | POST | 2732 |
| /api/terminal/session/resume | GET | 2774 |

---

## 6. DATABASE VERIFICATION (What's Actually Writing)

**Database:** D1 `inneranimalmedia-business` (remote).  
**Commands:**  
`./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote --command "SELECT ..." -c wrangler.production.toml`

### Table counts (full results)

| Table | total |
|-------|-------|
| agent_messages | 1026 |
| agent_conversations | 283 |
| agent_costs | 6 |
| agent_audit_log | 3 |
| rag_chunks | 0 |
| terminal_history | 2 |

### mcp_tool_calls by tool_name

| tool_name | count |
|-----------|-------|
| d1_query | 32 |
| get_worker_services | 1 |
| human_context_list | 1 |
| knowledge_search | 17 |
| platform_info | 1 |
| r2_bucket_summary | 2 |
| r2_list | 7 |
| r2_read | 4 |
| r2_search | 8 |
| r2_write | 2 |
| terminal_execute | 38 |

### Agent-related tables present (from sqlite_master)

agent_actions, agent_ai_executable_limits, agent_ai_sam, agent_audit_log, agent_capabilities, agent_command_audit_log, agent_command_conversations, agent_command_executions, agent_command_integrations, agent_command_proposals, agent_commands, agent_configs, agent_conversations, agent_costs, agent_cursor_rules, agent_execution, agent_execution_plans, agent_file_changes, agent_intent_execution_log, agent_intent_patterns, agent_memory_index, agent_platform_context, agent_policy_templates, agent_prompts, agent_question_templates, agent_recipe_prompts, agent_request_queue, agent_role_bindings, agent_roles, agent_runs, agent_runtime_configs, agent_scopes, agent_sessions, agent_tasks, agent_telemetry, agent_tools, agent_workspace_state, mcp_tool_calls, rag_chunks, terminal_history.

---

## 7. MISSING CONNECTIONS (What's Not Wired)

### a) Does AgentDashboard pass onFileContextChange to FloatingPreviewPanel?

**NO.**  
- Grep for `onFileContextChange` in AgentDashboard.jsx: **no matches.**  
- FloatingPreviewPanel.jsx:101 declares prop `onFileContextChange` and uses it at 561:  
  `onFileContextChange?.({ filename: codeFilename, content: codeContent, bucket: filesBucket });`  
- AgentDashboard does not pass this prop (see section 4a).

### b) Does the chat input have access to Monaco's current file content?

**NO.**  
- Chat input and send logic live in AgentDashboard; there is no state or prop that holds "current Monaco file content" there.  
- Monaco content is in FloatingPreviewPanel (`codeContent`, `onCodeContentChange`). The only bridge would be `onFileContextChange`, which is not passed, so the chat input never receives Monaco's current file content.

### c) Is there a "Send to Agent" or "@file" mention feature?

**NO.**  
- Grep for `Send to Agent`, `@file`, `mention.*file` in agent-dashboard/src: **no matches.**

### d) Does agent_costs table get written to on each chat message?

**NO.**  
- On each chat message the worker writes: **agent_messages**, **agent_telemetry**, **spend_ledger** (worker.js 3412-3414, 3517-3519, 3524-3526, 3607-3609, 3739-3743, 3750-3752, etc.).  
- **agent_costs** is written only in **runToolLoop** (worker.js 1679-1682), when a tool run completes:  
  `INSERT INTO agent_costs (model_used, tokens_in, tokens_out, cost_usd, task_type, user_id, created_at) VALUES (?, ?, ?, ?, ?, 'agent_sam', datetime('now'))`  
So: **agent_costs** is written on **tool execution**, not on every chat message. Chat cost is recorded in **agent_telemetry** and **spend_ledger** only.

---

## 8. TOOLS REGISTERED (MCP + Built-in)

- Grep for `registerTool`, `availableTools`, `toolsList` in agent-dashboard/src:  
  Only hit is AgentDashboard.jsx:47 (prompt text "List all rows from agent_tools...").  
- No client-side tool registry in the dashboard; tools are invoked by the worker (e.g. MCP, runToolLoop).  
- **mcp_tool_calls** (section 6) shows tools actually used: d1_query, knowledge_search, r2_*, terminal_execute, etc. Tool definitions live in the worker/MCP, not in the React app.

---

## 9. KNOWN ISSUES / TODOs

### agent-dashboard/src
- Grep for `TODO`, `FIXME`, `HACK`, `BUG`: **no matches.**

### dashboard/agent.html
- 1166: `/* TODO: switch account */`
- 1167: `/* TODO: change photo */`

---

## Summary

- **Built:** Monaco (Editor + Diff), terminal (WS + run), browser preview (iframes), chat (sendMessage), R2 file list/save, Keep Changes/Undo for diff from chat.  
- **Wired:** Props from AgentDashboard to FloatingPreviewPanel for code/preview/browser/diff/commands; no `onFileContextChange`.  
- **Missing:** File-context bridge to chat (onFileContextChange not passed), "Send to Agent" / "@file", agent_costs on every chat (only on tool runs).  
- **Database:** agent_messages/conversations/telemetry/audit/costs/rag_chunks/terminal_history and mcp_tool_calls all exist; counts in section 6.
