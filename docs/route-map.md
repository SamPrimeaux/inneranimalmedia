# IAM worker route map

Auto-generated from `worker.js` (Cloudflare Workers `fetch`, not Express). Each `##` section below is one ingest chunk (method + path as title).

Total route patterns: **46**.

## varies /

- **Handler:** module scope
- **Line:** ~649
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/') {`

## prefix /api/*

- **Handler:** module scope
- **Line:** ~594
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `if (!pathLower.startsWith('/api/')) {`

## POST /api/admin/run-retention

- **Handler:** module scope
- **Line:** ~186
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/run-retention' && request.method === 'POST') {`

## POST /api/agent/approve

- **Handler:** module scope
- **Line:** ~527
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/approve' && methodUpper === 'POST') {`

## POST /api/agent/execute

- **Handler:** module scope
- **Line:** ~483
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/execute' && methodUpper === 'POST') {`

## POST /api/agent/workflow/start

- **Handler:** module scope
- **Line:** ~549
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workflow/start' && methodUpper === 'POST') {`

## prefix /api/auth-hooks/*

- **Handler:** module scope
- **Line:** ~394
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/auth-hooks/')) {`

## GET /api/auth/cloudflare/start

- **Handler:** module scope
- **Line:** ~364
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (request.method === 'GET' && pathLower === '/api/auth/cloudflare/start') {`

## GET /api/auth/github/start

- **Handler:** module scope
- **Line:** ~340
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/auth/google/start' || pathLower === '/api/auth/github/start') &&`

## GET /api/auth/google/start

- **Handler:** module scope
- **Line:** ~340
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/auth/google/start' || pathLower === '/api/auth/github/start') &&`

## varies /api/auth/google/start

- **Handler:** module scope
- **Line:** ~345
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `pathLower === '/api/auth/google/start'`

## varies /api/auth/oauth/consent

- **Handler:** module scope
- **Line:** ~390
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `pathLower === '/api/auth/oauth/consent'`

## GET/POST /api/auth/oauth/consent/approve

- **Handler:** module scope
- **Line:** ~379
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/oauth/consent' || pathLower === '/api/auth/oauth/consent/approve' || pathLower === '/api/auth/oauth/consent/deny') &&`

## GET/POST /api/auth/oauth/consent/deny

- **Handler:** module scope
- **Line:** ~379
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/oauth/consent' || pathLower === '/api/auth/oauth/consent/approve' || pathLower === '/api/auth/oauth/consent/deny') &&`

## varies /api/auth/supabase/callback

- **Handler:** module scope
- **Line:** ~374
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/auth/supabase/callback' || pathLower === '/auth/callback/supabase')`

## GET /api/auth/supabase/start

- **Handler:** module scope
- **Line:** ~361
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (request.method === 'GET' && pathLower === '/api/auth/supabase/start') {`

## varies /api/catalog/integrations

- **Handler:** module scope
- **Line:** ~214
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/catalog/integrations') {`

## varies /api/health

- **Handler:** module scope
- **Line:** ~156
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/health' || pathLower === '/health') {`

## varies /api/hooks/supabase

- **Handler:** module scope
- **Line:** ~169
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/supabase' || pathLower === '/api/hooks/supabase') {`

## POST /api/mcp/token/create

- **Handler:** module scope
- **Line:** ~443
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/token/create' && methodUpper === 'POST') {`

## POST /api/mcp/token/revoke

- **Handler:** module scope
- **Line:** ~471
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/token/revoke' && methodUpper === 'POST') {`

## prefix /api/oauth/*

- **Handler:** module scope
- **Line:** ~351
- **Auth:** OAuth state / callback
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/oauth/')) {`

## GET /api/provider-colors

- **Handler:** module scope
- **Line:** ~200
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/provider-colors' && request.method === 'GET') {`

## GET /api/system/health

- **Handler:** module scope
- **Line:** ~423
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/system/health' && request.method === 'GET') {`

## POST /api/test/code-execution-e2e

- **Handler:** module scope
- **Line:** ~175
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/test/code-execution-e2e' && methodUpper === 'POST') {`

## POST /api/webhooks/anthropic

- **Handler:** module scope
- **Line:** ~165
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/anthropic' && methodUpper === 'POST') {`

## POST /api/webhooks/github

- **Handler:** module scope
- **Line:** ~161
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/github' && methodUpper === 'POST') {`

## varies /api/webhooks/supabase

- **Handler:** module scope
- **Line:** ~169
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/supabase' || pathLower === '/api/hooks/supabase') {`

## prefix /assets/*

- **Handler:** module scope
- **Line:** ~317
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/assets/') && env.ASSETS) {`

## varies /auth-signin

- **Handler:** module scope
- **Line:** ~141
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `pathLower === '/auth-signin' ||`

## varies /auth-signin.html

- **Handler:** module scope
- **Line:** ~142
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `pathLower === '/auth-signin.html')`

## prefix /auth/*

- **Handler:** module scope
- **Line:** ~414
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/auth/')) {`

## varies /auth/callback/github

- **Handler:** module scope
- **Line:** ~408
- **Auth:** OAuth state / callback
- **Description:** GitHub OAuth callback (locked handler).
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/callback/github') {`

## varies /auth/callback/google

- **Handler:** module scope
- **Line:** ~403
- **Auth:** OAuth state / callback
- **Description:** Google OAuth callback (locked handler). Uses KV SESSION_CACHE for state.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/callback/google') {`

## varies /auth/callback/supabase

- **Handler:** module scope
- **Line:** ~374
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/auth/supabase/callback' || pathLower === '/auth/callback/supabase')`

## GET/HEAD /auth/register

- **Handler:** module scope
- **Line:** ~126
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((methodUpper === 'GET' || methodUpper === 'HEAD') && pathLower === '/auth/register') {`

## varies /auth/signin

- **Handler:** module scope
- **Line:** ~140
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/auth/signin' ||`

## varies /dashboard

- **Handler:** module scope
- **Line:** ~596
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `pathLower === '/dashboard' ||`

## prefix /dashboard/*

- **Handler:** module scope
- **Line:** ~597
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `pathLower.startsWith('/dashboard/');`

## varies /dashboard/

- **Handler:** module scope
- **Line:** ~659
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/dashboard' || pathLower === '/dashboard/') {`

## varies /health

- **Handler:** module scope
- **Line:** ~156
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/health' || pathLower === '/health') {`

## GET/HEAD /login

- **Handler:** module scope
- **Line:** ~104
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((methodUpper === 'GET' || methodUpper === 'HEAD') && pathLower === '/login') {`

## GET/POST /oauth/consent

- **Handler:** module scope
- **Line:** ~379
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/oauth/consent' || pathLower === '/api/auth/oauth/consent/approve' || pathLower === '/api/auth/oauth/consent/deny') &&`

## varies /onboarding

- **Handler:** module scope
- **Line:** ~674
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/dashboard/') || pathLower === '/onboarding' || pathLower.startsWith('/onboarding/')) {`

## prefix /onboarding/*

- **Handler:** module scope
- **Line:** ~674
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/dashboard/') || pathLower === '/onboarding' || pathLower.startsWith('/onboarding/')) {`

## GET/HEAD /signup

- **Handler:** module scope
- **Line:** ~115
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((methodUpper === 'GET' || methodUpper === 'HEAD') && pathLower === '/signup') {`

