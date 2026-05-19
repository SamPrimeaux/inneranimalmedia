# MEGAPROMPT — Agent Sam → Cursor-Level Quality (Closed Loops)

Paste this entire file into a **new Cursor Agent session** on repo `/Users/samprimeaux/inneranimalmedia`. Execute sprints in order. Commit and push after each sprint unless halted.

**Pre-complete (2026-05-16, do not re-do):** GitHubExplorer 404→reconnect, LocalExplorer `isOpen` forcing, UnifiedSearchBar modal backdrop — Sam reports these shipped today. Skip any sprint that only duplicates those UI fixes.

**Goal:** Close the compounding loops — situated context, read-before-edit, surgical apply (SamSeek), per-task verify, surface-narrow tools, finish EMPTY/NO_TS schema wiring — so Agent Sam matches Cursor’s *evidence → surgical change → verify* cycle without new dashboard UX.

---

## REPO AND ENVIRONMENT (AUTHORITATIVE)

| Item | Value |
|------|--------|
| Repo root | `/Users/samprimeaux/inneranimalmedia` |
| Branch | `main` (CF Builds deploys Worker on push to `main`) |
| Worker entry | `src/index.js` (`wrangler.production.toml` `main`) |
| Dashboard | `dashboard/` — build: `npm run build:vite-only` from repo root |
| D1 | `inneranimalmedia-business` |
| Wrangler | `./scripts/with-cloudflare-env.sh npx wrangler … -c wrangler.production.toml` |
| D1 SQL | `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml` |
| Sam deploy (Sam runs manually) | `npm run deploy:full` — includes R2 dashboard bundle |
| Patch backups | `scripts/patch_results/backups/<sessionId>/` |

**Do not use:** `worker.js` as entry (removed), `~/Downloads/inneranimalmedia`, sandbox deploy scripts, `wrangler deploy` from Cursor unless Sam explicitly asks for a one-off.

---

## HARD CONSTRAINTS

1. No `wrangler deploy` from this session. Push to `main`; CF Builds deploys Worker. Sam runs `npm run deploy:full` when dashboard assets must go live.
2. No feature branches unless Sam says otherwise.
3. No emojis in code, commits, or comments.
4. No stubs, TODOs, or placeholder success paths.
5. No new D1 tables unless a sprint explicitly requires one.
6. No new user-visible SSE event types.
7. **No dashboard UI changes** unless sprint says so (this track is backend/executor/data).
8. DB-driven config over literals (`agentsam_*` tables, not hardcoded bucket names).
9. Surgical edits: Read file → Grep unique match → StrReplace with context → Read again to confirm.
10. Register work in D1 when shipping a vertical slice: `plan_may14_2026_repair`, todo `todo_iam_samseek_engine_v1` / successors per `.cursor/rules/agentsam-work-item-registration.mdc`.
11. Commit format:
    ```
    [sprint N] <summary>

    - path: why
    ```
12. Push after each sprint: `git push origin main`. Verify push succeeded.

---

## SESSION RESUME

Before any sprint:

1. Read `scripts/megaprompt_progress.md`
2. Resume `current_sprint` (do not restart completed sprints)
3. If `current_sprint: done` and no blockers → print FINAL ACCEPTANCE and stop

After each sprint: update progress file, commit, push.

---

## HALT PROTOCOL

Stop and record blocker in `megaprompt_progress.md` when:

- Required symbol/file missing after Grep
- `str_replace` matches 0 or 2+ times
- Migration would drop/rename columns
- Remote D1 command fails auth
- Test suite fails after fix attempt

Do **not** halt for: long files (read in chunks), extra Grep hits (narrow query).

---

## SPRINT MAP

| Sprint | Focus | Cursor layer |
|--------|--------|--------------|
| 0 | Audit script tz + `--probe-cols` | Tooling |
| 1 | Wire EMPTY tables (4) | Closed loops |
| 2 | NO_TS timestamps / probe expansion | Closed loops |
| 3 | Routing **verify** + arms/rules backfill | Core |
| 4 | Situated context (Monaco + git micro-diff) | A |
| 5 | Read-before-edit enforcement | B |
| 6 | SamSeek v1 (parse, apply, CLI, tests, hook) | C |
| 7 | Per-task smoke registry + quality_flag | D |
| 8 | Surface tool gating | Discipline |
| 9 | Final audit + completion report | Verify |

---

## SPRINT 0 — Audit script (DONE if progress says so)

**Files:** `scripts/audit_agentsam_tables.py`

