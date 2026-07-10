# Agent Sam — product principles

**Status:** Accepted

---

## Identity

Agent Sam is the **branded intelligence and execution platform** for Inner Animal Media — inherited by the Workspace and every product surface.

It is simultaneously:

1. **Runtime infrastructure** — chat spine, routing, tools, memory, terminal
2. **Customer/developer product** — SDK, MCP, CLI, scaffold engine

---

## Principles

### 1. One runtime, many surfaces

In-app chat, embedded side panels, MCP OAuth, and SDK scaffolds share D1 catalog and execution patterns. Products do not fork separate agent stacks.

### 2. Route and project awareness

Agents receive `route_key` and project context. A CMS agent is not a generic chatbot.

### 3. SDK is a primary distribution surface

`@inneranimalmedia/agentsam-sdk` and `/api/sdk/scaffold` enable developers who never use the Foundry. Resell/scale lane — D1 `proj_agentsam_sdk`.

### 4. MCP is external; in-app is internal

MCP worker is separate repo. Dashboard Agent Sam does not proxy through MCP.

### 5. Cloudflare Agents SDK ≠ Agent Sam brand

`@cloudflare/agents`, `@cloudflare/think` are **implementation technology** targets. Agent Sam is the IAM product, catalog, and developer experience.

### 6. Tools from catalog only

`agentsam_tools` + route requirements. No invented tool names in product code.

### 7. BYOK by default; platform bypass for superadmin

Credential resolution from D1 — not per-user Wrangler secrets.

---

## Not Agent Sam

| Misconception | Truth |
|---------------|-------|
| "The dashboard" | Workspace shell |
| "Agent Sam = chat page" | One UI surface among many |
| "166 tools every chat" | Route-compiled allowlist |
| "Memory replaces docs" | Preferences vs principles |

---

## Related

- [SURFACES.md](./SURFACES.md)
- [SDK_AND_MCP.md](./SDK_AND_MCP.md)
- [../../shared/AGENT_RUNTIME.md](../../shared/AGENT_RUNTIME.md)
