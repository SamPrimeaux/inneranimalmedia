# Claude Code handoff — overnight validation (paste this entire file)

**Repo root:** `march1st-inneranimalmedia` (canonical path on Sam’s machine as in `CLAUDE.md`).

**Purpose:** Validate that the **HTTP canary suite**, **optional provider batch smokes**, and **documentation** are consistent and runnable **without** deploy loops, infinite polls, or repeated failed tests. This is **not** a prod deploy gate; `./scripts/benchmark-full.sh` remains the pre-promote gate.

---

## 1. Source of truth (read before changing anything)

| File | Role |
|------|------|
| `docs/OVERNIGHT_BATCH_API_TEST_BRIEF.md` | Tier A–D semantics, env vars, **hard limits**, OpenAI/Gemini batch **spec** (E2E steps). |
| `docs/OVERNIGHT_EMAIL_AND_METRICS.md` | Which emails include which metrics; **Tier C `SESSION_COOKIE`**; how to get overnight results into **morning plan** (`project_memory` / worker extension). |
| `scripts/overnight-api-suite.mjs` | Node runner: tiers A–D, `reports/*.json`, exit 0/1/2. |
| `scripts/batch-api-test.sh` | **Only** in-repo **implemented** provider batch E2E (Anthropic). **Bounded poll** (see script). |
| `CLAUDE.md` | Wrangler/D1 patterns, locked files, overnight vs batch distinction. |

**Worker:** `worker.js` already contains routing EMA write-back (success + `inputTokens === 0` failure path), `agent_memory_index` access telemetry, `sweepStaleTerminalSessions` on `*/30` cron. **Do not re-apply or “fix cosmetic comments”** unless Sam pastes a failing line number. A prior attempt to edit a stray `/` comment failed; grep was misleading.

**D1 name for Tier D:** `inneranimalmedia-business` (not `iam-platform-db`). If you see the old name in `overnight-api-suite.mjs`, fix it.

---

## 2. Gated execution order (no pointless loops)

Run **exactly this sequence** once per validation session. **Stop on first hard failure** where noted.

### Step 0 — Preconditions (60 seconds)

- `cd` to repo root.
- Ensure `.env.cloudflare` exists **or** `CLOUDFLARE_API_TOKEN` is set for Wrangler (Tier D).
- **`INTERNAL_API_SECRET` (where it actually lives):**
  - **Production worker** — set as a **Wrangler secret** on `inneranimalmedia`: `./scripts/with-cloudflare-env.sh npx wrangler secret put INTERNAL_API_SECRET -c wrangler.production.toml`. Cloudflare never shows the value again after upload.
  - **Local scripts / Tier B** — the **same plaintext** must be in **`.env.cloudflare`** (gitignored) as: `export INTERNAL_API_SECRET='YOUR_VALUE'` — `overnight-api-suite.mjs` loads `export KEY=...` lines from that file automatically. There is **no** separate repo file with the real value; copy from your vault / recovery file if you rotated it. `.env.cloudflare.example` only lists the name (commented).
  - **Tier B auth header:** the route expects `Authorization: Bearer <INTERNAL_API_SECRET>`. An alternate header `X-Internal-Secret: <value>` is also accepted. `SESSION_COOKIE` alone is **not** sufficient for `/api/internal/post-deploy`.
- **Do not** assume `INTERNAL_API_SECRET` is set; Tier B may skip (suite treats as pass with warning).
- **Tier C — sandbox (default):** set `SESSION_COOKIE='session=<uuid>'` or a raw uuid — the suite normalises to `session=<uuid>`. Export in the shell or add to `.env.cloudflare` (**never commit**). The `?session=` query param on the dashboard URL is **not** used as auth; set env explicitly. Without `SESSION_COOKIE`, Tier C typically gets **401**; exit code still **0** (only tiers A/B gate exit 1).
- **Tier C — prod chat canary (opt-in):** set `OVERNIGHT_TIER_C_PROD=1` to POST to `https://inneranimalmedia.com/api/agent/chat` instead of sandbox. Use a **prod** `SESSION_COOKIE` (prod sessions are not valid on sandbox and vice versa). Do not enable unless Sam explicitly requests prod chat probes.

### Step 1 — Dry run (no network to worker)

```bash
DRY_RUN=1 node scripts/overnight-api-suite.mjs
```

**Expected:** Exit **0**, printed curl lines only. If exit **2**, fix script/env before Step 2.

