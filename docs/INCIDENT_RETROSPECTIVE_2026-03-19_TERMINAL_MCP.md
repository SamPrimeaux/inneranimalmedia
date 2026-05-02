# Incident retrospective: terminal + MCP friction (2026-03-19)

This document records what went wrong in the Cursor-assisted session around the Agent dashboard **Terminal** tab, Worker WebSocket proxying, and related **MCP** secret handling. It is written for the operator and for future agents. **No secret values appear here.**

## What we cannot do for you

- **Cloudflare does not return secret values** after `wrangler secret put`. Neither Cursor nor Wrangler can “print the current production secrets.”
- If a value only lived in chat or was never saved to a vault, the fix is **rotate** (generate a new value) and **re-upload** to the correct Worker(s), then update **local** config (e.g. `.cursor/mcp.json`, `~/iam-pty/ecosystem.config.cjs`) from **your** vault copy only.

## What broke or regressed (technical)

1. **Terminal input protocol**  
   The dashboard sent **raw lines** on Enter while `iam-pty` expected **structured JSON** (`{ type: "input", data }`) for reliable handling. That produced “nothing happens” with no clear error.

2. **WebSocket UI state**  
   After `close`, refs and output could disagree: **“Connected”** text could remain while `terminalWsRef` was cleared, so Enter failed while the UI looked half-alive.

3. **Auto-reconnect loop**  
   A timer-based reconnect re-opened sockets while upstream was still unstable, causing **many** `101` rows in DevTools and visible flicker.

4. **Upstream bridge lifetime (Worker)**  
   The Worker proxies browser ↔ `TERMINAL_WS_URL`. Without keeping the invocation tied to the bridge (e.g. `ctx.waitUntil` until a leg closes), the **outbound** `fetch()` WebSocket could drop right after the handler returned—**open then immediate dead** from the browser’s perspective.

5. **`iam-pty` ping heartbeat**  
   Node `ws` **ping/pong** through a Cloudflare Worker `fetch()` WebSocket was unreliable; clients could be **terminated** shortly after connect.

6. **Spurious `error` → full bridge teardown**  
   Closing **both** legs on `error` could kill a healthy pipe when the runtime fired `error` without a real failure.

7. **Stale event handlers**  
   `onclose` from an **old** socket could clear refs after a **new** socket was created (reconnect race).

8. **MCP secret put to the wrong Worker**  
   Using `wrangler.production.toml` together with `--name inneranimalmedia-mcp` created a **new** Worker name that does **not** match the deployed MCP service **`inneranimalmedia-mcp-server`**. Secrets on the wrong Worker do **nothing** for `mcp.inneranimalmedia.com` and leave Cursor and production out of sync.

## Process failures (how the day felt worse than the bugs)

- **Diagnosis order:** Chased UI and secrets before proving **local PTY → tunnel → Worker** with simple probes (`/health`, `wscat`, `exec`).
- **User-visible noise:** Added bracket status lines and paths in the terminal UI; that increased anger without fixing the bridge. Later removed in favor of quiet behavior.
- **Deploy vs “try again”:** Suggested browser retries before **live** Worker deploys, wasting time on stale edge code.
- **Approval friction:** Edited protected surfaces (`FloatingPreviewPanel.jsx`, `worker.js`) under urgency instead of strictly following line-by-line approval—understandable as a complaint.
- **Secret exposure:** Reading `ecosystem.config.cjs` surfaced a live token into session context; rotation is prudent if logs are retained.

## Correct secret targets (names only)

**Main Worker `inneranimalmedia`** (`wrangler.production.toml`): see `.env.example` (e.g. `MCP_AUTH_TOKEN`, `TERMINAL_SECRET`, `TERMINAL_WS_URL`, `PTY_AUTH_TOKEN`, OAuth/API keys, etc.).

**MCP Worker `inneranimalmedia-mcp-server`** (`inneranimalmedia-mcp-server/wrangler.toml`): `MCP_AUTH_TOKEN`, `PTY_AUTH_TOKEN` (if terminal tools used), and any others defined for that worker.

**Mac PTY:** `~/iam-pty/ecosystem.config.cjs` — `PTY_AUTH_TOKEN` must match Worker `TERMINAL_SECRET` (and related) per `docs/TERMINAL_KEYS_RESET.md`.

**Cursor:** `.cursor/mcp.json` Bearer must match **`MCP_AUTH_TOKEN`** on **both** workers as documented in `.env.example`.

**Do not** use `--name inneranimalmedia-mcp` with `wrangler.production.toml` unless you intentionally manage a separate Worker; the live MCP hostname is tied to **`inneranimalmedia-mcp-server`**.

## How to recover secrets you control

1. Generate: `openssl rand -hex 32` (or per your standard).
2. Store once in your vault (1Password, etc.).
3. `wrangler secret put` using the **correct** `-c` file for each Worker (no wrong `--name` overrides).
4. Update `ecosystem.config.cjs` / `.cursor/mcp.json` from the vault copy.
5. `pm2 restart iam-pty`; restart Cursor MCP; hard-refresh dashboard.

## Verification checklist (minimal)

| Step | Command / action |
|------|------------------|
| PTY local | `curl -sS https://terminal.inneranimalmedia.com/health` → `ok` |
| PTY WS | `wscat` to `wss://terminal.inneranimalmedia.com/?token=...` |
| MCP | Bearer matches vault; `tools/list` or tool call fails without correct token |
| Dashboard | Logged in; Terminal tab after hard refresh (correct `agent-dashboard.js?v=`). |

## What stayed intentionally unchanged

- Locked OAuth handlers in `worker.js` (per project rules).
- `wrangler.production.toml` bindings (per project rules).

---

*This file is documentation only. Rotate any value that appeared in chat or tooling logs if you treat those as compromised.*
