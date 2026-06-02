-- 519: MCP terminal routing contract — local vs remote args, output shape, agent rule.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/519_mcp_terminal_routing_contract.sql

UPDATE agentsam_tools
SET description = 'Single text-file create or update via GitHub Contents API only. Omit sha for new files. Do not use for multi-file edits, binary assets, or scaffolds — use agentsam_terminal_local + git.',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_write';

UPDATE agentsam_tools
SET description = 'Platform VM shell: multi-file repo work, binary assets, build, commit, and push. Args: command + optional path only (never target_id).',
    input_schema = '{"type":"object","properties":{"command":{"type":"string"},"path":{"type":"string","description":"Optional cwd under PTY workspace; honored before workspace_root."}},"required":["command"],"additionalProperties":false}',
    output_schema = '{"type":"object","properties":{"cwd":{"type":"string"},"cwd_source":{"type":"string"},"exit_code":{"type":"integer"},"stdout":{"type":"string"},"stderr":{"type":"string"},"output":{"type":"string"},"command":{"type":"string"},"recovery_hints":{"type":"array"}},"additionalProperties":true}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_local';

UPDATE agentsam_tools
SET description = 'Remote terminal target for shell commands. Args: command + optional target_id (never mix target_id into agentsam_terminal_local).',
    input_schema = '{"type":"object","properties":{"command":{"type":"string"},"target_id":{"type":"string","description":"terminal_connections id for this workspace."}},"required":["command"],"additionalProperties":false}',
    output_schema = '{"type":"object","properties":{"cwd":{"type":"string"},"cwd_source":{"type":"string"},"exit_code":{"type":"integer"},"stdout":{"type":"string"},"stderr":{"type":"string"},"output":{"type":"string"},"command":{"type":"string"},"recovery_hints":{"type":"array"}},"additionalProperties":true}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_remote';

UPDATE agentsam_rules_document
SET
  body_markdown = '## RULE: MCP GitHub + terminal routing

**ID:** rule_github_ssh_git_workflow

### Tool routing (non-negotiable)
| Task | Tool |
|------|------|
| Read file / SHA | `agentsam_github_read` |
| One UTF-8 text file create/update | `agentsam_github_write` (omit sha on create) |
| Multi-file, binary assets, build, commit, push | `agentsam_terminal_local` + git over SSH |

### Terminal args
- `agentsam_terminal_local`: `command` + optional `path` only — **never** `target_id`
- `agentsam_terminal_remote`: `command` + optional `target_id`
- `path` must be honored as cwd; responses include `cwd`, `cwd_source`, `exit_code`, `stdout`, `stderr`

### Recovery (terminal output)
- HTTPS git push 403 / permission denied → suggest SSH remote (`git@github.com:OWNER/REPO.git`) when authorized, retry push
- Missing native optional bindings (`@rolldown/binding`, etc.) → `npm i` then rebuild before code changes

### API write (narrow)
- `agentsam_github_write`: single text path via Contents API only
- Everything else mutating → terminal git over SSH (prefer SSH remotes on PTY; no gh CLI required)',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_github_ssh_git_workflow';
