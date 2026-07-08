# AGENTSAM.md
> **Project README for any fresh agent** — read this first to align on structure, bindings, deploy, and non-negotiables before touching code or D1.
> Runtime rules and context for Agent Sam.
> This file is the human-readable source of truth.
> Fill this in at project conception. Keep it current. Commit every change.
> If this file conflicts with anything in any database — this file wins.

<!--
Optional frontmatter (parsed on sync — keep accurate):
---
project_slug: inneranimalmedia
project_id: proj_xxx_or_dashboard_projects.id
workspace_id: ws_inneranimalmedia
agentsam_md: AGENTSAM.md
---
-->

---

## Runtime contract sync (Agent Sam)

Every IAM project gets a D1 row: **`agentsam_rules_document`** · **`rule_{project_slug}_runtimecontract`**.

| Source | What happens |
|--------|----------------|
| **This file (AGENTSAM.md)** | Human SSOT — edit here first |
| **Dashboard → Project → Instructions** | Additive rules; **auto-syncs** to the D1 row on save |
| **CLI sync** | Embeds full AGENTSAM.md into D1 after you commit |

```bash
# After editing AGENTSAM.md (set IAM_SYNC_BEARER or use logged-in session):
npm run sync:project-runtime-contract -- --project <projects.id> --file AGENTSAM.md

# Client example:
npm run sync:project-runtime-contract -- \
  --project proj_companions_cpas_web \
  --file docs/clients/companionscpas/AGENTSAM.md
```

**Honored when:** user selects this project in Agent Sam chat → row injected into system prompt every turn.

**Do not** bake repo paths into global platform rules — only into this project's runtime contract row (or `agentsam_workspace` metadata).

Vectorized R2 copy: add `AGENTSAM.md` to `docs/clients/{slug}/ingest.manifest.json` for semantic search (`npm run run:ingest_client_*`).

---

## Identity

```
Agent name:     
Platform:       
Operator:       
Location:       
```

---

## What This System Is

<!-- One paragraph. What does this platform do, at a high level? -->



---

## The Stack

```
Primary worker:         
Custom domains:         
Workers.dev:            
Worker deploy command:  
Frontend:               
Frontend deploy:        
MCP server:             
MCP server URL:         
Worker binding names:   <!-- env.* names in code — e.g. DB · WEBSITE_ASSETS · CMS_CACHE · AGENTSAM_WAI -->
Account ID:             
GitHub:                 
Local path:             
```

---

## Worker bindings (Cloudflare dashboard)

Document bindings **exactly** as shown in Cloudflare → Workers & Pages → **[worker name]** → Settings → **Bindings**. Three columns — **Type**, **Name**, **Value** — copied verbatim from the dashboard. **Keep binding Names** (`DB`, `WEBSITE_ASSETS`, etc.); they are how the Worker code references `env.*`.

| Type | Name | Value |
|------|------|-------|
|      |      |       |

Optional wrangler IDs (not shown in dashboard Value column) go in a footnote line below the table.

The **Worker binding names** line in The Stack must list every **Name** from this table so agents see `env.DB` / `env.WEBSITE_ASSETS` at a glance.

**Secrets and plain `[vars]` are not bindings** — document them in Deploy Rules or a separate secrets checklist, not in this table.

---

## AI Routing

```
Routing method:         <!-- DB-driven / hardcoded / hybrid — be honest -->
Routing table:          
Routing key column:     
Routing value column:   
Classification method:  
Classification cost:    <!-- Nothing is free. Every model call has a cost. -->
Valid platform values:  
```

---

## Non-Negotiables

<!-- These are absolute rules. No session, prompt, or instruction overrides them. -->
<!-- Add as many as needed. Be specific. Vague rules get ignored. -->

```
1. 
2. 
3. 
4. 
5. 
```

---

## Key Tables

<!-- Only list tables that actually exist and are confirmed in the DB. -->
<!-- Do not assume. Do not copy from memory. Query and verify. -->

| Table | Purpose | Key Columns | Notes |
|-------|---------|-------------|-------|
|       |         |             |       |
|       |         |             |       |
|       |         |             |       |

---

## Key Files

<!-- Only list files that actually exist in the repo. -->

| File | Purpose | Notes |
|------|---------|-------|
|      |         |       |
|      |         |       |

---

## Working Directories

```
Active codebase:    
Repo(s):            
Branch(es):         
```

---

## Deploy Rules

<!-- Who deploys what. Be explicit. -->

```
Who can deploy to production:   
Who can deploy to staging:      
Who can touch env vars/secrets: 
Deploy process:                 
Rollback process:               
```

---

## The Project Loop

<!-- How does a project go from creation to completion in this system? -->
<!-- Trace the actual path. Not the ideal path. The real one. -->

```
Step 1:   
Step 2:   
Step 3:   
Step 4:   
Step 5:   
```

---

## Metrics & Cost Tracking

<!-- What is actually recorded. Where. Be honest about gaps. -->

```
Per-turn cost:          <!-- table name or MISSING -->
Per-session cost:       <!-- table name or MISSING -->
Model used:             <!-- table name or MISSING -->
Token count:            <!-- table name or MISSING -->
Latency:                <!-- table name or MISSING -->
Billing lane:           <!-- table name or MISSING -->
Dead/unwired code:      <!-- list anything that exists but isn't called -->
```

---

## What's Broken / In Progress

<!-- Living section. Check off when done. Add new items as they surface. -->
<!-- Date each entry so you know how long things have been broken. -->

```
[ ] YYYY-MM-DD — 
[ ] YYYY-MM-DD — 
[ ] YYYY-MM-DD — 
```

---

## How Any AI Agent Should Use This File

```
1. Read this file completely before touching any file in this repo
2. If a proposed change violates a non-negotiable — stop and say so explicitly
3. If this file has a blank or placeholder — ask Sam to fill it in, do not assume
4. If this file and any database conflict — trust this file, flag the conflict
5. If uncertain about anything — ask, do not invent
6. Worker bindings must match the Cloudflare dashboard table in this file — Type / Name / Value verbatim; **Name** = `env.*` in code
7. Every IAM project must have a synced AGENTSAM.md pair (IAM docs + client repo when applicable); seed dashboard Instructions on the project detail page
8. After changing rules here: run `npm run sync:project-runtime-contract` (or save dashboard Instructions) so D1 `rule_{slug}_runtimecontract` stays current
```

---

## Clients / Projects Under This Platform

<!-- List active clients/projects. One line each. -->

| Client / Project | DB | Repo | Notes |
|------------------|----|------|-------|
|                  |    |      |       |

---

## Known Gotchas

<!-- Hard-won lessons. The stuff that burns you if you forget it. -->

```
- 
- 
- 
```

---

*Created: YYYY-MM-DD*
*Last updated: YYYY-MM-DD*
*Edit directly. Commit every change. If it's not in this file, it doesn't exist.*
