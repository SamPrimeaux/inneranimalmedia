# REPAIR: Remote Terminal Exec Layer

**Priority:** P0 — blocks all git/wrangler/deploy work from phone  
**Filed:** 2026-06-25  
**Symptom:** `agentsam_terminal_local` and `agentsam_terminal_remote` both return `ENOENT` with zero stdout/stderr on every call. The GCP VM `/exec` handler is not executing commands.

---

## STATUS UPDATE — 2026-07-22

**Lane health vs path hygiene are different bugs.**

**A — Exec lane (conn_gcp_iam_tunnel): HEALTHY** for real Linux paths.
- `pwd` / repo commands under `/home/samprimeaux/inneranimalmedia` → exit 0, identity `agentsam`
- Original “every call ENOENT / empty stdout” is **not** the current failure mode

**B — macOS paths inside the command body: STILL OPEN (Phase 3 blocker).**
- Harness / MCP wrap always prefix `cd <gcpRoot> &&` (resolved via `gcpRemoteExecCwd` / connection cwd). They do **not** parse arbitrary paths inside the rest of the command.
- `rewriteMacCwdInShellCommand` only rewrites a **leading** `cd /Users/... && …`. Embedded paths (`cat /Users/.../package.json`, `node /Users/.../x.js`) stay Mac-absolute → Linux `No such file or directory`.
- Typical agents survive because the harness’s own `cd` lands first and the rest of the command uses relative paths. That is **masking**, not a fix.
- Nuance on ChatGPT’s “execos-fabric.js line 58”: the hardcoded `/Users/samprimeaux/inneranimalmedia` there is the **non-gcp** operator_fallback host root. GCP target uses `gcpRemoteExecCwd` (lines 45–50). Same class of Mac-on-Linux risk, different call site — fix embedded-path normalize (or fail loud) on the shell wrap path, not only that one line.

**C — `ok:true` despite nonzero exit: check surface.**
- MCP `buildTerminalToolResponseBody` already sets `ok = !spawnFailed && (exitCode == null || exitCode === 0)`.
- Main-worker `execos-fabric.normalizeExecResult` also requires `exitCode === 0` for `ok`.
- If a live call still shows `ok:true` with nonzero `exit_code`, that is a **different** response path (or a client misread of envelope vs body) — reproduce and name the handler before rewriting architecture.

**D — OAuth `agentsam_terminal_local`: remapped to remote on purpose (loud stamp shipped).**
- `oauth_remote_default` → execute remote; stamp `requested_tool` / `reroute_*` / `lane_substituted`.
- localpty health can be 200 while OAuth still remaps (policy, not tunnel-down fallback).

**E — ChatGPT “remote tool not in this chat” ≠ platform broken.**
- Allowlist SSOT: `agentsam_terminal_remote` is `expose_on_connector=1`, `connector_priority=4` on `iam_mcp_inneranimalmedia`.
- Connector assembly: `applyOperatorTerminalConnectorPolicy` **strips** remote when `!isSamOperatorLaneUserId(user_id) && !_is_superadmin`. For operators it injects remote near the front (survives the 40-tool cap).
- So missing remote on ChatGPT is **session operator scope** (or ChatGPT client truncating the list), not “curated catalog lying” and not primarily KV allowlist staleness. Ask ChatGPT for resolved `user_id` / `is_operator` from `tools/list` logs / workspace context before treating it as rewrite-required.

**Remaining work:**
1. ~~Normalize or reject embedded `/Users/…` (and `/Volumes/…`) on GCP exec~~ — **SHIPPED** (`sanitizeShellCommandForGcpExec` in main `host-workspace-paths.js` + MCP `mcp-host-workspace-paths.js`; MCP remote wrap fail-loud on unmapped paths).
2. If `ok:true`+nonzero still reproduces, trace that response path and fix reporting.
3. Confirm stamped OAuth local→remote fields on a live connector call.
4. ChatGPT: confirm `user_id` ∈ Sam operator lane (`au_871d…` set) vs customer/Connor; only then chase KV `bumpOAuthAllowlistVersion` or a second tools/list filter.

### Embedded-path sanitize (2026-07-22 Track A)

