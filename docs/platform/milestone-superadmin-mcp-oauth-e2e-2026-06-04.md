# Milestone: Superadmin MCP OAuth — end-to-end operator platform (2026-06-04)

**Status:** Production-validated via ChatGPT MCP OAuth (`inneranimalmedia-mcp-server`) and D1 operator identity (`info@inneranimals.com` / `au_871d920d1233cbd1`).

## Summary

Platform owner (superadmin) can use **one OAuth MCP connection** across **all customer workspaces** without per-`ws_*` BYOK tunnels or `workspace_members` rows. Account-wide **Cloudflare API** credentials and **dual terminal lanes** (Mac localpty + GCP VM) are wired for operator work.

## What was validated (ChatGPT MCP smoke test)

| Check | Result |
|-------|--------|
| Workspace membership gate | Pass — no “not an active member” block |
| Platform D1 (`agentsam_d1_query`) | Pass |
| R2 (`agentsam_r2_list` on `companionscpas`) | Pass |
| GitHub (`agentsam_github_read`) | Pass |
| Terminal Mac (`localpty.inneranimalmedia.com`) | Pass — `hostname`, `/Users/samprimeaux/inneranimalmedia` |
| Terminal VM (`conn_mac_shell2` → `terminal.inneranimalmedia.com`) | Pass — `iam-tunnel`, Linux, `/workspace` |

## Operator terminal lanes (D1 `terminal_connections`)

| id | Host | `target_type` | Priority |
|----|------|---------------|----------|
| `conn_mac_local` | `wss://localpty.inneranimalmedia.com` | `user_hosted_tunnel` | 10 (default) |
| `conn_mac_shell2` | `wss://terminal.inneranimalmedia.com` | `platform_vm` | 50 |

**MCP tools:** `agentsam_terminal_local` / `agentsam_terminal_remote` resolve `user_hosted_tunnel` + `platform_vm`. Superadmin on any `workspace_id` falls back to operator workspace `ws_inneranimalmedia` connections (not BYOK per customer).

**VM lane:** pass `target_id: "conn_mac_shell2"` to force GCP VM; omit `target_id` for localpty default.

## Superadmin identity & credentials

- **Gate:** `auth_users.is_superadmin = 1` and/or `role = 'superadmin'` (column added 2026-06-04).
- **Primary emails pinned:** `info@inneranimals.com`, `meauxbility@gmail.com`, `ceosamprimeaux@gmail.com`, `inneranimalclothing@gmail.com` (migration `556`).
- **Cloudflare:** `resolveWorkspaceCloudflareCredentials` → platform `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` on main worker and MCP worker (migration `9db26a90` main, MCP `79162b5` / terminal `a270f30`).
- **Workspace membership:** `assertWorkspaceMember` bypass for superadmin (MCP `79162b5`).

## Deployed worker versions (reference)

| Surface | Git (approx) | Worker version |
|---------|--------------|----------------|
| MCP | `inneranimalmedia-mcp-server` `a270f30` | `74f3fc3a` (terminal lanes) |
| Main | `inneranimalmedia` `9db26a90` | `df250d31` (CF superadmin bypass) |

## What remains customer-scoped (by design)

- **Connor / team:** BYOK Cloudflare, per-workspace `terminal_connections`, spend caps.
- **PTY tunnel provisioning:** `user_hosted_tunnel` self-service — not platform `CLOUDFLARE_*`.
- **In-app ChatGPT-style approval cards:** separate UX track (`ToolApprovalModal` / inline approval).

## Memory keys & RAG

| Lane | Key / ref |
|------|-----------|
| D1 `agentsam_memory` | `platform_milestone_superadmin_mcp_oauth_e2e_2026_06_04` |
| Supabase + Vectorize | `agentsam_memory_oai3large_1536` / `agentsam-memory-oai3large-1536` |
| Deep archive (3072) | `milestone-superadmin-mcp-oauth-e2e-2026-06-04` (H2 chunks from this doc) |

## Related migrations

- `556_platform_owner_primary_emails_superadmin.sql`
- `557_mcp_terminal_superadmin_operator_lanes.sql` (tool descriptions)
