-- Remove legacy docs/* rows indexed into the codebase chunks lane (inneranimalmedia workspace).
-- Idempotent: safe to re-run; only deletes docs/ paths from codebase mirror tables.

DELETE FROM agentsam.agentsam_codebase_chunks_oai3large_1536
 WHERE workspace_id = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac'::uuid
   AND file_path LIKE 'docs/%';

DELETE FROM agentsam.agentsam_codebase_files_oai3large_1536
 WHERE workspace_id = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac'::uuid
   AND file_path LIKE 'docs/%';
