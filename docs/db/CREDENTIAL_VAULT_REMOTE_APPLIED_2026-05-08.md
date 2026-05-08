# Credential Vault Remote Changes Applied 2026-05-08

Applied directly to remote D1 `inneranimalmedia-business`.

## Schema changes
- Added vault metadata columns to:
  - user_api_keys
  - user_oauth_tokens
  - user_secrets
  - env_secrets
  - oauth_providers
  - integration_connections
  - agentsam_user_policy
- Rebuilt secret_audit_log with expanded secret_source and event_type checks.

## Data cleanup
- Set user_oauth_tokens.access_token = NULL
- Set user_oauth_tokens.refresh_token = NULL
- Verified plaintext OAuth token count = 0

## Still pending
- Backfill encrypted OAuth tokens into Supabase Vault or D1 vault reference path.
- M10 Supabase webhook_secrets → Supabase Vault.
- Backend resolver support for vault_secret_id references.
