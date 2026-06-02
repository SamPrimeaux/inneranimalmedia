# Agent Sam tools cleanup — supersession matrix (June 2026)

**Database:** `inneranimalmedia-business` · **Table:** `agentsam_tools` (sole catalog SSOT; `agentsam_mcp_tools` removed in migration 498)  
**MCP worker:** `inneranimalmedia-mcp-server` (`mcp.inneranimalmedia.com`) — loads tools from `agentsam_tools`, not a mirror table  
**Snapshot:** 2026-06-02 (remote D1)

**Credential policy:** Per-tenant Cloudflare / Supabase keys — not broad `platform` auth on customer OAuth tools. See [tenant-credential-lanes-2026-06.md](./tenant-credential-lanes-2026-06.md).

This document is the **Stage 1** artifact for incremental catalog cleanup. Every deprecated row should have a **successor** (or an explicit retire decision) before soft-deprecate or delete.

---

## Summary

| Bucket | Count | Definition |
|--------|------:|------------|
| **Canonical (active)** | 49 | `is_active = 1` AND `is_degraded = 0` — OAuth / `tools/list` surface |
| **Deprecation pool** | 121 | `is_active ≠ 1` OR `is_degraded ≠ 0` |
| **Total rows** | 170 | |

**Handler-type rules (already applied):**

- `r2` merged into **`cf`** (R2 ops are Cloudflare operations).
- **`workspace.reader`** removed → use **`filesystem`** + workspace-scoped `workspace_root`.
- No **`builtin`** rows in D1; dispatch must not rely on handler allowlists.

---

## Tag legend (per deprecated row)

| Tag | Meaning | Tomorrow action |
|-----|---------|-----------------|
| **A** | Superseded — active successor exists | Soft-deprecate → MCP test successor → remove from OAuth allowlists |
| **B** | Merge — same capability, rename/category/handler only | Update row or alias; then treat as A |
| **C** | Retire — no MCP successor; dashboard/internal only or duplicate | Keep `is_active=0`; document; delete only after confirm unused |
| **D** | Review — unclear successor or multi-step replacement | Stage 1 decision required before any delete |

---

## Canonical active catalog (49 tools)

Use **only** these names in OAuth allowlists, agent prompts, and docs.

| `tool_category` | `tool_key` | `handler_type` | Risk |
|-----------------|------------|----------------|------|
| agent | `agentsam_list_agents` | agent | low |
| agent | `agentsam_spawn_profile` | agent | medium |
| browser | `browser_content` | browser | low |
| browser | `browser_navigate` | browser | low |
| browser.automation | `agentsam_playwright` | browser | medium |
| browser.capture | `cdt_take_screenshot` | browser | low |
| browser.debug.script | `cdt_evaluate_script` | browser | medium |
| cloudflare | `cloudflare_command_registry` | cf | medium |
| code | `agentsam_codebase_scan_fix` | agent | high |
| database.d1.migrate | `agentsam_d1_migrate` | cf | medium |
| database.d1.query | `agentsam_d1_query` | cf | low |
| database.d1.write | `agentsam_d1_write` | cf | medium |
| database.supabase.query | `agentsam_supabase_query` | hyperdrive | low |
| database.supabase.user | `agentsam_supabase_project_query` | supabase | low |
| database.supabase.user | `agentsam_supabase_project_write` | supabase | medium |
| database.supabase.vector | `agentsam_supabase_vector` | hyperdrive | low |
| database.supabase.write | `agentsam_supabase_write` | hyperdrive | medium |
| deploy.stack | `agentsam_stack_deploy` | deploy | high |
| deploy.worker | `agentsam_worker_deploy` | deploy | high |
| filesystem | `agentsam_workspace_search` | filesystem | low |
| github | `agentsam_github_repo_list` | github | low |
| github.issue | `agentsam_github_issue` | github | medium |
| github.pr | `agentsam_github_pr` | github | high |
| github.read | `agentsam_github_read` | github | low |
| github.write | `agentsam_github_write` | github | high |
| integrations | `agentsam_gdrive` | integrations | low |
| knowledge.autorag | `agentsam_autorag` | hyperdrive | low |
| media | `imgx_generate_image` | media | low |
| media | `meshyai_text_to_3d` | media | low |
| media | `moviemode_export` | media | medium |
| media | `veo_generate_video` | media | low |
| memory | `agentsam_memory_manager` | memory | low |
| notifications | `agentsam_send_email` | notify | low |
| research.web | `search_web` | websearch | low |
| research.web | `web_fetch` | websearch | low |
| storage.kv | `agentsam_kv_manage` | cf | medium |
| storage.r2.delete | `agentsam_r2_delete` | cf | high |
| storage.r2.get | `agentsam_r2_get` | cf | low |
| storage.r2.put | `agentsam_r2_put` | cf | medium |
| terminal | `pty_git_commit` | git | high |
| terminal | `pty_git_diff` | git | low |
| terminal | `pty_git_log` | git | low |
| terminal | `pty_git_push` | git | high |
| terminal | `pty_git_status` | git | low |
| terminal.local | `agentsam_terminal_local` | terminal | high |
| terminal.remote | `agentsam_terminal_remote` | terminal | high |
| terminal.sandbox | `agentsam_terminal_sandbox` | terminal | high |
| ui | `agentsam_excalidraw` | canvas | low |
| workflow | `agentsam_workflow_trigger` | workflow | medium |

