# Stream BYOK — account-scoped (2026-07)

**Law:** Cloudflare account controls ownership and visibility. IAM workspace records context/provenance only.

## Tickets (this release boundary)

| ID | Status | Notes |
|----|--------|-------|
| STREAM-BYOK-001 | done | `stream.read` + `stream.write` in `CLOUDFLARE_OAUTH_SCOPES` |
| STREAM-BYOK-002 | done | `src/core/cf-oauth-stream.js` → `resolveCfStreamContext` |
| STREAM-DATA-001 | done | migration `1029` columns + unique `(cloudflare_account_id, stream_uid)` |
| STREAM-API-001 | done | helpers take resolved streamCtx |
| STREAM-SEC-001 | done | `assertStreamUidInAccount` before UID ops |
| STREAM-UI-001 | done | `/api/stream/capabilities` + Videos sidebar states |
| STREAM-UPLOAD-001 | done | direct-upload registers provisional media_assets |
| STREAM-IMPORT-001 | done | from-url uses customer account context |
| STREAM-VEO-001 | done | destination=stream → customer account |
| STREAM-SIGNED-001 | done | `POST /api/stream/videos/:uid/playback-token` |
| STREAM-QA-001 | pending | account-isolation E2E matrix |

## Reconnect

Customers with an existing Cloudflare connection must reconnect once so the token gains Stream scopes.

## Platform fallback

Only when `allowPlatformFallback` is true (platform operator). Customer OAuth failure never uses IAM Stream account.
