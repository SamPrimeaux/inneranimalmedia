# Agent tools, DB audit, and today’s plan

**Goal:** Reliable browser rendering (DB + APIs), fix agent chat memory and platform knowledge, then build UI to fully test every tool in the DB.

---

## 1. Database audit for browser rendering and agent tools

### Tables the worker expects (by area)

| Table | Purpose | Migration / status |
|-------|--------|--------------------|
| **playwright_jobs** | Browser screenshot/render jobs; queue consumer updates `status`, `result_url`, `completed_at`, `error` | **Created in 116** (was missing) |
| **agent_workspace_state** | Per-session workspace state; `/api/agent/workspace/:id` GET/PUT | **Created in 116** (was missing) |
| **agent_sessions** | Chat sessions; `/api/agent/sessions`, chat creates/uses | 112 |
| **agent_messages** | Per-message history; `/api/agent/sessions/:id/messages`, chat appends | 112 |
| **agent_telemetry** | Token/call metrics; written on every `/api/agent/chat` | 111 |
| **agent_ai_sam** | Agent config (name, mode, total_runs, etc.); `/api/agent/boot`, chat UPDATE | **No migration in repo** — ensure exists in D1 |
| **ai_models** | Model catalog; `/api/agent/models`, chat resolves `model_id` | **No migration in repo** — ensure exists + has rows |
| **mcp_services** | MCP registry; `/api/agent/boot`, `/api/agent/mcp` | **No migration in repo** — ensure exists |
| **iam_agent_sam_prompts** | System prompts per agent; `/api/agent/boot` | **No migration in repo** — optional |
| **cicd** | CICD workflows; `/api/agent/cicd` (with cicd_events) | **No migration in repo** — optional |
| **cloudflare_deployments** | Deploy history; overview, activity strip | 113 |
| **workflow_checkpoints** | Checkpoints; overview, activity strip | 113 |
| **financial_transactions** | Finance summary/transactions | Used by worker; name may differ (finance_transactions in some paths) |
| **spend_ledger** | AI spend; finance, agent $ gauge | Canonical; see AGENT_MEMORY_SCHEMA_AND_RECORDS.md |
| **project_time_entries** | Time tracking; overview, activity strip | Canonical |
| **auth_sessions** | Session auth; getSession() | Assumed present |

### What migration 116 adds

- **playwright_jobs** — `id`, `job_type`, `url`, `status`, `metadata`, `result_url`, `completed_at`, `error`, `created_at`. Queue consumer and `GET /api/agent/playwright/:id` depend on it.
- **agent_workspace_state** — `id`, `state_json`, `updated_at`. Used by `/api/agent/workspace/:id`.

**Run 116 (after approval):**

```bash
npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/116_browser_rendering_and_agent_tools.sql
```

### If agent chat returns 503 “Model not found”

- Ensure **ai_models** exists and has at least one row with `is_active=1` and columns: `id`, `provider`, `model_key`, `display_name` (and optionally `supports_tools`, `supports_vision`, `input_rate_per_mtok`, `output_rate_per_mtok`).
- Ensure **agent_ai_sam** exists if you pass `agent_id` from the UI (otherwise chat still works without it).

---

## 2. Tools / APIs to test (from the “massive DB” and worker)

### Browser rendering (Puppeteer / MYBROWSER)

| Endpoint | Method | Purpose | Depends on |
|----------|--------|---------|------------|
| `/api/browser/health` | GET | Health check; launches browser, loads page, returns metrics | MYBROWSER binding |
| `/api/browser/metrics` | GET | Same as health but returns full page metrics | MYBROWSER binding |
| **Queue job** | — | Consumer: reads `jobId`, `job_type`, `url` from queue; runs Puppeteer; writes screenshot/render to R2; updates **playwright_jobs** | MYBROWSER, DASHBOARD (R2), DB (playwright_jobs) |
| `/api/agent/playwright` | POST | Create job: body `{ url, job_type: 'screenshot' \| 'render' }` → returns `jobId`; enqueues to MY_QUEUE | DB (playwright_jobs), MY_QUEUE |
| `/api/agent/playwright/:id` | GET | Get job status and `result_url` when completed | DB (playwright_jobs) |

