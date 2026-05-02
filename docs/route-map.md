# IAM worker route map

Auto-generated from `worker.js` (Cloudflare Workers `fetch`, not Express). Each `##` section below is one ingest chunk (method + path as title).

Total route patterns: **283**.

## varies /

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4483
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/' || path === '/index.html') {`

## GET/POST /api/admin/overnight/start

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2899
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/admin/overnight/validate' || pathLower === '/api/admin/overnight/start') && (request.method || 'GET').toUpperCase() === 'POST') {`

## varies /api/admin/overnight/start

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2909
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/overnight/start') {`

## GET/POST /api/admin/overnight/validate

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2899
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/admin/overnight/validate' || pathLower === '/api/admin/overnight/start') && (request.method || 'GET').toUpperCase() === 'POST') {`

## varies /api/admin/overnight/validate

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2905
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/overnight/validate') {`

## GET/POST /api/admin/reindex-codebase

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2991
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/reindex-codebase' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/admin/retention

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2915
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/retention' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET/POST /api/admin/trigger-workflow

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2996
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/trigger-workflow' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/admin/vectorize-kb

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2933
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/vectorize-kb' && (request.method || 'GET').toUpperCase() === 'POST') {`

## prefix /api/agent*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3315
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## varies /api/agent/boot

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8315
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/boot') {`

## GET /api/agent/bootstrap

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10771
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/bootstrap' && method === 'GET') {`

## POST /api/agent/chat

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~9172
- **Auth:** usually session (see handler)
- **Description:** Main Agent Sam chat. JSON body: messages, model_id, mode, stream, tools. Runs AutoRAG (AI Search) when enabled; prepends pgvector `match_documents` context when HYPERDRIVE is bound.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/chat' && method === 'POST') {`

## POST /api/agent/chat/execute-approved-tool

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10417
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/chat/execute-approved-tool' && method === 'POST') {`

## varies /api/agent/cicd (worker literal: legacy segment before `/current`)

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10230
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch. Prose uses **CI/CD**; the deployed path segment is still the historical spelling (grep `pathLower === '/api/agent/` in `worker.js`).
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code (worker.js):** equality check on `pathLower` for `/api/agent/` plus the legacy three-letter pipeline segment (see source; prose uses **cicd**).

## POST /api/agent/commands/execute

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3229
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/commands/execute' && request.method === 'POST') {`

## GET /api/agent/context-picker/catalog

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8101
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/context-picker/catalog' && method === 'GET') {`

## GET /api/agent/context/bootstrap

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10749
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/context/bootstrap' && method === 'GET') {`

## GET /api/agent/conversations/search

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8377
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/conversations/search' && method === 'GET') {`

## GET /api/agent/db/tables

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8194
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/db/tables' && method === 'GET') {`

## GET /api/agent/git/status

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8239
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/git/status' && method === 'GET') {`

## POST /api/agent/git/sync

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8268
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/git/sync' && method === 'POST') {`

## GET /api/agent/keyboard-shortcuts

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8011
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/keyboard-shortcuts' && method === 'GET') {`

## varies /api/agent/mcp

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10223
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/agent/mcp') {`

## GET /api/agent/memory/list

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8169
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/memory/list' && method === 'GET') {`

## POST /api/agent/memory/sync

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8210
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/memory/sync' && method === 'POST') {`

## varies /api/agent/models

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8814
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/models') {`

## GET /api/agent/modes

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~7942
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/modes' && method === 'GET') {`

## GET /api/agent/notifications

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8063
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/notifications' && method === 'GET') {`

## POST /api/agent/plan/approve

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10383
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/plan/approve' && method === 'POST') {`

## POST /api/agent/plan/reject

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10400
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/plan/reject' && method === 'POST') {`

## POST /api/agent/playwright

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10209
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, MYBROWSER
- **Code:** `if (pathLower === '/api/agent/playwright' && method === 'POST') {`

## GET /api/agent/problems

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~7955
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/problems' && method === 'GET') {`

## GET /api/agent/proposals/pending

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~9087
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/proposals/pending' && method === 'GET') {`

## POST /api/agent/propose

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8989
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/propose' && method === 'POST') {`

## POST /api/agent/queue

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10314
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/queue' && method === 'POST') {`

