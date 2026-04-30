# Migration parity audit: inneranimalmedia-agentsam-dashboard → inneranimalmedia

Generated 2026-04-30. Source: `inneranimalmedia-agentsam-dashboard` @ `c1a8a3e`. Target: `inneranimalmedia` @ `495c842` baseline + subsequent ports.

## File-by-file (Step 1)

| source repo/path | target repo/path | target exists? | same SHA? | action | risk |
|------------------|------------------|----------------|-----------|--------|------|
| src/index.js | src/index.js | yes | no (DIFF) | leave unless dashboard worker entry must match; not required for Supabase sync | low |
| worker.js | worker.js | yes | no | port agentsam workflow + Supabase sync hunks (done in follow-up commit) | **high** until D1 renamed + Supabase secrets set |
| src/api/mcp.js | src/api/mcp.js | yes | no | **deferred** — invoke path differs (internal tools vs MCP JSON-RPC); sync lives in worker | med |
| src/core/agentsam-workflows.js | src/core/agentsam-workflows.js | no | — | **add** (canonical table names + helpers) | low |
| src/core/agentsam-supabase-sync.js | src/core/agentsam-supabase-sync.js | no | — | **add** (strict PostgREST sync) | med (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) |
| migrations/245_agentsam_workflow_runs_supabase_sync.sql | migrations/245_agentsam_workflow_runs_supabase_sync.sql | no | — | **add**; apply only after `mcp_workflow_runs` → `agentsam_workflow_runs` rename per file header | **high** if order wrong |
| docs/supabase/* | docs/supabase/* | no | — | **add** | low |
| wrangler.production.toml | wrangler.production.toml | yes | DIFF | **do not change** deploy target (per instructions) | — |
| wrangler.jsonc | wrangler.jsonc | yes | DIFF | **do not change** in this port | — |
| package.json | package.json | yes | DIFF | optional align later; not required for new modules | low |
| package-lock.json | package-lock.json | untracked in target | — | leave untracked unless root lockfile policy changes | low |
| .nvmrc | .nvmrc | no | — | **add** (`22`) for CI/dev parity | low |
| dashboard/package.json | dashboard/package.json | yes | DIFF | inneranimalmedia Vite layout (`dashboard/app`) is canonical; agentsam untracked tree not merged | low |
| dashboard/vite.config.ts | dashboard/vite.config.ts | yes | DIFF | keep inneranimalmedia version | low |
| dashboard/app/** | dashboard/app/** | yes (inner) | — | canonical in inneranimalmedia | — |
| dashboard/public/** | dashboard/public/** | yes | — | canonical | — |
| dashboard/index.html | dashboard/index.html | yes | DIFF | keep inneranimalmedia | low |

## Step 3 — duplicate / legacy folders (no deletes performed)

| path | tracked in inneranimalmedia? | used by config/worker? | safe to delete? | note |
|------|------------------------------|-------------------------|-----------------|------|
| agent-dashboard/ | check per branch | not in dashboard wrangler path | **TBD** after inventory | do not delete until approved |
| agent-dashboard-legacy/ | if present | TBD | no | archive candidate |
| overview-dashboard/ | if present | TBD | no | |
| time-tracking-dashboard/ | if present | TBD | no | |
| public-homepage/ | varies | may bind ASSETS | no | |
| public-pages/ | varies | routes | no | |
| dashboard-next/ | untracked locally | no | maybe | scratch |
| dashboard/dist*, agent dist-dashboard | ignored | build artifact | yes when cleaning disk | not in git |
| agent-sam/static/dashboard/pages | R2 keys, not always in git | worker R2 | no | |
| `_PHASE*`, `_GREP*`, `local/`, `.tmp_dashboard_manifests/` | usually untracked | no | disk cleanup only | already in .gitignore patterns |

## D1 prerequisite (critical)

Worker code expects D1 tables **`agentsam_mcp_workflows`** and **`agentsam_workflow_runs`** (and columns from `245_*.sql`). If production D1 still uses `mcp_workflows` / `mcp_workflow_runs`, run a **one-time rename** (see comments in `migrations/245_agentsam_workflow_runs_supabase_sync.sql`) **before** applying column ALTERs, then apply migration 245.

## Step 4 — sandbox checklist (before Git integration flip)

- Deploy inneranimalmedia to sandbox route.
- `/dashboard/overview` and `/dashboard/storage` load.
- POST `/api/mcp/workflows/:id/run` creates D1 row in `agentsam_workflow_runs` and Supabase `agentsam.workflow_runs`.
- `rg` shows no runtime `FROM mcp_workflows` / `JOIN mcp_workflows` in workflow paths (dashboard build output excluded).
- Dashboard `vite build` output still under `dashboard/dist/static/dashboard/agent/`.
