# AGENTSAM.md — Companions of Caddo (companionsofcaddo.org)

> Runtime rules and context for Agent Sam on **CompanionsCPAS**.
> Human-readable source of truth. If this file conflicts with any database row — **this file wins** for agent behavior.
> IAM copy: `docs/clients/companionscpas/AGENTSAM.md` · Client repo: `companionscpas/AGENTSAM.md`

---

## Identity

```
Agent name:     Agent Sam (client worker)
Platform:       CompanionsCPAS — Cloudflare Workers nonprofit site
Operator:       Inner Animal Media (Sam Primeaux) for client Companions of CPAS
Location:       Caddo Parish, Louisiana — companionsofcaddo.org
Client ID:      client_companions_cpas
Tenant:         tenant_companionscpas
Workspace:      ws_companionscpas
Project ID:     proj_companions_cpas_web
```

---

## What This System Is

Production website and admin dashboard for **Companions of CPAS**, a nonprofit dog rescue. Public CMS-driven pages (adopt, donate, foster, community), animal profiles, foster applications, donations (Stripe Elements), email workspace, and Agent Sam chat baseline. Runtime lives entirely on the **companionscpas** Worker — not the IAM platform worker.

---

## The Stack

```
Primary worker:         companionscpas
Worker URL:             https://companionscpas.meauxbility.workers.dev
Public domain:          https://companionsofcaddo.org
Worker deploy command:  npm run deploy:full (R2 sync + wrangler deploy) — from companionscpas repo only
Database:               D1 companionscpas
Database ID:            fd6dd6fb-156b-4b6a-8ff0-505422652391
Frontend:               React dashboard (Babel CDN, no Vite) + sectional CMS HTML in R2
Frontend deploy:        Included in deploy:full (R2 sync)
MCP server:             mcp.inneranimalmedia.com (IAM platform — D1 via workspace_slug companionscpas / ws_companionscpas)
MCP server URL:         https://mcp.inneranimalmedia.com/mcp
Storage:                R2 companionscpas · CDN assets.companionsofcaddo.org
KV namespaces:          CMS_CACHE (companionscpas-cache)
Other bindings:         AGENTSAM_WAI (Workers AI), AGENTSAM_BRIDGE_KEY (IAM CMS bridge)
Account ID:             IAM Cloudflare account (client worker under Meauxbility workers.dev zone)
GitHub:                 github.com/SamPrimeaux/companionscpas
Local path:             /Users/samprimeaux/companionscpas
```

---

## AI Routing

```
Routing method:         DB-driven (agentsam_ai on client D1 + IAM model catalog when bridged)
Routing table:          agentsam_ai (client D1), agentsam_model_catalog (IAM when on platform chat)
Routing key column:     model_key / api_platform
Routing value column:   provider
Classification method:  IAM Agent Sam prompt builder + client project context
Classification cost:    Per-turn in agentsam_usage / project_costs when wired
Valid platform values:  openai, anthropic, workers_ai (BYOK via IAM when applicable)
```

---

## Non-Negotiables

```
1. Client code and D1 changes happen in companionscpas repo ONLY — never patch production from inneranimalmedia Worker.
2. CMS publish contract: D1 (SSOT) → R2 section fragments → KV page:{route} bust → verify on companionsofcaddo.org.
3. No ad-hoc production HTML edits — dashboard CMS publish or scripted fragment sync only.
4. Every public route uses site-main + data-route + shared.css/shared.js shell (page_shell.js).
5. Policy memory: companionscpas_non_negotiable_change_sync_contract — read before any publish or deploy.
6. IAM RAG lane client_project_semantic_search reads IAM docs — not CPAS D1 project_context for platform Agent Sam retrieval.
7. Never commit secrets, Stripe keys, or session cookies into memory/docs.
```

---

## Key Tables

| Table | Purpose | Key Columns | Notes |
|-------|---------|-------------|-------|
| cms_pages | Published route registry | route, status, title | SSOT for public URLs |
| cms_page_sections | Section order + fragment keys | page_id, section_key | Drives R2 fragment paths |
| animal_profiles | Adoptable animals | id, name, status | Public /adopt |
| cpas_foster_applications | Foster intake | id, status, animal_id | Admin workflow |
| donations | Stripe donation records | amount, stripe_payment_intent_id | Test mode until client live keys |
| stripe_webhooks | Webhook audit | event_type, payload | Enable observability before debug |
| users | Dashboard auth | email, role | Google OAuth primary |
| agentsam_project_context | Worker-local Layer 0 | id, project_key | ctx_companionscpas_cms_publish_v1 active |

---

## Key Files

