---
title: CompanionsCPAS Client Project Brief
summary: Canonical client/project reference for Companions of CPAS — Cloudflare Worker, D1, R2, KV, CMS, Stripe Elements donations, integrations, and known gaps (2026-06-12).
description: Ground-truth project dossier for Agent Sam client_project_semantic_search and docs_knowledge_search retrieval.
doc_type: client_project_brief
system: CompanionsCPAS
client: Companions of CPAS
project_key: companionscpas
tenant_id: tenant_companionscpas
workspace_id: ws_companionscpas
public_domain: companionsofcaddo.org
worker_name: companionscpas
worker_url: https://companionscpas.meauxbility.workers.dev
github_repo: SamPrimeaux/companionscpas
d1_database_id: fd6dd6fb-156b-4b6a-8ff0-505422652391
d1_database_name: companionscpas
r2_bucket: companionscpas
kv_namespace: companionscpas-cache
embedding_model: text-embedding-3-large
embedding_dimensions: 1536
lane_key: client_project_semantic_search
rag_lane: docs
primary_binding: AGENTSAM_VECTORIZE_DOCUMENTS
tags:
  - companionscpas
  - companions-of-cpas
  - client-project
  - nonprofit
  - animal-rescue
  - cloudflare-workers
  - d1
  - r2
  - kv
  - cms
  - dashboard
  - donations
  - stripe
  - resend
chunk_strategy: markdown_headings
target_chunk_tokens: 600
chunk_overlap_tokens: 100
updated_at: 2026-06-12
---

# CompanionsCPAS Client Project Brief

## Client and mission

**CompanionsCPAS** is the production platform for **Companions of CPAS** (Companion Animal Protection & Adoption Services), a nonprofit animal rescue and adoption organization serving Caddo Parish, Louisiana.

