-- Deduplicate agentsam_database_schema_oai3large_1536 (keep newest per table+database).
-- Run via: psql "$SUPABASE_DB_URL" -f scripts/sql/dedupe_database_schema_rag.sql
-- Then refresh with: ./scripts/with-cloudflare-env.sh python3 scripts/ingest_schema_rag.py

BEGIN;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        COALESCE(NULLIF(trim(table_name), ''), id::text),
        COALESCE(NULLIF(trim(database_name), ''), 'unknown')
      ORDER BY COALESCE(created_at, '1970-01-01'::timestamptz) DESC, id DESC
    ) AS rn
  FROM agentsam.agentsam_database_schema_oai3large_1536
)
DELETE FROM agentsam.agentsam_database_schema_oai3large_1536 s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

COMMIT;
