# Overnight API Canary Suite

**This is an observation suite, not a deploy gate.**
The canonical pre-promote gate is `./scripts/benchmark-full.sh` (31/31 tests).
This suite does not call `promote-to-prod.sh`, `wrangler deploy` (prod), or `wrangler secret put`.

---

## End-to-end coverage map and cost governance

**Goal:** Any operator (human or Claude Code) can run **stack-wide** checks that touch **LLM providers**, the **IAM worker** (`/api/agent/chat`, internal routes), **D1** (`agentsam_*` / `mcp_*` / `cicd_*` / routing tables), and **optional provider Batch APIs** — without unbounded spend.

### When things run

| Trigger | What |
|--------|------|
| **Manual / shell cron** | `node scripts/overnight-api-suite.mjs` — HTTP tiers A–D; **not** wired to Cloudflare cron by default. |
| **Manual** | `./scripts/batch-api-test.sh` (Anthropic Batch API direct). Future: `batch-api-openai.sh`, `batch-api-gemini.sh`. |
| **Cloudflare Worker crons** | Digest, daily plan, queues, RAG, terminal sweep, etc. — **separate** from this brief; they do not replace the Node canary or batch smokes. |

`runOvernightCronStep` / `OVERNIGHT_STATUS` in `project_memory` is a **different** pipeline (progress emails when a long job is marked RUNNING). Do not confuse it with `overnight-api-suite.mjs`.

### Spend cap: **USD 5.00 per provider per orchestrated run** (hard stop)

| Rule | Detail |
|------|--------|
| **Budget** | **`OVERNIGHT_CAP_USD_PER_PROVIDER`** defaults to **`5`** (dollars). Each **LLM vendor bucket** tracks estimated spend **within a single invocation** of the overnight orchestration (or a single script run, until we add a shared ledger file). |
| **Buckets** | **anthropic** (Messages API, Batch API, and worker-routed Haiku/Sonnet/Opus calls attributable to Anthropic). **openai** (Chat Completions, Responses, Batch). **google** (Gemini generateContent / batch). **workers_ai** (Cloudflare Workers AI `@cf/*` — estimate from token counts x published $/MTok or Workers AI dashboard guidance). |
| **Hard stop** | If **estimated cumulative spend for a bucket** meets or exceeds the cap **during** the run: **stop** further paid calls for that bucket for that run; log `quality_checks` or stderr with `status=fail` / `overnight_budget_exceeded`; **do not** continue burning that provider. |
| **Non-dollar checks** | Tier A/B/D (GET, internal `dry_run`, read-only D1), MCP **health/list** calls that do not invoke paid models, and pure SQL observation **do not** consume the $5 buckets — but scripts should still **count** any worker `POST /api/agent/chat` that triggers a provider as spend. |
| **MCP tools** | Exercising MCP **through the worker** may incur provider cost inside tools — attribute to the **underlying provider** when the tool calls an LLM; otherwise treat as **worker/platform** (no LLM bucket) unless a tool is explicitly metered. |

Orchestrators (future `scripts/overnight-e2e-all.sh` or Makefile) should: load `.env.cloudflare`; run **cheapest layers first** (A, B, D); then **one** Tier C canary (Haiku); then **batch smokes** only if remaining headroom in each bucket; **abort** the remainder of that provider’s queue when the cap is hit.

### What each layer is supposed to prove (E2E intent)

| Layer | Proves | Primary scripts / surfaces |
|-------|--------|----------------------------|
| **HTTP + auth** | Worker up, internal secret gates work | `overnight-api-suite.mjs` tiers A, B |
| **Worker chat path** | Session, routing, telemetry, `agent_telemetry` | Tier C (`POST /api/agent/chat`); optional `OVERNIGHT_TIER_C_PROD` |
| **Routing / Agent Sam D1** | EMA, decisions, memory index | Tier D SELECTs; extend with more `SELECT`s on `mcp_tool_calls`, `mcp_workflows`, `routing_decisions` as needed (read-only) |
| **Provider Batch API** | Vendor JSONL, polling, results file | `batch-api-test.sh`; future OpenAI / Gemini mirrors |
| **MCP** | Server reachability + tool registry (smoke) | **Not** fully covered by `overnight-api-suite.mjs` today — use **MCP health** route or `curl` MCP `/mcp` `initialize` plus D1 `mcp_registered_tools` row counts in Tier D extensions |
| **Workflows** | `mcp_workflows` / execution tables | Read-only D1 counts or a dedicated **low-cost** worker route if one exists — do not spam creates |

**Honest gap:** True multi-model E2E through **auto-routing** (OpenAI + Gemini + Workers AI in one suite) requires **multiple** Tier-C-style chats with different `model_id`s or a **small** matrix of prompts — each call accrues to the **$5** bucket for that provider. Implement incrementally; document each new prompt in this file.

---

## Quick start

