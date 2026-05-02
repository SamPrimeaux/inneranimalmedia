# Inner Animal Media — Platform Architecture & Roadmap

**Last updated:** 2026-04-05  
**Status:** Active production system  
**Primary worker:** `inneranimalmedia` @ inneranimalmedia.com  
**Sandbox:** `inneranimal-dashboard` @ inneranimal-dashboard.meauxbility.workers.dev  
**DB:** `inneranimalmedia-business` (cf87b717-d4e2-4cf8-bab0-a81268e32d49)

---

## The Problem We Keep Having

Every session starts with "what's the state of X?" and ends with half-shipped features. This doc is the single source of truth. Before ANY new session: read this. Before ANY new feature: check if it belongs here.

**Root causes of running in circles:**
1. No stable architectural contract — things get built without a clear home
2. Agent Sam has no real memory of what's been decided
3. Testing is binary (31/31) but doesn't measure quality
4. Provider costs not being tracked against outcomes
5. The codebase is one 21k-line monolith — hard to reason about safely

---

## Current Infrastructure (Ground Truth)

### Workers
| Worker | URL | Purpose |
|---|---|---|
| `inneranimalmedia` | inneranimalmedia.com | Primary prod worker — everything |
| `inneranimal-dashboard` | inneranimal-dashboard.meauxbility.workers.dev | Sandbox for testing |
| `inneranimalmedia-mcp-server` | mcp.inneranimalmedia.com | MCP tool server |
| `iam-pty-cf` | terminal.inneranimalmedia.com | PTY tunnel relay |
| `agent` | agent.meauxbility.workers.dev | mobiledashboard proxy (in progress) |
| `inneranimalmedia-tail` | — | Log tail worker |

### Bindings (prod worker)
| Binding | Type | Purpose |
|---|---|---|
| `env.DB` | D1 | inneranimalmedia-business — main DB |
| `env.DASHBOARD` | R2 | agent-sam bucket — frontend assets |
| `env.R2` | R2 | iam-platform — message/session blobs |
| `env.ASSETS` | R2 | inneranimalmedia-assets — static files |
| `env.AUTORAG_BUCKET` | R2 | autorag — knowledge base source files |
| `env.DOCS_BUCKET` | R2 | iam-docs — documentation |
| `env.TOOLS` | R2 | tools — Monaco/Excalidraw artifacts |
| `env.KV` | KV | Session cache |
| `env.SESSION_CACHE` | KV | dc87920b — tenant session cache |
| `env.AGENT_SESSION` | DO | AgentChatSqlV1 — per-session SQLite |
| `env.AI` | Workers AI | On-device model inference |
| `env.MYBROWSER` | Browser | Playwright headless |
| `env.HYPERDRIVE` | Hyperdrive | Supabase Postgres connection |
| `env.VECTORIZE` | Vectorize | ai-search-inneranimalmedia-aisearch |

### D1 Database Scale
- **300+ MB** — already large, stop adding tables carelessly
- **200+ tables** — most underutilized
- **Rule:** New features use EXISTING tables or get their own dedicated DB (like `sandbox`)

### PTY Terminal
- **Process:** PM2 → `~/iam-pty/ecosystem.config.cjs` → port 3099
- **Tunnel:** Cloudflare tunnel `aa79ecd4` → terminal.inneranimalmedia.com
- **Auth:** PTY_AUTH_TOKEN must match worker secret
- **Recovery:** See `skill_pty_restart` in `agentsam_skill`

---

## Agent Sam — Current State & Required Fixes

### What Works
- SSE streaming chat (Anthropic, OpenAI, Google)
- `terminal_execute` — runs shell commands via PTY
- `workspace_read_file` — reads local files via PTY
- `workspace_list_files` — lists directory contents
- `d1_query` / `d1_write` — database operations
- `r2_read` / `r2_write` — R2 storage operations
- `excalidraw_*` — Excalidraw canvas control
- `github_repos` — list repositories

### What Is Broken (Do Not Pretend Otherwise)
| Tool | Issue | Fix Status |
|---|---|---|
| `github_file` | `encodeURIComponent(path)` encodes `/` as `%2F` — GitHub API rejects it | Fixed in v39 |
| `r2_write` | 56% failure rate — bucket binding routing issue | Not fixed |
| `imgx_generate_image` | 62% failure rate | Not fixed |
| `workspace_write_file` | Tool doesn't exist | Not built |
| AI Assist panel | Was sending `system_context` field → 400 | Fixed in v39 |