### Agent chat and memory

| Endpoint | Method | Purpose | Depends on |
|----------|--------|---------|------------|
| `/api/agent/chat` | POST | Send messages; creates/uses session; appends to **agent_messages**; writes **agent_telemetry**; injects schema + RAG seed result into system | ai_models, agent_sessions, agent_messages, agent_telemetry, R2 (schema), optional RAG seed |
| `/api/agent/sessions` | GET / POST | List sessions (with message_count, has_artifacts); create session | agent_sessions, agent_messages |
| `/api/agent/sessions/:id/messages` | GET / POST | Get or append messages for a conversation | agent_messages |
| `/api/agent/bootstrap` | GET | Daily log, yesterday log, schema_and_records from R2 | R2 (memory/daily/, memory/schema-and-records.md) |

### RAG / Vectorize

| Endpoint | Method | Purpose | Depends on |
|----------|--------|---------|------------|
| `/api/agent/rag/query` | POST | Vector search: body `{ query, topK }` → returns matches | AI (embed), VECTORIZE |
| `/api/agent/rag/insert` | POST | Embed and upsert items into Vectorize | AI (embed), VECTORIZE |

### Agent boot and config

| Endpoint | Method | Purpose | Depends on |
|----------|--------|---------|------------|
| `/api/agent/boot` | GET | Agents, mcp_services, models, sessions, prompts, cicd | agent_ai_sam, mcp_services, ai_models, agent_sessions, iam_agent_sam_prompts, cicd |
| `/api/agent/models` | GET | List models (optional `?provider=`) | ai_models |
| `/api/agent/mcp` | GET | List MCP services | mcp_services |
| `/api/agent/cicd` | GET | CICD workflows + activity count | cicd, cicd_events |
| `/api/agent/workspace/:id` | GET / PUT | Get or update workspace state | agent_workspace_state |
| `/api/agent/telemetry` | GET | Last 7 days token/call summary by provider | agent_telemetry |

### Other (overview, finance, time track, etc.)

- Overview: `/api/overview/stats`, `/api/overview/recent-activity`, `/api/overview/checkpoints`, `/api/overview/activity-strip`
- Finance: `/api/finance/summary`, `/api/finance/transactions`, `/api/finance/ai-spend`, etc.
- Time: `/api/dashboard/time-track/*`
- Auth: session cookie + auth_sessions

---

## 3. Why the agent has “0 knowledge of my actual platform”

- **System prompt** is fixed text (Agent Sam identity + D1/schema workflow). It does **not** include:
  - Live RAG retrieval for the current query.
  - A short “platform summary” (what the dashboard is, main pages, key APIs).
- **Schema memory** is injected from R2 `memory/schema-and-records.md` (good for D1/backfill) but not product/UX context.
- **Chat history** is sent only if the frontend includes it: the worker uses whatever `messages` array the client sends. So if the client doesn’t load or resend prior messages for the session, the model sees only the latest turn.

**Fixes to do:**

1. **Platform knowledge**  
   - Option A: Add a “platform summary” to the system prompt (short: dashboard sections, main APIs, how to use RAG/browser/tools).  
   - Option B: On each chat request, call RAG with the user message (or a short summary) and inject top matches into the system prompt.  
   - Option C: Both: static platform summary + optional RAG snippet.

2. **Chat memory**  
   - Backend already persists and returns messages; ensure the **Agent dashboard UI** loads messages when switching sessions and sends the full conversation (including loaded history) in each `/api/agent/chat` request.  
   - Confirm “new chat” clears local state and uses a new session (so history isn’t mixed).

---

## 4. Today’s plan (capabilities + UI to test every tool)

### Phase 1: DB and browser rendering

