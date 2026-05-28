# Chunk 00 — Series scope (what we serve)

**This series audits only the live `/dashboard/agent` workbench** built from **`dashboard/`** and the Worker APIs that SPA calls. It does **not** audit `agent-dashboard/` (not in repo, not served).

---

## Served stack (single chain)

```text
dashboard/          ← sole UI source (npm run build → dashboard/dist/)
       ↓
dashboard/dist/     ← production bundle
       ↓
R2 static/dashboard/app/   ← deploy-frontend.sh (canonical)
       ↓
GET /dashboard/agent       ← Worker SPA shell + client route dashboard/App.tsx
       ↓
/api/*                     ← only routes this page’s JS actually fetches
```

**Sandbox:** same `dashboard/dist`, uploaded under `static/dashboard/agent/` by `deploy-sandbox.sh`; Worker still resolves via `src/core/dashboard-r2-assets.js`.

---

## `dashboard/` files that matter for agent (entry set)

Use this as a **grep boundary** before adding paths to a chunk:

| Area | Paths |
|------|--------|
| Shell | `dashboard/App.tsx`, `dashboard/lib/agentRoutes.ts` |
| Chat | `dashboard/components/ChatAssistant/**` |
| Browser | `dashboard/components/BrowserView.tsx` |
| Files rail | `dashboard/components/LocalExplorer.tsx` |
| GitHub rail | `dashboard/components/GitHubExplorer.tsx` |
| Git rail | `dashboard/components/SourcePanel.tsx` |
| Editor | `dashboard/components/MonacoEditorView*` / `useEditor` hooks |
| Terminal | `dashboard/components/XTermShell.tsx` |
| Workspace home | `dashboard/components/WorkspaceDashboard.tsx` |
| Shared libs | `dashboard/src/ideWorkspace.ts`, `dashboard/src/lib/mediaPreview.ts`, `dashboard/types.ts` |

Do **not** expand audits to every file under `dashboard/pages/*` unless the agent route imports them (most overview/finance pages are separate lazy routes).

---

## Worker files (agent-called only)

Document **handlers on the request path**, not all of `src/`:

| API prefix | Typical agent use |
|------------|-------------------|
| `/api/agent/` | Chat, workspace, browser registry-tools |
| `/api/browser/`, `/api/playwright` | BrowserView automation, screenshots |
| `/api/r2/` | LocalExplorer R2, editor save |
| `/api/github/`, `/api/integrations/github/` | GitHubExplorer |
| `/api/oauth/github/` | Connect from agent |
| `/api/collab/room/browser` | BrowserView collab WS |
| `/api/agentsam/browser/trust` | BrowserView trust gate |
| Terminal / PTY routes | From `XTermShell` on agent page |

Entry dispatch: `src/core/production-dispatch.js` → specific `src/api/*.js` / `src/integrations/*.js` modules.

---

## Verification (served vs irrelevant)

```bash
# UI source exists only here
test -d dashboard && test ! -d agent-dashboard && echo "OK: dashboard/ only"

# Agent route in served SPA
rg -n "AGENT_HOME_PATH|isAgentShellPath" dashboard/App.tsx dashboard/lib/agentRoutes.ts

# Production deploy target
rg -n 'DIST=|PREFIX=' scripts/deploy-frontend.sh

# What Worker serves for static JS
rg -n "DASHBOARD_STATIC_APP_PREFIX" src/core/dashboard-r2-assets.js
```

---

## Next chunk

[Chunk 01 — Agent shell & BrowserView](./chunk-01-agent-shell-and-browser.md) (complete).
