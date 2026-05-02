# Overview dashboard — database and metrics audit

**Purpose:** Map every Overview widget to its API and D1 tables, identify broken or missing connections, and recommend fixes so CI/DI, hours, projects, deployments, tasks, and activity show correctly.

---

## 1. Widget-to-API-to-table map

| Widget | API / data source | D1 table(s) | Notes |
|--------|-------------------|-------------|--------|
| **Deploys Today** | `/api/overview/activity-strip` → `weekly_activity.deploy_trend[6]` | `cloudflare_deployments` | Count of deploys on last day of 7-day window. Filter: `deployed_at >= date(?)`, `status = 'success'`. |
| **Tasks Done** | `/api/overview/activity-strip` → `weekly_activity.tasks_completed` | `cursor_tasks` | `WHERE created_at >= unixepoch(?) AND status = 'completed'`. **Table not in repo migrations; likely missing or empty.** |
| **Hours This Week** | `/api/overview/activity-strip` → `worked_this_week.hours_this_week`; or `/api/dashboard/time-track?action=heartbeat` → `week_seconds` | `project_time_entries`, `time_logs` | activity-strip: filters by `session.user_id` (variants `sam_primeaux`, `user_sam_primeaux`). heartbeat: uses hardcoded `USER_IDS = ['sam_primeaux','user_sam_primeaux']`. **If no rows for that user or table missing, shows 0.** |
| **Worker deploys (table)** | `/api/overview/deployments` → `cloudflare_deployments` | `cloudflare_deployments` | Last 20 rows. Inserted by `scripts/post-deploy-record.sh` with `worker_name = 'inneranimalmedia'`. |
| **CI/CD runs** | `/api/overview/deployments` → `cicd_runs` | `cicd_runs` | Last 10 rows. **Table not in repo migrations; worker catches and returns [].** |
| **Weekly Activity (deploys + tasks + agent calls)** | `/api/overview/activity-strip` → `weekly_activity` | `cloudflare_deployments`, `cursor_tasks`, `agent_telemetry` | deploy_trend (7 days), tasks_completed (7d), agent_calls (7d). |
| **Recent Activity (events)** | `/api/overview/activity-strip` → `recent_activity.events`, `recent_activity.total_24hr` | `cursor_tasks`, `cloudflare_deployments` | Last 24h: task rows + deploy rows, merged and sorted. |
| **Projects (count + top)** | `/api/overview/activity-strip` → `projects` | `projects`, `client_projects` | active = COUNT projects WHERE status NOT IN ('archived','maintenance'); in_dev, production; top 4 from projects. **If tables missing, .catch returns 0 / [].** |

---

## 2. Tables not in repo migrations (or not wired)

