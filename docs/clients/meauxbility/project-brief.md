---
title: Meauxbility Foundation — IAM Project Brief
summary: 501(c)(3) nonprofit platform compass — meauxbility Worker bindings, repo, and IAM workspace registry.
doc_type: client_project_brief
system: Meauxbility
client: Meauxbility Foundation
project_key: meauxbility
tenant_id: tenant_nonprofit_organization
workspace_id: ws_meauxbility
public_domain: meauxbility.org
worker_name: meauxbility
worker_url: https://meauxbility.meauxbility.workers.dev
github_repo: SamPrimeaux/meauxbility
local_repo_path: /Users/samprimeaux/meauxbility
d1_database_id: 011d1629-b5c8-49e7-8f6d-ca311ba936fe
d1_database_name: meauxbilityorg
r2_assets_bucket: meauxbilityorgfinal
r2_infrastructure_bucket: allinfrastructure
lane_key: client_project_semantic_search
tags:
  - meauxbility
  - nonprofit
  - 501c3
  - operator-workspace
updated_at: 2026-06-23
---

# Meauxbility Foundation — IAM project brief

## Organization

**Meauxbility Foundation** — 501(c)(3) nonprofit (EIN 33-4214907). Mission: accessibility, spinal cord injury recovery support, community impact. President: Sam Primeaux.

| Surface | Value |
|---|---|
| Public site | https://meauxbility.org |
| WWW | https://www.meauxbility.org |
| Admin | https://admin.meauxbility.org |
| Worker (production) | https://meauxbility.meauxbility.workers.dev |
| Worker (preview) | `https://*-meauxbility.meauxbility.workers.dev` |
| Worker name | `meauxbility` |
| GitHub | [SamPrimeaux/meauxbility](https://github.com/SamPrimeaux/meauxbility) |
| Local path | `/Users/samprimeaux/meauxbility` |
| IAM identity | `tenant_nonprofit_organization` / `ws_meauxbility` |
| Operator access | Sam-only workspace (see migration 546 blocklist) |

## Domains & routes (Cloudflare dashboard — 2026-06-23)

All routes hit Worker **`meauxbility`** in zone **`meauxbility.org`**. Access is **public** (Cloudflare Access not enforced on workers.dev or listed custom domains unless toggled in dashboard).

| Host / pattern | Type | Notes |
|---|---|---|
| `meauxbility.meauxbility.workers.dev` | Production workers.dev URL | Direct Worker URL |
| `*-meauxbility.meauxbility.workers.dev` | Preview | Branch/version previews |
| `meauxbility.org/*` | Route | Apex wildcard |
| `www.meauxbility.org/*` | Route | WWW wildcard |
| `meauxbility.org` | Custom domain | Production |
| `www.meauxbility.org` | Custom domain | Production |
| `admin.meauxbility.org` | Custom domain | Admin / dashboard surface |

**Smoke after deploy:** `https://meauxbility.org/`, `https://www.meauxbility.org/`, `https://admin.meauxbility.org/` (expect 200 or auth redirect — not 522/1101).

**IAM storefront map:** `cmsStorefrontUrl.ts` resolves slug `meauxbility` → `meauxbility.org` (not admin subdomain).

**IAM rule:** Runtime code and **meauxbilityorg** D1 changes happen in the **meauxbility repo** or Worker deploy — not from patching `inneranimalmedia` Worker routes.

## Production bindings (Cloudflare dashboard SSOT — 2026-06-22)

| Binding | Type | Resource |
|---|---|---|
| `DB` | D1 | `meauxbilityorg` (`011d1629-b5c8-49e7-8f6d-ca311ba936fe`) |
| `ASSETS_BUCKET` | R2 | `meauxbilityorgfinal` |
| `INFRASTRUCTURE_BUCKET` | R2 | `allinfrastructure` |
| `CACHE` | KV | `production-CACHE` |
| `SESSIONS` | KV | `production-KV_SESSIONS` |
| `REALTIME_KV` | KV | `meauxos_RealtimeServer` |
| `HYPERDRIVE` | Hyperdrive | `meauxhyper` (Supabase) |
| `SESSION_DO` | Durable Object | `meauxbility_MEAUXSession` |

Public R2 (plaintext var): `R2_PUBLIC_URL=https://pub-b2c86021de114066bc2eefa2e0ee3250.r2.dev`

## Secrets inventory (production worker)

Stripe (`STRIPE_*`), Supabase (`SUPABASE_*`), OpenAI, Meshy, CloudConvert, GCP Workload Identity, Realtime SFU tokens, Cloudflare API/images tokens, Google OAuth, `MEAUXBILITY_GOOGLE_API`, `AI_GATEWAY_TOKEN`, CF Access client creds.

**Not on CPAS bridge lane:** no `AGENTSAM_BRIDGE_KEY` / `IAM_TELEMETRY_URL` on this worker today — IAM maintains compass + operator dashboard context; deploy is direct to `meauxbility` Worker.

## Git vs production drift (critical)

| Source | What it shows |
|---|---|
| **CF Worker `meauxbility`** | Full stack: D1, DO, Hyperdrive, multi-R2/KV (above) |
| **Git `main` (cloned 2026-06-22)** | `wrangler.jsonc` name `meauxbility-cidi-staging`, static assets + Pages Functions only — **no D1/DO bindings in repo** |

Before major changes: confirm which branch/config Workers Builds deploys. **Dashboard bindings are production truth until wrangler in git matches.**

Repo also contains `meauxbility-react/` (Vite) and `functions/api/d1.ts` referencing many D1 binding names — align wrangler with live Worker or trim dead bindings.

## IAM integration today

| Mechanism | Status |
|---|---|
| `ws_meauxbility` in `agentsam_workspace` | **Sparse** — migration `693` fills registry metadata |
| RAG lane UUID | `869137d3-cd65-4ac1-88cc-a1bad9844718` (`rag-lanes.js`) |
| CMS storefront map | `meauxbility.org` in `cmsStorefrontUrl.ts` |
| Collab delivery ship slug | **Not** in `IAM_COLLAB_SHIP_SLUGS` (operator nonprofit, not client SaaS lane) |
| Tail worker | `inneranimalmedia-tail` (shared) |

## Observability

Dashboard: **Logs disabled** on `meauxbility` worker — enable before incident debug (same as companionscpas audit).

## Related IAM docs

| Doc | Path |
|---|---|
| Operations runbook | `docs/clients/meauxbility/runbook.md` |
| Companions CPAS (client-worker pattern reference) | `docs/clients/companionscpas/runbook.md` |
| Platform baseline | `docs/platform/platform-baseline-2026-06-03.md` |

## Ingest (IAM Agent Sam)

```bash
npm run run:ingest_client_meauxbility
```

Manifest: `docs/clients/meauxbility/ingest.manifest.json`

## Open work (priority)

| P | Item |
|---|---|
| P0 | Reconcile `wrangler.jsonc` / deploy path with live Worker `meauxbility` bindings |
| P1 | Apply migration `693_meauxbility_iam_workspace.sql` to IAM D1 |
| P1 | Enable worker logs on `meauxbility` |
| P2 | Document deploy hook URL in IAM once Workers Builds hook exists |
| P2 | Optional: `AGENTSAM_BRIDGE_KEY` + telemetry if federated learning from nonprofit Agent Sam is desired |
| P3 | Align portfolio case study copy (if any) with dog rescue / accessibility mission — not CPA firm template |
