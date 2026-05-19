# SOURCE_HITS.md — GitHub Account/Repo Scoping Audit

Scanned: `src/`, `dashboard/`, `worker.js`, `scripts/`
Excluded: `artifacts/`, `analytics/`, `node_modules`, `dist`

## Summary

- CRITICAL: 15
- HIGH: 24
- MEDIUM: 1

---

## Priority 1 — Backend token selection (/api/integrations/github/repos)

### [CRITICAL] P1C-REPOS-ROUTE-MISSING-GUARDS  (6 hits)

**Fix:** (1) Resolve user from session. (2) SELECT token WHERE provider='github' AND user_id=user.id. (3) Return 401 if no token. (4) Never fall back to env.GITHUB_TOKEN.

- `dashboard/components/GitHubExplorer.tsx:89`
  `const res = await fetch('/api/integrations/github/repos', { credentials: 'same-origin' });`
  Handler missing: user_id from session, provider_account_id filter, workspace_id check.
- `dashboard/components/settings/hooks/useSettingsData.ts:1084`
  `fetch('/api/integrations/github/repos', opt)`
  Handler missing: user_id from session, provider_account_id filter, workspace_id check.
- `dashboard/features/agent-chat/ChatAssistant.tsx:267`
  `const res = await fetch('/api/integrations/github/repos', { credentials: 'same-origin' });`
  Handler missing: user_id from session, provider_account_id filter, workspace_id check.
- `scripts/patch_results/backups/20260516_160912/dashboard/components/GitHubExplorer.tsx:88`
  `const res = await fetch('/api/integrations/github/repos', { credentials: 'same-origin' });`
  Handler missing: user_id from session, provider_account_id filter, workspace_id check.
- `src/api/integrations.js:828`
  `if (method === 'GET' && pathLower === '/api/integrations/github/repos') {`
  Handler missing: provider_account_id filter, workspace_id check.
- `src/integrations/github.js:356`
  `if (method === 'GET' && path === '/api/integrations/github/repos') {`
  Handler missing: provider_account_id filter, workspace_id check.

### [CRITICAL] P1B-ENV-GITHUB-TOKEN-FALLBACK  (4 hits)

**Fix:** Remove fallback for user-facing routes. Return 401 if user token missing. Only allow in clearly-marked admin routes.

- `scripts/audit_github_account_repo_scoping_clean.py:185`
  `missing.append("USES env.GITHUB_TOKEN FALLBACK")`
  env.GITHUB_TOKEN used — Connor will see Sam's repos
- `scripts/audit_github_account_repo_scoping_clean.py:200`
  `"(4) Never fall back to env.GITHUB_TOKEN."`
  env.GITHUB_TOKEN used — Connor will see Sam's repos
- `src/integrations/github.js:169`
  `if (env.GITHUB_TOKEN) return { token: env.GITHUB_TOKEN, mode: 'pat' };`
  env.GITHUB_TOKEN used — Connor will see Sam's repos
- `scripts/audit_github_account_repo_scoping_clean.py:163`
  `"env.GITHUB_TOKEN used"`
  env.GITHUB_TOKEN used (admin context)

## Priority 2 — Repo list cache key scoping

### [CRITICAL] P2-CACHE-KEY-UNSCOPED  (6 hits)

**Fix:** Key: `github:repos:${user_id}:${provider_account_id}:${workspace_id}`

- `scripts/sql/agentsam_tools_catalog_verify_runtime.sql:23`
  `'github_repos',`
  Cache key missing: user_id, provider_account_id, workspace_id.
- `src/api/cicd.js:97`
  `tool_name: 'github_repos',`
  Cache key missing: user_id, provider_account_id, workspace_id.
- `src/api/cicd.js:101`
  `const { r, json } = await cidiMcpInvoke('github_repos', {});`
  Cache key missing: user_id, provider_account_id, workspace_id.
- `src/api/mcp.js:168`
  `return rows.filter((r) => ['github_repos', 'github_get_file', 'mcp_status'].includes(r.tool_name));`
  Cache key missing: user_id, provider_account_id, workspace_id.
- `src/tools/ai-dispatch.js:35`
  `github_repo: 'github_repos',`
  Cache key missing: user_id, provider_account_id, workspace_id.
- `src/tools/ai-dispatch.js:36`
  `github_list_repos: 'github_repos',`
  Cache key missing: user_id, provider_account_id, workspace_id.

## Priority 3 — OAuth callback token binding

### [HIGH] P3-OAUTH-CALLBACK-BINDING  (24 hits)

**Fix:** Store token with user_id, provider_account_id, account_login, provider='github'. Validate state param contains user_id.

- `scripts/audit_github_account_repo_scoping.py:237`
  `r"(callback|oauth_callback|github_callback|/auth/github)",`
  OAuth callback: state param not validated; user_id not bound to token; provider_account_id not stored; account_login not stored.
- `scripts/audit_github_account_repo_scoping_clean.py:75`
  `r"(github.*callback|callback.*github|/auth/github|oauth.*complete|token.*store)",`
  OAuth callback: state param not validated; user_id not bound to token; provider_account_id not stored; account_login not stored.
