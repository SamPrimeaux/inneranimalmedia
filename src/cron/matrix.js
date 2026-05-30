/**
 * Cron matrix — wrangler.production.toml `[triggers] crons` → handler.
 * Implemented in `scheduled.js` via `handleScheduled`.
 *
 * | Expression      | Job |
 * |-----------------|-----|
 * | `*/30 * * * *`  | `runThirtyMinuteJobs` — DB queue drain, overnight progress step, stale terminal sweep |
 * | `0 * * * *`     | Reserved (logged only; no legacy worker handler in final scheduled block) |
 * | `0 0 * * *`     | `runMidnightUtcJobs` — retention purge, R2 dashboard build prune, retention master + security scan + usage rollups, archive conversations, daily digest email + midnight snapshot |
 * | `0 1 * * *`     | `scheduleOneAmMaintenance` — memory decay, tool-call stats compaction, execution performance rollup |
 * | `10 0 * * *`    | `writeDailySnapshot(env, 'cron_0010')` |
 * | `0 6 * * *`     | `scheduleSixAmRagJobs` — RAG compact/sync/index + webhook events maintenance + 6am snapshot |
 * | `0 9 * * *`     | `runFinancialCommandCron` |
 * | `0 9 * * 1`     | `runIntegritySnapshot(env, 'cron')` |
 * | `0 1 * * sun`   | `runWeeklyRollup` — active workspaces → `agentsam_analytics` |
 * | `30 13 * * *`   | `sendDailyPlanEmail` |
 * | `0 0 1 * *`     | `runFirstOfMonthJobs` — `runEmailMonthlyRollup` (email_logs → rollups, R2 sent/ prune, received_emails trim) then `runSpendLedgerRollup` |
 */
