---
title: BYOK Sprint Plan — Keys & Secrets
project_key: inneranimalmedia
d1_context_id: ctx_inneranimalmedia
workspace_id: ws_inneranimalmedia
tenant_id: tenant_sam_primeaux
lane_key: docs_knowledge_search
doc_type: byok_sprint_plan
topic: byok_sprint
sprint_status: planned
sprint_target: 2026-06
dashboard_url: https://inneranimalmedia.com/dashboard/settings/keys
ingest_script: scripts/ingest_byok_sprint_plan.mjs
memory_router_key: byok_sprint_router_v1
updated: 2026-06-14
---

# BYOK Sprint Plan — Keys & Secrets

**START HERE when resuming BYOK work.** Dashboard: `/dashboard/settings/keys`. API spine: `/api/settings/keys*` (`src/api/settings-api-keys.js`). Memory router: `agentsam_memory.key=byok_sprint_router_v1`. Semantic search: `docs_knowledge_search` query **"BYOK sprint plan"** or `source_ref platform/inneranimalmedia/byok-sprint-plan#*`. Re-ingest: `npm run run:ingest_byok_sprint_plan`. Sync memory vector: `npm run run:sync_byok_sprint_memory_vector`.

## Sprint goal

Ship production-ready **Bring Your Own Key (BYOK)** for IAM customers: save provider API keys and Cloudflare R2 credentials in Settings → Keys, resolve them at agent/tool runtime without platform-secret leakage, enforce spend-guard BYOK gates, and prove MCP + Hyperdrive pgvector lanes work E2E for a non-superadmin tenant (Connor / companionscpas pattern).

**Out of scope this sprint:** billing checkout for BYOK tiers, multi-key per provider rotation UI polish, full security audit closure (track separately).

## Architecture — two credential lanes

BYOK is **not** one table. The Keys page writes to two parallel stores:

| Lane | Tables | What gets stored |
|------|--------|------------------|
| **Provider / personal API keys** | `user_api_keys` (metadata) → `user_secrets` (encrypted `secret_value_encrypted` via `vault_secret_id`) | OpenAI, Anthropic, Google, Cloudflare API token, Resend, GitHub token, Supabase service role, personal secrets |
| **Cloudflare R2 S3 BYOK** | `user_storage_access_keys` (encrypted `access_key_id_encrypted` + `secret_encrypted`) | R2 access key ID + secret + `cf_account_id`; preview in `r2_access_key_id` |

**Workspace bindings** (which bucket / D1 / CF account the active workspace uses) live on **`agentsam_workspace`** columns: `byok_r2_bucket`, `cloudflare_account_id`, `d1_database_id` (+ `metadata_json` fallback). Legacy `agentsam_workspace_data_bindings` was **dropped** (migration 597).

**R2 user prefs** (non-secret): `user_storage_provider_preferences` row per user, provider `r2`.

**Hard rule:** raw secrets never returned from API after save. `user_api_keys` holds label, `last_four`, `provider`, `category`, `metadata_json` only.

## Security & audit tables

| Table | Role |
|-------|------|
| `secret_audit_log` | Lifecycle events (`key_created`, `key_validated_pass`, `key_rotated`, `key_used_by_agent`, …). Canonical `secret_id` = **`user_secrets.id`**, not `user_api_keys.id`. |
| `security_findings` | Open findings from failed validation, rotation due, exposure patterns |
| `security_shield_rules` | Per-tenant rules; seeded on signup via `buildDefaultShieldRuleStatements` (migration 378) |

Implementation: `src/core/keys-security.js` — call `handleKeySecurityAfterOp` after create/validate/reveal/rotate/delete.

## Dashboard & API surface

| Surface | Path / handler |
|---------|----------------|
| Dashboard UI | `dashboard/components/settings/sections/ApiKeysSection.tsx` (`KeysSection`) |
| Security extras | `KeysSecurityExtras.tsx` — connected accounts, security findings |
| PTY / tunnel hints | `PtyTerminalSetupSection.tsx` — `/api/settings/keys/hints`, `/api/settings/keys/cloudflare/zones` |
| Canonical API | `src/api/settings-api-keys.js` — `handleSettingsKeysApi` |
| Legacy alias | `/api/settings/api-keys` → same handler |
| R2 BYOK status/test | `src/api/storage.js` — `/api/storage/byok/status`, `/api/storage/byok/test` |
| Vault / model picker BYOK status | `src/api/vault.js` — `getTenantLlmByokStatus` (reads `user_secrets` project `iam_user_llm_keys`) |
| Credential resolver (runtime) | `src/core/resolve-credential.js`, `workspace-cloudflare-credentials.js` |
| R2 credential load | `src/core/user-storage-r2-credentials.js` |
| MCP credentials | `src/core/mcp-user-credentials.js` (must stay filter-synced with main resolver) |

