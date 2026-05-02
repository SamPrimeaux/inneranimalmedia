# Runbook: fix routes

## Symptom

- 404 on dashboard or marketing path, or wrong HTML shell for a segment.

## Checklist

1. Confirm URL path and Worker handler order in `worker.js` (dashboard vs static).
2. For SPA routes, ensure segment is in `SPA_ROUTES` or correct `static/dashboard/<segment>.html` exists in R2.
3. Verify session gate is not blocking API vs HTML incorrectly.

## After fix

- Document the segment and key in `architecture/dashboard.md` or this runbook appendix.
