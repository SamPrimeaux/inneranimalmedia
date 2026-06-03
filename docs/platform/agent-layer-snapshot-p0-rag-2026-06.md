# Agent Layer Snapshot — P0 + RAG Spec (2026-06-03)

Canonical Cursor spec for agent prompt/skill/route/RAG work.  
Related: [IAM runtime architecture](./iam-runtime-architecture-2026-06.md) · [Supabase agentsam RAG lanes](../supabase/AGENTSAM_RAG_LANE_SCHEMA_REFERENCE.md) · agent.js modular split (classify-intent extraction, doc 28).

**D1:** `inneranimalmedia-business` (`wrangler` binding `DB`)  
**Verified:** 2026-06-03 (remote D1 queries)

---

## Executive summary — three compounding problems

| # | Problem | Symptom | Primary fix |
|---|---------|---------|-------------|
| 1 | **Context bloat** | ~20.8K chars (~5.2K tokens) of `always_apply` skills on every turn | Shrink always-on to 3 safety skills; semantic retrieval for the rest |
| 2 | **Dead routing** | 8 `agentsam_prompt_routes`; `classifyIntent()` uncalled; spine uses `composerMode` as `taskType` | Wire `classifyIntent` into `resolveRuntimeProfile`; add general-purpose routes; split `agent.js` |
| 3 | **Duplicate identity** | `core_identity` + `sse_system` (~180 tokens each, overlapping) | Consolidate to single `prompt_key` |

RAG ingest fixes **discoverability** (problem 2, skills/recipes/rules). It does **not** fix cold always-on injection (problem 1) — that requires code + D1 `always_apply` migration first.

---

## Snapshot tables (production D1)

### `agentsam_prompt_versions` — 19 active

| kind | count | notes |
|------|------:|-------|
| system | 9 | `core_identity`, `sse_system`, `db_safety`, `deploy_safety`, `security`, `billing`, `client_work`, `learning`, `shinshu` |
| workflow_node | 5 | CMS live editor nodes |
| tool | 1 | `tool_loop` |
| classify | 1 | `classify_intent` (canonical body in D1) |
| pin/test | 2 | `ollama` ping test, `core_identity_minimal` |

**Critical:** `core_identity` and `sse_system` are separate identity prompts (~180 tokens each) with overlapping content — deprecate one after audit of `buildSystemPrompt` layer keys (`src/api/agent.js` ~1135–1137).

**Critical:** `classify_intent` prompt version exists in D1, but **`classifyIntent()` has no live caller** in `src/`. Chat spine:

```
POST /api/agent/chat
  → agentChatSseHandler
  → executeAgentChatSpine (agent-chat-spine.js)
  → resolveRuntimeProfile
       taskType = overrides.task_type || composerMode   // e.g. mode "agent" → taskType "agent"
  → compileModeProfile → prompt route / tools
```

Heuristic `inferIntentHeuristically` + `intentRouteMap` in `classifyIntent` are out of band until wired.

---

### `agentsam_skill` — 289 rows (287 with content)

| metric | value |
|--------|------:|
| Total active | 289 |
| Ever invoked | 16 (5.5%) |
| Total invocations | 454 |
| Empty content | 2 (`skill_endgame_roadmap`, `skill_iam_playwright_quality_report`) |
| Avg content length | 421 chars |
| Max content length | 7,894 chars (`skill_session_bootstrap`) |
| Never invoked | 273 |

**Always-on (`always_apply = 1`)** — loaded every turn via `loadBlendedSkillsForRequest` Tier 1 (`src/api/agent.js`):

| id | display name | chars |
|----|--------------|------:|
| `skill_session_bootstrap` | Session Bootstrap | 7,894 |
| `skill_iam_agent_context` | Agent Sam Platform Context | 3,969 |
| `skill_hard_rules` | Worker.js Architecture Map | 3,419 |
| `skill_iam_deploy_rules` | IAM Deploy Rules | 1,568 |
| `skill_iam_d1_safety` | D1 Query Safety Rules | 1,458 |
| `skill_iam_security_rules` | Security Rules | 1,357 |
| `skill_iam_code_style` | IAM Code Style Rules | 1,166 |

