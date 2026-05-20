# ChatAssistant + Agent Quickstart — flow for testers and agents

Use this when driving **browser tests**, **Anthropic evals**, or **manual QA** on [inneranimalmedia.com/dashboard/agent](https://inneranimalmedia.com/dashboard/agent).

## Routes

| URL | What you see |
|-----|----------------|
| `/dashboard/agent` | Agent home: workspace picker, Open Local Project / Connect / Clone, **Quickstart** pill |
| `/dashboard/agent/quickstart` | Template gallery → **Begin in chat** seeds Agent Sam |
| Other `/dashboard/*` | Lazy-loaded pages; **ChatAssistant may be hidden** unless the agent panel is open |

Helpers: `dashboard/lib/agentRoutes.ts` (`isAgentShellPath`, `AGENT_QUICKSTART_PATH`).

## User flow (Quickstart)

1. Sign in at `/auth/login` (session cookies required for APIs).
2. Open **Agent** in the left rail → `/dashboard/agent`.
3. Click **Quickstart** (replaces legacy “Create Skill”) → `/dashboard/agent/quickstart`.
4. Pick a template card (Deep researcher, Code editor, Deploy validator, Model compare).
5. Optionally type a goal in “Describe your agent”.
6. **Begin in chat** → navigates to `/dashboard/agent`, opens a **new chat tab**, dispatches `IAM_AGENT_CHAT_NEW_THREAD` with:

| Field | Value (Quickstart v1) |
|-------|------------------------|
| `message` | Template seed text |
| `task_type` | Per card (`web_search`, `code`, `deploy`, `chat`) |
| `route_key` | Per card (`chat`, `code`, `deploy_validation`, `model_comparison`) |
| `quickstart_batch` | `anthropic_smoketest_quickstart` |
| `apply_eto_after_run` | `true` → Worker runs `applyEtoToRoutingArms` after the turn |
| `workspace_id` | `ws_inneranimalmedia` (Thompson training workspace) |
| `modelKey` | `auto` (Thompson; do not pin a model in UI) |

ChatAssistant appends the same fields on `POST /api/agent/chat` FormData.

## ChatAssistant — what it is

**Component:** `dashboard/features/agent-chat/ChatAssistant.tsx` (re-exported from `dashboard/components/ChatAssistant.tsx`).

**Mount:** Fixed **left or right panel** on the Agent shell (`App.tsx`), not inside the center workspace. It stays mounted on `/dashboard/agent` and `/dashboard/agent/quickstart`.

**Parent owns state:** `App.tsx` holds `messages`, `setMessages`, tab ids, `workspaceId`, `agentsamPolicy`, and wires callbacks (Monaco, terminal, browser, GitHub).

### Sending a message

- **Endpoint:** `POST /api/agent/chat` (SSE stream).
- **Consumer:** `useAgentChatStream` / `consumeAgentChatSseBody`.
- **Modes:** Composer dropdown — `Agent`, `Auto`, etc. (`LS_AGENT_CHAT_MODE`).
- **Model:** Catalog from API; `Auto` uses Thompson routing on the Worker.

### Context injected automatically

| Source | When |
|--------|------|
| Open Monaco file | `@file` / `activeFile` in request |
| Active skills | `agentsam_skill` rows (`always_apply`, workspace scope) appended in Worker |
| Rules | `agentsam_rules_document` |
| Browser tab | `browserContext` when Browser panel active |
| Workspace | `workspaceId` from session / settings |

### SSE events testers care about

- Token deltas → assistant message grows.
- Tool calls → approval modal if `requires_confirmation`.
- `context.agent_run_id` → links to `agentsam_agent_run` (BrowserView screenshots).
- `plan_*` / `task_*` → execution plan UI.
- `done` → stream complete; check analytics / routing_decisions after.

### Parallel chat tabs

- Shell tabs in ChatAssistant header; each tab has its own `messages` slot in `messagesByTabId`.
- **New thread:** `IAM_AGENT_CHAT_NEW_THREAD` with `QuickstartThreadDetail` (see table above).
- **Agent run id:** `arun_anthropic_smoketest_quickstart_<12hex>` when `quickstart_batch` is set.

### Slash commands & attachments

- `/` → `agentsam_commands` (show_in_slash).
- `@` → mention files/context.
- Paperclip → images/files (size limits in `types.ts`).

## Assets to use in tests (don’t ignore the product)

| Surface | Route | Use for |
|---------|-------|---------|
| Agent home | `/dashboard/agent` | Workspace connect, recent files |
| Quickstart | `/dashboard/agent/quickstart` | Template → chat seed |
| Analytics Pulse | `/dashboard/analytics/overview` | Workflow runs, tokens, cost (live D1) |
| Analytics Models | `/dashboard/analytics/models` | Leaderboard, routing (Thompson WIP UI) |
| Library | `/dashboard/library` | `agentsam_artifacts` |
| Workflows | `/dashboard/workflows` | DAG runs |
| Settings → Rules & Skills | `/dashboard/settings/rules-skills` | `agentsam_skill`, subagents |
| MCP | `/dashboard/mcp` | Tool registry |

## D1 tables (Quickstart / learning loop)

| Table | Role |
|-------|------|
| `agentsam_subagent_profile` | Best future store for template cards (name, instructions, model, tools) |
| `agentsam_skill` | Markdown skills injected into prompts (not full agent configs) |
| `agentsam_eval_suites` / `agentsam_eval_cases` | Challenge prompts for Model Lab |
| `agentsam_prompt_routes` | Runtime route_key → model + tools |
| `agentsam_routing_arms` | Thompson α/β after ETO pipeline |
| `agentsam_agent_run` / `agentsam_escalation` | Per-chat spine |
| `agentsam_performance_eto_events` | Training ledger |

## Browser automation tips

1. **Lock chat panel:** If agent panel is `off`, Quickstart’s “Begin in chat” sets `agentPosition` to `right` and queues the message.
2. **Read stream debug:** `window.__iamAgentStreamDebug` (see `streamDebug.ts`) after a send.
3. **Validate deploy template:** Require `/health` **and** dashboard chunk 200s — not health-only.
4. **Auth:** Unauthenticated `/api/agent/chat` fails; use logged-in session.

## Dynamic templates (no frontend deploy)

`GET /api/agent/quickstart/templates` returns cards from D1:

```sql
SELECT slug, display_name, description, sort_order, output_schema_json
FROM agentsam_subagent_profile
WHERE is_active = 1 AND COALESCE(is_platform_global, 0) = 1
ORDER BY sort_order;
```

Routing pins live in `output_schema_json`:

```json
{"quickstart":{"task_type":"code","route_key":"code","model_hint":"claude-sonnet-4-6"}}
```

Seed text: `instructions_markdown` (or `quickstart.seed_message` in JSON). Seed migration: `migrations/352_seed_quickstart_platform_subagents.sql`.

## Manual ETO flush (between test batches)

```bash
curl -sS -X POST 'https://inneranimalmedia.com/api/agent/routing/apply-eto' \
  -H 'Cookie: <session>' -H 'Content-Type: application/json'
```

Or rely on `apply_eto_after_run=true` on each Quickstart chat (cron still runs nightly).

## Verification SQL (D1 remote)

```sql
SELECT id, routing_arm_id, task_type, trigger, input_tokens, output_tokens, cost_usd, status
FROM agentsam_agent_run
WHERE id LIKE 'arun_anthropic_smoketest_quickstart%'
ORDER BY created_at DESC LIMIT 10;

SELECT model_key, alpha_delta, beta_delta, routing_arm_id, applied_to_thompson_at, source_table
FROM agentsam_performance_eto_events
WHERE created_at >= datetime('now', '-1 day')
ORDER BY created_at DESC LIMIT 30;
```

## Related files

- `dashboard/components/AgentQuickstartPage.tsx` — fetches `GET /api/agent/quickstart/templates`.
- `src/core/agent-quickstart-templates.js` — maps `agentsam_subagent_profile` → template DTOs.
- `migrations/352_seed_quickstart_platform_subagents.sql` — seeds platform-global cards.
- `dashboard/agentChatConstants.ts` — `IAM_AGENT_CHAT_NEW_THREAD`, conversation id LS key.
- `src/api/agent.js` — chat SSE, skills, routing.
- `docs/agentsam_knowledge/thompson_routing_repair.md` — routing/ETO backend.
