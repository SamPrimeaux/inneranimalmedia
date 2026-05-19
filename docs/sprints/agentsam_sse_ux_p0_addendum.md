> **NOTE — Migration already applied and verified in prod.**
> `20260519_plan_tasks_add_running_status.sql` was executed via `wrangler d1 execute`
> and confirmed: `'running'` is live in the `agentsam_plan_tasks` CHECK constraint.
> **Skip all migration instructions in this document.**
> Start reading at: **Fix 5 — Corrected Implementation**

---

# Addendum to agentsam_sse_ux_p0.md — Real Table Schemas

Read this BEFORE executing Fix 5. Several assumptions in the main prompt
were wrong about table names and column values. This addendum supersedes
those sections. Everything else in the main prompt stands as written.

---

## Schema Reference — D1 Tables

### `agentsam_plans`
Primary key column is `id` TEXT — NOT `plan_id`.  
`status` CHECK is `('draft','active','complete','abandoned')` — NOT 'confirmed'/'cancelled'.  
Do NOT poll this table for confirmation status. Use `agentsam_approval_queue` instead (see below).

Relevant columns for Fix 5:
```sql
id               TEXT PRIMARY KEY          -- this is the plan_id in SSE events
status           TEXT DEFAULT 'active'     -- draft | active | complete | abandoned
requires_approval INTEGER DEFAULT 0        -- set to 1 when creating plan that needs gate
plan_md_url      TEXT                      -- already stores the plan markdown URL
plan_map_url     TEXT                      -- already stores the excalidraw map URL
workflow_run_id  TEXT REFERENCES agentsam_workflow_runs(id)
```

When creating a plan that requires confirmation, also set:
```sql
UPDATE agentsam_plans SET requires_approval = 1 WHERE id = ?
```

---

### `agentsam_plan_tasks`
Primary key: `id` TEXT  
Foreign key: `plan_id TEXT NOT NULL REFERENCES agentsam_plans(id) ON DELETE CASCADE`

**`'running'` is now a valid status — migration already applied.**  
The migration file `20260519_plan_tasks_add_running_status.sql` adds `'running'`
to the CHECK constraint. Apply it before running any code that writes task status:

```bash
wrangler d1 migrations apply inneranimalmedia-business \
  --remote \
  --migration-file migrations/20260519_plan_tasks_add_running_status.sql
```

After migration, `status` CHECK is:
```
('todo','running','in_progress','done','blocked','skipped','carried')
```

SSE `task_start` emits `'running'`, frontend state uses `'running'`, D1 accepts
`'running'`. No mapping needed anywhere in the stack.

---

### `agentsam_approval_queue`  
This is the correct table for Fix 5's confirmation gate — NOT `agentsam_plans`.

Key columns:
```sql
id              TEXT PRIMARY KEY DEFAULT ('appr_' || lower(hex(randomblob(8))))
tenant_id       TEXT NOT NULL
workspace_id    TEXT
user_id         TEXT NOT NULL
session_id      TEXT
plan_id         TEXT REFERENCES agentsam_plans(id) ON DELETE SET NULL
tool_name       TEXT NOT NULL          -- use 'plan_confirm' as a descriptive value
action_summary  TEXT NOT NULL          -- human-readable description of what's being approved
risk_level      TEXT DEFAULT 'medium'  -- low | medium | high | critical
approval_type   TEXT DEFAULT 'tool'
  -- CHECK: ('tool','workflow','command','script','deploy','db_write',
  --         'r2_write','github_write','terminal','hook')
status          TEXT DEFAULT 'pending'
  -- CHECK: ('pending','approved','denied','expired')
expires_at      INTEGER DEFAULT (unixepoch() + 300)   -- 5 min default
decided_at      INTEGER
approved_by     TEXT
person_uuid     TEXT
agent_run_id    TEXT DEFAULT NULL
conversation_id TEXT DEFAULT NULL
created_at      INTEGER DEFAULT (unixepoch())
```

**approval_type constraint issue:**  
`'plan_confirm'` is NOT in the CHECK list. Use `'workflow'` as the type for plan
confirmation gates — it's the closest semantic match. Do NOT add a new CHECK value
without a migration. If a migration is needed to add `'plan_confirm'`, create one:

