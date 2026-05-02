# CI/CD-related D1 tables and how we keep them honest

This doc is the **operator index** for `cicd_*` audit tables in `inneranimalmedia-business`. Agents should read this before inserting ad-hoc rows or inventing new keys.

Migration **files** in `migrations/` may still use a legacy middle segment in their basenames; use the numeric id (e.g. **203**) when talking in chat so naming stays **CI/CD**-aligned.

---

## Tables (inneranimalmedia-business)

| Table | Role |
|-------|------|
| **`cicd_github_runs`** | GitHub Actions / webhook-adjacent run metadata (when used). |
| **`cicd_pipeline_runs`** | One row per logical pipeline run (`run_id` PK). Tracks environment, status, optional commit hash, notes. |
| **`cicd_run_steps`** | Child rows keyed by `run_id` + `id`. Per-step result: tool name, test type, status, latency, previews. |
| **`cicd_runs`** | Aggregate deploy / CI run rows (paired with worker mirroring to `deployments` where applicable). |
| **`cicd_events`** | Event stream (push, R2 bundle, worker version, manual deploy gate, **local repo edits**, etc.). |
| **`cicd_notifications`** | Optional notification / delivery log when wired. |

Legacy migrations and older worker code may still mention superseded table names; new work should target the **`cicd_*`** tables above.

**Views:** Treat any `cicd_*` **views** as read-only — insert into base tables only. See `docs/AGENT_SAM_UNIVERSAL_SYNC_LAW.md`.

---

## Canonical migrations (append-only log)

| Id | What it records |
|----|------------------|
| **175** | Creates pipeline / step tables if missing (see `migrations/`). |
| **203** | Git push `393a9c0` + `cicd_runs` + pipeline row + audit inserts. |
| **204** | `project_memory` key `CICD_THREE_STEP_SYSTEM` + `plan_steps` for `proj_iam_tools_agent_workspace`. |
| **205** | Repo sync: overnight suite docs, morning-plan telemetry prompt, CI/CD documentation index. |
| **207** | AITestSuite (`SamPrimeaux/meauxcad`, Worker `aitestsuite`) shell **v1.2.0** — `cicd_runs` + related audit rows; commit `a8854e3`. |
| **209** | `builds` + `cicd_events` narrative rows (meauxcad chat log wiring). |
| **215** | `project_memory`: `AGENT_DASHBOARD_UI_CONTEXT` + sandbox bucket string fix in `CICD_THREE_STEP_SYSTEM` JSON; `roadmap_steps` updates. |
| **226** | IAM binding/UX sprint: `sprint_snapshots` `snap_iam_binding_ux_20260405`; `project_memory` key `SPRINT_PLAN_IAM_BINDING_UX`; `project_issues` / `project_goals` (`iss_iam_bindux_*`, `goal_iam_bindux_*`). See `docs/SPRINT_PLAN_IAM_BINDING_UX.md`. |

---

## Apply a migration to production D1

From repo root (requires Cloudflare token via `with-cloudflare-env.sh`):

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/<migration_sql_you_intend.sql>
```

Replace the filename with the migration you intend to run. **Never** run against production without Sam approval for schema-destroying changes; these CI/CD migrations are INSERT-heavy only.

### Why we do not use `wrangler d1 migrations apply` on remote `inneranimalmedia-business`

**Option A (permanent until ledger repair):** `migrations apply` walks Wrangler’s **ordered migration list** from the first “pending” entry. On production, replay **fails early** (historical migrations reference objects that no longer exist — e.g. **`cloudflare_deployments`** around migration **107**). The live database was evolved with **`d1 execute --file=…`** and other paths, so the **ledger and disk files do not match a clean linear history**.

**Do not run** `wrangler d1 migrations apply inneranimalmedia-business --remote …` expecting it to succeed. **Keep using** `d1 execute --file=./migrations/<name>.sql` for each intentional schema change. Full write-up: **`docs/DEPLOY_AND_AGENT_GUIDE.md` §3**.

---

## Runtime writers (worker)

- **`cicd_pipeline_runs` / `cicd_run_steps`:** Worker and `scripts/lib/cicd-d1-log.sh` around deploy / benchmark flows.
- **`cicd_events` / `cicd_runs`:** Deploy scripts, webhooks, and `recordGithubCicdFollowups`-style paths.

Manual migrations (203, 205, …) backfill when webhooks or CI did not fire.

### Local refine / repair (no deploy)

To record **git HEAD** (full SHA + last commit subject), branch, origin repo, optional note, and dirty-file metadata **without** deploying:

```bash
./scripts/log-repo-edit-to-cicd-events.sh [--note "what changed"] [--wip]
```

- **`source`** = `local_dev`, **`event_type`** = `repo_edit`, **`git_commit_sha`** = current `HEAD`, **`git_commit_message`** = `git log -1 --pretty=%s`.
- **`r2_key`** = JSON: `kind`, `short_hash`, `wip_flag`, `dirty_files`, optional `note`, optional `changed_paths_sample` (when the tree is dirty).
- **`CICD_DEV_LOG_D1=0`** skips the insert (dry run / disable).
- **Optional:** `git config core.hooksPath .githooks` and `chmod +x .githooks/post-commit` to append one row **after each commit** (hook always exits 0; D1 failures are ignored).

---

## Related docs

- `docs/CICD_SHELL_MASTER_README.md` — first full CI/CD cycle + shell gates.
- `docs/CLAUDE_CODE_OVERNIGHT_HANDOFF.md` — overnight HTTP suite + env (including `INTERNAL_API_SECRET`).
- `project_memory` — JSON pipeline steps for the **CI/CD three-step system** (sandbox deploy, benchmark, promote). The column `key` on production may still match migration **204** until a rename migration runs; confirm with `SELECT key FROM project_memory WHERE project_id='inneranimalmedia' AND value LIKE '%three-step%'` (adjust as needed).