**Total always-on payload:** ~20,831 chars (~5,200 tokens) cold, before user message.

`skill_ws_agent_mobile_dashboard` is **not** `always_apply=1` (correctly excluded).

---

### `agentsam_prompt_routes` — 8 active

No general chat / code / debug / deploy / database routes. Breakdown:

- 6 × CMS live editor workflow nodes
- 1 × `mcp_panel`
- 1 × `simple_ask_greeting`

Most traffic hits fallback / mode-default paths → `classifyIntent` and D1 `classify_intent` prompt are effectively unused.

---

### `agentsam_rules_document` — 22 active (8 rule types)

- All high-value, `body_markdown` populated
- None embedded in Vectorize yet
- **3072-dim golden archive candidates** (rules lane)

---

### `agentsam_cookbook` — 53 recipes, 1 ever used

Discoverability gap (same as skills). Examples with zero uses: `recipe_rag_test`, `rp_token_audit_v1`.

---

### `agentsam_tools` — 54 active (152 total rows)

See live catalog query (`is_active = 1`). OAuth-visible: 24. Full list in chat / D1 audit 2026-06-03.

---

## Priority 0 — before RAG ingest

**Order matters.** Do not bulk-embed 289 skills until always-on bloat and routing are fixed (wastes index quality and retrieval budget).

### Shipped — Step 2: lane context wired (2026-06-03)

`resolveAgentChatLaneContextBlock` is called from `src/core/mode-controllers/agent-controller.js` before `buildSystemPrompt`. Import is from `agent-chat-lane-context.js` (no cycle with `agent.js`).

- **KV cache:** `buildSystemPrompt` may return a cached prompt without `contextBlock`. Lane block is appended after build with the same `---` separator when missing — do not refactor cache internals yet.
- **Gate (intentional until P0-A):** RAG fires when `classifySemanticLane` / `classifyDatabaseAssistantIntent` match — explicit semantic/DB phrasing, not every turn. Better ~20% correct than 100% wrong lane.
- **Post-deploy canary:** `[agent-chat] semantic_lane_degraded` with empty user-visible error → pgvector fallback or workspace UUID resolution broken. Pull those logs first if semantic queries return no context.

**Next unlock:** P0-A (`classifyIntent` + route rows) so task types drive routes and RAG breadth expands safely.

---

## Database tool naming — canonical (catalog is clean)

Confusion is in **docs and route `tool_categories`**, not tool names. Active catalog has no ambiguous bare `db_*` tools.

| Prefix | Surface | `handler_type` | Syntax / binding |
|---|---|---|---|
| `agentsam_d1_*` | Cloudflare D1 (SQLite) | `cf` | SQLite dialect, `env.DB`, workspace-scoped |
| `agentsam_supabase_*` | Supabase Postgres | `hyperdrive` / `supabase` | Postgres dialect, Hyperdrive, `agentsam` schema, `Accept-Profile: agentsam` |

**One rule per turn:** never expose both `agentsam_d1_write` and `agentsam_supabase_write` on the same turn. Route `max_tools` + `tool_categories` enforce one surface.

### Task types — encode database explicitly

Do **not** use bare `db_write` / `db_read` in routing docs or new routes. Use:

| `taskType` | Tool(s) | Notes |
|---|---|---|
| `d1_query` | `agentsam_d1_query` | CF D1 read-only |
| `d1_write` | `agentsam_d1_write` | CF D1 writes |
| `d1_migrate` | `agentsam_d1_migrate` | CF D1 DDL |
| `supabase_query` | `agentsam_supabase_query` | Hyperdrive read |
| `supabase_write` | `agentsam_supabase_write` | Hyperdrive write |

**Prompt layer:** `db_safety` (~195 tokens) for all DB task types — already states D1 is SQLite, Hyperdrive is Postgres, never mix dialects. Route locks **tools**; prompt locks **dialect awareness**.

