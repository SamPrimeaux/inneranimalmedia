---
title: Agentic Edge Sprint Plan — Google Next '26 Parity on Cloudflare
project_key: inneranimalmedia
d1_context_id: ctx_inneranimalmedia
workspace_id: ws_inneranimalmedia
tenant_id: tenant_sam_primeaux
lane_key: docs_knowledge_search
doc_type: agentic_edge_sprint_plan
topic: agentic_edge_sprint
sprint_status: in_progress
sprint_target: 2026-06-30
dashboard_url: https://inneranimalmedia.com/dashboard/agent
ingest_script: scripts/ingest_agentic_edge_sprint_plan.mjs
memory_router_key: agentic_edge_sprint_router_v1
updated: 2026-06-20
---

# Agentic Edge Sprint Plan — Google Next '26 Parity on Cloudflare

**START HERE when resuming agentic infrastructure work.** Inspired by [Google Cloud Next '26 AI infrastructure](https://cloud.google.com/blog/products/compute/ai-infrastructure-at-next26) — translated to our Cloudflare + ExecOS + MCP stack (not GCP silicon).

**Memory router:** `agentsam_memory.key=agentic_edge_sprint_router_v1`  
**Semantic search:** `docs_knowledge_search` **"Agentic Edge sprint plan"** or `source_ref platform/inneranimalmedia/agentic-edge-sprint-plan#*`  
**Re-ingest:** `npm run run:ingest_agentic_edge_sprint_plan`  
**Sync memory vector:** `npm run run:sync_agentic_edge_sprint_memory_vector`

## Related repos

| Repo | Role |
|------|------|
| [inneranimalmedia](https://github.com/SamPrimeaux/inneranimalmedia) | CORE Worker, Agent Sam, D1 SSOT, dashboard |
| [ExecOS](https://github.com/SamPrimeaux/ExecOS) | PTY runtime `:3099` + `execos` dispatcher Worker |
| [inneranimalmedia-mcp-server](https://github.com/SamPrimeaux/inneranimalmedia-mcp-server) | OAuth MCP at `mcp.inneranimalmedia.com` |

## Sprint goal

Make Agent Sam a **unified agentic platform**: one user intent fans out to specialized agents with preserved state, TTFT-aware routing, binding-only exec fabric, and cross-repo telemetry — whether the client is the dashboard, Cursor, or Claude.

**North-star loop:**

```
User intent (dashboard / MCP)
  → lane + model pick (TTFT-aware)
  → primary agent OR subagent spawn
  → tools (MCP / terminal / browser / RAG)
  → state preserved (R2 + KV + DO)
  → telemetry → routing memory
```

## Google → our stack mapping

| Google Next '26 | Our equivalent | Sprint |
|---------------|----------------|--------|
| Agentic intent → agent fleet | Agent Sam + subagents + MCP | Week 2 |
| TPU 8i Dedicated KV Cache | R2 chat digests + KV + ExecOS sessions | **Sprint 1A** |
| Axion CPU orchestration | Worker logic + ExecOS `:3099` | Sprint 1C |
| Virgo fabric | CF edge + EXECOS service binding | **Sprint 1C** |
| GKE Inference Gateway (TTFT −70%) | Thompson routing + model health | **Sprint 1B** |
| GKE fast pod/model load | warmAgentChunks + KV catalog cache | Week 2 |
| Managed RL API | agentsam_model_routing_memory, ETO | Week 2 |

## Architecture

```text
Browser PWA / Cursor MCP
        │
        ├─► inneranimalmedia.com (CORE)
        │     Agent Sam · D1 SSOT · R2 context · Vectorize · DOs
        │
        ├─► mcp.inneranimalmedia.com (MCP Worker)
        │     OAuth · tools/call · EXECOS binding ──┐
        │                                            │
        └─► execos.inneranimalmedia.com ◄────────────┘
                  │
                  ├─► terminal.* (GCP :3099)
                  └─► localpty.* (Mac :3099)
```

**Golden rules:**
- D1 SSOT stays on `inneranimalmedia` + MCP catalog reads — not on ExecOS dispatcher
- ExecOS dispatcher is stateless (no D1)
- One deploy per deliverable
- Legacy `/exec-agentsam-bridgekey` deprecate after Sprint 1C smoke green

## Sprint schedule (2 weeks)

| Sprint | Doc | Focus | Repos |
|--------|-----|-------|-------|
| **1A** | [agentic-edge-sprint-1a-context-tier.md](./agentic-edge-sprint-1a-context-tier.md) | Unified context tier (KV Cache analog) | inneranimalmedia, ExecOS |
| **1B** | [agentic-edge-sprint-1b-inference-gateway.md](./agentic-edge-sprint-1b-inference-gateway.md) | TTFT-aware routing + model health | inneranimalmedia, MCP |
| **1C** | [agentic-edge-sprint-1c-exec-fabric.md](./agentic-edge-sprint-1c-exec-fabric.md) | Binding-only ExecOS fabric + MCP audit | ExecOS, MCP | ✅ shipped 2026-06-21 |
| **2A** | [agentic-edge-sprint-2a-multi-agent-orchestration.md](./agentic-edge-sprint-2a-multi-agent-orchestration.md) | Multi-agent orchestration spine | inneranimalmedia |
| **2B** | [agentic-edge-sprint-2b-warm-path.md](./agentic-edge-sprint-2b-warm-path.md) | Cold start & warm path | inneranimalmedia, MCP |
| **2C** | [agentic-edge-sprint-2c-observability-mcp.md](./agentic-edge-sprint-2c-observability-mcp.md) | Observability + MCP modularization | all three |

## Sprint 1A — Context tier (Days 1–2) ✅ shipped 2026-06-20

**Status:** Core implementation landed — internal snapshot API, chat compaction, MCP envelope, ExecOS R2 sync hook.

| # | Task | Status |
|---|------|--------|
| 1 | R2 prefix `context/{tenant}/{user}/exec/{session_id}/` | ✅ `src/core/exec-context-tier.js` |
| 2 | ExecOS `persistSession` → R2 via CORE internal API | ✅ `ExecOS/context-manager.js` |
| 3 | Chat compaction policy hot/warm/cold | ✅ `maybeCompactChatSession` in agentsam-chat-sessions |
| 4 | MCP terminal context envelope | ✅ `mcp-exec-context.js` + terminal exec |

See [agentic-edge-sprint-1a-context-tier.md](./agentic-edge-sprint-1a-context-tier.md).

## Sprint 1B — Inference Gateway Lite ✅ shipped 2026-06-21

| # | Task | Status |
|---|------|--------|
| 1 | TTFT penalty in `routing.js` → `mergeModelRoutingMemoryPriors` | ✅ `applyTtftPenaltyToAlpha` |
| 2 | `latency_ms` on all `agentsam_agent_run` finalize paths | ✅ `agent-run-routing.js` |
| 3 | MCP `mcp_audit_log` latency on tools/call | ✅ already wired; verified |
| — | Fix `agentsam_deployment_health` smoke column mapping | ✅ `record-d1-deployment-health.mjs` |

See [agentic-edge-sprint-1b-inference-gateway.md](./agentic-edge-sprint-1b-inference-gateway.md).

## Sprint 1C — Exec fabric ✅ shipped 2026-06-21

**Maps to:** Virgo collapsed fabric — single reliable transport

| # | Task | Status |
|---|------|--------|
| 9 | Gate bridge fallback behind `execos_bridge_fallback_enabled` (default off) | ✅ migration 651 |
| 10 | `[execos] bridge_fallback_triggered` log + binding failure reason | ✅ MCP deploy |
| 11 | `agentsam_mcp_audit` read-only tool | ✅ migration 652 |
| 12 | Binding-only smoke (`MCP_EXEC_SMOKE=1`) | ⏳ prod bridge token |
| 13 | Remove bridge code path after 7d green | planned |
| 14 | `target=container` → agentsam_container_exec | planned (2C stretch) |

See [agentic-edge-sprint-1c-exec-fabric.md](./agentic-edge-sprint-1c-exec-fabric.md).

## Sprint 2 — Week 2 (planned)

| Sprint | Focus | Doc |
|--------|-------|-----|
| **2A** | Parent↔child spawn linkage, multitask tree API | [2a](./agentic-edge-sprint-2a-multi-agent-orchestration.md) |
| **2B** | MCP catalog KV + routing priors warm path | [2b](./agentic-edge-sprint-2b-warm-path.md) |
| **2C** | Deployment/build analytics tools + dispatch split | [2c](./agentic-edge-sprint-2c-observability-mcp.md) |

**Recommended order:** 2C (observability tools build on 1C audit) → 2A (spawn linkage needs stable audit) → 2B (warm path last, perf polish).

## Decision matrix

```
┌─────────────────────────────┬────────────────────────────────────────────┐
│ Situation                   │ Use                                        │
├─────────────────────────────┼────────────────────────────────────────────┤
│ Cursor/Claude MCP shell     │ MCP → EXECOS binding → target=gcp          │
│ Dashboard interactive PTY   │ CORE → tunnel WS → ExecOS :3099            │
│ Agent Sam in-browser tools  │ CORE PTY_SERVICE /exec (PATH B)            │
│ Untrusted one-liner         │ agentsam_container_exec (CF, not GCP)      │
│ BYOK customer shell         │ MCP terminal_connections multi-tenant path │
│ Mac asleep                  │ ExecOS auto-fallback mac→gcp               │
│ Session context             │ R2 context tier (not VM-local files)       │
└─────────────────────────────┴────────────────────────────────────────────┘
```

## Success metrics

| Metric | Target |
|--------|--------|
| TTFT p95 (interactive chat) | ↓ 30% vs baseline week |
| Session resume latency | ↓ 40% with KV hot path |
| MCP exec via binding only | 100% (no bridge fallback) |
| Multi-agent run linkage | 100% parent↔child in D1 (Week 2) |
| Trace coverage | Agent + MCP routes traced (Week 2) |

## Out of scope

- GCP TPU/GKE/Virgo hardware adoption
- New model providers beyond existing catalog
- Full ML inference gateway model (start with TTFT priors)
- Design Studio CAD sprint (separate: designstudio-sprint-plan.md)

## Apply migrations

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=./migrations/649_agentic_edge_sprint_memory_router.sql

./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=./migrations/650_agentsam_model_health.sql
```

## Verify production chain

```bash
curl -sS https://mcp.inneranimalmedia.com/health | jq .
curl -sS https://execos.inneranimalmedia.com/health | jq .
curl -sS https://terminal.inneranimalmedia.com/health | jq '{execos_key_set, bridge_key_set}'
cd ~/inneranimalmedia && node scripts/mcp-smoke.mjs
```

## Key file anchors

| Area | Path |
|------|------|
| Chat context / R2 | `src/core/agentsam-chat-sessions.js` |
| Model routing | `src/core/routing.js`, `src/core/agent-model-resolver.js` |
| Lanes / intent | `src/core/agent-lane-router.js` |
| MCP terminal | `inneranimalmedia-mcp-server/src/mcp-terminal-exec.js` |
| ExecOS contract | `ExecOS/docs/CONTRACT.md` |
| Platform assessment | `docs/platform_assessment/inneranimalmedia_platform_assessment.md` |
