# Overnight tests vs morning / digest email (what is included)

This doc answers: **If I run `overnight-api-suite.mjs` or provider batch tests, will tomorrow’s email show that data?**

---

## Two different emails (worker cron)

| Cron (UTC) | Function | Typical local time (US Central) | What it contains |
|------------|----------|----------------------------------|-------------------|
| `30 13 * * *` | `sendDailyPlanEmail` | ~8:30 AM | **Morning plan:** tasks, roadmap, deployments, velocity, projects, **last 8 `project_memory` rows**, pending proposals, **`project_memory` key `OVERNIGHT_API_SUITE_LAST`** (if present), **`agent_telemetry` same-day rollup** (UTC day, matches digest window). **`quality_checks`** not in morning plan. Local **`reports/overnight-*.json`** is not read by the worker. |
| `0 0 * * *` | `sendDailyDigest` | Evening US (midnight UTC) | **Daily digest HTML:** same-day `agent_telemetry`, deployments, MCP, RAG, provider spend, Haiku blurb. **`quality_checks`:** only rows with `status` in `fail` / `failed` / `warn` / `warning` and `automated=1` (up to 10). **Passes** are not listed. |

**Local JSON** from `node scripts/overnight-api-suite.mjs` is written under **`reports/overnight-*.json`** on the machine that ran Node. The worker **never** reads those files for email.

---

## How overnight results reach the morning plan (implemented)

1. Run the suite with **`WRITE_OVERNIGHT_TO_D1=1`** — upserts **`OVERNIGHT_API_SUITE_LAST`** on remote D1 (full JSON: `run_id`, `results`, `ab_fails`, `tier_c_target`, etc.).
2. **`sendDailyPlanEmail`** explicitly SELECTs that key and **`agent_telemetry`** today (UTC start-of-day), and adds an **OVERNIGHT METRICS** section to the Haiku prompt.
3. **`quality_checks`** — Failing automated rows still surface in the **midnight digest** only, not the morning plan.

---

## Tier C session cookie (real `POST /api/agent/chat`)

**Default:** Tier C posts to the **sandbox** worker. For a **production** session cookie (e.g. after logging in at `https://inneranimalmedia.com/dashboard/agent`), set **`OVERNIGHT_TIER_C_PROD=1`** so Tier C hits **`https://inneranimalmedia.com/api/agent/chat`**. The **`?session=`** query on the dashboard URL is **not** sent as auth; the worker expects **`Cookie: session=...`** — set env explicitly.

```bash
export SESSION_COOKIE='session=YOUR_SESSION_ID'
export OVERNIGHT_TIER_C_PROD=1
```

or in **`.env.cloudflare`** (gitignored):

```bash
export SESSION_COOKIE='session=YOUR_SESSION_ID'
export OVERNIGHT_TIER_C_PROD=1
```

The suite accepts either the **full** `session=...` value or **only** the UUID (it prefixes `session=`).

**Security:** Do not commit session strings. Rotate the session if a token is ever pasted into chat or committed.

---

## Provider batch tests (`batch-api-test.sh`, future OpenAI/Gemini scripts)

These write **`quality_checks`** on success. **Morning plan** does not query that table. **Midnight digest** shows **failed/warn** automated checks only. For visibility in email, use **`project_memory`** or extend the worker as above.