| Surface | URL |
|---------|-----|
| **Production domain** | [companionsofcaddo.org](https://companionsofcaddo.org) |
| **Worker origin** | `https://companionscpas.meauxbility.workers.dev` |
| **GitHub** | [SamPrimeaux/companionscpas](https://github.com/SamPrimeaux/companionscpas) (`main`, auto-deploy via Workers Builds) |

The platform is a **Cloudflare Workers monolith** with its **own D1 database** (not IAM main), R2 static/CMS artifacts, KV page cache, dashboard SPA, CMS publish pipeline, foster intake, animal profiles, and Stripe donations.

**Identity (D1 / worker):**

| Field | Value |
|-------|-------|
| `tenant_id` | `tenant_companionscpas` |
| `workspace_id` | `ws_companionscpas` |
| `APP_NAME` | Companions of CPAS |
| `APP_DOMAIN` | `companionsofcaddo.org` |
| `ADMIN_EMAIL` | `ljmusland@gmail.com` |

## Production architecture (bindings)

| Binding | Resource | Role |
|---------|----------|------|
| Worker | `companionscpas` | HTTP API, public SSR pages, dashboard, webhooks, cron |
| D1 `DB` | `companionscpas` (`fd6dd6fb-156b-4b6a-8ff0-505422652391`) | CMS, animals, fosters, donations, users, local Agent Sam tables |
| R2 `WEBSITE_ASSETS` | `companionscpas` | Published HTML, `/static/**`, `donate-modal.js` |
| KV `CMS_CACHE` | `companionscpas-cache` | Published page cache |
| Cron | `0 6 * * *` | Daily scheduled handler (`scheduled()`) |

**Deploy:** `npx wrangler deploy` from repo root on push to `main`.  
**Compatibility date:** 2025-04-01.

### Publish pipeline (non-negotiable)

D1 (source of truth) → R2 (published artifacts) → KV (cache) → verify on `companionsofcaddo.org`.

- Edit and publish through the **dashboard CMS**, not ad-hoc production HTML edits.
- Sync dashboard/static assets to R2 before declaring a change live.
- Purge KV after public page, theme, or brand changes.

Durable policy memory key: `companionscpas_non_negotiable_change_sync_contract` (IAM `agentsam_memory`).

## Runtime secrets and environment (worker dashboard)

Verified on Cloudflare Worker **companionscpas** (2026-06-12):

| Name | Type | Notes |
|------|------|-------|
| `ADMIN_EMAIL` | plaintext | `ljmusland@gmail.com` |
| `ALLOWED_ORIGINS` | plaintext | `https://companionsofcaddo.org` |
| `APP_DOMAIN` | plaintext | `companionsofcaddo.org` |
| `APP_NAME` | plaintext | Companions of CPAS |
| `GOOGLE_CLIENT_ID` | secret | Set (encrypted) |
| `GOOGLE_CLIENT_SECRET` | secret | Set (encrypted) |
| `GOOGLE_REDIRECT_URI` | plaintext | `https://companionsofcaddo.org/api/social/oauth/youtube/callback` |
| `META_APP_ID` | plaintext | Present in dashboard (verify non-empty value) |
| `META_APP_SECRET` | plaintext | Present in dashboard (verify non-empty value) |
| `META_REDIRECT_URI` | plaintext | `https://companionsofcaddo.org/api/social/oauth/meta/callback` |
| `RESEND_API_KEY` | secret | Set (encrypted) |
| `RESEND_FROM_EMAIL` | plaintext | `Companions of CPAS <no-reply@companionsofcaddo.org>` |
| `STRIPE_PUBLISHABLE_KEY` | secret | Set (encrypted) |
| `STRIPE_SECRET_KEY` | secret | Set (encrypted) |
| `STRIPE_WEBHOOK_SECRET` | secret | Set (encrypted) |
| `OPENAI_API_KEY` | secret | Set (encrypted) |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Set |
| `CLOUDFLARE_API_TOKEN` | secret | Set |
| `AGENTSAM_BRIDGE_KEY` | secret | IAM telemetry bridge |
| `IAM_TELEMETRY_URL` | secret | IAM telemetry |
| `INTERNAL_PUBLISH_KEY` | secret | CMS publish auth |
| `PASSWORD_RESET_SECRET` | secret | Auth |

**Observability:** Logs, traces, exports, and sampling are **disabled** on this worker — enable before production debugging sessions.

## Public CMS (D1 audit 2026-06-12)

| Metric | Value |
|--------|-------|
| `cms_pages` | **6** routes, all **published** |
| `cms_publish_jobs` | **25**, all **done** |
| `cms_publish_artifacts` | **0** rows (artifact tracking gap — jobs succeed but table unused or writes skipped) |

| Route | Title | Published |
|-------|-------|-----------|
| `/` | Companions of CPAS — Second Chances for Caddo Dogs | 2026-06-11 |
| `/about` | About | 2026-06-11 |
| `/adopt` | Adopt | 2026-06-11 |
| `/community` | Community | 2026-06-11 |
| `/donate` | Donate | 2026-06-11 |
| `/services` | Services | 2026-06-11 |

Global shell: `/static/global/shared.css`, `shared.js`, header assets on R2 bucket `companionscpas`. Prefer **`assets.companionsofcaddo.org`** for public asset URLs; migrate off legacy `assets.meauxxx.com` where any remain.

## Animals, foster, users (D1)

| Table | Rows (2026-06-12) |
|-------|---------------------|
| `animal_profiles` | 19 |
| `cpas_foster_applications` | 4 |
| `users` | 6 |

## Donations — Stripe Elements (in-modal, live)

**Status:** Full **Stripe Elements** in-modal donation flow deployed for **companionsofcaddo.org**.

### User flow

1. Donor clicks **Support Our Mission** on `/donate`.
2. Dark-themed modal opens (`/static/js/donate-modal.js` on R2).
3. Donor selects campaign + amount.
4. **Stripe PaymentElement** mounts inline (no redirect in Elements mode).
5. Payment confirms in-modal; legacy **hosted Checkout** redirect remains as fallback.

### API

**Checkout:** `POST /api/donations/checkout`

| Mode | Behavior | Response |
|------|----------|----------|
| `elements` | PaymentIntent path for inline PaymentElement | `client_secret` |
| `checkout` | Hosted Checkout (legacy) | `checkout_url` |

### Stripe webhook (dashboard configuration)

| Field | Value |
|-------|-------|
| Destination ID | `we_1ThIx5RGnRsvqnfiDsw6zLfE` |
| Name | Companions Website Donations Webhook |
| Endpoint URL | `https://companionsofcaddo.org/api/webhooks/stripe` |
| API version | `2026-04-22.dahlia` |
| Events | `payment_intent.succeeded`, `payment_intent.payment_failed`, `checkout.session.completed`, `charge.refunded` |

Worker handler: `POST /api/webhooks/stripe` — must verify signature with `STRIPE_WEBHOOK_SECRET` and persist to D1.

### D1 donations domain

| Table | Purpose |
|-------|---------|
| `donation_intents` | Checkout / intent creation |
| `donations` | Completed gifts |
| `donation_payments` | Payment ledger |
| `donors` | Donor records |
| `stripe_webhooks` | Webhook event receipts |
| `donation_settings` | Configuration |
| `fundraising_campaigns` | Campaign definitions |

**Campaign IDs (active, public):**

| ID | Slug | Title |
|----|------|-------|
| `campaign_companions_second_chances_2026` | companions-second-chance-fund | Companions of CPAS Second Chance Fund |
| `camp_medical` | emergency-medical-fund | Emergency Medical Fund |
| `camp_food` | feed-the-shelter | Feed the Shelter |
| `camp_transport` | transport-support | Transport Support |

### Deploy receipt (donation milestone)

| Field | Value |
|-------|-------|
| Git commit | `b591b34` |
| Worker version | `446c6431-8841-4fa6-93bd-c5f2c1f93a9c` |
| D1 project context row | `ctx_cpas_donation_modal_session` (priority 80, `ws_companionscpas`) |

### Donations — D1 telemetry gap (audit)

As of 2026-06-12 D1 query:

| Table | Rows | Note |
|-------|------|------|
| `donation_intents` | 2 | 1× Stripe test checkout (`checkout_created`); 1× demo |
| `donations` | **0** | No completed donation rows yet |
| `stripe_webhooks` | **0** | No persisted webhook events despite Stripe dashboard subscription |

**Action:** Run a live/test Elements payment end-to-end; confirm webhook delivery in Stripe dashboard and row inserts in `stripe_webhooks` → `donations`. If webhooks fail, check signing secret, route on custom domain, and handler logs (enable observability first).

## Agent Sam context layers (two databases)

CompanionsCPAS project truth is split across **client D1** and **IAM platform D1**.

### companionscpas D1 — local Agent Sam

| Store | Rows | Role |
|-------|------|------|
| `agentsam_project_context` | **2 active** (624 consolidated: `ctx_companionscpas_cms_publish_v1` + `ctx_cpas_donation_modal_session`; 5 legacy archived) | Layer 0 `## Active Projects` on CPAS worker |
| `agentsam_memory` | 21 | Worker-local facts (`donation_pipeline`, `cms_structure`, …) |

Notable project context rows: `ctx_companionscpas_cms_publish_v1`, `ctx_cpas_donation_modal_session`, `ctx_cpas_master_v1` (multiple at priority 100 — only top 3 inject).

### inneranimalmedia-business D1 — IAM platform

| Store | CompanionsCPAS state |
|-------|----------------------|
| `agentsam_project_context` | **`ctx_companionscpas`** — **active** on `ws_inneranimalmedia` (priority 90, migration 623/625). Legacy `ctx_f72a887a8da9b004` archived. |
| `agentsam_memory` | `companionscpas_*` pack + `companionscpas_stripe_elements_donation_live_2026_06` (pinned state) |

IAM in-app Agent Sam (`ws_inneranimalmedia`) injects `ctx_companionscpas` into `## Active Projects` (top 3 by priority alongside `ctx_inneranimalmedia`).

**RAG lane:** `client_project_semantic_search` reads **IAM memory + documents vectors**, not CPAS D1 `agentsam_project_context`. Ingest this brief into `AGENTSAM_VECTORIZE_DOCUMENTS` and add `companionscpas_stripe_elements_donation_live_2026_06` to IAM memory for retrieval.

## Known gaps and open work

| Priority | Item |
|----------|------|
| P0 | **Donation D1 pipeline unproven** — webhook subscribed in Stripe but `stripe_webhooks` and `donations` empty; smoke-test Elements + hosted paths |
| P1 | ~~Consolidate CPAS `agentsam_project_context`~~ — **done** (624: 2 active + 5 archived) |
| P1 | ~~IAM project context~~ — **done** (`ctx_companionscpas` active on `ws_inneranimalmedia`, 623/625) |
| P1 | **Enable worker observability** — logs/traces disabled |
| P2 | **`cms_publish_artifacts`** — empty despite 25 done publish jobs |
| P2 | **Meta OAuth** — confirm `META_APP_ID` / `META_APP_SECRET` have real values (not empty plaintext) |
| P2 | **Asset hostname** — finish migration to `assets.companionsofcaddo.org` |
| P2 | **Git hygiene** — commit `public/index.html` and `public/static/` including modal assets |
| P3 | **`ws_companionscpas` workspace status** — reconcile archived flag in IAM workspace registry |

## Recommended next milestones

1. End-to-end donation smoke test on `companionsofcaddo.org` with webhook receipt in D1.
2. Single canonical `agentsam_project_context` row on CPAS D1; mirror summary to IAM for platform Agent Sam.
3. Ingest this brief + refresh `companionscpas_*` memory pack; vector-sync to `AGENTSAM_VECTORIZE_MEMORY` / `AGENTSAM_VECTORIZE_DOCUMENTS`.
4. Enable Cloudflare observability on `companionscpas` worker.
5. Client UAT on CMS publish, foster flow, and board dashboard access.

## How Agent Sam should use this document

| Question type | Lane |
|---------------|------|
| Client writeup, scope, gaps, milestones | `client_project_semantic_search` |
| Runbooks, this brief | `docs_knowledge_search` |
| Handler/route implementation | `code_semantic_search` |
| Table/schema | `schema_semantic_search` |

**Example prompt:**

> Write an extensive client project writeup for CompanionsCPAS — mission, architecture, CMS publish flow, Stripe Elements donations, webhook configuration, binding map, deploy policy, integration status, known gaps, and next milestones.
