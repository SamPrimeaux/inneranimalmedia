# Supabase Database Webhooks (production)

Project: `dpmuvynqixblxsilnlut`  
Dashboard: **Integrations → Database Webhooks → Create a new hook**

Load secrets locally (never commit values):

```bash
grep -E 'SUPABASE_SERVICE_ROLE_KEY|SUPABASE_WEBHOOK_SECRET|SUPABASE_DB_WEBHOOK_SECRET' .env.cloudflare
```

| Env var | Used for |
|---------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function `Authorization: Bearer` header (webhook 1) |
| `SUPABASE_WEBHOOK_SECRET` | Edge Function body verification (`embed-on-ingest`, `backfill-embeddings`) — **not** a separate `EMBEDDING_WEBHOOK_SECRET` in `.env.cloudflare` |
| `SUPABASE_DB_WEBHOOK_SECRET` | Worker `x-supabase-webhook-secret` (webhooks 2–3) |

## Webhook 1 — `codebase_chunks` → embed-on-ingest

| Field | Value |
|-------|--------|
| Name | `codebase_chunks_embed` |
| Table | `public.codebase_chunks` |
| Events | **INSERT** |
| URL | `https://dpmuvynqixblxsilnlut.supabase.co/functions/v1/embed-on-ingest` |
| Headers | `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` |

The function validates the payload with `WEBHOOK_SECRET` / `EMBEDDING_WEBHOOK_SECRET` configured in **Edge Function Secrets** (Supabase dashboard), not the HTTP header from Database Webhooks.

## Webhook 2 — error events → Worker

| Field | Value |
|-------|--------|
| Name | `iam_error_events` |
| Table | `public.agentsam_error_events` |
| Events | **INSERT** |
| URL | `https://inneranimalmedia.com/api/webhooks/supabase` |
| Headers | `x-supabase-webhook-secret: <SUPABASE_DB_WEBHOOK_SECRET>` |

Sets KV `overview:bundle:dirty:errors:{tenant}` — consumed on `GET /api/overview/dashboard-bundle`.

## Webhook 3 — workflow runs → Worker

| Field | Value |
|-------|--------|
| Name | `iam_workflow_runs` |
| Table | `public.agentsam_workflow_runs` |
| Events | **UPDATE** |
| URL | `https://inneranimalmedia.com/api/webhooks/supabase` |
| Headers | `x-supabase-webhook-secret: <SUPABASE_DB_WEBHOOK_SECRET>` |

Sets KV `overview:bundle:dirty:workflows:{tenant}`.

## Existing webhook

`iam_routing_decisions` on `agentsam_routing_decisions` INSERT → Worker (Thompson arm updates).

## After webhooks — embedding backfill (8k+ chunks)

`backfill-embeddings` does **not** include `codebase_chunks` in its supported tables. Use the Worker route that calls `embed-on-ingest` per row:

```bash
cd /Users/samprimeaux/inneranimalmedia
# Repeat until remaining_null_embedding → 0
curl -X POST https://inneranimalmedia.com/api/internal/embed-codebase-chunks-backfill \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 25, "batch_size": 5, "delay_ms": 500}'
```

For other tables (documents, agent_memory, …):

```bash
RUN_SUPABASE_EMBEDDINGS_BACKFILL=1 SUPABASE_EMBEDDINGS_BATCH_SIZE=25 \
  bash scripts/supabase-embeddings-backfill.sh
```

Session summaries use a different path:

```bash
curl -X POST https://inneranimalmedia.com/api/internal/summarize-backfill \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100, "batch_size": 5, "delay_ms": 500}'
```
