# Agent workbench audit — chunk series

**Purpose:** Give the agent team **live-code–grounded** references for `/dashboard/agent` so frontend repair and backend alignment stay tied to what is actually shipped—not older docs or assumptions.

---

## Canonical frontend: `dashboard/` (not `agent-dashboard/`)

| Question | Answer (live repo) |
|----------|-------------------|
| Where is `/dashboard/agent` implemented? | **`dashboard/`** — React SPA rooted at `dashboard/App.tsx`, React Router routes inside the same bundle as the rest of the IAM dashboard. |
| Is `agent-dashboard/` the source? | **No.** That path is **not present** in this monorepo. Do not clone, build, or deploy from `agent-dashboard/` for current work. |
| Canonical doc | **`docs/AGENT_DASHBOARD.md`** (updated 2026-05-28) — build, deploy, Worker asset aliases, path migration table. |
| Local dev | `cd dashboard && npm run dev` (Vite port 3000, proxies `/api` → Worker). |
| Production build | `cd dashboard && npm run build` → output **`dashboard/dist/`**. |
| Production deploy | Repo root **`npm run deploy:frontend`** (`scripts/deploy-frontend.sh`) uploads **`dashboard/dist`** to R2 prefix **`static/dashboard/app/`** (see script `DIST` / `PREFIX`). |
| Vite `base` | `dashboard/vite.config.ts` → **`/static/dashboard/app/`**. |
| Worker static resolution | `src/core/dashboard-r2-assets.js` — canonical keys under **`static/dashboard/app/*`**; legacy **`/static/dashboard/agent/*`** URLs alias to the same **`app/`** keys. |
| E2E smoke | `tests/e2e/dashboard-agent-workbench.spec.ts` hits live **`/dashboard/agent`**. |

**Package name:** `inneranimalmedia-dashboard` (`dashboard/package.json`).

---

## Source-of-truth file map

| Surface | Path |
|--------|------|
| SPA entry / agent shell | `dashboard/App.tsx` |
| Agent route helpers | `dashboard/lib/agentRoutes.ts` |
| Browser panel | `dashboard/components/BrowserView.tsx` |
| Chat → workbench bridge | `dashboard/components/ChatAssistant/hooks/useAgentChatStream.ts` |
| Files sidebar (local + R2 + GitHub sections) | `dashboard/components/LocalExplorer.tsx` |
| GitHub repos panel (`activeActivity === 'actions'`) | `dashboard/components/GitHubExplorer.tsx` |
| Worker browser binding | `wrangler.production.toml` → `[browser] binding = "MYBROWSER"` |
| In-worker browser tools | `src/integrations/browser-cdp.js`, `src/integrations/playwright.js` |
| R2 HTTP API | `src/api/r2-api.js` |
| Dashboard R2 asset aliases | `src/core/dashboard-r2-assets.js` |

---

## How to use chunks

1. Read the chunk’s **Scope** and **Source files** first.
2. Use **Contracts** (events, APIs) when wiring UI or debugging SSE.
3. Use **Repair backlog** for known gaps—verify in code before closing (line numbers drift).
4. Cross-link D1 tool names via `GET /api/agent/browser/registry-tools` (workspace-scoped), not hardcoded `cdt_*` lists in docs alone.

## Chunks

| # | File | Topics |
|---|------|--------|
| 01 | [chunk-01-agent-shell-and-browser.md](./chunk-01-agent-shell-and-browser.md) | `dashboard/` build/deploy, `/dashboard/agent` shell layout, activity sidebar, workbench tabs, `BrowserView` iframe vs MYBROWSER, `/api/browser/*`, collab WS, trust gate |
| 02 | *planned* | R2 explorer + `/api/r2/*` + Monaco open/save + agent `r2_file_updated` |
| 03 | *planned* | GitHub explorer + OAuth + contents API + Monaco/Git writeback |
| 04 | *planned* | ChatAssistant SSE → surfaces (`iam:agent-open-surface`, tool traces, workspace context packet) |
| 05 | *planned* | Terminal (PTY), local git `SourcePanel`, workspace persistence (`/api/agent/workspace`) |

**Last verified against repo:** 2026-05-28 (`dashboard/` tree on `samiamcursor-agent-workbench-audit-chunk01-f28b`).