---

## Supersession matrix — deprecation pool (121 rows)

Columns: **Tag** · **Legacy `tool_key`** · **Category** · **Handler** · **Active** · **Degraded** · **Successor(s)** · **MCP test notes**

### Chunk 1 — D1 / platform DB aliases (do first)

| Tag | Legacy | Category | Handler | A | Dg | Successor | Test |
|-----|--------|----------|---------|--:|---:|-----------|------|
| A | `d1_query` | d1 | d1 | 0 | 1 | `agentsam_d1_query` | `SELECT 1` scoped to workspace D1 |
| A | `d1_schema` | d1 | d1 | 0 | 1 | `agentsam_d1_query` | `mode=schema` or table PRAGMA via query tool |
| A | `d1_write` | d1 | d1 | 0 | 1 | `agentsam_d1_write` | trivial `UPDATE`/`INSERT` on allowed table |
| B | `d1_explain` | d1 | d1 | 0 | 0 | `agentsam_d1_query` | Confirm explain SQL path or retire (C) |
| B | `d1_migrations_draft` | d1 | d1 | 0 | 0 | `agentsam_d1_migrate` | migration file name only |
| A | `agentsam_db_query` | platform | d1 | 0 | 1 | `agentsam_d1_query` | same as `d1_query` |
| A | `agentsam_db_schema` | platform | d1 | 0 | 1 | `agentsam_d1_query` | schema introspection |
| A | `agentsam_db_write` | platform | d1 | 0 | 1 | `agentsam_d1_write` | same as `d1_write` |

### Chunk 2 — R2 / storage (`handler_type=cf`)

| Tag | Legacy | Category | Handler | A | Dg | Successor | Test |
|-----|--------|----------|---------|--:|---:|-----------|------|
| A | `r2_read` | storage | cf | 0 | 0 | `agentsam_r2_get` | read known key |
| A | `r2_write` | storage | cf | 0 | 0 | `agentsam_r2_put` | write test object |
| A | `r2_delete` | storage.r2 | cf | 0 | 0 | `agentsam_r2_delete` | delete test object |
| A | `r2_list` | storage | cf | 0 | 1 | `agentsam_r2_get` | `operation=list` in handler_config |
| A | `r2_search` | storage | cf | 0 | 1 | `agentsam_r2_get` | `operation=search` + `query` |
| A | `agentsam_r2_read` | storage | cf | 0 | 0 | `agentsam_r2_get` | alias |
| A | `agentsam_r2_write` | storage | cf | 0 | 0 | `agentsam_r2_put` | alias |
| A | `agentsam_r2_upload` | storage | cf | 0 | 0 | `agentsam_r2_put` | upload policy path |
| A | `agentsam_r2_list` | storage | cf | 0 | 1 | `agentsam_r2_get` | list op |

### Chunk 3 — Supabase / Hyperdrive

| Tag | Legacy | Category | Handler | A | Dg | Successor | Test |
|-----|--------|----------|---------|--:|---:|-----------|------|
| A | `supabase_query` | supabase | supabase | 0 | 1 | `agentsam_supabase_query` | readonly SQL |
| A | `supabase_write` | supabase | supabase | 0 | 1 | `agentsam_supabase_write` | scoped write |
| A | `supabase_schema` | supabase | supabase | 0 | 1 | `agentsam_supabase_query` | schema mode |
| A | `supabase_vector` | supabase | supabase | 0 | 1 | `agentsam_supabase_vector` | vector search |
| A | `hyperdrive_readonly_query` | database.hyperdrive | hyperdrive | 0 | 1 | `agentsam_supabase_query` | same binding lane |
| D | `hyperdrive_schema_inspect` | database.hyperdrive | hyperdrive | 0 | 0 | `agentsam_supabase_query` | confirm schema op exists |
| D | `platform_hyperdrive_agentsam_query` | database.platform | hyperdrive | 0 | 1 | `agentsam_supabase_query` | **tenant scope audit** before deprecate |