### Step 2 — Live canary (sandbox default)

```bash
SKIP_TIER_C=1 SKIP_TIER_D=1 node scripts/overnight-api-suite.mjs
```

**Expected:** Exit **0** = Tier A+B only passed. **Stops** if Tier A/B fails; **do not** retry more than **once** after fixing URL/token.

### Step 3 — Add Tier D only (read-only D1)

```bash
SKIP_TIER_C=1 node scripts/overnight-api-suite.mjs
```

**Gate:** If Wrangler fails (auth, wrong DB name), **fix once** and re-run. **Max 2** attempts total for Tier D in one night. **Do not** loop on SQL errors: if `routing_decisions` / column names differ, **log the error**, open an issue note, **skip** Tier D for the night (`SKIP_TIER_D=1`).

### Step 4 — Tier C (optional, one chat)

```bash
node scripts/overnight-api-suite.mjs
```

**Gate:** If Tier C fails (timeout, 5xx), **do not** retry more than **2** times with same command. **Do not** enable `OVERNIGHT_INCLUDE_PROD` for chat unless Sam explicitly asks.

### Anti-loop rules (mandatory)

| Situation | Action |
|-----------|--------|
| Batch poll (Anthropic batch-api-test.sh) | **Already capped** (e.g. 20 iterations x 30s). **Never** increase cap in a single run; if not `ended`, exit with **non-zero** and log batch id. |
| OpenAI/Gemini scripts **not yet in repo** | **Skip**; do not create fake stubs that hang. Implement in a **follow-up** session with the same poll cap pattern as `batch-api-test.sh`. |
| Same test failed 3 times | **Stop**; report last error only. No overnight while-loop. |

---

## 3. Provider batch tests (optional, fail-soft)

**Rule:** Each provider runs **only if** its key is non-empty. Missing key = **skip**, not fail.

```bash
# After OPENAI / GEMINI scripts exist; until then, only Anthropic line runs
test -n "$ANTHROPIC_API_KEY" && ./scripts/batch-api-test.sh || echo "SKIP anthropic: no ANTHROPIC_API_KEY"
# test -n "$OPENAI_API_KEY"   && ./scripts/batch-api-openai.sh   || echo "SKIP openai: not implemented or no key"
# test -n "$GEMINI_API_KEY"   && ./scripts/batch-api-gemini.sh   || echo "SKIP gemini: not implemented or no key"
```

**Load keys:** `source` from `.env.cloudflare` the same way `batch-api-test.sh` does.

**Do not** chain these into `overnight-api-suite.mjs` until Sam asks; keep **separate** entry points to avoid one provider failure blocking HTTP canary.

---

## 4. What Claude Code should implement next (not tonight unless trivial)

1. **`scripts/batch-api-openai.sh`** and **`scripts/batch-api-gemini.sh`**: mirror `batch-api-test.sh` (bounded poll, small N, `quality_checks` INSERT with distinct `check_category`). See `docs/OVERNIGHT_BATCH_API_TEST_BRIEF.md` section *Provider batch APIs*.
2. **Optional** `scripts/run-provider-batch-smoke.sh` that wraps the fail-soft block above with **no** `while true`.

**Forbidden:** `promote-to-prod.sh`, prod `wrangler deploy`, `wrangler secret put`, OAuth callback tests, mass D1 UPDATE/DELETE from test harness.

---

## 5. Success criteria for “done tonight”

- [ ] `DRY_RUN=1 node scripts/overnight-api-suite.mjs` exits **0**
- [ ] `SKIP_TIER_C=1 SKIP_TIER_D=1 node scripts/overnight-api-suite.mjs` exits **0** (or Tier B skip documented)
- [ ] Full run with Tier D exits **0** **or** Tier D skipped after **at most 2** attempts with reason logged
- [ ] No more than **2** Tier C retries if enabled
- [ ] `reports/overnight-*.json` exists with `run_id` and results array

---

## 6. Reconciliation note (Claude Code vs Cursor)

- `docs/OVERNIGHT_BATCH_API_TEST_BRIEF.md` may be **longer** than an older “118 line” version; Cursor added **OpenAI + Gemini batch** instructions. **Do not** overwrite the brief with a shorter file.
- If git shows conflicts on `worker.js` or the brief, **prefer** the version with EMA **failure** branch and **`inneranimalmedia-business`** in `overnight-api-suite.mjs`.