1. Fix naive `fromisoformat` → treat as UTC in `parse_ts()`.
2. Expand `TS_CANDIDATES` with `event_time`, `recorded_at`, `inserted_at`, `logged_at`, `started_at`, `at`.
3. Add `--probe-cols` → `scripts/agentsam_column_probe_<YYYYMMDD>.txt` listing columns for all `NO_TS` tables.
4. Run:
    ```bash
    ./scripts/with-cloudflare-env.sh python3 scripts/audit_agentsam_tables.py
    ./scripts/with-cloudflare-env.sh python3 scripts/audit_agentsam_tables.py --probe-cols
    ```

**Accept:** `UNPARSED` near zero; probe file exists if any `NO_TS` remain.

---

## SPRINT 1 — Wire EMPTY tables

**Targets (0 rows, schema exists):**

- `agentsam_guardrail_events`
- `agentsam_compaction_events`
- `agentsam_skill_revision`
- `agentsam_user_feature_override`

**Per table:**

1. `PRAGMA table_info` via wrangler D1 (remote).
2. `grep -rn "<table>" src/ dashboard/`
3. Wire INSERT at upstream event (guardrail eval, compaction job, skill UPDATE, feature override lookup).
4. Use `ctx.waitUntil()` for non-blocking writes where pattern exists.
5. Trigger once; `SELECT COUNT(*) > 0`.

**Accept:** all four tables have rows after trigger. No new tables.

---

## SPRINT 2 — NO_TS remediation

Use Sprint 0 probe file.

**Per NO_TS table:**

- **Case A:** timestamp exists under non-standard name → add to `TS_CANDIDATES` only.
- **Case B:** no column → migration `migrations/<NNN>_add_created_at_<table>.sql`:
  ```sql
  ALTER TABLE <table> ADD COLUMN created_at INTEGER;
  UPDATE <table> SET created_at = CAST(unixepoch() * 1000 AS INTEGER) WHERE created_at IS NULL;
  ```
  Update every `INSERT` site for that table.

**Priority:** `agentsam_skill_invocation`, `agentsam_webhook_events`, `agentsam_execution_performance_metrics`, `agentsam_deployment_health`, `agentsam_eval_runs`, …

**Accept:** re-audit `NO_TS: 0` (or documented exceptions in script comment).

---

## SPRINT 3 — Routing verify (NOT greenfield)

**Reality check (already in repo):** `classifyIntent` and `selectAutoModel` are called in `src/api/agent.js` (~5257–5285). `selectAutoModel` lives in `src/core/routing.js`. Arms table: `agentsam_routing_arms`.

**This sprint proves the loop works, not reinvents it:**

1. Grep `classifyIntent`, `selectAutoModel`, `gateRewriteAndClassify`, `resolveModel` — document call order.
2. Add/confirm `output_json.intent_classification` on execution steps: `{ intent, taskType, mode }`.
3. Add/confirm `output_json.model_selection`: `{ model_key, provider, arm_id }` when `selectAutoModel` returns.
4. Backfill NULL performance fields: `src/core/retention.js` has `updateModelRoutingRulesFromScores` — verify it runs on cron; if arms have scores but rules don’t, fix the UPDATE join (confirm column names via `PRAGMA`).
5. Ensure model keys resolve via `agentsam_ai` / catalog — no stray hardcoded model strings bypassing D1.

**Accept:** one real chat produces non-empty `intent_classification` + `model_selection` in D1; routing rules NULL count drops after backfill job.

---

## SPRINT 4 — Layer A: Situated context

**Frontend** (`dashboard/features/agent-chat/` — find send handler via Grep):

Attach to agent POST body:

```js
context_bundle: {
  surface: 'code' | 'browser' | …,
  file: { path, content, selection, languageId, version } | null,
  open_tabs: string[],
  dirty_files: string[],
}
```

Cap file content at 64KB; send path+selection only if larger.

**Backend** (`src/api/agent.js`):

- Persist `context_bundle` on `agentsam_execution_steps.output_json`.
- Inject structured `<context>` block into system prompt for code surface.
- If code surface and no file: `quality_flag: NO_FILE_CONTEXT`.

**Git micro-diff (PTY):**

- On code surface + dirty files: exec `git diff --stat HEAD` + `git diff HEAD -- <paths>` (max ~8KB).
- Attach as `context_bundle.git_diff`.

**Accept:** code turn with Monaco open → `context_bundle.file.path` non-null in D1.

---

## SPRINT 5 — Layer B: Read-before-edit

**Executor** (tool dispatch in `src/api/agent.js` or `src/core/mcp-tool-execution.js` — Grep `executeTool`):

