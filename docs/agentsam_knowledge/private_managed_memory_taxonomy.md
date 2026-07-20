# Private managed memory taxonomy (commit / outbox law)

Status: living — updated 2026-07-20 with `agentsam_memory_commit` outbox architecture.

## Source-of-truth law

| Layer | Store | Role |
|-------|--------|------|
| **Canonical ledger** | D1 `agentsam_memory` | Immutable `memory_id` + `revision`. Only atomic write. |
| **Relational projection** | `agentsam.agentsam_memory` | Rebuildable read replica (no semantic SSOT). |
| **pgvector chunks** | `agentsam.agentsam_memory_oai3large_1536` | Durable semantic vectors + text identity columns. |
| **Fast serving** | `AGENTSAM_VECTORIZE_MEMORY` | Rebuildable mirror of chunk vectors. |
| **Reliability** | D1 `agentsam_memory_outbox` + `agentsam_memory_projection_receipts` | Eager when possible; cron retries. |

A transaction **cannot** span D1 + Postgres + OpenAI + Vectorize. Atomic portion:

1. Commit canonical D1 revision  
2. Insert projection-outbox event in the **same D1 batch**

`embedded_at` alone is **not** a receipt. Ready means verified receipts for `managed_pg` + `pgvector_chunk` + `vectorize` with matching `memory_id` / `revision` / `content_hash`.

## What qualifies as durable memory

Auto-commit:

- Explicit “remember this”
- Confirmed preferences
- Final decisions
- Durable policies
- User corrections
- Important stable project facts

Draft-only / stronger evidence:

- Assistant inference
- Ambiguous preferences
- Conflicting facts
- Sensitive content

Do **not** store:

- Raw transcripts
- Temporary debugging output
- Routine success logs
- Secrets / tokens / cookies
- Speculation
- Large documents (route to document RAG; leave a concise memory pointer)

Temporary project progress → `state` with `expires_at`.

## Allowed types (new commits)

`fact` · `preference` · `decision` · `policy` · `state` · `procedure` · `event` · `error`

Legacy preserved in DB without destructive rewrite:

- `skill` → alias of **procedure** for new commits  
- `project` → **not** a type; map to `fact` + tag `project` (project is scope/entity)

## Scope model

`scope_type`: `user` | `workspace` | `tenant` | `platform`  
`scope_id`: matching id string  

Auth: `user_id` / `tenant_id` / default `workspace_id` from MCP bearer only. Never trust agent-supplied user/tenant. Workspace switch only when authorized.

Vectorize filters inject `tenant_key` / `user_key` / `workspace_key` server-side.

## Key naming

Stable semantic slots (not title alone):

- `policy:cloudflare:operator_credential_resolution`
- `preference:ui:no_emojis`
- `decision:companions:wet_dog_entry_price`
- `state:companions:demo_readiness`

`memory_id` = immutable record identity. `memory_key` = conceptual slot. Revisions preserve history.

## Tools

| Tool | Behavior |
|------|----------|
| `agentsam_memory_commit` | `eager:true` — D1+outbox then attempt projections |
| `agentsam_memory_save` | Same path with `eager:false` — still enqueues outbox |
| `agentsam_memory_search` | Hybrid: exact → pinned → Vectorize → pgvector → lexical → D1 hydrate |

`dry_run:true` returns draft + validation + relationship with **no writes**.

## Chunk / document routing

Normal memory = one assertion → one vector.  
If content ≳ 500–600 tokens:

- Prefer **extract** multiple atomic memories, or  
- Route long source to **document** RAG and store a pointer memory  

Chunk only when one long source must be preserved (contextual 500–800 tok, modest overlap, group by `memory_id` on recall).

## Projection state machine

`pending` → `processing` → `ready` | `partial` | `failed`

Partial/failed keep canonical memory; `semantic_ready=false`; outbox retries idempotently via `projection_key`.

## Supersession / deletion

New revision sets prior `status=superseded`. Search excludes superseded/archived/deleted immediately from D1 status even if projection cleanup is pending. Outbox propagates tombstones.

## Examples

```json
{
  "memory_type": "decision",
  "memory_key": "decision:cf:mgmt_token_platform_only",
  "title": "Operator CF Management uses platform token",
  "content": "Sam/superadmin Cloudflare Management API calls always use Worker CLOUDFLARE_API_TOKEN; never fall back to OAuth/BYOK for Sam.",
  "importance": 9,
  "tags": ["cloudflare", "mcp"]
}
```
