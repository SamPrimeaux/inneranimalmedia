---
title: CompanionsCPAS — features overlay
summary: Route → pattern map for Companions of CPAS. Deep file paths live in client repo docs/features/.
doc_type: client_features_overlay
project_key: companionscpas
tenant_id: tenant_companionscpas
workspace_id: ws_companionscpas
lane_key: client_project_semantic_search
updated_at: 2026-06-19
tags:
  - companionscpas
  - feature-map
---

# CompanionsCPAS features overlay

Pointers to **IAM platform patterns** + **client repo** detail. Repo: `github.com/SamPrimeaux/companionscpas` at `/Users/samprimeaux/companionscpas`.

## Live dashboard surfaces (Jun 2026)

| Route | Status | IAM pattern | Client repo doc |
|---|---|---|---|
| `/dashboard/cms/pages/:id` | Live | [cms-fragment-publish-pipeline](../../patterns/cms-fragment-publish-pipeline.md) | `docs/features/cms-live-editor.md` |
| `/dashboard/cms/*` hub | Live | same + brand/assets | `docs/features/cms-website-admin.md` |
| `/dashboard/email` | Live | [email-resend-gmail-workspace](../../patterns/email-resend-gmail-workspace.md) | `docs/features/email-workspace.md` |
| `/dashboard/animals` | Live | — | `docs/features/animal-care.md` |
| `/dashboard/fosters` | Live | — | `docs/features/foster-applications.md` |
| `/dashboard/applications` | Live | — | `docs/features/foster-applications.md` |
| `/dashboard/volunteers` | Live | — | `docs/features/volunteers.md` |
| `/dashboard/donations` | Live (Stripe test) | — | `docs/features/donations-fundraising.md` |
| `/dashboard/reports` | Partial (mock tabs) | [agentsam-client-ai-policy](../../patterns/agentsam-client-ai-policy.md) | `docs/features/reports.md` |
| Agent Sam drawer | Mixed | [agentsam-phase2-tool-picker-playbook](../../patterns/agentsam-phase2-tool-picker-playbook.md) | `docs/features/agent-sam.md` |
| Social | Lane A live | [social-lane-a-embed-lane-b-publish](../../patterns/social-lane-a-embed-lane-b-publish.md) | `docs/features/social-integrations.md` |
| Auth | Live | [worker-session-gate-dashboard](../../patterns/worker-session-gate-dashboard.md) | `docs/features/auth-sessions.md` |

## Canonical D1 (quick reference)

| Use | Not |
|---|---|
| `animal_profiles` | `animals` (dropped) |
| `cpas_foster_applications` | `applications` (dropped) |
| `fundraising_campaigns` | `fundraising_campaigns_demo` |
| `agentsam_tools` | `agentsam_mcp_*` (dropped) |

Full hygiene: client `docs/HANDOFF.md` + pattern [client-d1-legacy-table-hygiene](../../patterns/client-d1-legacy-table-hygiene.md).

## Vectorization notes

**Synonyms:** CPAS dashboard features, companions routes, foster dashboard, CMS companions, what is live on companionscpas.