- Per `run_id`, maintain `Set<pathsRead>`.
- Seed from `context_bundle.file.path`.
- On `read_file` success → add path.
- Block `write_file`, patch tools, and future `samseek_apply` if path ∉ set:
  ```js
  { error: 'read_before_edit', message: 'Read <path> before editing.' }
  ```
- Log `quality_flag: READ_BEFORE_EDIT_VIOLATION`.
- Env `READ_BEFORE_EDIT_ENFORCE=1` (default on).

**Accept:** write without read blocked; write after read or context seed succeeds.

---

## SPRINT 6 — SamSeek v1

**Create:**

```
src/core/samseek/parser.js    # Worker-safe, no fs
src/core/samseek/apply.js     # Node-only — NEVER import from Worker
src/core/samseek/index.js     # parse + shouldRunSamseek()
scripts/samseek_apply.mjs
test/samseek/parser.test.js
test/samseek/apply.test.js
test/samseek/fixtures/
```

**Format:**

```
<<SAMSEEK:repo/relative/path.js>>
FIND:
<verbatim>
REPLACE:
<verbatim>
END:SAMSEEK
```

**v1 rules (locked):**

- Tiers: exact → normalized (LF + trim trailing WS per line). **No fuzzy.**
- Empty FIND → parse error.
- Single match required.
- Path: no `..`, no leading `/`, reuse `assertPathAllowedByIgnorePatterns`.
- Backup: `scripts/patch_results/backups/<sessionId>/`.
- Verify: `.js`→`node --check`, `.json`→parse, `.py`→py_compile, `.sh` under `scripts/`→`bash -n`; skip ts/tsx/sql/css/md.
- **Auto-apply: OFF.** Worker hook: parse + dry-run metadata → `output_json.samseek` only.
- **Surfaces:** `shouldRunSamseek` true for code/monaco/terminal; false for excalidraw/image.

**Hook:** end of assistant stream on code surface in `src/api/agent.js`.

**Tests:** `node --test test/samseek/`

**Accept:** tests green; code-surface chat with SAMSEEK block → ledger populated; excalidraw → no `samseek` key.

---

## SPRINT 7 — Layer D: Targeted smokes

**Create** `src/core/smoke-registry.js`:

```js
export const SMOKE_REGISTRY = {
  'worker-api': { cmd: 'curl -sf https://inneranimalmedia.com/health', timeout_ms: 8000 },
  'dashboard-shell': { cmd: 'curl -sf -o /dev/null -w "%{http_code}" https://inneranimalmedia.com/dashboard/', timeout_ms: 12000 },
  'samseek-unit': { cmd: 'node --test test/samseek/', timeout_ms: 30000 },
};
```

Classify by files touched; run via PTY exec; log `output_json.smoke`; on fail `quality_flag: SMOKE_FAILURE`.

**Not a substitute for** `npm run deploy:full` + Playwright proof.

---

## SPRINT 8 — Surface tool gating

Extend existing `classifyWorkflowSurface` / capability router:

- Build tool catalog from allowlist per surface (`code`, `browser`, `excalidraw`, `general`).
- Executor rejects tools not on surface → `TOOL_NOT_ON_SURFACE`.

Grep actual tool names from `src/core/tool-registry.js` — do not invent.

---

## SPRINT 9 — Final health check

1. Re-run audit → `scripts/agentsam_audit_final.txt`
2. `node --test test/samseek/`
3. Synthetic code-surface API check (curl) → D1 step has context + intent + samseek keys as applicable
4. Write `MEGAPROMPT_COMPLETION_REPORT.md` at repo root
5. Set `current_sprint: done` in progress file

---

## CROSS-CUTTING: Integration status endpoint (backlog, high value)

GitHub/Drive OAuth loops share: **any non-200 treated as disconnected**.

Add (future sprint, not required for 0–9):

`GET /api/integrations/{provider}/status` → `{ connected, expires_at, scopes }`

Data endpoints only flip `connected` on explicit **401**, not 404.

---

## FINAL ACCEPTANCE

When `current_sprint: done`:

```
MEGAPROMPT COMPLETE.
Commits on main. CF Builds will deploy Worker.
Sam: npm run deploy:full when dashboard changed.
Report: MEGAPROMPT_COMPLETION_REPORT.md
```

Stop. Do not start new work.

---

## NO-STOP CONTRACT

Between sprints: do not ask permission. Halt only on blockers. On context limit: finish current sprint commit+push+progress, then stop; Sam re-pastes this file to resume.

---

## TONE

No emojis. Blunt commit messages. No narration in code comments.

---

**Begin:** Read `scripts/megaprompt_progress.md`. Continue from `current_sprint`.