```bash
# Dry run — prints curl commands only, no network calls
DRY_RUN=1 node scripts/overnight-api-suite.mjs

# Default run — sandbox only, all tiers
node scripts/overnight-api-suite.mjs

# Skip chat canary and D1 observation (tiers A+B only)
SKIP_TIER_C=1 SKIP_TIER_D=1 node scripts/overnight-api-suite.mjs

# Include prod tier A (read-only GET probes only)
OVERNIGHT_INCLUDE_PROD=1 node scripts/overnight-api-suite.mjs
```

---

## Env vars

| Variable | Default | Description |
|---|---|---|
| `DRY_RUN` | `0` | `1` = print curl commands only, no requests |
| `SANDBOX_ONLY` | `1` | Routes requests to sandbox URL |
| `OVERNIGHT_INCLUDE_PROD` | `0` | Also run tier A against prod (opt-in) |
| `SKIP_TIER_C` | `0` | `1` = skip chat canary |
| `SKIP_TIER_D` | `0` | `1` = skip D1 state observation |
| `INTERNAL_API_SECRET` | — | Loaded from `.env.cloudflare` as `export INTERNAL_API_SECRET='...'`; needed for tier B. Route expects `Authorization: Bearer <value>` (or `X-Internal-Secret: <value>`). `SESSION_COOKIE` alone is **not** sufficient. |
| `SESSION_COOKIE` | — | `session=<uuid>` or raw uuid — suite normalises to `session=<uuid>`. Used as `Cookie` in tiers B/C. The `?session=` query param on the dashboard URL is **not** used; set env explicitly. |
| `OVERNIGHT_TIER_C_PROD` | `0` | `1` = POST tier C to `inneranimalmedia.com` instead of sandbox. Requires a **prod** session cookie (prod and sandbox sessions are not interchangeable). |
| `WRITE_OVERNIGHT_TO_D1` | `0` | `1` = upsert `project_memory` key `OVERNIGHT_API_SUITE_LAST` in remote D1 after run (feeds morning plan email). |
| `OVERNIGHT_CAP_USD_PER_PROVIDER` | `5` | **Per provider, not one global total:** each of anthropic / openai / google / workers_ai has its **own** ceiling (default $5) per run; hard stop only for that bucket. |

Loaded automatically from `.env.cloudflare` (same pattern as `with-cloudflare-env.sh`).

---

## Tier breakdown

| Tier | What | Risk | Auth |
|---|---|---|---|
| **A** | `GET /api/health`, `GET /` — public routes | None | None |
| **B** | `POST /api/internal/post-deploy` with `dry_run:true` | Low | `INTERNAL_API_SECRET` |
| **C** | `POST /api/agent/chat` — 1 minimal canary prompt | Medium | `SESSION_COOKIE` (and `OVERNIGHT_TIER_C_PROD=1` for prod URL) |
| **D** | `wrangler d1 execute` — 4 `SELECT` queries, read-only | None | Cloudflare token |

Tier D reads these tables to verify new worker behaviors are accumulating data:
- `model_routing_rules` — confirms EMA write-back is populating `avg_latency_ms`, `success_rate`
- `routing_decisions` — confirms latency is being recorded
- `agent_memory_index` — confirms `access_count` and `last_accessed_at` are incrementing
- `terminal_sessions` — confirms stale sweep is closing phantom rows

---

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All tier A+B checks passed |
| `1` | One or more tier A/B checks failed; JSON summary printed to stdout |
| `2` | Script error (env missing, bad args) |

Tier C and D failures do not affect exit code — they are logged but do not block.

---

## Output

Reports written to `reports/overnight-YYYYMMDDTHHMMSSZ.json`.

Each row: `{ run_id, tier, name, status, detail, ts }`.

To insert into `quality_checks` (database **`inneranimalmedia-business`**):
```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command \
  "INSERT INTO quality_checks (project_id, check_name, status, details, checked_at, automated, check_category)
   VALUES ('inneranimalmedia','overnight-canary','pass','tiers A+B passed',datetime('now'),1,'overnight_canary')"
```

---

## Cron example

```
# In wrangler.production.toml or a cron wrapper:
# Run at 03:00 UTC daily — off-peak, after midnight cron completes
0 3 * * * cd /path/to/repo && node scripts/overnight-api-suite.mjs >> /var/log/overnight-canary.log 2>&1
```

Or from the Cloudflare Worker scheduled handler (invoke via `fetch` to a protected route rather than spawning Node directly).

---

## Relation to other scripts

| Script | Purpose | Relationship |
|---|---|---|
| `benchmark-full.sh` | 31-test pre-promote gate | **Do not replace.** Run before every `promote-to-prod.sh` |
| `benchmark-all-models.sh` | Provider benchmark | Separate; not overnight by default |
| `batch-api-test.sh` | Anthropic Messages Batch API — **E2E** submit, poll, results | Direct `ANTHROPIC_API_KEY`; not the IAM worker |
| `overnight.js` | UI / screenshot / R2 heavy | Separate; not invoked by this suite |
| `overnight-api-suite.mjs` | HTTP tiers A–D + D1 observation | Additive; does not replace any of the above |

---

## Provider batch APIs — true end-to-end (OpenAI + Google + Anthropic)

