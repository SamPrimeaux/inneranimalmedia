-- 684: Fuel N Free Time — kanban build lane (Sam platform + Connor Stripe).
-- Board/columns may already exist from auto-heal; this migration is idempotent.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/684_fuelnfreetime_kanban_build_lane.sql

PRAGMA foreign_keys = OFF;

-- ── Board ──────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO kanban_boards (
  id, tenant_id, workspace_id, project_id, owner_id, name, description,
  board_type, config_json, is_active, created_at, updated_at
) VALUES (
  'board_fuelnfreetime',
  'tenant_sam_primeaux',
  'ws_fuelnfreetime',
  'proj_fuelnfreetime',
  'usr_sam_iam',
  'Fuel N Free Time Build',
  'Sam = platform/infra/CMS. Connor = Stripe payments lane.',
  'workspace',
  '{"project_id":"proj_fuelnfreetime","lane":"build"}',
  1,
  unixepoch(),
  unixepoch()
);

UPDATE kanban_boards
SET
  project_id = 'proj_fuelnfreetime',
  owner_id = COALESCE(owner_id, 'usr_sam_iam'),
  name = 'Fuel N Free Time Build',
  description = 'Sam = platform/infra/CMS. Connor = Stripe payments lane.',
  board_type = 'workspace',
  config_json = '{"project_id":"proj_fuelnfreetime","lane":"build"}',
  is_active = 1,
  updated_at = unixepoch()
WHERE id = 'board_fuelnfreetime';

-- ── Columns ──────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO kanban_columns (id, tenant_id, board_id, name, position, config_json, created_at, updated_at) VALUES
  ('kcol_fnft_backlog',  'tenant_sam_primeaux', 'board_fuelnfreetime', 'Backlog',             0, '{"status":"backlog"}',             unixepoch(), unixepoch()),
  ('kcol_fnft_todo',     'tenant_sam_primeaux', 'board_fuelnfreetime', 'To Do',               1, '{"status":"todo"}',                unixepoch(), unixepoch()),
  ('kcol_fnft_inprog',   'tenant_sam_primeaux', 'board_fuelnfreetime', 'In Progress',         2, '{"status":"in_progress"}',         unixepoch(), unixepoch()),
  ('kcol_fnft_testing',  'tenant_sam_primeaux', 'board_fuelnfreetime', 'Testing',             3, '{"status":"testing"}',             unixepoch(), unixepoch()),
  ('kcol_fnft_approval', 'tenant_sam_primeaux', 'board_fuelnfreetime', 'Awaiting Approval',   4, '{"status":"awaiting_approval"}',   unixepoch(), unixepoch()),
  ('kcol_fnft_complete', 'tenant_sam_primeaux', 'board_fuelnfreetime', 'Complete',            5, '{"status":"complete"}',          unixepoch(), unixepoch()),
  ('kcol_fnft_blocked',  'tenant_sam_primeaux', 'board_fuelnfreetime', 'Blocked',             6, '{"status":"blocked"}',             unixepoch(), unixepoch());

-- ── Existing Sam infra tasks (assign + tag) ────────────────────────────────────
UPDATE kanban_tasks
SET
  assignee_id = 'sam@inneranimalmedia.com',
  client_name = 'Fuel N Free Time',
  tags = 'sam,platform,dns',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"platform","owner":"sam"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_dns_cutover';

UPDATE kanban_tasks
SET
  assignee_id = 'sam@inneranimalmedia.com',
  client_name = 'Fuel N Free Time',
  tags = 'sam,platform,email',
  meta_json = '{"project_id":"proj_fuelnfreetime","lane":"platform","owner":"sam"}',
  updated_at = unixepoch()
WHERE id = 'kt_fnft_gmail_oauth';

-- ── Sam — platform / build lane ────────────────────────────────────────────────
INSERT OR REPLACE INTO kanban_tasks (
  id, tenant_id, board_id, column_id, title, description, category, priority,
  assignee_id, client_name, tags, meta_json, position, created_at, updated_at
) VALUES
(
  'kt_fnft_worker_deploy',
  'tenant_sam_primeaux',
  'board_fuelnfreetime',
  'kcol_fnft_todo',
  'Deploy fuelnfreetime Worker + D1/R2/KV bindings',
  'Production Worker on fuelnfreetime.com with D1 (9fd6ff92), R2 bucket fuelnfreetime, and wrangler secrets aligned to ws_fuelnfreetime.',
  'worker',
  'high',
  'sam@inneranimalmedia.com',
  'Fuel N Free Time',
  'sam,platform,worker',
  '{"project_id":"proj_fuelnfreetime","lane":"platform","owner":"sam"}',
  10,
  unixepoch(),
  unixepoch()
),
(
  'kt_fnft_shopify_bridge',
  'tenant_sam_primeaux',
  'board_fuelnfreetime',
  'kcol_fnft_todo',
  'Shopify storefront → Worker API bridge',
  'Headless cart/checkout hooks from Shopify theme into fuelnfreetime Worker. Coordinate SKU + inventory with Connor Stripe price IDs.',
  'api',
  'high',
  'sam@inneranimalmedia.com',
  'Fuel N Free Time',
  'sam,platform,shopify',
  '{"project_id":"proj_fuelnfreetime","lane":"platform","owner":"sam"}',
  11,
  unixepoch(),
  unixepoch()
),
(
  'kt_fnft_cms_collab',
  'tenant_sam_primeaux',
  'board_fuelnfreetime',
  'kcol_fnft_inprog',
  'CMS live-edit smoke test (ws_fuelnfreetime)',
  'Validate PrimeTech CMS pages, live-edit DO session, and theme draft flow for fuelnfreetime.com from /dashboard/cms on Fuel workspace.',
  'content',
  'medium',
  'sam@inneranimalmedia.com',
  'Fuel N Free Time',
  'sam,cms,collab',
  '{"project_id":"proj_fuelnfreetime","lane":"platform","owner":"sam"}',
  12,
  unixepoch(),
  unixepoch()
),
(
  'kt_fnft_mcp_connor',
  'tenant_sam_primeaux',
  'board_fuelnfreetime',
  'kcol_fnft_testing',
  'Verify Connor MCP + GitHub scope on Fuel workspace',
  'Connor can OAuth (Claude/ChatGPT), query Fuel D1, read/write SamPrimeaux/fuelnfreetime, and list R2 without IAM superadmin buckets.',
  'system',
  'medium',
  'sam@inneranimalmedia.com',
  'Fuel N Free Time',
  'sam,mcp,connor',
  '{"project_id":"proj_fuelnfreetime","lane":"platform","owner":"sam"}',
  13,
  unixepoch(),
  unixepoch()
);