## GET /api/agent/queue/status

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10339
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/queue/status' && method === 'GET') {`

## POST /api/agent/r2-save

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10830
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DASHBOARD, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/r2-save' && method === 'POST') {`

## POST /api/agent/rag/compact-chats

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10294
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/compact-chats' && method === 'POST') {`

## POST /api/agent/rag/index-memory

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10281
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/index-memory' && method === 'POST') {`

## POST /api/agent/rag/query

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10252
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/query' && method === 'POST') {`

## GET /api/agent/rag/status

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10271
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/status' && method === 'GET') {`

## POST /api/agent/reindex-codebase

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8223
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/reindex-codebase' && method === 'POST') {`

## GET /api/agent/rules

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2003
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `(pathLower === '/api/agent/rules' && method === 'GET') ||`

## varies /api/agent/session/ws

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4473
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/session/ws' && env.IAM_COLLAB) {`

## POST /api/agent/sessions

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8842
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/sessions') {`

## varies /api/agent/telemetry

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10241
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/telemetry') {`

## POST /api/agent/terminal/complete

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8599
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/complete' && method === 'POST') {`

## GET /api/agent/terminal/config-status

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8483
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/config-status' && method === 'GET') {`

## POST /api/agent/terminal/run

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8578
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/run' && method === 'POST') {`

## GET /api/agent/terminal/socket-url

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8468
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/socket-url' && method === 'GET') {`

## GET /api/agent/terminal/ws

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8494
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/ws' && method === 'GET') {`

## GET /api/agent/today-todo

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10698
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/today-todo' && method === 'GET') {`

## PUT /api/agent/today-todo

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10724
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/today-todo' && method === 'PUT') {`

## POST /api/agent/workers-ai/image

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8902
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workers-ai/image' && method === 'POST') {`

## POST /api/agent/workers-ai/stt

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8959
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workers-ai/stt' && method === 'POST') {`

## POST /api/agent/workers-ai/tts

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8928
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workers-ai/tts' && method === 'POST') {`

## POST /api/agent/workflows/trigger

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~9100
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workflows/trigger' && method === 'POST') {`