These are referenced by the worker but have **no CREATE in migrations/** in this repo. They may exist in D1 from another source or be missing.

| Table | Used by | Recommendation |
|-------|--------|-----------------|
| **cursor_tasks** | activity-strip: tasks_completed, recent task events | Add migration: `CREATE TABLE IF NOT EXISTS cursor_tasks (id TEXT PRIMARY KEY, instruction TEXT, status TEXT, created_at INTEGER, ...)`. Populate from Cursor/IDE integration or leave empty until you have a task pipeline. **Alternative:** Drive "Tasks Done" from `roadmap_steps` (COUNT WHERE status = 'completed') so the widget shows progress without cursor_tasks. |
| **cicd_runs** | `/api/overview/deployments` → CI/CD runs table | Add migration: `CREATE TABLE IF NOT EXISTS cicd_runs (run_id TEXT PRIMARY KEY, workflow_name TEXT, branch TEXT, status TEXT, conclusion TEXT, started_at TEXT, completed_at TEXT, ...)`. Populate via GitHub Actions webhook (or manually) when workflows run. |
| **project_time_entries** | time-track start/end/heartbeat; activity-strip hours | Ensure table exists (likely from platform). Ensure **user_id** matches session: worker uses `session.user_id` with variants `sam_primeaux` / `user_sam_primeaux`. If auth returns a different user_id, hours will be 0. |
| **time_logs** | activity-strip: fallback hours; heartbeat week seconds | Optional. If missing, worker .catch returns 0. Add migration if you want manual time log entries. |
| **projects** | activity-strip: projects.active, .top | Likely exists (UPDATE in migrations 107–111). If 0, check that rows exist and status values. |
| **client_projects** | activity-strip: projects.production | If table missing, .catch returns inDevCount; production can show same as in_dev. |

---

## 3. Root causes for “0” or empty UI

- **Deploys Today = 0:** No deploy on the last day of the 7-day window. **Fix:** Deploy at least once; or confirm `cloudflare_deployments` has rows with `deployed_at` in that window (and `status = 'success'`).
- **Tasks Done = 0:** `cursor_tasks` missing or no rows with `status = 'completed'` in last 7 days. **Fix:** Add migration for `cursor_tasks` and optionally wire Cursor/agent to insert completed tasks; or **use roadmap_steps** (see below).
- **Hours This Week = 0:** No rows in `project_time_entries` for `user_id IN ('sam_primeaux','user_sam_primeaux')` with `start_time >= week start` and `is_active = 0`. **Fix:** Use Time Tracking page to start/end sessions, or ensure heartbeat/start is called from dashboard shell so entries exist; confirm session `user_id` matches.
- **CI/CD runs empty:** `cicd_runs` table missing or no rows. **Fix:** Add migration; add GitHub (or other) webhook to INSERT on workflow run.
- **Recent Activity = 0 events:** Same as above: no cursor_tasks and no cloudflare_deployments in last 24h. **Fix:** Populate cursor_tasks and/or run a deploy.
- **Worker deploys table shows old dates:** Table is correct; it shows last 20 deploys. "1w ago" etc. means no recent deploy. **Fix:** Run `npm run deploy` (with "deploy approved"); post-deploy-record will add a row.

---

## 4. Recommended migrations and wiring

### 4.1 Create missing tables (run after approval)

**cursor_tasks** (for Tasks Done and recent task events):

```sql
-- migrations/141_cursor_tasks.sql
CREATE TABLE IF NOT EXISTS cursor_tasks (
  id TEXT PRIMARY KEY,
  instruction TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cursor_tasks_created ON cursor_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cursor_tasks_status ON cursor_tasks(status);
```

**cicd_runs** (for CI/CD runs widget):

```sql
-- migrations/142_cicd_runs.sql
CREATE TABLE IF NOT EXISTS cicd_runs (
  run_id TEXT PRIMARY KEY,
  workflow_name TEXT NOT NULL,
  branch TEXT,
  status TEXT,
  conclusion TEXT,
  started_at TEXT,
  completed_at TEXT,
  commit_sha TEXT,
  repo_name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cicd_runs_started ON cicd_runs(started_at DESC);
```

**project_time_entries** (if not already present in D1):

```sql
-- migrations/143_project_time_entries.sql (only if table does not exist)
CREATE TABLE IF NOT EXISTS project_time_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  session_id TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_seconds INTEGER DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pte_user_start ON project_time_entries(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_pte_project ON project_time_entries(project_id, start_time DESC);
```

### 4.2 Optional: “Tasks Done” from roadmap_steps

If you do not want to rely on `cursor_tasks` yet, the worker can expose a **tasks_done** value from `roadmap_steps` (e.g. count of steps with `status = 'completed'` for the plan). That would show build progress instead of Cursor tasks. To do that:

- In `handleOverviewActivityStrip`, add a query: `SELECT COUNT(*) as c FROM roadmap_steps WHERE plan_id = 'plan_iam_dashboard_v1' AND status = 'completed'`.
- Use that count (or sum with cursor_tasks) for `weekly_activity.tasks_completed` so the Overview card shows a non-zero value when roadmap steps are completed.

### 4.3 Populate CI/CD runs

- **Option A:** GitHub Actions webhook that on `workflow_run` completed calls an internal API (e.g. `POST /api/internal/cicd-run`) with `run_id`, `workflow_name`, `branch`, `status`, `conclusion`, `started_at`, `completed_at`; worker INSERTs into `cicd_runs`.
- **Option B:** After running a workflow manually or via CI, insert a row via wrangler or a small script so the Overview CI/CD widget shows runs.

### 4.4 Hours and user_id

- **activity-strip** uses `session.user_id` and builds `userIdVariants` (e.g. `sam_primeaux`, `user_sam_primeaux`). Ensure auth session returns the same user_id that time-track uses.
- **handleTimeTrackHeartbeat** uses hardcoded `USER_IDS = ['sam_primeaux','user_sam_primeaux']`. If your session has a different `user_id`, either add it to that list or pass session into the heartbeat handler and use `session.user_id` variants so hours match the logged-in user.

---

## 5. Quick verification queries (D1)

Run these (with `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command "..."`) to see what the Overview actually sees.

**Verification run (2026-03-18):**

| Query | Result |
|-------|--------|
| cloudflare_deployments (last 5) | Table exists. 5 rows: worker_name=inneranimalmedia, status=success, deployed_at 2026-03-17. |
| Deploys this week | **6** |
| cursor_tasks (tasks done) | Table exists. **0** completed in last 7 days. |
| cicd_runs (last 5) | Table exists. **0 rows** (empty). |
| project_time_entries (hours by day) | Table exists. **0 rows** for sam this week (no closed entries). |
| projects (active count) | **35** |
| roadmap_steps (completed) | 10+ completed steps for plan_iam_dashboard_v1. |

So: all tables exist. Gaps are **data** — cursor_tasks has no completed rows, cicd_runs is empty, project_time_entries has no closed hours for sam this week. Deployments and projects are populated.

```sql
-- Deployments (worker deploys)
SELECT worker_name, status, deployed_at FROM cloudflare_deployments ORDER BY deployed_at DESC LIMIT 5;

-- Deploys this week
SELECT COUNT(*) FROM cloudflare_deployments WHERE deployed_at >= date('now','-7 days') AND status = 'success';

-- cursor_tasks (Tasks Done) — may error if table missing
SELECT COUNT(*) FROM cursor_tasks WHERE created_at >= unixepoch('now','-7 days') AND status = 'completed';

-- cicd_runs — may error if table missing
SELECT run_id, workflow_name, status, started_at FROM cicd_runs ORDER BY started_at DESC LIMIT 5;

-- Hours: project_time_entries for sam
SELECT date(start_time) as d, SUM(duration_seconds)/3600.0 as h FROM project_time_entries WHERE user_id IN ('sam_primeaux','user_sam_primeaux') AND is_active = 0 AND start_time >= date('now','weekday 1') GROUP BY date(start_time);

-- Projects
SELECT COUNT(*) FROM projects WHERE status NOT IN ('archived','maintenance');
SELECT id, title, status FROM roadmap_steps WHERE plan_id = 'plan_iam_dashboard_v1' AND status = 'completed' LIMIT 10;
```

---

## 6. Summary: what to do

| Goal | Action |
|------|--------|
| **Deployments** | Already wired. Ensure every deploy path records: use `npm run deploy` (runs `post-deploy-record.sh`) or call `POST /api/internal/record-deploy` after any wrangler deploy. See **docs/DEPLOY_TRACKING.md** for full guidance so 30+ deploys/day are all documented. |
| **CI/CD runs** | Add migration `142_cicd_runs.sql`; add webhook or script to INSERT rows when workflows run. |
| **Tasks Done** | Add migration `141_cursor_tasks.sql` and optionally wire Cursor/agent to insert completed tasks; or feed "Tasks Done" from `roadmap_steps` (completed count). |
| **Hours This Week** | Confirm `project_time_entries` exists and has rows for `user_id` in (`sam_primeaux`,`user_sam_primeaux`). Use Time Tracking page or shell heartbeat to create entries. Align session `user_id` with heartbeat if needed. |
| **Projects** | Confirm `projects` (and if used `client_projects`) exist and have rows; fix status values if count is wrong. |
| **Weekly / Recent Activity** | Once deployments, cursor_tasks (or roadmap), and time entries are present, activity-strip will show non-zero values. |

After applying migrations and wiring, re-check the Overview; use the verification queries above to confirm each table has the expected data.
