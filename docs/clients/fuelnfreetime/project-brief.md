---
title: Fuel N Free Time — IAM Project Brief
summary: Commerce brand client worker compass — fuelnfreetime Worker, bindings, collab lanes, CMS hub.
doc_type: client_project_brief
system: FuelNFreetime
client: Fuel & Free Time
project_key: fuelnfreetime
tenant_id: tenant_sam_primeaux
workspace_id: ws_fuelnfreetime
public_domain: fuelnfreetime.com
worker_name: fuelnfreetime
worker_url: https://fuelnfreetime.meauxbility.workers.dev
github_repo: SamPrimeaux/fuelnfreetime
local_repo_path: /Users/samprimeaux/fuelnfreetime
d1_database_id: 9fd6ff92-e407-4b51-8b01-3c93f3845bb2
d1_database_name: fuelnfreetime
r2_bucket: fuelnfreetime
kv_namespace: CMS_CACHE
lane_key: client_project_semantic_search
tags:
  - fuelnfreetime
  - ecommerce
  - client-project
  - mcp
updated_at: 2026-07-06
---

# Fuel N Free Time — IAM project brief

## Client

**Fuel & Free Time** — lifestyle/commerce brand. Client: **Justin Molaison** (Lafayette, LA). Production: [fuelnfreetime.com](https://fuelnfreetime.com).

| Surface | Value |
|---|---|
| Worker | `fuelnfreetime` |
| GitHub | [SamPrimeaux/fuelnfreetime](https://github.com/SamPrimeaux/fuelnfreetime) |
| Local path | `/Users/samprimeaux/fuelnfreetime` |
| Deploy | `npm run deploy` on `main` |
| Identity | `client_fuelnfreetime` / `ws_fuelnfreetime` / `proj_fuelnfreetime` |
| Collaborator | Connor McNeely (Stripe + repo) |

**IAM rule:** Runtime code and **fuelnfreetime** D1 changes happen in the **fuelnfreetime repo only**.

## Bindings

| Binding | Resource | Role |
|---|---|---|
| `DB` | D1 `fuelnfreetime` (`9fd6ff92-…`) | Products, orders, CMS, admin auth |
| `WEBSITE_ASSETS` | R2 `fuelnfreetime` | Media at `/media/*` |
| `CMS_CACHE` | KV | Published CMS snapshots |
| `CMS_EDITOR` | Durable Object | Live CMS WebSocket rooms |
| `AGENTSAM_WAI` | Workers AI | Agent Sam inference |
| `FNF_VECTORIZE` | Vectorize | Client RAG index |

## Agent Sam SSOT

| Doc | Role |
|---|---|
| `docs/clients/fuelnfreetime/AGENTSAM.md` | Human-readable agent law (wins over DB) |
| `fuelnfreetime/AGENTS.md` | Client repo entry + runtime contract links |
| D1 `ctx_fuelnfreetime` | `ws_fuelnfreetime` registry row |
| D1 `ctx_cms_hub_fuelnfreetime` | IAM operator CMS hub tile |

## MCP / Collaborate

- MCP URL: `https://mcp.inneranimalmedia.com/mcp` only
- Connor: terminal sandbox for D1 — not MCP `agentsam_d1_query`
- Sam: `workspace_slug: fuelnfreetime` on D1 tools
- Collaborate tasks: `?client=client_fuelnfreetime`
- Manual time entry: IAM Collaborate → Time insights

See `docs/clients/fuelnfreetime/mcp-oauth-collab.md`.

## PrimeTech CMS (IAM dashboard)

1. Switch workspace → **Fuel N Free Time**
2. Or from `ws_inneranimalmedia` → `/dashboard/cms` → Fuel tile
3. Scope: `fuelnfreetime` site only

Migrations: `660_fuelnfreetime_cms_site.sql`, `661_fuelnfreetime_cms_workspace_scope.sql`, `777_fuelnfreetime_client_align.sql`.

## Ingest (IAM)

```bash
npm run run:ingest_client_fuelnfreetime
```

Manifest: `docs/clients/fuelnfreetime/ingest.manifest.json`.

## Open work

| P | Item |
|---|---|
| P0 | Stripe checkout (Connor lane) — contracts in client repo |
| P1 | Full client UAT on storefront + admin |
| P2 | Expand Vectorize ingest for client docs |
| P2 | Account transfer to client Cloudflare when approved |