- `scripts/d1-roadmap-inner-cli-worker-api-20260402.sql:20`
  `'Deliver npm package @inneranimal/cli that calls the same Cloudflare Worker /api/* routes as the React dashboard. CLI an`
  OAuth callback: state param not validated; user_id not bound to token; provider_account_id not stored; account_login not stored.
- `scripts/d1-seed-agentsam-profiles-rules.sql:26`
  `2. **OAuth:** Do not edit `handleGoogleOAuthCallback` or `handleGitHubOAuthCallback` without line-by-line approval (lock`
  OAuth callback: user_id not bound to token; provider_account_id not stored; account_login not stored.
- `scripts/generate-route-map.js:91`
  `'/auth/callback/github': 'GitHub OAuth callback (locked handler).',`
  OAuth callback: user_id not bound to token; provider_account_id not stored; account_login not stored.
- `scripts/generate-route-map.js:93`
  `'/api/oauth/github/callback': 'GitHub OAuth redirect URI used by worker.',`
  OAuth callback: state param not validated; user_id not bound to token; provider_account_id not stored; account_login not stored.
- `scripts/iam_targeted_diagnosis.py:95`
  `"Token stored in localStorage/sessionStorage (cleared on error?)"),`
  OAuth callback: user_id not bound to token; provider_account_id not stored; account_login not stored.
- `scripts/seed_prompt_layers.py:202`
  `- Google OAuth tokens are stored in user_oauth_tokens D1 table. Never log or expose them.`
  OAuth callback: state param not validated; user_id not bound to token; provider_account_id not stored; account_login not stored.
- `src/api/auth.js:1189`
  `const tokenRedirectUri = storedRedirectUri || redirectUri;`
  OAuth callback: user_id not bound to token; provider_account_id not stored.
- `src/api/auth.js:1339`
  `eventType: 'oauth_token_stored',`
  OAuth callback: state param not validated.
- `src/api/auth.js:1346`
  `console.warn('[supabase_oauth] encrypted token store failed', e?.message ?? e);`
  OAuth callback: state param not validated.
- `src/api/oauth-login-callbacks.js:181`
  `export async function handleGitHubLoginOAuthCallback(request, url, env, options = {}) {`
  OAuth callback: user_id not bound to token; provider_account_id not stored.
- `src/api/oauth-login-callbacks.js:272`
  `console.error('[oauth/github/callback] user_oauth_tokens upsert failed:', e?.message ?? e);`
  OAuth callback: state param not validated; provider_account_id not stored.
- `src/api/oauth-login-callbacks.js:301`
  `console.warn('[oauth/github/callback] auth_users name update:', e?.message ?? e);`
  OAuth callback: state param not validated; provider_account_id not stored.
- `src/api/oauth-login-callbacks.js:338`
  `console.error('[oauth/github/callback] user_oauth_tokens upsert failed:', e?.message ?? e);`
  OAuth callback: state param not validated; user_id not bound to token; provider_account_id not stored.
- `src/api/oauth.js:16`
  `handleGitHubLoginOAuthCallback,`
  OAuth callback: user_id not bound to token; provider_account_id not stored.
- `src/api/oauth.js:158`
  `const redirectUri = `${oauthLoginOrigin(url)}/api/oauth/github/callback`;`
  OAuth callback: user_id not bound to token; provider_account_id not stored.
- `src/api/oauth.js:416`
  `u.searchParams.set('redirect_uri', 'https://inneranimalmedia.com/api/oauth/github/callback');`
  OAuth callback: user_id not bound to token; provider_account_id not stored; account_login not stored.
- `src/api/oauth.js:509`
  `redirect_uri: 'https://inneranimalmedia.com/api/oauth/github/callback',`
  OAuth callback: state param not validated; user_id not bound to token; provider_account_id not stored.
- `src/api/oauth.js:1358`
  `return handleGitHubLoginOAuthCallback(request, url, env, { cachedRedirect: rawGh });`
  OAuth callback: provider_account_id not stored.
- `src/index.js:34`
  `handleGitHubLoginOAuthCallback,`
  OAuth callback: state param not validated; user_id not bound to token; provider_account_id not stored.
- `src/index.js:362`
  `(pathLower === '/api/auth/google/start' || pathLower === '/api/auth/github/start') &&`
  OAuth callback: state param not validated; user_id not bound to token; provider_account_id not stored.
- `src/index.js:430`
  `if (pathLower === '/auth/callback/github') {`
  OAuth callback: state param not validated; user_id not bound to token; provider_account_id not stored.
- `src/index.js:432`
  `await handleGitHubLoginOAuthCallback(request, new URL(request.url), env),`
  OAuth callback: state param not validated; user_id not bound to token; provider_account_id not stored.

---

## Patch order

1. **P1C hit** — open that file, inspect the full token selection block.
   If CRITICAL: fix token query first.
2. Fix cache key: `github:repos:${user_id}:${provider_account_id}:${workspace_id}`
3. OAuth callback: confirm user_id, provider_account_id, account_login all stored.
4. Frontend 404: no reconnect, no state clear.

## Noise ignored

- `inneranimalmedia` strings — project/bucket name, not a scoping bug.
- Everything in `artifacts/` and `analytics/`.