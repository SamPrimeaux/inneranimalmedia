-- 691: Clarify MCP workspace delivery workflow — separate repo/worker from inneranimalmedia.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/691_mcp_workspace_delivery_workflow_clarity.sql

UPDATE agentsam_rules_document
SET
  body_markdown = '## Delivery workflow (IAM build workspaces)

When the active workspace is an IAM-managed build lane, Agent Sam must follow this order unless the user opts out:

1. **Complete the work** end-to-end in **this workspace repo root only**.
2. **Validate locally** — repo-specific checks (see workspace profile).
3. **Commit + push** — why-focused message; never secrets.
4. **Deploy** — repo-specific command from workspace root.
5. **Follow up** — shipped, verified, git ref, logical next steps.

### Main platform (`inneranimalmedia` workspace)
- Repo: `SamPrimeaux/inneranimalmedia` @ `/Users/samprimeaux/inneranimalmedia`
- Validate: `npm run build:vite-only` when dashboard touched; `node --check` on worker `.js`
- Deploy: `npm run deploy:full` from main repo root
- D1 migrations: inneranimalmedia-business via wrangler from **this** repo

### MCP server (`inneranimalmedia-mcp` workspace) — **separate repo**
- Repo: `SamPrimeaux/inneranimalmedia-mcp-server` @ `/Users/samprimeaux/inneranimalmedia-mcp-server`
- Worker: `inneranimalmedia-mcp-server` @ `mcp.inneranimalmedia.com`
- **NOT** a subdirectory of inneranimalmedia — never edit/deploy MCP from the main app repo
- Validate: `node --check src/index.js` (no vite/dashboard build)
- Deploy: `npm run deploy:full` from **MCP repo root only**

### Collab workspaces (fuelnfreetime, companionscpas, …)
- Use workspace `root_path`, `github_repo`, and worker metadata — do not assume main platform deploy.

Opt-outs: local only, no commit, no push, no deploy, plan only, review only.',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_agent_delivery_workflow';

UPDATE agentsam_workspace
SET
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.deploy_patterns.full', 'npm run deploy:full',
    '$.deploy_patterns.validate_worker', 'node --check src/index.js',
    '$.repo.local_path', '/Users/samprimeaux/inneranimalmedia-mcp-server',
    '$.repo.remote', 'https://github.com/SamPrimeaux/inneranimalmedia-mcp-server',
    '$.workspace_kind', 'mcp_server'
  ),
  root_path = COALESCE(NULLIF(TRIM(root_path), ''), '/Users/samprimeaux/inneranimalmedia-mcp-server'),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia_mcp';
