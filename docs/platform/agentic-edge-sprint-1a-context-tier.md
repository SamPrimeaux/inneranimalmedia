---
title: Sprint 1A — Context Tier (Dedicated KV Cache)
project_key: inneranimalmedia
topic: agentic_edge_sprint
sprint_id: agentic_edge_1a
sprint_status: planned
lane_key: docs_knowledge_search
updated: 2026-06-20
---

# Sprint 1A — Context Tier

**Duration:** 2 days  
**Parent:** [agentic-edge-sprint-plan.md](./agentic-edge-sprint-plan.md)  
**Google analog:** TPU 8i on-chip KV Cache + session retention for agentic workflows

## Problem

Agent context is fragmented today:

| Store | Location | Issue |
|-------|----------|-------|
| Chat sessions | R2 `context/{au}/{ws}/chats/{conv}/` | Good — CORE owns this |
| ExecOS PTY memory | `~/.iam-pty/sessions/*.json` on VM | Lost on GCP↔Mac failover |
| MCP workspace context | D1 + token claims | No shared envelope with chat |
| Prompt cache | KV in CORE | Not tied to compaction policy |

## Target architecture

Three-tier context (hot / warm / cold):

```text
HOT  — KV SESSION_CACHE / OAUTH_KV     TTL 5–15 min   last N turns
WARM — R2 context/{tenant}/{user}/…     persistent     messages.jsonl + meta.json
COLD — R2 digest.md + Vectorize         compacted      long-session summaries
```

### R2 key conventions

```
context/{tenant_id}/{user_id}/chats/{conversation_id}/meta.json
context/{tenant_id}/{user_id}/chats/{conversation_id}/messages.jsonl
context/{tenant_id}/{user_id}/chats/{conversation_id}/digest.md

context/{tenant_id}/{user_id}/exec/{session_id}/meta.json      ← NEW (Sprint 1A)
context/{tenant_id}/{user_id}/exec/{session_id}/memory.json    ← NEW (Sprint 1A)
```

Bucket: `iam-platform` (binding `R2`) or `inneranimalmedia-assets` per workspace policy.

## Tasks

### 1. Document compaction policy (this doc + parent plan)

**File:** `docs/platform/agentic-edge-sprint-1a-context-tier.md` (done)

Policy:

| Tier | Trigger | Action |
|------|---------|--------|
| Hot | Every chat turn | Write last 20 messages to KV `chat:ctx:{au}:{ws}:{conv}` TTL 900s |
| Warm | First message + every 10 turns | Append `messages.jsonl` on R2 |
| Cold | Token estimate > 12K in session | Generate `digest.md`, trim hot window |

Reference: `src/core/agentsam-chat-sessions.js` (R2 primary storage, migration 637).

### 2. ExecOS session → R2 sync

**Repo:** ExecOS `context-manager.js` + inneranimalmedia internal API

Flow:

```text
ExecOS persistSession()
  → POST /api/internal/exec/context/snapshot
      Authorization: INTERNAL_API_SECRET
      Body: { tenant_id, user_id, session_id, memory, terminal_state }
  → CORE writes R2 context/.../exec/{session_id}/memory.json
```

**ExecOS change:** After local `writeFileSync`, call CORE snapshot endpoint (best-effort, non-blocking).

**CORE change:** New handler `src/api/internal-exec-context.js` (or extend existing internal routes).

**Done when:** Kill GCP PM2, restart Mac localpty — session memory recoverable from R2.

### 3. Enforce chat compaction in CORE

**File:** `src/core/agentsam-chat-sessions.js`

- Add `maybeCompactChatSession(env, { tenantId, userId, conversationId })`
- Call after each assistant turn when `estimateTokens(messages) > SOFT_LIMIT` (14K, match ExecOS)
- Write digest to R2, update D1 `agentsam_chat_sessions.last_compacted_at`

### 4. MCP context envelope on terminal tools

**Repo:** inneranimalmedia-mcp-server `mcp-terminal-exec.js`

- Before `executeBridgeExec`, load R2 `exec/{session_id}/memory.json` if `args.session_id` present
- Attach `terminal_state.cwd`, `unresolved_error` to tool response metadata (not full dump)

## Verification

```bash
# 1. Chat compaction smoke (CORE)
curl -sS -X POST https://inneranimalmedia.com/api/agentsam/chat \
  -H "Cookie: $SESSION" -H "Content-Type: application/json" \
  -d '{"message":"Summarize our platform stack in 3 bullets"}' | head

# 2. ExecOS snapshot (after internal API ships)
curl -sS -X POST https://inneranimalmedia.com/api/internal/exec/context/snapshot \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"tenant_sam_primeaux","user_id":"au_871d920d1233cbd1","session_id":"test","memory":{}}'

# 3. R2 list (wrangler r2 or dashboard)
# context/tenant_sam_primeaux/au_871d920d1233cbd1/exec/test/memory.json exists
```

## Dependencies

- `INTERNAL_API_SECRET` on CORE Worker (already in platform assessment)
- R2 binding `R2` or workspace-scoped bucket from `agentsam_workspace`

## Not in 1A

- Full Vectorize re-index on every compaction (Week 2)
- Customer BYOK R2 buckets for context (use platform bucket first)
