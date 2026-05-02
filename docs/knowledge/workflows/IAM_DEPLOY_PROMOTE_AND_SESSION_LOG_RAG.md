---
title: IAM deploy, promote, session log, and AutoRAG
category: workflows
updated: 2026-04-04
importance: high
---

# Deploy pipeline (sandbox → production)

## Order of operations

1. **Commit and push** source changes to GitHub (`main` or your release branch).
2. **Sandbox:** from repo root, `unset NODE_ENV && ./scripts/deploy-sandbox.sh` — builds Vite, uploads to **agent-sam-sandbox-cicd**, deploys **inneranimal-dashboard** worker (`wrangler.jsonc`).
3. **Verify** `https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent` (auth as needed).
4. **Optional:** `./scripts/benchmark-full.sh sandbox` or smoke tests.
5. **Production promote:** `./scripts/promote-to-prod.sh` — pulls **dashboard bundle from sandbox R2** (not local `dist/`), pushes to **agent-sam**, deploys **inneranimalmedia** from **local `./worker.js`** + `wrangler.production.toml`.
6. **Verify prod:** `curl -s https://inneranimalmedia.com/dashboard/agent | grep -o 'dashboard-v:[0-9]*'`

## Description templates (for humans and D1)

Use when setting **`DEPLOYMENT_NOTES`** or **`TRIGGERED_BY`** for `promote-to-prod.sh`, or when appending **`docs/cursor-session-log.md`**.

**Short (one line):**

`feat: <area> — <what changed>; sandbox verified vN`

**Longer (promote + audit):**

- **What shipped:** bullet list of user-visible or worker changes.
- **Risk / rollback:** none | note.
- **D1 / migrations:** applied migration ids or "none".
- **Follow-ups:** optional.

Example:

```text
DEPLOYMENT_NOTES='feat: chat /claude PTY delegate + system prompt; sandbox v20 verified' TRIGGERED_BY=sam ./scripts/promote-to-prod.sh
```

## D1 command registries (two tables)

### `commands` (tool + template)

Used by **`GET /api/commands`** (see `docs/AGENT_SAM_FULL_CAPABILITY_AUDIT.md`). Each row has **`tool`** (e.g. `bash`, `wrangler`), **`command_name`**, and **`command_template`** (the shell or CLI line to run).

Examples: **`cmd_promote_to_prod`** → `./scripts/promote-to-prod.sh`; **`cmd_upload_session_autorag`** → `./scripts/upload-session-docs-to-autorag.sh`.

### `agent_commands` (slash / chat execute)

Table: **`agent_commands`**. Rows drive chat listings and default text for **`POST /api/agent/commands/execute`** (slash-style UX).

Notable **active** slugs (non-exhaustive): **`runtests`**, **`runfullaitest`**, **`smoke-test`**, **`/deploy-full`**, **`/deploy-status`**, **`doc-deploy`**, **`wrangler-d1-execute`**, **`sync-session-autorag`** (same shell script as **`cmd_upload_session_autorag`** in **`commands`**).

Inactive rows remain for history; filter **`agent_commands`** with **`status = 'active'`**.

## Session log vs AutoRAG

- **Canonical history:** `docs/cursor-session-log.md` in the repo (full audit trail).
- **RAG corpus:** the **`autorag`** bucket holds **small** markdown files (see `docs/AUTORAG_BUCKET_STRUCTURE.md`). The full session log is too large for a single indexed object; use **`./scripts/upload-session-docs-to-autorag.sh`** to upload:
  - **`knowledge/workflows/iam-deploy-promote-and-session-log-rag.md`** (this file, stable URL in bucket)
  - **`context/cursor-session-log-recent.md`** (rolling tail of the repo session log for recent context)

After uploading, run your normal **RAG ingest** or **`/api/rag/ingest`** flow if those keys are tracked in D1 **`autorag`** table.

## Related paths

| Artifact | Location |
|----------|----------|
| Promote script | `scripts/promote-to-prod.sh` |
| Sandbox deploy | `scripts/deploy-sandbox.sh` |
| CICD D1 logging | `scripts/lib/cicd-d1-log.sh` |
| Upload session docs to R2 | `scripts/upload-session-docs-to-autorag.sh` |
