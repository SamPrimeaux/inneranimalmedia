/**
 * Queue message inventory — derived from legacy worker.js `queue()` (lines ~6962–7046).
 * Extend QUEUE_MESSAGE_KINDS when adding handlers in dispatcher.js.
 */

/** @typedef {'codebase_index_sync'|'r2_event_iam_docs_md'|'playwright_screenshot_or_render'|'unknown'} QueueKind */

export const QUEUE_MESSAGE_KINDS = {
  /** Handled: src/queue/codebase-index-sync via handleCodebaseIndexSyncFromQueue */
  CODEBASE_INDEX_SYNC: 'codebase_index_sync',
  /**
   * R2 event notification: bucket `iam-docs`, object `.md`, actions PutObject|CopyObject|CompleteMultipartUpload|DeleteObject.
   * Handled: docs-vectorize.js (Vectorize + docs_index_log).
   */
  R2_IAM_DOCS_MD: 'r2_event_iam_docs_md',
  /**
   * Playwright batch job: body.jobId + job_type `screenshot`|`render` + url.
   * Handled: playwright-queue-job.js
   */
  PLAYWRIGHT_JOB: 'playwright_screenshot_or_render',
};

export const QUEUE_INVENTORY_DOC = `
Known Cloudflare Queue message shapes (production):

1. type=codebase_index_sync — tenantId/tenant_id, workspaceId/workspace_id, payload for codebase index sync.
2. R2 notification (no type): bucketName iam-docs, object.key ending in .md, action PutObject|CopyObject|...
3. Playwright: jobId, job_type screenshot|render, url — updates playwright_jobs in D1.

Unhandled types are logged with [queue] unhandled_message_type and should be acked after instrumentation.
`;
