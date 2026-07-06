# AGENTSAM.md — Fuel N Free Time (fuelnfreetime.com)

> Runtime rules and context for Agent Sam on **Fuel & Free Time**.
> Human-readable source of truth. If this file conflicts with any database row — **this file wins** for agent behavior.
> IAM copy: `docs/clients/fuelnfreetime/AGENTSAM.md` · Client repo: `fuelnfreetime/AGENTSAM.md`

---

## Identity

```
Agent name:     Agent Sam (client worker)
Platform:       Fuel & Free Time — commerce + lifestyle brand on Cloudflare Workers
Operator:       Inner Animal Media (Sam Primeaux) · client Justin Molaison (Lafayette, LA)
Location:       fuelnfreetime.com
Client ID:      client_fuelnfreetime
Tenant:         tenant_sam_primeaux (IAM billing) · tenant_fuelnfreetime (client worker registry)
Workspace:      ws_fuelnfreetime
Project ID:     proj_fuelnfreetime
Collaborators:  Connor McNeely (repo + CF, Stripe lane)
```

---

## What This System Is

E-commerce storefront and admin for **Fuel & Free Time** — apparel/lifestyle brand. Product catalog, variants, inventory, cart, checkout v1 (without Stripe live), R2-backed CMS, admin SPA, Agent Sam skills on R2+D1. Separate client Worker from IAM platform; edited via fuel repo, IAM PrimeTech CMS when workspace is ws_fuelnfreetime, or MCP terminal sandbox.

---

## The Stack

```
Primary worker:         fuelnfreetime
Worker URL:             https://fuelnfreetime.meauxbility.workers.dev
Public domain:          https://fuelnfreetime.com
Worker deploy command:  npm run deploy (admin SPA build + wrangler deploy) — from fuelnfreetime repo only
Database:               D1 fuelnfreetime
Database ID:            9fd6ff92-e407-4b51-8b01-3c93f3845bb2
Frontend:               Admin SPA (admin-ui/) + static storefront in public/
Frontend deploy:        Bundled in npm run deploy
MCP server:             mcp.inneranimalmedia.com
MCP server URL:         https://mcp.inneranimalmedia.com/mcp
Storage:                R2 fuelnfreetime (/media/*, agentsam/skills/*)
KV namespaces:          CMS_CACHE (bc3b4e3f272e4b46b3c92df6dff85bff)
Other bindings:         CMS_EDITOR (DO), AGENTSAM_WAI, FNF_VECTORIZE, ASSETS
Account ID:             IAM Cloudflare account
GitHub:                 github.com/SamPrimeaux/fuelnfreetime
Local path:             /Users/samprimeaux/fuelnfreetime
```

---

## AI Routing

```
Routing method:         DB-driven (client D1 agentsam_* + IAM catalog when on platform chat)
Routing table:          agentsam_ai (client D1)
Routing key column:     model_key
Routing value column:   provider
Classification method:  IAM prompt builder + ctx_fuelnfreetime
Classification cost:    Per-turn when agentsam_usage wired; manual time entry fallback on IAM Collaborate
Valid platform values:  openai, anthropic, workers_ai
```

---

## Non-Negotiables

```
1. Client runtime changes in fuelnfreetime repo ONLY — do not patch fuel routes from inneranimalmedia Worker.
2. Read runtime contract before commerce/Stripe/CMS changes (docs/RUNTIME-CONTRACTS-*.md in client repo).
3. Stripe is NOT live — checkout v1 without payment capture; Connor owns Stripe lane when approved.
4. Connor (non-superadmin): MCP D1 tools blocked — use agentsam_terminal_sandbox with workspace_slug fuelnfreetime.
5. CMS publish: R2 bodies + KV snapshots — run cms:republish / cms:post-deploy after deploy when needed.
6. Each actor keeps own tenant_id on IAM CMS — workspace membership + cms_site registry, never route Connor through Sam's tenant.
7. Never commit secrets — wrangler secret put only.
```

---

## Key Tables

| Table | Purpose | Key Columns | Notes |
|-------|---------|-------------|-------|
| products | Catalog | id, slug, title | Storefront SSOT |
| product_variants | SKUs / sizes | product_id, sku | Inventory linked |
| inventory | Stock counts | variant_id, quantity | Admin managed |
| orders | Checkout records | id, status | Stripe pending |
| cms_pages | CMS routes | route, status | R2-backed sections |
| cms_sections | Section registry | page_id, section_key | KV publish |
| admin_users | Admin auth | email, password_hash | npm run admin:create |
| agentsam_project_context | Layer 0 | id=ctx_fuelnfreetime | ws_fuelnfreetime |

---

## Key Files

