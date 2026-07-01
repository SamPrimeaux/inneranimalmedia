---
title: Agents SDK Jun 2026 — Adoption Map for AgentSam
project_key: inneranimalmedia
topic: agentic_edge_sprint
updated: 2026-07-01
status: active
sdk_release: 2026-06-26
---

# Agents SDK Jun 2026 — Adoption Map for AgentSam

Cloudflare [Agents SDK release (Jun 26, 2026)](https://developers.cloudflare.com/changelog/) adds **detached background sub-agents**, **`runTurn` turn admission**, and **recovery/reliability** fixes converging `@cloudflare/think` and `@cloudflare/ai-chat`.

This doc maps that release onto **inneranimalmedia today** — what we already have, what to adopt, and how it connects to **Mac-asleep remote work** and **CF Containers**.

---

## Phone-resilient execution architecture (canonical)

**Core problem:** execution today blocks inside the HTTP request (`rws-spawn-fanout.js`). No durable handle outlives the connection. Mac asleep / phone locked = work dies. This is routing + architecture, not hardware.

```
Phone (OAuth ChatGPT / Claude / dashboard)
        │  one quick request
        ▼
runTurn({ mode: "submit" | "stream" })     ← single entry point (SDK Phase 2)
        │
        ▼
Think DO (durable — survives eviction)
        │  runAgentTool(Facet, { detached: { notify: true } })
        ▼
   ┌─────────────────────┬──────────────────────┬─────────────────────┐
   │ TerminalRemoteFacet │ ContainerDevFacet    │ ContainerBatchFacet │
   │ → GCP VM            │ → CF Container       │ → CF Container      │
   │   persistent repo   │   shared pool        │   shared pool       │
   └─────────────────────┴──────────────────────┴─────────────────────┘
        │  reportProgress / milestone
        ▼
   reconnecting client (any device, Mac asleep OK)
```

**Only the Think DO must be durable.** Exec target (VM vs Container) is swappable without touching detachment. Both `ContainerDevFacet` and `ContainerBatchFacet` dispatch to the same shared `inneranimalmedia` Container pool (`getByName`), differentiated by cwd/R2 path — not by separate DO instances.

---

## Tool → lane mapping (target state)

| Tool | Exec target | Isolation | Use for |
|------|-------------|-----------|---------|
| `agentsam_terminal_local` | Mac `localpty` | None (host shell) | Desk work when iMac awake — **not** phone/OAuth primary |
| `agentsam_terminal_remote` | GCP `terminal.inneranimalmedia.com` | Shared VM FS | Sam operator — full repo, git, wrangler, persistent state |
| `agentsam_terminal_sandbox` | **CF Container** — single shared `inneranimalmedia` pool | Path/R2 isolation (`zone_slug` = cwd tag, not DO id) | MCP zones (engineer/architect/cms/specialist), experiments, CAD batch |
| `agentsam_container_exec` | CF Container (same shared pool) | Path/R2 isolation | **Merge into sandbox backend** — duplicate facet, not a separate pool |

### Two different "sandbox" concepts (do not conflate)

| Name | What it is today | Status |
|------|------------------|--------|
| **`agentsam_terminal_sandbox`** tool | Single shared `inneranimalmedia` Container pool (`getByName`), path/R2 isolation via `zone_slug` cwd tag | **Confirmed target.** Per-`zone_slug` DO instance affinity was evaluated and explicitly reverted in code (`getZoneContainerStub` now delegates to `getContainerStub`) — this is not an interim state pending a container backend, it's the chosen model. |
| **`sandboxterminal` connection** | GCP PTY hostname `wss://sandboxterminal.inneranimalmedia.com` → `/workspace/{tenant}/{user}/` | Connor/tenant lane — keep for multi-tenant PTY until container tenant facets exist |

Audit (2026-07-01, supersedes 2026-06-27 audit below): `src/core/my-container.js` confirms `resolveContainerPoolId(env)` always resolves to `inneranimalmedia` (worker name). `getContainerStub` is the single entry point every `agentsam_terminal_sandbox` exec, health probe, MovieMode render attempt, and `/v1/*` proxy call goes through. `zone_slug` is filesystem/R2-path metadata for isolation (`/mnt/r2/{workspace}/{zone_slug}/…`), not a Durable Object id. `mcp-zone-spine.js` documents this explicitly: *"Sandbox cwd zone tag (MCP panel facet or username) — NOT the CF Container DO id. Container pool is always resolveContainerPoolId() → inneranimalmedia."*

Prior audit (2026-06-27, historical): `src/core/terminal-sandbox.js` wraps `mkdir -p …/.mcp-zones/{zone}/ && cd … && cmd` and calls `runTerminalCommand` — path-level isolation, not compute-level. Two zones on the same host share CPU/RAM. This was accurate at the time but the isolation model has since moved to R2-backed paths under the single-pool architecture rather than toward per-zone Container DO instances.

### Why `agentsam_terminal_sandbox` stays a shared pool

- Tool description promises isolated `{zone_slug}` scope — delivered via cwd + R2 path isolation on one shared pool (`getByName("inneranimalmedia")`), not per-zone DO instances.
- Per-zone Container DO affinity (`zone_slug` → DO id) was tried and explicitly reverted in code — state for these jobs lives in R2/mounted paths, not on a dedicated container process per zone, so instance-per-zone bought no real isolation benefit while costing cold-start/scale complexity.
- `ContainerBatchFacet` and `ContainerDevFacet` both dispatch as sandbox with a zone — no new OAuth tools, no new DO addressing.
- `agentsam_terminal_remote` stays GCP for **your** persistent `/home/samprimeaux/inneranimalmedia` clone.
- Revisit `idFromName(workspaceId)` / `idFromName(sessionId)` routing only if a workload needs true per-user/per-workspace container affinity (persistent local `node_modules`, long-running `wrangler dev`) that can't be satisfied by R2 FUSE — that is a distinct opt-in model, not the default.

---

## Current state (audit 2026-06-27)

| Layer | Today | SDK equivalent |
|-------|-------|----------------|
| Chat DO | Custom `AgentChatSqlV1` (`src/do/AgentChat.js`) | `AIChatAgent` |
| Turn admission | Multiple SSE paths (`agent.js`, `agent-controller.js`, `agent-surface-workflow.js`) | `runTurn({ mode: 'wait' \| 'submit' \| 'stream' })` |
| Tool loop | Custom `runAgentToolLoop` (`src/core/agent-tool-loop.js`) | Think tool loop + `runAgentTool` |
| Sub-agents | D1 `agentsam_spawn_job` + `rws-spawn-fanout.js` (blocking HTTP) | `runAgentTool(ChildAgent, { detached: { … } })` |
| Progress UI | Custom SSE `ThinkingCard` / spawn events | `reportProgress` → `useAgentToolEvents` |
| Recovery | Custom SSE reconnect; no stall watchdog | `chatRecovery`, `chatStreamStallTimeoutMs`, interrupted tool repair |
| Client hooks | Custom `useAgentChatStream` | `agents/chat/react` → `useAgentChat` |
| Packages | `@cloudflare/codemode` only | Missing: `agents`, `@cloudflare/think`, `@cloudflare/ai-chat` |

**We are not on the Agents SDK chat stack yet.** Sprint 2A planned D1 spawn linkage; the Jun 26 SDK release is the **implementation target** for durable background work — not a parallel custom fanout.

---

## Feature mapping

### 1. Detached background sub-agents → **P0 for Mac-asleep + long work**

**Problem today:** `rws-spawn-fanout.js` and `create-subagent-flow.js` run child loops **inside the parent HTTP/SSE request**. If the client disconnects (phone sleep, Mac sleep, tab close), work is abandoned.

**SDK pattern:**

```typescript
await this.runAgentTool(DeployAgent, {
  input: { command: 'npm run deploy:full' },
  detached: {
    onFinish: 'onDeployDone',
    notify: true,           // inject result back into chat
    maxBudgetMs: 60 * 60 * 1000,
  },
});
```

**Maps to AgentSam:**

| SDK | AgentSam today | Target |
|-----|----------------|--------|
| `detached: { onFinish }` | `markAgentRunComplete` in D1 after blocking loop | Callback on DO after reconcile backbone completes |
| `detached: { notify: true }` | Manual `emit('text', …)` in fanout summary | Auto chat message when background run finishes |
| `reportProgress({ fraction, phase })` | Custom SSE thinking steps | Background-runs tray + persisted milestone rows |
| `cancelAgentTool(runId)` | No cancel for in-flight spawn jobs | Wire to dashboard cancel button |

**Exec lane for detached work (Mac asleep):**

```
Parent turn (AIChatAgent / Think on AGENT_SESSION DO)
  → detached DeployAgent sub-agent
  → runAgentTool dispatches terminal_remote OR container_exec
  → GCP terminal.inneranimalmedia.com OR MY_CONTAINER shared pool
  → git pull / npm build / wrangler deploy
  → onFinish / notify → parent chat continues on phone
```

This is how **ChatGPT/Claude OAuth MCP** keeps working when your Mac sleeps: the sub-agent runs on **GCP or Container**, not localpty.

---

### 2. `runTurn` — unify turn admission

**Problem today:** Three+ entry points admit turns differently:

- `POST /api/agent/chat` → SSE via `agent-controller.js`
- Workflow surface → `agent-surface-workflow.js`
- MCP panel subagent → separate stream wrapper

**SDK:** Single `runTurn({ mode })`:

| Mode | Use in AgentSam |
|------|-----------------|
| `wait` | Sync tool approval / short turns |
| `submit` | Durable turn when client may disconnect (phone) |
| `stream` | Dashboard ChatAssistant live SSE |

**Migration step:** Introduce `AgentSamThink extends Think` (or wrap `AIChatAgent`) on a **new DO class** beside `AgentChatSqlV1`; route `/api/agent/chat` through `runTurn({ mode: 'stream' })` in Phase 2. Keep SQL message storage via `syncMessagesToServer`.

---

### 3. Recovery and reliability → phone + deploy survival

| SDK fix | AgentSam gap | Action |
|---------|--------------|--------|
| Stream stall watchdog | No `chatStreamStallTimeoutMs` | Enable when on `AIChatAgent`; set 90s for long tool calls |
| Interrupted tool-call repair | Custom loop may leave dangling tool calls | Adopt `repairInterruptedToolPart` hook |
| Stuck status after reconnect | ChatAssistant may show `ready` while turn in flight | Migrate to `useAgentChat` `isRecovering` |
| Live "recovering…" on connect | Not surfaced | SDK handles on adopt |
| Agent-tool child recovery after deploy | Spawn jobs lost on DO eviction | **Detached sub-agents fix this** — replace blocking fanout |
| Terminal connection failures | Custom WS retry | `connectionError` / `onConnectionError` on client |

---

### 4. Code Mode (already partially integrated)

| Change in release | Our package | Action |
|-------------------|-------------|--------|
| Default timeout 30s → 60s | `@cloudflare/codemode@^0.4.2` | ✅ bump in package.json |
| Worker dispose after run | 0.4.x | ✅ upgrade |
| MCP tool-call context to OpenAPI callbacks | audit codemode usage | verify in agent-tool-loop |

---

### 5. Shared chat React core

Release adds `agents/chat/react` with `useAgentChat`, `syncMessagesToServer`.

**Today:** `dashboard/components/ChatAssistant/hooks/useAgentChatStream.ts` (custom SSE parser).

**Phase 3:** Thin wrapper over SDK hooks; keep ThinkingCard mapping via `useAgentToolEvents` for background runs tray.

---

## Where CF Containers fit (with SDK)

Containers are **not** the chat agent. They are an **exec facet** that detached sub-agents call:

```
Think / AIChatAgent (AGENT_SESSION DO)
  └─ runAgentTool detached
       ├─ TerminalRemoteFacet → GCP iam-tunnel (repo clone, git, wrangler)
       ├─ ContainerDevFacet   → MY_CONTAINER shared pool (edge dev desk — upgrade from Alpine smoke)
       └─ ContainerBatchFacet → MY_CONTAINER shared pool (moviemode / CAD offload)
```

`ContainerDevFacet` and `ContainerBatchFacet` are both routed through the same `getByName("inneranimalmedia")` stub, distinguished by cwd/R2 path and image build, not by separate Durable Object instances.

| Facet | Image | Role |
|-------|-------|------|
| **GCP terminal** | N/A (VM) | Primary operator desk until container dev image proven |
| **MY_CONTAINER dev** | node:22 + git + wrangler | Edge-native desk; survives Mac sleep |
| **MY_CONTAINER batch** | Current sandbox-v3 (`containers/iam-sandbox-go/`) | Smoke, untrusted snippets, general exec |
| **IamCadWorkerContainer** | CAD worker | OpenSCAD/Blender offload |

SDK **detached sub-agents** + **reportProgress** make long container/VM deploys visible in chat without blocking the parent turn.

---

## Phased adoption (no big-bang rewrite)

### Phase 0 — Now (routing + packages, no DO rewrite)

- [x] Fix container SSH config (`authorized_keys` format)
- [x] GCP IAP SSH fallback in sync scripts
- [ ] `scripts/smoke-remote-lane.sh` — Mac-asleep pass/fail
- [ ] MCP: auto-fallback localpty → GCP; fix Linux cwd ENOENT
- [x] Bump `@cloudflare/codemode` to 0.4.x
- [ ] Phase 1: install `agents` + `@cloudflare/think` + `@cloudflare/ai-chat` with `--legacy-peer-deps` (see Package upgrade)

### Phase 1 — Detached spawn (highest ROI)

Replace blocking `rws-spawn-fanout` child loops with Think `runAgentTool` detached for:

- `deploy:full` / `wrangler deploy`
- `git pull` + build on GCP or container
- Multi-step Read→Write→Summarize when total time > 60s

Keep D1 `agentsam_spawn_job` as **audit ledger**; SDK owns execution durability.

**New file (target):** `src/do/AgentSamThink.js` extending `Think` with `@callable` spawn methods.

### Phase 2 — `runTurn` admission

- Route `/api/agent/chat` through `runTurn({ mode: 'stream' })`
- Enable `chatRecovery` + `chatStreamStallTimeoutMs: 90000`
- OAuth MCP long turns use `mode: 'submit'`

### Phase 3 — Client convergence

- Wrap `useAgentChat` in ChatAssistant
- Background runs tray via `useAgentToolEvents`
- Deprecate custom `useAgentChatStream` parser

### Phase 4 — Container dev desk

- Upgrade `containers/iam-sandbox` → dev image (git + node + wrangler)
- Wire `agentsam_container_exec` as detached sub-agent target on the same shared pool
- Add `conn_cf_dev_container` to terminal routing (priority 35)

---

## Package upgrade

Install when starting **Phase 1** (Think DO scaffold). Root Worker `package.json` does not yet bundle these — peer deps (`@ai-sdk/react`, React 19) conflict with the dashboard split. Use a dedicated install step:

```bash
npm i agents@latest @cloudflare/think@latest @cloudflare/ai-chat@latest @cloudflare/codemode@latest \
  --legacy-peer-deps
```

**Already bumped in root `package.json`:** `@cloudflare/codemode@^0.4.2` (60s Code Mode timeout, Worker dispose fix).

`@cloudflare/voice` optional — only if voice turns are enabled.

---

## Success criteria (end-to-end, Mac asleep)

1. OAuth ChatGPT/Claude calls `agentsam_terminal_remote` → GCP exec → real stdout
2. AgentSam dashboard spawns detached deploy sub-agent → progress bar → "deploy complete" notify
3. Phone disconnect mid-deploy → reconnect → turn recovers or background run completes + notifies
4. Container dev facet: `git pull && npm run build:vite-only` passes from detached sub-agent
5. No dependency on localpty for any of the above

---

## Related docs

- [terminal-three-lane-model.md](./terminal-three-lane-model.md) — canonical local / remote / sandbox product split, including shared-pool routing detail
- [agentic-edge-sprint-2a-multi-agent-orchestration.md](./agentic-edge-sprint-2a-multi-agent-orchestration.md) — updated to reference SDK detached runs
- [agentic-edge-sprint-1c-exec-fabric.md](./agentic-edge-sprint-1c-exec-fabric.md) — container target stretch
- [REPAIR-REMOTE-TERMINAL.md](../ops/REPAIR-REMOTE-TERMINAL.md) — GCP cwd / routing fixes
- [agents-sdk skill](/.cursor/plugins/cache/cursor-public/cloudflare/.../skills/agents-sdk/SKILL.md) — fetch latest docs before implementing

---

## Out of scope (experimental SDK APIs)

Do **not** depend yet on:

- Server actions (`action()` / `getActions()`)
- Channels (`configureChannels()`, `deliverNotice()`)

Revisit when stabilised in SDK changelog.
