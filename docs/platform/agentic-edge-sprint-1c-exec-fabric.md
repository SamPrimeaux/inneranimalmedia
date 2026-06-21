---
title: Sprint 1C — Exec Fabric (Virgo analog)
project_key: inneranimalmedia
topic: agentic_edge_sprint
sprint_id: agentic_edge_1c
sprint_status: shipped
lane_key: docs_knowledge_search
updated: 2026-06-21
---

# Sprint 1C — Exec Fabric

**Duration:** 2–3 days  
**Parent:** [agentic-edge-sprint-plan.md](./agentic-edge-sprint-plan.md)  
**Google analog:** Virgo Network — collapsed fabric, no scaling tax

## Status (2026-06-21)

| Task | Status |
|------|--------|
| Bridge fallback gated behind `execos_bridge_fallback_enabled` (default **off**) | ✅ migration 651 applied |
| `[execos] bridge_fallback_triggered` log when legacy path used | ✅ deployed |
| `agentsam_mcp_audit` read-only tool | ✅ migration 652 + handler |
| Binding-only smoke (`MCP_EXEC_SMOKE=1` + prod `MCP_BRIDGE_TOKEN`) | ⏳ run with prod bridge secret |
| ExecOS PM2 restart | ✅ done |
| Full bridge removal (7d green) | planned |
| `target=container` routing | planned → Sprint 2C stretch |

## Problem

Three execution paths exist (documented in ExecOS README). MCP terminal still has **legacy bridge fallback** to `/exec-agentsam-bridgekey` when EXECOS binding fails. Two auth models (`EXECOS_KEY` vs `AGENTSAM_BRIDGE_KEY`) create operational drift.

Preferred path (PATH C):

```text
Cursor MCP → mcp.inneranimalmedia.com
  → EXECOS service binding (Worker-to-Worker)
  → execos.inneranimalmedia.com POST /run
  → terminal.inneranimalmedia.com/run (GCP)
  → server.js :3099
```

## Tasks

### 1. Binding-only smoke test

**File:** `inneranimalmedia/scripts/mcp-smoke.mjs` (extend) or new `scripts/mcp-execos-binding-smoke.mjs`

Steps:

1. `tools/list` includes terminal tool
2. `tools/call` `run_terminal_command` with `command: "echo execos_ok"`
3. Assert response contains `execos_ok` and `connection_resolution` ≠ `bridge_token_direct_legacy`
4. Assert `latency_ms` present (after Sprint 1B ExecOS change)

Run before and after bridge removal.

### 2. Deprecate bridge in docs

**Repo:** ExecOS

| File | Change |
|------|--------|
| `docs/CONTRACT.md` | Mark `/exec-agentsam-bridgekey` **deprecated 2026-06-20**, removal target Sprint 1C + 7d |
| `README.md` | PATH C diagram: binding-only as primary |

### 3. Remove MCP bridge fallback (after 7d green smoke)

**Repo:** inneranimalmedia-mcp-server `src/mcp-terminal-exec.js`

In `executeBridgeExec()`:

- Keep: EXECOS binding → public execos URL fallback
- Remove: legacy `AGENTSAM_BRIDGE_KEY` → `/exec-agentsam-bridgekey` path
- Error message when neither binding nor public ExecOS available (already partially implemented)

### 4. Container target for untrusted snippets

**Repo:** inneranimalmedia (already seeded migration 635 `agentsam_container_exec`)

Wire MCP terminal tool arg `target=container` → CORE `agentsam_container_exec` handler instead of ExecOS when:

- Command matches untrusted pattern (curl pipe, npm install -g, etc.) OR
- Explicit `target=container` in args

ExecOS dispatcher `target=container` remains **not implemented** — container runs on CF, not GCP VM.

### 5. Target selection matrix (enforce in MCP)

| target | Route | When |
|--------|-------|------|
| `gcp` | ExecOS → terminal.* | Default MCP / Cursor |
| `mac` | ExecOS → localpty.* (fallback gcp) | Operator Mac awake |
| `container` | CORE agentsam_container_exec | Untrusted / sandbox |
| `sandbox` | terminal_connections sandbox lane | BYOK isolated workspace |

Document in `inneranimalmedia-mcp-server/README.md` backlog → shipped section after 1C.

## Verification checklist

```bash
# Production chain
curl -sS https://execos.inneranimalmedia.com/health | jq '{key_set, gcp_exec_url}'
curl -sS https://terminal.inneranimalmedia.com/health | jq '{execos_key_set, bridge_key_set}'

# MCP binding exec
cd ~/inneranimalmedia && node scripts/mcp-smoke.mjs

# Mac-asleep fallback (manual)
# MCP tools/call with target=mac while localpty down → stdout from gcp
```

## Rollback plan

If binding-only fails in production:

1. Re-enable bridge fallback in MCP (git revert)
2. Keep `AGENTSAM_BRIDGE_KEY` on VM until rollback window closes
3. Do not remove bridge route from ExecOS until MCP stable 7+ days

## Success criteria

- [ ] `scripts/mcp-smoke.mjs` green with binding-only path
- [ ] Zero production errors `connection_resolution=bridge_token_direct_legacy` for 7 days
- [ ] Bridge path deprecated in CONTRACT.md
- [ ] `target=container` documented and smoke-tested

## Related docs

- ExecOS `docs/CONTRACT.md`, `docs/SPRINT-ROADMAP.md`
- inneranimalmedia `docs/AgentSamQUADMODE.md`
- MCP `src/mcp-terminal-exec.js` header comment (PATH C spec)