### Chunk 4 — GitHub (unscoped `github_*` → `agentsam_github_*`)

| Tag | Legacy | Category | Handler | A | Dg | Successor | Test |
|-----|--------|----------|---------|--:|---:|-----------|------|
| A | `github_repos` | github | github | 0 | 0 | `agentsam_github_repo_list` | list repos |
| A | `github_file` | github | github | 0 | 0 | `agentsam_github_read` | get file contents |
| A | `github_create_file` | github | github | 0 | 0 | `agentsam_github_write` | create path |
| A | `github_update_file` | github | github | 0 | 0 | `agentsam_github_write` | update path |
| A | `github_create_branch` | github | github | 0 | 0 | `agentsam_github_write` | branch op in handler_config |
| A | `github_create_pr` | github | github | 0 | 0 | `agentsam_github_pr` | open PR |
| A | `github_merge_pr` | github | github | 0 | 0 | `agentsam_github_pr` | merge op |
| A | `agentsam_github_pr_create` | github | github | 0 | 0 | `agentsam_github_pr` | duplicate PR surface |
| B | `agentsam_github_issue` | — | — | 1 | 0 | *(canonical)* | — |
| B | `agentsam_github_read` | — | — | 1 | 0 | *(canonical)* | — |

### Chunk 5 — Memory / knowledge

| Tag | Legacy | Category | Handler | A | Dg | Successor | Test |
|-----|--------|----------|---------|--:|---:|-----------|------|
| A | `agentsam_memory_search` | memory | mcp | 0 | 0 | `agentsam_memory_manager` | `operation=search` |
| A | `agentsam_memory_save` | memory | mcp | 0 | 0 | `agentsam_memory_manager` | `operation=write\|upsert` |
| A | `agentsam_memory_write` | memory | mcp | 0 | 0 | `agentsam_memory_manager` | vector write op |
| A | `agentsam_memory_query` | memory | mcp | 0 | 0 | `agentsam_memory_manager` | `operation=list\|search` |
| A | `knowledge_search` | knowledge | ai | 0 | 0 | `agentsam_autorag` | RAG query |
| B | `memory_semantic_search` | knowledge | ai | 0 | 0 | `agentsam_memory_manager` | pick search vs autorag |
| C | `code_semantic_search` | knowledge | ai | 0 | 0 | `agentsam_autorag` | codebase index — verify index binding |
| C | `docs_knowledge_search` | knowledge | ai | 0 | 0 | `agentsam_autorag` | docs index |
| C | `schema_semantic_search` | knowledge | ai | 0 | 0 | `agentsam_autorag` | schema index |
| C | `deep_archive_search` | knowledge | ai | 0 | 0 | `agentsam_autorag` | archive lane |
| C | `database_assistant` | knowledge | ai | 0 | 0 | `agentsam_d1_query` + `agentsam_supabase_query` | split by lane |
| D | `rag_ingest` | knowledge | hyperdrive | 0 | 0 | — | pipeline tool; no active successor |
| D | `rag_status` | knowledge | hyperdrive | 0 | 0 | — | status only |

### Chunk 6 — Filesystem / workspace (10 rows)

All use **`handler_type=filesystem`** on successor `agentsam_workspace_search` with explicit `operation` + relative `path` (workspace_root from OAuth workspace).

| Tag | Legacy | Category | Handler | A | Dg | Successor | `operation` |
|-----|--------|----------|---------|--:|---:|-----------|-------------|
| A | `fs_read_file` | filesystem | filesystem | 0 | 0 | `agentsam_workspace_search` | `read_file` |
| A | `fs_write_file` | filesystem | filesystem | 0 | 0 | `agentsam_workspace_search` | `write_file` |
| A | `fs_edit_file` | filesystem | filesystem | 0 | 0 | `agentsam_workspace_search` | `write_file` (edit = read+write) |
| A | `workspace_read_file` | filesystem | filesystem | 0 | 0 | `agentsam_workspace_search` | `read_file` |
| A | `workspace_write_file` | filesystem | filesystem | 0 | 0 | `agentsam_workspace_search` | `write_file` |
| A | `workspace_list_files` | filesystem | filesystem | 0 | 0 | `agentsam_workspace_search` | `list_dir` |
| A | `workspace_apply_patch` | filesystem | filesystem | 0 | 0 | `agentsam_workspace_search` | `write_file` |
| A | `workspace_search_semantic` | filesystem | filesystem | 0 | 0 | `agentsam_workspace_search` | `search_files` |
| A | `pty_fs_read` | filesystem | filesystem | 0 | 0 | `agentsam_workspace_search` | `read_file` |
| A | `pty_fs_write` | filesystem | filesystem | 0 | 0 | `agentsam_workspace_search` | `write_file` |
| B | `fs_search_files` | research.code | ai | 0 | 0 | `agentsam_workspace_search` | `search_files` |