```sql
-- migrations/YYYYMMDD_add_plan_confirm_approval_type.sql
-- D1 does not support ALTER TABLE ADD CONSTRAINT, so recreate is required.
-- Before recreating: back up data, check if this table has many rows in prod.
-- If the table has rows, use a simpler approach: just use 'workflow' as the type.
```

**Recommendation:** Use `approval_type = 'workflow'` for now. No migration needed.

---

## Fix 5 — Corrected Implementation

Replace the `waitForPlanConfirmation` function and surrounding logic in the main
prompt with this corrected version:

### 5b (corrected) — `waitForPlanConfirmation` using `agentsam_approval_queue`

```js
async function waitForPlanConfirmation(env, planId, sessionId, userId, tenantId, timeoutMs = 180_000) {
  // First: insert the approval request
  const approvalId = `appr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(timeoutMs / 1000);

  try {
    await env.DB.prepare(`
      INSERT INTO agentsam_approval_queue
        (id, tenant_id, workspace_id, user_id, session_id, plan_id,
         tool_name, action_summary, approval_type, risk_level,
         status, expires_at, conversation_id)
      VALUES (?, ?, ?, ?, ?, ?, 'plan_confirm', ?, 'workflow', 'low', 'pending', ?, ?)
    `).bind(
      approvalId,
      tenantId,
      null,          // workspace_id — pass if available
      userId || 'agentsam',
      sessionId || null,
      planId,
      'Review and confirm plan execution',
      expiresAt,
      sessionId || null
    ).run();
  } catch (e) {
    console.error('[plan_confirm] failed to insert approval queue row', e?.message);
    // Fail open: if we can't insert, proceed with execution
    return true;
  }

  // Emit the approval ID so the client knows which row to approve
  // (called from the plan pipeline, emitPlan is in scope)
  // emitPlan already called before this function — pass approvalId back via return or param

  // Poll for resolution
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const row = await env.DB.prepare(
        `SELECT status FROM agentsam_approval_queue WHERE id = ? LIMIT 1`
      ).bind(approvalId).first();

      if (row?.status === 'approved') return true;
      if (row?.status === 'denied' || row?.status === 'expired') return false;
    } catch (_) {}

    await new Promise((r) => setTimeout(r, 2000));
  }

  // Mark as expired
  try {
    await env.DB.prepare(
      `UPDATE agentsam_approval_queue SET status = 'expired', decided_at = unixepoch() WHERE id = ?`
    ).bind(approvalId).run();
  } catch (_) {}

  return false;
}
```

### 5a (corrected) — Emit gate event with approval ID

Update the gate block in `agent.js` to capture the approval ID and include it
in the SSE event so the client can POST to the right approval row:

```js
if (requestedMode !== 'plan') {
  const approvalId = `appr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const expiresAt = Math.floor(Date.now() / 1000) + 180;

  // Insert approval row first
  try {
    await env.DB.prepare(`
      INSERT INTO agentsam_approval_queue
        (id, tenant_id, user_id, session_id, plan_id,
         tool_name, action_summary, approval_type, risk_level,
         status, expires_at)
      VALUES (?, ?, ?, ?, ?, 'plan_confirm',
              'Review and confirm plan execution',
              'workflow', 'low', 'pending', ?)
    `).bind(approvalId, tid2, uid2, sessionId || null, plan.plan_id, expiresAt).run();
  } catch (e) {
    console.error('[plan_confirm] insert failed, proceeding', e?.message);
  }

  emitPlan('plan_confirmation_required', {
    plan_id: plan.plan_id,
    approval_id: approvalId,       // ← client needs this to call the right endpoint
    plan_title: plan.plan_title,
    task_count: plan.tasks.length,
    expires_at: expiresAt,
    message: 'Review the plan above and confirm to begin execution.',
  });

  // Poll for decision (pass approvalId, not planId)
  const confirmed = await waitForPlanConfirmationByApprovalId(env, approvalId, 180_000);
  if (!confirmed) {
    emitPlan('text', {
      text: '_Plan cancelled or timed out. Send your message again to retry._',
    });
    emitPlan('done', {});
    return;
  }
}
```

Add a separate simpler polling function used above:

```js
async function waitForPlanConfirmationByApprovalId(env, approvalId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const row = await env.DB.prepare(
        `SELECT status FROM agentsam_approval_queue WHERE id = ? LIMIT 1`
      ).bind(approvalId).first();
      if (row?.status === 'approved') return true;
      if (row?.status === 'denied' || row?.status === 'expired') return false;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}
```

### 5c (corrected) — Confirmation endpoints

The endpoints update `agentsam_approval_queue` by approval ID, not plan ID:

```
POST /api/agent/plan/approval/:approvalId/confirm
POST /api/agent/plan/approval/:approvalId/cancel
```

Handler:
```js
// confirm
await env.DB.prepare(
  `UPDATE agentsam_approval_queue
   SET status = 'approved', decided_at = unixepoch(), approved_by = ?
   WHERE id = ? AND status = 'pending'`
).bind(userId, approvalId).run();

// cancel / deny
await env.DB.prepare(
  `UPDATE agentsam_approval_queue
   SET status = 'denied', decided_at = unixepoch()
   WHERE id = ? AND status = 'pending'`
).bind(approvalId).run();
```

### 5d (corrected) — Client SSE handler

Update `useAgentChatStream.ts` handler for `plan_confirmation_required` to
store `approval_id` (not `plan_id`) so the confirm/cancel buttons POST to the
correct endpoint:

```ts
if (data.type === 'plan_confirmation_required') {
  const d = data as {
    plan_id: string;
    approval_id: string;
    plan_title?: string;
    task_count?: number;
    expires_at?: number;
    message?: string;
  };
  setMessages(prev => {
    const last = [...prev];
    const idx = last.length - 1;
    if (idx >= 0 && last[idx].role === 'assistant') {
      last[idx] = {
        ...last[idx],
        planConfirmationRequired: {
          plan_id: d.plan_id,
          approval_id: d.approval_id,   // ← use this in button POST URLs
          message: d.message,
          expires_at: d.expires_at,
        },
      };
    }
    return last;
  });
  continue;
}
```

Update `AgentPlanChecklist.tsx` confirm/cancel button onClick handlers to
use `approval_id`:

```tsx
// Confirm
onClick={() =>
  fetch(`/api/agent/plan/approval/${planConfirmationRequired.approval_id}/confirm`, {
    method: 'POST',
    credentials: 'include',
  })
}

// Cancel
onClick={() =>
  fetch(`/api/agent/plan/approval/${planConfirmationRequired.approval_id}/cancel`, {
    method: 'POST',
    credentials: 'include',
  })
}
```

---

## agentsam_todo — Reference Only

`agentsam_todo` has `requires_approval INTEGER NOT NULL DEFAULT 0` and
`approved_by`, `approved_at`, `execution_status` columns. The plan confirmation
gate does NOT touch this table directly. It's referenced here for completeness
in case Fix 7 (tool routing) or future task linking touches todo rows.

`execution_status` CHECK is not shown in the schema above — verify before
writing to it. `status` CHECK is not enforced in this table (no CHECK shown),
so string values are more flexible than `agentsam_plan_tasks`.

---

## agentsam_stream_events — Supabase Only, Skip

This table lives in **Supabase** (`public.agentsam_stream_events`), NOT in D1.
It is currently read-only — no production Worker code writes to it.
It has 15 rows (legacy/test data). Do NOT add writes to it as part of this
sprint. It is irrelevant to the P0 SSE/UX fixes. Ignore any earlier mentions
of needing to write to it.

---

## Summary of Corrections to Main Prompt

| Main prompt said | Correct value |
|---|---|
| Poll `agentsam_plan.status = 'confirmed'` | Poll `agentsam_approval_queue.status = 'approved'` |
| Table name `agentsam_plan` | Table name `agentsam_plans` (with s) |
| Primary key column `plan_id` | Primary key column `id` |
| `status IN ('confirmed','cancelled')` | `status IN ('approved','denied','expired')` |
| `approval_type = 'plan_confirm'` | `approval_type = 'workflow'` (CHECK constraint) |
| Endpoint uses `planId` | Endpoint uses `approvalId` from `agentsam_approval_queue` |
| Task `'running'` fails CHECK constraint | Migration applied — `'running'` now valid in D1 |

## Pre-flight: Apply Migration First

Before Cursor touches a single source file, run this in the repo terminal:

```bash
cp migrations/20260519_plan_tasks_add_running_status.sql \
   /Users/samprimeaux/inneranimalmedia/migrations/

wrangler d1 migrations apply inneranimalmedia-business \
  --remote \
  --migration-file migrations/20260519_plan_tasks_add_running_status.sql
```

Confirm output shows `1 migration applied` before proceeding.