### Routing (Critical — Was Broken, Now Fixed)
All `ai_routing_rules` were `is_active=0`. Every request defaulted to Haiku. Fixed 2026-04-05:

| Intent/Mode | Model | Provider | Cost/Mtok |
|---|---|---|---|
| code, implement, build, fix | gpt-5.4 | OpenAI | $2.5/$15 |
| plan mode | gpt-5.4 | OpenAI | $2.5/$15 |
| debug mode | gpt-5.4 | OpenAI | $2.5/$15 |
| agent mode | gpt-5.4-mini | OpenAI | $0.75/$4.5 |
| shell, terminal, deploy | gemini-3-flash-preview | Google | $0.5/$3 |
| sql, database, schema | gemini-3-flash-preview | Google | $0.5/$3 |
| question, explain, what/how/why | gemini-3-flash-preview | Google | $0.5/$3 |
| ask mode | gpt-4.1-nano | OpenAI | $0.1/$0.4 |
| image generation | dall-e-3 | OpenAI | — |
| fallback (no rule match) | gpt-4.1-nano | OpenAI | $0.1/$0.4 |

**Anthropic is NOT the default anymore.** Haiku should only appear in judge/classification roles.

### classifyIntent
- Reads `agent_intent_patterns` table (currently has 4 patterns: sql, shell, question, mixed)
- Needs expansion — `code`, `plan`, `debug`, `image` patterns must be added
- Until then, most requests fall through to fallback model

---

## AutoRAG — What It Actually Is

AutoRAG is **Cloudflare's managed RAG pipeline**. It is NOT:
- A training system
- A fine-tuning pipeline
- A replacement for your DB

It IS:
- An automatic ingestion pipeline: you PUT files in R2 → Cloudflare chunks + embeds them
- A retrieval API: `env.AI_SEARCH.search(query)` → returns relevant chunks
- A knowledge base for Agent Sam to search when answering questions about your codebase/docs

### Current AutoRAG State
- **Binding:** `env.AI_SEARCH` (iam-autorag instance)
- **Source bucket:** `env.AUTORAG_BUCKET` (autorag R2 bucket)
- **Index:** `env.VECTORIZE_INDEX` (ai-search-iam-autorag)
- **Status:** Ingestion pipeline wired, but `knowledge_sync` returns "Unauthorized" — auth issue on the sync endpoint

### AutoRAG Storage Strategy (Correct Pattern)
```
Source documents → autorag R2 bucket (raw files: .md, .txt, .json)
     ↓ (Cloudflare auto-processes)
Vectorize index (embeddings — searchable)
     ↓ (Agent Sam calls)
env.AI_SEARCH.search("how does classifyIntent work?")
     → returns relevant chunks from your docs
```

**What goes in AutoRAG:**
- `docs/` — architecture decisions, runbooks, this README
- `worker.js` sections (chunked by function)
- `agentsam_skill` content (so Agent Sam can search its own skills)
- Deployment logs and benchmark results

**What does NOT go in AutoRAG:**
- User data, chat messages, conversations
- Raw database rows
- Binary files, images

### AutoRAG Fix Needed
The knowledge sync is hitting a `/api/knowledge/sync` endpoint that returns 401. This runs post-deploy. Fix: add the deploy script's API token to the sync request auth header.

---

## MCP — Model Context Protocol

### Current MCP Server
- **URL:** mcp.inneranimalmedia.com/mcp
- **Tools registered:** 85+
- **Repo:** SamPrimeaux/inneranimalmedia-mcp-server

### Tool Routing (filterToolsByIntent)
Tools are filtered before being sent to the AI to reduce token count. Sending all 85 tools on every request costs ~6,000 tokens. After filtering, ~5 tools.

Current filter categories:
- `agent`: terminal, workspace, d1, r2, github, excalidraw
- `plan`: d1_query, knowledge_search, github_file, r2_read
- `ask`: knowledge_search, platform_info
- `shell`: terminal_execute, workspace_*
- `browser`: playwright_screenshot, preview_in_browser
- `voxel`: r2_write, get_r2_url, preview_in_browser

### MCP Gaps
1. `workspace_write_file` — Agent can READ files but cannot WRITE them. Must use `terminal_execute` + heredoc workaround
2. Tool success rates not being tracked per-model — `mcp_tool_calls.invoked_by` column exists but not being used for routing decisions
3. R2 bucket routing — `r2_write` defaults to wrong binding in some code paths

---

## AI Provider Strategy