| File | Purpose | Notes |
|------|---------|-------|
| src/index.js | Worker router | All API + page assembly |
| src/api/page_shell.js | HTML shell | shared.css, modals, donate |
| src/api/render_section.js | Generic section renderer | /services, /adopt, /donate, /community |
| src/api/cms_api.js | CMS admin API | Publish pipeline entry |
| src/api/payments_email.js | Stripe + Resend | Donation checkout + webhook |
| public/static/js/donate-modal.js | Stripe Elements modal | /donate |
| scripts/sync-page-fragments.mjs | R2 fragment sync | Post-CMS publish |
| ARCHITECTURE.md | Bindings + R2 layout | Read before any code change |
| docs/current-file-map.md | Route → file → API map | v2 handoff |
| docs/clients/companionscpas/project-brief.md | IAM compass brief | Ingested to Vectorize |
| docs/clients/companionscpas/AGENTSAM.md | This file | Agent Sam SSOT |

---

## Working Directories

```
Active codebase:    /Users/samprimeaux/companionscpas
Repo(s):            SamPrimeaux/companionscpas (client) · SamPrimeaux/inneranimalmedia (IAM docs/RAG only)
Branch(es):         main (production)
IAM CMS hub:        ws_inneranimalmedia → /dashboard/cms → Companions tile → switches ws_companionscpas
```

---

## Deploy Rules

```
Who can deploy to production:   Sam (IAM superadmin) · client approval for account transfer later
Who can deploy to staging:      Sam · preview via workers.dev
Who can touch env vars/secrets: wrangler secret put on companionscpas worker only
Deploy process:                 cd companionscpas && npm run deploy:full
Rollback process:               git revert + redeploy; KV bust via CMS republish
IAM operator CMS:               PrimeTech CMS via client_worker bridge (AGENTSAM_BRIDGE_KEY)
```

---

## The Project Loop

```
Step 1: Task/ticket in IAM collaborate (client_companions_cpas) or client repo issue
Step 2: Edit in companionscpas repo — local wrangler dev or IAM CMS bridge for content
Step 3: CMS publish or code deploy → D1/R2/KV pipeline
Step 4: Verify companionsofcaddo.org + dashboard smoke
Step 5: Log time manually in IAM Collaborate if auto-tracking missed; update agentsam_memory pack if policy changed
```

---

## Metrics & Cost Tracking

```
Per-turn cost:          agentsam_usage (IAM) · project_costs (client burn lane)
Per-session cost:       agentsam_chat_sessions when wired
Model used:             agentsam_ai.model_key
Token count:            agentsam_usage tokens columns
Latency:                IAM telemetry ingest when IAM_TELEMETRY_URL set on client
Billing lane:           time_projects project_key=companionscpas · client_companions_cpas
Dead/unwired code:      Lane B social publish stubs (501 until client approval)
```

---

## What's Broken / In Progress

```
[ ] 2026-07-06 — Donation pipeline: verify live Stripe keys after client sign-off (test mode smoke passed 2026-06-12)
[ ] 2026-07-06 — Worker observability was disabled — enable logs before webhook debug
[ ] 2026-07-06 — cms_publish_artifacts tracking gap vs publish jobs
[ ] 2026-07-06 — Ship /_internal/cms-embed-session on client worker for IAM iframe CMS
[ ] 2026-07-06 — assets.companionsofcaddo.org migration off legacy CDN paths
```

---

## How Any AI Agent Should Use This File

```
1. Read this file completely before touching companionscpas repo or CPAS D1
2. If a proposed change violates a non-negotiable — stop and say so explicitly
3. If blank or placeholder — ask Sam; do not assume bindings or table names
4. If this file and CPAS D1 agentsam_project_context conflict — trust this file, flag conflict
5. Platform patterns (CMS pipeline, email): docs/patterns/* via docs_knowledge_search on IAM
6. Client scope questions: client_project_semantic_search with project_key companionscpas
```

---

## Clients / Projects Under This Platform

| Client / Project | DB | Repo | Notes |
|------------------|----|------|-------|
| Companions of CPAS | companionscpas D1 | companionscpas | This project — nonprofit rescue site |
| Inner Animal Media | inneranimalmedia-business | inneranimalmedia | Platform operator — docs/RAG/MCP only for this client |

---

## Known Gotchas

```
- companionscpas D1 is NOT inneranimalmedia-business — MCP D1 tools need workspace_slug or terminal sandbox
- ctx_companionscpas lives on ws_companionscpas in IAM D1 registry (not ws_inneranimalmedia)
- Starred vs client-work task views on IAM Collaborate filter by client_id=client_companions_cpas
- Dual webhook events can duplicate donation rows — add PaymentIntent idempotency guard
- GOOGLE_REDIRECT_URI in wrangler.toml is dead — redirects built from url.origin
```

---

*Created: 2026-07-06*
*Last updated: 2026-07-06*
*Edit directly. Commit every change. If it's not in this file, it doesn't exist.*