## varies /api/agentsam

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3305
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower.startsWith('/api/agentsam/') || pathLower === '/api/agentsam') {`

## prefix /api/agentsam/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3305
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower.startsWith('/api/agentsam/') || pathLower === '/api/agentsam') {`

## GET /api/agentsam/ai

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11947
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ai' && method === 'GET') {`

## DELETE /api/agentsam/autorag/files

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11882
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/files' && method === 'DELETE') {`

## GET /api/agentsam/autorag/files

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11837
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/files' && method === 'GET') {`

## POST /api/agentsam/autorag/search

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11906
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/search' && method === 'POST') {`

## GET /api/agentsam/autorag/stats

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11820
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/stats' && method === 'GET') {`

## POST /api/agentsam/autorag/sync

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11858
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/sync' && method === 'POST') {`

## POST /api/agentsam/autorag/upload

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11891
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/upload' && method === 'POST') {`

## GET /api/agentsam/cmd-allowlist

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11121
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'GET') {`

## POST /api/agentsam/cmd-allowlist

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11135
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'POST') {`

## GET /api/agentsam/command-allowlist

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11121
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'GET') {`

## POST /api/agentsam/command-allowlist

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11135
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'POST') {`

## GET /api/agentsam/feature-flags

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11369
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/feature-flags' && method === 'GET') {`

## GET /api/agentsam/fetch-allowlist

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11278
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-allowlist' && method === 'GET') {`

## POST /api/agentsam/fetch-allowlist

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11292
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-allowlist' && method === 'POST') {`

## GET /api/agentsam/fetch-domains

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11224
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-domains' && method === 'GET') {`

## POST /api/agentsam/fetch-domains

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11238
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-domains' && method === 'POST') {`

## GET /api/agentsam/hooks

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11013
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/hooks' && method === 'GET') {`

## POST /api/agentsam/hooks

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11051
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/hooks' && method === 'POST') {`

## GET /api/agentsam/ignore-patterns

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11719
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns' && method === 'GET') {`

## PATCH /api/agentsam/ignore-patterns

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11729
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns' && method === 'PATCH') {`

## POST /api/agentsam/ignore-patterns

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11696
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns' && method === 'POST') {`

## PATCH /api/agentsam/ignore-patterns/reorder

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11627
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns/reorder' && method === 'PATCH') {`

## GET /api/agentsam/index-status

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11758
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/index-status' && method === 'GET') {`

## GET /api/agentsam/indexing-summary

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11779
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/indexing-summary' && method === 'GET') {`

## GET /api/agentsam/mcp-allowlist

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11169
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/agentsam/mcp-allowlist' && method === 'GET') {`

## POST /api/agentsam/mcp-allowlist

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11183
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/agentsam/mcp-allowlist' && method === 'POST') {`

## GET /api/agentsam/rules

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11451
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/rules' && method === 'GET') {`

## POST /api/agentsam/rules

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11461
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/rules' && method === 'POST') {`

## GET /api/agentsam/runs

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11934
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/runs' && method === 'GET') {`

## GET /api/agentsam/skills

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11544
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/skills' && method === 'GET') {`

## POST /api/agentsam/skills

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11561
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/skills' && method === 'POST') {`

## GET /api/agentsam/subagents

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11475
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/subagents' && method === 'GET') {`

## POST /api/agentsam/subagents

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11486
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/subagents' && method === 'POST') {`

## GET /api/agentsam/tools-registry

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11204
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/tools-registry' && method === 'GET') {`

## DELETE /api/agentsam/trusted-origins

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11358
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/trusted-origins' && method === 'DELETE') {`

## GET /api/agentsam/trusted-origins

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11332
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/trusted-origins' && method === 'GET') {`

## POST /api/agentsam/trusted-origins

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~11342
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/trusted-origins' && method === 'POST') {`

## GET /api/agentsam/user-policy

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~10981
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/user-policy' && method === 'GET') {`

## PATCH /api/agentsam/user-policy

- **Handler:** handleAgentsamApi (lines 10929-11991)
- **Line:** ~10991
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/user-policy' && method === 'PATCH') {`

## GET /api/ai/guardrails

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~1997
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/guardrails' && method === 'GET') ||`

## GET /api/ai/integrations

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2002
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/integrations' && method === 'GET') ||`

## GET /api/ai/models

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2112
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/models' && method === 'GET') {`

## GET/PATCH /api/ai/models

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~1998
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/models' && method === 'GET') ||`

## GET /api/ai/routing-rules

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2140
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/routing-rules' && method === 'GET') {`

## GET/POST/PATCH/DELETE /api/ai/routing-rules

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2000
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/routing-rules' && (method === 'GET' || method === 'POST')) ||`

## POST /api/ai/routing-rules

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2146
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/routing-rules' && method === 'POST') {`

## GET /api/app-icons

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2015
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/app-icons' && method === 'GET') ||`

## GET/POST /api/auth/backup-code

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2891
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/backup-code' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/auth/login

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2888
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/login' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/auth/logout

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2894
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/logout' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/billing

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2019
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/billing' && method === 'GET') ||`

## varies /api/billing/summary

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2861
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/billing/summary') {`

## prefix /api/browser/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2793
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower.startsWith('/api/browser/')) {`

## varies /api/browser/health

- **Handler:** handleBrowserRequest (lines 4726-4872)
- **Line:** ~4798
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/browser/health') {`

## varies /api/browser/metrics

- **Handler:** handleBrowserRequest (lines 4726-4872)
- **Line:** ~4807
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/browser/metrics') {`

## GET /api/browser/screenshot

- **Handler:** handleBrowserRequest (lines 4726-4872)
- **Line:** ~4737
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/browser/screenshot' && method === 'GET') {`

## prefix /api/cicd/* (worker literal: legacy segment after `/api/`)

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3324
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes. Prose uses **CI/CD**; confirm the live segment in `worker.js`.
- **Bindings (typical):** DB
- **Code (worker.js):** `pathLower.startsWith` on `/api/` plus the legacy pipeline segment and `/` (see source).

## GET /api/cicd/current (worker literal)

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2503
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code (worker.js):** `GET` branch for `/current` under the legacy `/api/<segment>/` prefix (see source).

## GET/POST /api/cicd/current (worker literal)

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2020
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code (worker.js):** disjunction including `GET` on `/current` under the legacy prefix (see source).

## POST /api/cicd/run (worker literal)

- **Handler:** CI/CD API handler in `worker.js` (lines 12566-12811; function name may still use a legacy prefix)
- **Line:** ~12574
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code (worker.js):** `POST` on `/run` under the legacy `/api/<segment>/` prefix (see source).

## GET /api/cicd/runs (worker literal)

- **Handler:** CI/CD API handler in `worker.js` (lines 12566-12811; function name may still use a legacy prefix)
- **Line:** ~12778
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code (worker.js):** `GET` on `/runs` under the legacy `/api/<segment>/` prefix (see source).

## varies /api/clients

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2836
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/clients') {`

## GET /api/cloudflare/workers/list

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3350
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/cloudflare/workers/list' && (request.method || 'GET').toUpperCase() === 'GET') {`

## varies /api/colors/all

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2826
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/colors/all') {`

## GET /api/commands

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3487
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/commands' && request.method === 'GET') {`

## GET /api/commands/custom

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2275
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/commands/custom' && method === 'GET') {`

## GET/POST /api/commands/custom

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2004
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/commands/custom' && method === 'GET') ||`

## GET/POST /api/d1/query

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3822
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/d1/query' && (request.method || 'GET').toUpperCase() === 'POST') {`

## prefix /api/dashboard/time-track*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2821
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/dashboard/time-track')) {`

## POST /api/dashboard/time-track/manual

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2815
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/dashboard/time-track/manual' && request.method === 'POST') {`

## POST /api/deploy/rollback

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2021
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/deploy/rollback' && method === 'POST');`

## GET/POST /api/deployments/log

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2652
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/deployments/log' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/deployments/recent

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2655
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/deployments/recent' && (request.method || 'GET').toUpperCase() === 'GET') {`

## prefix /api/draw*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3310
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower.startsWith('/api/draw')) {`

## GET /api/draw/list

- **Handler:** handleDrawApi (lines 7788-7878)
- **Line:** ~7825
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/draw/list' && method === 'GET') {`

## POST /api/draw/save

- **Handler:** handleDrawApi (lines 7788-7878)
- **Line:** ~7797
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/draw/save' && method === 'POST') {`

## varies /api/email/inbound

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2585
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/email/inbound') {`

## prefix /api/env/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3617
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/env/')) {`

## GET /api/env/audit

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3682
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/audit' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/env/secrets

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3671
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/secrets' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET/POST /api/env/secrets

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3696
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/secrets' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/env/secrets/reveal

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3722
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/secrets/reveal' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/env/spend

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3619
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/spend' && (request.method || 'GET').toUpperCase() === 'GET') {`

## prefix /api/finance/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2831
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/finance/')) {`

## varies /api/health

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2550
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/api/health' || pathLower === '/api/health') {`

## varies /api/hooks/cursor

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2612
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/cursor') {`

## GET /api/hooks/executions

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2012
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/hooks/executions' && method === 'GET') ||`

## varies /api/hooks/github

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2609
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/github') {`

## GET /api/hooks/health

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2581
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/webhooks/health' || pathLower === '/api/hooks/health') && methodUpper === 'GET') {`

## varies /api/hooks/internal

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2618
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/internal') {`

## varies /api/hooks/stripe

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2615
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/stripe') {`

## GET /api/hooks/subscriptions

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2281
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/subscriptions' && method === 'GET') {`

## GET/POST/PATCH /api/hooks/subscriptions

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2005
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/hooks/subscriptions' && (method === 'GET' || method === 'POST')) ||`

## POST /api/hooks/subscriptions

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2320
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/subscriptions' && method === 'POST') {`

## PATCH /api/hooks/subscriptions/reorder

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2350
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/subscriptions/reorder' && method === 'PATCH') {`

## PATCH/DELETE /api/hooks/subscriptions/reorder

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2006
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/hooks/subscriptions/reorder' && method === 'PATCH') ||`

## varies /api/hooks/supabase

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2621
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/supabase') {`

## prefix /api/hub/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2846
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/hub/')) {`

## GET /api/images

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10594
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/images' && method === 'GET') {`

## POST /api/images

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10624
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/images' && method === 'POST') {`

## prefix /api/images*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3315
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## prefix /api/images/*

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10671
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handleAgentApi.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/images/') && pathLower.endsWith('/meta')) {`

## GET /api/integrations/drive/list

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10440
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/integrations/drive/list' && method === 'GET') {`

## GET /api/integrations/gdrive/file

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10459
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/gdrive/file') {`

## GET /api/integrations/gdrive/files

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10447
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/gdrive/files') {`

## GET /api/integrations/github/file

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10497
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/github/file') {`

## GET /api/integrations/github/files

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10483
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/github/files') {`

## GET /api/integrations/github/list

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10443
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/integrations/github/list' && method === 'GET') {`

## GET /api/integrations/github/repos

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10471
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/github/repos') {`

## GET/POST /api/internal/post-deploy

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2627
- **Auth:** internal / optional secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/internal/post-deploy') {`

## GET/POST /api/internal/record-deploy

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2660
- **Auth:** internal / optional secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/internal/record-deploy') {`

## GET /api/knowledge

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2400
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/knowledge' && method === 'GET') {`

## GET/POST /api/knowledge

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2013
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/knowledge' && method === 'GET') ||`

## POST /api/knowledge/crawl

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2407
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/knowledge/crawl' && method === 'POST') {`

## POST/GET /api/knowledge/crawl

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2014
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/knowledge/crawl' && method === 'POST') ||`

## prefix /api/mcp/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3320
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower.startsWith('/api/mcp/')) {`

## GET /api/mcp/a11y

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12121
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/a11y') {`

## GET /api/mcp/agents

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12035
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/mcp/agents' && method === 'GET') {`

## GET /api/mcp/audit

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12014
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/audit' && method === 'GET') {`

## GET /api/mcp/commands

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12074
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/commands' && method === 'GET') {`

## GET /api/mcp/credentials

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12006
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/credentials' && method === 'GET') {`

## POST /api/mcp/dispatch

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12082
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/dispatch' && method === 'POST') {`

## GET /api/mcp/imgx

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12164
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/imgx') {`

## POST /api/mcp/invoke

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12415
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/invoke' && method === 'POST') {`

## GET /api/mcp/server-allowlist

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~11998
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/server-allowlist' && method === 'GET') {`

## GET /api/mcp/services

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12308
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/services') {`

## GET /api/mcp/services/health

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12179
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/services/health' && method === 'GET') {`

## GET /api/mcp/stats

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12023
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/stats' && method === 'GET') {`

## GET /api/mcp/status

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12032
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/status' && method === 'GET') {`

## POST /api/mcp/stream

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12332
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/stream' && method === 'POST') {`

## GET /api/mcp/tools

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12058
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/tools' && method === 'GET') {`

## GET /api/mcp/workflows

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12457
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/workflows' && method === 'GET') {`

## POST /api/mcp/workflows

- **Handler:** handleMcpApi (lines 11992-12565)
- **Line:** ~12467
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/workflows' && method === 'POST') {`

## varies /api/oauth/github/callback

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2880
- **Auth:** OAuth state / callback
- **Description:** GitHub OAuth redirect URI used by worker.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/github/callback') {`

## varies /api/oauth/github/start

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2877
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/github/start') {`

## varies /api/oauth/google/callback

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2869
- **Auth:** OAuth state / callback
- **Description:** Google OAuth redirect URI used by worker.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/google/callback') {`

## varies /api/oauth/google/start

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2866
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/google/start') {`

## varies /api/overview/activity-strip

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2807
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/activity-strip') {`

## varies /api/overview/checkpoints

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2804
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/checkpoints') {`

## varies /api/overview/deployments

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2810
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/deployments') {`

## varies /api/overview/recent-activity

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2801
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/recent-activity') {`

## varies /api/overview/stats

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2798
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/stats') {`

## prefix /api/playwright*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3315
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## POST /api/playwright/screenshot

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8725
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/playwright/screenshot' && method === 'POST') {`

## varies /api/projects

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2841
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/projects') {`

## prefix /api/r2/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3329
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower.startsWith('/api/r2/')) {`

## varies /api/r2/buckets

- **Handler:** handleR2Api (lines 7297-7787)
- **Line:** ~7361
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/buckets') {`

## POST /api/r2/buckets/bulk-action

- **Handler:** handleR2Api (lines 7297-7787)
- **Line:** ~7543
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/buckets/bulk-action' && method === 'POST') {`

## DELETE /api/r2/delete

- **Handler:** handleR2Api (lines 7297-7787)
- **Line:** ~7513
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/delete' && method === 'DELETE') {`

## DELETE /api/r2/file

- **Handler:** handleR2Api (lines 7297-7787)
- **Line:** ~7523
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/file' && method === 'DELETE') {`

## GET /api/r2/list

- **Handler:** handleR2Api (lines 7297-7787)
- **Line:** ~7398
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/list' && method === 'GET') {`

## GET /api/r2/search

- **Handler:** handleR2Api (lines 7297-7787)
- **Line:** ~7468
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DASHBOARD, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/r2/search' && method === 'GET') {`

## varies /api/r2/stats

- **Handler:** handleR2Api (lines 7297-7787)
- **Line:** ~7305
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/stats') {`

## POST /api/r2/sync

- **Handler:** handleR2Api (lines 7297-7787)
- **Line:** ~7328
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/sync' && method === 'POST') {`

## POST /api/r2/upload

- **Handler:** handleR2Api (lines 7297-7787)
- **Line:** ~7500
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/upload' && method === 'POST') {`

## GET /api/r2/url

- **Handler:** handleR2Api (lines 7297-7787)
- **Line:** ~7535
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/url' && method === 'GET') {`

## DELETE /api/screenshots

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10576
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/screenshots' && method === 'DELETE') {`

## GET /api/screenshots

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10513
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/screenshots' && method === 'GET') {`

## prefix /api/screenshots*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3315
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## GET /api/screenshots/asset

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~10550
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/screenshots/asset' && method === 'GET') {`

## varies /api/search

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3962
- **Auth:** usually session (see handler)
- **Description:** POST/GET search. With HYPERDRIVE: embed query (bge-large-en-v1.5) and `match_documents` via pg; else Vectorize `vectorizeRagSearch`. Logs to ai_rag_search_history.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search') {`

## GET /api/search/debug

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3848
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/debug' && (request.method || 'GET').toUpperCase() === 'GET') {`

## POST /api/search/docs

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3877
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/docs' && request.method === 'POST') {`

## POST /api/search/docs/index

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3946
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/docs/index' && request.method === 'POST') {`

## GET /api/search/docs/status

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3921
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/docs/status' && request.method === 'GET') {`

## POST /api/search/federated

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3843
- **Auth:** usually session (see handler)
- **Description:** POST federated search across configured sources; `handleFederatedSearch`.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/federated' && request.method === 'POST') {`

## GET /api/settings

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2027
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings' && method === 'GET') {`

## GET/PATCH /api/settings

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~1995
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings' && method === 'GET' && (url.searchParams.get('category') || '').trim()) ||`

## PATCH /api/settings/agent-config

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2220
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/settings/agent-config' && method === 'PATCH') {`

## PATCH/GET /api/settings/agent-config

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2010
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `(pathLower === '/api/settings/agent-config' && method === 'PATCH') ||`

## PATCH /api/settings/appearance

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2034
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/appearance' && method === 'PATCH') {`

## PATCH/GET /api/settings/appearance

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~1996
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/appearance' && method === 'PATCH') ||`

## prefix /api/settings/avatar*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4098
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/settings/avatar') && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/settings/deploy-context

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2008
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/deploy-context' && method === 'GET') ||`

## GET /api/settings/docs-providers

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2062
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/docs-providers' && method === 'GET') {`

## GET/PATCH /api/settings/docs-providers

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2009
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/docs-providers' && method === 'GET') ||`

## GET /api/settings/emails

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4284
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'GET' && pathLower === '/api/settings/emails') {`

## GET /api/settings/marketplace-catalog

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2011
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/marketplace-catalog' && method === 'GET') ||`

## GET /api/settings/preferences

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4117
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/preferences') {`

## GET /api/settings/profile

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4010
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/profile') {`

## GET/POST /api/settings/profile/avatar

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4073
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/profile/avatar' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/settings/security/backup-codes/generate

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4187
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/security/backup-codes/generate' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/settings/security/change-password

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4168
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/security/change-password' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/settings/sessions

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4241
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/sessions' && (request.method || 'GET').toUpperCase() === 'GET') {`

## varies /api/settings/theme

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4395
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/settings/theme') {`

## PUT/PATCH /api/settings/workspace/default

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4359
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/workspace/default' && (request.method === 'PUT' || request.method === 'PATCH')) {`

## GET /api/settings/workspaces

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4297
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/workspaces' || pathLower === '/api/workspaces') {`

## GET /api/spend

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2016
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/spend' && method === 'GET') ||`

## GET /api/spend/summary

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2017
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/spend/summary' && method === 'GET') ||`

## GET /api/spend/unified

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2018
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/spend/unified' && method === 'GET') ||`

## GET/POST /api/telemetry/v1/traces

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2691
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/telemetry/v1/traces') {`

## prefix /api/terminal*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3315
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## POST /api/terminal/session/register

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8387
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/terminal/session/register' && method === 'POST') {`

## GET /api/terminal/session/resume

- **Handler:** handleAgentApi (lines 7937-10875)
- **Line:** ~8429
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/terminal/session/resume' && method === 'GET') {`

## GET /api/themes

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3550
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/themes' && request.method === 'GET') {`

## GET /api/themes/active

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3564
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/themes/active' && request.method === 'GET') {`

## GET/POST /api/tunnel/restart

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3457
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/tunnel/restart' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/tunnel/status

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3407
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/tunnel/status' && (request.method || 'GET').toUpperCase() === 'GET') {`

## prefix /api/vault*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3611
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB, SESSION_CACHE
- **Code:** `if (pathLower.startsWith('/api/vault')) {`

## varies /api/webhooks/cloudflare

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2600
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/cloudflare') {`

## varies /api/webhooks/cursor

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2597
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/cursor') {`

## varies /api/webhooks/github

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2594
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/github') {`

## GET /api/webhooks/health

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2581
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/webhooks/health' || pathLower === '/api/hooks/health') && methodUpper === 'GET') {`

## varies /api/webhooks/internal

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2606
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/internal') {`

## varies /api/webhooks/resend

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2588
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/resend') {`

## varies /api/webhooks/stripe

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2591
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/stripe') {`

## varies /api/webhooks/supabase

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2603
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/supabase') {`

## GET /api/workers

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~3334
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/workers' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/workspaces

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4297
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/workspaces' || pathLower === '/api/workspaces') {`

## varies /auth/callback/github

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2883
- **Auth:** OAuth state / callback
- **Description:** GitHub OAuth callback (locked handler).
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/callback/github') {`

## varies /auth/callback/google

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2872
- **Auth:** OAuth state / callback
- **Description:** Google OAuth callback (locked handler). Uses KV SESSION_CACHE for state.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/callback/google') {`

## varies /auth/login

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4512
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/signin' || pathLower === '/auth/login' || pathLower === '/auth/signup') {`

## varies /auth/signin

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4512
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/signin' || pathLower === '/auth/login' || pathLower === '/auth/signup') {`

## varies /auth/signup

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4512
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/signin' || pathLower === '/auth/login' || pathLower === '/auth/signup') {`

## POST /broadcast

- **Handler:** notifySam (lines 284-489)
- **Line:** ~350
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (request.method === 'POST' && (url.pathname === '/broadcast' || url.pathname.endsWith('/broadcast'))) {`

## varies /dashboard

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4519
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/dashboard' || pathLower === '/dashboard/') {`

## prefix /dashboard/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4533
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/dashboard/')) {`

## varies /dashboard/

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4519
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/dashboard' || pathLower === '/dashboard/') {`

## varies /health

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~2558
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/health' || pathLower === '/health') {`

## varies /index.html

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4483
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/' || path === '/index.html') {`

## prefix /static/dashboard/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4552
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (!obj && pathLower.startsWith('/static/dashboard/') && env.DASHBOARD) {`

## prefix /static/dashboard/agent/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4565
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `const noCache = pathLower.startsWith('/static/dashboard/agent/') || pathLower.startsWith('/dashboard/') || url.searchParams.has('v');`

## varies /static/dashboard/glb-viewer.html

- **Handler:** handlePhase1PlatformD1Routes (lines 1992-4672)
- **Line:** ~4547
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (!obj && pathLower === '/static/dashboard/glb-viewer.html' && env.DASHBOARD) {`

