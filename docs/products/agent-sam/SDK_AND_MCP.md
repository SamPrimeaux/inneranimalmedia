# Agent Sam — SDK and MCP

**Parent:** [README.md](./README.md)

---

## Agent Sam SDK (product)

| Item | Value |
|------|-------|
| D1 project | `proj_agentsam_sdk` |
| npm | `@inneranimalmedia/agentsam-sdk` |
| GitHub | `SamPrimeaux/agentsam-sdk` |
| Gorilla shell | `examples/gorilla-shell` |
| Status | `development` |

Migration: `754_agentsam_sdk_project_registration.sql`

---

## SDK API (main worker)

**File:** `src/api/sdk.js`

```
POST /api/sdk/auth/start
POST /api/sdk/auth/exchange
GET  /api/sdk/context
POST /api/sdk/scaffold   (NDJSON stream)
```

**Scaffold:** `src/core/sdk-scaffold.js` — provisions D1, KV, Worker bindings via customer Cloudflare OAuth; streams template files (`sdk-gorilla-template.js`).

**Design intent:** External developers (e.g. Connor) never clone IAM repos — Agent Sam provisions server-side.

---

## MCP (separate worker)

| Item | Value |
|------|-------|
| Worker | `inneranimalmedia-mcp-server` |
| URL | `mcp.inneranimalmedia.com` |
| Deploy | `npm run deploy:full` from MCP repo only |
| Catalog | Same `agentsam_tools` as main worker |

Docs: `docs/MCP_README.md`, `.agents/skills/mcp-oauth-field-guide/`

---

## Cloudflare Agents SDK (implementation)

**Not** the Agent Sam product — adoption target for durable subagents:

- `docs/platform/agents-sdk-2026-06-adoption.md`
- Think DO, `runTurn`, detached `runAgentTool`

Current stack: custom `AgentChatSqlV1`, `runAgentToolLoop` — migration planned.

---

## Distinction table

| Name | What it is |
|------|------------|
| **Agent Sam** | IAM brand, D1 catalog, developer UX |
| **Agent Sam SDK** | npm/CLI resale product |
| **MCP Connect** | OAuth API for external clients |
| **@cloudflare/agents** | CF implementation library |

---

## Related

- [PRODUCT_PRINCIPLES.md](./PRODUCT_PRINCIPLES.md)
- [decisions/PDR-0003-sdk-is-a-primary-distribution-surface.md](./decisions/PDR-0003-sdk-is-a-primary-distribution-surface.md)
