# Agent run stop hooks + D1 Postgres guard (2026-07-14)

## What shipped

1. **D1 wrong-plane guard** — `d1_query` / catalog D1 rejects SQL targeting Postgres-only tables (e.g. `agentsam_search_log`) with `wrong_data_plane`.
2. **`agentsam_request_queue`** — canonical retry/drain queue (not `agentsam_approval_queue`).
3. **`agentsam_hook`** keys `agent_run_stop` (`trigger=stop`) and `agent_run_consecutive_fail` (`trigger=error`).
4. **Sink** — `POST /api/internal/agent-run-telemetry` (Worker + Cursor desk).
5. **Cursor** — `.cursor/hooks/track-stop.ts` (needs `AGENT_TELEMETRY_URL` + `AGENT_TELEMETRY_SECRET`).

## Evidence queries (D1)

```sql
-- Hooks seeded?
SELECT id, hook_key, trigger, handler_type, is_active
FROM agentsam_hook
WHERE hook_key IN ('agent_run_stop','agent_run_consecutive_fail');

-- Recent stop executions
SELECT id, hook_id, event_type, status, session_id, agent_run_id, ran_at
FROM agentsam_hook_execution
WHERE event_type IN ('agent_run_stop','agent_run_consecutive_fail')
ORDER BY created_at DESC LIMIT 20;

-- Retry queue
SELECT id, session_id, task_type, source, status, payload_json, created_at
FROM agentsam_request_queue
ORDER BY created_at DESC LIMIT 20;
```

## Evidence (Supabase / Hyperdrive)

```sql
SELECT status, count(*) FROM agentsam.agentsam_workflow_runs
 WHERE created_at > now() - interval '24 hours' GROUP BY 1;

SELECT count(*) AS errors_24h FROM agentsam.agentsam_error_events
 WHERE created_at > now() - interval '24 hours';
```

## How you test in-app

### A. D1 guard (instant)

In Agent Sam chat, ask it to run (or force tool):

`SELECT * FROM agentsam_search_log LIMIT 5`

**Expect:** tool error containing `wrong_data_plane` / Hyperdrive guidance — **not** `no such table`.

### B. Successful stop hook

1. Send a normal chat message that completes.
2. Run D1 evidence query for `event_type='agent_run_stop'` and `status='success'`.
3. Confirm a matching `agentsam_workflow_runs` row finished in Postgres (when Hyperdrive is up).

### C. Consecutive-fail → `agentsam_request_queue`

Cause two failed agent loops in the same conversation (e.g. abort mid-stream twice, or ask for an impossible tool that errors the loop). After the **second** fail:

```sql
SELECT * FROM agentsam_request_queue
WHERE source='agent_run_stop' AND task_type='agent_chat_retry'
ORDER BY created_at DESC LIMIT 5;
```

Expect a `queued` (then hourly drain → `done`) row. Auto-resume chat is **not** Wired yet — queue is the receipt.

### D. Internal telemetry (proves sink without full chat)

```bash
curl -sS -X POST https://inneranimalmedia.com/api/internal/agent-run-telemetry \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"success":false,"session_id":"test_stop_session_1","agent_run_id":"test_run_1","workspace_id":"ws_inneranimalmedia","source":"manual_proof","error_message":"proof fail 1"}'

curl -sS -X POST https://inneranimalmedia.com/api/internal/agent-run-telemetry \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"success":false,"session_id":"test_stop_session_1","agent_run_id":"test_run_2","workspace_id":"ws_inneranimalmedia","source":"manual_proof","error_message":"proof fail 2"}'
```

Second call should show `retry.ok=true` and a queue row.

### E. Cursor desk (optional)

```bash
export AGENT_TELEMETRY_URL=https://inneranimalmedia.com/api/internal/agent-run-telemetry
export AGENT_TELEMETRY_SECRET=<INTERNAL_API_SECRET>
# Requires bun for stop hook
```

Then end a Cursor agent turn; check `agentsam_hook_execution` for `source='cursor_stop'`.
