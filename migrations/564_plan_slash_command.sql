-- 564: /plan slash command (in_app router → plan-on-demand.js).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/564_plan_slash_command.sql
--
-- Pre-565: INSERT was blocked by invalid route_key FK — used UPDATE on cmd_663a6b4cae64fd24.
-- Post-565 (565_fix_agentsam_commands_route_key_fk.sql): INSERT works; this UPDATE remains idempotent.

UPDATE agentsam_commands SET
  workspace_id = 'platform',
  display_name = 'Start plan',
  description = 'Switch to Plan mode and begin explore → questions → Monaco plan. Same as selecting Plan in the mode picker.',
  pattern = '/plan',
  pattern_type = 'exact',
  mapped_command = 'plan.start',
  category = 'planning',
  subcategory = 'plan_mode',
  risk_level = 'low',
  requires_confirmation = 0,
  show_in_slash = 1,
  show_in_palette = 1,
  sort_order = 4,
  is_active = 1,
  is_global = 1,
  execution_mode = 'agent',
  router_type = 'in_app',
  tool_key = 'plan.start',
  internal_seo = 'slash_plan_start',
  updated_at = datetime('now')
WHERE id = 'cmd_663a6b4cae64fd24';

UPDATE agentsam_commands SET
  slug = '/plan',
  tenant_id = NULL
WHERE id = 'cmd_663a6b4cae64fd24';