**Schema RAG:** `database_schema` lane (`agentsam_database_schema_oai3large_1536`) surfaces table metadata with `database_kind` — tells the agent *what* exists; route tells it *which tool* it may use.

### Route rows — insert with P0-A (D1 migration)

Fix CMS routes: bare `"d1"` in `tool_categories` → `"database.d1.*"` so resolver does not pull wrong surface.

```sql
-- Idempotent pattern: migrations/###_agentsam_db_route_rows.sql
-- Dry-run via agentsam_d1_migrate before apply.

INSERT INTO agentsam_prompt_routes (
  route_key, display_name, prompt_layer_keys, tool_categories,
  max_tools, include_rag, is_active, tenant_id
) VALUES
('d1_query', 'D1 Read (CF SQLite)',
 '["core_identity","db_safety"]',
 '["database.d1.query","database.d1.migrate"]',
 2, 1, 1, NULL),

('d1_write', 'D1 Write (CF SQLite)',
 '["core_identity","db_safety"]',
 '["database.d1.write","database.d1.migrate"]',
 2, 1, 1, NULL),

('supabase_query', 'Supabase Read (Postgres)',
 '["core_identity","db_safety"]',
 '["database.supabase.query","database.supabase.vector"]',
 2, 1, 1, NULL),

('supabase_write', 'Supabase Write (Postgres)',
 '["core_identity","db_safety"]',
 '["database.supabase.write"]',
 1, 1, 1, NULL);
```

Use `tenant_id NULL` for global routes unless tenant override required — do not hardcode `tenant_sam_primeaux` in migrations per platform law.

---

### P0-A — Wire intent classification (code + D1 routes)

**Prerequisite (broken today):** `inferIntentHeuristically` detects `hasDbWrite`, `hasSupabase`, etc. but **returns coarse `taskType: 'agent'`** for DB paths (lines ~1417–1419 in `agent.js`). `intentRouteMap` expects granular keys (`db_write`, `d1_write`, …) that never arrive. **Fix returns AND wire the caller** — one without the other only moves the break.

**Suggested single commit scope:**

1. Fix `inferIntentHeuristically` returns → granular task types (`d1_write`, `d1_query`, `supabase_query`, `supabase_write`, `code`, `debug`, …)
2. Call `classifyIntent` from `resolveRuntimeProfile` when `overrides.task_type` missing
3. D1 migration: 4 route rows above + CMS `tool_categories` `"d1"` → `"database.d1"`
4. **Do not** apply P0-B `always_apply` shrink until staging confirms real task types in logs — dropping 5,200 tokens before routing works leaves agent blind
5. `node --check` on `agent.js`, `agent-controller.js`, and classify module after split

**File target after split:** `src/api/agent/classify-intent.js`  
**Until split:** `src/api/agent.js` lines ~1325–1479, `src/core/runtime-profile.js`

```js
// resolveRuntimeProfile — sketch
const classified = await classifyIntent(env, input.message);
const taskType = overrides.task_type
  || classified.taskType
  || composerMode;
```

Pass `classified.intent` into `compileModeProfile` / `resolvePromptRouteForCompile`.

**Acceptance:** Routes match `d1_*` / `supabase_*` task types; usage events show non-`agent` task types; DB turns expose only one database tool surface.

### P0-B — Shrink always-on skills (D1 migration)

**Keep `always_apply = 1` only:**

| id | rationale |
|----|-----------|
| `skill_iam_deploy_rules` | Non-negotiable deploy safety |
| `skill_iam_d1_safety` | D1 write guardrails |
| `skill_iam_security_rules` | Security policy |

**Set `always_apply = 0` (semantic retrieval after index exists):**

| id | chars freed |
|----|------------|
| `skill_session_bootstrap` | 7,894 |
| `skill_iam_agent_context` | 3,969 |
| `skill_hard_rules` | 3,419 |
| `skill_iam_code_style` | 1,166 |

