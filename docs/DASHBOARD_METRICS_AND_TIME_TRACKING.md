# Dashboard metrics and time tracking

## What’s in place (Worker)

### 1. `/api/overview/stats`

Returns metrics for the dashboard overview:

- **finance_transactions_count**, **spend_ledger_entries**, **spend_ledger_total** — from D1 `finance_transactions` and `spend_ledger` (0 if missing)
- **active_clients** — from `workspaces` where `category = 'client'` (0 if missing)
- **financial_health** — total_in/out, date_range, source_accounts_tracked
- **infrastructure_spend_by_provider** — provider breakdown from `spend_ledger`
- **latest_migration** — last deploy from `cloudflare_deployments` where `worker_name = 'inneranimalmedia'`
- **agent_conversations** / **agent_last_activity** — derived from `agent_telemetry` (row count and last `created_at`)

If a table doesn’t exist (e.g. `finance_transactions`), the API returns 0 and does not error.

### 2. `/api/dashboard/time-track` (requires session)

| Endpoint | Method | Action |
|--------|--------|--------|
| `/api/dashboard/time-track/start` | POST | Start a new time entry for the logged-in user |
| `/api/dashboard/time-track/end` | POST | End the active time entry |
| `/api/dashboard/time-track` or `/api/dashboard/time-track/heartbeat` | GET/POST | If no active entry, start one; if active, update duration |

**Behavior**

- On **start**: Inserts into `project_time_entries` with `project_id = 'inneranimalmedia'`, `is_active = 1`, `description = 'dashboard_session'`.
- On **heartbeat**: If an active entry exists, updates `duration_seconds`; otherwise creates a new entry (`description = 'dashboard_heartbeat'`).
- On **end**: Sets `end_time`, updates `duration_seconds`, and marks `is_active = 0` for all active entries for this user/project.

---

## Wiring automatic time tracking (dashboard shell)

The overview page and other dashboard pages are loaded into the shell (e.g. `shell-v2.html`). To track time while the user is logged in:

1. **On shell load** (or first dashboard page load):
   - `fetch('/api/dashboard/time-track/start', { method: 'POST', credentials: 'include' })`
   - or, if you prefer starting on heartbeat, skip this and rely on the first heartbeat.

2. **Periodic heartbeat** (every 2–5 minutes):
   - `fetch('/api/dashboard/time-track?action=heartbeat', { method: 'POST', credentials: 'include' })`

3. **On page unload / visibility hidden**:
   - `fetch('/api/dashboard/time-track/end', { method: 'POST', credentials: 'include' })`
   - Use `navigator.sendBeacon()` if needed for reliability on `beforeunload`.

**Where to add this**

- In `shell-v2.html` (or equivalent): add a small script that runs when the shell is ready and when the user is on a dashboard route.
- Source path: `MEAUXIDERANDOMBUILDS/ai-cli/static/dashboard/shell-v2.html` (or wherever the shell lives). After editing, re-upload to the DASHBOARD R2 bucket (agent-sam) at the same key (`static/dashboard/shell-v2.html` or equivalent).

**Example snippet for shell**

```javascript
(function timeTrack() {
  if (!document.body.dataset.dashboardShell) return; // only in dashboard
  fetch('/api/dashboard/time-track/start', { method: 'POST', credentials: 'include' }).catch(() => {});
  var beat = setInterval(function() {
    fetch('/api/dashboard/time-track?action=heartbeat', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, 3 * 60 * 1000); // every 3 min
  window.addEventListener('beforeunload', function() {
    clearInterval(beat);
    navigator.sendBeacon ? navigator.sendBeacon('/api/dashboard/time-track/end', '') : null;
  });
})();
```

---

## Agent page

The **Agent** page (`/dashboard/agent`) is already loaded via the shell:

- The shell (`shell-v2.html`) fetches `pages/agent.html` and injects it into `#page-content` when path is `agent`.
- The shell adds `agent-page-main` class for layout.
- Nav link: **TOOLS** → Agent.

If the agent page feels different or lacks the shell chrome, ensure the dashboard entry point (e.g. `static/dashboard/overview.html` in R2) loads the shell, and the shell’s page router correctly fetches `pages/agent.html` for `/dashboard/agent`.

---

---

## Agent page (footer chat pane)

The **Agent** page (`/dashboard/agent`) includes:

- **Unified sitenav** — Same sidebar and topbar as the rest of the dashboard (shell).
- **Footer chat pane** — Fixed bar at the bottom with:
  - **Context gauge** — Estimated tokens (0k / 128k) from the current conversation; updates as you send messages.
  - **$ gauge** — AI spend this month from `GET /api/finance/ai-spend?scope=agent`; polls every 60s.
  - **Chat** — Expand/collapse; scrollable message area and Send input. Uses same `prefer_provider` as the drawer and `POST /api/agent/chat`.

The worker’s `handleFinanceAiSpend` returns `summary: { total_this_month }` and `rows[]` so the agent budget pie and usage table work.

**Deploy**

1. **Worker**: `npx wrangler deploy --config wrangler.production.toml` (ai-spend response shape).
2. **R2**: Upload `dashboard/agent.html` to bucket **agent-sam** key `dashboard/agent.html`.  
   If `wrangler r2 object put agent-sam/dashboard/agent.html --file=./dashboard/agent.html --remote` returns 400, upload via Cloudflare Dashboard → R2 → agent-sam → Upload.
3. **D1** (optional): `npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=migrations/109_agent_footer_ai_spend.sql`

---

2. **Shell** (time tracking): The time-tracking script is in  
   `MEAUXIDERANDOMBUILDS/ai-cli/static/dashboard/shell-v2.html`.  
   Upload that file to the DASHBOARD R2 bucket (agent-sam) at key  
   `static/dashboard/shell-v2.html`  
   (or whatever key your dashboard uses for the shell). If your sync script uses a different source path, ensure the updated shell is included.

---

## D1 tables used

| Table | Purpose |
|------|---------|
| `project_time_entries` | Time tracking: user_id, project_id='inneranimalmedia', start_time, end_time, duration_seconds, is_active |
| `cloudflare_deployments` | Last deploy for `latest_migration` in overview |
| `finance_transactions` | Overview finance count (if exists) |
| `spend_ledger` | Overview spend count, total, provider breakdown (if exists) |
| `agent_telemetry` | Overview agent_conversations count and last activity |
| `workspaces` | Active clients (if exists, `category = 'client'`) |
| `auth_sessions` | Session validation for time-track API |

---

## Viewing your time

Query `project_time_entries` for your user and project:

```sql
SELECT id, user_id, project_id, start_time, end_time, duration_seconds, is_active, description
FROM project_time_entries
WHERE project_id = 'inneranimalmedia'
ORDER BY start_time DESC;
```

Or via the Time Tracking page (`/dashboard/time-tracking` or equivalent) once it’s wired to this table.
