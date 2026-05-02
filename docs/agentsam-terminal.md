# Agent Sam Terminal Control Plane

Last updated: 2026-04-22

This document defines the production terminal architecture for the live `/dashboard/agent` terminal path.

## 1) Architecture overview

Authoritative path:

Browser (`XTermShell`) -> Worker (`/api/agent/terminal/*`) -> Durable Object (`AGENT_SESSION` / `AgentChatSqlV1`) -> execution backend (`pty` | `ssh` | `mcp`)

### Layer ownership

- Browser terminal UI:
  - `agent-dashboard/agent-dashboard/components/XTermShell.tsx`
- Worker control-plane routes:
  - `src/api/dashboard.js`
  - Routed from `src/index.js` via `handleDashboardApi()`
- DO session/control plane:
  - `src/do/AgentChat.js` (`AgentChatSqlV1`)
  - Exported via `src/index.js` and `src/core/durable_objects.js`
- Backend execution bridge:
  - PTY upstream + HTTP `/exec` fallback wiring in `src/do/AgentChat.js`
  - Worker execution fallback orchestration in `src/core/terminal.js`

### Session flow (high level)

1. Browser calls `/api/agent/terminal/config-status` and `/api/terminal/session/resume`.
2. Browser opens websocket to `/api/agent/terminal/ws?execution_mode=pty[&workspace_id=...]`.
3. Worker validates auth session and routes websocket to deterministic DO instance:
   - session key: `terminal:<user_id>:<workspace_id>:<execution_mode>`.
4. DO accepts websocket, emits `session_id`, manages backend readiness and state messages.
5. Commands stream through DO; DO routes by `execution_mode`.

## 2) Terminal flow documentation

### Bootstrap

- `/api/agent/terminal/config-status` checks auth + backend configuration state.
- `/api/terminal/session/resume` checks auth + recent resumable terminal session metadata.

### Websocket

- Active websocket route: `/api/agent/terminal/ws`.
- Browser no longer uses direct upstream PTY websocket as active path.
- Worker validates upgrade/auth and forwards to DO `/terminal/ws`.

### Execution

- Interactive input: over websocket through DO.
- HTTP execution API: `/api/agent/terminal/exec` (mode-aware) and `/api/agent/terminal/run` (PTY-first compatibility path).
- Completion API: `/api/agent/terminal/complete`.

### Reconnect and resume

Frontend state machine in `XTermShell.tsx`:

- `connecting`
- `connected`
- `reconnecting`
- `auth_failed`
- `backend_unavailable`
- `session_expired`
- `disconnected`

Reconnect behavior:

- Exponential backoff up to 30s.
- Retry counter resets on successful `ws.onopen`.
- Intentional unmount/close does not trigger reconnect loop.

### Active terminal routes (`/api/agent/terminal/*`)

- `GET /api/agent/terminal/socket-url`
  - Compatibility endpoint; now returns control-plane ws URL (not upstream PTY URL).
- `GET /api/agent/terminal/config-status`
- `GET /api/agent/terminal/ws` (authoritative websocket)
- `GET /api/agent/terminal/status`
- `POST /api/agent/terminal/exec` (mode-aware execution)
- `POST /api/agent/terminal/run` (compatibility execution entry)
- `POST /api/agent/terminal/complete`

### Backend interaction (PTY, tunnel, auth)

PTY backend remains the shell execution engine:

- Upstream endpoint from `TERMINAL_WS_URL`
- Auth token from `PTY_AUTH_TOKEN` (preferred) or `TERMINAL_SECRET`
- DO maintains websocket to PTY and broadcasts output to terminal clients.
- HTTP `/exec` on PTY host is used for command execution paths.

## 3) Execution modes

Execution modes are selected via query/body `execution_mode` and normalized to:

- `pty` (live)
- `ssh` (wired; target/config dependent)
- `mcp` (wired; token/endpoint dependent)

### pty (current working path)

- DO ensures PTY connection.
- Websocket input/output streaming is active.
- `/terminal/exec` with `execution_mode=pty` executes through PTY backend.

### ssh (status)

- Implemented through control plane using configured targets from `SSH_TARGETS_JSON`.
- Guardrails:
  - non-root user required
  - key-based SSH expected by `ssh -o BatchMode=yes`
- Status availability depends on target configuration and host reachability.

### mcp (status)

- Implemented through control plane using MCP JSON-RPC call to endpoint.
- Requires `MCP_AUTH_TOKEN`.
- Endpoint defaults to `https://mcp.inneranimalmedia.com/mcp` unless overridden.

### Switching behavior