| File | Purpose | Notes |
|------|---------|-------|
| src/index.js | Worker router | Store + admin + CMS |
| src/store/api.js | Public store API | Catalog, cart |
| src/admin/api.js | Admin API | Products, orders |
| src/cms/api.js | CMS publish | R2 + KV pipeline |
| db/schema.sql | D1 schema | npm run db:migrate |
| AGENTS.md | Client agent entry | Points to runtime contracts |
| docs/RUNTIME-CONTRACTS-COMMERCE.md | Commerce SSOT | Products live |
| docs/RUNTIME-CONTRACTS-STRIPE.md | Stripe checklist | Not started |
| docs/clients/fuelnfreetime/mcp-oauth-collab.md | MCP + Connor scope | IAM repo |
| docs/clients/fuelnfreetime/AGENTSAM.md | This file | Agent Sam SSOT |

---

## Working Directories

```
Active codebase:    /Users/samprimeaux/fuelnfreetime
Repo(s):            SamPrimeaux/fuelnfreetime (client) · SamPrimeaux/inneranimalmedia (IAM docs/MCP/CMS hub)
Branch(es):         main
IAM CMS hub:        ws_inneranimalmedia → /dashboard/cms → Fuel tile → switches ws_fuelnfreetime
MCP terminal zone:  .mcp-zones/fuelnfreetime (Connor D1/schema lane)
```

---

## Deploy Rules

```
Who can deploy to production:   Sam · Connor (repo owner) with Sam review
Who can deploy to staging:      workers.dev preview URLs
Who can touch env vars/secrets: wrangler secret put on fuelnfreetime worker
Deploy process:                 cd fuelnfreetime && npm run deploy
CMS warm:                       npm run cms:post-deploy (CMS_WARM_SECRET)
Deploy hook:                    CMS_DEPLOY_HOOK_URL / Cloudflare Workers Builds
Rollback:                       git revert + npm run deploy
```

---

## The Project Loop

```
Step 1: Task in IAM Collaborate under client_fuelnfreetime or fuel repo
Step 2: Implement in fuelnfreetime — commerce, CMS, or admin SPA
Step 3: db:migrate if schema · deploy · cms:republish if content
Step 4: Verify fuelnfreetime.com + admin routes
Step 5: Log time manually in IAM Collaborate Time insights when auto-track misses
```

---

## Metrics & Cost Tracking

```
Per-turn cost:          agentsam_usage when wired
Per-session cost:       MISSING on client — use IAM collaborate manual entry
Model used:             agentsam_ai.model_key
Token count:            IAM telemetry when configured
Latency:                Worker observability enabled on fuel worker (logs on)
Billing lane:           time_projects project_key=fuelnfreetime · client_fuelnfreetime
Dead/unwired code:      Stripe checkout capture (contract written, not implemented)
```

---

## What's Broken / In Progress

```
[ ] 2026-07-06 — Stripe integration pending (Connor lane) — commerce live without payments
[ ] 2026-07-06 — Client brief/ingest lane — this AGENTSAM.md + project-brief now mapped on IAM
[ ] 2026-07-06 — Build queued after Companions site updates (Justin Molaison client)
[ ] 2026-07-06 — Verify custom domains fully active post nameserver cutover
```

---

## How Any AI Agent Should Use This File

```
1. Read this file before fuelnfreetime repo or fuel D1 changes
2. Read AGENTS.md + relevant RUNTIME-CONTRACTS-* in client repo for implementation detail
3. Non-negotiable violation → stop and explain
4. Connor: no MCP D1 — terminal sandbox with workspace_slug fuelnfreetime
5. Sam superadmin: agentsam_d1_query with workspace_slug fuelnfreetime
6. IAM RAG: client_project_semantic_search project_key fuelnfreetime
```

---

## Clients / Projects Under This Platform

| Client / Project | DB | Repo | Notes |
|------------------|----|------|-------|
| Fuel N Free Time | fuelnfreetime D1 | fuelnfreetime | This project — Justin Molaison |
| Inner Animal Media | inneranimalmedia-business | inneranimalmedia | Platform operator |

---

## Known Gotchas

```
- fuel D1 id 9fd6ff92… is NOT inneranimalmedia-business
- PrimeTech CMS on IAM uses inneranimalmedia R2 path cms/ws_fuelnfreetime/fuelnfreetime/ — not client R2 for IAM editor lane
- MCP invalid_client Ov23… = GitHub OAuth ID pasted instead of iam_mcp_inneranimalmedia
- DORA deploy attribution: PROJECT_ID=proj_fuelnfreetime
- tenant_fuelnfreetime vs tenant_sam_primeaux — CMS auth is workspace-scoped, not tenant-merged
```

---

*Created: 2026-07-06*
*Last updated: 2026-07-06*
*Edit directly. Commit every change. If it's not in this file, it doesn't exist.*
