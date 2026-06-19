---
title: CompanionsCPAS Client Project Brief
summary: IAM compass for Companions of CPAS — bindings, handoff status Jun 2026, pattern pointers. File-level truth in client repo.
description: Ground-truth client dossier for client_project_semantic_search. Platform patterns in docs/patterns/.
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
local_repo_path: /Users/samprimeaux/companionscpas
d1_database_id: fd6dd6fb-156b-4b6a-8ff0-505422652391
d1_database_name: companionscpas
r2_bucket: companionscpas
kv_namespace: companionscpas-cache
cdn_assets: https://assets.companionsofcaddo.org
embedding_model: text-embedding-3-large
embedding_dimensions: 1536
lane_key: client_project_semantic_search
rag_lane: documents
primary_binding: AGENTSAM_VECTORIZE_DOCUMENTS
tags:
  - companionscpas
  - companions-of-cpas
  - client-project
  - nonprofit
  - cloudflare-workers
chunk_strategy: markdown_headings
updated_at: 2026-06-19
---

# CompanionsCPAS Client Project Brief

## Client and mission

**Companions of CPAS** — nonprofit dog rescue serving Caddo Parish, Louisiana. Production domain: [companionsofcaddo.org](https://companionsofcaddo.org).

| Surface | Value |
|---|---|
| Worker | `companionscpas` |
| GitHub | [SamPrimeaux/companionscpas](https://github.com/SamPrimeaux/companionscpas) |
| Local path | `/Users/samprimeaux/companionscpas` |
| Deploy | `npm run deploy:full` (R2 sync + wrangler) on `main` |
| Identity | `tenant_companionscpas` / `ws_companionscpas` |

**IAM rule:** Client code and D1 changes happen in the **companionscpas repo only** — never patch from `inneranimalmedia` Worker.

## Bindings

| Binding | Resource | Role |
|---|---|---|
| `DB` | D1 `companionscpas` (`fd6dd6fb-…`) | CMS, animals, fosters, donations, users, Agent Sam local tables |
| `WEBSITE_ASSETS` | R2 `companionscpas` | Dashboard JSX, static pages, media |
| `CMS_CACHE` | KV `companionscpas-cache` | `page:{route}` cache |
| `AGENTSAM_WAI` | Workers AI | Agent Sam inference |

Public assets CDN: **`https://assets.companionsofcaddo.org`**.

## Handoff status (2026-06-19)

| Area | Status |
|---|---|
| Public site (6 CMS routes) | **Live** — D1 → R2 fragments → KV |
| Animals + foster placement | **Live** — POST/PATCH fosters, profile panel |
| Applications | **Live** — `cpas_foster_applications` |
| Volunteers | **Live** — GET/POST API + Add Volunteer |
| CMS page list status | **Live** — from D1 |
| Donations / Stripe | **Live** — test mode (smoke passed 2026-06-12) |
| Email inbox | **Live** — Resend + per-user Gmail |
| Overview / Daily Care / Reports (most tabs) | **Mixed or mock** — see milestone doc |
| Lane B social publish | **Future** — 501 stubs until client approval |
| Agent Sam Phase 2 UI | **Backlog** — chat baseline live |

Milestone receipt: `docs/milestones/2026-06-19-companionscpas-handoff.md`.

## Platform patterns (IAM — reusable)

| Topic | Pattern doc |
|---|---|
| CMS publish pipeline | `docs/patterns/cms-fragment-publish-pipeline.md` |
| Email workspace | `docs/patterns/email-resend-gmail-workspace.md` |
| Social Lane A / B | `docs/patterns/social-lane-a-embed-lane-b-publish.md` |
| Dashboard auth gate | `docs/patterns/worker-session-gate-dashboard.md` |
| Agent Sam AI policy | `docs/patterns/agentsam-client-ai-policy.md` |
| Agent Sam Phase 2 | `docs/patterns/agentsam-phase2-tool-picker-playbook.md` |
| D1 legacy hygiene | `docs/patterns/client-d1-legacy-table-hygiene.md` |
| Feature doc template | `docs/patterns/feature-doc-template.md` |

## Client repo docs (CPAS — runtime detail)

| Doc | Purpose |
|---|---|
| `docs/current-file-map.md` | Live route → file → API → table |
| `docs/features/README.md` | Per-feature vectorization catalog |
| `docs/HANDOFF.md` | Canonical vs dropped D1 tables |
| `docs/AGENTSAM_CPAS_ROADMAP.md` | CPAS-specific Agent Sam Phase 2 |
| `ARCHITECTURE.md` | Bindings, deploy commands |

Feature overlay (this IAM repo): `docs/clients/companionscpas/features-overlay.md`.

## Publish contract (non-negotiable)

D1 (SSOT) → R2 fragments → KV bust → verify on `companionsofcaddo.org`. No ad-hoc production HTML edits. Policy memory key: `companionscpas_non_negotiable_change_sync_contract`.

## Canonical D1 tables (summary)

| Domain | Table |
|---|---|
| Animals | `animal_profiles` |
| Applications | `cpas_foster_applications` |
| Fosters | `foster_records` |
| Volunteers | `volunteer_records` |
| Fundraising | `fundraising_campaigns` |
| CMS | `cms_pages`, `cms_page_sections`, `cms_page_content_blocks`, `cms_brand_settings` |
| Donations | `donations`, `donors`, `donation_payments`, `donation_intents` |

**Dropped from live D1 (2026-06-23):** `applications`, `agentsam_mcp_tools`, `agentsam_mcp_workflows`, `cms_editor_sessions`, `cms_editor_events`.

## Donations (Stripe)

Stripe Elements in-modal on `/donate`; webhook `POST /api/webhooks/stripe`. **Test mode** until client live keys. Smoke passed 2026-06-12 — see `docs/milestones/2026-06-12-companionscpas-donation-smoke.md`. Follow-up: PaymentIntent idempotency on dual webhook events.

## Agent Sam context layers

| Store | Where | Role |
|---|---|---|
| `ctx_companionscpas` | IAM D1 `agentsam_project_context` | Platform Agent Sam client compass |
| `agentsam_project_context` | CPAS D1 | Worker-local Layer 0 |
| This brief + patterns | IAM Vectorize documents | `client_project_semantic_search` |

**RAG:** `client_project_semantic_search` reads IAM documents + memory — **not** CPAS D1 for platform Agent Sam retrieval.

## Ingest (IAM)

```bash
npm run run:ingest_client_companionscpas
# dry-run: npm run run:ingest_client_companionscpas:dry-run
```

Manifest: `docs/clients/companionscpas/ingest.manifest.json`.

## How Agent Sam should use this document

| Question | Lane |
|---|---|
| Client scope, bindings, handoff status | `client_project_semantic_search` |
| Reusable CMS/email/social/AI pattern | `docs_knowledge_search` → `docs/patterns/*` |
| Handler implementation | `code_semantic_search` (companionscpas repo, scoped paths) |
| IAM platform runtime | `docs_knowledge_search` → `iam-platform-snapshot` |

## Open work (priority)

| P | Item |
|---|---|
| P1 | Reports / Overview wire-up or explicit demo labels |
| P1 | Agent Sam refresh — real AI usage in Reports |
| P2 | Lane B Meta — client approval + real OAuth |
| P2 | Live Stripe keys after client sign-off |
| P2 | Cloudflare observability enable on companionscpas worker |
| P3 | Account transfer to client Cloudflare when approved |
