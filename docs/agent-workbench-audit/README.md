# Agent workbench audit — chunk series

**Purpose:** Give the agent team **live-code–grounded** references for `/dashboard/agent` so frontend repair and backend alignment stay tied to what is actually shipped—not older docs or assumptions.

**Repo paths (this monorepo):**

| Surface | Path |
|--------|------|
| Agent IDE shell (routes, layout, tabs) | `dashboard/App.tsx` |
| Route helpers | `dashboard/lib/agentRoutes.ts` |
| Browser panel | `dashboard/components/BrowserView.tsx` |
| Chat → workbench bridge | `dashboard/components/ChatAssistant/hooks/useAgentChatStream.ts` |
| Worker browser binding | `wrangler.production.toml` → `[browser] binding = "MYBROWSER"` |
| In-worker browser tools | `src/integrations/browser-cdp.js`, `src/integrations/playwright.js` |
| R2 HTTP API | `src/api/r2-api.js` |
| GitHub HTTP API (explorer) | `dashboard/components/GitHubExplorer.tsx` + Worker GitHub routes |

**Note:** `docs/AGENT_DASHBOARD.md` still describes `agent-dashboard/` as canonical; **this workspace builds the agent shell from `dashboard/`** (`npm run deploy:frontend` → `dashboard/dist` → R2 `static/dashboard/app`). Reconcile any legacy doc against these paths before acting.

**How to use chunks**

1. Read the chunk’s **Scope** and **Source files** first.
2. Use **Contracts** (events, APIs) when wiring UI or debugging SSE.
3. Use **Repair backlog** for known gaps—verify in code before closing (line numbers drift).
4. Cross-link D1 tool names via `GET /api/agent/browser/registry-tools` (workspace-scoped), not hardcoded `cdt_*` lists in docs alone.

## Chunks

| # | File | Topics |
|---|------|--------|
| 01 | [chunk-01-agent-shell-and-browser.md](./chunk-01-agent-shell-and-browser.md) | `/dashboard/agent` shell layout, activity sidebar, workbench tabs, `BrowserView` iframe vs MYBROWSER, `/api/browser/*`, collab WS, trust gate |
| 02 | *planned* | R2 explorer + `/api/r2/*` + Monaco open/save + agent `r2_file_updated` |
| 03 | *planned* | GitHub explorer + OAuth + contents API + Monaco/Git writeback |
| 04 | *planned* | ChatAssistant SSE → surfaces (`iam:agent-open-surface`, tool traces, workspace context packet) |
| 05 | *planned* | Terminal (PTY), local git `SourcePanel`, workspace persistence (`/api/agent/workspace`) |

**Last verified against repo:** 2026-05-28 (main workspace tree).