**Goal:** Overnight (or off-peak) **contract tests** against each vendor’s **native batch/async** product. These calls go **directly** to OpenAI / Google / Anthropic with keys from `.env.cloudflare` (or env). They **do not** exercise `POST /api/agent/chat` on the worker. With healthy API budget, run **all three** in parallel or sequence and record results in `quality_checks` (or the JSON report pattern below).

**Why separate from `overnight-api-suite.mjs`:** Tier C there is a **single** sandbox chat round-trip through **your** stack. Provider batches validate **pricing, JSONL shape, polling, and output retrieval** on each provider’s side — different failure modes.

### Anthropic (implemented)

- **Script:** `scripts/batch-api-test.sh`
- **Flow:** `POST https://api.anthropic.com/v1/messages/batches` with `requests[]` → poll until `ended` → `GET .../results` → optional `quality_checks` row + optional archive block.
- **Env:** `ANTHROPIC_API_KEY`

### OpenAI (implement mirror script — E2E)

- **Official guide:** [Batch API](https://platform.openai.com/docs/guides/batch) — [Create batch](https://platform.openai.com/docs/api-reference/batches/create)
- **Flow (E2E):**
  1. Build a **JSONL** file: each line is a request object for the chosen `endpoint` (e.g. `POST /v1/chat/completions` style body with `custom_id`).
  2. **Upload file** with `purpose: batch` (Files API).
  3. **`POST /v1/batches`** with `input_file_id`, `endpoint` (e.g. `/v1/chat/completions`), `completion_window: "24h"`.
  4. Poll **`GET /v1/batches/{id}`** until status is terminal (`completed`, `failed`, `cancelled`, `expired`).
  5. Download **output** / error file IDs from the batch object; parse JSONL results.
  6. **`INSERT` into `quality_checks`** with `check_category='batch_api_openai'`, `check_name` like `openai_batch_smoke`, `details` containing `batch_id` and row counts.
- **Env:** `OPENAI_API_KEY` (same key as rest of stack; never commit).
- **Suggested script path:** `scripts/batch-api-openai.sh` — copy structure from `batch-api-test.sh` (poll loop, D1 insert at end).

### Google Gemini Batch (implement mirror script — E2E)

- **Official guide:** [Gemini Batch API / batch mode](https://ai.google.dev/gemini-api/docs/batch-mode)
- **Flow (E2E):** Use **either** inline batch requests (smaller payloads) **or** upload JSONL + create batch job per SDK/docs — poll until job completes — read inline responses or download output JSONL. Log **`quality_checks`** with `check_category='batch_api_gemini'`.
- **Env:** `GEMINI_API_KEY` or the key name used in your Google AI Studio / AI Gateway setup (`GOOGLE_AI_API_KEY` if that is what you export). **Vertex AI** batch prediction is a **different** GCP product; only use it if you intentionally run a Vertex pipeline (document project id + region in the script header).
- **Suggested script path:** `scripts/batch-api-gemini.sh` — same reporting shape as Anthropic/OpenAI.

### Orchestration (for Claude Code / cron)

```bash
# Optional: enforce cap in shell (or rely on script internals once implemented)
export OVERNIGHT_CAP_USD_PER_PROVIDER="${OVERNIGHT_CAP_USD_PER_PROVIDER:-5}"

# Example: run all provider batch smokes when keys are present (fail-soft per script)
# Stop if a script reports budget exceeded for that provider.
test -n "$ANTHROPIC_API_KEY" && ./scripts/batch-api-test.sh || true
test -n "$OPENAI_API_KEY"   && ./scripts/batch-api-openai.sh   || true
test -n "$GEMINI_API_KEY"   && ./scripts/batch-api-gemini.sh   || true
```

- Use **small N** (e.g. 3–10 requests per provider) for smoke; increase only after stable runs.
- **Each provider** must stay **under `OVERNIGHT_CAP_USD_PER_PROVIDER` USD** estimated spend for that run; on exceed, **hard stop** for that provider and log failure.
- **Do not** merge these into `benchmark-full.sh` unless Sam promotes them as a gate.

---

## Hard limits (never override without Sam approval)

- **Spend:** **`OVERNIGHT_CAP_USD_PER_PROVIDER`** (default **5**) per LLM provider bucket per run — **stop** when exceeded; no “just one more” calls without Sam approval.
- No calls to `promote-to-prod.sh` or `deploy-sandbox.sh` from this suite
- No `UPDATE`/`DELETE` against `model_routing_rules`, `agent_memory_index`, or `terminal_sessions` from test harness
- No OAuth callback hits
- No `wrangler secret put` or changes to `wrangler.production.toml` bindings
- Tier C defaults to **sandbox** (`SANDBOX_ONLY=1`). **Prod** chat canary: `OVERNIGHT_TIER_C_PROD=1` plus a **prod** `SESSION_COOKIE`; `SKIP_TIER_C=0`. (`OVERNIGHT_INCLUDE_PROD` only adds **tier A** GET probes against prod, not chat.)
