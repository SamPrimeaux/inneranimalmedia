-- Backfill git_hash, changed_files, description, notes for recent inneranimal-dashboard sandbox deployments (2026-04-01/02).
-- Version context: rows with v214–v218 are historical (earlier deploy counter). Canonical LIVE sandbox IAM Explorer is
-- dashboard-v=6 in HTML (<!-- dashboard-v:6 -->) for https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent ;
-- see deployments.id c6d57808-ebf2-4dec-8e3d-a6d585bebef9 and migration 213.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/212_deployments_backfill_git_hash_notes.sql

UPDATE deployments SET
  git_hash = 'dd6cb2465b8a5dd4cafb14792f3aa4e75aaf0ac0',
  changed_files = 'agent-dashboard/agent-dashboard/package.json
agent-dashboard/package-lock.json
agent-dashboard/agent-dashboard/components/WelcomeLauncher.tsx (local: import useEffect)
agent-dashboard/agent-dashboard/index.html (local: removed importmap; React minified error 525 fix)
agent-dashboard/agent-dashboard/vite.config.ts (local: resolve.dedupe react/react-dom)
worker.js (local: SANDBOX_SIGNIN_FALLBACK_URL fetch for / and /auth/*)
wrangler.jsonc (local: SANDBOX_SIGNIN_FALLBACK_URL var)
R2: agent-sam-sandbox-cicd/static/dashboard/agent/** + static/dashboard/agent.html (dashboard-v=6)',
  description = '2026-04-02 PM: sandbox IAM Explorer v6 live after R2 retry',
  notes = 'Retry deploy after first run hit R2 503 mid-manifest (oc-FR chunk). Build includes local fixes not yet on main: remove index.html importmap (duplicate React), WelcomeLauncher useEffect import, vite dedupe, optional sandbox sign-in HTML proxy. Worker c6d57808-ebf2-4dec-8e3d-a6d585bebef9 is current live for https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent . Base commit dd6cb24 (wrangler removed from workspace; single esbuild).'
WHERE id = 'c6d57808-ebf2-4dec-8e3d-a6d585bebef9';

UPDATE deployments SET
  git_hash = 'dd6cb2465b8a5dd4cafb14792f3aa4e75aaf0ac0',
  changed_files = 'agent-dashboard/agent-dashboard/package.json
agent-dashboard/package-lock.json
(Vite dist -> R2 static/dashboard/agent/; dashboard-v=4)',
  description = '2026-04-02 PM: first full build+upload attempt; R2 upload failed partway',
  notes = 'Same tree as dd6cb24. npm run build:vite-only succeeded. R2 multipart upload failed with 503 Unable to authenticate request on asset oc-FR-POXYY2M6-w7-U6nNB.js; many files uploaded before failure. Worker deploy still produced version 710a822a-a459-4c4e-8f39-fa98fa5b4c26. Operator re-ran deploy-sandbox.sh --skip-build to finish uploads and align bucket with worker.'
WHERE id = '710a822a-a459-4c4e-8f39-fa98fa5b4c26';

UPDATE deployments SET
  git_hash = 'dd6cb2465b8a5dd4cafb14792f3aa4e75aaf0ac0',
  changed_files = 'agent-dashboard/** (Vite bundle)
scripts/deploy-sandbox.sh (R2 put loop)
worker.js
wrangler.jsonc',
  description = '2026-04-02 afternoon: sandbox dashboard v3 push',
  notes = 'inneranimal-dashboard worker + agent-dashboard dist uploaded to agent-sam-sandbox-cicd under static/dashboard/agent/. dashboard-v=3 in HTML comment. Part of same-day recovery work before v4/v6 attempts.'
WHERE id = '4f85f3d3-a1a9-41ce-b2ab-0c09524e7990';

UPDATE deployments SET
  git_hash = '8c4b34630537ea6a60d377ef7fe106c9428a1ffb',
  changed_files = 'scripts/deploy-sandbox.sh',
  description = '2026-04-02 early morning: deploy-sandbox protected key / syntax fix',
  notes = 'Deploy after 8c4b346 (clean deploy-sandbox.sh protected key skip syntax; remove dangling --file args). dashboard-v=v218 on agent bundle. Sandbox worker refresh.'
WHERE id = '3b2b1c94-eb6a-4c8a-900a-7c2fa8873600';

UPDATE deployments SET
  git_hash = '6b02e20f865a05af49201e4be3d41b54488ef1af',
  changed_files = 'Multiple: merge agentsam-clean; worker.js; agent-dashboard; wrangler; docs (see merge commit)',
  description = '2026-04-02 01:07 UTC: post-merge sandbox deploy',
  notes = 'Late night merge window (agentsam-clean into main, conflicts resolved). Sandbox pipeline + static/dashboard/agent keys protected. v217 dashboard marker.'
WHERE id = '97194717-ec2b-4ddc-ac8b-1804d4e8c817';

UPDATE deployments SET
  git_hash = '97c283f03f1b16d412de3b88967bceac3066ad71',
  changed_files = 'agentsam-clean/source/worker.js (terminal socket-url, themes, workspaces, context-picker)',
  description = '2026-04-01 evening: meauxcad shell v1.2.1-sandbox wiring',
  notes = 'feat: wire terminal socket-url, themes/active, workspaces, context-picker, chat alias. Sandbox inneranimal-dashboard + dashboard bundle. v216.'
WHERE id = '96f2237f-12f3-44c1-9412-0a2cb25f2768';

UPDATE deployments SET
  git_hash = 'b6f2e4f56a5380c8755e54b7ac5906a4a076dd69',
  changed_files = 'agent-dashboard workspace (meauxcad shell unified context picker)',
  description = '2026-04-01: shell v1.2.1-sandbox context picker update',
  notes = 'update: meauxcad shell v1.2.1-sandbox with unified context picker. R2 dashboard assets + worker. v215.'
WHERE id = 'a99a4b9c-a39b-4a4d-ae18-726de7ec261b';

UPDATE deployments SET
  git_hash = 'cc2fcf16ec0e4fcc069ddffe3e218e691fbff8d3',
  changed_files = 'migrations (D1 r2_bucket_bindings); worker/dashboard as deployed',
  description = '2026-04-01 PM: CIDI R2 bucket registry migration + sandbox',
  notes = 'chore(d1): r2_bucket_bindings + r2_bucket_list CIDI buckets (migration 210 context). Sandbox deploy same afternoon. v214.'
WHERE id = '087af94d-2e00-45b4-82c9-876c2d9db894';

UPDATE deployments SET
  git_hash = 'cc2fcf16ec0e4fcc069ddffe3e218e691fbff8d3',
  changed_files = 'migrations/210*.sql (if present); worker.js; dashboard dist',
  description = '2026-04-01 PM: repeat sandbox deploy v214',
  notes = 'Second deploy in short window; same baseline as sibling row (migration 210 era). Full R2 upload + worker. Triggered_by sandbox_auto.'
WHERE id = 'c5f76302-639a-44ef-a73d-1adb556533d9';

UPDATE deployments SET
  git_hash = 'cc2fcf16ec0e4fcc069ddffe3e218e691fbff8d3',
  changed_files = 'inneranimal-dashboard worker.js; agent-sam-sandbox-cicd objects',
  description = '2026-04-01 PM: inneranimal-dashboard deploy (paired timestamp)',
  notes = 'Sandbox deploy row; may duplicate concurrent wrangler deploy with d7faaad4-607b-45bf-ab6f-e684e76c4df8 same second. v214. Use for audit trail only.'
WHERE id = 'a9cbb871-25a1-41d2-aa5b-bc275e344906';

UPDATE deployments SET
  git_hash = 'cc2fcf16ec0e4fcc069ddffe3e218e691fbff8d3',
  changed_files = 'see paired deployment a9cbb871-25a1-41d2-aa5b-bc275e344906',
  description = '2026-04-01 PM: duplicate insert (version not backfilled by script)',
  notes = 'INSERT left version/description null on first statement; paired deploy a9cbb871 same timestamp. Backfilled version v214 for consistency. Not a second Cloudflare deploy necessarily; D1 race.',
  version = 'v214'
WHERE id = 'd7faaad4-607b-45bf-ab6f-e684e76c4df8';

UPDATE deployments SET
  git_hash = 'cc2fcf16ec0e4fcc069ddffe3e218e691fbff8d3',
  changed_files = 'worker + dashboard static pipeline',
  description = '2026-04-01 late afternoon: sandbox v214',
  notes = 'Routine sandbox promotion of built agent-dashboard to agent-sam-sandbox-cicd; inneranimal-dashboard worker. Before evening meauxcad shell commits.'
WHERE id = '18c76fef-2c7c-442f-8075-c7ea532c7d33';