### Provider Allocation (Stop Ignoring What's Available)
| Provider | Best For | Models to Use | Not Good For |
|---|---|---|---|
| **OpenAI** | Code, structured output, tool use | gpt-5.4, gpt-5.4-mini, gpt-4.1-nano | Long documents, cheap Q&A |
| **Google/Gemini** | Q&A, shell tasks, cheap high-volume | gemini-3-flash-preview, gemini-3.1-pro | Complex multi-step reasoning |
| **Anthropic** | Judge/evaluation role, refusal detection | claude-haiku-4-5 (judge only) | Being the primary model |
| **Workers AI** | Free tier, on-device, zero latency | llama-3.3-70b, llama-4-scout | Code quality, complex reasoning |
| **Vertex/Google Cloud** | Not yet integrated | — | — |

### Provider Testing Infrastructure
- **Table:** `ai_api_test_runs` — 32 rows, `assertion_passed=-1` on most (not being evaluated)
- **Endpoint:** `POST /api/admin/run-provider-test` — designed but NOT YET BUILT in worker
- **Judge model:** claude-haiku-4-5 (cheap, fast — grades other models' outputs)
- **Goal:** Weekly automated comparison → auto-update `ai_routing_rules`

### Cost Control Rules
1. NEVER use gpt-5.4 for routing/classification — use gpt-4.1-nano ($0.1/$0.4)
2. NEVER use Opus for anything except explicit user request
3. Gemini Flash for all high-volume simple tasks — $0.5/$3 is 30x cheaper than Sonnet
4. Cache read tokens = free — design prompts to maximize cache hits
5. Every AI call MUST write cost to `agent_telemetry` or `ai_api_test_runs`

---

## Data Architecture Rules

### The Cardinal Rule
**The `inneranimalmedia-business` D1 is already 300MB with 200+ tables. Do not add tables without a migration plan and a justified reason.**

Before adding a table, ask:
1. Does an existing table serve this purpose? (probably yes)
2. Does this data belong in R2 instead? (blobs, large text → R2)
3. Does this need its own D1 database? (isolated feature → dedicated DB like `sandbox`)

### Correct Data Placement
| Data Type | Goes In | Why |
|---|---|---|
| Chat messages | `agent_messages` + R2 blob | D1 for metadata, R2 for content |
| Session state | `agent_sessions` + KV cache | KV for hot reads |
| AI knowledge/docs | AutoRAG (R2 → Vectorize) | Semantic search |
| Tool artifacts | `tools` R2 bucket | Monaco, Excalidraw outputs |
| Cost/usage | `agent_telemetry`, `ai_costs_daily` | Already exists — use it |
| Agent runs | `agentsam_agent_run` | Already exists — use it |
| Deployment records | `deployments` | Already exists — use it |

### R2 Bucket Map
| Bucket | Binding | Purpose |
|---|---|---|
| agent-sam | `env.DASHBOARD` | Frontend static assets |
| iam-platform | `env.R2` | Message blobs, session data |
| inneranimalmedia-assets | `env.ASSETS` | Public assets, index-v3.html |
| autorag | `env.AUTORAG_BUCKET` | AutoRAG knowledge source files |
| iam-docs | `env.DOCS_BUCKET` | Documentation |
| tools | `env.TOOLS` | Monaco/Excalidraw artifacts |

---

## Deploy Pipeline

**Never skip steps. Never deploy direct to prod.**

```
1. Edit code locally (worker.js or frontend)
2. node --check worker.js              # must exit 0
3. npm run build (from agent-dashboard/) # must have 0 errors
4. git add -A && git commit
5. ./scripts/deploy-sandbox.sh         # builds + uploads R2 + deploys sandbox
6. ./scripts/benchmark-full.sh sandbox # must be 31/31
7. ./scripts/promote-to-prod.sh        # Sam runs this — never Cursor/Agent
8. ./scripts/benchmark-full.sh prod
9. git push origin main
```

### Repo Root
`/Users/samprimeaux/Downloads/inneranimalmedia/inneranimalmedia-agentsam-dashboard`

### Version History
- **v38** (current prod) — `a7e6bfa` — terminal game UI, AI assist, DB health, workspace config
- **v39** (in progress) — `6752f3c` — ws_inneranimalmedia, github_file fix, GPT/Gemini routing

---

## Agent Sam Skills Reference

Skills live in `agentsam_skill` table. Agent Sam loads them at session start via `skill_session_bootstrap` (`always_apply=1`).

| Skill ID | Trigger | Purpose |
|---|---|---|
| `skill_session_bootstrap` | always | Load context at session start |
| `skill_deploy` | `/deploy` | Full deploy pipeline procedure |
| `skill_pty_restart` | `/pty-restart` | PTY diagnosis and recovery |
| `skill_benchmark` | `/benchmark` | What 31/31 means, how to run |
| `skill_provider_compare` | `/provider-compare` | Run cross-provider tests, update routing |
| `skill_debug_protocol` | `/debug` | Systematic debugging approach |
| `skill_autorag_retrieval` | `autorag` | Search knowledge base |
| `skill_iam_cidi_three_tier` | `iam-cidi` | Deploy tier governance |

---

## What Needs To Be Built (Priority Order)

### P0 — Blocks Agent Sam from being useful
1. **`workspace_write_file` MCP tool** — Agent can read but not write files
2. **`POST /api/admin/run-provider-test`** — Provider comparison endpoint with LLM-as-judge
3. **AutoRAG knowledge sync** — Fix the 401 on `/api/knowledge/sync` post-deploy
4. **`classifyIntent` pattern expansion** — Add code, plan, debug, image patterns to `agent_intent_patterns`

### P1 — Quality of life
5. **`r2_write` 56% failure fix** — Bucket binding routing issue
6. **Terminal text copy** — `copyOnSelection` + `rightClickSelectsWord` (in v39)
7. **Image viewer in Monaco** — PNG shows as PLAINTEXT (backend fix in `/api/r2/file`)
8. **TSX live preview** — `GET /api/preview/tsx` via Sucrase + esm.sh

### P2 — Intelligence improvements
9. **LLM-as-judge evaluator** — Auto-grade provider outputs, update routing rules weekly
10. **`github_file` for private repos** — Currently uses OAuth token; needs GitHub App JWT
11. **Cost tracking closure** — `total_cost_usd` in `ai_api_test_runs` always 0; calculate from token counts × rates

### P3 — New capabilities
12. **mobiledashboard wiring** — `agent.meauxbility.workers.dev` → sandbox D1 proxy
13. **Anthropic Batch API** — 50% cost reduction for nightly summarization/compaction
14. **Multi-workspace UI** — `currentWorkspaceId` wired into app state

---

## The Storage Strategy (For AutoRAG/Brand Data)

The doc you found in the repos describes the correct pattern for **MeauxCloud brand data**. It applies to any large context storage:

```
Large text/context → R2 (unlimited, permanent, no truncation)
    Path: brands/{slug}/context/{timestamp}.json

Metadata/relationships → D1 (fast queries, small footprint)
    Columns: name, slug, r2_path, created_at

Semantic search → Vectorize via AutoRAG (embedded chunks)
    Only after R2 ingestion is stable
```

**Do not put large text blobs in D1 columns.** D1 rows have practical size limits and the DB is already 300MB.

---

## Session Startup Checklist

Before starting any new dev session, Agent Sam should:

1. `d1_query`: `SELECT version, created_at FROM deployments ORDER BY created_at DESC LIMIT 1` — what's live?
2. `d1_query`: `SELECT COUNT(*) FROM agentsam_agent_run WHERE status='in_progress' AND created_at < datetime('now','-1 hours')` — any stuck runs?
3. `d1_query`: `SELECT memory_key, memory_value FROM agent_platform_context WHERE agent_id='agent_sam'` — load context
4. Check `skill_session_bootstrap` content — load all active skills
5. Read this document from AutoRAG or R2 before making any architectural decisions

---

## Anti-Patterns (Stop Doing These)

1. **Adding new D1 tables for every feature** — use existing tables or R2
2. **Hardcoding `ws_samprimeaux`** — always use `ws_inneranimalmedia`
3. **Using Anthropic/Haiku as default** — use GPT-4.1-nano or Gemini Flash
4. **Deploying without benchmarking** — 31/31 is the gate, not optional
5. **Running multiple Claude/AI tool subscriptions simultaneously** — pick one tooling stack
6. **Making Agent Sam plan things it could just do** — if it can run the terminal, run it
7. **Designing new systems without checking if the table already exists** — 200+ tables, most are unused
8. **Sending all 85 MCP tools on every request** — filterToolsByIntent exists, use it
9. **Long planning conversations** — plan in D1 (`agentsam_project_context`), execute immediately
10. **Not reading error messages** — the exact error always tells you what's wrong

---

*This document should be stored in `autorag` R2 bucket as `docs/architecture.md` so Agent Sam can retrieve it via `knowledge_search`. Keep it updated after every major session.*
