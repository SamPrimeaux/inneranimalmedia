-- 800: Per-project runtime contracts on agentsam_rules_document (Cursor/.cursorrules parity).
-- Convention: rule_key = rule_{project_slug}_runtimecontract, project_id links dashboard project.
-- Global rule_agent_delivery_workflow = workflow order only — paths/deploy defer to project contracts.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/800_project_runtime_contract_rules.sql

ALTER TABLE agentsam_rules_document ADD COLUMN project_id TEXT;
ALTER TABLE agentsam_rules_document ADD COLUMN rule_key TEXT;

CREATE INDEX IF NOT EXISTS idx_agentsam_rules_project_active
  ON agentsam_rules_document(project_id, is_active)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_rules_rule_key
  ON agentsam_rules_document(rule_key, is_active)
  WHERE rule_key IS NOT NULL;

-- Platform workflow order only — no baked repo paths (those live in per-project runtime contracts).
UPDATE agentsam_rules_document
SET
  title = 'LOCKED: Agent delivery workflow order (platform)',
  body_markdown = '## Delivery workflow order (platform — all IAM build projects)

When the user has **not** opted out, Agent Sam follows this **order** for implementation tasks:

1. **Complete the work** end-to-end.
2. **Validate locally** — repo-specific checks from the **active project runtime contract** (`rule_{slug}_runtimecontract`).
3. **Commit + push** — why-focused message; never secrets.
4. **Deploy** — command and repo root from the **active project runtime contract** (or agentsam_workspace metadata).
5. **Follow up** — shipped, verified, git ref, logical next steps.

**Do not** infer repo root, deploy command, or Mac paths from this global rule.
When a chat session has a project selected, load and obey `rule_{project_slug}_runtimecontract` (D1 + vectorized R2 source).

Opt-outs: local only, no commit, no push, no deploy, plan only, review only.',
  rule_key = 'rule_agent_delivery_workflow',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_agent_delivery_workflow';

-- Main IAM platform project runtime contract (metadata-driven paths — runtime also builds from agentsam_workspace).
INSERT OR IGNORE INTO agentsam_rules_document (
  id,
  rule_key,
  project_id,
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
  'rule_inneranimalmedia_runtimecontract',
  'rule_inneranimalmedia_runtimecontract',
  '',
  '',
  'ws_inneranimalmedia',
  'Project runtime contract: inneranimalmedia (main platform)',
  '## Project runtime contract: inneranimalmedia

**SSOT:** agentsam_workspace `ws_inneranimalmedia` + wrangler.production.toml — not hardcoded operator paths in global rules.

### Repo & ship
- github_repo: resolve from agentsam_workspace (SamPrimeaux/inneranimalmedia)
- root_path: resolve from agentsam_workspace.root_path or metadata_json.repo.local_path
- validate: `npm run build:vite-only` when dashboard touched; `node --check` on edited worker `.js`
- deploy: `npm run deploy:full` from **this repo root only** (not MCP repo)
- D1: inneranimalmedia-business migrations from **this** repo

### Terminal lanes (ExecOS)
| Lane | Hostname | When |
|------|----------|------|
| local | localpty.inneranimalmedia.com (samsmac tunnel) | Mac awake at desk |
| remote | terminal.inneranimalmedia.com (GCP iam-tunnel) | Mac asleep / phone / away |
| sandbox | MY_CONTAINER pool | Heavy builds, isolated zones |

### Sandbox R2 FUSE (default — not optional)
- Writable cwd: `/mnt/r2/{workspace_r2_prefix}/{zone_slug}/`
- Persist assets under `{zone_slug}/assets/` — do not rely on ephemeral container disk alone
- Read workspace r2_prefix from workspaces.r2_prefix / agentsam_workspace metadata

### Related docs
- docs/platform/terminal-three-lane-model.md
- docs/platform/worker-env-production-2026-06.md',
  1,
  1,
  unixepoch(),
  unixepoch(),
  'always',
  'runtime_contract',
  'system',
  2,
  'Per-project SSOT — sync vectorized copy from AGENTSAM.md / .cursor/rules',
  'r2:inneranimalmedia-autorag/rules/rule_inneranimalmedia_runtimecontract.md'
);

UPDATE agentsam_rules_document
SET
  rule_key = 'rule_inneranimalmedia_runtimecontract',
  workspace_id = 'ws_inneranimalmedia',
  is_active = 1,
  apply_mode = 'always',
  trigger_type = 'system',
  sort_order = 2,
  updated_at_epoch = unixepoch()
WHERE id = 'rule_inneranimalmedia_runtimecontract';

-- MCP server — separate repo/worker (never conflate with main app).
INSERT OR IGNORE INTO agentsam_rules_document (
  id,
  rule_key,
  project_id,
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
  'rule_inneranimalmedia_mcp_runtimecontract',
  'rule_inneranimalmedia_mcp_runtimecontract',
  '',
  '',
  'ws_inneranimalmedia_mcp',
  'Project runtime contract: inneranimalmedia-mcp (MCP worker)',
  '## Project runtime contract: inneranimalmedia-mcp

**Separate repo and worker** from inneranimalmedia.com main app.

### Repo & ship
- github_repo: SamPrimeaux/inneranimalmedia-mcp-server
- root_path: resolve from agentsam_workspace `ws_inneranimalmedia_mcp`
- validate: `node --check src/index.js` — no vite/dashboard build
- deploy: `npm run deploy:full` from **MCP repo root only**
- Worker: inneranimalmedia-mcp-server @ mcp.inneranimalmedia.com

### Terminal lanes
- Prefer **remote** (GCP) or **sandbox** when Mac localpty (samsmac) is asleep.
- Never run main-app `npm run build:vite-only` from the MCP repo.',
  1,
  1,
  unixepoch(),
  unixepoch(),
  'always',
  'runtime_contract',
  'system',
  2,
  'MCP OAuth/tools lane — separate GitHub repo',
  'r2:inneranimalmedia-autorag/rules/rule_inneranimalmedia_mcp_runtimecontract.md'
);

UPDATE agentsam_rules_document
SET
  rule_key = 'rule_inneranimalmedia_mcp_runtimecontract',
  workspace_id = 'ws_inneranimalmedia_mcp',
  is_active = 1,
  updated_at_epoch = unixepoch()
WHERE id = 'rule_inneranimalmedia_mcp_runtimecontract';
