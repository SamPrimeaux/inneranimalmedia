# Engineering laws — non-negotiable

**Applies regardless of which tool/account is editing** (Cursor, Claude Code, ChatGPT, in-app Agent Sam, any new account).

| Surface | Role |
|---------|------|
| **This file (`AGENTS.md`)** | Shared git memory — first read for every external tool |
| **D1 `agentsam_rules_document.id = rule_platform_lockdown_engineering_law`** | Runtime injection into Agent Sam system prompts (`apply_mode=always`, `trigger_type=system`) |
| **Loader** | `src/core/agent-skills-rules.js` → `fetchTriggeredRulesForSystemPrompt` |

Cross-session agents have **no memory** of prior chats. Reading this file (or receiving the D1 row) is the only shared memory.

---

## 1. Proof over narration

No claim of "fixed" without a re-runnable proof query/command pasted alongside it. A summary is a hypothesis. A raw D1 row, log line, or command output is a fact.

## 2. Timestamps are epoch integers, always

No TEXT timestamps, no `datetime('now')`, no ISO strings in time-critical columns. `INTEGER` unixepoch seconds only. If a hybrid/legacy column must stay TEXT for compatibility, a companion `*_unix` INTEGER column is mandatory and all filtering uses it.

## 3. Identifiers are full-length or the write fails

Git SHAs and join-key hashes are never truncated. No 7/8/12-char shorts in `git_hash`, `git_commit`, `run_group_id`, `metadata_json`, or any derived field. If the full value cannot be resolved, the writer fails loud (non-zero exit, no INSERT) — no shortened fallback anywhere.

## 4. Flags are computed or actively reconciled — never decorative

`is_active`, `resolved`, health/status flags must be either (a) computed at read time from real state, or (b) actively flipped by a scheduled reconciler. A flag set once at INSERT and never revisited is forbidden. Any new boolean/status column requires a stated reconciliation mechanism before it ships.

## 5. Fail loud, never silent-empty

A writer that cannot produce correct data does not silently succeed with empty/null/wrong data (e.g. `changed_files: []`, `git_hash: unknown`). It exits non-zero and leaves no row, or leaves a row that says explicitly what failed.

## 6. Independent verification required

Every fix is verified by an actor that did **not** write the fix, pulling primary data directly — not by re-reading the implementer's summary. Named E2E tiers: T1 implementer · T2 independent raw pull · T3 durable gate (`rule_ticket_dual_pass_e2e`).

## 7. Durable enforcement over one-time tests

Prefer a gate that keeps checking after the fix ships (e.g. `deploy-trail-gate`) over a test that only proved the fix once. A passing check at merge time is necessary, not sufficient.

## 8. No new tables/schema to solve what an existing table already captures

Sprawl is the default failure mode (600+ tables). Before creating anything new, prove an existing table cannot be reused or fixed in place.

## 9. Rules only load if the loader can see them

`apply_mode='always'` alone is **not** enough. Historically the loader required `trigger_type IN ('system','keyword')` while the column **defaulted to `'manual'`**, so LOCKED rules (including ops-trail and OAuth-liveness) sat invisible. Law:

- Global LOCKED rules: set `trigger_type='system'` explicitly on every INSERT/REPLACE.
- Keyword-gated rules: `trigger_type='keyword'` + `trigger_condition_json`.
- Never rely on the column default for always-on law.
- Mechanical guard: `npm run guard:engineering-laws` (local meta checks 1–4).
- With live D1: `npm run guard:engineering-laws:remote` also verifies (5) always-rules have visible `trigger_type` and (6) rule bodies do not backtick-reference inactive/missing `agentsam_tools` keys (tables + Vectorize lane names excluded).

---

## Related platform pointers

1. [`docs/platform/PLATFORM_CONSTITUTION.md`](docs/platform/PLATFORM_CONSTITUTION.md)
2. [`docs/workspace/WORKSPACE_CONSTITUTION.md`](docs/workspace/WORKSPACE_CONSTITUTION.md)
3. [`docs/products/PRODUCT_REGISTRY.md`](docs/products/PRODUCT_REGISTRY.md)
4. Ship lanes: [`docs/platform/mac-free-ship-lanes-2026-07.md`](docs/platform/mac-free-ship-lanes-2026-07.md) · D1 `rule_mac_free_ship_lanes`
5. Ticket E2E tiers: `plans/active/README.md` · D1 `rule_ticket_dual_pass_e2e`

**Never commit:** `.cursor/mcp.json`, `.env.cloudflare`, secrets, `*.bak`, `.scratch/`.
