# Deploy tracking — capture every deploy in D1

Overview "Deploys Today" and "Worker deploys" read from `cloudflare_deployments`. A second system uses the `deployments` and `deployment_changes` tables and the **Recent Deployments** widget on the Overview page. Use `./scripts/deploy.sh "VERSION" "Description"` to deploy and log in one step.

## Deployment tracking script (deployments table)

**Preferred:** Run a tracked deploy so it appears in the Overview "Recent Deployments" card:

```bash
./scripts/deploy.sh "v44-header-fix" "Fixed mobile header stacking on user-settings"
```

The script runs `wrangler deploy` then POSTs to `/api/deployments/log` with version, description, git hash, duration, and status.

**Required:** Set `DEPLOY_TRACKING_TOKEN` so the log request is authorized. Use the same value as **WORKER_SECRET** (Cloudflare Dashboard > Workers > inneranimalmedia > Settings > Variables > Secrets).

Create or edit `~/IAM_SECRETS.env`:

```bash
# Get WORKER_SECRET from Cloudflare Dashboard (Workers > inneranimalmedia > Settings > Variables > Secrets)
DEPLOY_TRACKING_TOKEN="<paste WORKER_SECRET value here>"
```

Then before running the script either:

- `source ~/IAM_SECRETS.env`, or
- Add `DEPLOY_TRACKING_TOKEN` to the project's `.env.cloudflare` (the script sources both).

**Both deploy paths log to the new table when the token is set:**

- **`./scripts/deploy.sh "VERSION" "Description"`** — Runs wrangler deploy, then POSTs to `/api/deployments/log` with that version and description. Always logs to `deployments` when `DEPLOY_TRACKING_TOKEN` is set.
- **`npm run deploy`** (runs `deploy-with-record.sh`) — After recording to `cloudflare_deployments`, if `DEPLOY_TRACKING_TOKEN` is set (e.g. from `~/IAM_SECRETS.env` or `.env.cloudflare`), it also POSTs to `/api/deployments/log` with version `DEPLOY_VERSION` or `deploy-<timestamp>`, description from `DEPLOYMENT_NOTES` or `TRIGGERED_BY`, and deploy duration. So every full deploy is tracked in both tables.

Optional for `npm run deploy`: set `DEPLOY_VERSION` and `DEPLOYMENT_NOTES` for a clearer Overview feed, e.g. `DEPLOY_VERSION=v45 DEPLOYMENT_NOTES='Fixed header z-index' npm run deploy`.

**API endpoints:**

- `POST /api/deployments/log` — Body: `{ version, description, git_hash, status, deployed_by, environment, duration_seconds, changes[] }`. Auth: `Authorization: Bearer <DEPLOY_TRACKING_TOKEN>` or `X-Deploy-Token`.
- `GET /api/deployments/recent` — Returns `{ deployments: [...] }` (last 20, optional `?limit=50`). No auth.

**Backfill (deployments table):** To insert past deploys manually (e.g. before deploy.sh was in use), run in D1 Studio:

```sql
INSERT INTO deployments (id, timestamp, version, git_hash, description, status, deployed_by, environment, duration_seconds, created_at)
VALUES (
  'backfill-' || hex(randomblob(8)),
  datetime('now'),
  'user-settings-profile-fix',
  'b8af2dc',
  'Profile pre-filled in D1, deployed user-settings.html; header z-index and profile image reliability',
  'success',
  'manual-backfill',
  'production',
  60,
  unixepoch()
);
```

Repeat with different version/description/timestamp for each logical deploy you want to show.

---

Overview "Deploys Today" and "Worker deploys" (existing) read from `cloudflare_deployments`. If you do many deploys (e.g. 30+ in a day) but only use the script sometimes, most won't be recorded. This doc explains how to get every deploy documented.

---

## How deploys get recorded today

| Path | Recorded? |
|------|-----------|
| `npm run deploy` (runs `deploy-with-record.sh`) | Yes. Script runs `post-deploy-record.sh` after wrangler deploy and inserts one row. |
| `wrangler deploy` (or Cursor/IDE running wrangler directly) | No. Nothing writes to D1. |
| `POST /api/internal/record-deploy` (after any deploy) | Yes. Worker inserts one row. Use when you didn't use the script. |

So "30 deployments today" from your side might be 30 wrangler deploys or 30 R2 uploads; only runs that go through `npm run deploy` (or a manual record step) show up in D1.

---

## 1. Prefer the script (one source of truth)

Always deploy via:

```bash
# Optional: attribute to agent and add a note
TRIGGERED_BY=agent DEPLOYMENT_NOTES='Brief description' npm run deploy
```

That runs `deploy-with-record.sh`, which times the deploy, runs wrangler, then `post-deploy-record.sh`, which inserts into `cloudflare_deployments` with `deploy_time_seconds` and optional `triggered_by` / `deployment_notes`.

---

## 2. Record a deploy when you didn't use the script

If you already ran `wrangler deploy` (e.g. from Cursor or terminal) and want it to show in Overview:

**Option A — Script (no worker change):**

```bash
DEPLOY_SECONDS=0 ./scripts/post-deploy-record.sh
```

**Option B — API (after worker with record-deploy route is deployed):**

```bash
curl -s -X POST 'https://inneranimalmedia.com/api/internal/record-deploy' \
  -H 'Content-Type: application/json' \
  -H 'X-Internal-Secret: YOUR_INTERNAL_API_SECRET' \
  -d '{"triggered_by":"cursor","deployment_notes":"optional short note"}'
```

Response: `{"ok":true,"deployment_id":"rec-..."}`. One row is added to `cloudflare_deployments` with `worker_name=inneranimalmedia`, `status=success`, `deployed_at=now`.

Use the same `INTERNAL_API_SECRET` as for `POST /api/internal/post-deploy` (set in Worker env / wrangler secret).

---

## 3. Automating "record after every deploy"

- **From a wrapper script:** Run `wrangler deploy`, then either `./scripts/post-deploy-record.sh` (with `DEPLOY_SECONDS` if you timed it) or `curl .../api/internal/record-deploy` so every deploy path logs one row.
- **From Cursor/Agent:** After the agent runs a deploy, it can call `POST /api/internal/record-deploy` with `triggered_by: "agent"` and `deployment_notes` describing the change so the dashboard shows accurate counts and attribution.

---

## 4. What the Overview uses

- **Deploys Today:** Count of rows in `cloudflare_deployments` where `deployed_at` is on the last day of the 7-day window and `status = 'success'`.
- **Worker deploys table:** Last 20 rows from `cloudflare_deployments`.
- **Recent Activity:** Includes last 24h deploys from this table.

So more rows in `cloudflare_deployments` (from script or API) mean accurate deploy counts and activity.

---

## 5. Backfill (optional)

If you want to backfill past "missing" deploys (e.g. you know you deployed 30 times today but only 6 are in D1), you can either:

- Run `post-deploy-record.sh` multiple times with different `DEPLOYMENT_NOTES` (each run adds one row with `deployed_at = now`, so run once per "logical" deploy you want to document), or
- Use the record-deploy API in a loop with a short delay so `deployed_at` timestamps differ, or
- Run a one-off D1 `INSERT` for each deploy (same columns as the script/API).

For future days, use section 1 or 2 so every deploy is recorded going forward.