**Target cold skill overhead:** ~450 tokens (three safety skills) vs ~5,200 today.

**Migration pattern:** idempotent `migrations/###_agentsam_always_apply_shrink.sql` — `UPDATE agentsam_skill SET always_apply = 0 WHERE id IN (...)` and `= 1` for the three keepers.

**Code:** `loadBlendedSkillsForRequest` already respects `always_apply`; no JS change required beyond optional Tier-1 token budget cap audit.

### P0-C — Consolidate identity prompts (D1 + code)

1. Audit `buildSystemPrompt` layer keys: `core_identity` vs `sse_system` vs `core_identity_minimal`.
2. Pick single canonical `prompt_key` (recommend `core_identity`; map `sse_system` rows to deprecated or alias).
3. Update `agentsam_prompt_versions` + any `agentsam_prompt_routes` `layer_keys_json` references.
4. Deploy auth/static only if HTML references change — usually Worker-only.

### P0-D — Split `src/api/agent.js` (enables RAG chunking)

See agent modular split plan (doc 28). **Do not chunk monolithic `agent.js` for RAG** — split first:

```
src/api/agent/
  index.js, session.js, classify-intent.js, lane-context.js,
  dispatch.js, tool-result.js, stream.js
```

Then add `src/api/agent/*.js` to `shouldChunkFile()` in `scripts/agentsam_codebase_reindex.mjs`.

---

## RAG ingest — after P0

Unlocks semantic discovery for previously unreachable content.

| Source | rows | lane / notes |
|--------|-----:|--------------|
| `agentsam_skill` | 287 w/ content | skill lane; 273 never invoked → need embeddings + task-type filter |
| `agentsam_cookbook` | 53 | cookbook lane |
| `agentsam_rules_document` | 22 | rules / golden 3072 archive |
| `agentsam_prompt_versions` | 19 | audit/search only (not injected cold) |
| Split `src/api/agent/*` | 7 modules | code intelligence neighborhood |

**Ingest gates:**

- [ ] P0-A classifyIntent live in spine
- [ ] P0-B always_apply migration applied
- [ ] P0-C identity prompt consolidated
- [ ] P0-D agent.js split + reindex allowlist
- [ ] `shouldChunkFile` / lane writers tested dry-run
- [ ] No full-repo embed; cap per `agentsam_codebase_reindex.mjs` defaults

**Retrieval integration (code, post-ingest):**

- Hook `loadBlendedSkillsForRequest` Tier 2/3 to Vectorize / Supabase pgvector by `routing_task_type` + message embedding.
- Cookbook: surface via existing recipe search path with embedding fallback.
- Rules: inject top-k `body_markdown` snippets into system prompt block (not full 22 rows).

---

## Prompt routes — gap to close (post P0-A)

Add active routes (examples — keys must match D1 conventions after classify fix):

| route_key | task_type / intent | purpose |
|-----------|-------------------|---------|
| `general_chat` | `chat` / `explain` | Default composer |
| `code_implementation` | `code` | Monaco / worker edits |
| `debug_investigation` | `debug` | Evidence-first debug mode |
| `deploy_ops` | `deploy` | Wrangler / CF deploy |
| `database_ops` | `db_read`, `db_write`, `sql_d1_generation` | D1 / SQL |

Until these exist, Thompson routing and tool caps continue to treat most turns as generic `agent`.

---

## Cursor execution checklist

When implementing in Agent mode:

1. `node --check` on touched `src/**/*.js`
2. D1 migration for `always_apply` (no hardcoded tenant/user ids in migrations)
3. `npm run guard:identity` before ship
4. User must explicitly request deploy; no smoke in deploy path
5. Optional post-deploy: single `curl` `/api/health` only

**Do not** run full RAG reindex as part of deploy unless user asks.

---

## Changelog

| date | change |
|------|--------|
| 2026-06-03 | Step 2 shipped: lane context wired in agent-controller; database tool naming map; P0-A scope with d1/supabase routes |