- Leading `cd /Users/... &&` still rewritten to `cd <gcpRoot> &&`.
- Embedded Mac/Windows abs paths under the same repo leaf (or `settings.workspace_root`) are rewritten to `gcpRoot/...`.
- Unmapped `/Users|Volumes/...` on `agentsam_terminal_remote` → `error: embedded_mac_path_on_gcp` (loud reject, no silent Linux ENOENT).
- Does **not** invent `/home/$user/$rest` from arbitrary Mac paths.

---

## STATUS UPDATE — 2026-07-21 (superseded by 2026-07-22)

**`agentsam_terminal_remote`: FIXED** (same as above). At that time localpty health was **530** and some local calls fell through to **sandbox** — that is no longer the OAuth default (now remote + loud stamp).

---

## What is broken

Every terminal MCP tool call returns this shape regardless of command:

```json
{
  "ok": false,
  "cwd": "/Users/samprimeaux/inneranimalmedia",
  "exit_code": "ENOENT",
  "stdout": "",
  "stderr": "",
  "output": "",
  "status": "success",
  "connection_id": "conn_gcp_iam_tunnel",
  "connection_target_type": "platform_vm",
  "exec_lane": "gcp_primary",
  "exec_host": "terminal.inneranimalmedia.com"
}
```

Key observations:
- `exit_code` is the string `"ENOENT"` — not an integer. This is a Node.js spawn error code, not a shell exit code. It means the exec handler tried to spawn a process and got a file-not-found error at the OS level before the command ran at all.
- `stdout` and `stderr` are both empty — the process never started.
- `status` is `"success"` — the HTTP call to the exec endpoint succeeded; the failure is inside the exec handler itself.
- The GCP VM tunnel (`terminal.inneranimalmedia.com`) is responding (no 5xx, no timeout) — so the cloudflared tunnel and the terminal Worker are alive. Only the command execution is broken.

---

## Architecture map

```
Claude MCP tool call
  → MCP server (mcp.inneranimalmedia.com, Cloudflare Worker)
    → src/index.js: dispatchTool() → handlerType='terminal' → handleTerminal()
      → mcp-terminal-exec.js: executeMcpTerminalTool()
        → terminal_connections D1 table → resolve target connection
          Priority order (target_priority ASC):
          1. conn_mac_local / conn_op_local_* (priority 10) → wss://localpty.inneranimalmedia.com (iMac PTY)
          2. conn_sam_sandbox (priority 25) → wss://sandboxterminal.inneranimalmedia.com
          3. conn_gcp_iam_tunnel (priority 45) → wss://terminal.inneranimalmedia.com (GCP VM)
          4. conn_op_gcp_* (priority 50) → wss://terminal.inneranimalmedia.com (GCP VM fallback)
        → POST https://terminal.inneranimalmedia.com/exec  ← THIS IS FAILING
          body: { command, cwd, env }
          → GCP VM terminal Worker → spawns shell process → returns stdout/stderr
```

The failure is at the `/exec` HTTP handler on `terminal.inneranimalmedia.com`.

---

## Known state of each connection target

| Connection | URL | Status | Notes |
|---|---|---|---|
| localpty (iMac PTY) | `wss://localpty.inneranimalmedia.com` | **DOWN** (530) | PM2 `iam-pty` process down. Wrong `CLOUDFLARE_API_TOKEN` in LaunchAgent plist. |
| sandboxterminal | `wss://sandboxterminal.inneranimalmedia.com` | Unknown | Isolated sandbox, no local repo |
| GCP iam-tunnel | `wss://terminal.inneranimalmedia.com` | Tunnel UP, **/exec BROKEN** | HTTP 200 but ENOENT — exec handler not spawning |

---

## Root cause hypotheses (investigate in this order)

### Hypothesis 1 — Shell binary path changed or missing on GCP VM (most likely)

ENOENT from Node.js `child_process.spawn` means one of:
- The shell binary (e.g. `/bin/bash`) doesn't exist at the expected path
- The command itself is being passed as an absolute path that doesn't exist
- The `cwd` passed to spawn doesn't exist (some Node versions surface this as ENOENT)

The `cwd_strategy` for `conn_gcp_iam_tunnel` is `host_default`. The MCP server is passing `cwd: "/Users/samprimeaux/inneranimalmedia"` — a **macOS path** — to a **Linux GCP VM**. That path does not exist on Linux. If the exec handler passes `cwd` to `child_process.spawn` and that directory doesn't exist, Node throws ENOENT.