### Chunk 7 — Browser / `mybrowser`

| Tag | Legacy | Category | Handler | A | Dg | Successor | Test |
|-----|--------|----------|---------|--:|---:|-----------|------|
| A | `cdt_navigate_page` | browser | mybrowser | 0 | 0 | `browser_navigate` | URL navigation |
| A | `cdt_take_snapshot` | browser | mybrowser | 0 | 0 | `cdt_take_screenshot` | snapshot vs screenshot — verify API |
| A | `browser_close_session` | browser | mybrowser | 0 | 0 | `agentsam_playwright` | session lifecycle |
| B | `cdt_hover` | browser | mybrowser | 0 | 0 | `agentsam_playwright` | automation |
| B | `cdt_list_console_messages` | browser | mybrowser | 0 | 0 | `cdt_evaluate_script` / playwright | debug |
| B | `cdt_list_network_requests` | browser | mybrowser | 0 | 0 | `cdt_evaluate_script` | debug |
| B | `playwright_screenshot` | browser.capture | mybrowser | 0 | 0 | `cdt_take_screenshot` | capture |

### Chunk 8 — Agent / workflow / tasks

| Tag | Legacy | Category | Handler | A | Dg | Successor | Test |
|-----|--------|----------|---------|--:|---:|-----------|------|
| A | `agentsam_plan` | agent | workflow | 0 | 0 | `agentsam_workflow_trigger` | plan → workflow key |
| A | `agentsam_run` | agent | workflow | 0 | 0 | `agentsam_workflow_trigger` | run agent graph |
| A | `agentsam_get_agent` | agent | d1 | 0 | 0 | `agentsam_list_agents` | get by id via list filter |
| A | `generate_execution_plan` | workflow | mcp | 0 | 0 | `agentsam_workflow_trigger` | plan generation |
| A | `workflow_run_pipeline` | workflow | mcp | 0 | 0 | `agentsam_workflow_trigger` | pipeline trigger |
| B | `agentsam_workflow_status` | workflow | d1 | 0 | 0 | `agentsam_workflow_trigger` | read status via D1 or HTTP |
| C | `agentsam_todo_add` | tasks | d1 | 0 | 0 | `agentsam_d1_write` | todos table — confirm schema |
| C | `agentsam_todo_update` | tasks | d1 | 0 | 0 | `agentsam_d1_write` | todos table |
| D | `codemode` | agent | http | 0 | 0 | `agentsam_workflow_trigger` | codemode bridge — confirm still used |

### Chunk 9 — Deploy / terminal / integrations

| Tag | Legacy | Category | Handler | A | Dg | Successor | Test |
|-----|--------|----------|---------|--:|---:|-----------|------|
| A | `worker_deploy` | deploy | mcp | 0 | 0 | `agentsam_worker_deploy` | wrangler deploy |
| A | `list_workers` | deploy | mcp | 0 | 0 | `agentsam_worker_deploy` | list bindings |
| A | `get_worker_services` | deploy | mcp | 0 | 0 | `agentsam_worker_deploy` | services |
| A | `get_deploy_command` | deploy | mcp | 0 | 0 | `agentsam_stack_deploy` | stack command from workspace settings |
| A | `deploy_status` | deploy | mcp | 0 | 0 | `agentsam_worker_deploy` | status poll |
| A | `agentsam_deploy_status` | deploy | mcp | 0 | 0 | `agentsam_worker_deploy` | alias |
| A | `terminal_execute` | terminal | terminal | 0 | 0 | `agentsam_terminal_remote` | exec command |
| A | `terminal_run` | terminal | terminal | 0 | 0 | `agentsam_terminal_remote` | alias |
| A | `terminal_wrangler` | terminal | terminal | 0 | 0 | `agentsam_terminal_remote` | wrangler via PTY |
| A | `gdrive_list` | integrations | proxy | 0 | 0 | `agentsam_gdrive` | `folder_id=root` |
| A | `gdrive_fetch` | integrations | proxy | 0 | 0 | `agentsam_gdrive` | `file_id` set |
| D | `agentsam_worker_status` | deploy.status | mcp | 0 | 0 | `agentsam_worker_deploy` | tail/status split |
| D | `agentsam_worker_tail` | deploy.tail | http | 0 | 0 | — | observability — may stay internal |

