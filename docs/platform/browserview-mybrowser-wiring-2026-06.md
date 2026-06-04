# BrowserView / MYBROWSER Wiring — `/dashboard/agent`

Last verified: **2026-06-03**  
Related: [IAM runtime architecture](./iam-runtime-architecture-2026-06.md) · [browser tools backend audit](../dashboard-agent-audit/13-dashboard-agent-browser-tools-backend.md)

---

## Layout on `/dashboard/agent`

`/dashboard/agent` is the same React shell as the rest of the dashboard (`dashboard/App.tsx` via `agent-dashboard.js`). The agent page is a **split workbench**:

- **Chat panel** — `ChatAssistant` with `onBrowserNavigate`, `onAgentRunContext`, `browserUrl`, SSE stream
- **Center workbench** — tabs: Workspace, Code, **Browser**, Excalidraw, MovieMode
- **Optional terminal** — in-page `XTermShell` on the agent route

`BrowserView` mounts only when `activeTab === 'browser'`. Parent state `browserUrl` in `App.tsx` is the shared URL spine between chat and browser tab.

---

## Passive preview (iframe embed)

**Surface:** `viewSurface === 'preview'`  
**Mechanism:** Direct `<iframe src={url}>` — no MYBROWSER, no Browser Run session.

Use when:

- Operator manually opens a URL in the browser tab
- Chat sends a passive navigation (`onBrowserNavigate`) without agent automation flags
- Previewing blob/data URLs, R2 HTML preview, local virtual URLs (`r2:`, `github:`, `local:`, `preview:`)

Key behavior:

- `openPassivePreview()` sets `viewSurface` to `'preview'`, clears automation screenshot state
- Cross-origin iframe cannot be scripted — element picker falls back to MYBROWSER overlay when needed
- Trust gate still applies before navigation (`agentsam_browser_trusted_origin`)

**Common failure:** Operator expects MYBROWSER automation but only passive iframe opened → tab shows site but no agent-driven screenshots or CDP tools.

---

## Automation preview (MYBROWSER screenshot path)

**Surface:** `viewSurface === 'preview'` with `screenshotUrl` overlay OR explicit automation flag  
**Mechanism:** `POST /api/browser/invoke` → `browser-cdp.js` → MYBROWSER binding (Playwright over Browser Rendering)

Use when:

- Agent tool completes with `tool_done` carrying `preview.screenshot_url`
- Explicit screenshot capture from BrowserView menu
- `cdt_take_screenshot` / registry screenshot tool fires

Key behavior:

- `openAutomationPreview()` calls MYBROWSER via session cookie auth
- Shows screenshot overlay on top of iframe area — not the same as Agent Live embed
- Requires `MYBROWSER` binding in `wrangler.production.toml` — unset → 503 on `/api/browser/*`

**Common failure:** `MYBROWSER` unset or origin not trusted → automation preview spinner forever or toast "check origin trust and MYBROWSER".

---

## Agent Live Session (shared Browser Run CDP)

**Surface:** `viewSurface === 'agentLive'`  
**Mechanism:** `POST /api/browser/session` → Browser Run session → DO `AgentBrowserLiveV1` (when bound) → Live View URL in iframe

Use when:

- Agent chat SSE establishes `context.agent_run_id`
- Browser tools (`browser_navigate`, `cdt_*`) run against the same session the UI embeds
- Operator needs DevTools frontend URL (`devtools_frontend_url`) aligned with agent CDP tools

Key files:

| Layer | File |
|-------|------|
| UI | `dashboard/components/BrowserView.tsx`, `useAgentLiveBrowserWs.ts` |
| Session API | `src/integrations/playwright.js`, `src/api/browser-trust.js` |
| CDP tools | `src/integrations/browser-cdp.js` |
| DO lane | `src/durable-objects/agent-browser-live.js` (binding `BROWSER_SESSION`) |
| SSE bridge | `useAgentChatStream.ts` on `tool_start` / `tool_done` |

Key behavior:

- `openAgentLiveSession()` sets `viewSurface` to `'agentLive'`, creates/refreshes Browser Run session scoped to `agent_run_id`
- `useAgentLiveBrowserWs` connects to DO WebSocket for timeline + HITL events
- Agent tools and Live View share one session — agent driving browser and operator seeing Live View must use same `agent_run_id`

