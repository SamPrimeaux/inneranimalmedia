# Backlog: `origin/production` git branch

## Context

- **`origin/main`** is the integration branch and, per `.cursorrules`, **Cloudflare Builds auto-deploys the Worker on push to `main`**.
- **`origin/production`** (tip **`52ccd87`**) is a **separate older lineage** with a **different tree** than `main` (e.g. legacy `dashboard/app/` layout vs current `dashboard/`). Force-updating `production` to match `main` would **remove many paths that exist only on that branch**.
- **Do not** `git push --force` / `--force-with-lease` to **`production`** until this audit is done.

## Tasks (later)

1. **Audit** whether **`origin/production`** is still referenced anywhere meaningful:
   - GitHub branch protections / required checks
   - Cloudflare Workers Builds / Pages branch filters
   - Any CI, docs, or runbooks that mention `production`
2. **If obsolete**: **archive** before changing remote state:
   - Create an annotated tag from the current tip, e.g. `archive/production-pre-main-sync-52ccd87`
   - Optionally push that tag to `origin`
3. **Only after archive + confirmation**: delete remote branch `production`, or repoint it with an explicit non-force workflow (e.g. merge strategy agreed by maintainers)—never blind force-overwrites.

## Policy

Until the audit completes: **`production` stays untouched**; all deploy work proceeds from **`main`**.
