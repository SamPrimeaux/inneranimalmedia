# Agent Sam — Terminal & Cursor Parity Plan

**Date:** 2026-05-29  
**Goal:** Smallest vertical slice so Agent Sam can search/read/build like Cursor **without** opening the dashboard terminal panel.

---

## Current state (evidence)

### Headless terminal API — **works**

| Layer | Path |
|-------|------|
| HTTP | `POST /api/agent/terminal/run` (`src/api/dashboard.js` L573+) |
| Gate | `executeScopedAgentTerminalRun` (`src/core/agent-terminal-run.js`) |
| PTY | `runTerminalCommand` → `PTY_SERVICE` `/exec` (`src/core/terminal.js` L670+) |
| Agent tools | `terminal_run` / `terminal_execute` → `src/tools/terminal.js` → same HTTP endpoint |

**Dashboard panel not required** — tool path uses `fetch` + session cookie.

### Gates (all must pass for non-superadmin)

1. `agentsam_user_policy.can_run_pty = 1` (`userCanRunPtyFromPolicy`)
2. Active bootstrap **or** policy PTY flag
3. `agentsam_tools` row for `terminal_execute` (or legacy_terminal_tool)
4. Non-safe commands → `agentsam_approval_queue` approved `proposal_id`

### Safe command allowlist (today)

`isLikelySafeShellCommand` in `agent-terminal-run.js`:

- `pwd`, `whoami`, `hostname`, `date`, `uname`, `echo`, `ls`, `printenv`
- `python3 -m py_compile …` (bounded length)

**Missing (requested):** `rg`, `git status`, `git diff`, `jq`, `node --check`, read-only `find`, `npm run build|test` (guarded).

### Code search — **broken**

| Tool | Status |
|------|--------|
| `fs_search_files` | In D1 catalog / migrations; **no handler** in `src/tools/` |
| `workspace_search` | `storage.js` → `list_dir` recursive — **not ripgrep** |
| Capability aliases | Map `grep`/`rg` → `fs_search_files` (`agentsam-capability-aliases.js`) |

### Production telemetry

`agentsam_tool_chain` (May 2026): **0 rows** for `terminal_run`, `terminal_execute`, `workspace_search`, `fs_search_files`. Agents are not successfully completing terminal/code-search tools in production despite catalog registration.

### Route policy blocks terminal on “chat” routes

`agentsam-route-tool-resolver.js` default `chat` profile:

```javascript
blocked_capabilities: ['terminal_execute', 'terminal_run'],
```

Agent mode must resolve a **code/debug/terminal_execution** route (or enrich via `ensureCodeCapabilityTools`) to surface terminal tools.

---

## Target architecture (minimal)

```text
Model calls fs_search_files / terminal_run
    → ai-dispatch.js
    → fs_search_files handler (NEW)
    → POST /api/agent/terminal/run { command: "rg --json ...", workspace_id, agent_run_id }
    → PTY rg in workspace root
    → parse JSON lines → capped match list
```

Keep **one** execution spine (`/api/agent/terminal/run`); do not add a second grep HTTP API unless PTY is unavailable.

---

## Patch 1 — `fs_search_files` handler (highest priority)

**File:** `src/tools/builtin/fs-search.js` (new) or extend `src/tools/builtin/storage.js`

**Behavior:**

1. Resolve workspace root via existing `resolvePtyWorkspacePath` / bootstrap (same as terminal).
2. Build command:  
   `rg --json --max-count 50 --max-columns 200 --glob '!.git/*' QUERY`  
   plus optional `path` arg (default `.`).
3. Call internal helper that POSTs to `/api/agent/terminal/run` **or** import `runTerminalCommand` with request context from `runContext`.
4. Parse `rg --json` stream (type `match` only); return `{ matches: [{ path, line, text }] }`.
5. Enforce max output bytes (e.g. 64KB).

**Register:** `src/tools/ai-dispatch.js` case + `tool-registry` if needed.

**D1:** No migration if `tool_name` already `fs_search_files`; otherwise ensure `agentsam_tools` row active.

---

## Patch 2 — Expand safe-read allowlist

**File:** `src/core/agent-terminal-run.js` — `isLikelySafeShellCommand`

Add patterns (line-only, no shell metacharacters):

