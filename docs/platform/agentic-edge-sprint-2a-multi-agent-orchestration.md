---
title: Sprint 2A — Multi-Agent Orchestration Spine
project_key: inneranimalmedia
topic: agentic_edge_sprint
sprint_id: agentic_edge_2a
sprint_status: planned
lane_key: docs_knowledge_search
updated: 2026-06-21
---

# Sprint 2A — Multi-Agent Orchestration Spine

**Duration:** 3–4 days  
**Parent:** [agentic-edge-sprint-plan.md](./agentic-edge-sprint-plan.md)  
**Google analog:** Agentic intent → specialized agent fleet with preserved parent↔child linkage  
**Week 2 priority:** **#1 — ship first** (live D1 data; no ingest cron dependency)

## Problem

Subagent spawn exists (`subagent-spawn-d1.js`, `agentsam_spawn_job`, MCP `agentsam_spawn_profile`) but parent↔child runs are not consistently linked in D1, dashboard multitask UI cannot reliably reconstruct fanout trees, and MCP spawn handoffs do not inherit exec context from Sprint 1A.

## Goal

One user intent → N specialized child runs with **100% traceable linkage** in `agentsam_agent_run` + `agentsam_spawn_job`, resumable from dashboard or MCP, exec context envelope propagated to spawned tool calls.

## Tasks

### 1. Parent↔child run linkage (CORE)

**Files:** `src/core/subagent-spawn-d1.js`, `src/core/agent-run-routing.js`

| Change | Done when |
|--------|-----------|
| Every spawn inserts `parent_run_id` on child `agentsam_agent_run` rows | Column populated on INSERT + UPDATE paths |
| Parent run gets `spawn_job_id` + `child_run_ids_json` snapshot | Queryable from dashboard API |
| Finalize path writes `latency_ms`, `status`, `cost_usd` on **all** children | Matches 1B fix pattern |

### 2. Spawn context envelope

**Files:** `src/core/exec-context-tier.js`, `inneranimalmedia-mcp-server/src/mcp-exec-context.js`

- On spawn, copy hot tier refs (`session_id`, R2 digest key) into spawn job metadata
- Child MCP terminal calls receive `exec_context` block (reuse 1A envelope)
- Dashboard multitask panel reads envelope for “resume in Cursor” deep links

### 3. MCP spawn contract hardening

**Repo:** inneranimalmedia-mcp-server

| Tool | Change |
|------|--------|
| `agentsam_spawn_profile` | Require `task` + optional `parent_session_id`; return `{ spawn_job_id, child_run_ids[] }` |
| `agentsam_get_agent` | Include `allowed_tool_globs` + last spawn stats |

OAuth allowlist: no new tools — extend handler responses only.

### 4. Dashboard multitask tree API

**File:** `src/api/agentsam-runs.js` (or new `agentsam-spawn-tree.js`)

```
GET /api/agentsam/spawn-tree?run_id=...
→ { parent, children[], spawn_job, aggregate_latency_ms, aggregate_cost_usd }
```

Wire `/dashboard/agent` multitask tab to this endpoint (read-only v1).

### 5. D1 migration (minimal)

**File:** `migrations/653_agentic_edge_2a_spawn_linkage.sql`

- Backfill index: `idx_agentsam_agent_run_parent_run_id`
- Optional: `agentsam_spawn_job.context_envelope_json` if column missing (TEXT, nullable)
- No new tables unless `parent_run_id` column missing on `agentsam_agent_run`

## Verification

```bash
# Dashboard multitask turn → 2+ child runs
curl -sS -H "Authorization: Bearer …" \
  "https://inneranimalmedia.com/api/agentsam/spawn-tree?run_id=<parent_id>" | jq .

# MCP spawn
# tools/call agentsam_spawn_profile { profile_slug: "engineer", task: "…", parent_session_id: "…" }

# D1 spot check
# SELECT id, parent_run_id, spawn_job_id FROM agentsam_agent_run WHERE parent_run_id IS NOT NULL ORDER BY created_at DESC LIMIT 10;
```

## Success criteria

- [ ] 100% spawn jobs have linked child run IDs in D1
- [ ] Parent↔child query < 50ms on indexed path
- [ ] Child terminal tools include `exec_context` when parent session exists
- [ ] Dashboard multitask tab renders spawn tree for last 24h runs

## Out of scope (2A)

- Auto-decomposition of user intent (LLM planner) — manual/profile spawn only
- Cross-workspace spawn (tenant boundary enforced)
- Full workflow DAG executor (`agentsam_workflow_nodes`) — spawn job only

## Related docs

- [agentic-edge-sprint-1a-context-tier.md](./agentic-edge-sprint-1a-context-tier.md)
- `docs/AgentSamQUADMODE.md` (multitask mode)
- `src/core/cms-spawn-bridge.js` (CMS handoff pattern to mirror)
