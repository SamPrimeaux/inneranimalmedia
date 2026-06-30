/**
 * Cron matrix — wrangler.production.toml `[triggers] crons` (9 slots) → handler.
 * Implemented in `scheduled.js` via `handleScheduled`.
 *
 * | Expression      | Job |
 * |-----------------|-----|
 * | `*/25 * * * *`  | `runContainerPrewarmCron` — MY_CONTAINER keep-warm + scheduler failure alert |
 * | `*/30 * * * *`  | `runThirtyMinuteJobs` — DB queue drain, overnight progress, stale terminal sweep |
 * | `0 * * * *`     | `runHourlyRoutingJobs` |
 * | `0 0 * * *`     | `runMidnightUtcJobs` — **retention purge** (`data_retention_policies`), OAuth expiry, master retention, security scan, usage rollups, archive, daily digest; snapshot + Sunday `runWeeklyRollup` + `webhook_weekly_rollup` |
 * | `0 1 * * *`     | `scheduleOneAmMaintenance` — webhook payload purge, **worker analytics rollup** (hourly+daily, 72h event trim, 30d hourly trim), **agentsam_tool_cache TTL**, tool-call stats, execution performance, OTLP rollup |
 * | `0 6 * * *`     | `scheduleSixAmRagJobs` — RAG compact/sync/index, **memory decay** (moved from 01:00), webhook events DELETE (14d), snapshot |
 * | `0 9 * * *`     | `runFinancialCommandCron` |
 * | `0 9 * * 1`     | `runIntegritySnapshot` |
 * | `30 13 * * *`   | `sendDailyPlanEmail` |
 * | `0 0 1 * *`     | `runFirstOfMonthJobs` — email monthly rollup + spend ledger |
 *
 * Retention ownership (DELETE path):
 * | Table | Days | Cron |
 * |-------|------|------|
 * | agentsam_tool_call_log | 1 (24h) | midnight `runRetentionPurge` (after usage rollup; pre-purge → tool_stats_compacted + compaction_events + context_digest) |
 * | agentsam_tool_chain | 60 | midnight |
 * | agentsam_mcp_tool_execution | 30 | midnight |
 * | agentsam_execution_steps | 30 | midnight |
 * | agentsam_cron_runs | 45 | midnight |
 * | agentsam_hook_execution | 30 | midnight |
 * | agentsam_webhook_events | 14 | midnight + 06:00 hard DELETE |
 * | worker_analytics_events | 72h raw | 01:00 rollup (post-hourly) |
 * | worker_analytics_hourly | 30d | 01:00 rollup trim |
 * | agentsam_tool_cache | 14d + 5000 cap | 01:00 `runToolCacheMaintenance` |
 */