- Browser requests websocket with `execution_mode`.
- Worker chooses DO instance keyed by user/workspace/mode.
- DO routes both websocket input and `/terminal/exec` execution to the selected backend implementation.

## 4) Environment variables and required secrets

### Core terminal env vars

- `TERMINAL_WS_URL`
  - PTY upstream host URL.
  - Missing: PTY backend unavailable (`backend_unavailable` state).
- `PTY_AUTH_TOKEN`
  - Preferred auth token for PTY websocket and `/exec`.
  - Missing + no `TERMINAL_SECRET`: PTY auth failure.
- `TERMINAL_SECRET`
  - Compatibility fallback token for PTY auth where needed.

### Mode-specific env vars

- `SSH_TARGETS_JSON`
  - JSON list of SSH targets (`id`, `host`, `user`, optional `port`).
  - Missing/invalid: `ssh` mode unavailable.
- `MCP_AUTH_TOKEN`
  - Required for `mcp` mode execution.
  - Missing: `mcp` mode unavailable.
- `MCP_SERVER_URL` (optional)
  - Override MCP endpoint.

### Session/auth dependencies

- `SESSION_CACHE`
  - Session lookup for authenticated dashboard routes.
- Auth session record in D1 fallback path.

## 5) Failure modes and recovery

### Connection closed

Likely causes:

- upstream PTY/tunnel drop
- websocket network interruption
- worker deploy/code update websocket cutover
- UI unmount/tab lifecycle close

Recovery:

- frontend exponential reconnect for retryable states
- DO emits backend state
- intentional UI close bypasses reconnect loop

### Auth failures

Cases:

- invalid/expired dashboard session (`401`)
- route auth rejection

Behavior:

- status maps to `session_expired` or `auth_failed`
- no blind reconnect loops for non-retryable auth states

### Tunnel/backend instability

Cases:

- cloudflared tunnel down
- PTY host unreachable
- PTY token mismatch

Behavior:

- state transitions to `backend_unavailable`
- retry path continues where appropriate

### Missing env vars

- `TERMINAL_WS_URL` / token missing => PTY unavailable.
- `MCP_AUTH_TOKEN` missing => MCP mode unavailable.
- `SSH_TARGETS_JSON` missing => SSH mode unavailable.

## 6) ACTIVE vs DEPRECATED paths

### ACTIVE PATH

- Browser terminal websocket: `/api/agent/terminal/ws` via Worker control plane.
- DO owner: `AgentChatSqlV1` (`AGENT_SESSION`) terminal handlers.
- Backend routing by `execution_mode`.

### DEPRECATED PATH (not active)

- Legacy monolith terminal ws/status handlers in `worker.js` are marked:
  - `DEPRECATED: replaced by control-plane path`
- `src/core/durable_objects.js` previously contained terminal-bridge DO logic; now marked:
  - `DEPRECATED: terminal control-plane ownership moved to src/do/AgentChat.js`

## 7) Staging validation checklist

Use this checklist before production deployment:

1. Terminal connects from `/dashboard/agent`.
2. Reconnect works after:
   - page refresh
   - terminal panel collapse/expand
   - temporary backend disconnect
3. Auth failure produces explicit state (`auth_failed` / `session_expired`).
4. Missing env vars produce explicit backend/config failure states.
5. PTY backend reachable and command execution stable.
6. Active path does not use direct browser -> upstream PTY websocket.
7. Worker routes resolve:
   - `/api/agent/terminal/ws`
   - `/api/agent/terminal/status`
   - `/api/agent/terminal/exec`
   - `/api/agent/terminal/run`
8. No silent failures (error surfaced as state + terminal message).

## 8) Production safety and deploy plan

### Binding/config checks

- Verify `wrangler.production.toml` contains:
  - `AGENT_SESSION` -> `AgentChatSqlV1`
  - existing KV/D1/R2/DO bindings unchanged
  - expected production routes

### Pre-deploy checks

1. Build dashboard:
   - `npm run build --workspace=agent-dashboard` (from `agent-dashboard/`)
2. Worker dry run:
   - `npx wrangler deploy -c wrangler.production.toml --dry-run`
3. Secret presence check (at minimum):
   - `TERMINAL_WS_URL`
   - `PTY_AUTH_TOKEN` (or `TERMINAL_SECRET` fallback)
   - `MCP_AUTH_TOKEN` (if MCP mode required)

### Deploy command (production worker)

- `./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml`

### Post-deploy validation

1. Open `https://inneranimalmedia.com/dashboard/agent`
2. Open terminal panel
3. Run a command (e.g. `echo terminal-ok`)
4. Validate reconnect (refresh panel/page)
5. Confirm terminal state labels and no silent failures
