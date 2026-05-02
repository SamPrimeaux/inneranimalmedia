# CICD first run: master shell handoff (single source of truth)

Give this entire file to Claude (or any coding agent) as the **only** briefing document for rebuilding the IAM workspace shell as a **production-grade** React + TypeScript app and completing the **first full 3-step CICD cycle** without stubs.

**If the deliverable violates the gates in section 2, do not ship it.**

---

## 1. Purpose

- **One** primary interactive shell (not five scattered HTML files with duplicated layout).
- **Upgrade path:** from `dashboard/iam-workspace-shell.html` + `static/dashboard/shell.css` (reference UX/layout) to **`agent-dashboard/`** as **TypeScript + TSX**, with **client-side routing**, **real worker API calls only**, and **documented R2/zip export**.
- **Align** with the canonical CICD pipeline already in D1 (`project_memory.key = CICD_THREE_STEP_SYSTEM`) and `plan_steps` for `proj_iam_tools_agent_workspace`.

---

## 2. Non-negotiable gates (all must pass)

| Gate | Requirement |
|------|----------------|
| **G1 Routing** | Shell is a **SPA** (e.g. React Router or equivalent): routes are real components; **no** `window.location` hacks as the primary navigation model; deep links work. |
| **G2 APIs** | Every feature that talks to the backend uses **existing** `inneranimalmedia` worker routes (`/api/agent/*`, `/api/agentsam/*`, `/api/mcp/*`, `/api/settings/*`, etc.). **No** `fetch('/api/placeholder')`, **no** TODO-only handlers, **no** hardcoded fake JSON for production paths. If an endpoint does not exist, **document** the gap and **add** the minimal worker route + D1 in the **same** delivery (or explicitly scope out with Sam approval). |
| **G3 Auth / session** | Same-origin cookie/session behavior matches **`/dashboard/agent`**: unauthenticated users get **real** login redirect or 401 handling, not silent empty UI. |
| **G4 Theme** | Theme uses **CSS variables** only in JSX/CSS (no raw hex in components per project rules). Theme bootstrap uses **`GET /api/settings/theme?slug=`** (or shared hook) compatible with `cms_themes`. |
| **G5 Build** | `cd agent-dashboard && npm run build:vite-only` succeeds with **TypeScript** enabled for new TSX files (incremental `allowJs` OK during migration). |
| **G6 Artifacts** | Deliverable includes **one** of: (a) instructions to produce a **zip** of the built `dist/` + `dashboard/agent.html` (or new shell HTML), or (b) **exact** `wrangler r2 object put` commands for **agent-sam** keys under `static/dashboard/...` — so Sam can upload from terminal without guesswork. |
| **G7 CICD readiness** | Documented checklist for **Step 1** sandbox deploy, **Step 2** benchmark, **Step 3** promote — with URLs and version `v=` verification. |

---

## 3. Canonical facts (do not contradict)

| Item | Value |
|------|--------|
| **Prod worker** | `inneranimalmedia` — `worker.js`, `wrangler.production.toml` (do not edit bindings without approval). |
| **Sandbox worker** | `inneranimal-dashboard` — `wrangler.jsonc`, R2 bucket `agent-sam-sandbox-cicd`. |
| **Dashboard HTML shell** | Served from R2 **DASHBOARD** binding: keys like `static/dashboard/<name>.html`. |
| **Agent React bundle** | `agent-dashboard/` builds to `dist/`; referenced from `dashboard/agent.html` as `/static/dashboard/agent/agent-dashboard.js` (Vite `base`). |
| **Reference shell** | `dashboard/iam-workspace-shell.html` + `static/dashboard/shell.css` — **layout and IA reference**, to be **reimplemented** in TSX, not copy-pasted as the long-term app. |
| **TOOLS public** | `https://tools.inneranimalmedia.com` — artifacts, docs under `code/`; not the app API. |
| **Remote MCP protocol** | `https://mcp.inneranimalmedia.com/mcp` — **separate** Worker; dashboard uses **`/api/mcp/*`** on the main worker for in-app integration. |
| **D1** | `inneranimalmedia-business`; canonical CICD doc: `SELECT value FROM project_memory WHERE project_id = 'inneranimalmedia' AND key = 'CICD_THREE_STEP_SYSTEM';` |

---

## 4. Target architecture (what “done” looks like)

1. **Single shell entry** in React (e.g. `WorkspaceShell.tsx` or route tree) that composes:
   - Activity rail (left)
   - Explorer / file tree region (or placeholder with real data source)
   - Main editor / preview region
   - **Embedded or linked** Agent chat (`/dashboard/agent` or in-app route that mounts existing `AgentDashboard` or shared components — **prefer** reuse over duplicating chat logic)
2. **TypeScript** for **new** files (`*.tsx`, `*.ts`); existing `.jsx` may remain until migrated.
3. **Routing** table documented in one file (e.g. `routes.tsx`) with path, component, auth requirement.
4. **No duplicate** full-page HTML dashboards for the same shell; static HTML only where **legacy** or **print** requires it.

---

