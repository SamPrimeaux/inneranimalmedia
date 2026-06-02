# Tenant credential lanes (2026-06)

Catalog `handler_config.auth_source` describes **who pays for the credential**, not “use IAM’s shared production bucket for everyone.”

## Principles

| Lane | Who | Examples |
|------|-----|----------|
| `workspace` + `provider: cloudflare` | Calling user’s Cloudflare account (`user_api_keys` / connected token) | R2 list/read/write/delete on **their** buckets; KV in **their** namespaces; D1 on **their** account when configured |
| `workspace` + `provider: supabase` | Calling user’s Supabase project (`SUPABASE_*` in `user_api_keys` / `user_secrets`) | pgvector search, AutoRAG lanes, customer Postgres — **never** another tenant’s Hyperdrive |
| `user_oauth_tokens` | Per-user OAuth (GitHub, Google Drive, …) | `agentsam_github_repo_list`, `agentsam_github_read`, … |
| `platform_scoped` | IAM platform secret, scoped to **tenant + auth_user** in executor | `agentsam_send_email` (Resend outbox; recipient resolves from **auth_user**, including multiple verified addresses per tenant e.g. `info@inneranimals.com`, `sam@inneranimalmedia.com`) |
| `platform` | Operator / internal agent only (`isOperatorCall` / `isInternalAgent`) | IAM `agentsam.*` schema introspection, owner-only platform bindings — **not** OAuth MCP defaults for customers |

**Do not** set customer OAuth tools to `auth_source: platform` with shared `binding: HYPERDRIVE` or `binding: ASSETS` unless the tool is explicitly operator-only.

## R2 (`agentsam_r2_get` / put / delete)

- **Not** “one R2 for the whole product.”
- Sam’s MCP session uses **Sam’s** `CLOUDFLARE_API_TOKEN` → **Sam’s** buckets.
- Connor’s session uses **Connor’s** token when connected → **Connor’s** buckets.
- `handler_config`: `operation` `r2.read` | `r2.write` | `r2.delete`, `auth_source: workspace`, `provider: cloudflare`.

## Vectorize (Cloudflare)

Legacy bindings removed from Workers/MCP wrangler:

- `VECTORIZE` → `ai-search-inneranimalmedia-autorag` (retired)
- `AGENTSAMVECTORIZE` → `inneranimalmedia-vectors` (retired)

Active four-lane 1536 indices (wrangler `[[vectorize]]`):

| Binding | Index |
|---------|--------|
| `AGENTSAM_VECTORIZE_CODE` | `agentsam-codebase-oai3large-1536` |
| `AGENTSAM_VECTORIZE_COURSES` | `agentsam-courses-oai3large-1536` |
| `AGENTSAM_VECTORIZE_MEMORY` | `agentsam-memory-oai3large-1536` |
| `AGENTSAM_VECTORIZE_SCHEMA` | `agentsam-schema-oai3large-1536` |

Per-tenant: default lane labels for `tenant_sam_primeaux` / `au_*` users may reference these bindings in workspace settings; other tenants set their own when they connect **their** Cloudflare account — no hardcoded shared index assumptions in catalog JSON.

## Supabase / Hyperdrive

- Customer MCP agents must **not** hit the platform `HYPERDRIVE` binding for Connor when Sam owns the Supabase project (no RLS crossover).
- Catalog customer tools: `auth_source: workspace`, `provider: supabase`, `data_plane: user`.
- In-app “public schema” defaults are an **application** concern, not a license to read another tenant’s DB via OAuth.

## Email

- `agentsam_send_email`: `auth_source: platform_scoped`, `provider: resend`, `recipient_scope: auth_user`.
- Delivers to the **authenticated user’s** configured/verified addresses for that tenant (supports multiple emails per tenant).

## Migration

`migrations/508_smoke_tool_handler_catalog_fix.sql` aligns smoke OAuth tools to this model.
