---
name: openai-agent-building-current-docs
doc_type: provider-research
provider: openai
status: research-not-implementation
last_reviewed: 2026-06-06
description: "Source-grounded OpenAI research note for future Agent Sam work — Responses API, Agents SDK, Agent Builder, MCP, Secure MCP Tunnel, structured outputs, tool calling, pricing posture, and source hygiene. Consult official OpenAI docs or Docs MCP before changing IAM stack. NOT an Inner Animal Media architecture or implementation plan."
license: Proprietary — Inner Animal Media
---

# OpenAI Agent Building — Current Provider Notes

**Purpose:** This document is a **source-grounded OpenAI research note** for future Agent Sam implementation. It stays **provider-focused**: what OpenAI currently offers, how OpenAI recommends using it, what the pricing surfaces are, and where the docs say to use Responses API, Agents SDK, Agent Builder, MCP, Secure MCP Tunnel, structured outputs, and tool calling.

**This is not** the Inner Animal Media architecture rewrite. **This is** the source-of-truth layer we should inspect before changing our own stack.

**Rule for agents:** For OpenAI API questions, consult [OpenAI official docs](https://developers.openai.com) or the [OpenAI Docs MCP](#8-openai-docs-mcp--source-hygiene) first — then cite the source. Do not rely on model memory for model names, pricing, tool support, tunnel behavior, deprecations, or schema details.

---

## Official sources (start here)

| Topic | URL |
|-------|-----|
| Responses API | https://platform.openai.com/docs/api-reference/responses |
| Agents SDK | https://openai.github.io/openai-agents-python/ · https://developers.openai.com |
| Agent Builder / ChatKit | https://platform.openai.com/docs/guides/agent-builder |
| Function calling | https://platform.openai.com/docs/guides/function-calling |
| Structured Outputs | https://platform.openai.com/docs/guides/structured-outputs |
| MCP / remote MCP | https://platform.openai.com/docs/guides/tools-connectors-mcp |
| Secure MCP Tunnel | https://developers.openai.com/api/docs/guides/secure-mcp-tunnels |
| `tunnel-client` (GitHub) | https://github.com/openai/tunnel-client |
| Pricing | https://platform.openai.com/docs/pricing |
| Prompt caching | https://platform.openai.com/docs/guides/prompt-caching |
| Agent safety | https://platform.openai.com/docs/guides/agent-builder-safety |
| OpenAI Docs MCP | https://developers.openai.com (Docs MCP — read-only doc retrieval) |

Re-verify URLs and pricing on every major implementation pass — OpenAI ships frequently.

---

## 1. Core build lanes

OpenAI currently frames **three overlapping build lanes**. They are complementary, not interchangeable.

### Responses API — direct model-request path

The API reference describes **Responses** as OpenAI’s advanced interface for generating model responses. It supports text/image inputs, text outputs, stateful interactions, built-in tools (file search, web search, computer use), and external actions through **function calling**.

**Use when:** Our app owns the loop but wants a single HTTP surface for model + tools + multimodal without full orchestration framework.

### Agents SDK — code-first orchestration

OpenAI’s docs describe **agents** as apps that plan, call tools, collaborate across specialists, and keep enough state to complete multi-step work. The **Agents SDK** is the code-first layer for workflows where **our application owns** tools, handoffs, approvals, tracing, state, and sandbox execution.

**Use when:** Orchestration becomes a product concern (handoffs, guardrails, tracing, multi-agent).

### Agent Builder — visual workflow canvas

**Agent Builder** is the visual workflow canvas: build multi-step agent workflows, use templates, drag/drop nodes, typed inputs/outputs, preview runs with live data, then deploy via **ChatKit** or export SDK code.

**Use when:** Prototyping, stakeholder review, or exporting starter SDK graphs — not as the first place to hardcode platform logic.

### Initial recommendation (IAM — research only)

| Lane | IAM posture |
|------|-------------|
| **Responses API** | Direct calls and simple tool loops |
| **Agents SDK** | When orchestration is a first-class product feature |
| **Agent Builder / ChatKit** | Inspection and prototyping lane — not primary SSOT for platform law |

---

## 2. Tooling surfaces to inspect

OpenAI’s current tool categories include **built-in tools**, **function calling**, **tool search**, and **remote MCP servers**. Documented extensions include web search, file search, tool search, function calling, and remote MCP.

**Tool search** is listed as supported only on **gpt-5.4 and later** models — deferred/dynamic tool selection at scale.

### Function calling (app-owned actions)

OpenAI describes function calling as the way models interface with external systems and access data/actions outside training data. Function tools are **JSON-schema-defined**; custom tools can use free-form text input/output.

**Initial recommendation:** Keep normal business actions as **strict function tools** first.

### MCP / connectors (external capability)

MCP/connectors can give models access to external services; tool calls may be automatic or require developer approval.

**Initial recommendation:** Use **MCP for reusable external capability surfaces**. Use **tool search** later only when we have a large tool library and need deferred selection.

---

## 3. Secure MCP Tunnel

**Secure MCP Tunnel** is the most interesting OpenAI item for IAM — but **not a tonight task**.

OpenAI’s docs say Secure MCP Tunnel connects **private MCP servers** to supported OpenAI products **without** opening inbound firewall ports or exposing the MCP server to the public internet. The **tunnel client** runs inside the network that can already reach the MCP server, opens **outbound HTTPS** to OpenAI, pulls queued MCP work, forwards local requests, and returns responses through the tunnel.

### Use cases (from OpenAI docs)

- MCP servers on a private network, on-premises, on a developer machine, or behind existing access controls
- ChatGPT, Codex, **Responses API**, AgentKit, and other supported OpenAI surfaces need MCP without making the server public

### Why this matters for IAM

This could let Agent Sam expose **private MCP tools** to OpenAI-powered surfaces without making our internal MCP server public. That is a cleaner direction for private build/deploy/admin/dev tools than opening public routes solely so an agent can reach them.

**Contrast with today:** IAM MCP at `mcp.inneranimalmedia.com` is a **public OAuth MCP worker** for external clients. Secure MCP Tunnel is the inverse — **OpenAI calls inward** through an outbound-only tunnel to a **private** MCP host.

### Initial recommendation

Treat Secure MCP Tunnel as a **future private-agent bridge for internal tools only**. Do **not** use it as a public customer API layer.

**Inspect next:** `tunnel-client` quickstart against one tiny private test MCP server (parking lot).

---

## 4. Structured output + strict tool contracts

**Structured Outputs** ensures model text responses adhere to a supplied JSON Schema — fewer missing keys and invalid enum values.

For **function calling**, OpenAI recommends **strict mode**. With `strict: true`, function calls must adhere to the function schema. OpenAI notes strict mode requires:

- `additionalProperties: false` on each object
- All fields in `properties` marked as **required**
- Nullable optional values: include `null` in the `type` (e.g. `["string", "null"]`)

### Initial recommendation

Every production tool should have:

- Strict schema (`strict: true`)
- Narrow name and clear description
- Explicit required fields
- Nullable optional values where appropriate
- No extra properties

Reserve **free-form custom tools** for code patches, long text transforms, or cases where JSON schema is a poor fit.

---

## 5. Input vs output cost posture

On OpenAI’s pricing page, **output tokens are much more expensive than input tokens** for flagship text models. Example list prices (verify live before budgeting):

| Model (example tier) | Input / 1M | Cached input / 1M | Output / 1M |
|----------------------|------------|-------------------|-------------|
| gpt-5.5 (short context) | $5.00 | $0.50 | $30.00 |
| gpt-5.4-mini | $0.75 | $0.075 | $4.50 |

### Prompt caching

OpenAI says prompt caching works automatically on recent models, has no extra fee, and can reduce latency (up to ~80%) and input cost (up to ~90%). Cache hits require **exact prefix matches** — put static instructions/examples **first**, variable user content **last**.

### Reasoning models

Reasoning tokens may be invisible in the API but still occupy context and are billed as **output tokens**. OpenAI recommends `max_output_tokens` to cap total generated tokens (reasoning + final output).

### Initial recommendation

- Optimize **output** first — concise default answers, cap outputs
- Stream intermediate state only when useful
- Separate “thinking/tool work” from “user-visible report”
- Stable system/tool instructions first (caching)
- Avoid dumping giant mutable context into every call

---

## 6. Tool pricing to account for

Current OpenAI pricing surfaces (verify live):

| Tool / surface | Listed pricing (indicative) |
|----------------|---------------------------|
| Web search | $10 / 1k calls (web search / all models and preview/reasoning); non-reasoning preview web search $25 / 1k calls; search content tokens at model rates where applicable |
| File search storage | $0.10 / GB-day (1 GB free) + $2.50 / 1k tool calls |
| ChatKit file/image upload storage | $0.10 / GB-day after 1 GB free per account per month |
| Hosted Shell / Code Interpreter | By container size per 20-min session: 1 GB $0.03 · 4 GB $0.12 · 16 GB $0.48 · 64 GB $1.92; eligible sessions billed per minute, 5-minute minimum |

### Initial recommendation

- **Web search:** only when freshness/citation matters
- **File search:** when OpenAI-hosted retrieval makes sense — do not blindly duplicate IAM R2 + Vectorize/Supabase lanes
- **Hosted shell / code interpreter:** contained jobs — not always-on background workers

---

## 7. Safety / approval posture

OpenAI’s agent safety docs recommend that when using **MCP tools**, tool approvals should stay on so end users can review and confirm operations — including reads and writes. Guardrails for incoming inputs can redact PII and detect jailbreak attempts.

The **Agents SDK** includes built-in **tracing** for model generations, tool calls, handoffs, guardrails, and custom events — for debugging and monitoring workflows.

### Initial recommendation (aligns with IAM policy direction)

| Action class | Default |
|--------------|---------|
| Reads (low risk) | Lower friction where policy allows |
| Writes, deploys, deletes, billing, credentials, customer data, production mutations | **Explicit approval** |
| Tracing | Enabled in dev/staging before prompt tuning |

---

## 8. OpenAI Docs MCP / source hygiene

OpenAI hosts a **public Docs MCP server** for developer documentation across `developers.openai.com` and `platform.openai.com`. It provides **read-only** access to OpenAI developer docs and does **not** call the OpenAI API on your behalf.

### Agent instruction (proposed)

> For OpenAI API questions: consult OpenAI’s official docs or Docs MCP first, then cite the source. Do not rely on model memory for model names, pricing, tool support, tunnel behavior, deprecations, or schema details.

### Relationship to IAM stack (context only — not a decision)

| IAM today | OpenAI doc topic |
|-----------|------------------|
| Cloudflare Workers + D1 `agentsam_tools` | vs OpenAI function tools / MCP |
| `mcp.inneranimalmedia.com` public OAuth MCP | vs Secure MCP Tunnel private bridge |
| R2 + Supabase pgvector + Vectorize lanes | vs OpenAI file search / hosted retrieval |
| `agentsam_model_catalog` D1-driven routing | vs OpenAI model picker in Responses/Agents SDK |

**No rewrite implied.** This table is for comparison during future design reviews.

---

## Parking lot (inspect later — not tonight)

1. **Secure MCP Tunnel** — setup against one tiny private test MCP server (`tunnel-client help quickstart`)
2. **Responses API** — strict function-calling examples end-to-end
3. **Agent Builder** — export quality vs hand-written Agents SDK
4. **ChatKit** — widget/action fit for Agent Sam dashboard UI
5. **OpenAI hosted file search** vs IAM `inneranimalmedia-autorag` + Vectorize/Supabase retrieval lanes
6. **Cost calculator** — model run with search + tools + structured output
7. **Policy** — approvals, tracing, and production tool permissions matrix
8. **Docs MCP** — wire into operator research workflow (read-only)

---

## Document maintenance

| Field | Value |
|-------|-------|
| R2 target (future) | `inneranimalmedia-autorag/skills/openai/openai-agent-building-current-docs.md` |
| Repo path | `skills/openai/openai-agent-building-current-docs.md` |
| Ingest lane | Optional — `ingest_repo_skills_rag.mjs` → documents Vectorize when stabilized |
| Next review trigger | Before any IAM “Responses API migration” or “OpenAI Agents SDK adoption” epic |

**Shape:** Provider truth first. Implementation later.
