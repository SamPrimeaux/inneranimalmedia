# Runbook: deploy public site

## Preconditions

- Changes merged; know which bucket keys or Worker routes are affected.

## Steps

1. Build or copy static HTML/assets per `architecture/public-site.md`.
2. Upload to correct R2 bucket with `wrangler r2 object put` using project env wrapper if required.
3. If Worker routing changes, deploy Worker with approved config (not ad-hoc root wrangler).

## Verify

- Hit public URLs in incognito; check 200 and cache headers.

## Rollback

- Restore previous R2 object or redeploy previous Worker version per org process.
