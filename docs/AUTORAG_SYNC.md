# AutoRAG / R2 sync — when and how

## When you can sync

After you run `./scripts/populate-autorag.sh` from the repo root (with `.env.cloudflare` or env loaded so `CLOUDFLARE_API_TOKEN` is set), all knowledge files in the repo are uploaded to the **autorag** R2 bucket. You can then sync vector data in Cloudflare:

1. **AI Search (iam-autorag):** Dashboard → AI Search → select **iam-autorag** → **Sync**. That re-indexes the autorag bucket so RAG retrieval sees the new/updated skills and knowledge.
2. **Vectorize (iam-platform):** If you also upload to **iam-platform** (see skills README), trigger **Re-index memory** from the Agent dashboard, or wait for the next scheduled index run.

So: **you can sync as soon as you've run `populate-autorag.sh` once** and then clicked Sync in the AI Search dashboard for iam-autorag.

---

## Post-merge hook (in repo)

The hook lives in the repo so every clone can use it.

**Location:** `.githooks/post-merge`

**What it does:** After `git pull` or `git merge`, if any file under `docs/knowledge/` or `scripts/populate-autorag.sh` changed, it runs `./scripts/populate-autorag.sh` and optionally records the run in D1 (see D1 recording below). Logs go to `/tmp/autorag-post-merge.log`.

**One-time setup (per clone):**

```bash
git config core.hooksPath .githooks
chmod +x .githooks/post-merge
```

See `.githooks/README.md` for details.

---

## D1: CI/DI workflow run history

Workflow runs (e.g. autorag sync from the hook or cron) are recorded in D1 for audit and CI/DI visibility.

**Table:** `ci_di_workflow_runs` (migration `migrations/140_ci_di_workflow_runs.sql`)

**Columns:** id (PK), workflow_name, trigger_type, triggered_at, completed_at, status, details_text, created_at.

**Apply migration once:**

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/140_ci_di_workflow_runs.sql
```

**Record a run manually:**

```bash
./scripts/record-workflow-run.sh autorag_sync success manual "Uploaded 9 knowledge files"
```

The post-merge hook calls `scripts/record-workflow-run.sh` after each run (success or failure) when the script is executable. Query recent runs:

```sql
SELECT id, workflow_name, trigger_type, status, triggered_at, completed_at, details_text
FROM ci_di_workflow_runs
ORDER BY triggered_at DESC LIMIT 20;
```

---

## Making sync systematic (no babysitting)

| Option | When it runs | Recording |
|--------|----------------|-----------|
| **Post-merge hook** | After `git pull` / `git merge` when `docs/knowledge/` or `scripts/populate-autorag.sh` changed | Yes, via `record-workflow-run.sh` if migration 140 applied |
| **Cron** | e.g. daily at 6 AM: `0 6 * * * cd $REPO && ./scripts/populate-autorag.sh >> /tmp/autorag-sync.log 2>&1` | Run `record-workflow-run.sh` from cron after if desired |
| **Manual** | When you run `./scripts/populate-autorag.sh` | Run `record-workflow-run.sh` after if desired |

You still need to click **Sync** in Cloudflare AI Search (iam-autorag) to refresh the vector index after uploads; the hook/cron only upload to R2.

---

## Test / validate / verify

### 1. Verify upload to R2 (autorag bucket)

After running `./scripts/populate-autorag.sh`:

- **List objects:** Cloudflare Dashboard → R2 → bucket **autorag** → Objects. You should see keys under `knowledge/` (e.g. `knowledge/architecture/worker-core.md`, `knowledge/skills/frontend-design.md`, …) and `context/active-priorities.md`.
- **Or via CLI:**
  ```bash
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object list autorag --prefix=knowledge/ --remote -c wrangler.production.toml
  ```

### 2. Verify vector index (AI Search)

After clicking **Sync** on iam-autorag:

- **Dashboard:** AI Search → **iam-autorag** → check index stats (e.g. document count, last sync time).
- **RAG in chat:** In the Agent dashboard, send a message that should trigger knowledge (e.g. "What themes can I use for artifacts?" or "How do I test a local web app with Playwright?"). Replies should reflect content from the skills/knowledge you uploaded.

### 3. Verify D1 recording (CI/DI)

If migration 140 is applied and the hook ran (or you ran `record-workflow-run.sh`):

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command "SELECT id, workflow_name, trigger_type, status, triggered_at FROM ci_di_workflow_runs ORDER BY triggered_at DESC LIMIT 5"
```

You should see rows for `workflow_name = 'autorag_sync'` with `trigger_type = 'post-merge'` or `'manual'`.

### 4. End-to-end checklist

- [ ] Migration 140 applied (`ci_di_workflow_runs` exists).
- [ ] `git config core.hooksPath .githooks` and `chmod +x .githooks/post-merge` done.
- [ ] `.env.cloudflare` has `CLOUDFLARE_API_TOKEN`.
- [ ] Run `./scripts/populate-autorag.sh` once; confirm script output and R2 bucket list.
- [ ] Cloudflare AI Search → iam-autorag → **Sync**; confirm index updated.
- [ ] Agent chat: ask a question that should use a skill; confirm answer reflects skill content.
- [ ] Optional: run `./scripts/record-workflow-run.sh autorag_sync success manual "First sync"` and query D1 to confirm row.

---

## Summary

| Step | What | When |
|------|------|------|
| 1 | Upload to R2 autorag | Run `./scripts/populate-autorag.sh` (manual, hook, or cron) |
| 2 | Update vectors | AI Search dashboard → iam-autorag → **Sync** |
| 3 | Record run (optional) | Hook calls `record-workflow-run.sh`; or run it manually after cron/manual upload |

You can sync the new vector data as soon as step 1 has run at least once and you've completed step 2 in the dashboard.
