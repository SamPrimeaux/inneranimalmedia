# API metrics and agent AI cost tracking

Reference for updating tokens/times and keeping records in sync (e.g. backfilling today’s work).

---

## 1. Agent usage: `agent_telemetry` (D1)

**Purpose:** One row per LLM call. Used for token counts and “who used what.”  
**Written by:** Worker on every successful `/api/agent/chat` response.

### Schema (migration 111)

| Column          | Type    | Notes |
|-----------------|---------|--------|
| id              | TEXT PK | UUID |
| tenant_id       | TEXT    | e.g. `system` |
| session_id      | TEXT    | `conversation_id` from chat |
| metric_type     | TEXT    | `llm_call` |
| metric_name     | TEXT    | `chat_completion` |
| metric_value    | REAL    | 1 |
| provider        | TEXT    | e.g. `anthropic`, `openai` |
| model_used      | TEXT    | e.g. `claude_sonnet_4_5` |
| input_tokens    | INTEGER | From provider response |
| output_tokens   | INTEGER | From provider response |
| created_at      | INTEGER | unixepoch |
| updated_at      | INTEGER | unixepoch |

**Note:** This table does **not** store `computed_cost_usd`. Cost is derived from tokens + provider pricing elsewhere, or recorded in `spend_ledger`.

### How the worker writes it

After each chat completion (in `worker.js`):

```js
INSERT INTO agent_telemetry (id, tenant_id, session_id, metric_type, metric_name, metric_value, provider, model_used, input_tokens, output_tokens, created_at, updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,unixepoch(),unixepoch())
```

Bound: `crypto.randomUUID()`, `tenant_id`, `conversationId`, `'llm_call'`, `'chat_completion'`, `1`, `model.provider`, `model.model_key`, `inputTok`, `outputTok`.

### Read APIs

- **`GET /api/agent/telemetry`**  
  Returns last 7 days aggregated by provider:
  - `provider`, `total_input`, `total_output`, `total_calls`

- **Overview stats** (in `/api/overview/stats` or similar)  
  - `agent_telemetry`: row count and `MAX(created_at)` for “last activity”.

---

## 2. Dollar spend: `spend_ledger` (D1)

**Purpose:** Record actual or estimated spend (e.g. AI API costs) for the **$ gauge** on the agent page and for finance/overview.

### Columns used by the worker (inferred from queries)

| Column       | Used in |
|-------------|---------|
| amount_usd  | SUM for totals |
| date        | Month filtering (e.g. `date >= date('2026-03-01') AND date <= date('2026-03-31')`) |
| tenant_id   | Optional filter |
| category    | `'ai_tools'` or `'usage'` for AI spend |
| provider    | Non-null = AI-related; also `provider_slug` |
| occurred_at | Display order (DESC) |
| description | Display |
| notes       | Display |

**`GET /api/finance/ai-spend?scope=agent`** returns:

- `summary.total_this_month` — from `SUM(amount_usd)` where `category IN ('ai_tools','usage') OR provider IS NOT NULL` (currently no month filter in that query; total all-time).
- `rows` — last 50 rows: `occurred_at`, `provider_slug`, `amount_usd`, `description`, `notes`.

So: to “keep records up to date” for **costs**, insert or update rows in **`spend_ledger`** with:

- `amount_usd` (e.g. 0.02 for a chat)
- `category` = `'ai_tools'` or `'usage'`
- `provider` / `provider_slug` (e.g. `anthropic`, `openai`)
- `occurred_at` or `date` (for “today’s work” use today’s date)
- Optional: `description`, `notes`, `tenant_id`

If `spend_ledger` doesn’t exist yet, create it with at least: `id`, `amount_usd`, `date` or `occurred_at`, `category`, `provider` (or `provider_slug`), and optionally `description`, `notes`, `tenant_id`.

---

## 3. Time tracking: `project_time_entries` (D1)

**Purpose:** Track time spent (e.g. dashboard use). Used for “automatic time tracking” and overview.

### Columns (from worker usage)

- `project_id` (e.g. `'inneranimalmedia'`)
- `user_id`, `session_id`
- `start_time`, `end_time`, `duration_seconds`
- `is_active` (1 = in progress, 0 = ended)
- `description` (e.g. `'dashboard_session'`, `'dashboard_heartbeat'`)

### APIs

- **`POST /api/dashboard/time-track/start`** — start a new entry.
- **`POST /api/dashboard/time-track/end`** — end active entry.
- **`GET/POST /api/dashboard/time-track`** or **`?action=heartbeat`** — heartbeat or start if none.

To backfill “today’s work” time: insert rows into `project_time_entries` with `start_time`/`end_time` (or `duration_seconds`) and `project_id = 'inneranimalmedia'`.

---

## 4. Deriving cost from `agent_telemetry` (for backfill)

The worker does **not** write cost into `agent_telemetry`. To get “today’s” cost you can:

**Option A – Use token counts from `agent_telemetry` and compute cost**

- Query:  
  `SELECT provider, model_used, input_tokens, output_tokens, created_at FROM agent_telemetry WHERE date(created_at, 'unixepoch') = date('now')` (or same for a specific date).
- Apply your per-model pricing (e.g. from `ai_models` or a small table) to get `amount_usd` per row, then:
  - Either insert one row per call into `spend_ledger`, or
  - Insert one summary row per (date, provider) into `spend_ledger`.

**Option B – Insert into `spend_ledger` only**

If you don’t need per-call detail, you can add summary rows to `spend_ledger` with:

- `amount_usd` = total for that period
- `date` or `occurred_at` = today (or the work date)
- `category` = `'ai_tools'` or `'usage'`
- `provider` / `provider_slug` = e.g. `anthropic`
- `description` / `notes` = e.g. “Agent chat 2026-03-02” or “Backfill from agent_telemetry”

Then the existing **$ gauge** and **`GET /api/finance/ai-spend`** will include that spend.

---

## 5. Quick reference: where things live

| What              | Table / API                    | How to update “today’s” data |
|-------------------|--------------------------------|------------------------------|
| Token counts      | D1 `agent_telemetry`           | Already written per chat; or INSERT rows for past calls if you have logs. |
| Cost ($)          | D1 `spend_ledger`              | INSERT rows with `amount_usd`, `category` = `ai_tools`/`usage`, `provider`, `date`/`occurred_at`. |
| Time spent        | D1 `project_time_entries`     | INSERT or use time-track start/end/heartbeat. |
| Agent $ gauge     | `GET /api/finance/ai-spend`    | Reads `spend_ledger`; no change needed if you update D1. |
| Agent token view  | `GET /api/agent/telemetry`     | Reads `agent_telemetry` (last 7 days by provider). |

---

## 6. Migrations

- **agent_telemetry:** `migrations/111_agent_telemetry_and_latest_deploy.sql`
- **spend_ledger:** Not in repo migrations; if missing, create with columns above (and standard `id`, `created_at` if you use them).

Running migrations (from repo root, with `CLOUDFLARE_API_TOKEN` set):

```bash
npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/111_agent_telemetry_and_latest_deploy.sql
```
