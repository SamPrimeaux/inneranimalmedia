# IAM worker route map

Auto-generated from `worker.js` (Cloudflare Workers `fetch`, not Express). Each `##` section below is one ingest chunk (method + path as title).

Total route patterns: **400**.

## varies /

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6790
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/' || path === '/index.html') {`

## prefix /api/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6880
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (env.DASHBOARD && !pathLower.startsWith('/api/')) {`

## GET/POST /api/admin/archive-conversations

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3963
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/archive-conversations' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/admin/cleanup/stuck-runs

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3975
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/cleanup/stuck-runs' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/admin/db-health

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3998
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/db-health' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET/POST /api/admin/overnight/start

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3932
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/admin/overnight/validate' || pathLower === '/api/admin/overnight/start') && (request.method || 'GET').toUpperCase() === 'POST') {`

## varies /api/admin/overnight/start

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3941
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/overnight/start') {`

## GET/POST /api/admin/overnight/validate

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3932
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/admin/overnight/validate' || pathLower === '/api/admin/overnight/start') && (request.method || 'GET').toUpperCase() === 'POST') {`

## varies /api/admin/overnight/validate

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3937
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/overnight/validate') {`

## GET/POST /api/admin/rag-backfill

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4146
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/admin/rag-backfill' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/admin/reindex-codebase

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4141
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/reindex-codebase' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/admin/retention

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3947
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/retention' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET/POST /api/admin/trigger-workflow

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4274
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/trigger-workflow' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/admin/vectorize-kb

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4086
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/vectorize-kb' && (request.method || 'GET').toUpperCase() === 'POST') {`

## prefix /api/agent*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4570
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## prefix /api/agent-sam/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3369
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower.startsWith('/api/agent-sam/')) {`

## POST /api/agent-sam/agent-runs

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3378
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent-sam/agent-runs' && methodUpper === 'POST') {`

## POST /api/agent-sam/deployments

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3400
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent-sam/deployments' && methodUpper === 'POST') {`

## varies /api/agent/boot

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18017
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/boot') {`

## GET /api/agent/bootstrap

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19823
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/bootstrap' && method === 'GET') {`

## POST /api/agent/browse

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17395
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/browse' && method === 'POST') {`

## POST /api/agent/chat

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19164
- **Auth:** usually session (see handler)
- **Description:** Main Agent Sam chat. JSON body: messages, model_id, mode, stream, tools. Runs AutoRAG (AI Search) when enabled; prepends pgvector `match_documents` context when HYPERDRIVE is bound.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/chat' && method === 'POST') {`

## POST /api/agent/chat/execute-approved-tool

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19456
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/chat/execute-approved-tool' && method === 'POST') {`

## varies /api/agent/cicd

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19257
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/cicd') {`

## GET /api/agent/commands

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17550
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/commands' && method === 'GET') {`

## POST /api/agent/commands/execute

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4554
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/commands/execute' && request.method === 'POST') {`

## GET /api/agent/context-picker/catalog

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17768
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/context-picker/catalog' && method === 'GET') {`

## GET /api/agent/context/bootstrap

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19801
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/context/bootstrap' && method === 'GET') {`

## GET /api/agent/conversations/search

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18109
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/conversations/search' && method === 'GET') {`

## GET /api/agent/db/query-history

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17896
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/db/query-history' && method === 'GET') {`

## POST /api/agent/db/query-history

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17899
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/db/query-history' && method === 'POST') {`

## GET /api/agent/db/snippets

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17902
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/db/snippets' && method === 'GET') {`

## POST /api/agent/db/snippets

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17905
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/db/snippets' && method === 'POST') {`

## GET /api/agent/db/tables

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17879
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/db/tables' && method === 'GET') {`

## GET /api/agent/do-history

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19169
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/do-history' && method === 'GET') {`

## GET /api/agent/git/status

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17940
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/git/status' && method === 'GET') {`

## POST /api/agent/git/sync

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17969
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/git/sync' && method === 'POST') {`

## GET /api/agent/keyboard-shortcuts

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17674
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/keyboard-shortcuts' && method === 'GET') {`

## varies /api/agent/mcp

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19250
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/agent/mcp') {`

## GET /api/agent/memory/list

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17853
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/memory/list' && method === 'GET') {`

## POST /api/agent/memory/sync

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17909
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/memory/sync' && method === 'POST') {`

## varies /api/agent/models

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18785
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/models') {`

## GET /api/agent/modes

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17517
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/modes' && method === 'GET') {`

## GET /api/agent/notifications

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17726
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/notifications' && method === 'GET') {`

## POST /api/agent/plan/approve

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19422
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/plan/approve' && method === 'POST') {`

## POST /api/agent/plan/reject

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19439
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/plan/reject' && method === 'POST') {`

## POST /api/agent/playwright

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19188
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, MYBROWSER
- **Code:** `if (pathLower === '/api/agent/playwright' && method === 'POST') {`

## GET /api/agent/playwright/jobs

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19226
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, MYBROWSER
- **Code:** `if (pathLower === '/api/agent/playwright/jobs' && method === 'GET') {`

## prefix /api/agent/playwright/jobs/*

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19233
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handleAgentApi.
- **Bindings (typical):** AI, DB, HYPERDRIVE, MYBROWSER
- **Code:** `if (pathLower.startsWith('/api/agent/playwright/jobs/') && method === 'GET') {`

## GET /api/agent/problems

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17599
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/problems' && method === 'GET') {`

## GET /api/agent/proposals/pending

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19077
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/proposals/pending' && method === 'GET') {`

## POST /api/agent/propose

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18978
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/propose' && method === 'POST') {`

## POST /api/agent/queue

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19353
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/queue' && method === 'POST') {`

## GET /api/agent/queue/status

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19378
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/queue/status' && method === 'GET') {`

## POST /api/agent/r2-save

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19893
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DASHBOARD, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/r2-save' && method === 'POST') {`

## POST /api/agent/rag/compact-chats

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19333
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/compact-chats' && method === 'POST') {`

## POST /api/agent/rag/index-memory

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19320
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/index-memory' && method === 'POST') {`

## POST /api/agent/rag/query

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19285
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/query' && method === 'POST') {`

## GET /api/agent/rag/status

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19309
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/status' && method === 'GET') {`

## POST /api/agent/reindex-codebase

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17924
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/reindex-codebase' && method === 'POST') {`

## GET /api/agent/rules

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2521
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `(pathLower === '/api/agent/rules' && method === 'GET') ||`

## POST /api/agent/session/mode

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17573
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/session/mode' && method === 'POST') {`

## varies /api/agent/session/ws

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6755
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/session/ws' && env.IAM_COLLAB) {`

## varies /api/agent/sessions

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18826
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/sessions') {`

## GET /api/agent/subagent-profiles

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17195
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/subagent-profiles' && method === 'GET') {`

## varies /api/agent/telemetry

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19274
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/telemetry') {`

## POST /api/agent/terminal/complete

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18339
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/complete' && method === 'POST') {`

## GET /api/agent/terminal/config-status

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18278
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/config-status' && method === 'GET') {`

## POST /api/agent/terminal/run

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18311
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/run' && method === 'POST') {`

## GET /api/agent/terminal/socket-url

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18265
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/socket-url' && method === 'GET') {`

## GET /api/agent/terminal/status

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18300
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/status' && method === 'GET') {`

## GET /api/agent/terminal/ws

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18306
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agent/terminal/ws' || pathLower === '/api/terminal/ws') && method === 'GET') {`

## GET /api/agent/today-todo

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19747
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/today-todo' && method === 'GET') {`

## PUT /api/agent/today-todo

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19774
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/today-todo' && method === 'PUT') {`

## POST /api/agent/vertex-test

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17491
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/vertex-test' && method === 'POST') {`

## POST /api/agent/workers-ai/image

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18881
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workers-ai/image' && method === 'POST') {`

## POST /api/agent/workers-ai/stt

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18948
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workers-ai/stt' && method === 'POST') {`

## POST /api/agent/workers-ai/tts

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18917
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workers-ai/tts' && method === 'POST') {`

## POST /api/agent/workflows/trigger

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19090
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workflows/trigger' && method === 'POST') {`

## varies /api/agentsam

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4560
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower.startsWith('/api/agentsam/') || pathLower === '/api/agentsam') {`

## prefix /api/agentsam/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4560
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower.startsWith('/api/agentsam/') || pathLower === '/api/agentsam') {`

## GET /api/agentsam/ai

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21386
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ai' && method === 'GET') {`

## DELETE /api/agentsam/autorag/files

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21313
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/files' && method === 'DELETE') {`

## GET /api/agentsam/autorag/files

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21284
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/files' && method === 'GET') {`

## POST /api/agentsam/autorag/search

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21337
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/search' && method === 'POST') {`

## GET /api/agentsam/autorag/stats

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21276
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/stats' && method === 'GET') {`

## POST /api/agentsam/autorag/sync

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21305
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/sync' && method === 'POST') {`

## POST /api/agentsam/autorag/upload

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21322
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/upload' && method === 'POST') {`

## GET /api/agentsam/cmd-allowlist

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20575
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'GET') {`

## POST /api/agentsam/cmd-allowlist

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20589
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'POST') {`

## GET /api/agentsam/command-allowlist

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20575
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'GET') {`

## POST /api/agentsam/command-allowlist

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20589
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'POST') {`

## GET /api/agentsam/config

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20409
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/config' && method === 'GET') {`

## GET /api/agentsam/feature-flags

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20823
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/feature-flags' && method === 'GET') {`

## GET /api/agentsam/fetch-allowlist

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20732
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-allowlist' && method === 'GET') {`

## POST /api/agentsam/fetch-allowlist

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20746
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-allowlist' && method === 'POST') {`

## GET /api/agentsam/fetch-domains

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20678
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-domains' && method === 'GET') {`

## POST /api/agentsam/fetch-domains

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20692
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-domains' && method === 'POST') {`

## GET /api/agentsam/hooks

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20467
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/hooks' && method === 'GET') {`

## POST /api/agentsam/hooks

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20505
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/hooks' && method === 'POST') {`

## GET /api/agentsam/ignore-patterns

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21174
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns' && method === 'GET') {`

## PATCH /api/agentsam/ignore-patterns

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21184
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns' && method === 'PATCH') {`

## POST /api/agentsam/ignore-patterns

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21151
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns' && method === 'POST') {`

## PATCH /api/agentsam/ignore-patterns/reorder

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21082
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns/reorder' && method === 'PATCH') {`

## GET /api/agentsam/index-status

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21213
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/index-status' && method === 'GET') {`

## GET /api/agentsam/indexing-summary

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21234
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/indexing-summary' && method === 'GET') {`

## GET /api/agentsam/mcp-allowlist

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20623
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/agentsam/mcp-allowlist' && method === 'GET') {`

## POST /api/agentsam/mcp-allowlist

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20637
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/agentsam/mcp-allowlist' && method === 'POST') {`

## GET /api/agentsam/rules

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20905
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/rules' && method === 'GET') {`

## POST /api/agentsam/rules

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20915
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/rules' && method === 'POST') {`

## GET /api/agentsam/runs

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21345
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/runs' && method === 'GET') {`

## GET /api/agentsam/skills

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20998
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/skills' && method === 'GET') {`

## POST /api/agentsam/skills

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~21015
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/skills' && method === 'POST') {`

## GET /api/agentsam/subagents

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20929
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/subagents' && method === 'GET') {`

## POST /api/agentsam/subagents

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20940
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/subagents' && method === 'POST') {`

## GET /api/agentsam/tools-registry

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20658
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/tools-registry' && method === 'GET') {`

## DELETE /api/agentsam/trusted-origins

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20812
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/trusted-origins' && method === 'DELETE') {`

## GET /api/agentsam/trusted-origins

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20786
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/trusted-origins' && method === 'GET') {`

## POST /api/agentsam/trusted-origins

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20796
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/trusted-origins' && method === 'POST') {`

## GET /api/agentsam/user-policy

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20435
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/user-policy' && method === 'GET') {`

## PATCH /api/agentsam/user-policy

- **Handler:** handleAgentsamApi (lines 20357-21432)
- **Line:** ~20445
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/user-policy' && method === 'PATCH') {`

## GET /api/ai/guardrails

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2515
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/guardrails' && method === 'GET') ||`

## GET /api/ai/integrations

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2520
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/integrations' && method === 'GET') ||`

## GET /api/ai/models

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2629
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/models' && method === 'GET') {`

## GET/PATCH /api/ai/models

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2516
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/models' && method === 'GET') ||`

## GET /api/ai/routing-rules

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2657
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/routing-rules' && method === 'GET') {`

## GET/POST/PATCH/DELETE /api/ai/routing-rules

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2518
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/routing-rules' && (method === 'GET' || method === 'POST')) ||`

## POST /api/ai/routing-rules

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2663
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/routing-rules' && method === 'POST') {`

## POST /api/ai/smoke-test

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4580
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/smoke-test' && request.method === 'POST') {`

## GET /api/ai/test-runs

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4584
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/test-runs' && request.method === 'GET') {`

## GET /api/app-icons

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2533
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/app-icons' && method === 'GET') ||`

## GET/POST /api/auth/backup-code

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3924
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/backup-code' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/auth/login

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3921
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/login' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/auth/logout

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3927
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/logout' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/auth/signup

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3915
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/signup' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/auth/verify-email

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3918
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/verify-email' && (request.method || 'GET').toUpperCase() === 'GET') {`

## prefix /api/billing*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3342
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/billing') || pathLower === '/api/webhooks/stripe') {`

## varies /api/billing/summary

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3869
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/billing/summary') {`

## prefix /api/browser/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3774
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower.startsWith('/api/browser/')) {`

## varies /api/browser/health

- **Handler:** handleBrowserRequest (lines 7126-7464)
- **Line:** ~7206
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/browser/health') {`

## varies /api/browser/metrics

- **Handler:** handleBrowserRequest (lines 7126-7464)
- **Line:** ~7215
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/browser/metrics') {`

## GET /api/browser/screenshot

- **Handler:** handleBrowserRequest (lines 7126-7464)
- **Line:** ~7137
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/browser/screenshot' && method === 'GET') {`

## varies /api/cad

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3482
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/cad/') || pathLower === '/api/cad') return (await import('./src/api/cad.js')).handleCadApi(request, url, env, ctx);`

## prefix /api/cad/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3482
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/cad/') || pathLower === '/api/cad') return (await import('./src/api/cad.js')).handleCadApi(request, url, env, ctx);`

## varies /api/chat

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4570
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## prefix /api/cicd/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4625
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/cicd/')) {`

## GET /api/cicd/current

- **Handler:** handleCidiApi (lines 22090-22398)
- **Line:** ~22098
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/cicd/current' && method === 'GET') {`

## POST /api/cicd/run

- **Handler:** handleCidiApi (lines 22090-22398)
- **Line:** ~22106
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/cicd/run' && method === 'POST') {`

## GET /api/cicd/runs

- **Handler:** handleCidiApi (lines 22090-22398)
- **Line:** ~22310
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/cicd/runs' && method === 'GET') {`

## varies /api/clients

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3844
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/clients') {`

## GET /api/cloudflare/workers/list

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4660
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/cloudflare/workers/list' && (request.method || 'GET').toUpperCase() === 'GET') {`

## prefix /api/cms/pages/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4598
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/cms/pages/')) {`

## varies /api/colors/all

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3834
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/colors/all') {`

## GET /api/commands

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4799
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/commands' && request.method === 'GET') {`

## GET /api/commands/custom

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2792
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/commands/custom' && method === 'GET') {`

## GET/POST /api/commands/custom

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2522
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/commands/custom' && method === 'GET') ||`

## GET/POST /api/d1/query

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5412
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/d1/query' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/d1/tables

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5205
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/d1/tables' && (request.method || 'GET').toUpperCase() === 'GET') {`

## POST /api/dashboard/d1/query

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3233
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (request.method === 'POST' && url.pathname === '/api/dashboard/d1/query') {`

## GET /api/dashboard/d1/tables

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3222
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (request.method === 'GET' && url.pathname === '/api/dashboard/d1/tables') {`

## prefix /api/dashboard/time-track*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3823
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/dashboard/time-track')) {`

## POST /api/dashboard/time-track/manual

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3817
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/dashboard/time-track/manual' && request.method === 'POST') {`

## GET/POST /api/database/execute

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5757
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/database/execute' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/database/query-history

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5761
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/database/query-history' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET/POST /api/database/snippets

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5765
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/database/snippets' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/db/connections

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5661
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/db/connections' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET/POST /api/db/connections

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5686
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/db/connections' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/db/connections/test

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5730
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/db/connections/test' && (request.method || 'GET').toUpperCase() === 'POST') {`

## POST /api/deploy/rollback

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2537
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/deploy/rollback' && method === 'POST');`

## GET/POST /api/deployments/log

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3511
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/deployments/log' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/deployments/recent

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3514
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/deployments/recent' && (request.method || 'GET').toUpperCase() === 'GET') {`

## prefix /api/designstudio/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3478
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/internal/designstudio/') || pathLower.startsWith('/api/designstudio/')) {`

## prefix /api/draw*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4565
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower.startsWith('/api/draw')) {`

## GET /api/draw/libraries

- **Handler:** handleDrawApi (lines 16796-17133)
- **Line:** ~16863
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/draw/libraries' && method === 'GET') {`

## GET /api/draw/list

- **Handler:** handleDrawApi (lines 16796-17133)
- **Line:** ~16843
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/draw/list' && method === 'GET') {`

## GET /api/draw/load

- **Handler:** handleDrawApi (lines 16796-17133)
- **Line:** ~16874
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/draw/load' && method === 'GET') {`

## POST /api/draw/save

- **Handler:** handleDrawApi (lines 16796-17133)
- **Line:** ~16805
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/draw/save' && method === 'POST') {`

## DELETE /api/drive/delete

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~16229
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/drive/delete' && method === 'DELETE') {`

## POST /api/drive/file

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~16060
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/drive/file' && method === 'POST') {`

## POST /api/drive/folder

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~16180
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/drive/folder' && method === 'POST') {`

## GET /api/drive/get

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~16042
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/drive/get' && method === 'GET') {`

## GET /api/drive/list

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~16026
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/drive/list' && method === 'GET') {`

## GET /api/drive/search

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~16114
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/drive/search' && method === 'GET') {`

## varies /api/drive/sync

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4616
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/drive/sync') {`

## POST /api/drive/upload

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~16131
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/drive/upload' && method === 'POST') {`

## varies /api/email/inbound

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3438
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/email/inbound') {`

## prefix /api/env/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4961
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/env/')) {`

## GET /api/env/audit

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5022
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/audit' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/env/secrets

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5011
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/secrets' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET/POST /api/env/secrets

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5036
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/secrets' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/env/secrets/reveal

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5062
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/secrets/reveal' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/env/spend

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4963
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/spend' && (request.method || 'GET').toUpperCase() === 'GET') {`

## prefix /api/finance/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3839
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/finance/')) {`

## GET/POST /api/founder/log

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3829
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/founder/log' && (request.method || 'GET').toUpperCase() === 'POST') {`

## POST /api/generate

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4603
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/generate' && methodUpper === 'POST') {`

## GET /api/github/repos

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~15900
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/github/repos' && method === 'GET') {`

## varies /api/health

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3297
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/api/health' || pathLower === '/api/health') {`

## varies /api/hooks/cursor

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3463
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/cursor') {`

## GET /api/hooks/executions

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2530
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/hooks/executions' && method === 'GET') ||`

## GET /api/hooks/health

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3434
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/webhooks/health' || pathLower === '/api/hooks/health') && methodUpper === 'GET') {`

## varies /api/hooks/internal

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3469
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/internal') {`

## varies /api/hooks/stripe

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3466
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/stripe') {`

## GET /api/hooks/subscriptions

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2798
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/subscriptions' && method === 'GET') {`

## GET/POST/PATCH /api/hooks/subscriptions

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2523
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/hooks/subscriptions' && (method === 'GET' || method === 'POST')) ||`

## POST /api/hooks/subscriptions

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2837
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/subscriptions' && method === 'POST') {`

## PATCH /api/hooks/subscriptions/reorder

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2867
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/subscriptions/reorder' && method === 'PATCH') {`

## PATCH/DELETE /api/hooks/subscriptions/reorder

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2524
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/hooks/subscriptions/reorder' && method === 'PATCH') ||`

## varies /api/hooks/supabase

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3472
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/supabase') {`

## prefix /api/hub/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3854
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/hub/')) {`

## GET /api/hyperdrive/health

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5449
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/hyperdrive/status' || pathLower === '/api/hyperdrive/health') && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET/POST /api/hyperdrive/query

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5600
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hyperdrive/query' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/hyperdrive/status

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5449
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/hyperdrive/status' || pathLower === '/api/hyperdrive/health') && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/hyperdrive/tables

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5470
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hyperdrive/tables' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/images

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19643
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/images' && method === 'GET') {`

## POST /api/images

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19673
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/images' && method === 'POST') {`

## prefix /api/images*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4570
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## prefix /api/images/*

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19720
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handleAgentApi.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/images/') && pathLower.endsWith('/meta')) {`

## GET /api/integrations/drive/list

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19489
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/integrations/drive/list' && method === 'GET') {`

## GET /api/integrations/gdrive/file

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19508
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/gdrive/file') {`

## GET /api/integrations/gdrive/files

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19496
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/gdrive/files') {`

## GET /api/integrations/github/file

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19546
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/github/file') {`

## GET /api/integrations/github/files

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19532
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/github/files') {`

## GET /api/integrations/github/list

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19492
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/integrations/github/list' && method === 'GET') {`

## GET /api/integrations/github/repos

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19520
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/github/repos') {`

## GET/POST /api/internal/deploy-complete

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3602
- **Auth:** internal / optional secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/internal/deploy-complete') {`

## prefix /api/internal/designstudio/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3478
- **Auth:** internal / optional secret
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/internal/designstudio/') || pathLower.startsWith('/api/designstudio/')) {`

## GET/POST /api/internal/post-deploy

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3485
- **Auth:** internal / optional secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/internal/post-deploy') {`

## GET/POST /api/internal/record-deploy

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3519
- **Auth:** internal / optional secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/internal/record-deploy') {`

## GET /api/knowledge

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2917
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/knowledge' && method === 'GET') {`

## GET/POST /api/knowledge

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2531
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/knowledge' && method === 'GET') ||`

## POST /api/knowledge/crawl

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2924
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/knowledge/crawl' && method === 'POST') {`

## POST/GET /api/knowledge/crawl

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2532
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/knowledge/crawl' && method === 'POST') ||`

## GET /api/loading-states

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18081
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/loading-states' && (method || 'GET').toUpperCase() === 'GET') {`

## varies /api/loading-states

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4570
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## prefix /api/mcp/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4621
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower.startsWith('/api/mcp/')) {`

## GET /api/mcp/a11y

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21590
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/a11y') {`

## GET /api/mcp/agents

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21482
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/mcp/agents' && method === 'GET') {`

## GET /api/mcp/audit

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21461
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/audit' && method === 'GET') {`

## GET /api/mcp/commands

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21521
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/commands' && method === 'GET') {`

## GET /api/mcp/credentials

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21453
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/credentials' && method === 'GET') {`

## POST /api/mcp/dispatch

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21529
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/dispatch' && method === 'POST') {`

## GET /api/mcp/imgx

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21633
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/imgx') {`

## POST /api/mcp/invoke

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21884
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/invoke' && method === 'POST') {`

## GET /api/mcp/server-allowlist

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21445
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/server-allowlist' && method === 'GET') {`

## GET /api/mcp/services

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21777
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/services') {`

## GET /api/mcp/services/health

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21648
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/services/health' && method === 'GET') {`

## GET /api/mcp/stats

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21470
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/stats' && method === 'GET') {`

## GET /api/mcp/status

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21479
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/status' && method === 'GET') {`

## POST /api/mcp/stream

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21801
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/stream' && method === 'POST') {`

## GET /api/mcp/tools

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21505
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/tools' && method === 'GET') {`

## GET /api/mcp/workflows

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21926
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/workflows' && method === 'GET') {`

## POST /api/mcp/workflows

- **Handler:** handleMcpApi (lines 21433-22089)
- **Line:** ~21930
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/workflows' && method === 'POST') {`

## GET /api/meshy/latest

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4613
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/meshy/latest' && methodUpper === 'GET') {`

## varies /api/models

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4570
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## POST /api/monaco/complete

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18482
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/monaco/complete' && method === 'POST') {`

## varies /api/oauth/github/callback

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3907
- **Auth:** OAuth state / callback
- **Description:** GitHub OAuth redirect URI used by worker.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/github/callback') {`

## varies /api/oauth/github/start

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3904
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/github/start') {`

## varies /api/oauth/google/callback

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3896
- **Auth:** OAuth state / callback
- **Description:** Google OAuth redirect URI used by worker.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/google/callback') {`

## varies /api/oauth/google/start

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3893
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/google/start') {`

## varies /api/overview/activity-strip

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3788
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/activity-strip') {`

## varies /api/overview/agent-activity

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3797
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/overview/agent-activity') {`

## varies /api/overview/checkpoints

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3785
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/checkpoints') {`

## varies /api/overview/commands-workflows

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3812
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/commands-workflows') {`

## varies /api/overview/deployments

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3800
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/deployments') {`

## varies /api/overview/finance-charts

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3794
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/finance-charts') {`

## varies /api/overview/goals-launch

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3803
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/goals-launch') {`

## varies /api/overview/kpi-strip

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3791
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/kpi-strip') {`

## varies /api/overview/mcp-health

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3809
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/overview/mcp-health') {`

## varies /api/overview/recent-activity

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3782
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/recent-activity') {`

## varies /api/overview/stats

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3779
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/stats') {`

## varies /api/overview/time-founder

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3806
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/time-founder') {`

## GET /api/platform/d1-health

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5386
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/platform/d1-health' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/platform/kv-health

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5350
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/platform/kv-health' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET/DELETE /api/platform/kv/flush

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5365
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/platform/kv/flush' && (request.method || 'GET').toUpperCase() === 'DELETE') {`

## prefix /api/playwright*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4570
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## POST /api/playwright/screenshot

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18671
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/playwright/screenshot' && method === 'POST') {`

## varies /api/projects

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3849
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/projects') {`

## GET /api/provider-colors

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3306
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/provider-colors' && methodUpper === 'GET') {`

## prefix /api/r2/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4639
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower.startsWith('/api/r2/')) {`

## GET /api/r2/buckets

- **Handler:** handleR2Api (lines 16251-16795)
- **Line:** ~16256
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/buckets' && method === 'GET') {`

## POST /api/r2/buckets/bulk-action

- **Handler:** handleR2Api (lines 16251-16795)
- **Line:** ~16546
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/buckets/bulk-action' && method === 'POST') {`

## DELETE /api/r2/delete

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~15855
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/delete' && method === 'DELETE') {`

## DELETE /api/r2/file

- **Handler:** handleR2Api (lines 16251-16795)
- **Line:** ~16519
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/file' && method === 'DELETE') {`

## GET /api/r2/file

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~15743
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/file' && method === 'GET') {`

## POST /api/r2/file

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~15787
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/file' && method === 'POST') {`

## GET /api/r2/get

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~15718
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/get' && method === 'GET') {`

## GET /api/r2/list

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~15711
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/list' && method === 'GET') {`

## PUT /api/r2/move

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~15875
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/move' && method === 'PUT') {`

## GET /api/r2/search

- **Handler:** handleR2Api (lines 16251-16795)
- **Line:** ~16453
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DASHBOARD, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/r2/search' && method === 'GET') {`

## GET /api/r2/stats

- **Handler:** handleR2Api (lines 16251-16795)
- **Line:** ~16260
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/stats' && method === 'GET' && url.searchParams.get('bucket')) {`

## varies /api/r2/stats

- **Handler:** handleR2Api (lines 16251-16795)
- **Line:** ~16320
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/stats' && !url.searchParams.get('bucket')) {`

## POST /api/r2/sync

- **Handler:** handleR2Api (lines 16251-16795)
- **Line:** ~16269
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/sync' && method === 'POST') {`

## POST /api/r2/upload

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~15810
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/upload' && method === 'POST') {`

## GET /api/r2/url

- **Handler:** handleR2Api (lines 16251-16795)
- **Line:** ~16531
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/url' && method === 'GET') {`

## POST /api/rag/feedback

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6049
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/rag/feedback' && request.method === 'POST') {`

## POST /api/rag/ingest

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5897
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/rag/ingest' && request.method === 'POST') {`

## POST /api/rag/ingest-batch

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5930
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/rag/ingest-batch' && request.method === 'POST') {`

## POST /api/rag/query

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5977
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/rag/query' && request.method === 'POST') {`

## GET /api/rag/status

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6076
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/rag/status' && methodUpper === 'GET') {`

## DELETE /api/screenshots

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19625
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/screenshots' && method === 'DELETE') {`

## GET /api/screenshots

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19562
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/screenshots' && method === 'GET') {`

## prefix /api/screenshots*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4570
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## GET /api/screenshots/asset

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~19599
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/screenshots/asset' && method === 'GET') {`

## varies /api/search

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6089
- **Auth:** usually session (see handler)
- **Description:** POST/GET search. With HYPERDRIVE: embed query (bge-large-en-v1.5) and `match_documents` via pg; else Vectorize `vectorizeRagSearch`. Logs to ai_rag_search_history.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search') {`

## GET /api/search/debug

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5786
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/debug' && (request.method || 'GET').toUpperCase() === 'GET') {`

## POST /api/search/docs

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5815
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/docs' && request.method === 'POST') {`

## POST /api/search/docs/index

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5882
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/docs/index' && request.method === 'POST') {`

## GET /api/search/docs/status

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5857
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/docs/status' && request.method === 'GET') {`

## POST /api/search/federated

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5770
- **Auth:** usually session (see handler)
- **Description:** POST federated search across configured sources; `handleFederatedSearch`.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/search/federated' && methodUpper === 'POST') {`

## GET /api/settings

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2543
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings' && method === 'GET') {`

## GET/PATCH /api/settings

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2513
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings' && method === 'GET' && (url.searchParams.get('category') || '').trim()) ||`

## PATCH /api/settings/agent-config

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2737
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/settings/agent-config' && method === 'PATCH') {`

## PATCH/GET /api/settings/agent-config

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2528
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `(pathLower === '/api/settings/agent-config' && method === 'PATCH') ||`

## PATCH /api/settings/appearance

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2550
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/appearance' && method === 'PATCH') {`

## PATCH/GET /api/settings/appearance

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2514
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/appearance' && method === 'PATCH') ||`

## prefix /api/settings/avatar*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6204
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/settings/avatar') && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/settings/deploy-context

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2526
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/deploy-context' && method === 'GET') ||`

## GET /api/settings/docs-providers

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2579
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/docs-providers' && method === 'GET') {`

## GET/PATCH /api/settings/docs-providers

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2527
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/docs-providers' && method === 'GET') ||`

## GET /api/settings/emails

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6390
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'GET' && pathLower === '/api/settings/emails') {`

## GET /api/settings/marketplace-catalog

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2529
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/marketplace-catalog' && method === 'GET') ||`

## GET /api/settings/preferences

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6223
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/preferences') {`

## GET /api/settings/profile

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6116
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/profile') {`

## GET/POST /api/settings/profile/avatar

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6179
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/profile/avatar' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/settings/security/backup-codes/generate

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6293
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/security/backup-codes/generate' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/settings/security/change-password

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6274
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/security/change-password' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/settings/sessions

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6347
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/sessions' && (request.method || 'GET').toUpperCase() === 'GET') {`

## varies /api/settings/theme

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6658
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/settings/theme') {`

## PUT/PATCH /api/settings/workspace/default

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6622
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/workspace/default' && (request.method === 'PUT' || request.method === 'PATCH')) {`

## GET /api/settings/workspaces

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6494
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/workspaces' || pathLower === '/api/workspaces') {`

## GET/POST /api/settings/workspaces/active

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6597
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/workspaces/active' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/spend

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2534
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/spend' && method === 'GET') ||`

## GET /api/spend/summary

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2535
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/spend/summary' && method === 'GET') ||`

## GET /api/spend/unified

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2998
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/spend/unified' && method === 'GET') {`

## GET/POST /api/spend/unified

- **Handler:** handlePhase1PlatformD1Routes (lines 2510-3036)
- **Line:** ~2536
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/spend/unified' && method === 'GET') ||`

## prefix /api/storage*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4634
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/storage')) {`

## GET /api/system/health

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3320
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/system/health' && methodUpper === 'GET') {`

## prefix /api/telemetry*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4570
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## GET /api/telemetry/summary

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17439
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/telemetry/summary' && method === 'GET') {`

## GET /api/telemetry/tools

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~17467
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/telemetry/tools' && method === 'GET') {`

## GET/POST /api/telemetry/v1/traces

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3672
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/telemetry/v1/traces') {`

## prefix /api/terminal*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4570
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## GET /api/terminal/agents

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18443
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/terminal/agents' && method === 'GET') {`

## POST /api/terminal/assist

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18371
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/terminal/assist' && method === 'POST') {`

## GET /api/terminal/commands

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18464
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/terminal/commands' && method === 'GET') {`

## POST /api/terminal/session/register

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18119
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/terminal/session/register' && method === 'POST') {`

## GET /api/terminal/session/resume

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18215
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/terminal/session/resume' && method === 'GET') {`

## GET /api/terminal/sessions

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18246
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/terminal/sessions' && method === 'GET') {`

## GET /api/terminal/ws

- **Handler:** handleAgentApi (lines 17190-19938)
- **Line:** ~18306
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/agent/terminal/ws' || pathLower === '/api/terminal/ws') && method === 'GET') {`

## GET /api/themes

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4863
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/themes' && request.method === 'GET') {`

## GET /api/themes/active

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4877
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/themes/active' && request.method === 'GET') {`

## POST /api/themes/apply

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4920
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/themes/apply' && request.method === 'POST') {`

## GET/POST /api/timers/start

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3826
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/timers/start' && (request.method || 'GET').toUpperCase() === 'POST') {`

## prefix /api/tools-proxy/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3262
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/tools-proxy/') && env.DASHBOARD) {`

## POST /api/tools/image/generate

- **Handler:** handleDrawApi (lines 16796-17133)
- **Line:** ~16931
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/tools/image/generate' && method === 'POST') {`

## GET/POST /api/tunnel/restart

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4769
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/tunnel/restart' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/tunnel/status

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4717
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/tunnel/status' && (request.method || 'GET').toUpperCase() === 'GET') {`

## POST /api/unified-search

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5775
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/unified-search' && methodUpper === 'POST') {`

## GET /api/unified-search/recent

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5778
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/unified-search/recent' && methodUpper === 'GET') {`

## POST /api/unified-search/track

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5781
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/unified-search/track' && methodUpper === 'POST') {`

## prefix /api/vault*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4955
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB, SESSION_CACHE
- **Code:** `if (pathLower.startsWith('/api/vault')) {`

## GET /api/version

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~15643
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/version' && method === 'GET') {`

## varies /api/webhooks/cloudflare

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3451
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/cloudflare') {`

## varies /api/webhooks/cursor

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3448
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/cursor') {`

## GET /api/webhooks/health

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3434
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/webhooks/health' || pathLower === '/api/hooks/health') && methodUpper === 'GET') {`

## varies /api/webhooks/internal

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3460
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/internal') {`

## varies /api/webhooks/openai

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3457
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/openai') {`

## varies /api/webhooks/resend

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3441
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/resend') {`

## varies /api/webhooks/stripe

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3342
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/billing') || pathLower === '/api/webhooks/stripe') {`

## varies /api/webhooks/supabase

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3454
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/supabase') {`

## GET /api/workers

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4644
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/workers' && (request.method || 'GET').toUpperCase() === 'GET') {`

## POST /api/workflow/run

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~4313
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/workflow/run' && methodUpper === 'POST') {`

## prefix /api/workspace*

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~15705
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handleIamExplorerApi.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/workspaces') || pathLower.startsWith('/api/workspace')) {`

## POST /api/workspace/create

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6398
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/workspace/create' && (request.method || '').toUpperCase() === 'POST') {`

## GET /api/workspace/settings

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~5162
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/workspace/settings' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/workspaces

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6494
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/workspaces' || pathLower === '/api/workspaces') {`

## prefix /api/workspaces*

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~15705
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handleIamExplorerApi.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/workspaces') || pathLower.startsWith('/api/workspace')) {`

## GET /api/workspaces/current/shell

- **Handler:** handleIamExplorerApi (lines 15638-16250)
- **Line:** ~15668
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/workspaces/current/shell' && method === 'GET') {`

## varies /auth/callback/github

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3910
- **Auth:** OAuth state / callback
- **Description:** GitHub OAuth callback (locked handler).
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/callback/github') {`

## varies /auth/callback/google

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3899
- **Auth:** OAuth state / callback
- **Description:** Google OAuth callback (locked handler). Uses KV SESSION_CACHE for state.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/callback/google') {`

## varies /auth/login

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6801
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/login' || pathLower === '/auth/signin') {`

## varies /auth/register

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6807
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/signup' || pathLower === '/auth/register') {`

## varies /auth/reset

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6818
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/reset' || pathLower === '/auth/reset') {`

## varies /auth/signin

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6801
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/login' || pathLower === '/auth/signin') {`

## varies /auth/signup

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6812
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/signup') {`

## prefix /chat/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6883
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `const wildcardTopLevel = pathLower.startsWith('/settings/') || pathLower.startsWith('/chat/') || pathLower.startsWith('/workspace/') || pathLower.startsWith('/cms/');`

## prefix /cms/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6883
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `const wildcardTopLevel = pathLower.startsWith('/settings/') || pathLower.startsWith('/chat/') || pathLower.startsWith('/workspace/') || pathLower.startsWith('/cms/');`

## varies /dashboard

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6843
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/dashboard' || pathLower === '/dashboard/') {`

## prefix /dashboard/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6848
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (env.DASHBOARD && pathLower.startsWith('/dashboard/')) {`

## varies /dashboard/

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6843
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/dashboard' || pathLower === '/dashboard/') {`

## varies /health

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~3346
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/health' || pathLower === '/health') {`

## varies /index.html

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6790
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/' || path === '/index.html') {`

## varies /login

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6796
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/login') {`

## varies /reset

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6818
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/reset' || pathLower === '/auth/reset') {`

## prefix /settings/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6883
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `const wildcardTopLevel = pathLower.startsWith('/settings/') || pathLower.startsWith('/chat/') || pathLower.startsWith('/workspace/') || pathLower.startsWith('/cms/');`

## varies /signup

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6807
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/signup' || pathLower === '/auth/register') {`

## prefix /static/dashboard/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6914
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `if (!obj && pathLower.startsWith('/static/dashboard/') && env.DASHBOARD) {`

## prefix /static/dashboard/agent/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6927
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `const noCache = pathLower.startsWith('/static/dashboard/agent/') || pathLower.startsWith('/dashboard/') || url.searchParams.has('v');`

## varies /static/dashboard/glb-viewer.html

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6909
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (!obj && pathLower === '/static/dashboard/glb-viewer.html' && env.DASHBOARD) {`

## prefix /workspace/*

- **Handler:** runDeploymentsWeeklyRollup (lines 3099-7049)
- **Line:** ~6883
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside runDeploymentsWeeklyRollup.
- **Bindings (typical):** DB
- **Code:** `const wildcardTopLevel = pathLower.startsWith('/settings/') || pathLower.startsWith('/chat/') || pathLower.startsWith('/workspace/') || pathLower.startsWith('/cms/');`

