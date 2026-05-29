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
