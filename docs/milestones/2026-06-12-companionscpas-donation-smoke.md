---
title: CompanionsCPAS donation smoke passed — 2026-06-12
topic: companionscpas
lane_key: client_project_semantic_search
doc_type: team_milestone
milestone_date: 2026-06-12
client_project_key: companionscpas
tags:
  - companionscpas
  - donations
  - stripe
  - smoke-passed
  - team-milestone
---

# CompanionsCPAS donation smoke — 2026-06-12

## Summary

End-to-end Stripe Elements donation pipeline **verified** on `companionsofcaddo.org` after `STRIPE_WEBHOOK_SECRET` rotation and Worker deploy `070fcadb`.

## Receipt

| Field | Value |
|-------|-------|
| PaymentIntent | `pi_3ThUsRRGnRsvqnfi1kMVqPb5` |
| Amount | $30.00 (3000 cents) |
| Webhooks | `payment_intent.succeeded`, `checkout.session.completed` — both `processed` in CPAS D1 |
| IAM memory | `companionscpas_stripe_elements_donation_live_2026_06` updated (migration 626) |

## Follow-up

- **Idempotency:** dual webhook events created duplicate `donations` rows — fix PI guard on `checkout.session.completed` in `payments_email.js`
- **Client brief:** `docs/clients/companionscpas/project-brief.md` (ingest via `run:ingest_client_project_doc`)
- **Board:** Stripe nonprofit verification + live mode checklist when ready

## Retrieval

Use `client_project_semantic_search` for client-facing writeups; this milestone is team ops receipt in `docs/milestones/`.
