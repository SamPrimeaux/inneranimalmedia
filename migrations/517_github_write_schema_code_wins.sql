-- 517: agentsam_github_write — canonical upsert schema (sha optional, operation hint).
-- Code override in mcp-github-write-schema.js wins at tools/list; D1 kept in sync here.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/517_github_write_schema_code_wins.sql

UPDATE agentsam_tools
SET
  description = 'Create or update one file in a GitHub repo via OAuth. Omit sha for NEW files; include sha only when updating and you already read it. Optional operation: create|update|upsert (default upsert). Multi-file scaffolds → agentsam_terminal_run + git over SSH.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"path":{"type":"string","description":"File path in repo"},"content":{"type":"string","description":"Full file content"},"message":{"type":"string","description":"Commit message"},"sha":{"type":"string","description":"Optional — only for updates when already known from read. Omit for new files."},"branch":{"type":"string","default":"main"},"repo":{"type":"string","description":"owner/repo"},"operation":{"type":"string","enum":["create","update","upsert"],"default":"upsert","description":"create=new path; update=existing (sha recommended); upsert=create or update"}},"required":["path","content","message"]}',
  handler_config = '{"handler":"github","auth_source":"user_oauth_tokens","provider":"github","repo_field":"workspace.github_repo","operation":"upsert_file"}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_write';
