# Private managed memory taxonomy

## Surfaces

| Surface | Role |
|---------|------|
| `agentsam.agentsam_memory` | **Canonical** private operational memory (Postgres via Hyperdrive) |
| D1 `agentsam_memory` | Edge cache, MCP compatibility, fast prompt helper |
| `agentsam.agentsam_memory_oai3large_1536` | Optional semantic/RAG lane — **not** required for writes |
| `public.agent_memory` | **Do not use** for private Agent Sam memory |
| `public.iam_*` | Public learning/onboarding only |

## Memory types and keys

| Type | Use | Example keys |
|------|-----|----------------|
| `project` | Milestones, deploy summaries, sprint notes | `project:plan_may29_*`, `deploy:<sha>`, `milestone:*` |
| `decision` | Durable architecture/product decisions | `decision:data_plane_no_platform_fallback` |
| `policy` | Rules that steer future behavior | `policy:no_public_private_memory` |
| `preference` | User/operator preferences | `pref:model_routing_cost_policy` |
| `error` | Known bugs, repair notes | `error:mcp_memory_save_401_reauth` |
| `skill` | Reusable procedure pointers | `skill:deploy_full_with_d1_migrations` |
| `state` | Current production snapshot (overwrite) | `state:production` |
| `fact` | Stable facts | `fact:canonical_supabase_schema` |

**MCP tools:** use `agentsam_memory_save` (not `agentsam_memory_write`, which is Vectorize-only). See `docs/agentsam_knowledge/mcp_memory_schema_refresh.md`.

## Retrieval tiers

1. **Tier 0** — D1 hot cache (`loadD1Memory`)
2. **Tier 1** — Exact `memory_key` / type / tags in `agentsam.agentsam_memory`
3. **Tier 2** — `ILIKE` / `pg_trgm` on key, content, summary (no Vectorize)
4. **Tier 3** — Optional `embedding` column only when explicitly indexed

## Write contract

- Upsert on `(tenant_id, user_id, memory_key)`
- `sync_key` = `tenant_id:user_id:memory_key`
- `embedding` defaults NULL
- D1 write → `mirrorD1MemoryToPrivatePg` (log `failed_memory_mirror` on failure)
- MCP 401 → `reauth_required`; never claim saved without persistence

## External AI sync

Same contract for Cursor (`alignment_sync`), MCP (`mcp:chatgpt`, `mcp:claude`), deploy hooks, dashboard.

## HTTP APIs

| Route | Surface |
|-------|---------|
| `GET /api/agent/memory/private/list` | Private PG list |
| `POST /api/agent/memory/private/search` | Private search (no Vectorize) |
| `POST /api/agent/memory/private/upsert` | D1 + PG mirror |
| `POST /api/agent/memory/maintenance` | Report-only maintenance |
| `GET /api/agent/memory/list?surface=d1\|private` | D1 compat or private |
| `POST /api/agent/memory/upsert` | Legacy `public.agent_memory` + embed |
| `POST /api/agent/memory/search` | Legacy `public.agent_memory` vector |

## Dashboard UI (deferred)

Three tabs recommended: **Private memory**, **D1 compat**, **Public learning** (`public.iam_*` only). APIs above are sufficient until UI ships.

## Backfill

**Production (preferred):** `POST /api/agent/memory/private/backfill` (superadmin, uses Worker Hyperdrive).

**Local script** (requires valid `SUPABASE_DB_URL` in `.env.cloudflare`):

```bash
./scripts/with-cloudflare-env.sh node scripts/backfill-agentsam-memory-private-pg.mjs
./scripts/with-cloudflare-env.sh node scripts/backfill-agentsam-memory-private-pg.mjs --dry-run --limit 80
```

## Maintenance

`src/core/agentsam-memory-maintenance.js` — report duplicates, stale `state:*`, D1↔PG drift. No silent deletion of decisions. Invoke via `POST /api/agent/memory/maintenance`.
