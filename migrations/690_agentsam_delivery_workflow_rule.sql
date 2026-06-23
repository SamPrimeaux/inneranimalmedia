-- 690: In-app Agent Sam delivery workflow rule (IAM build workspaces).
-- Runtime also injects repo-specific deploy via src/core/agent-delivery-workflow.js.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/690_agentsam_delivery_workflow_rule.sql

INSERT OR IGNORE INTO agentsam_rules_document (
  id,
  user_id,
  workspace_id,
  title,
  body_markdown,
  version,
  is_active,
  created_at_epoch,
  updated_at_epoch,
  apply_mode,
  rule_type,
  trigger_type,
  sort_order,
  notes,
  source_stored
) VALUES (
  'rule_agent_delivery_workflow',
  '',
  '',
  'LOCKED: Agent delivery workflow (implement → validate → commit → deploy)',
  '## Delivery workflow (IAM build workspaces)

When the active workspace is an IAM-managed build lane (inneranimalmedia, fuelnfreetime, companionscpas, or SamPrimeaux/inneranimalmedia* github repo), Agent Sam must follow this order unless the user opts out:

1. **Complete the work** end-to-end.
2. **Validate locally** — build/lint/check touched files before commit.
3. **Commit + push** — why-focused message; never secrets.
4. **Deploy** — inneranimalmedia: `npm run deploy:full` from repo root; MCP server: `cd inneranimalmedia-mcp-server && npm run deploy:full`; apply D1 migrations separately when SQL changed.
5. **Follow up** — shipped, verified, git ref, logical next steps.

Opt-outs: local only, no commit, no push, no deploy, plan only, review only.

Do not ask permission to commit/deploy when no opt-out was given. Never force-push main.

For workspaces without a github repo or ship profile, do **not** assume this workflow.',
  1,
  1,
  unixepoch(),
  unixepoch(),
  'always',
  'operations',
  'system',
  5,
  'Mirrors ~/.cursor/rules/agent-delivery-workflow.mdc for in-app Agent Sam',
  'd1:agentsam_rules_document:rule_agent_delivery_workflow'
);

UPDATE agentsam_rules_document
SET
  title = 'LOCKED: Agent delivery workflow (implement → validate → commit → deploy)',
  body_markdown = '## Delivery workflow (IAM build workspaces)

When the active workspace is an IAM-managed build lane (inneranimalmedia, fuelnfreetime, companionscpas, or SamPrimeaux/inneranimalmedia* github repo), Agent Sam must follow this order unless the user opts out:

1. **Complete the work** end-to-end.
2. **Validate locally** — build/lint/check touched files before commit.
3. **Commit + push** — why-focused message; never secrets.
4. **Deploy** — inneranimalmedia: `npm run deploy:full` from repo root; MCP server: `cd inneranimalmedia-mcp-server && npm run deploy:full`; apply D1 migrations separately when SQL changed.
5. **Follow up** — shipped, verified, git ref, logical next steps.

Opt-outs: local only, no commit, no push, no deploy, plan only, review only.

Do not ask permission to commit/deploy when no opt-out was given. Never force-push main.

For workspaces without a github repo or ship profile, do **not** assume this workflow.',
  is_active = 1,
  apply_mode = 'always',
  trigger_type = 'system',
  sort_order = 5,
  updated_at_epoch = unixepoch()
WHERE id = 'rule_agent_delivery_workflow';
