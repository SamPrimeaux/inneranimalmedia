-- Seed agentsam_rules_document + agentsam_subagent_profile for Sam (dashboard /api/agentsam/*).
-- user_key from worker resolveAgentsamUserKey: sam_primeaux
-- workspace_id '' = global (matches API default when workspace_id query param omitted)
-- Idempotent: rules UPSERT on PK id; subagents UPSERT on (user_id, workspace_id, slug)
--
-- Run (production D1):
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./scripts/d1-seed-agentsam-profiles-rules.sql

-- -----------------------------------------------------------------------------
-- Rules document (single canonical IAM + Agent Sam governance doc)
-- -----------------------------------------------------------------------------
INSERT INTO agentsam_rules_document (
  id, user_id, workspace_id, title, body_markdown, version, is_active, created_at, updated_at
) VALUES (
  'feedfacecafe0001',
  'sam_primeaux',
  '',
  'IAM — Universal sync and safety (core)',
  '# Inner Animal Media — agent rules (D1-backed)

This document mirrors repo governance. Full detail: `docs/AGENT_SAM_UNIVERSAL_SYNC_LAW.md`, `.cursorrules`, `.cursor/rules/`.

## Non-negotiables

1. **Deploy:** No `npm run deploy`, no `wrangler deploy -c wrangler.production.toml`, no production R2 puts for ship paths unless Sam types **deploy approved**.
2. **OAuth:** Do not edit `handleGoogleOAuthCallback` or `handleGitHubOAuthCallback` without line-by-line approval (locks all users out).
3. **Protected UI files:** `dashboard/agent.html` one tag at a time; `FloatingPreviewPanel.jsx` surgical edits only with line numbers first.
4. **Secrets:** No `wrangler secret put` without explicit approval. No Cloudflare account API tokens in Worker plaintext vars.
5. **MCP worker:** Deploy only from `inneranimalmedia-mcp-server/` with `npx wrangler deploy -c wrangler.toml` (never bare wrangler at repo root).

## Workers

- **inneranimalmedia** — production (`wrangler.production.toml`).
- **inneranimal-dashboard** — sandbox (`wrangler.jsonc`, sandbox R2).
- **inneranimalmedia-mcp-server** — MCP endpoint.

## D1 sync laws (short)

- **One writer per concern:** chat/transcript, `agent_telemetry`, `mcp_registered_tools` + `recordMcpToolCall`, `agent_audit_log` via helpers, `agentsam_*` via `/api/agentsam/*` only.
- **Tool names:** `mcp_registered_tools.tool_name` is the contract; change seed + worker + docs together.
- **CI/CD:** Append `cicd_events` when pipeline or CI state changes; `cicd_recent_completions` is a view (no direct INSERT).
- **Sandbox + shared D1:** Writes from sandbox Worker hit production data — treat mutating actions as production-impactful.

## After sessions

Append `docs/cursor-session-log.md` for substantive work; set `TRIGGERED_BY=agent` when agents run deploy record scripts.

## Cursor vs dashboard

Cursor `.cursor/rules` and slash commands do not auto-update this row. Edit here or in repo; keep them aligned when behavior changes.',
  1,
  1,
  datetime('now'),
  datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  body_markdown = excluded.body_markdown,
  is_active = excluded.is_active,
  version = version + 1,
  updated_at = datetime('now');

-- -----------------------------------------------------------------------------
-- Subagent profiles (dashboard Subagents plane)
-- -----------------------------------------------------------------------------
INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, slug, display_name,
  instructions_markdown, allowed_tool_globs, default_model_id, is_active, created_at, updated_at
) VALUES (
  'feedfacecafe0002',
  'sam_primeaux',
  '',
  'explore',
  'Repo explore (read-only)',
  'You are a read-only explorer. Map files, routes, and config. Use search and read tools only. Do not write files, deploy, or change secrets. Return: file paths with line ranges, risks, and one recommended next step.',
  '["read","glob","grep"]',
  NULL,
  1,
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  default_model_id = excluded.default_model_id,
  is_active = excluded.is_active,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, slug, display_name,
  instructions_markdown, allowed_tool_globs, default_model_id, is_active, created_at, updated_at
) VALUES (
  'feedfacecafe0003',
  'sam_primeaux',
  '',
  'shell',
  'Shell / wrangler (no prod deploy)',
  'You run shell commands Sam approves. Never run production deploy or `wrangler secret put` without Sam typing deploy approved or explicit secret approval. Prefer `./scripts/with-cloudflare-env.sh` for wrangler. Echo exact commands and outcomes.',
  '["bash","terminal"]',
  NULL,
  1,
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  default_model_id = excluded.default_model_id,
  is_active = excluded.is_active,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, slug, display_name,
  instructions_markdown, allowed_tool_globs, default_model_id, is_active, created_at, updated_at
) VALUES (
  'feedfacecafe0004',
  'sam_primeaux',
  '',
  'code-reviewer',
  'Code review (no rewrites)',
  'Review diffs for safety: OAuth routes, `wrangler.production.toml`, `FloatingPreviewPanel.jsx`, `agent.html`, auth handlers. Flag scope creep and missing R2 upload before deploy. Do not rewrite files; list findings with severity.',
  '["read","diff"]',
  NULL,
  1,
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  default_model_id = excluded.default_model_id,
  is_active = excluded.is_active,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, slug, display_name,
  instructions_markdown, allowed_tool_globs, default_model_id, is_active, created_at, updated_at
) VALUES (
  'feedfacecafe0005',
  'sam_primeaux',
  '',
  'd1-audit',
  'D1 / schema audit',
  'Propose SQL and migrations; never execute D1 writes until Sam approves. Prefer canonical tables in `docs/memory/AGENT_MEMORY_SCHEMA_AND_RECORDS.md`. State one writer per table concern. No destructive DDL without explicit approval.',
  '["read","sql-suggest"]',
  NULL,
  1,
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  default_model_id = excluded.default_model_id,
  is_active = excluded.is_active,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, slug, display_name,
  instructions_markdown, allowed_tool_globs, default_model_id, is_active, created_at, updated_at
) VALUES (
  'feedfacecafe0006',
  'sam_primeaux',
  '',
  'cicd-lane',
  'CI/CD promotion lane',
  'Guide sandbox-to-production: `wrangler.jsonc` inneranimal-dashboard vs `wrangler.production.toml`. R2 sandbox bucket vs agent-sam. Require human gates: PROMOTE_OK, deploy approved. Log activity narrative in `cicd_events` when changing workflow state.',
  '["read","deploy-docs"]',
  NULL,
  1,
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  default_model_id = excluded.default_model_id,
  is_active = excluded.is_active,
  updated_at = datetime('now');
