---
title: "Dashboard Agent — Browser Tools Backend"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# Browser tools backend

## UI

`dashboard/components/BrowserView.tsx` — default **iframe**; **MYBROWSER** (Playwright) on explicit automation / agent `tool_done` hooks.

Invokes:

```
POST /api/browser/invoke   (session cookie)
GET  /api/browser/screenshot
POST /api/browser/session/close
GET  /api/agent/browser/registry-tools
```

SSE pairing: `useAgentChatStream.ts` on `tool_start` / `tool_done` for `browser_navigate`, screenshots (~1079–1374).

## Worker

| Module | Role |
|--------|------|
| `src/integrations/browser-cdp.js` | `runBrowserBuiltinTool`, MYBROWSER connect |
| `src/integrations/browser-session.js` | KV run-scoped session `agentsam_browser_sess:v1:{scopeId}` |
| `src/integrations/playwright.js` | HTTP routes + `playwright_jobs` |
| `src/tools/builtin/web.js` | Agent builtin dispatch to browser-cdp |
| `src/api/browser-trust.js` | Origin trust gate |

Binding: `MYBROWSER` in `wrangler.production.toml`.

## D1 (minimal)

| Table | Use |
|-------|-----|
| `agentsam_tools` | `browser_*`, `cdt_*` registry, `requires_approval` |
| `playwright_jobs` | Async screenshot jobs (`user_id`, `workspace_id`, `status`) |
| `agentsam_browser_trusted_origin` | Per-user origin allowlist |

## Trust and failures

| Failure | Symptom |
|---------|---------|
| `MYBROWSER` unset | 503 on `/api/browser/*` |
| Untrusted origin | 403 `assertBrowserTrustedOrigin` |
| Missing registry rows | `registry-tools` empty — picker tools null |
| `BrowserView.checkTrust` | Returns **true** on non-OK HTTP (fail-open) |
| Passive vs automation | Wrong mode → iframe-only when operator expected screenshot |

## Agent chat integration

Dashboard surface forces browser tools (`ensureAgentDashboardSurfaceCapabilityTools`). Model calls `browser_navigate` → `tool_start`/`tool_done` → UI may set iframe URL or MYBROWSER preview.

## Cursor gap

Browser automation exists but **trust fail-open**, **split iframe/MYBROWSER modes**, and **registry drift** cause “agent said it browsed” without visible proof.

## Files

`BrowserView.tsx`, `browser-cdp.js`, `playwright.js`, `web.js`, `useAgentChatStream.ts`
