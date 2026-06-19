---
title: Pattern — Email workspace (Resend + Gmail)
doc_type: platform_pattern
topic: email_workspace
lane_key: docs_knowledge_search
pattern_key: email_resend_gmail_workspace
vertical: nonprofit
tags:
  - email
  - resend
  - gmail
  - inbox
updated: 2026-06-19
---

# Pattern — Email workspace (Resend + Gmail)

Dashboard mail hub combining **transactional inbound (Resend webhook)** with **optional per-user Gmail** sync/send.

## Architecture

| Channel | Ingress | Storage |
|---|---|---|
| Resend inbound | `POST /api/email/inbound` webhook | `inbound_emails` |
| Gmail | OAuth → encrypted tokens in `social_provider_connections` | sync via `/api/email/sync-gmail` |
| Outbound | `POST /api/email/send` | Resend API + `email_logs` |

## Typical API routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/email/inbox` | Inbound list |
| `GET` | `/api/email/drafts` | Drafts |
| `POST` | `/api/email/send` | Outbound |
| `GET` | `/api/email/notifications` | Dashboard notifications |
| `POST` | `/api/email/sync-gmail` | Pull Gmail |

## Security

- Gmail OAuth tokens: AES-GCM in `social_provider_connections`; scope per user (`gmail_scope.js`).
- Resend webhook: verify signature in production.
- Do not expose refresh tokens in API responses.

## Setup checklist

1. Resend domain + inbound route to Worker webhook URL.
2. Google Cloud: Gmail API enabled, OAuth client with redirect on production domain.
3. Worker secrets: `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, encrypt key for tokens.

## UX pattern

Single `/dashboard/email` route; legacy `/dashboard/notifications` redirects to `?view=notifications`. Empty state lists expected message types (donations, contact, applications).

## Vectorization notes

**Synonyms:** email inbox, mail dashboard, Gmail connect, Resend inbound, support email, reply to donor, email workspace.
