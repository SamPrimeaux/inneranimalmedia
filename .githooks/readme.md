Git Hooks — Inner Animal Media / Agent Sam Dashboard
Hooks in this directory run automatically when you use Git if you point core.hooksPath here.

Enable hooks (one-time per clone)
From repo root:

git config core.hooksPath .githooks
chmod +x .githooks/post-merge .githooks/post-commit .githooks/pre-push
How hooks work
Every hook in this repo follows the same two-table pattern:

agentsam_hook — defines what command to run, for which trigger, in which workspace. One row per hook definition. Unique per (user_id, workspace_id, trigger).
agentsam_hook_execution — records every time a hook fires: status, duration, output, and any error. References agentsam_hook.id with cascade delete.
The hook scripts read their command from agentsam_hook at runtime (via wrangler d1 execute or the worker API), execute it, then write the result to agentsam_hook_execution. This means hooks are DB-driven — you can disable, update, or add hooks without touching shell scripts.

D1 Schema
agentsam_hook
CREATE TABLE agentsam_hook (
  id           TEXT PRIMARY KEY DEFAULT ('hook_' || lower(hex(randomblob(6)))),
  user_id      TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  trigger      TEXT NOT NULL CHECK(trigger IN ('start','stop','pre_deploy','post_deploy','pre_commit','error')),
  command      TEXT NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, workspace_id, trigger)
);
Current hooks (production):

id	workspace_id	trigger	command summary
hook_start_bootstrap	inneranimalmedia	start	d1_query: SELECT key, value FROM project_memory
hook_post_deploy_log	inneranimalmedia	post_deploy	Parse version ID, write to D1 deploy log
hook_pre_deploy_check	inneranimalmedia	pre_deploy	terminal_execute: cd + lint check
hook_error_diagnose	inneranimalmedia	error	Read error, search codebase, suggest fix
hook_pre_commit_lint	inneranimalmedia	pre_commit	terminal_execute: cd + run linter
hook_cf_sandbox_validate	ws_inneranimalmedia	post_deploy	curl -X POST CF worker validate endpoint
hook_cf_mcp_server_depl	ws_mcp_server	post_deploy	curl -X POST CF MCP server deploy
hook_cf_prod_promote	ws_inneranimalmedia_pr...	post_deploy	curl -X POST PENDING_PROD_HOOK_URL
hook_iam_pty_restart	ws_iam_pty	post_deploy	pm2 restart iam-pty --update-env
hook_cf_mobiledashboard	ws_mobiledashboard	post_deploy	curl -X POST PENDING_MOBILEDASHBOARD_HOOK_URL
hook_cf_meauxcad	ws_meauxcad	post_deploy	curl -X POST PENDING_MEAUXCAD_HOOK_URL
hook_cf_deploy_main	ws_inneranimalmedia_pr...	post_deploy	curl -X POST PENDING_MAIN_DEPLOY_HOOK_URL
is_active = 1 on all rows. To disable a hook without deleting it: UPDATE agentsam_hook SET is_active = 0 WHERE id = 'hook_...'

agentsam_hook_execution
CREATE TABLE agentsam_hook_execution (
  id          TEXT PRIMARY KEY DEFAULT ('hexec_' || lower(hex(randomblob(6)))),
  hook_id     TEXT NOT NULL REFERENCES agentsam_hook(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK(status IN ('success','fail','timeout')),
  duration_ms INTEGER,
  output      TEXT,
  error       TEXT,
  ran_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
Recent executions:

id	hook_id	status	duration_ms	notes
hexec_15f55a8b3960	hook_start_bootstrap	success	1240	25 project_memory rows loaded
hexec_51e1bfa1e7c7	hook_post_deploy_log	success	890	Logged deploy_google_toolloop_final
hexec_a6e974c95438	hook_error_diagnose	success	120	R2 upload fixed — missing --remote flag
hexec_cd1391cf7510	hook_error_diagnose	fail	80	Excalidraw postMessage not reaching draw-panel-iframe
hexec_v143_bootstrap	hook_start_bootstrap	fail	NULL	Session terminal-translator boot failed
hexec_v143_predeploy	hook_pre_deploy_check	fail	NULL	pre_deploy NOT run — JSX patches applied outside deploy flow
hexec_v143_postdeploy	hook_post_deploy_log	success	890	v143 full deploy logged
hexec_v143_error_1	hook_error_diagnose	fail	NULL	error_diagnose NOT run when deploys failed silently
Branch → Worker → Hook Mapping
Branch	Worker	Domain	Wrangler Config	Hook fired
main	inneranimal-dashboard	sandbox.inneranimalmedia.com	wrangler.jsonc	hook_cf_sandbox_validate
production	inneranimalmedia	inneranimalmedia.com	wrangler.production.toml	hook_cf_deploy_main, hook_cf_prod_promote
Deploy is always CF Builds — never run wrangler deploy manually from a hook or local terminal.

PTY restart (hook_iam_pty_restart) uses pm2 restart iam-pty --update-env. Never use pm2 restart --update-env shorthand — always full stop/delete/start sequence.

Querying hook history
# Last 10 executions across all hooks
wrangler d1 execute inneranimalmedia-business \
  --command "SELECT e.id, h.trigger, h.workspace_id, e.status, e.duration_ms, e.ran_at FROM agentsam_hook_execution e JOIN agentsam_hook h ON h.id = e.hook_id ORDER BY e.ran_at DESC LIMIT 10;" \
  --remote -c wrangler.production.toml

# All failures
wrangler d1 execute inneranimalmedia-business \
  --command "SELECT e.id, h.trigger, e.error, e.ran_at FROM agentsam_hook_execution e JOIN agentsam_hook h ON h.id = e.hook_id WHERE e.status != 'success' ORDER BY e.ran_at DESC;" \
  --remote -c wrangler.production.toml

# Active hooks for a workspace
wrangler d1 execute inneranimalmedia-business \
  --command "SELECT id, trigger, command FROM agentsam_hook WHERE workspace_id = 'ws_inneranimalmedia' AND is_active = 1;" \
  --remote -c wrangler.production.toml
Adding a new hook
Insert into D1 — shell scripts read from the table at runtime:

wrangler d1 execute inneranimalmedia-business \
  --command "INSERT INTO agentsam_hook (user_id, workspace_id, trigger, command) VALUES ('sam_primeaux', 'ws_inneranimalmedia', 'post_deploy', 'YOUR COMMAND HERE');" \
  --remote -c wrangler.production.toml
Verify it appears with is_active = 1 before relying on it.

Known open issues (from execution log)
Excalidraw postMessage bridge — hexec_cd1391cf7510: draw-panel-iframe not receiving messages in new TSX build. Fix pending in FloatingPreviewPanel.tsx iframe wiring.
pre_deploy not firing on agent-initiated changes — hexec_v143_predeploy: Hook only runs through scripts/deploy-cf-builds.sh. Agent Sam changes applied directly via Cursor bypass this. All deploys must go through the CF Builds pipeline.
PTY bootstrap failures — hexec_v143_bootstrap: Occurs when terminal-translator drops. TERMINAL_SECRET in worker must match PTY_AUTH_TOKEN in ~/iam-pty/ecosystem.config.cjs. Last known working value starts with cec612d6.
PENDING_*_HOOK_URL placeholders — rows 8, 10, 11, 12 in agentsam_hook still have placeholder commands. These need real CF webhook URLs before those workspace deploys are fully automated.
