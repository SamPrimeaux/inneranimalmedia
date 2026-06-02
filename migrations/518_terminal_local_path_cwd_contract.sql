-- 518: agentsam_terminal_local — honor path as cwd; document routing vs github_write.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/518_terminal_local_path_cwd_contract.sql

UPDATE agentsam_tools
SET description = 'Run one shell command on the platform VM. Optional path sets working directory (honored before workspace_root). Multi-file edits, binary assets, build, commit, and push: use terminal + git over SSH — not agentsam_github_write.',
    input_schema = '{"type":"object","properties":{"command":{"type":"string","description":"Shell command to run."},"path":{"type":"string","description":"Working directory (absolute path under the PTY workspace root). Honored as cwd unless command already starts with cd."}},"required":["command"],"additionalProperties":false}',
    output_schema = '{"type":"object","properties":{"ok":{"type":"boolean"},"cwd":{"type":"string"},"exit_code":{"type":"integer"},"stdout":{"type":"string"},"stderr":{"type":"string"},"output":{"type":"string"},"command":{"type":"string"}},"additionalProperties":true}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_local';