### Chunk 10 — Platform / observability / misc

| Tag | Legacy | Category | Handler | A | Dg | Successor | Test |
|-----|--------|----------|---------|--:|---:|-----------|------|
| A | `agentsam_notify` | platform | mcp | 0 | 0 | `agentsam_send_email` | dashboard + email channel |
| C | `agentsam_health_check` | platform | d1 | 0 | 0 | — | `/health` HTTP; not MCP agent tool |
| C | `agentsam_recent_errors` | platform | d1 | 0 | 0 | `agentsam_d1_query` | `agentsam_error_log` SELECT |
| C | `agentsam_spend_summary` | platform | d1 | 0 | 0 | `agentsam_d1_query` | billing tables |
| C | `agentsam_daily_summary` | platform | mcp | 0 | 0 | — | internal digest |
| C | `agentsam_search_tools` | platform | d1 | 0 | 0 | `agentsam_list_agents` | tool discovery — replace with catalog API |
| C | `agentsam_workspace_context` | platform | d1 | 0 | 0 | `agentsam_memory_manager` | context hydrate |
| D | `mcp_dispatch` | system | mcp | 0 | 0 | — | meta; never expose to agents |
| D | `agentsam_find_and_act` | search | mcp | 0 | 0 | — | composite; decompose or retire |
| C | `http_fetch` | network | http | 0 | 0 | `web_fetch` | HTTP fetch |
| C | `agentsam_vectorize_describe` | ai | http | 0 | 0 | `agentsam_autorag` | index metadata |
| C | `ai_embed` | ai | ai | 0 | 0 | `agentsam_autorag` | embeddings |
| C | `vectorize_query` | ai | ai | 0 | 0 | `agentsam_supabase_vector` | vector query |
| C | `vectorize_upsert` | ai | ai | 0 | 0 | `agentsam_memory_manager` | vector upsert |
| D | `agentsam_cf_vectorize` | storage.vectorize | http | 0 | 0 | — | CF Vectorize admin |
| D | `customer_cloudflare_*` (8 tools) | database.customer | ai | 0 | 0 | — | customer BYO CF — product decision |
| D | `public_learning_*` (2 tools) | database.public | ai | 0 | 0 | — | public read models |
| D | `agentsam_cms_*` (3 tools) | cms | http/mcp | 0 | 0 | — | CMS editor worker lane |
| D | `resend_send_*` (2 tools) | email | http | 0 | 0 | `agentsam_send_email` | direct Resend vs notify wrapper |
| D | `imgx_edit_image`, `imgx_list_providers`, `meshyai_image_to_3d`, `social_card_generate` | media | ai | 0 | 0 | active media tools | narrow media ops |
| D | `agentsam_codebase_create` | code | mcp | 0 | 0 | `agentsam_codebase_scan_fix` | create vs scan |
| D | `human_context_list` | context | mcp | 0 | 0 | `agentsam_memory_manager` | human context rows |

---

## Chunk execution order (tomorrow)

1. **Chunk 1** — D1 aliases (8 rows, already `is_degraded=1` on several)  
2. **Chunk 2** — R2/storage (9 rows)  
3. **Chunk 3** — Supabase (7 rows)  
4. **Chunk 4** — GitHub unscoped (8 rows)  
5. **Chunk 6** — Filesystem (10 rows)  
6. **Chunk 5** — Memory/knowledge (12 rows)  
7. **Chunk 7–10** — browser, agent/workflow, deploy/terminal, platform/misc  

Per chunk SQL (soft deprecate only):

```sql
UPDATE agentsam_tools
SET is_active = 0,
    is_degraded = 1,
    tool_category = 'deprecated.' || COALESCE(NULLIF(trim(tool_category), ''), 'unknown')
WHERE tool_key IN (/* chunk keys */);
-- Optional: append to description via migration if column exists
```

Rollback:

```sql
UPDATE agentsam_tools
SET is_active = 1, is_degraded = 0,
    tool_category = replace(tool_category, 'deprecated.', '')
WHERE tool_key IN (/* chunk keys */);
```

---

## MCP smoke template (per successor)

