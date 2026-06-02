-- 516: Connor workspace — self-service GitHub SSH/gh (not SamPrimeaux).
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/516_connor_github_cli_workspace_settings.sql

UPDATE workspace_settings
SET settings_json = json_set(
  COALESCE(settings_json, '{}'),
  '$.github', json_object(
    'prefer_terminal_for', 'multi_file_scaffolds',
    'no_gh_cli', 0,
    'github_account', 'connordmcneely96',
    'ssh_remote_template', 'git@github.com:connordmcneely96/{repo}.git',
    'ssh_remote_overrides', json_object(),
    'install_script', './scripts/install-terminal-github-cli-connor.sh',
    'notes', 'Connor runs install-terminal-github-cli-connor.sh on his own machine. Never inherit SamPrimeaux PAT or shared GCP iam-tunnel gh auth.'
  ),
  '$.terminal_hints', json_object(
    'github_cli_install', './scripts/install-terminal-github-cli-connor.sh',
    'git_clone_self', 'git clone git@github.com:connordmcneely96/REPO.git',
    'git_commit_push', 'git add -A && git commit -m "MSG" && git push origin HEAD',
    'github_policy', 'Your GitHub PAT only — never SamPrimeaux token or shared GCP gh login'
  )
),
updated_at = unixepoch()
WHERE workspace_id = 'ws_connor_mcneely';