1. **Run migration 116** (after your approval) so `playwright_jobs` and `agent_workspace_state` exist.
2. **Verify** in D1 (or via APIs) that `ai_models` and optionally `agent_ai_sam`, `mcp_services` exist and have at least the rows the worker expects.
3. **Browser rendering UI** (in Agent dashboard or a small “Tools” page):
   - Form: URL + job type (screenshot / render) → POST `/api/agent/playwright` → show `jobId`.
   - Poll or refresh: GET `/api/agent/playwright/:id` until `status === 'completed'` or `'failed'`.
   - Display: link to `result_url` (screenshot image or render HTML), or error message.
   - Optional: “Health” button that calls `/api/browser/health` and shows ok/error.

### Phase 2: Agent memory and platform knowledge

4. **Chat memory**  
   - In Agent dashboard: when user selects a session, load `/api/agent/sessions/:id/messages` and set that as the current conversation (don’t rely on a single initial message).  
   - When sending a message, send **all** current conversation messages (loaded + new) in the `messages` array so the model has full context.

5. **Platform knowledge**  
   - Add a short “platform summary” block to the agent system prompt (dashboard structure, main tools, RAG, browser, D1, R2).  
   - Optionally: before calling the LLM, run `/api/agent/rag/query` with the last user message; inject top 1–3 matches into the system prompt so the agent can cite docs/knowledge.

### Phase 3: RAG and tool-testing UI

6. **RAG**  
   - Ensure Vectorize index is seeded (bootstrap text, or R2 memory docs) via `/api/agent/rag/insert` or a one-off script.  
   - Expose in UI: “RAG query” box that calls `/api/agent/rag/query` and shows matches (so you can verify content and relevance).

7. **Test-each-tool UI**  
   - Single page or collapsible sections (e.g. under “Debug” or “Tools” in the Agent dashboard) that:
     - **Browser:** URL + type → create job → poll → show result (see Phase 1).
     - **RAG:** Query input → POST rag/query → show matches.
     - **Bootstrap:** GET `/api/agent/bootstrap` → show daily log, schema snippet, hint.
     - **Sessions:** List from `/api/agent/sessions`, link to “open” (load messages into chat).
     - **Telemetry:** GET `/api/agent/telemetry` → show table or summary.
     - **MCP:** GET `/api/agent/mcp` → list services and status.
     - **CICD:** GET `/api/agent/cicd` → list workflows (if table exists).
   - Each section shows the request (e.g. “GET /api/agent/telemetry”) and the response (formatted JSON or table). This gives one place to confirm every tool and DB-backed endpoint.

### Order of work

1. Run migration 116 and confirm tables.  
2. Add browser rendering UI (create job + poll + show result).  
3. Fix chat memory (load messages on session switch, send full history).  
4. Add platform summary + optional RAG injection to chat.  
5. Add RAG seed/verification and “RAG query” test panel.  
6. Add the rest of the tool-test panels (bootstrap, sessions, telemetry, MCP, CICD) so you can run and verify every tool from the UI.

---

## 5. Quick reference: worker routes that hit D1

- **playwright_jobs:** queue consumer (UPDATE), POST/GET `/api/agent/playwright`  
- **agent_workspace_state:** GET/PUT `/api/agent/workspace/:id`  
- **agent_sessions:** GET/POST `/api/agent/sessions`, GET/POST messages, chat (create session)  
- **agent_messages:** GET/POST `/api/agent/sessions/:id/messages`, chat (append)  
- **agent_telemetry:** chat (INSERT), GET `/api/agent/telemetry`  
- **agent_ai_sam:** GET `/api/agent/boot`, chat (UPDATE total_runs)  
- **ai_models:** GET `/api/agent/boot`, GET `/api/agent/models`, chat (resolve model_id)  
- **mcp_services:** GET `/api/agent/boot`, GET `/api/agent/mcp`  
- **iam_agent_sam_prompts:** GET `/api/agent/boot`  
- **cicd**, **cicd_events:** GET `/api/agent/cicd`  
- **cloudflare_deployments,** **workflow_checkpoints,** **project_time_entries,** **agent_sessions,** etc.: overview/activity-strip

Once 116 is applied and browser + agent UIs are updated, you can use the tool-test panels to verify each of these against your DB and bindings.
