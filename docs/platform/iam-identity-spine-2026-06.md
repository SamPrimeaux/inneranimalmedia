# IAM identity spine (2026-06)

Single end-to-end path for signup, signin, dashboard, and MCP OAuth.

## Layer cake

```
person_uuid                    ← one human (platform_operators.person_uuid for operators)
    │
    ├── auth_users (au_*)      ← runtime login truth: sessions, OAuth code exchange
    │       ├── auth_user_emails[]  ← all routable emails (primary, iam_alias, recovery)
    │       └── account_identities (provider, provider_subject)
    │
    ├── operator_cloudflare_accounts[]  ← dual CF for operator person_uuid
    │
    ├── accounts (au_*)        ← DEPRECATED mirror — read auth_users instead
    │
    ├── tenant_id              ← org boundary (billing, isolation)
    │       └── workspaces (ws_*)
    │               └── memberships / workspace_members
    │
    └── mcp_workspace_tokens   ← external connectors (ChatGPT, Claude, Cursor)
            user_id, tenant_id, workspace_id, allowed_tools
```

## Operator vs customer

| Class | Detection | Workspace | Tools | R2 |
|-------|-----------|-----------|-------|-----|
| **Platform operator** | `platform_operators.person_uuid` OR transitional `auth_users.role=superadmin` + operator tenant | `platform_operators.default_workspace_id` | `allowed_tools = null` (full catalog) | No `scopeR2Key` jail |
| **Customer** | Everyone else | Canonical workspace from membership | Policy + allowlist intersection | Workspace prefix scoped |

**SSOT table:** `platform_operators` (migration 608). Do not add per-email rows to `superadmin_identity` or `admin` for new operator surfaces.

**Deprecated for hot paths:** `superadmin_identity`, `admin` (data may remain; code uses `isPlatformOperator` / `isPlatformOwner` only).

## Resolver (609+)

All login paths use `resolveAuthUserByEmail()` in `src/core/resolve-auth-user.js`:

1. `auth_user_emails` where `is_login_enabled = 1`
2. Fallback: `auth_users.email`

IAM-owned emails (`iam_owned = 1`) are never customer downgrade targets. Service agent `ai@` uses `isIamServiceIdentityLane()` for full MCP catalog.

## Signup / signin flow

1. Provider OAuth or email/password → `resolveAuthUserByEmail` or `account_identities (provider, provider_subject)`.
2. `ensureIdentityPlaneBeforeSession` → dual-write `accounts` + `memberships` if missing.
3. Session mint → `auth_sessions` with `user_id = au_*`.
4. MCP OAuth (separate) → authorization code → `issueMcpOAuthTokens` reads `auth_users`, applies operator lane, writes `mcp_workspace_tokens`.

## Identity recovery (customer care)

When auth fails, responses include structured `recovery` payloads (not generic errors only).

| Channel | Endpoint | Storage |
|---------|----------|---------|
| Email 6-digit code | `POST /api/auth/recovery/request` → `POST /api/auth/recovery/verify` | `identity_recovery_attempts` + Resend |
| Backup codes | `POST /api/auth/backup-code` | `user_backup_codes` (hashed) |
| Password reset | `POST /api/auth/password-reset/request` | KV + Resend |
| MCP reconnect | OAuth authorize URL | New `mcp_workspace_tokens` row |
| Inbound email | `POST /api/integrations/resend/webhook` | Agent hooks + `auth_event_log` |

Audit: `auth_event_log` + `identity_recovery_attempts` for support follow-up.

## External MCP (ChatGPT / Claude / Cursor)

These apps **do not** read `accounts` or `auth_users` directly. They hold a bearer token minted by IAM with stamped `user_id`, `tenant_id`, `workspace_id`. Operator tokens are class-based; customer tokens are workspace-scoped.

## Adding a new operator email

1. Sign in with new email → link to same `person_uuid` in `auth_users` / `users`.
2. No new `platform_operators` row needed if `person_uuid` matches.
3. No OAuth allowlist rows needed for operator class.

## Adding a new customer

1. Signup → new `tenant_*` + `ws_*` via `provisionIdentitySignup`.
2. `memberships` owner row.
3. MCP OAuth uses customer path (allowlist + policy).