**Common failure:** Chat has `agent_run_id` but BrowserView still on passive preview → agent "browsed" in logs but tab shows stale iframe URL.

---

## MYBROWSER worker path (CDP invoke)

All MYBROWSER calls go through the **main worker**, never MCP:

```
BrowserView or agent tool
  → POST /api/browser/invoke  (session cookie + browser trust headers)
  → src/integrations/browser-cdp.js :: runBrowserBuiltinTool()
  → env.MYBROWSER (Browser Rendering binding)
  → Playwright connectOverCDP
```

Related routes:

| Route | Role |
|-------|------|
| `POST /api/browser/invoke` | Run registry tool by name (navigate, screenshot, cdt_*) |
| `GET /api/browser/screenshot` | Poll async screenshot jobs |
| `POST /api/browser/session` | Create/refresh Browser Run live session |
| `POST /api/browser/session/close` | Tear down run-scoped session |
| `GET /api/agent/browser/registry-tools` | Map D1 `agentsam_tools` → picker tool names |

Registry: `agentsam_tools` rows with `browser_*` / `cdt_*` keys. Empty registry → picker tools null, DevTools tabs empty.

Builtin dispatch: `src/tools/builtin/web.js` → `browser-cdp.js` for agent chat tool loop (`src/api/agent.js` → `catalog-tool-executor.js`).

---

## Event bus (chat ↔ browser tab)

**Chat → Browser:**

- `onBrowserNavigate(url, opts?)` from `ChatAssistant` → `App.tsx` `handleBrowserNavigateFromAgent` → sets `browserUrl` + BrowserView props (`initialAutomation`, `initialAgentLive`, `initialPreview`)
- `browserContext` packet from BrowserView back to chat for `@browser` mention injection

**Browser → Chat:**

- Element picker selection → `onElementPicked` → composer `@browser` context
- `useAgentChatStream` listens for `tool_start` / `tool_done` on browser tool keys → triggers automation preview or agent live mode

**SSE fields that matter:**

- `context.agent_run_id` — links BrowserView live session to `agentsam_agent_run`
- `tool_done.preview.screenshot_url` — triggers automation screenshot overlay
- `tool_done.preview.devtools_frontend_url` / live view hints — triggers agent live surface

---

## Trust, failures, and debugging checklist

| Symptom | Likely cause | Check |
|---------|--------------|-------|
| Blank browser tab | Wrong `activeTab` or virtual URL | `App.tsx` tab state, URL scheme |
| Iframe loads but agent tools fail | Passive preview, not agent live | `viewSurface`, SSE `agent_run_id` |
| 503 on `/api/browser/*` | `MYBROWSER` binding missing | `wrangler.production.toml` |
| 403 on navigate | Origin not in trust table | `agentsam_browser_trusted_origin`, `browser-trust.js` |
| Registry tools empty | D1 rows missing/inactive | `GET /api/agent/browser/registry-tools` |
| Screenshot never appears | Async job stuck | `playwright_jobs` table, job status |
| Live View stale | Session not refreshed | DO alarm, `refreshBrowserRunLiveSession` interval |
| "Agent browsed" no UI proof | Chat tool ran but BrowserView not synced | `onBrowserNavigate` opts, `tool_done` preview payload |

Trust note: `BrowserView.checkTrust` **fail-opens** on non-OK HTTP — do not assume trust denial always blocks UI.

---

## Files (canonical)

| File | Role |
|------|------|
| `dashboard/App.tsx` | Tab shell, `browserUrl`, mounts BrowserView |
| `dashboard/components/BrowserView.tsx` | All view surfaces, picker, DevTools, trust UI |
| `dashboard/components/ChatAssistant/useAgentChatStream.ts` | SSE → browser reactions |
| `dashboard/hooks/useAgentLiveBrowserWs.ts` | Agent live WS client |
| `src/integrations/browser-cdp.js` | MYBROWSER tool execution |
| `src/integrations/browser-session.js` | KV run-scoped session fallback |
| `src/integrations/playwright.js` | HTTP routes for session/screenshot |
| `src/tools/builtin/web.js` | Agent builtin → browser-cdp |
| `src/api/browser-trust.js` | Origin trust gate |
