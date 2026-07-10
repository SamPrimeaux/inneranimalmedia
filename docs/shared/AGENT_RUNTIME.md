# Agent Sam runtime (shared inheritance)

**Status:** Canonical · **Scope:** What every product inherits from Agent Sam infrastructure

Agent Sam is the **branded intelligence and execution layer** of Inner Animal Media. Products embed or call this runtime; they do not reimplement it.

> Agent Sam is not synonymous with `/dashboard/agent`, the entire platform, or the Workspace.

For Agent Sam as a **product** (SDK, MCP, resale), see [../products/agent-sam/PRODUCT_PRINCIPLES.md](../products/agent-sam/PRODUCT_PRINCIPLES.md).

---

## Request spine (in-app)

**Entry:** `POST /api/agent/chat` → `src/api/agent-chat-spine.js`

```
Auth + workspace resolution
  → resolveModel (agentsam_routing_arms / agentsam_model_catalog)
  → compileModeProfile (agentsam_prompt_routes + agentsam_route_requirements)
  → execution_kind (agent_tool_loop | multitask_fanout | …)
  → dispatchStream (provider from catalog api_platform)
  → runAgentToolLoop (compiled allowlist only)
```

**Modes:** Ask | Plan | Agent | Debug | Multitask — `src/core/agent-mode.js`

**Known gap:** Agent mode may compile zero tools while still calling the model (see root README P0).

---

## Context layers

Products receive stacked context:

| Layer | Source |
|-------|--------|
| **Authenticated identity** | Session / OAuth — `user_id`, `workspace_id`, `tenant_id`, role |
| **Product / route context** | `dashboard/lib/dashboardRouteContext.ts` → `route_key`, quick actions |
| **Project context** | `projects` + runtime contract `rule_{slug}_runtimecontract` |
| **Workspace packet** | `AgentWorkspaceContextPacket` — open files, browser URL, active tab |
| **Surface events** | e.g. `iam-designstudio-surface-context` from Design Studio |

Draw and Movie Mode: route context **partial** — not fully registered in `dashboardRouteContext.ts`.

---

## Runtime profile compilation

**Code:** `src/core/runtime-profile.js`

- Loads prompt route from D1 (`agentsam_prompt_routes`)
- Applies route requirements (`agentsam_route_requirements`)
- Selects tools (`selectAgentsamToolsForAgentChat`)
- Produces `execution_kind` and provider binding

Empty tool allowlist for repo work is a **product blocker**, not optional behavior.

---

## Model routing

**Code:** `src/core/resolveModel.js`, `src/core/provider.js`

Providers: OpenAI, Anthropic, Gemini, Vertex, Workers AI, Cursor SDK — from `agentsam_model_catalog.api_platform`.

No hardcoded model IDs in product hot paths.

---

## Tool execution

| Catalog | `agentsam_tools` (not `agentsam_mcp_tools`) |
| Executor | `src/tools/catalog-tool-executor.js` |
| Credentials | `resolveCredential` — BYOK or superadmin platform bypass |

**Lanes:** D1 (`d1_query`), Supabase (`supabase_*`), terminal (`agentsam_terminal_*`), FS (`fs_read_file`), product tools per route.

**Illustration router:** `illustration_create` → `src/core/iam-illustration-router.js` (Create family entry).

---

## Memory and retrieval

| Store | Use |
|-------|-----|
| D1 `agentsam_rules_document` | Platform + project runtime contracts |
| Supabase `agentsam` schema | Vectors, tool events, long-horizon agent data |
| Project `metadata_json` / instructions | Dashboard + AGENTSAM.md sync |
| Vectorize lanes | RAG per workspace/project policy |

**Rule:** Memory holds preferences. Documentation holds principles.

---

## MCP (external surface)

**Host:** `mcp.inneranimalmedia.com` — **separate repo** `inneranimalmedia-mcp-server`

OAuth PKCE, workspace tokens, tool allowlists — D1-driven. Same tool catalog; different dispatch and credential path.

In-app Agent Sam does **not** route through MCP.

---

## SDK and scaffold (developer surface)

**API:** `src/api/sdk.js` — auth, context, `POST /api/sdk/scaffold`  
**Engine:** `src/core/sdk-scaffold.js` — CF resource provisioning + file stream  
**Product:** `@inneranimalmedia/agentsam-sdk` (external repo, D1 `proj_agentsam_sdk`)

Lanes: `fullstack`, `cms`, `data`, `crm`, `creative`

---

## Terminal and workflows

| Surface | Role |
|---------|------|
| Terminal API | `src/api/terminal.js` — PTY local, remote GCP, sandbox container |
| Workflows | `src/api/workflows.js` + D1 `agentsam_workflows` |
| Policy gate | `agentsam_user_policy.can_run_pty` |

Terminal is a **capability**, not a standalone product route.

---

## Subagents and multitask

- Multitask: `multitask_fanout` + RWS spawn (`rws-spawn-fanout.js`)
- Design Studio default subagent slug: `cadcreator` (App.tsx)
- CF Agents SDK detached subagents: **planned** — `docs/platform/agents-sdk-2026-06-adoption.md`

---

## Telemetry

Tool events, chat runs, command telemetry — D1 + Supabase mirrors. Retention: `src/core/retention.js`.

---

## What products must not do

- Implement parallel LLM routing outside runtime profile
- Hardcode `au_*` / `ws_*` / `tenant_*`
- Invent tool names not in `agentsam_tools`
- Assume MCP and in-app chat share the same code path

---

## Related

- [iam-runtime-architecture-2026-06.md](../platform/iam-runtime-architecture-2026-06.md)
- [project-runtime-contracts.md](../platform/project-runtime-contracts.md)
- [../products/agent-sam/](../products/agent-sam/)
