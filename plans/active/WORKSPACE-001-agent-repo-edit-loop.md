# [Workspace] Agent Sam repository edit loop

## Product
Workspace | Agent Sam

## User outcome
From `/dashboard/agent/editor` (or Workspace + Agent Sam side rail), the user can:

1. Resolve the correct project/repo context  
2. Ask Agent Sam to change a file in that repo  
3. See the tool allowlist is non-empty  
4. Have Agent Sam list and write files via the real FS/PTY path  
5. Run a command in the correct PTY cwd  
6. See proposed changes / a Monaco diff  
7. Run targeted verification (e.g. `node --check` on the touched file)  
8. Persist run status and errors so a failed turn is inspectable after refresh  

**One real repository task, safely, end to end.**

## Current failure
Multiple boundaries in the chain are unfinished or silent:

- Project activate scopes KV/sessionStorage but does **not** switch auth workspace — wrong-repo edits possible  
- Tool allowlist can be empty under strict `agentsam_mcp_allowlist` / route requirements  
- `fs_write_file` requires live PTY + chat `request`; fails with `workspace_repo_root_unavailable` / `request_context_required_for_pty_*`  
- Monaco live patch only fires when tool output has parseable before/after — plain write success often produces **no DiffEditor update**  
- Legacy “proposed file change” / Keep Changes SSE path is documented as inactive  
- `AgentEditorRoute.tsx` is a null stub; all editor UX still lives in `App.tsx` (do not remaster — note only)

## Severity triage (this ticket)

| Issue | Severity |
|-------|----------|
| Empty tool allowlist on agent chat | **B0** |
| Wrong repo root / PTY cwd for writes | **B0** |
| `fs_write_file` / list path fails (PTY or request missing) | **B0** |
| No durable agent_run / tool_call_log on failure | **B0** |
| Write succeeds but no Monaco diff / proposed change visible | **B1** |
| Activate ≠ workspace switch (silent wrong context) | **B1** |
| `AgentEditorRoute` stub / UI remaster | **B3** — out of scope |
| Workspace iOS-style remaster | **B3** — out of scope |

Only **B0** and **B1** belong in this ticket.

## Verified path

```
route:     /dashboard/agent/editor  (also /dashboard/agent/workspace browser)
page:      dashboard/App.tsx agent shell
           → MonacoEditorView.tsx + ChatAssistant side rail
           → WorkspaceDashboardV2 when Workspace tab
state:     activateProjectWorkContext → POST /api/projects/:id/activate
           → KV iam:active_project:{userId}
           → sessionStorage execution workspace + writeChatGithubContext
           → buildChatProjectContext on chat body
API:       POST /api/agent/chat  (SSE)
spine:     agent.js → agent-chat-spine.js → resolveRuntimeProfile
           → loadToolsForRequest → runAgentToolLoop
tools:     fs_read_file / fs_search_files / fs_write_file / terminal_execute
           (catalog-tool-executor → fs-*.js → runTerminalCommand / PTY)
PTY:       terminal_connections + can_run_pty (agentsam_user_policy)
           cwd: resolveMoviemodeRepoRootForSession / resolveTerminalCwd
diff:      tryBroadcastMonacoPatchFromToolOutput → collab iam_monaco_patch
           → MonacoEditorView DiffEditor
storage:   agentsam_agent_run
           agentsam_tool_call_log
           agentsam_workspace_state
           terminal_sessions / terminal_connections
agent ctx: dashboardRouteContext → route_key agent_sam (editor still same prefix)
```

Key files:

- `dashboard/lib/agentRoutes.ts`
- `dashboard/src/lib/activateProjectWorkContext.ts`
- `src/api/projects.js` (`handleProjectActivate`)
- `src/api/agent.js` / `src/api/agent-chat-spine.js`
- `src/core/runtime-profile.js` / `src/core/agent-tool-loader.js`
- `src/core/agent-tool-loop.js`
- `src/core/fs-write-file.js` / `fs-read-file.js` / `fs-search-files.js`
- `src/core/collab-broadcast.js`
- `dashboard/components/MonacoEditorView.tsx`

## Scope

1. Resolve project/repo context correctly for one known project (e.g. `inneranimalmedia` repo root on the operator PTY).  
2. Confirm tool allowlist is non-empty for this surface/mode before the model turn.  
3. Repair file list/write so one relative path can be read and written via PTY.  
4. Run one command through the correct PTY context (cwd = repo root).  
5. Show proposed changes or DiffEditor for that write.  
6. Run targeted verification (`node --check` or equivalent on the touched file).  
7. Persist run status and errors (`agentsam_agent_run` + `agentsam_tool_call_log` with honest status).  

## Non-scope

- Do **not** remaster Workspace UI, Systems tab, or iOS-style workspace icons  
- Do **not** split `AgentEditorRoute` / Phase 3 shell refactor  
- Do **not** wire all 34 agent route_key gaps  
- Do **not** fix CMS, Design Studio, Draw, or Launch Desk in this ticket  
- Do **not** add new navigation or panels  

## Acceptance criteria

- [ ] With project `inneranimalmedia` (or named test project) activated, chat `projectContext` / github repo matches that project  
- [ ] First agent turn exposes ≥1 file tool and ≥1 terminal tool (non-empty allowlist)  
- [ ] Agent can `fs_search_files` or `fs_read_file` a known relative path and return content  
- [ ] Agent can `fs_write_file` a **test-only** relative path (or append to a scratch file under an agreed test dir) and the file exists on disk after the turn  
- [ ] A Monaco DiffEditor or equivalent proposed-change UI shows before/after for that write  
- [ ] Agent (or follow-up) runs a verification command in repo cwd; exit code is visible in tool result  
- [ ] After refresh, `agentsam_agent_run` row exists for the turn with success or honest error; tool log rows are not all silent zeros on duration  

## Verification

1. Activate project from `/dashboard/projects/{id}` — confirm KV/session keys.  
2. Open `/dashboard/agent/editor` — start a new chat.  
3. Prompt: “List files matching `src/core/agent-tool-loop.js`, then make a no-op comment change in a scratch file under `.scratch/` (create if needed), show the diff, run `node --check` on that file.”  
4. Observe SSE: tools start/end, no empty allowlist error.  
5. Confirm Monaco / patch event.  
6. D1 (remote):  
   ```sql
   SELECT id, status, error_message FROM agentsam_agent_run
   ORDER BY created_at DESC LIMIT 5;
   SELECT tool_name, status, duration_ms, cost_usd FROM agentsam_tool_call_log
   ORDER BY created_at DESC LIMIT 20;
   ```  
7. Rollback scratch file / delete test artifact.

## Documentation updates

- Update `plans/active/` status when done  
- Short note in product registry or workspace PDR **only if** project-activate semantics change  
- None for UI polish  

## Completion evidence

Attach before marking done:

1. Screenshot or SSE log of tools used (non-empty)  
2. Diff / Monaco screenshot  
3. `node --check` (or verification) tool output  
4. D1 query results for run + tool log rows  
5. Note of first broken boundary that was fixed (file + 1–3 sentence)  

## Cursor operating rule

Investigate the complete path first. Do not begin by changing the first visible component.

Trace: route → page → state → API → service/tool → database/storage → response → UI state → verification.

Identify the first broken boundary. Propose the smallest coherent fix.

Stop after presenting: (1) verified current path, (2) first broken boundary, (3) proposed files, (4) acceptance test, (5) rollback plan.

**Wait for approval before editing.**