```bash
# After OAuth connect — tools/call via Cursor or curl to mcp.inneranimalmedia.com
# Example: canonical D1 read
# tool: agentsam_d1_query
# args: { "sql": "SELECT COUNT(*) AS n FROM agentsam_tools WHERE is_active = 1" }

# Example: filesystem read
# tool: agentsam_workspace_search
# args: { "operation": "read_file", "path": "README.md" }

# Example: R2 get (cf)
# tool: agentsam_r2_get
# args: { "key": "knowledge/agentsam/test.md" }
```

Verify:

1. `tools/list` omits deprecated keys.  
2. `tools/call` on deprecated key → not found.  
3. Successor returns `{ ok: true, ... }` or structured error (not handler allowlist block).

---

## Queries (refresh matrix)

```sql
-- Canonical count
SELECT COUNT(*) FROM agentsam_tools
WHERE COALESCE(is_active,1)=1 AND COALESCE(is_degraded,0)=0;

-- Deprecation pool
SELECT tool_key, tool_category, handler_type, is_active, is_degraded
FROM agentsam_tools
WHERE COALESCE(is_active,1)<>1 OR COALESCE(is_degraded,0)<>0
ORDER BY is_degraded DESC, lower(tool_category), lower(tool_key);

-- Forbidden handler types (should be 0)
SELECT tool_key, handler_type FROM agentsam_tools
WHERE handler_type IN ('r2','builtin','workspace.reader','time');
```

---

## Related docs

- `docs/platform/worker-env-production-2026-06.md` — bindings / secrets names  
- MCP repo migrations: `442_fix_workspace_reader_handler_type.sql`, `443_merge_r2_handler_type_into_cf.sql`

**Maintainer:** update this file when a chunk completes; note migration numbers and date in git commit messages.

---

## Appendix — full deprecation pool (121 rows)

Machine-generated from D1 2026-06-02. **Succ** = proposed successor; `—` = review/retire (tag **D**). Adjust tags after Stage 1 review.

