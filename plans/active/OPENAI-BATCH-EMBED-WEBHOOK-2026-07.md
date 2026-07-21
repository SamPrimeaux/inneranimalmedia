# OpenAI webhook → embed usage (Phase B)

**Status:** Worker handler live (`openai-batch-embed-usage.js` + `/api/hooks/openai`)

## Tables touched

| Table | Role |
|-------|------|
| **`agentsam_webhook_events`** | Every inbound OpenAI webhook (audit). Already written by `ingestWebhookEventAndDispatch`. |
| **`agentsam_webhooks`** | Registry lookup for `endpoint_id` (read). |
| **`agentsam_usage_events`** | **Primary cost spine.** One row per embeddings Batch: `event_type=embed`, `task_type=openai_batch_embed`, `ref_table=openai_batches`, `ref_id=batch_*`, tokens + cost (Batch ≈ 50% of embedding rate). |
| **Supabase mirror** | Best-effort via `scheduleMirrorUsageEventToSupabase` from `writeUsageEvent` (same as chat/embed). |

**Not written by Phase B (yet):** `spend_ledger`, `agentsam_usage_rollups_daily`, `workspace_usage_metrics` — those stay on existing rollup/cron paths that may later read `agentsam_usage_events`.

## What does *not* hit this path

Sync `POST /v1/embeddings` (AST retrieve / Worker Re-Index) — no webhook. Those stay on Gate 0 `logEmbeddingUsageEvent`.

## Operator checklist

1. OpenAI dashboard → webhooks → confirm **`batch.completed`** (and ideally `batch.failed` / `batch.expired`) are subscribed to `https://inneranimalmedia.com/api/hooks/openai`.
2. Submit an embeddings Batch (`endpoint: /v1/embeddings`) with platform `OPENAI_API_KEY`.
3. On terminal event: D1 should gain an `agentsam_usage_events` row with `ref_id = batch_…`.
