-- last_reindexed_at: last full chunk+embed write (distinct from last_indexed catalog touch).

ALTER TABLE agentsam.agentsam_codebase_files_oai3large_1536
  ADD COLUMN IF NOT EXISTS last_reindexed_at TIMESTAMPTZ;

UPDATE agentsam.agentsam_codebase_files_oai3large_1536
   SET last_reindexed_at = last_indexed
 WHERE last_reindexed_at IS NULL
   AND last_indexed IS NOT NULL;

COMMENT ON COLUMN agentsam.agentsam_codebase_files_oai3large_1536.last_reindexed_at IS
  'Last full chunk+embedding reindex. last_indexed may update on catalog-only touch without re-embed.';
