# Agent Browser Live Durable Object

One **BROWSER_SESSION** (`AgentBrowserLiveV1`) instance per `agentsam_agent_run.id`. The DO is the **single writer** for agent live browser state: Browser Run CDP session, Live View URL, human-in-the-loop pause/resume, event outbox, and cleanup.

## Lanes (do not merge)

| Lane | Binding | Instance key | Owns |
|------|---------|--------------|------|
| Terminal + chat | `AGENT_SESSION` | `conversation_id` / terminal session | PTY, chat history |
| **Browser live** | **`BROWSER_SESSION`** | **`agent_run_id`** | Browser Run CDP, Live View, HITL, events |
| Passive preview | — | — | Dashboard iframe only (not DO) |
| Tavily / web_fetch | — | — | Chat-side scan ring, no BrowserView |
| Screenshots | — | — | Explicit capture tools only |

## Runtime contract

1. Agent browser tools with `agent_run_id` call `ensureAgentLiveBrowserSession` → DO `/session/ensure` (`targets=true`).
2. All `cdt_*`, `browser_navigate`, `browser_click`, `browser_fill`, `browser_wait` for the same run reuse the **same** Browser Run `session_id`.
3. **BrowserView** `viewSurface === 'agentLive'` embeds DO `devtools_frontend_url` (Live View).
4. **WebSocket** `/api/browser/live/ws?agent_run_id=` proxies to DO `/ws` for timeline + live URL refresh events.
5. **HITL** `browser_request_human_input` blocks in DO until `POST /api/browser/session/human-resume` (Continue) or `human-cancel`.
6. **Alarms** refresh Live View URL before ~5 min expiry; dashboard 4 min interval is backup.
7. **Production** requires `BROWSER_SESSION`; KV `agentsam_browser_sess:v1:*` is **not** live-browser truth when DO is bound.

## DO SQLite

- `live_browser_session` — singleton row per instance
- `live_browser_events` — outbox for timeline / WS fan-out

## DO routes (internal)

| Route | Method | Purpose |
|-------|--------|---------|
| `/health` | GET | Health + status |
| `/session` | GET | Full snapshot |
| `/session/ensure` | POST | Create/reuse Browser Run, navigate |
| `/session/live-url` | GET | Refresh devtools URL |
| `/session/patch` | POST | URL/title/tool action metadata |
| `/session/close` | DELETE | Close Browser Run + mark closed |
| `/human-input/request` | POST | HITL block |
| `/human-input/resume` | POST | Continue |
| `/human-input/cancel` | POST | User cancelled HITL |
| `/events` | GET | Event outbox |
| `/ws` | WS | Live state + timeline bootstrap |

## Worker HTTP (auth at boundary)

| Route | Purpose |
|-------|---------|
| `GET /api/browser/live/:agentRunId` | Session snapshot |
| `GET /api/browser/live/:agentRunId/health` | DO health |
| `GET /api/browser/live/:agentRunId/live-url` | Refresh Live View |
| `GET /api/browser/live/:agentRunId/events` | Timeline outbox |
| `GET /api/browser/live/ws?agent_run_id=` | WebSocket proxy |
| `POST /api/browser/session` | Ensure (with `agent_run_id`) |
| `POST /api/browser/session/human-resume` | HITL Continue |
| `POST /api/browser/session/human-cancel` | HITL Cancel |
| `DELETE /api/browser/session` | Close (body: `agent_run_id`) |

Auth: session cookie + `assertAgentRunAccess` (run owner). Trust: `assertBrowserTrustedOrigin` before external navigation.

## Files

| File | Role |
|------|------|
| `src/do/AgentBrowserLive.js` | DO class |
| `src/integrations/browser-live-do-client.js` | Worker facade |
| `src/integrations/agent-live-browser-session.js` | Public API (DO-first) |
| `src/integrations/browser-cdp.js` | Scoped tools → DO session |
| `src/integrations/playwright.js` | HTTP + WS proxy |
| `dashboard/hooks/useAgentLiveBrowserWs.ts` | BrowserView WS client |
| `dashboard/components/BrowserLiveTimeline.tsx` | Timeline UI |

## Wrangler

```toml
[[durable_objects.bindings]]
name = "BROWSER_SESSION"
class_name = "AgentBrowserLiveV1"

[[migrations]]
tag = "v7"
new_sqlite_classes = ["AgentBrowserLiveV1"]
```

Export `AgentBrowserLiveV1` from `src/index.js`.

## D1 tool

Apply `migrations/500_browser_request_human_input_tool.sql` — registers `browser_request_human_input` (`handler_type=mybrowser`).

## Smoke (manual)

```bash
# Syntax
node --check src/do/AgentBrowserLive.js

# After deploy + auth cookie / agent run:
# 1. Start agent run with browser_navigate
# 2. GET /api/browser/live/{agentRunId}/health  → ok + status
# 3. GET /api/browser/live/{agentRunId}         → live_session.session_id
# 4. Browser tab → Agent Live Session → Live View iframe
# 5. Second browser tool → same session_id in responses
# 6. browser_request_human_input → banner + Continue/Cancel
# 7. POST human-resume → agent continues
# 8. DELETE /api/browser/session { agent_run_id } → closed
```

Script: `scripts/smoke-browser-live-do.mjs` (documented commands; requires `SMOKE_AGENT_RUN_ID` + session cookie in env for live hit).

## Product rules

- **No** auto-screenshot on navigation when `agent_run_id` / DO live session exists.
- **No** merging browser live into `AGENT_SESSION`.
- **No** using passive iframe preview as Agent Live Session substitute.