## 5. Existing API surface (do not invent)

Use **`docs/route-map.md`** (generated from `worker.js`) as the route catalog. Minimum AI-related prefixes:

- `/api/agent/*` — chat, boot, bootstrap, terminal, RAG helpers
- `/api/agentsam/*` — settings plane (rules, skills, subagents, autorag, hooks, allowlists)
- `/api/mcp/*` — dashboard MCP tooling (invoke, stream, workflows, status, tools)
- `/api/ai/*` — models, guardrails, routing-rules, integrations
- `/api/rag/*` — ingest, query, feedback, status (often `X-Ingest-Secret` for automation)
- `/api/settings/theme` — theme

---

## 6. Three-step CICD (first full run)

| Step | Action | Verify |
|------|--------|--------|
| **1** | `cd agent-dashboard && npm run build:vite-only && cd .. && ./scripts/deploy-sandbox.sh` | `https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent` shows expected **`v=`**. **Code workspace (Monaco shell):** header button (code brackets icon) or `?code_workspace=1` on the agent URL. |
| **2** | `./scripts/benchmark-full.sh sandbox` | Passes project gate (e.g. 31/31). |
| **3** | Sam runs `./scripts/promote-to-prod.sh` | `curl -s https://inneranimalmedia.com/dashboard/agent \| grep v=` matches sandbox `v=` after promote. |

**Do not** skip sandbox for prod (per `project_memory` / `DEPLOY_RULES`).

---

## 7. R2 and zip (manual or terminal)

**Sandbox (example keys):**

```bash
# After build, upload dist assets (deploy-sandbox.sh does this automatically)
# Manual one-off:
npx wrangler r2 object put agent-sam-sandbox-cicd/static/dashboard/agent/agent-dashboard.js \
  --file=agent-dashboard/dist/agent-dashboard.js --content-type=application/javascript \
  --config wrangler.jsonc --remote
```

**Zip for local archive / handoff:**

```bash
cd agent-dashboard/dist && zip -r ../../iam-agent-dashboard-dist.zip .
```

**TOOLS bucket (docs only):**

```bash
./scripts/with-cloudflare-env.sh npx wrangler r2 object put tools/code/README.md \
  --file=tools/code/README.md --content-type=text/markdown \
  --remote -c wrangler.production.toml
```

---

## 8. Anti-patterns (reject in review)

- Multiple “shell” HTML files with different grids and no shared component library.
- **Stub** endpoints returning `{ ok: true }` in production without a ticket.
- Monaco workers loaded from **cross-origin** TOOLS without same-origin strategy (see `tools/code/monaco/README.md`).
- Editing `worker.js` **OAuth** handlers without line-by-line approval.

---

## 9. Master prompt (paste below into Claude)

---

You are implementing the **Inner Animal Media (IAM) workspace shell** as the **single** primary dashboard surface, converging from static HTML into a **React + TypeScript** SPA inside the existing **agent-dashboard** Vite project.

### Inputs you must read

1. This file in full (gates, architecture, CICD).
2. Repository paths:
   - `dashboard/iam-workspace-shell.html` and `static/dashboard/shell.css` — **visual/IA reference**
   - `agent-dashboard/src/` — current React app
   - `worker.js` — **only** add routes if required; no OAuth changes without explicit approval
   - `docs/route-map.md` — **API truth**
3. D1 canonical: `project_memory` key `CICD_THREE_STEP_SYSTEM` for `project_id = inneranimalmedia`.

### Hard requirements

1. **No stubs** for production: every user-visible action either calls a **real** worker route documented in `route-map.md` or is explicitly disabled with UI copy and a link to the backlog.
2. **Client-side routing** for the shell (React Router or equivalent); no duplicate standalone HTML shells for the same feature set.
3. **TypeScript** for new code: `*.tsx` / `*.ts`; configure `tsconfig` + Vite if missing; keep `build:vite-only` green.
4. **CSS variables only** in UI (no hex in JSX/CSS).
5. **Deliver**:
   - Source changes under `agent-dashboard/`
   - Optional `dashboard/*.html` updates **only** if required for script tags / `v=` bump
   - **README section** in your reply: exact `deploy-sandbox.sh` order, benchmark command, and **R2 upload** or **zip** instructions for Sam.
6. **CICD**: Your output must include a **checklist** for steps 1–3 with verification URLs.

### Out of scope unless Sam approves

- New Cloudflare Workers, new D1 tables, `wrangler secret put`, edits to `wrangler.production.toml` bindings.

### Output format

1. Summary of files changed (paths).
2. Route table (path, component, auth).
3. API map (feature to worker endpoint).
4. CICD checklist.
5. Known limitations (must be empty or explicitly approved gaps).

---

## 10. Maintainer

This document is the **single** handoff for “first full CICD shell run.” Update it when:

- `CICD_THREE_STEP_SYSTEM` JSON changes in D1
- New mandatory gates are added
- Shell route is merged into `/dashboard/agent` only

---

*Last updated: 2026-03-31 — IAM monorepo `march1st-inneranimalmedia`.*
