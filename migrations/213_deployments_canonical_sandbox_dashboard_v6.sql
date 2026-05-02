-- Clarify canonical live sandbox IAM Explorer: dashboard-v=6 (not legacy v214+ epoch on older rows).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/213_deployments_canonical_sandbox_dashboard_v6.sql

UPDATE deployments SET
  description = 'LIVE sandbox /dashboard/agent — dashboard-v=6 (IAM Explorer; new shell + shell.css)',
  notes = 'CANONICAL LIVE: inneranimal-dashboard sandbox https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent — HTML comment dashboard-v=6 (see repo agent-dashboard/.sandbox-deploy-version). Older deployments rows showing v214–v218 are a previous counter epoch (Apr 1–2 early); they are not the current IAM Explorer shell.

' || notes
WHERE id = 'c6d57808-ebf2-4dec-8e3d-a6d585bebef9';