**Categories on Keys page:** `provider` | `personal` | `internal`. BYOK scope is always per authenticated user (`scope: user`), not workspace-gated — but workspace context is required to open the page and bind R2/D1.

**Providers:** `openai`, `anthropic`, `google`, `cloudflare`, `cloudflare_r2`, `resend`, `github`, `supabase`, `other`.

## Runtime resolution flow

```
Agent / tool needs provider credential
  → resolve-credential.js OR workspace-cloudflare-credentials.js
  → if superadmin (user.role === 'superadmin'): platform env.* secrets
  → else: user_api_keys row (provider, user_id, active)
       → decrypt user_secrets via vault_secret_id (VAULT_KEY)
       → read metadata_json for account_id / project_ref
  → missing row → CredentialNotConfiguredError (never silent platform fallback)

R2 write path (artifacts, MovieMode save, quality report export)
  → loadUserCloudflareR2Credentials(user_id) from user_storage_access_keys
  → resolveWorkspaceByokR2Bucket(workspace) from agentsam_workspace
  → superadmin may use platform ARTIFACTS binding
```

**Spend guard:** `workspace-spend-guard.js` — when platform allowance exhausted, surface `require_byok` / `tenant_platform_allowance_exhausted`; user must connect keys in Settings → Integrations / Keys.

## Sprint phases & backlog

### Phase 0 — Inventory (done / verify)

- [x] Unified Keys API (`settings-api-keys.js`) with vault split
- [x] R2 BYOK path via `user_storage_access_keys` + workspace bucket binding
- [x] Security audit tables + shield rules (378, keys-security runtime rule)
- [ ] **Verify live D1 columns** match code expectations (`vault_secret_id`, `category`, `label`, `last_four`, R2 `validated_at`)
- [ ] Run `audit_output/security_byok_audit.txt` regeneration — confirm no 404 handler gaps

### Phase 1 — Keys page E2E (customer happy path)

- [ ] Save OpenAI + Anthropic keys → validate → model picker shows `byok_configured: true` (`agent.js` + `vault.js`)
- [ ] Save Cloudflare API token + account ID → list D1 databases (`/api/settings/keys/cloudflare/d1`)
- [ ] Save R2 credentials + bucket → `agentsam_workspace.byok_r2_bucket` set → `/api/storage/byok/test` passes
- [ ] Save Supabase service role + project ref in `metadata_json` → Hyperdrive tool can query customer schema
- [ ] Operator sync: `npm run sync:operator-keys` (`.env.cloudflare` → Keys) still works post-refactor

### Phase 2 — Agent + MCP runtime proof

- [ ] Non-superadmin session: agent chat uses BYOK OpenAI/Anthropic (billing_key_source: `byok` in dispatch metadata)
- [ ] MCP worker (`mcp.inneranimalmedia.com`): same `user_api_keys` + `user_secrets` resolution via `mcp-user-credentials.js`
- [ ] **MCP customer pgvector BYOK E2E** — documented blocker in platform snapshot; prove Supabase Hyperdrive lane with customer `supabase` key (not platform HYPERDRIVE only)
- [ ] `syncProviderModels` after key save populates `agentsam_ai` overlay (best-effort; failures logged only)

### Phase 3 — Tenant isolation & Connor lane

- [ ] Connor workspace (`ws_connor_mcneely`): BYOK-only, no platform CF bindings (migration 601 pattern)
- [ ] `customer-data-plane-router` tests: superadmin on BYOK-only workspace denied platform plane
- [ ] Artifact R2 store: tenant put uses BYOK bucket, not platform ARTIFACTS
- [ ] MovieMode / browser capture save to `byok_r2` destination works with saved R2 keys

### Phase 4 — Security hardening & ops

- [ ] Security findings UI: triage flow on Keys page (`KeysSecurityExtras`) wired to PATCH findings
- [ ] Rotation + revoke flows audited in `secret_audit_log`
- [ ] Rate limit on `/api/settings/keys/validate` (`secret-validators.js`)
- [ ] Document VAULT_KEY / VAULT_MASTER_KEY rotation runbook (no code change unless gap found)

