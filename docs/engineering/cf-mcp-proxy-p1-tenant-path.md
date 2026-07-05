# CF MCP Proxy — P1: Tenant Credential Path

## Status
P0 (superadmin + user CF OAuth) shipped locally, not yet deployed.
P1 (Connor BYOK + workspace-scoped D1) is this doc.

## Credential ladder to implement in `resolveCfMcpBearerToken`

```js
// src/core/cf-mcp-proxy.js — resolveCfMcpBearerToken
async function resolveCfMcpBearerToken(env, runContext) {
  const userId = runContext.userId ?? runContext.user_id;
  const tenantId = runContext.tenantId ?? runContext.tenant_id;
  const workspaceId = runContext.workspaceId ?? runContext.workspace_id;
  const authUser = runContext.authUser ?? runContext.user ?? null;

  // 1. User CF OAuth (Integrations → user_oauth_tokens, provider=cloudflare)
  const oauthToken = await getOAuthToken(env, userId, 'cloudflare');
  if (oauthToken) return { token: oauthToken, source: 'user_oauth' };

  // 2. Superadmin + platform fallback allowed
  const { userHasSuperadminRole } = await import('./resolve-credential.js');
  if (userHasSuperadminRole(authUser)) {
    const platformToken = String(env?.CLOUDFLARE_API_TOKEN ?? '').trim();
    if (platformToken) return { token: platformToken, source: 'platform' };
  }

  // 3. Workspace BYOK API key (Connor path)
  const { resolveWorkspaceCloudflareCredentials } = await import('./workspace-cloudflare-credentials.js');
  const creds = await resolveWorkspaceCloudflareCredentials(env, userId, tenantId, workspaceId);
  if (creds.ok && creds.token) return { token: creds.token, source: 'byok', account_id: creds.account_id };

  // 4. Not connected
  return null;
}
```

## CRITICAL: database_id must come from workspace binding, not platform default

Before P1 ships, `buildCfMcpParams` for `d1_database_query` must resolve
`database_id` from the workspace D1 binding — never hardcode `cf87b717`.

```js
// src/core/cf-mcp-proxy.js — buildCfMcpParams (d1_database_query case)
async function resolveD1DatabaseId(env, params, runContext) {
  // 1. Caller explicitly passed database_id — use it (scoped to their account)
  if (params.database_id) return params.database_id;

  // 2. Superadmin with no explicit id → platform D1
  const { userHasSuperadminRole } = await import('./resolve-credential.js');
  if (userHasSuperadminRole(runContext.authUser)) {
    return env.D1_DATABASE_ID ?? 'cf87b717-d4e2-4cf8-bab0-a81268e32d49';
  }

  // 3. Workspace binding → customer D1
  const { getDefaultWorkspaceDataBinding } = await import('./workspace-data-bindings.js');
  const binding = await getDefaultWorkspaceDataBinding(
    env,
    runContext.workspaceId ?? runContext.workspace_id,
    'cloudflare_d1'
  );
  if (binding?.external_database_id) return binding.external_database_id;

  // 4. No D1 configured for this workspace
  return null;
}
```

If `resolveD1DatabaseId` returns null for a non-superadmin, return:
```js
{ ok: false, error: 'customer_d1_not_configured', user_message: 'No D1 database configured for this workspace.' }
```

Never let a non-superadmin call hit the platform D1.

## Destructive op gates (pre-ship requirement)

Tools with `risk_level=high` or `risk_level=critical` in `agentsam_tools`
must check `requires_approval=1` and `requires_confirmation=1` before
executing via CF MCP proxy. Pattern:

```js
if (row.requires_approval && !runContext.approval_id) {
  return { ok: false, error: 'approval_required', tool_key: row.tool_key };
}
if (row.requires_confirmation && !runContext.confirmed) {
  return { ok: false, error: 'confirmation_required', tool_key: row.tool_key };
}
```

High-risk CF ops that need this gate:
- `d1_database_delete`
- `r2_bucket_delete`
- `kv_namespace_delete`
- `workers_get_worker_code` (read-only but sensitive)

## Scope isolation (Connor never touches platform)

The Bindings MCP authenticates with the bearer token you pass.
If you pass Connor's OAuth token, Cloudflare's API scope-checks it —
he can only see/modify resources in his account. No extra guard needed
at the proxy layer for account isolation. But:

- Never pass `env.CLOUDFLARE_API_TOKEN` for a non-superadmin user.
- Always validate `userHasSuperadminRole` before falling back to platform token.
- Log `auth_source` in `agentsam_tool_call_log` so you can audit which token was used.

## Ship order for P1

1. Patch `resolveCfMcpBearerToken` with the 4-step ladder above
2. Patch `resolveD1DatabaseId` into `buildCfMcpParams`
3. Add destructive op gate check before `callBindingsMcp`
4. Test: Connor workspace with BYO CF key → `agentsam_d1_query` hits his D1, not cf87b717
5. Deploy main worker (`npm run deploy:full`)
6. Deploy MCP server (`cd inneranimalmedia-mcp-server && npm run deploy:full`)
