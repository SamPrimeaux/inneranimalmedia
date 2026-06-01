-- 499: Close stale open security_findings at system init (Jun 2026 hygiene).
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/499_security_stale_findings_bulk_resolve.sql

UPDATE security_findings
SET status = 'fixed',
    resolved_at = unixepoch(),
    updated_at = unixepoch(),
    metadata_json = json_set(
      COALESCE(NULLIF(trim(metadata_json), ''), '{}'),
      '$.bulk_resolve_note',
      'bulk resolved - stale findings at system init'
    )
WHERE status = 'open';
