# Worker routing map (inneranimalmedia `worker.js`)

Primary router: `worker.fetch` starting approximately **line 2181**. Order matters: first match wins.

## Health

| Lines (approx) | Path | Handler |
|----------------|------|---------|
| 2192-2197 | `/api/health` | JSON bindings sanity |
| 2200-2219 | `/health` | Extended JSON with version metadata |

## Webhooks and internal ops

| Lines | Prefix / path | Notes |
|-------|-----------------|-------|
| 2222-2266 | `/api/webhooks/*`, `/api/hooks/*`, `/api/email/inbound` | `handleInboundWebhook`, `handleHooksHealth` |
| 2268-2290 | `POST /api/internal/post-deploy` | `INTERNAL_API_SECRET`, `writeKnowledgePostDeploy` |
| 2293-2299 | `/api/deployments/log`, `/api/deployments/recent` | `handleDeploymentLog`, `handleDeploymentsRecent` |
| 2301-2329 | `POST /api/internal/record-deploy` | D1 `deployments` insert |

## Telemetry

| Lines | Path | Notes |
|-------|------|-------|
| 2332-2431 | `POST /api/telemetry/v1/traces` | JSON-only OTLP-ish ingest to `otlp_traces` |

## Feature APIs (alphabetical by block comment)

| Start line | Block | Handler function(s) |
|------------|-------|---------------------|
| 2434 | Browser | `handleBrowserRequest` — `/api/browser/*` |
| 2439 | Overview | `handleOverviewStats`, `handleRecentActivity`, `handleOverviewCheckpoints`, `handleOverviewActivityStrip`, `handleOverviewDeployments` |
| 2456 | Time tracking | `handleTimeTrackManual`, `handleTimeTrack` — `/api/dashboard/time-track*` |
| 2467 | Colors | `handleColorsAll` — `/api/colors/all` |
| 2472 | Finance | `handleFinance` — `/api/finance/*` |
| 2477 | Clients | `handleClients` — `/api/clients` |
| 2482 | Projects | `handleProjects` — `/api/projects` |
| 2487 | Hub | `handleHub*` — `/api/hub/*` |
| 2502 | Billing | `handleBillingSummary` |
| 2507 | OAuth Google | `handleGoogleOAuthStart`, `handleGoogleOAuthCallback` — `/api/oauth/google/*`, **`/auth/callback/google`** |
| 2518 | OAuth GitHub | `handleGitHubOAuthStart`, `handleGitHubOAuthCallback` — `/api/oauth/github/*`, **`/auth/callback/github`** |
| 2529 | Email auth | `handleEmailPasswordLogin`, `handleBackupCodeLogin`, `handleLogout` |
| 2540 | Admin overnight | `handleOvernightValidate`, `handleOvernightStart` — superadmin gate |
| 2557-2626 | Admin vectorize / reindex / workflow | Various — `/api/admin/vectorize-kb`, `reindex-codebase`, `trigger-workflow` |
| 2655 | Integrations | Inline routes for `/api/integrations/status` and `/api/integrations/*` (gdrive/github) |
| 2801+ | Agent execute / slash / agentsam / draw | Order-sensitive; see below |

## API order-sensitive cluster (approximately 2801-2955)

Comment in source stresses **`/api/agentsam/*` before `/api/agent/*`** because path prefix matching would otherwise mis-route.

Typical order:

1. Slash command execution (must be above agent catch-all) — ~2852
2. **`handleAgentsamApi`** — `/api/agentsam/*` — ~2929-2931
3. **`handleDrawApi`** — `/api/draw/*` or draw-related — ~2934-2936
4. **`handleAgentApi`** — `/api/agent/*`, terminal, playwright subsets — ~2939-2941
5. **`handleMcpApi`** — `/api/mcp/*` — ~2944
6. R2 DevOps, Workers registry, commands load, themes, active theme, vault — ~2949 through ~3320+
7. Federated search, legacy search — ~3326+
8. Settings block — ~3345+
9. Settings theme — ~3732+

Exact line numbers drift with edits; search for `return handleAgentApi` and section comments.

## Auth / OAuth (names only)

- Google: start + callback (dashboard and canonical `/auth/callback/google`).
- GitHub: start + callback (including `/auth/callback/github`).
- Email/password, backup code, logout under `/api/auth/*`.

Do not document client secrets or tokens here.

## Static and dashboard serving

| Lines (approx) | Behavior |
|----------------|----------|
| 3827-3836 | `/`, `/index.html` — ASSETS homepage fallbacks, else DASHBOARD `auth-signin` |
| 3838-3854 | `PUBLIC_ROUTES` map clean URLs to ASSETS HTML |
| 3856-3861 | `/auth/signin`, `/login`, `/signup` — DASHBOARD `static/auth-signin.html` via **`respondWithR2Object`** |
| 3863-3866 | `/dashboard` redirect to `/dashboard/overview` |
| 3868-3875 | `/dashboard/pages/*.html` — DASHBOARD `static/dashboard/pages/*` via **`respondWithDashboardHtml`** |
| 3877-3884 | `/dashboard/<segment>` — `static/dashboard/{segment}.html` or `dashboard/{segment}.html` via **`respondWithDashboardHtml`** |
| 3887-3912 | Remaining paths: ASSETS then DASHBOARD keys; GLB viewer special case; Finance/Billing/Clients JSX aliases; **`respondWithR2Object`** with optional `noCache` for agent static and `?v=` |

## `respondWithDashboardHtml` vs `respondWithR2Object`

- **`respondWithR2Object` (`~3981`):** Streams R2 object body with content-type; optional `noCache` for dashboard assets.
- **`respondWithDashboardHtml` (`~3963`):** If `url.searchParams.get('embedded') === '1'`, reads HTML as text, injects script after `<body>` to add class `embedded`, sets no-cache headers, returns `Response` with modified HTML. Otherwise same as `respondWithR2Object` for HTML.

## `handleAgentApi`

Large function beginning approximately **line 7048** (search `async function handleAgentApi`). Includes:

- Conversations, messages, sessions, models, chat streaming, tool execution, boot, file attach, playwright job polling, `execute-approved-tool`, spend telemetry, context index search logging, etc.

## Not found

- **`notFound` (`~4008`):** JSON 404.

## Vault loading

- Top of `fetch`: `getVaultSecrets(env)` merges vault over wrangler env for secrets used in routing (implementation above line 2183).