| Pattern | Notes |
|---------|--------|
| `^git status\b` | read-only |
| `^git diff\b` | no `git diff` with arbitrary args that write |
| `^git log -n \d+` | optional |
| `^rg \` | only with `--json` and no `\|` `` ` `` |
| `^jq \` | block `-f` / input from network |
| `^node --check \S+\.(js|mjs|cjs)$` | single file |
| `^npm run (build|test|lint)\b` | deny `deploy`, `publish` |

High-risk remains behind approval queue.

---

## Patch 3 — Always inject code-search tools in agent/debug

**File:** `src/core/code-implementation-intent.js`

Add `fs_search_files` to `CODE_IMPLEMENTATION_TOOL_NAMES`.

**File:** `src/api/agent.js` — `ensureCodeCapabilityTools`

Already merges `CODE_IMPLEMENTATION_TOOL_NAMES`; confirm `fs_search_files` in list after handler exists.

**File:** `filterAgentToolsForRequest` or mode policy

When `requestedMode in ('agent','debug')` and message matches `/grep|find in codebase|where is/i`, force-include `fs_search_files` even if route was `chat`.

---

## Patch 4 — Mode tool policy (no new table)

Wire `loadModeToolPolicy` to deny terminal on **ask/plan** only; allow on **agent/debug/multitask** (see modes gap report).

---

## Patch 5 — Telemetry

**File:** `src/tools/terminal.js` / `mcp-tool-execution.js`

Ensure `scheduleToolCallLog` or `recordMcpToolExecution` fires for `terminal_run` with `agent_run_id` from tool context so D1 reflects reality.

---

## Patch 6 — Block expensive models (coordination with routing audit)

**File:** `src/core/resolveModel.js` — at start of `loadModelRecord`:

```javascript
const BLOCKED_AUTONOMOUS = new Set(['gpt-5.5','gpt-5.5-pro','gpt-5.4-pro','gpt-5-pro']);
if (source !== 'requested' && BLOCKED_AUTONOMOUS.has(model_key)) throw new ResolutionError(...)
```

Allow bypass only via `body.quickstart_batch` or `body.owner_approved_expensive_model === true`.

---

## E2E proof script (manual)

1. Login to dashboard; set mode **Agent**, model **Auto**.
2. Message: “Find the definition of `agentChatSseHandler` and show the first 20 lines.”
3. Expect: tool call `fs_search_files` or `terminal_run` with `rg`; SSE `tool_result` with paths under `src/api/agent.js`.
4. D1:  
   `SELECT * FROM agentsam_tool_chain WHERE created_at > unixepoch()-3600 ORDER BY created_at DESC LIMIT 5;`  
   `SELECT mode, model_key, status FROM agentsam_agent_run ORDER BY created_at_unix DESC LIMIT 3;`
5. Follow-up: “Run `npm run build`” → approval or safe-list execution; verify `agentsam_command_run` row.

---

## Risk / security notes

- **Scope rg to workspace root** — never `$HOME` without workspace binding.
- Respect `.gitignore` (rg default) and existing `assertPathAllowedByIgnorePatterns` for path args.
- Do not add `curl | bash` or unbounded `find /` to safe list.
- Terminal remains gated by `can_run_pty` — no `isSuperAdmin()` bypass (per workspace rules).

---

## Effort estimate

| Patch | Size | Dependency |
|-------|------|------------|
| fs_search_files handler | ~80–120 LOC | PTY_SERVICE live |
| Safe allowlist expand | ~30 LOC | — |
| Code tool injection | ~15 LOC | handler shipped |
| loadModeToolPolicy wire | ~40 LOC | — |
| Telemetry hook | ~10 LOC | — |
| Model block list | ~15 LOC | — |

**Total:** one focused PR (~200 LOC), no schema.

---

## Files to touch (checklist)

- [ ] `src/tools/builtin/fs-search.js` (new)
- [ ] `src/tools/ai-dispatch.js`
- [ ] `src/core/agent-terminal-run.js`
- [ ] `src/core/code-implementation-intent.js`
- [ ] `src/api/agent.js` (`loadModeToolPolicy`)
- [ ] `src/core/resolveModel.js` (optional model block)
- [ ] `src/core/mcp-tool-execution.js` or `command-run-telemetry.js` (telemetry)

---

## Out of scope (this slice)

- New D1 tables
- Replacing PTY with Sandbox SDK
- Full Cursor `index` / LSP
- Multimodal browser automation for code search
