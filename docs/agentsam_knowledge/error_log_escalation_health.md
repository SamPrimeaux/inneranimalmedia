# agentsam_error_log → escalation + health_daily

## Role

`agentsam_error_log` is the canonical structured error sink. When error rates exceed rolling thresholds, the Worker:

1. Inserts **`agentsam_escalation`** (breach record; `error_event_id` = triggering `aerr_*` id).
2. Increments **`agentsam_health_daily.red_count`** for today (`tenant_id`, `day`).

## Thresholds (1h window)

| Dimension | Field | Default threshold |
|-----------|--------|-------------------|
| `error_type` | `error_type` | 5 |
| `tool` | `context_json.tool_name` / `tool_key` | 3 |
| `model` | `context_json.model_key` / `model` | 5 |

Constants: `src/core/error-log-escalation.js` (`WINDOW_SEC`, `THRESHOLD_*`).

## Code paths

| Function | When |
|----------|------|
| `scheduleAgentsamErrorLog` | After each D1 insert → `scheduleErrorLogEscalation` |
| `evaluateErrorLogThresholds` | Counts recent unresolved errors; escalates if ≥ threshold |
| `scanErrorLogThresholds` | Hourly cron (`runHourlyRoutingJobs`) — catches missed live evaluations |

## Escalation shape

- `run_group_id`: `err_thr_{tenant}_{dimension}_{value}` (dedupe per window)
- `error_event_id`: `agentsam_error_log.id` (not `none`)
- `error_message`: `threshold:{dimension}={value} count=N/M — …`
- `succeeded`: `0`

Model-fallback chat path still logs `agentsam_escalation` per attempt with `error_event_id = 'none'`; threshold-driven rows are separate.

## D1 verification

```sql
-- Recent threshold escalations
SELECT id, run_group_id, error_event_id, model_attempted, error_message, created_at
FROM agentsam_escalation
WHERE run_group_id LIKE 'err_thr_%'
ORDER BY created_at DESC LIMIT 10;

-- Today's health red bumps
SELECT tenant_id, day, red_count, health_status, health_notes
FROM agentsam_health_daily
WHERE day = date('now')
ORDER BY rolled_up_at DESC LIMIT 5;
```
