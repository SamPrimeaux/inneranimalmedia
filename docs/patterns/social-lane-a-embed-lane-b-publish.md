---
title: Pattern — Social Lane A embed / Lane B publish
doc_type: platform_pattern
topic: social_integrations
lane_key: docs_knowledge_search
pattern_key: social_lane_a_b
vertical: nonprofit
tags:
  - social
  - facebook
  - meta
  - oauth
updated: 2026-06-19
---

# Pattern — Social Lane A embed / Lane B publish

Two-lane model for social integrations on client Workers. **Lane A** is safe for handoff; **Lane B** requires client approval and Meta app review.

## Lane A — Live (embed + status)

| Capability | Typical API |
|---|---|
| Connection status | `GET /api/social/status` |
| Facebook page embed | `GET/POST /api/social/embed/facebook-page` |
| Draft storage | `social_post_drafts` or `social_post_drafts_v2` |

Public community page reads `social_embed_settings` from D1.

## Lane B — Future (publish)

| Endpoint | Required behavior |
|---|---|
| `GET /api/social/oauth/meta/start` | Start OAuth when `META_APP_ID` configured |
| `GET /api/social/oauth/meta/callback` | Stub until CSRF persistence + token encryption |
| `POST /api/social/facebook/page-posts` | Return **501** until page token + Graph API ready |

## Hard rules

- **Real publish must never silently succeed** — no fake 200 responses.
- Require explicit **client approval** before enabling Lane B in production.
- Meta Developer App + app review + Facebook Login for Business page permissions.
- Encrypt page tokens at rest; never return tokens to browser.

## Data model

| Table | Role |
|---|---|
| `social_provider_connections` | OAuth tokens (Drive, Gmail, future Meta) |
| `social_embed_settings` | Page plugin config |
| `integration_oauth_states` | CSRF for OAuth flows |

## Vectorization notes

**Synonyms:** Facebook publish, Meta OAuth, social posting, page embed, Lane B, Instagram, 501 stub, social media dashboard.