-- ── Connor — Stripe payments lane ──────────────────────────────────────────────
INSERT OR REPLACE INTO kanban_tasks (
  id, tenant_id, board_id, column_id, title, description, category, priority,
  assignee_id, client_name, tags, meta_json, position, created_at, updated_at
) VALUES
(
  'kt_fnft_stripe_connect',
  'tenant_sam_primeaux',
  'board_fuelnfreetime',
  'kcol_fnft_todo',
  'Create / link Stripe account (Test mode)',
  'Fuel N Free Time Stripe account in Test mode. Invite Sam as admin. Document dashboard URL + connected business profile.',
  'client',
  'urgent',
  'connordmcneely@leadershiplegacydigital.com',
  'Fuel N Free Time',
  'connor,stripe,setup',
  '{"project_id":"proj_fuelnfreetime","lane":"stripe","owner":"connor"}',
  20,
  unixepoch(),
  unixepoch()
),
(
  'kt_fnft_stripe_catalog',
  'tenant_sam_primeaux',
  'board_fuelnfreetime',
  'kcol_fnft_todo',
  'Define Stripe Products, Prices, and tax settings',
  'Map adventure packages / memberships to Stripe Products + recurring or one-time Prices. Share price_ IDs with Sam for Worker checkout mapping.',
  'client',
  'high',
  'connordmcneely@leadershiplegacydigital.com',
  'Fuel N Free Time',
  'connor,stripe,catalog',
  '{"project_id":"proj_fuelnfreetime","lane":"stripe","owner":"connor"}',
  21,
  unixepoch(),
  unixepoch()
),
(
  'kt_fnft_stripe_checkout',
  'tenant_sam_primeaux',
  'board_fuelnfreetime',
  'kcol_fnft_inprog',
  'Implement Stripe Checkout Session API in Worker',
  'POST /api/stripe/checkout creates session from price IDs. Success/cancel URLs on fuelnfreetime.com. Use Test keys in wrangler secrets.',
  'api',
  'high',
  'connordmcneely@leadershiplegacydigital.com',
  'Fuel N Free Time',
  'connor,stripe,checkout',
  '{"project_id":"proj_fuelnfreetime","lane":"stripe","owner":"connor"}',
  22,
  unixepoch(),
  unixepoch()
),
(
  'kt_fnft_stripe_webhooks',
  'tenant_sam_primeaux',
  'board_fuelnfreetime',
  'kcol_fnft_todo',
  'Wire Stripe webhooks to fuelnfreetime Worker',
  'Handle checkout.session.completed, invoice.paid, customer.subscription.updated/deleted. Verify signing secret + idempotent D1 order rows.',
  'api',
  'high',
  'connordmcneely@leadershiplegacydigital.com',
  'Fuel N Free Time',
  'connor,stripe,webhooks',
  '{"project_id":"proj_fuelnfreetime","lane":"stripe","owner":"connor"}',
  23,
  unixepoch(),
  unixepoch()
),
(
  'kt_fnft_stripe_portal',
  'tenant_sam_primeaux',
  'board_fuelnfreetime',
  'kcol_fnft_backlog',
  'Add Stripe Customer Portal for account management',
  'Billing portal link for subscription changes, receipts, and payment method updates. Embed in member dashboard when CMS member area ships.',
  'client',
  'medium',
  'connordmcneely@leadershiplegacydigital.com',
  'Fuel N Free Time',
  'connor,stripe,portal',
  '{"project_id":"proj_fuelnfreetime","lane":"stripe","owner":"connor"}',
  24,
  unixepoch(),
  unixepoch()
),
(
  'kt_fnft_stripe_live_keys',
  'tenant_sam_primeaux',
  'board_fuelnfreetime',
  'kcol_fnft_approval',
  'Enable Stripe Live mode + rotate production keys',
  'Blocked until DNS cutover (kt_fnft_dns_cutover). Connor enables Live mode, Sam stores STRIPE_SECRET_KEY + webhook secret in Worker.',
  'client',
  'urgent',
  'connordmcneely@leadershiplegacydigital.com',
  'Fuel N Free Time',
  'connor,stripe,live',
  '{"project_id":"proj_fuelnfreetime","lane":"stripe","owner":"connor","blocked_by":"kt_fnft_dns_cutover"}',
  25,
  unixepoch(),
  unixepoch()
);

PRAGMA foreign_keys = ON;
