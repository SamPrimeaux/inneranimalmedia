-- 185: mcp_workflows row — IAM workspace shell (System B; no System A).
-- Complements wf_agent_code_promotion (184): UI shell, cms_themes, TOOLS R2, then sandbox/prod gates.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/185_mcp_workflow_iam_workspace_shell.sql

INSERT OR IGNORE INTO mcp_workflows (
  id,
  tenant_id,
  name,
  description,
  category,
  trigger_type,
  trigger_config_json,
  steps_json,
  timeout_seconds,
  requires_approval,
  estimated_cost_usd,
  status,
  run_count,
  success_count,
  created_at,
  updated_at
) VALUES (
  'wf_iam_workspace_shell',
  'tenant_sam_primeaux',
  'IAM workspace shell',
  'Single-file workspace chrome: IAM Explorer, editor tabs, agent column, status bar. Theme from cms_themes (e.g. solarized-dark). Optional publish to TOOLS code/ then sandbox R2 then prod.',
  'dashboard_shell',
  'manual',
  '{}',
  '[
    {"name":"author_shell_html","step_key":"author_shell","description":"dashboard/*.html or agent-generated TOOLS code/"},
    {"name":"theme_from_cms","step_key":"cms_theme","description":"GET /api/settings/theme?slug= maps cms_themes.config.cssVars"},
    {"name":"publish_tools_r2","step_key":"r2_tools","description":"Optional: tools bucket code/ for public URL"},
    {"name":"promote_sandbox_prod","step_key":"cidi","description":"agent-sam-sandbox-cidi validate then promote-to-prod"}
  ]',
  7200,
  0,
  0,
  'active',
  0,
  0,
  unixepoch(),
  unixepoch()
);
