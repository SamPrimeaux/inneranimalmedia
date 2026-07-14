/**
 * Batch 1 — small src/** reindex to validate delete-before-insert before full Worker sweep.
 * Keep this list ≤12 files so terminal runs finish in minutes, not hours.
 */
export const SRC_WORKER_BATCH1_PATHS = Object.freeze([
  'src/core/production-dispatch.js',
  'src/core/catalog-tool-executor.js',
  'src/core/agent-tool-loop.js',
  'src/core/d1-postgres-table-guard.js',
  'src/core/agentsam-run-stop-hooks.js',
  'src/core/agentsam-midnight-rollup-pipeline.js',
  'src/core/rag-lanes.js',
  'src/core/hyperdrive-write.js',
  'src/api/post-deploy.js',
  'src/tools/db.js',
]);
