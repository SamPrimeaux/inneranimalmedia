# Session logs (how to read)

## `docs/cursor-session-log.md`

Append-only chronological log of Cursor/agent work on this repo. Typical sections:

| Section | Meaning |
|---------|---------|
| **What was asked** | User goal for that block |
| **Files changed** | Paths and line-level notes |
| **Deploy status** | Built, R2 uploads, Worker **Version ID**, D1 row ids, `deploy approved` |
| **What is live now** | Production implications |
| **Known issues / next steps** | Follow-ups |

## Deploy identifiers

- **Worker Version ID:** UUID printed by wrangler after `Current Version ID:` — stored in D1 **`deployments.id`** when `post-deploy-record.sh` runs with `CLOUDFLARE_VERSION_ID`.
- **`last_row_id`:** Printed by `wrangler d1 execute` after INSERTs.

## This bucket (`iam-docs`)

Operational documentation mirrors under **`docs/iam-docs/`** in git. Session summaries for big milestones may also be copied here, e.g. **`autorag/sessions/2026-03-23-full-session.md`**.
