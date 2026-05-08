# IAM worker route map

Auto-generated from `worker.js` (Cloudflare Workers `fetch`, not Express). Each `##` section below is one ingest chunk (method + path as title).

Total route patterns: **45**.

## varies /

- **Handler:** module scope
- **Line:** ~628
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/') {`

## prefix /api/*

- **Handler:** module scope
- **Line:** ~574
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `if (!pathLower.startsWith('/api/')) {`

## POST /api/admin/run-retention

- **Handler:** module scope
- **Line:** ~166
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/run-retention' && request.method === 'POST') {`

## POST /api/agent/approve

- **Handler:** module scope
- **Line:** ~507
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/approve' && methodUpper === 'POST') {`

## POST /api/agent/execute

- **Handler:** module scope
- **Line:** ~463
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/execute' && methodUpper === 'POST') {`

## POST /api/agent/workflow/start

- **Handler:** module scope
- **Line:** ~529
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workflow/start' && methodUpper === 'POST') {`

## prefix /api/auth-hooks/*

- **Handler:** module scope
- **Line:** ~374
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/auth-hooks/')) {`

## GET /api/auth/cloudflare/start

- **Handler:** module scope
- **Line:** ~344
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (request.method === 'GET' && pathLower === '/api/auth/cloudflare/start') {`

## GET /api/auth/github/start

- **Handler:** module scope
- **Line:** ~320
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/auth/google/start' || pathLower === '/api/auth/github/start') &&`

## GET /api/auth/google/start

- **Handler:** module scope
- **Line:** ~320
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/auth/google/start' || pathLower === '/api/auth/github/start') &&`

## varies /api/auth/google/start

- **Handler:** module scope
- **Line:** ~325
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `pathLower === '/api/auth/google/start'`

## varies /api/auth/oauth/consent

- **Handler:** module scope
- **Line:** ~370
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `pathLower === '/api/auth/oauth/consent'`

## GET/POST /api/auth/oauth/consent/approve

- **Handler:** module scope
- **Line:** ~359
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/oauth/consent' || pathLower === '/api/auth/oauth/consent/approve' || pathLower === '/api/auth/oauth/consent/deny') &&`

## GET/POST /api/auth/oauth/consent/deny

- **Handler:** module scope
- **Line:** ~359
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/oauth/consent' || pathLower === '/api/auth/oauth/consent/approve' || pathLower === '/api/auth/oauth/consent/deny') &&`

## varies /api/auth/supabase/callback

- **Handler:** module scope
- **Line:** ~354
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/auth/supabase/callback' || pathLower === '/auth/callback/supabase')`

## GET /api/auth/supabase/start

- **Handler:** module scope
- **Line:** ~341
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (request.method === 'GET' && pathLower === '/api/auth/supabase/start') {`

## varies /api/catalog/integrations

- **Handler:** module scope
- **Line:** ~194
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/catalog/integrations') {`

## varies /api/health

- **Handler:** module scope
- **Line:** ~148
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/health' || pathLower === '/health') {`

## varies /api/hooks/supabase

- **Handler:** module scope
- **Line:** ~161
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/supabase' || pathLower === '/api/hooks/supabase') {`

## POST /api/mcp/token/create

- **Handler:** module scope
- **Line:** ~423
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/token/create' && methodUpper === 'POST') {`

## POST /api/mcp/token/revoke

- **Handler:** module scope
- **Line:** ~451
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/token/revoke' && methodUpper === 'POST') {`

## prefix /api/oauth/*

- **Handler:** module scope
- **Line:** ~331
- **Auth:** OAuth state / callback
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/oauth/')) {`

## GET /api/provider-colors

- **Handler:** module scope
- **Line:** ~180
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/provider-colors' && request.method === 'GET') {`

## GET /api/system/health

- **Handler:** module scope
- **Line:** ~403
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/system/health' && request.method === 'GET') {`

## POST /api/webhooks/anthropic

- **Handler:** module scope
- **Line:** ~157
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/anthropic' && methodUpper === 'POST') {`

## POST /api/webhooks/github

- **Handler:** module scope
- **Line:** ~153
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/github' && methodUpper === 'POST') {`

## varies /api/webhooks/supabase

- **Handler:** module scope
- **Line:** ~161
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/supabase' || pathLower === '/api/hooks/supabase') {`

## prefix /assets/*

- **Handler:** module scope
- **Line:** ~297
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/assets/') && env.ASSETS) {`

## varies /auth-signin

- **Handler:** module scope
- **Line:** ~133
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `pathLower === '/auth-signin' ||`

## varies /auth-signin.html

- **Handler:** module scope
- **Line:** ~134
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `pathLower === '/auth-signin.html')`

## prefix /auth/*

- **Handler:** module scope
- **Line:** ~394
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/auth/')) {`

## varies /auth/callback/github

- **Handler:** module scope
- **Line:** ~388
- **Auth:** OAuth state / callback
- **Description:** GitHub OAuth callback (locked handler).
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/callback/github') {`

## varies /auth/callback/google

- **Handler:** module scope
- **Line:** ~383
- **Auth:** OAuth state / callback
- **Description:** Google OAuth callback (locked handler). Uses KV SESSION_CACHE for state.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/callback/google') {`

## varies /auth/callback/supabase

- **Handler:** module scope
- **Line:** ~354
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/auth/supabase/callback' || pathLower === '/auth/callback/supabase')`

## GET/HEAD /auth/register

- **Handler:** module scope
- **Line:** ~118
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((methodUpper === 'GET' || methodUpper === 'HEAD') && pathLower === '/auth/register') {`

## varies /auth/signin

- **Handler:** module scope
- **Line:** ~132
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/auth/signin' ||`

## varies /dashboard

- **Handler:** module scope
- **Line:** ~576
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `pathLower === '/dashboard' ||`

## prefix /dashboard/*

- **Handler:** module scope
- **Line:** ~577
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `pathLower.startsWith('/dashboard/');`

## varies /dashboard/

- **Handler:** module scope
- **Line:** ~638
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/dashboard' || pathLower === '/dashboard/') {`

## varies /health

- **Handler:** module scope
- **Line:** ~148
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/health' || pathLower === '/health') {`

## GET/HEAD /login

- **Handler:** module scope
- **Line:** ~96
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((methodUpper === 'GET' || methodUpper === 'HEAD') && pathLower === '/login') {`

## GET/POST /oauth/consent

- **Handler:** module scope
- **Line:** ~359
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/oauth/consent' || pathLower === '/api/auth/oauth/consent/approve' || pathLower === '/api/auth/oauth/consent/deny') &&`

## varies /onboarding

- **Handler:** module scope
- **Line:** ~653
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/dashboard/') || pathLower === '/onboarding' || pathLower.startsWith('/onboarding/')) {`

## prefix /onboarding/*

- **Handler:** module scope
- **Line:** ~653
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside module.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/dashboard/') || pathLower === '/onboarding' || pathLower.startsWith('/onboarding/')) {`

## GET/HEAD /signup

- **Handler:** module scope
- **Line:** ~107
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((methodUpper === 'GET' || methodUpper === 'HEAD') && pathLower === '/signup') {`

