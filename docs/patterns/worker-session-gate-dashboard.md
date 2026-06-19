---
title: Pattern — Worker session gate for dashboard
doc_type: platform_pattern
topic: dashboard_auth
lane_key: docs_knowledge_search
pattern_key: worker_session_gate_dashboard
stack: cloudflare-workers
tags:
  - auth
  - sessions
  - dashboard
updated: 2026-06-19
---

# Pattern — Worker session gate for dashboard

Authenticate at the **Cloudflare Worker** before serving dashboard HTML or protected API routes — not SPA-only auth.

## Flow

```
GET /dashboard/*
  → Worker reads session cookie
  → validate JWT / D1 sessions row
  → miss: redirect /admin/login or /api/auth/login
  → hit: serve R2 dashboard shell + allow /api/dashboard/* /api/cms/*
```

## Canonical tables

| Table | Role |
|---|---|
| `users` | Dashboard user profiles |
| `user_credentials` | Password hashes |
| `sessions` | Active sessions |
| `tenant_memberships` | User ↔ org |

Legacy `admin_users` may still power password login during migration — plan deprecation.

## API routes

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | Password |
| `POST` | `/api/auth/logout` | End session |
| `GET` | `/api/auth/google/login` | OAuth start |

Worker secret: `JWT_SECRET`. Never commit secrets to repo or D1 plaintext.

## SPA note

Client Workers may use **raw JSX + Babel CDN** (no build). IAM main dashboard uses Vite — same gate principle applies at Worker layer.

## Vectorization notes

**Synonyms:** dashboard login, session cookie, auth gate, staff portal security, Google OAuth login, protected admin routes.
