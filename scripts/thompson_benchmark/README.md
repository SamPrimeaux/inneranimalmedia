# Thompson benchmark — real metrics (not synthetic)

## Two modes

| Script | What it does | Use when |
|--------|----------------|----------|
| **`live_runner.py`** | Calls production **`POST /api/agent/chat`** per model. Worker writes **real** `input_tokens`, `output_tokens`, `cost_usd`, ETO, Thompson apply. | **Default for Thompson seed data** |
| **`seed.py` / `run_builder.py`** | Python INSERTs with catalog-sampled latency/cost. | Local schema smoke only — **not** true provider metrics |

## Deploy before live tests

1. **Worker** (chat + ETO paths must be on prod):
   ```bash
   git push origin main
   ```
   CF Builds deploys `src/` automatically. Or:
   ```bash
   npm run deploy
   ```

2. **Dashboard** (only if you changed `dashboard/`):
   ```bash
   npm run deploy:frontend
   ```

3. **Secrets** on Worker: provider keys + `AGENT_SESSION_MINT_SECRET` (same as mint endpoint).

4. **Local env** (repo root, gitignored):
   - `cloudflare.env` or `.env.agentsam.local` with `AGENT_SESSION_MINT_SECRET`
   - Optional: `IAM_SESSION` or `~/.iam-session-cookie` instead of mint

## Run live matrix yourself

```bash
cd /Users/samprimeaux/inneranimalmedia

# 1) Infrastructure audit (no API spend) — ~10s
python3 scripts/thompson_benchmark/live_runner.py --audit-only

# 2) Preview which models would be called
python3 scripts/thompson_benchmark/live_runner.py --dry-run

# 3) Real tests — one chat per bench-ready model (costs $)
python3 scripts/thompson_benchmark/live_runner.py --continue-on-error

# 4) Smoke: first 3 models only
python3 scripts/thompson_benchmark/live_runner.py --limit 3

# 5) Picker-eligible models only
python3 scripts/thompson_benchmark/live_runner.py --picker-only --continue-on-error
```

Reports: `artifacts/thompson_model_matrix/LATEST_LIVE_MODEL_MATRIX.md`

Identity resolves from **`auth_users`** via `--user` (email / `au_*` / `user_key`) — no hardcoded workspace/tenant in scripts.

## What gets validated

After each live chat:

- **`agentsam_agent_run`** — real tokens, `routing_arm_id`, `agent_ai_id`
- **`agentsam_usage_events`** — `ref_table`/`ref_id`, `tokens_in`/`tokens_out`, `model`
- **`agentsam_performance_eto_events`** — `reward_score`, `alpha_delta`/`beta_delta`, `is_training_eligible=1`
- **`POST /api/agent/routing/apply-eto`** — flush pending ETO → `agentsam_routing_arms`

Audit flags missing **catalog**, **pricing**, or **routing_arms** before spend.

## Synthetic seeder (legacy)

```bash
python3 scripts/thompson_benchmark/seed.py --dry-run   # preview only
python3 scripts/thompson_benchmark/seed.py           # NOT real API metrics
```

Use **`live_runner.py`** for true Thompson routing seed data.
