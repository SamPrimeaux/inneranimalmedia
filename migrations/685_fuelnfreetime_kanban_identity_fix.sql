-- 685: Fuel kanban — au_* assignees, per-tenant task rows, collab board owner fix.
--
-- Sam  → tenant_sam_primeaux,    au_871d920d1233cbd1
-- Connor → tenant_connor_mcneely, au_5d17673408aaebc7
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/685_fuelnfreetime_kanban_identity_fix.sql

PRAGMA foreign_keys = OFF;

UPDATE kanban_boards
SET
  owner_id = 'au_871d920d1233cbd1',
  updated_at = unixepoch()
WHERE id = 'board_fuelnfreetime';

-- ── Sam platform lane (tenant_sam_primeaux) ────────────────────────────────────
UPDATE kanban_tasks
SET
  tenant_id = 'tenant_sam_primeaux',
  assignee_id = 'au_871d920d1233cbd1',
  client_name = 'Fuel N Free Time',
  tags = 'sam,platform,dns',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"platform","owner":"au_871d920d1233cbd1"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_dns_cutover';

UPDATE kanban_tasks
SET
  tenant_id = 'tenant_sam_primeaux',
  assignee_id = 'au_871d920d1233cbd1',
  client_name = 'Fuel N Free Time',
  tags = 'sam,platform,email',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"platform","owner":"au_871d920d1233cbd1"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_gmail_oauth';

UPDATE kanban_tasks
SET
  tenant_id = 'tenant_sam_primeaux',
  assignee_id = 'au_871d920d1233cbd1',
  client_name = 'Fuel N Free Time',
  tags = 'sam,platform,worker',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"platform","owner":"au_871d920d1233cbd1"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_worker_deploy';

UPDATE kanban_tasks
SET
  tenant_id = 'tenant_sam_primeaux',
  assignee_id = 'au_871d920d1233cbd1',
  client_name = 'Fuel N Free Time',
  tags = 'sam,platform,shopify',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"platform","owner":"au_871d920d1233cbd1"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_shopify_bridge';

UPDATE kanban_tasks
SET
  tenant_id = 'tenant_sam_primeaux',
  assignee_id = 'au_871d920d1233cbd1',
  client_name = 'Fuel N Free Time',
  tags = 'sam,cms,collab',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"platform","owner":"au_871d920d1233cbd1"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_cms_collab';

UPDATE kanban_tasks
SET
  tenant_id = 'tenant_sam_primeaux',
  assignee_id = 'au_871d920d1233cbd1',
  client_name = 'Fuel N Free Time',
  tags = 'sam,mcp,connor',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"platform","owner":"au_871d920d1233cbd1"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_mcp_connor';

-- ── Connor Stripe lane (tenant_connor_mcneely) ─────────────────────────────────
UPDATE kanban_tasks
SET
  tenant_id = 'tenant_connor_mcneely',
  assignee_id = 'au_5d17673408aaebc7',
  client_name = 'Fuel N Free Time',
  tags = 'connor,stripe,setup',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"stripe","owner":"au_5d17673408aaebc7"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_stripe_connect';

UPDATE kanban_tasks
SET
  tenant_id = 'tenant_connor_mcneely',
  assignee_id = 'au_5d17673408aaebc7',
  client_name = 'Fuel N Free Time',
  tags = 'connor,stripe,catalog',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"stripe","owner":"au_5d17673408aaebc7"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_stripe_catalog';

UPDATE kanban_tasks
SET
  tenant_id = 'tenant_connor_mcneely',
  assignee_id = 'au_5d17673408aaebc7',
  client_name = 'Fuel N Free Time',
  tags = 'connor,stripe,checkout',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"stripe","owner":"au_5d17673408aaebc7"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_stripe_checkout';

UPDATE kanban_tasks
SET
  tenant_id = 'tenant_connor_mcneely',
  assignee_id = 'au_5d17673408aaebc7',
  client_name = 'Fuel N Free Time',
  tags = 'connor,stripe,webhooks',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"stripe","owner":"au_5d17673408aaebc7"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_stripe_webhooks';

UPDATE kanban_tasks
SET
  tenant_id = 'tenant_connor_mcneely',
  assignee_id = 'au_5d17673408aaebc7',
  client_name = 'Fuel N Free Time',
  tags = 'connor,stripe,portal',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"stripe","owner":"au_5d17673408aaebc7"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_stripe_portal';

UPDATE kanban_tasks
SET
  tenant_id = 'tenant_connor_mcneely',
  assignee_id = 'au_5d17673408aaebc7',
  client_name = 'Fuel N Free Time',
  tags = 'connor,stripe,live',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"stripe","owner":"au_5d17673408aaebc7","blocked_by":"kt_fnft_dns_cutover"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_stripe_live_keys';

PRAGMA foreign_keys = ON;
