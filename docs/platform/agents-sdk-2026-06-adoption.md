---
title: Agents SDK Jun 2026 — Adoption Map for AgentSam
project_key: inneranimalmedia
topic: agentic_edge_sprint
updated: 2026-06-27
status: active
sdk_release: 2026-06-26
---

# Agents SDK Jun 2026 — Adoption Map for AgentSam

Cloudflare [Agents SDK release (Jun 26, 2026)](https://developers.cloudflare.com/changelog/) adds **detached background sub-agents**, **`runTurn` turn admission**, and **recovery/reliability** fixes converging `@cloudflare/think` and `@cloudflare/ai-chat`.

This doc maps that release onto **inneranimalmedia today** — what we already have, what to adopt, and how it connects to **Mac-asleep remote work** and **CF Containers**.

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
  → GCP terminal.inneranimalmedia.com OR MY_CONTAINER dev desk
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
       ├─ ContainerDevFacet   → MY_CONTAINER (edge dev desk — upgrade from Alpine smoke)
       └─ ContainerBatchFacet → moviemode / CAD offload
```

| Facet | Image | Role |
|-------|-------|------|
| **GCP terminal** | N/A (VM) | Primary operator desk until container dev image proven |
| **MY_CONTAINER dev** | node:22 + git + wrangler | Edge-native desk; survives Mac sleep |
| **MY_CONTAINER batch** | Current Alpine sandbox-v2 | Smoke, untrusted snippets |
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
- Wire `agentsam_container_exec` as detached sub-agent target
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
