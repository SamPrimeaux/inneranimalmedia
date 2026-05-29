-- Platform-global webhook MCP workflow catalog (no tenant/workspace scope)
UPDATE agentsam_mcp_workflows
SET tenant_id = NULL, workspace_id = NULL
WHERE workflow_key LIKE 'wf_on_%';

-- Platform webhook registry endpoints (tenant resolved at runtime from payload/auth)
UPDATE agentsam_webhooks
SET tenant_id = NULL, workspace_id = NULL
WHERE provider IN (
  'github', 'cursor', 'openai', 'anthropic',
  'supabase', 'resend', 'cloudflare', 'internal', 'stripe'
);

INSERT OR IGNORE INTO agentsam_webhooks (
  id, provider, slug, name, endpoint_url, signature_header,
  workflow_key, is_active, tenant_id, workspace_id, allowed_events
) VALUES (
  'wh_stripe_main',
  'stripe',
  'stripe-main',
  'Stripe — Billing',
  'https://inneranimalmedia.com/api/webhooks/stripe',
  'Stripe-Signature',
  'wf_on_stripe',
  1,
  NULL,
  NULL,
  '["payment_intent.succeeded","payment_intent.failed","customer.subscription.created","customer.subscription.deleted","invoice.paid","invoice.payment_failed"]'
);
