/**
 * Legacy agentsam_tools.tool_key → canonical successor (supersession matrix).
 * Source: docs/platform/agentsam-tools-cleanup-2026-06.md (chunks 1–4 + allowlist repair).
 */

/** @type {Readonly<Record<string, string>>} */
export const TOOL_SUPERSESSION = Object.freeze({
  // Chunk 1 — D1 / platform DB aliases
  d1_query: 'agentsam_d1_query',
  d1_schema: 'agentsam_d1_query',
  d1_schema_introspect: 'agentsam_d1_query',
  d1_explain: 'agentsam_d1_query',
  d1_write: 'agentsam_d1_write',
  d1_migrations_draft: 'agentsam_d1_migrate',
  agentsam_db_query: 'agentsam_d1_query',
  agentsam_db_schema: 'agentsam_d1_query',
  agentsam_db_write: 'agentsam_d1_write',

  // Chunk 2 — R2 / storage
  r2_read: 'agentsam_r2_get',
  r2_write: 'agentsam_r2_put',
  r2_list: 'agentsam_r2_list',
  r2_search: 'agentsam_r2_list',
  r2_delete: 'agentsam_r2_delete',
  agentsam_r2_read: 'agentsam_r2_get',
  agentsam_r2_write: 'agentsam_r2_put',
  agentsam_r2_upload: 'agentsam_r2_put',

  // Chunk 3 — Supabase / Hyperdrive
  supabase_query: 'agentsam_supabase_query',
  supabase_write: 'agentsam_supabase_write',
  supabase_schema: 'agentsam_supabase_query',
  supabase_vector: 'agentsam_supabase_vector',
  hyperdrive_readonly_query: 'agentsam_supabase_query',
  hyperdrive_schema_inspect: 'agentsam_supabase_query',
  platform_hyperdrive_agentsam_query: 'agentsam_supabase_query',

  // Chunk 4 — GitHub
  github_repos: 'agentsam_github_repo_list',
  github_file: 'agentsam_github_read',
  github_create_file: 'agentsam_github_write',
  github_update_file: 'agentsam_github_write',
  github_create_branch: 'agentsam_github_write',
  github_create_pr: 'agentsam_github_pr',
  github_merge_pr: 'agentsam_github_pr',
  agentsam_github_pr_create: 'agentsam_github_pr',

  // OAuth allowlist / network
  http_fetch: 'web_fetch',
  code_semantic_search: 'agentsam_autorag',
  deep_archive_search: 'agentsam_autorag',
  schema_semantic_search: 'agentsam_autorag',

  // Filesystem tools stay filesystem tools (not "workspace" product concepts).
  // Legacy workspace_* / pty_fs_* names map to fs_* handlers — never to agentsam_workspace_search.
  workspace_read_file: 'fs_read_file',
  workspace_write_file: 'fs_write_file',
  workspace_list_files: 'list_dir',
  workspace_apply_patch: 'fs_edit_file',
  workspace_search: 'fs_search_files',
  workspace_search_semantic: 'agentsam_autorag',
  pty_fs_read: 'fs_read_file',
  pty_fs_write: 'fs_write_file',
  files_apply_patch: 'fs_edit_file',
  files_read: 'fs_read_file',
  files_search: 'fs_search_files',
  files_write: 'fs_write_file',

  // Memory / knowledge (chunk 5 subset)
  agentsam_memory_search: 'agentsam_memory_manager',
  agentsam_memory_save: 'agentsam_memory_manager',
  agentsam_memory_write: 'agentsam_memory_manager',
  agentsam_memory_query: 'agentsam_memory_manager',
  knowledge_search: 'agentsam_autorag',
  memory_semantic_search: 'agentsam_memory_manager',

  // Terminal / deploy (chunk 9 subset) — legacy names → CF Container sandbox
  terminal_execute: 'agentsam_terminal_sandbox',
  terminal_run: 'agentsam_terminal_sandbox',
  terminal_wrangler: 'agentsam_terminal_sandbox',
  worker_deploy: 'agentsam_worker_deploy',
  deploy_status: 'agentsam_worker_deploy',
  agentsam_deploy_status: 'agentsam_worker_deploy',
  list_workers: 'agentsam_worker_deploy',
  get_worker_services: 'agentsam_worker_deploy',
  get_deploy_command: 'agentsam_stack_deploy',

  // Platform / email
  agentsam_notify: 'agentsam_send_email',
  resend_send_email: 'agentsam_send_email',
  resend_send_broadcast: 'agentsam_send_email',
  gdrive_list: 'agentsam_gdrive',
  gdrive_fetch: 'agentsam_gdrive',
});

/** OAuth connector client id (canonical IAM MCP). */
export const IAM_MCP_OAUTH_CLIENT_ID = 'iam_mcp_inneranimalmedia';

/**
 * Resolve legacy tool key to canonical successor (identity if unknown).
 * @param {string} toolKey
 * @returns {string}
 */
export function resolveToolSupersession(toolKey) {
  const k = String(toolKey ?? '').trim();
  if (!k) return '';
  return TOOL_SUPERSESSION[k] || TOOL_SUPERSESSION[k.toLowerCase()] || k;
}

/**
 * Active canonical catalog predicate (matches cleanup doc).
 * @param {{ is_active?: number|null, is_degraded?: number|null }} row
 */
export function isCanonicalActiveToolRow(row) {
  return Number(row?.is_active ?? 1) === 1 && Number(row?.is_degraded ?? 0) === 0;
}
