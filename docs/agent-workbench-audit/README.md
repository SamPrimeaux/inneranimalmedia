# Agent workbench audit — chunk series

**Purpose:** Live-code references for **`/dashboard/agent` only** — what the IAM Worker actually serves and what that SPA calls. Used to repair the agent workbench, not to document the whole monorepo.

---

## Hard scope (read first)

### In scope

| Layer | What counts |
|-------|-------------|
| **UI** | **`dashboard/`** — the Vite app that builds to **`dashboard/dist/`** and implements `/dashboard/agent` via **`dashboard/App.tsx`** + components under **`dashboard/components/`**, **`dashboard/lib/`**, **`dashboard/src/`** |
| **Static deploy** | **`npm run deploy:frontend`** → R2 **`static/dashboard/app/`** (`scripts/deploy-frontend.sh`). Sandbox: **`./scripts/deploy-sandbox.sh`** → same **`dashboard/dist`**, prefix **`static/dashboard/agent/`** |
| **Worker (agent path only)** | Routes and handlers **invoked by that SPA** on the agent workbench: e.g. `/api/agent/*`, `/api/browser/*`, `/api/r2/*`, `/api/github/*`, `/api/oauth/*`, terminal/collab endpoints used from agent UI |
| **Bindings** | **`MYBROWSER`**, **DASHBOARD** R2, D1 tables read/written on those request paths |
| **Proof** | `tests/e2e/dashboard-agent-workbench.spec.ts`, `docs/AGENT_DASHBOARD.md` |

### Out of scope (do not audit in this series)

| Exclude | Why |
|---------|-----|
| **`agent-dashboard/`** | **Not in this repo.** Not served. Never the source of truth. |
| **`agent-dashboard-legacy/`**, MeauxCAD-only trees, Downloads paths | Retired or external lab |
| **Whole `src/index.js`** | Only document **subsystems the agent SPA calls** |
| **Unrelated dashboard routes** | e.g. `/dashboard/finance` implementation detail — mention only if shared component; no deep audit unless agent uses it on `/dashboard/agent` |
| **cms-editor**, Python workers, unrelated Workers | Separate deploy targets per `.cursorrules` |
| **Historical docs** with old paths | Banner only; not re-audited here |

**Rule:** If a file is not on the path **`dashboard/dist` → browser → `/dashboard/agent`** or **not called from that SPA’s network tab**, it does not get its own chunk.

---

## Canonical frontend: `dashboard/`

| Question | Answer (live repo) |
|----------|-------------------|
| Where is `/dashboard/agent` implemented? | **`dashboard/App.tsx`** (client route in the dashboard SPA) |
| Build | `cd dashboard && npm run build` → **`dashboard/dist/`** |
| Production assets | **`static/dashboard/app/`** (Vite `base` in `dashboard/vite.config.ts`) |
| Worker aliases | `src/core/dashboard-r2-assets.js` — legacy `/static/dashboard/agent/*` → same **`app/`** objects |
| Canonical doc | **`docs/AGENT_DASHBOARD.md`** |

---

## Served surface map (what we audit)

```text
Browser GET /dashboard/agent
  → Worker serves SPA shell (R2 static/dashboard/app*)
  → Loads /static/dashboard/app/*.js (dashboard/ Vite build)
  → React route: dashboard/lib/agentRoutes.ts → App.tsx agent shell

Agent SPA then calls (examples — each chunk owns its subset):
  POST /api/agent/chat
  GET|PUT /api/agent/workspace/:id
  GET /api/agent/browser/registry-tools
  POST /api/browser/invoke
  GET|POST /api/r2/*
  GET /api/integrations/github/repos
  GET|POST /api/github/repos/:owner/:repo/contents
  /api/oauth/github/start?return_to=/dashboard/agent
  Terminal WS + /api/... (as wired from XTermShell on agent page)
```

---

## Chunk template (every file)

1. **Served proof** — URL or deploy step showing this is live  
2. **Scope in / out** — table  
3. **`dashboard/` files** — only paths under `dashboard/`  
4. **Worker/API** — only routes the agent SPA calls  
5. **Contracts** — events, request/response shapes  
6. **Repair backlog** — `Bxx` IDs  
7. **`rg` commands** — under `dashboard/` + listed `src/` files only  

---