**Fix:** The exec handler needs to fall back to a valid cwd when the requested path doesn't exist on the target machine (e.g. `process.env.HOME` or `/tmp`), or the MCP server needs to not pass a macOS workspace path to a Linux target.

### Hypothesis 2 — Terminal Worker on GCP VM is running stale/broken code

The terminal Worker running at `terminal.inneranimalmedia.com` may have a deployment issue — old code, broken dependency, or missing env var.

**Check:** SSH into GCP VM and inspect the process running on the terminal port.

### Hypothesis 3 — PTY_AUTH_TOKEN mismatch

The MCP server sends `PTY_AUTH_TOKEN` (or `AGENTSAM_BRIDGE_KEY`) to authenticate to the exec endpoint. If this token has rotated or is wrong, the exec handler may be rejecting the request in a way that returns 200 with an ENOENT-shaped error body rather than a 401.

**Check:** Compare `PTY_AUTH_TOKEN` in MCP server wrangler secrets vs what the terminal Worker expects.

---

## Files to inspect

### MCP server repo: `inneranimalmedia-mcp-server`

```
src/mcp-terminal-exec.js       ← primary suspect: exec dispatch, cwd handling, error shaping
src/mcp-terminal-contract.js   ← wrapShellCommandWithPath, buildTerminalToolResponseBody
src/index.js                   ← handleTerminal() calls executeMcpTerminalTool()
```

Key questions in `mcp-terminal-exec.js`:
1. How is `cwd` resolved before being passed to the exec endpoint?
2. Does it validate that the cwd exists on the target machine?
3. When the exec endpoint returns a non-200 or ENOENT body, how does it shape the response?
4. Does it try localpty first, then fall back to GCP? Or does it always use the resolved connection?

### Main app repo: `inneranimalmedia`

```
# The GCP VM terminal Worker — wherever it's deployed from.
# Check wrangler.production.toml for the terminal worker binding or separate Worker.
```

The terminal Worker at `terminal.inneranimalmedia.com` runs on the GCP VM via cloudflared tunnel. It's likely a Node.js process (PM2 or systemd) that:
1. Listens on an HTTP port
2. Accepts POST `/exec` with `{ command, cwd, env }`
3. Spawns the command via `child_process.spawn` or `exec`
4. Streams or buffers stdout/stderr and returns JSON

Find this process on the GCP VM:
```bash
# SSH into GCP VM (iam-tunnel, us-central1-f, gen-lang-client-0684066529)
gcloud compute ssh iam-tunnel --zone us-central1-f --project gen-lang-client-0684066529

# Find what's running on the terminal port
lsof -i :3099 || lsof -i :8080 || lsof -i :3000
ps aux | grep -E 'node|pty|terminal'
pm2 list

# Check the exec handler source
find / -name '*.js' -path '*/terminal*' 2>/dev/null | head -20
```

---

## Step-by-step repair

### Step 1 — Fix the cwd problem (quick fix, no SSH needed)

In `mcp-terminal-exec.js`, find where `cwd` is passed to the exec endpoint. Change it to:

```javascript
// Before passing cwd to the GCP exec endpoint, normalize it.
// macOS paths like /Users/samprimeaux/... don't exist on Linux.
// Fall back to HOME or /tmp if the path looks wrong for the target platform.
const targetPlatform = connection?.platform || 'linux';
let resolvedCwd = requestedCwd;
if (targetPlatform === 'linux' && resolvedCwd?.startsWith('/Users/')) {
  resolvedCwd = process.env.HOME || '/tmp';
}
```

Or more robustly, pass no `cwd` when targeting a platform_vm connection and let the terminal Worker use its own default.

### Step 2 — Verify the GCP terminal Worker is running

```bash
gcloud compute ssh iam-tunnel --zone us-central1-f --project gen-lang-client-0684066529
pm2 list
# Look for iam-terminal, iam-pty, or similar process
# If missing: pm2 start <entrypoint> --name iam-terminal
```

### Step 3 — Verify PTY_AUTH_TOKEN

```bash
# On GCP VM
cat ~/.env.terminal || cat /etc/iam-terminal.env || pm2 env 0

# In MCP server
wrangler secret list --config wrangler.production.toml | grep PTY
# Compare the token value to what the terminal Worker expects
```

### Step 4 — Fix the localpty PTY (iMac, so it's the primary target again)

