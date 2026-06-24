# `origin/production` git branch — archived

## Status (2026-06-24)

**Completed.** The obsolete `production` git branch was archived and deleted from GitHub.

| Item | Value |
|------|--------|
| Archive tag | `archive/production-pre-main-sync-f2b12bbb` |
| Tip SHA | `f2b12bbb` (`fix: meet lobby UX, Calls errors…`) |
| Deploy branch | **`main`** only |
| CF Builds | Main trigger → `main`; non-main trigger excludes `main` and `production` |
| D1 SSOT | `migrations/698_archive_production_git_branch.sql` |

## Policy

- All Worker deploys, CF Builds hooks, and `agentsam_hook` deploy triggers use **`main`**.
- Do not recreate a `production` git branch unless a deliberate release-line workflow is designed.
- `ENVIRONMENT=production` in runtime config is **not** the same as the deleted git branch.

## Historical context

`origin/production` was an older lineage (fully contained in `main` as of 2026-06-24). CF Builds non-main triggers were cloning it when deploy hooks fired, causing `deploy:cf-builds` failures because that npm script exists only on `main`.