## Chunks (organized; served path only)

### Tier A — Foundation

| # | File | Status | Audits (served only) |
|---|------|--------|----------------------|
| 00 | `chunk-00-series-scope.md` | planned | This README + verification checklist |
| 01 | [chunk-01-agent-shell-and-browser.md](./chunk-01-agent-shell-and-browser.md) | **done** | Agent shell in `dashboard/App.tsx`, `BrowserView`, MYBROWSER via `/api/browser/*` |
| 02 | `chunk-02-served-deploy-and-static-assets.md` | planned | `dashboard/dist` → R2; chunk 404 prevention; **not** unrelated R2 buckets |

### Tier B — Agent sidebar → Monaco (only what Files/GitHub rails use)

| # | File | Status | Audits (served only) |
|---|------|--------|----------------------|
| 03 | `chunk-03-local-explorer.md` | planned | `LocalExplorer` on agent path — FS Access, not whole repo file tree |
| 04 | `chunk-04-r2-on-agent-workbench.md` | planned | R2 section in `LocalExplorer` + `/api/r2/*` from agent + `r2_file_updated` |
| 05 | `chunk-05-github-on-agent-workbench.md` | planned | `GitHubExplorer` (`actions` rail) + OAuth return_to agent + contents API |
| 06 | `chunk-06-monaco-and-save-on-agent.md` | planned | Editor tab + save paths triggered from agent workbench only |

### Tier C — Chat drives workbench (agent API only)

| # | File | Status | Audits (served only) |
|---|------|--------|----------------------|
| 07 | `chunk-07-agent-chat-sse.md` | planned | `POST /api/agent/chat` + `useAgentChatStream` — not every agent.js line |
| 08 | `chunk-08-surface-events-agent.md` | planned | `iam:agent-open-surface`, browser navigate, R2 palette — `App.tsx` listeners |
| 09 | `chunk-09-agent-workspace-persistence.md` | planned | `/api/agent/workspace` + `AgentWorkspaceContextPacket` |
| 10 | `chunk-10-tool-approval-on-agent.md` | planned | Approvals UI when streaming on `/dashboard/agent` |
| 11 | `chunk-11-mybrowser-tools-worker.md` | planned | Worker side of browser tools **called from agent chat/tools** |

### Tier D — Execution on agent page

| # | File | Status | Audits (served only) |
|---|------|--------|----------------------|
| 12 | `chunk-12-terminal-on-agent.md` | planned | `XTermShell` when `isAgentShellPath` — PTY policy, WS |
| 13 | `chunk-13-git-rail-vs-github.md` | planned | `SourcePanel` (`git` rail) vs `GitHubExplorer` — no confusion |

### Tier E — Optional (only if still on served agent UI)

| # | File | Status | Audits (served only) |
|---|------|--------|----------------------|
| 14 | `chunk-14-workspace-home-tab.md` | planned | `WorkspaceDashboard` default tab |
| 15 | `chunk-15-e2e-validation-agent.md` | planned | `dashboard-agent-workbench.spec.ts` + deploy checks for **agent** |

**Dropped from earlier proposals** (not served on `/dashboard/agent` or duplicate): standalone Drive deep-dive unless agent rail is in active use; Excalidraw/MovieMode unless repair ticket targets them; whole-MCP platform audit; mobile-only chunk unless mobile agent is in scope for the sprint.

---

## Compact sprint (8 chunks)

If the team wants fewer files:

1. 01 — shell + browser (**done**)  
2. 02 — deploy + static assets served to agent  
3. 03 — files plane (local + R2 + GitHub on agent)  
4. 04 — Monaco saves on agent  
5. 07+08 — chat SSE + surface events (merge)  
6. 11 — MYBROWSER worker tools for agent  
7. 12 — terminal on agent  
8. 15 — E2E + master backlog  

---

## How to use

1. Confirm the feature breaks on **`https://inneranimalmedia.com/dashboard/agent`** (or sandbox equivalent).  
2. Open the chunk that owns that network tab / UI panel.  
3. Trace **`dashboard/`** first, then only the **listed** Worker routes.  
4. Do **not** cite `agent-dashboard/` or files not imported by the served bundle.  

**Last verified:** 2026-05-28 · **Source tree:** `dashboard/` + agent-facing Worker routes only.