This is the proper fix so the iMac PTY becomes primary and the GCP VM is only a fallback for lightweight ops:

```bash
# On iMac
read -s CF_TOKEN
# paste the working token from D1: SELECT value FROM agentsam_kv WHERE key = 'mem_morning_fix'
/usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:CLOUDFLARE_API_TOKEN $CF_TOKEN" \
  ~/Library/LaunchAgents/com.iam.pty.plist
kill -9 $(lsof -ti:3099)
# PM2 will auto-restart iam-pty
sleep 3
curl https://localpty.inneranimalmedia.com/health
```

### Step 5 — Add health recording to D1

The `terminal_connections` table has `last_health_status` and `last_health_at` columns — all NULL right now. Add a health-check cron to the terminal Worker that writes its status to D1 via the MCP server's internal API so the platform knows when localpty is down before a tool call fails.

---

## What to fix in `mcp-terminal-exec.js` (Cursor task)

Open `src/mcp-terminal-exec.js` in the `inneranimalmedia-mcp-server` repo and do all of the following:

1. **CWD normalization:** Before passing `cwd` to any `platform_vm` or `user_hosted_tunnel` target, validate the path makes sense for the target's `platform` field. If `platform=linux` and cwd starts with `/Users/`, substitute `$HOME` or omit cwd entirely.

2. **ENOENT error surfacing:** When the exec endpoint returns an ENOENT-shaped response, surface the actual error message in `stderr` or add a `exec_error` field so debugging doesn't require reading source code.

3. **Connection health write:** After each exec attempt (success or fail), do a fire-and-forget D1 write:
   ```sql
   UPDATE terminal_connections
   SET last_health_status = ?,
       last_health_at = unixepoch(),
       health_error = ?
   WHERE id = ?
   ```
   This makes the `terminal_connections` table useful for diagnosing which connections are actually alive.

4. **Fallback on ENOENT:** If the primary connection returns ENOENT, automatically try the next connection by `target_priority` rather than returning the error immediately.

---

## Current `terminal_connections` active rows (for reference)

| id | name | target_type | ws_url | priority |
|---|---|---|---|---|
| conn_mac_local | Sam Mac — localpty | user_hosted_tunnel | wss://localpty.inneranimalmedia.com | 10 |
| conn_op_local_* (x4) | Sam Mac — localpty | user_hosted_tunnel | wss://localpty.inneranimalmedia.com | 10 |
| conn_sam_sandbox | Sandbox | sandbox | wss://sandboxterminal.inneranimalmedia.com | 25 |
| conn_gcp_iam_tunnel | iam-tunnel — AgentSam ops | platform_vm | wss://terminal.inneranimalmedia.com | 45 |
| conn_op_gcp_* (x4) | GCP VM – Linux | platform_vm | wss://terminal.inneranimalmedia.com | 50 |

**Issue:** Five localpty connections at priority 10 all point to the same broken URL. When localpty is down, the MCP server tries all five before moving on — wasting time. Deactivate duplicates and keep only `conn_mac_local` as the canonical iMac PTY.

---

## Cleanup SQL (run after repair)

```sql
-- Deactivate duplicate localpty connections (keep conn_mac_local only)
UPDATE terminal_connections
SET is_active = 0
WHERE target_type = 'user_hosted_tunnel'
  AND id != 'conn_mac_local'
  AND workspace_id = 'ws_inneranimalmedia';

-- Deactivate duplicate GCP connections (keep conn_gcp_iam_tunnel only)
UPDATE terminal_connections
SET is_active = 0
WHERE target_type = 'platform_vm'
  AND ws_url = 'wss://terminal.inneranimalmedia.com'
  AND id NOT IN ('conn_gcp_iam_tunnel')
  AND workspace_id = 'ws_inneranimalmedia';
```

---

## Success criteria

Terminal exec is fixed when all of the following pass:

```
agentsam_terminal_local: { command: "echo hello" }
→ stdout: "hello\n", exit_code: 0, ok: true

agentsam_terminal_remote target_id=conn_gcp_iam_tunnel: { command: "whoami" }
→ stdout: "<user>\n", exit_code: 0, ok: true

agentsam_terminal_local: { command: "cd /Users/samprimeaux/inneranimalmedia && git status" }
→ stdout: "<git output>", exit_code: 0, ok: true  (requires localpty fix)
```
