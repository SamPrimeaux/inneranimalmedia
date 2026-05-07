#!/usr/bin/env python3
from pathlib import Path
import json
import subprocess
import textwrap

ROOT = Path.cwd()
OUT = ROOT / "sql/agentsam/register_connor_workspace_scripts.sql"

WORKSPACE_ID = "ws_connor_mcneely"
TENANT_ID = "tenant_connor_mcneely"
PROJECT_ID = "project_leadership_legacy"
PROJECT_SLUG = "leadership-legacy"
WORKSPACE_SLUG = "connor-mcneely"
GITHUB_REPO = "SamPrimeaux/leadership-legacy"
R2_BUCKET = "leadership-legacy"
R2_PREFIX = "leadership-legacy/"
DEFAULT_MODEL_ID = "gpt-5.4-mini"
PRIMARY_SUBAGENT_ID = "agentsam_connor"

def sql_quote(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"

def json_text(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)

scripts = [
    {
        "id": "script_connor_npm_install",
        "name": "Install dependencies",
        "path": "npm install --include=dev",
        "description": "Install project dependencies including dev dependencies for Vite, Playwright, Monaco, xterm, and Wrangler workflows.",
        "purpose": "dev",
        "runner": "npm",
        "requires_env": 0,
        "safe_to_run": 1,
        "preferred_for": "Fresh local setup, dependency repair, CI install parity.",
        "notes": "Use from repo root. Does not deploy or mutate Cloudflare resources."
    },
    {
        "id": "script_connor_dev",
        "name": "Start local dev server",
        "path": "npm run dev",
        "description": "Start the local Vite development server for the public app and dashboard.",
        "purpose": "dev",
        "runner": "npm",
        "requires_env": 0,
        "safe_to_run": 1,
        "preferred_for": "Local UI development and Connor learning sessions.",
        "notes": "Local-only. Does not affect production."
    },
    {
        "id": "script_connor_build",
        "name": "Build production app",
        "path": "npm run build",
        "description": "Build the production Vite assets for the public website and dashboard.",
        "purpose": "build",
        "runner": "npm",
        "requires_env": 0,
        "safe_to_run": 1,
        "preferred_for": "Pre-deploy validation and CI build checks.",
        "notes": "Writes dist/. dist/ should remain gitignored."
    },
    {
        "id": "script_connor_test_e2e",
        "name": "Run live Playwright smoke tests",
        "path": "npm run test:e2e",
        "description": "Run Playwright smoke tests against the live Worker routes by default.",
        "purpose": "test",
        "runner": "npm",
        "requires_env": 0,
        "safe_to_run": 1,
        "run_before": "Run npm run build first when testing fresh source changes.",
        "preferred_for": "Validating public routes, dashboard routes, health APIs, OpenAI diagnostics, R2 listing, and GitHub status.",
        "notes": "Defaults to https://leadership-legacy.meauxbility.workers.dev unless PLAYWRIGHT_BASE_URL or LOCAL_E2E=1 is set."
    },
    {
        "id": "script_connor_test_e2e_local",
        "name": "Run local Playwright smoke tests",
        "path": "LOCAL_E2E=1 npm run test:e2e",
        "description": "Run Playwright tests against the local Vite dev server.",
        "purpose": "test",
        "runner": "npm",
        "requires_env": 0,
        "safe_to_run": 1,
        "run_before": "Ensure local dependencies are installed.",
        "preferred_for": "Testing local behavior before deploy.",
        "notes": "This starts local Vite through Playwright webServer config."
    },
    {
        "id": "script_connor_open_playwright_report",
        "name": "Open Playwright report",
        "path": "npm run test:e2e:report",
        "description": "Open the Playwright HTML report after test runs.",
        "purpose": "test",
        "runner": "npm",
        "requires_env": 0,
        "safe_to_run": 1,
        "preferred_for": "Reviewing failed tests, screenshots, and traces.",
        "notes": "Read-only local report viewer."
    },
    {
        "id": "script_connor_deploy_worker",
        "name": "Deploy Worker",
        "path": "npm run deploy",
        "description": "Build and deploy the Leadership Legacy Worker to Cloudflare.",
        "purpose": "deploy",
        "runner": "npm",
        "requires_env": 1,
        "owner_only": 1,
        "safe_to_run": 0,
        "run_before": "Run npm run build and npm run test:e2e first.",
        "never_run_with": "Do not run while another deployment or migration is active.",
        "preferred_for": "Manual production deploy after validation.",
        "notes": "Mutates production Worker. Owner approval required."
    },
    {
        "id": "script_connor_r2_publish",
        "name": "Publish dist to R2",
        "path": "npm run r2:publish",
        "description": "Upload dist/ assets to R2 under live/ and deployments/<git-sha>/.",
        "purpose": "deploy",
        "runner": "npm",
        "requires_env": 1,
        "owner_only": 1,
        "safe_to_run": 0,
        "run_before": "Run npm run build first.",
        "run_after": "Run npm run r2:prune after successful publish.",
        "preferred_for": "Publishing fresh static assets to R2 for snapshots and live asset storage.",
        "notes": "Writes R2 objects. Requires Cloudflare credentials and R2 bucket access."
    },
    {
        "id": "script_connor_r2_prune",
        "name": "Prune old R2 deployments",
        "path": "npm run r2:prune",
        "description": "Delete old R2 deployment snapshots under deployments/<old-sha>/ while preserving live/, cms/, assets/, docs/, and analytics/.",
        "purpose": "maintenance",
        "runner": "npm",
        "requires_env": 1,
        "owner_only": 1,
        "safe_to_run": 0,
        "run_before": "Confirm /api/r2/list is live and Worker has WEBSITE binding.",
        "never_run_with": "Do not run during an active R2 publish.",
        "preferred_for": "Preventing R2 deployment snapshot bloat.",
        "notes": "Deletes old deployment objects only. Uses Worker /api/r2/list to enumerate because Wrangler v4.88 lacks r2 object list."
    },
    {
        "id": "script_connor_deploy_full",
        "name": "Full build, R2 publish, prune, and Worker deploy",
        "path": "npm run deploy:full",
        "description": "Run the full release flow: build, publish dist to R2, prune old R2 deployments, and deploy Worker.",
        "purpose": "deploy",
        "runner": "npm",
        "requires_env": 1,
        "owner_only": 1,
        "safe_to_run": 0,
        "run_before": "Run npm run test:e2e and confirm no active production incident.",
        "never_run_with": "Never run concurrently with another deploy:full or manual R2 prune.",
        "preferred_for": "Owner-approved production release.",
        "notes": "Mutates production Worker and R2. Requires explicit approval."
    },
    {
        "id": "script_connor_openai_diagnostics",
        "name": "Check OpenAI diagnostics",
        "path": "curl -s https://leadership-legacy.meauxbility.workers.dev/api/openai/diagnostics",
        "description": "Check server-side OpenAI key shape without exposing the key.",
        "purpose": "audit",
        "runner": "bash",
        "requires_env": 0,
        "safe_to_run": 1,
        "preferred_for": "Verifying OPENAI_API_KEY was stored without OPENAI_API_KEY= prefix or quotes.",
        "notes": "Read-only HTTP diagnostic."
    },
    {
        "id": "script_connor_openai_test",
        "name": "Run OpenAI live test",
        "path": "curl -s https://leadership-legacy.meauxbility.workers.dev/api/openai/test",
        "description": "Run a live Worker-routed OpenAI test and expect text ok.",
        "purpose": "test",
        "runner": "bash",
        "requires_env": 0,
        "safe_to_run": 1,
        "preferred_for": "Verifying OpenAI endpoint after secret changes or deploys.",
        "notes": "Costs a tiny number of OpenAI tokens."
    },
    {
        "id": "script_connor_health_check",
        "name": "Run Worker health check",
        "path": "curl -s https://leadership-legacy.meauxbility.workers.dev/api/health",
        "description": "Check Worker health, OpenAI configured flag, and R2 binding status.",
        "purpose": "audit",
        "runner": "bash",
        "requires_env": 0,
        "safe_to_run": 1,
        "preferred_for": "Post-deploy smoke check.",
        "notes": "Read-only."
    },
    {
        "id": "script_connor_provider_status",
        "name": "Check AI provider status",
        "path": "curl -s https://leadership-legacy.meauxbility.workers.dev/api/ai/providers",
        "description": "Check OpenAI, Anthropic, Gemini provider readiness and blocked model policy.",
        "purpose": "audit",
        "runner": "bash",
        "requires_env": 0,
        "safe_to_run": 1,
        "preferred_for": "Provider setup verification.",
        "notes": "Read-only."
    },
    {
        "id": "script_connor_r2_list",
        "name": "List R2 objects through Worker",
        "path": "curl -s https://leadership-legacy.meauxbility.workers.dev/api/r2/list?prefix=",
        "description": "List R2 objects through the Worker R2 binding.",
        "purpose": "audit",
        "runner": "bash",
        "requires_env": 0,
        "safe_to_run": 1,
        "preferred_for": "Verifying R2 binding and object browser support.",
        "notes": "Read-only."
    },
    {
        "id": "script_connor_github_status",
        "name": "Check GitHub integration status",
        "path": "curl -s https://leadership-legacy.meauxbility.workers.dev/api/github/status",
        "description": "Check whether GitHub OAuth/App secrets are configured.",
        "purpose": "audit",
        "runner": "bash",
        "requires_env": 0,
        "safe_to_run": 1,
        "preferred_for": "GitHub integration setup verification.",
        "notes": "Read-only."
    },
    {
        "id": "script_connor_add_openai_secret",
        "name": "Set OpenAI Worker secret",
        "path": "npx wrangler secret put OPENAI_API_KEY",
        "description": "Set or replace the OpenAI API key in Cloudflare Worker secrets.",
        "purpose": "maintenance",
        "runner": "wrangler",
        "requires_env": 1,
        "owner_only": 1,
        "safe_to_run": 0,
        "run_after": "Run npm run deploy, then /api/openai/diagnostics and /api/openai/test.",
        "preferred_for": "Replacing Sam's temporary key with Connor's own OpenAI key.",
        "notes": "Paste only sk-proj-..., not OPENAI_API_KEY=sk-proj-..."
    },
    {
        "id": "script_connor_add_anthropic_secret",
        "name": "Set Anthropic Worker secret",
        "path": "npx wrangler secret put ANTHROPIC_API_KEY",
        "description": "Set Anthropic API key for review/reasoning provider lane.",
        "purpose": "maintenance",
        "runner": "wrangler",
        "requires_env": 1,
        "owner_only": 1,
        "safe_to_run": 0,
        "run_after": "Run npm run deploy and verify /api/ai/providers.",
        "preferred_for": "Enabling Anthropic provider readiness.",
        "notes": "Secret mutation; owner-only."
    },
    {
        "id": "script_connor_add_gemini_secret",
        "name": "Set Gemini Worker secret",
        "path": "npx wrangler secret put GEMINI_API_KEY",
        "description": "Set Gemini API key for Google AI provider lane.",
        "purpose": "maintenance",
        "runner": "wrangler",
        "requires_env": 1,
        "owner_only": 1,
        "safe_to_run": 0,
        "run_after": "Run npm run deploy and verify /api/ai/providers.",
        "preferred_for": "Enabling Gemini provider readiness.",
        "notes": "Secret mutation; owner-only."
    },
    {
        "id": "script_connor_add_resend_secret",
        "name": "Set Resend Worker secret",
        "path": "npx wrangler secret put RESEND_API_KEY",
        "description": "Set Resend API key for transactional email workflows.",
        "purpose": "maintenance",
        "runner": "wrangler",
        "requires_env": 1,
        "owner_only": 1,
        "safe_to_run": 0,
        "preferred_for": "Contact forms, lead confirmations, invite emails, and notifications.",
        "notes": "Secret mutation; owner-only."
    },
    {
        "id": "script_connor_github_actions_deploy",
        "name": "GitHub Actions production deploy",
        "path": ".github/workflows/deploy.yml",
        "description": "CI/CD workflow that installs dependencies, audits, builds, tests live routes, uploads dist to R2, prunes old R2 deployments, and deploys the Worker.",
        "purpose": "deploy",
        "runner": "bash",
        "requires_env": 1,
        "owner_only": 1,
        "safe_to_run": 0,
        "run_before": "Ensure GitHub repo secrets CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN exist.",
        "preferred_for": "Automatic deployment on push to main.",
        "notes": "Runs in GitHub Actions, not local terminal."
    },
    {
        "id": "script_connor_todo_review",
        "name": "Review Connor setup TO-DO",
        "path": "TO-DO.md",
        "description": "Connor's complete project setup checklist and operating guide.",
        "purpose": "audit",
        "runner": "bash",
        "requires_env": 0,
        "owner_only": 0,
        "safe_to_run": 1,
        "preferred_for": "Onboarding and handoff review.",
        "notes": "Documentation entry."
    },
    {
        "id": "script_connor_readme_review",
        "name": "Review repo README",
        "path": "README.md",
        "description": "Primary repo front door explaining the product, stack, setup, routes, tests, R2 flow, and integration roadmap.",
        "purpose": "audit",
        "runner": "bash",
        "requires_env": 0,
        "owner_only": 0,
        "safe_to_run": 1,
        "preferred_for": "Repo orientation.",
        "notes": "Documentation entry."
    },
]

workspace_metadata = {
    "client": "Connor McNeely",
    "brand": "Leadership Legacy Digital",
    "live_url": "https://leadership-legacy.meauxbility.workers.dev",
    "public_routes": ["/", "/services", "/work", "/about", "/resources", "/contact"],
    "dashboard_routes": ["/dashboard", "/dashboard/agent", "/dashboard/storage", "/dashboard/settings", "/dashboard/analytics", "/dashboard/learn", "/dashboard/mail", "/dashboard/mcp"],
    "api_routes": ["/api/health", "/api/ai/providers", "/api/openai/diagnostics", "/api/openai/test", "/api/r2/list", "/api/github/status"],
    "stack": ["Cloudflare Workers", "R2", "Vite", "React", "Monaco", "xterm", "OpenAI", "Playwright"],
}

workspaces_settings = {
    "autodeploy": True,
    "r2_keep_deployments": 3,
    "live_worker_url": "https://leadership-legacy.meauxbility.workers.dev",
    "requires_owner_approval_for_deploy": True,
    "blocked_models": ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4-pro"],
}

workspaces_state = {
    "openai": "configured",
    "r2": "configured",
    "worker": "deployed",
    "anthropic": "pending",
    "gemini": "pending",
    "github": "prepared",
    "google_drive": "prepared",
    "gmail": "prepared",
    "resend": "prepared",
    "supabase": "planned",
    "d1": "planned",
    "mcp": "planned",
}

lines = []
lines.append("-- Register Connor McNeely / Leadership Legacy workspace and Agent Sam script registry")
lines.append("-- Generated by scripts/register_connor_agentsam_workspace_scripts.py")
lines.append("BEGIN TRANSACTION;")
lines.append("")

lines.append("""
INSERT INTO agentsam_workspace (
  id,
  workspace_slug,
  tenant_id,
  project_id,
  project_slug,
  name,
  description,
  root_path,
  r2_bucket,
  status,
  metadata_json,
  r2_prefix,
  github_repo,
  default_model_id,
  primary_subagent_id,
  display_name,
  updated_at
) VALUES (
  {id},
  {workspace_slug},
  {tenant_id},
  {project_id},
  {project_slug},
  {name},
  {description},
  {root_path},
  {r2_bucket},
  'active',
  {metadata_json},
  {r2_prefix},
  {github_repo},
  {default_model_id},
  {primary_subagent_id},
  {display_name},
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  workspace_slug = excluded.workspace_slug,
  tenant_id = excluded.tenant_id,
  project_id = excluded.project_id,
  project_slug = excluded.project_slug,
  name = excluded.name,
  description = excluded.description,
  root_path = excluded.root_path,
  r2_bucket = excluded.r2_bucket,
  status = excluded.status,
  metadata_json = excluded.metadata_json,
  r2_prefix = excluded.r2_prefix,
  github_repo = excluded.github_repo,
  default_model_id = excluded.default_model_id,
  primary_subagent_id = excluded.primary_subagent_id,
  display_name = excluded.display_name,
  updated_at = unixepoch();
""".format(
    id=sql_quote(WORKSPACE_ID),
    workspace_slug=sql_quote(WORKSPACE_SLUG),
    tenant_id=sql_quote(TENANT_ID),
    project_id=sql_quote(PROJECT_ID),
    project_slug=sql_quote(PROJECT_SLUG),
    name=sql_quote("Connor McNeely / Leadership Legacy"),
    description=sql_quote("Client workspace for Connor McNeely and Leadership Legacy Digital: public site, dashboard, R2 assets, OpenAI Agent Connor, Playwright, GitHub/Google/Resend/Supabase integration roadmap."),
    root_path=sql_quote("~/Downloads/leadership-legacy"),
    r2_bucket=sql_quote(R2_BUCKET),
    metadata_json=sql_quote(json_text(workspace_metadata)),
    r2_prefix=sql_quote(R2_PREFIX),
    github_repo=sql_quote(GITHUB_REPO),
    default_model_id=sql_quote(DEFAULT_MODEL_ID),
    primary_subagent_id=sql_quote(PRIMARY_SUBAGENT_ID),
    display_name=sql_quote("Connor McNeely")
))

lines.append("""
INSERT INTO workspaces (
  id,
  name,
  domain,
  category,
  status,
  cloudflare_plan,
  dns_records_count,
  workers_pages_count,
  logo_url,
  theme_set,
  created_at,
  handle,
  is_system,
  is_archived,
  owner_tenant_id,
  default_tenant_id,
  updated_at,
  theme_id,
  app_id,
  project_id,
  workspace_id,
  worker_id,
  brand,
  theme,
  user_id,
  tenant_id,
  display_name,
  slug,
  workspace_type,
  r2_prefix,
  github_repo,
  primary_subagent_id,
  default_model_id,
  settings_json,
  description,
  state_json
) VALUES (
  {id},
  {name},
  {domain},
  'client',
  'active',
  'workers',
  0,
  1,
  NULL,
  'leadership-legacy-dark',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  {handle},
  0,
  0,
  {owner_tenant_id},
  {default_tenant_id},
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'theme_leadership_legacy_dark',
  'app_leadership_legacy',
  {project_id},
  {workspace_id_ref},
  'worker_leadership_legacy',
  {brand},
  'dark-premium-engineering',
  'user_connor_mcneely',
  {tenant_id},
  {display_name},
  {slug},
  'project',
  {r2_prefix},
  {github_repo},
  {primary_subagent_id},
  {default_model_id},
  {settings_json},
  {description},
  {state_json}
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  domain = excluded.domain,
  category = excluded.category,
  status = excluded.status,
  cloudflare_plan = excluded.cloudflare_plan,
  workers_pages_count = excluded.workers_pages_count,
  theme_set = excluded.theme_set,
  handle = excluded.handle,
  is_archived = excluded.is_archived,
  owner_tenant_id = excluded.owner_tenant_id,
  default_tenant_id = excluded.default_tenant_id,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  theme_id = excluded.theme_id,
  app_id = excluded.app_id,
  project_id = excluded.project_id,
  workspace_id = excluded.workspace_id,
  worker_id = excluded.worker_id,
  brand = excluded.brand,
  theme = excluded.theme,
  user_id = excluded.user_id,
  tenant_id = excluded.tenant_id,
  display_name = excluded.display_name,
  slug = excluded.slug,
  workspace_type = excluded.workspace_type,
  r2_prefix = excluded.r2_prefix,
  github_repo = excluded.github_repo,
  primary_subagent_id = excluded.primary_subagent_id,
  default_model_id = excluded.default_model_id,
  settings_json = excluded.settings_json,
  description = excluded.description,
  state_json = excluded.state_json;
""".format(
    id=sql_quote(WORKSPACE_ID),
    name=sql_quote("Connor McNeely / Leadership Legacy"),
    domain=sql_quote("leadership-legacy.meauxbility.workers.dev"),
    handle=sql_quote("connor-mcneely"),
    owner_tenant_id=sql_quote(TENANT_ID),
    default_tenant_id=sql_quote(TENANT_ID),
    project_id=sql_quote(PROJECT_ID),
    workspace_id_ref=sql_quote(WORKSPACE_ID),
    brand=sql_quote("Leadership Legacy Digital"),
    tenant_id=sql_quote(TENANT_ID),
    display_name=sql_quote("Connor McNeely"),
    slug=sql_quote("connor-mcneely"),
    r2_prefix=sql_quote(R2_PREFIX),
    github_repo=sql_quote(GITHUB_REPO),
    primary_subagent_id=sql_quote(PRIMARY_SUBAGENT_ID),
    default_model_id=sql_quote(DEFAULT_MODEL_ID),
    settings_json=sql_quote(json_text(workspaces_settings)),
    description=sql_quote("Client workspace for Connor McNeely and Leadership Legacy Digital."),
    state_json=sql_quote(json_text(workspaces_state))
))

for s in scripts:
    values = {
        "id": sql_quote(s["id"]),
        "workspace_id": sql_quote(WORKSPACE_ID),
        "name": sql_quote(s["name"]),
        "path": sql_quote(s["path"]),
        "description": sql_quote(s["description"]),
        "purpose": sql_quote(s["purpose"]),
        "runner": sql_quote(s["runner"]),
        "requires_env": int(s.get("requires_env", 1)),
        "owner_only": int(s.get("owner_only", 1)),
        "safe_to_run": int(s.get("safe_to_run", 1)),
        "run_before": sql_quote(s.get("run_before")),
        "run_after": sql_quote(s.get("run_after")),
        "never_run_with": sql_quote(s.get("never_run_with")),
        "preferred_for": sql_quote(s.get("preferred_for")),
        "notes": sql_quote(s.get("notes")),
    }
    lines.append(f"""
INSERT INTO agentsam_scripts (
  id,
  workspace_id,
  name,
  path,
  description,
  purpose,
  runner,
  requires_env,
  owner_only,
  safe_to_run,
  run_before,
  run_after,
  never_run_with,
  preferred_for,
  notes,
  is_active,
  updated_at
) VALUES (
  {values["id"]},
  {values["workspace_id"]},
  {values["name"]},
  {values["path"]},
  {values["description"]},
  {values["purpose"]},
  {values["runner"]},
  {values["requires_env"]},
  {values["owner_only"]},
  {values["safe_to_run"]},
  {values["run_before"]},
  {values["run_after"]},
  {values["never_run_with"]},
  {values["preferred_for"]},
  {values["notes"]},
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
ON CONFLICT(id) DO UPDATE SET
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  path = excluded.path,
  description = excluded.description,
  purpose = excluded.purpose,
  runner = excluded.runner,
  requires_env = excluded.requires_env,
  owner_only = excluded.owner_only,
  safe_to_run = excluded.safe_to_run,
  run_before = excluded.run_before,
  run_after = excluded.run_after,
  never_run_with = excluded.never_run_with,
  preferred_for = excluded.preferred_for,
  notes = excluded.notes,
  is_active = 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');
""")

lines.append("""
-- Verification queries
SELECT id, workspace_slug, name, r2_bucket, r2_prefix, github_repo, default_model_id
FROM agentsam_workspace
WHERE id = 'ws_connor_mcneely';

SELECT id, name, domain, category, status, github_repo, r2_prefix, default_model_id
FROM workspaces
WHERE id = 'ws_connor_mcneely';

SELECT purpose, runner, safe_to_run, owner_only, COUNT(*) AS script_count
FROM agentsam_scripts
WHERE workspace_id = 'ws_connor_mcneely'
GROUP BY purpose, runner, safe_to_run, owner_only
ORDER BY purpose, runner;
""")

lines.append("COMMIT;")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("\n".join(lines), encoding="utf-8")

print(f"Wrote {OUT}")
print("")
print("Apply to remote D1:")
print("npx wrangler d1 execute inneranimalmedia-business --remote --file sql/agentsam/register_connor_workspace_scripts.sql")
print("")
print("Then verify:")
print("npx wrangler d1 execute inneranimalmedia-business --remote --command \"SELECT id,name,path,purpose,runner,safe_to_run FROM agentsam_scripts WHERE workspace_id='ws_connor_mcneely' ORDER BY purpose,name;\"")

subprocess.run(["git", "add", str(OUT), "scripts/register_connor_agentsam_workspace_scripts.py"], cwd=ROOT)
subprocess.run(["git", "commit", "-m", "data: register Connor workspace Agent Sam scripts"], cwd=ROOT)
