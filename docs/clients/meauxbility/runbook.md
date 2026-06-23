---
title: Meauxbility Foundation — IAM Operations Runbook
doc_type: client_runbook
client: Meauxbility Foundation
project_key: meauxbility
tenant_id: tenant_nonprofit_organization
workspace_id: ws_meauxbility
lane_key: client_project_semantic_search
tags: [meauxbility, nonprofit, 501c3, runbook]
updated_at: 2026-06-23
---

# Meauxbility — maintain from Inner Animal Media

Operator workspace for **your 501(c)(3)** public site and nonprofit stack. Not a paying client-worker CMS lane like Companions CPAS — you deploy and own the `meauxbility` Worker directly.

## Identity card

| Field | Value |
|-------|-------|
| Org | Meauxbility Foundation (501(c)(3), EIN 33-4214907) |
| Public | https://meauxbility.org · https://www.meauxbility.org |
| Admin | https://admin.meauxbility.org |
| Worker URL | https://meauxbility.meauxbility.workers.dev |
| Preview URL | `https://<branch>-meauxbility.meauxbility.workers.dev` |
| Git | git@github.com:SamPrimeaux/meauxbility.git |
| Local | `/Users/samprimeaux/meauxbility` |
| IAM workspace | `ws_meauxbility` |
| IAM tenant | `tenant_nonprofit_organization` |
| Primary D1 | `meauxbilityorg` — `011d1629-b5c8-49e7-8f6d-ca311ba936fe` |

## Domains & routes

| Entry | Environment |
|-------|-------------|
| `meauxbility.org/*` | Route → Worker `meauxbility` |
| `www.meauxbility.org/*` | Route → Worker `meauxbility` |
| `meauxbility.org` | Custom domain (production) |
| `www.meauxbility.org` | Custom domain (production) |
| `admin.meauxbility.org` | Custom domain (production) — admin/dashboard |
| `meauxbility.meauxbility.workers.dev` | workers.dev production |
| `*-meauxbility.meauxbility.workers.dev` | Preview deployments |

Zone: **meauxbility.org**. All listed endpoints are public unless you enable Cloudflare Access per hostname in dashboard.

## Production bindings (dashboard)

```
DB                  → D1 meauxbilityorg
ASSETS_BUCKET       → R2 meauxbilityorgfinal
INFRASTRUCTURE_BUCKET → R2 allinfrastructure
CACHE               → KV production-CACHE
SESSIONS            → KV production-KV_SESSIONS
REALTIME_KV         → KV meauxos_RealtimeServer
HYPERDRIVE          → meauxhyper (Supabase)
SESSION_DO          → meauxbility_MEAUXSession
```

Compat: `2026-01-20`, `nodejs_compat`. Tail: `inneranimalmedia-tail`.

## Git vs Cloudflare (read first)

Cloned repo `main` currently has:

```json
// wrangler.jsonc — name: meauxbility-cidi-staging, assets only
```

Live Worker **`meauxbility`** in dashboard has full D1/DO/Hyperdrive stack. **Do not assume `git push main` matches production** until wrangler in repo is reconciled.

**Action:** Export live wrangler config from dashboard or `wrangler.toml` from last known good deploy; commit to `SamPrimeaux/meauxbility`.

## Work from IAM dashboard

1. Switch workspace to **`ws_meauxbility`** (Sam operator pin).
2. Use IAM for Agent Sam compass, RAG ingest, portfolio references — **not** for mutating nonprofit D1 via platform CMS (no `client_worker` bridge like CPAS).
3. Code changes: **`/Users/samprimeaux/meauxbility`** → deploy to Worker `meauxbility`.
4. Platform D1 registry update (workspace metadata only):

```bash
cd ~/inneranimalmedia
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=./migrations/693_meauxbility_iam_workspace.sql
```

## Deploy

| Path | Notes |
|------|-------|
| Workers Builds | Connect repo in CF dashboard — confirm branch + wrangler file |
| Local | `cd ~/meauxbility && npx wrangler deploy` (after wrangler matches prod) |
| IAM hook | Not registered yet — add `hook_deploy_meauxbility` when Builds hook URL is known |

Post-deploy smoke:

- https://meauxbility.org/
- https://www.meauxbility.org/
- https://admin.meauxbility.org/
- https://meauxbility.meauxbility.workers.dev/

## D1 operations

Client nonprofit data lives in **`meauxbilityorg`** — not `inneranimalmedia-business`.

```bash
cd ~/meauxbility
npx wrangler d1 execute meauxbilityorg --remote --command "SELECT name FROM sqlite_master WHERE type='table' LIMIT 20"
```

Never apply IAM platform migrations to `meauxbilityorg`.

## Supabase / Hyperdrive

Worker binds **`HYPERDRIVE` → meauxhyper**. Secrets: `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. IAM platform uses separate Hyperdrive config (`dpmuvynqixblxsilnlut`) — same org, different binding names.

## Realtime / DO

`SESSION_DO` → `meauxbility_MEAUXSession`. Plaintext SFU vars on worker for RealtimeKit-style sessions. Treat as production — rotate if leaked in dashboard exports.

## Agent Sam / RAG

```bash
cd ~/inneranimalmedia
npm run run:ingest_client_meauxbility
```

Filter retrieval: `project_key: meauxbility`, lane `client_project_semantic_search`.

## Observability

Enable **Logs** on Worker `meauxbility` in Cloudflare dashboard (currently disabled).

## Contrasts with Companions CPAS

| | Meauxbility | Companions CPAS |
|---|-------------|-----------------|
| Owner | Operator (Sam) | Client nonprofit |
| IAM CMS bridge | No | Yes (`cpas_fragment`) |
| Deploy hook in IAM | Pending | `73b9a4da-…` |
| `AGENTSAM_BRIDGE_KEY` | Not on worker | Required |
| D1 | `meauxbilityorg` | `companionscpas` |

## Quick commands

```bash
# Clone / update
git clone git@github.com:SamPrimeaux/meauxbility.git ~/meauxbility

# IAM registry verify
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command "SELECT id, status, worker_name, json_extract(metadata_json,'$.public_domain') FROM agentsam_workspace WHERE id='ws_meauxbility'"

# Re-ingest docs
npm run run:ingest_client_meauxbility
```