## Definition of done

1. Fresh non-superadmin user can add provider keys + R2 keys on `/dashboard/settings/keys`, validate each, and see masked metadata only.
2. Agent Sam chat completes at least one tool call per lane (CF, Supabase, GitHub) using BYOK credentials — no platform secret bleed.
3. MCP external client can complete the same credential resolution path.
4. Connor (or test tenant) runs entirely on BYOK with platform bindings cleared.
5. `secret_audit_log` rows exist for create + validate + agent use.
6. Sprint doc re-ingested; memory router vector synced.

## Key files (edit map)

| Area | Files |
|------|-------|
| API | `src/api/settings-api-keys.js`, `src/api/vault.js`, `src/api/storage.js` |
| Security | `src/core/keys-security.js`, `src/core/secret-validators.js`, `src/core/security-scan.js` |
| Resolution | `src/core/resolve-credential.js`, `src/core/workspace-cloudflare-credentials.js`, `src/core/mcp-user-credentials.js` |
| R2 BYOK | `src/core/user-storage-r2-credentials.js`, `src/core/storage-byok-test.js`, `src/core/artifact-r2-store.js` |
| Workspace | `src/core/workspace-data-bindings.js`, `src/core/agentsam-workspace.js` |
| Spend | `src/core/workspace-spend-guard.js`, `src/core/tenant-spend-policy.js` |
| UI | `dashboard/components/settings/sections/ApiKeysSection.tsx`, `KeysSecurityExtras.tsx` |
| Migrations | `377_user_api_keys_category.sql`, `340_user_storage_access_keys_encrypted.sql`, `597_agentsam_workspace_byok_columns_drop_legacy_tables.sql`, `600_user_storage_access_keys_validation.sql` |
| Rules | `.cursor/rules/iam-keys-security-runtime.mdc` |

## Migrations to apply (if not on remote)

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
  -c wrangler.production.toml --file=./migrations/377_user_api_keys_category.sql
# … 340, 597, 600 as needed
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
  -c wrangler.production.toml --file=./migrations/640_byok_sprint_memory_router.sql
```

## Test commands

```bash
# Unit
node --test tests/unit/customer-data-plane-router.test.mjs

# Dry-run ingest
npm run run:ingest_byok_sprint_plan:dry-run
npm run run:sync_byok_sprint_memory_vector:dry-run

# Live ingest (needs OPENAI_API_KEY, SUPABASE_DB_URL, CLOUDFLARE_*)
npm run run:ingest_byok_sprint_plan
npm run run:sync_byok_sprint_memory_vector

# Manual API smoke (authenticated session)
curl -sS https://inneranimalmedia.com/api/settings/keys?category=provider -b "$IAM_COOKIE"
curl -sS -X POST https://inneranimalmedia.com/api/settings/keys/validate -b "$IAM_COOKIE" \
  -H 'Content-Type: application/json' -d '{"id":"uak_..."}'
```

## Known gaps & risks

| Gap | Notes |
|-----|-------|
| MCP pgvector BYOK not proven E2E | Platform snapshot blocker 2026-06-14; Phase 2 priority |
| `agentsam_ai` vs `agentsam_model_catalog` | Catalog is canonical; `agentsam_ai` is legacy/BYOK overlay — do not conflate |
| Audit query uses `secret_source = 'user_api_keys'` in `auditApiKeys` | Security rule says canonical secret_id is `user_secrets.id` — verify audit rows align |
| Schema drift | `settings-api-keys.js` probes columns via PRAGMA — remote may lack `vault_secret_id`, `label`, `category` |
| Superadmin bypass | **Only** `user.role === 'superadmin'` — never hardcode tenant ID strings in code |

## Retrieval cheat sheet

| Need | Action |
|------|--------|
| Fast compass | D1 `agentsam_memory.key = byok_sprint_router_v1` (pinned) |
| Full sprint plan | `docs_knowledge_search` → "BYOK sprint plan" |
| Source refs | `platform/inneranimalmedia/byok-sprint-plan#0` … `#N` in `agentsam_documents_oai3large_1536` |
| Git SSOT | `docs/platform/byok-sprint-plan.md` |
| Runtime architecture | `docs/platform/iam-runtime-architecture-2026-06.md` § BYOK resolution |
| Platform compass | `agentsam_project_context.id = ctx_inneranimalmedia` |