| Tag | Legacy `tool_key` | Category | Handler | Succ | Degraded |
|-----|-------------------|----------|---------|------|----------|
| D | `agentsam_cf_vectorize` | storage.vectorize | http | `—` | 0 |
| D | `agentsam_cms_publish` | cms | http | `—` | 0 |
| D | `agentsam_cms_read` | cms | mcp | `—` | 0 |
| D | `agentsam_cms_write` | cms | http | `—` | 0 |
| A | `agentsam_codebase_create` | code | mcp | `agentsam_codebase_scan_fix` | 0 |
| D | `agentsam_daily_summary` | platform | mcp | `—` | 0 |
| A | `agentsam_db_query` | platform | d1 | `agentsam_d1_query` | 1 |
| A | `agentsam_db_schema` | platform | d1 | `agentsam_d1_query` | 1 |
| A | `agentsam_db_write` | platform | d1 | `agentsam_d1_write` | 1 |
| A | `agentsam_deploy_status` | deploy | mcp | `agentsam_worker_deploy` | 0 |
| D | `agentsam_find_and_act` | search | mcp | `—` | 0 |
| A | `agentsam_get_agent` | agent | d1 | `agentsam_list_agents` | 0 |
| A | `agentsam_github_pr_create` | github | github | `agentsam_github_pr` | 0 |
| D | `agentsam_health_check` | platform | d1 | `—` | 0 |
| A | `agentsam_memory_query` | memory | mcp | `agentsam_memory_manager` | 0 |
| A | `agentsam_memory_save` | memory | mcp | `agentsam_memory_manager` | 0 |
| A | `agentsam_memory_search` | memory | mcp | `agentsam_memory_manager` | 0 |
| A | `agentsam_memory_write` | memory | mcp | `agentsam_memory_manager` | 0 |
| A | `agentsam_notify` | platform | mcp | `agentsam_send_email` | 0 |
| A | `agentsam_plan` | agent | workflow | `agentsam_workflow_trigger` | 0 |
| A | `agentsam_r2_list` | storage | cf | `agentsam_r2_get` | 1 |
| A | `agentsam_r2_read` | storage | cf | `agentsam_r2_get` | 0 |
| A | `agentsam_r2_upload` | storage | cf | `agentsam_r2_put` | 0 |
| A | `agentsam_r2_write` | storage | cf | `agentsam_r2_put` | 0 |
| A | `agentsam_recent_errors` | platform | d1 | `agentsam_d1_query` | 0 |
| A | `agentsam_run` | agent | workflow | `agentsam_workflow_trigger` | 0 |
| A | `agentsam_search_tools` | platform | d1 | `agentsam_list_agents` | 0 |
| A | `agentsam_spend_summary` | platform | d1 | `agentsam_d1_query` | 0 |
| A | `agentsam_todo_add` | tasks | d1 | `agentsam_d1_write` | 0 |
| A | `agentsam_todo_update` | tasks | d1 | `agentsam_d1_write` | 0 |
| A | `agentsam_vectorize_describe` | ai | http | `agentsam_autorag` | 0 |
| A | `agentsam_worker_status` | deploy.status | mcp | `agentsam_worker_deploy` | 0 |
| D | `agentsam_worker_tail` | deploy.tail | http | `—` | 0 |
| A | `agentsam_workflow_status` | workflow | d1 | `agentsam_workflow_trigger` | 0 |
| A | `agentsam_workspace_context` | platform | d1 | `agentsam_memory_manager` | 0 |
| A | `ai_embed` | ai | ai | `agentsam_autorag` | 0 |
| A | `browser_close_session` | browser | mybrowser | `agentsam_playwright` | 0 |
| A | `cdt_hover` | browser | mybrowser | `agentsam_playwright` | 0 |
| A | `cdt_list_console_messages` | browser | mybrowser | `agentsam_playwright` | 0 |
| A | `cdt_list_network_requests` | browser | mybrowser | `agentsam_playwright` | 0 |
| A | `cdt_navigate_page` | browser | mybrowser | `browser_navigate` | 0 |
| A | `cdt_take_snapshot` | browser | mybrowser | `cdt_take_screenshot` | 0 |
| A | `code_semantic_search` | knowledge | ai | `agentsam_autorag` | 0 |
| A | `codemode` | agent | http | `agentsam_workflow_trigger` | 0 |
| D | `customer_cloudflare_d1_readonly_query` | database.customer | ai | `—` | 0 |
| D | `customer_cloudflare_list_accounts` | database.customer | ai | `—` | 0 |
| D | `customer_cloudflare_list_d1` | database.customer | ai | `—` | 0 |
| D | `customer_supabase_list_projects` | database.customer | ai | `—` | 0 |
| D | `customer_supabase_propose_migration` | database.customer | ai | `—` | 0 |
| D | `customer_supabase_readonly_query` | database.customer | ai | `—` | 0 |
| D | `customer_supabase_schema_inspect` | database.customer | ai | `—` | 0 |
| D | `customer_supabase_select_project` | database.customer | ai | `—` | 0 |
| A | `d1_explain` | d1 | d1 | `agentsam_d1_query` | 0 |
| A | `d1_migrations_draft` | d1 | d1 | `agentsam_d1_migrate` | 0 |
| A | `d1_query` | d1 | d1 | `agentsam_d1_query` | 1 |
| A | `d1_schema` | d1 | d1 | `agentsam_d1_query` | 1 |
| A | `d1_write` | d1 | d1 | `agentsam_d1_write` | 1 |
| A | `database_assistant` | knowledge | ai | `agentsam_d1_query` | 0 |
| A | `deep_archive_search` | knowledge | ai | `agentsam_autorag` | 0 |
| A | `deploy_status` | deploy | mcp | `agentsam_worker_deploy` | 0 |
| A | `docs_knowledge_search` | knowledge | ai | `agentsam_autorag` | 0 |
| A | `fs_edit_file` | filesystem | filesystem | `agentsam_workspace_search` | 0 |
| A | `fs_read_file` | filesystem | filesystem | `agentsam_workspace_search` | 0 |
| A | `fs_search_files` | research.code | ai | `agentsam_workspace_search` | 0 |
| A | `fs_write_file` | filesystem | filesystem | `agentsam_workspace_search` | 0 |
| A | `gdrive_fetch` | integrations | proxy | `agentsam_gdrive` | 0 |
| A | `gdrive_list` | integrations | proxy | `agentsam_gdrive` | 0 |
| A | `generate_execution_plan` | workflow | mcp | `agentsam_workflow_trigger` | 0 |
| A | `get_deploy_command` | deploy | mcp | `agentsam_stack_deploy` | 0 |
| A | `get_worker_services` | deploy | mcp | `agentsam_worker_deploy` | 0 |
| A | `github_create_branch` | github | github | `agentsam_github_write` | 0 |
| A | `github_create_file` | github | github | `agentsam_github_write` | 0 |
| A | `github_create_pr` | github | github | `agentsam_github_pr` | 0 |
| A | `github_file` | github | github | `agentsam_github_read` | 0 |
| A | `github_merge_pr` | github | github | `agentsam_github_pr` | 0 |
| A | `github_repos` | github | github | `agentsam_github_repo_list` | 0 |
| A | `github_update_file` | github | github | `agentsam_github_write` | 0 |
| A | `http_fetch` | network | http | `web_fetch` | 0 |
| A | `human_context_list` | context | mcp | `agentsam_memory_manager` | 0 |
| A | `hyperdrive_readonly_query` | database.hyperdrive | hyperdrive | `agentsam_supabase_query` | 1 |
| A | `hyperdrive_schema_inspect` | database.hyperdrive | hyperdrive | `agentsam_supabase_query` | 0 |
| A | `imgx_edit_image` | media | ai | `imgx_generate_image` | 0 |
| D | `imgx_list_providers` | media | ai | `—` | 0 |
| A | `knowledge_search` | knowledge | ai | `agentsam_autorag` | 0 |
| A | `list_workers` | deploy | mcp | `agentsam_worker_deploy` | 0 |
| D | `mcp_dispatch` | system | mcp | `—` | 0 |
| A | `memory_semantic_search` | knowledge | ai | `agentsam_memory_manager` | 0 |
| A | `meshyai_image_to_3d` | media | ai | `meshyai_text_to_3d` | 0 |
| A | `platform_hyperdrive_agentsam_query` | database.platform | hyperdrive | `agentsam_supabase_query` | 1 |
| A | `playwright_screenshot` | browser.capture | mybrowser | `cdt_take_screenshot` | 0 |
| A | `pty_fs_read` | filesystem | filesystem | `agentsam_workspace_search` | 0 |
| A | `pty_fs_write` | filesystem | filesystem | `agentsam_workspace_search` | 0 |
| D | `public_learning_read_table` | database.public | ai | `—` | 0 |
| D | `public_learning_search` | database.public | ai | `—` | 0 |
| A | `r2_delete` | storage.r2 | cf | `agentsam_r2_delete` | 0 |
| A | `r2_list` | storage | cf | `agentsam_r2_get` | 1 |
| A | `r2_read` | storage | cf | `agentsam_r2_get` | 0 |
| A | `r2_search` | storage | cf | `agentsam_r2_get` | 1 |
| A | `r2_write` | storage | cf | `agentsam_r2_put` | 0 |
| D | `rag_ingest` | knowledge | hyperdrive | `—` | 0 |
| D | `rag_status` | knowledge | hyperdrive | `—` | 0 |
| A | `resend_send_broadcast` | email | http | `agentsam_send_email` | 0 |
| A | `resend_send_email` | email | http | `agentsam_send_email` | 0 |
| A | `schema_semantic_search` | knowledge | ai | `agentsam_autorag` | 0 |
| D | `social_card_generate` | media | ai | `—` | 0 |
| A | `supabase_query` | supabase | supabase | `agentsam_supabase_query` | 1 |
| A | `supabase_schema` | supabase | supabase | `agentsam_supabase_query` | 1 |
| A | `supabase_vector` | supabase | supabase | `agentsam_supabase_vector` | 1 |
| A | `supabase_write` | supabase | supabase | `agentsam_supabase_write` | 1 |
| A | `terminal_execute` | terminal | terminal | `agentsam_terminal_remote` | 0 |
| A | `terminal_run` | terminal | terminal | `agentsam_terminal_remote` | 0 |
| A | `terminal_wrangler` | terminal | terminal | `agentsam_terminal_remote` | 0 |
| A | `vectorize_query` | ai | ai | `agentsam_supabase_vector` | 0 |
| A | `vectorize_upsert` | ai | ai | `agentsam_memory_manager` | 0 |
| A | `worker_deploy` | deploy | mcp | `agentsam_worker_deploy` | 0 |
| A | `workflow_run_pipeline` | workflow | mcp | `agentsam_workflow_trigger` | 0 |
| A | `workspace_apply_patch` | filesystem | filesystem | `agentsam_workspace_search` | 0 |
| A | `workspace_list_files` | filesystem | filesystem | `agentsam_workspace_search` | 0 |
| A | `workspace_read_file` | filesystem | filesystem | `agentsam_workspace_search` | 0 |
| A | `workspace_search_semantic` | filesystem | filesystem | `agentsam_workspace_search` | 0 |
| A | `workspace_write_file` | filesystem | filesystem | `agentsam_workspace_search` | 0 |

**Appendix tag rollup:** ~98 **A** (clear successor), ~23 **D** (product/review before deprecate).
