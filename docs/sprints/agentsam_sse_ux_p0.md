# Agent Sam — SSE / Plan UX · P0 Master Fix

## Context & Hard Rules

Repo root: `/Users/samprimeaux/inneranimalmedia`  
Deploy: `npm run deploy:full` (never `npm run deploy` alone)  
Python patches: always `.bak` backup first, line-by-line over regex  
Do NOT touch: D1 schema, Supabase tables, wrangler.toml bindings  
Do NOT introduce new npm packages — use what is already installed  
Test each file compiles (`npx tsc --noEmit`) before moving to the next fix  

---

## Fix 1 — `task_start` title passthrough (1 line)

**File:** `dashboard/features/agent-chat/hooks/useAgentChatStream.ts`  
**Around line:** 762

**Problem:** `task_start` SSE carries a `title` field but the hook discards it,
emitting only `Running task X of Y…`. The task title never reaches the UI.

**Change:** In the `task_start` branch, update the `onThinkingEvent` call to include
`task_title` and the full label built from the title when available:

```ts
onThinkingEvent?.({
  type: 'plan_progress',
  text: d.title
    ? String(d.title).slice(0, 120)
    : `Running task ${idx + 1} of ${total}…`,
  task_title: d.title ? String(d.title).slice(0, 120) : undefined,
  task_index: idx,
  task_total: total,
});
```

Also update the `ThinkingCardState` / `onThinkingEvent` type in
`dashboard/features/agent-chat/types.ts` if `task_title`, `task_index`,
`task_total` are not already on the thinking event union — add them as
optional fields so TypeScript does not error.

---

## Fix 2 — ExcalidrawView: skip workspace canvas fetch when opened with artifact

**File:** `dashboard/components/ExcalidrawView.tsx`  
**Around line:** 28–36

**Problem:** ExcalidrawView fetches `/api/collab/canvas/state` unconditionally on
every mount. When the Draw tab is opened to show a plan artifact, the workspace
collab canvas (containing the old "Hey" drawing) loads first and persists.

**Change:** Add a module-level ref that tracks whether the component was opened
via a plan-artifact event. Skip the workspace canvas fetch when it was.

```tsx
// At the top of ExcalidrawView component, before the canvas-state effect:
const openedWithArtifactRef = useRef(false);

// In the iam:excalidraw_load_document handler (lines ~45–80),
// set the flag BEFORE fetching the artifact URL:
openedWithArtifactRef.current = true;

// In the canvas-state fetch effect (line ~30), wrap the fetch:
if (!openedWithArtifactRef.current) {
  fetch(`/api/collab/canvas/state?workspace_id=...`)
    ...
}
```

The ref resets naturally on component unmount because the component remounts
fresh each time the tab opens.

---

## Fix 3 — ThinkingCard: logo + semantic header text

**File:** `dashboard/src/components/ThinkingCard.tsx`

**Problem:** The header shows `Working · 6.0s · 3 steps` — mechanical and
uninformative. The pulse dot is a generic circle. The goal is the Claude
extended-thinking pattern: `[AgentPresenceLogo] [one-line semantic summary]`.

**Changes:**

### 3a — Import AgentPresenceLogo
Find the correct relative import path to `AgentPresenceLogo` from
`dashboard/features/agent-presence/` (check that directory for the export).
Add the import at the top of `ThinkingCard.tsx`.

### 3b — Swap the pulse dot for the logo
Replace the `<span className="iam-tc-pulse" ...>` circle in the active
branch of the header button with:

```tsx
<AgentPresenceLogo
  motion={isActive ? 'thinking' : 'idle'}
  sizePx={16}
  alt=""
/>
```

Keep the `AlertTriangle` for error state and `Lock` for blocked state as-is.
Replace the green dot for `isDone` with:

```tsx
<AgentPresenceLogo motion="idle" sizePx={16} alt="" />
```

### 3c — Swap the mechanical header string for semantic text
Replace the `headerLabel` string with:

```tsx
const headerLabel = isError
  ? `Stopped · ${elapsedStr}`
  : isBlocked
  ? `Waiting for approval`
  : isDone
  ? `Done · ${elapsedStr}`
  : thinkingText    // ← the semantic one-liner from SSE / presenceCopy
    ? thinkingText.length > 90
      ? thinkingText.slice(0, 87) + '…'
      : thinkingText
    : `Working · ${elapsedStr}`;
```

### 3d — Elapsed time as secondary muted label
Add `· {elapsedStr}` as a separate `<span>` with muted color to the right of
`headerLabel` (inside the button, before the chevron) so elapsed is still
visible but secondary:

```tsx
{isActive && (
  <span style={{ fontSize: 10, color: 'var(--text-tertiary, #4e4e62)', marginLeft: 4 }}>
    · {elapsedStr}
  </span>
)}
```

---

## Fix 4 — AgentPlanChecklist: live active-step shimmer + remove debug dump

**File:** `dashboard/features/agent-chat/components/AgentPlanChecklist.tsx`

**Problem:**  
- Active tasks show a `Loader2` spinner but no live text — silent spinner only  
- "Show Details" reveals raw debug metadata (workflow_run_id, step IDs, raw output)  
  instead of a meaningful per-task trace  
- There is no "Planning next moves…" shimmer tail between steps  

**Changes:**

### 4a — Per-task live subtitle for running tasks
In the task `<li>` render, add a live subtitle line below the title when the
task is `running`:

```tsx
{task.status === 'running' && (
  <span
    className="block text-[10px] mt-0.5 text-[var(--solar-cyan)]"
    style={{ animation: 'agent-sam-plan-shimmer 2.8s ease-in-out infinite' }}
  >
    {task.detail
      ? String(task.detail).slice(0, 100)
      : 'Working…'}
  </span>
)}
```

The `agent-sam-plan-shimmer` keyframe already exists in
`dashboard/features/agent-presence/presenceMotion.css` — just reference it.

### 4b — "Planning next moves…" tail
After the task list `</ul>`, when `plan.status === 'running'` and the last
visible task is `done` (i.e. between steps), render a shimmer tail row:

```tsx
{plan.status === 'running' &&
  sorted.every((t) => t.status !== 'running') && (
  <div
    className="px-4 pb-3 text-[11px] text-[var(--dashboard-muted)]"
    style={{ animation: 'agent-sam-plan-shimmer 2.8s ease-in-out infinite' }}
  >
    Planning next moves…
  </div>
)}
```

### 4c — Replace "Show Details" debug dump with per-task thought
The current `hasTrace` / `expanded` section dumps `workflow_run_id`,
`execution_step_id`, and raw `task.detail` in a monospace block.

Replace it: when `expanded`, show a clean list of only completed tasks that
have a `detail` string, formatted as a readable sentence — not raw IDs:

```tsx
{expanded && (
  <div className="px-3 pb-3 space-y-2">
    {sorted
      .filter((t) => t.detail && t.status !== 'todo')
      .map((task) => (
        <div key={`d-${task.id}`} className="text-[11px] text-[var(--dashboard-muted)] leading-relaxed">
          <span className="font-medium text-[var(--dashboard-text)]">
            {task.title}
          </span>
          {' — '}
          {String(task.detail).slice(0, 300)}
        </div>
      ))}
    {sorted.filter((t) => t.detail && t.status !== 'todo').length === 0 && (
      <p className="text-[11px] text-[var(--dashboard-muted)]">No detail yet.</p>
    )}
  </div>
)}
```

Remove the `workflow_run_id` / `plan_id` / `execution_step_id` rows from the
expanded section entirely — those belong in a debug panel, not the user trace.

Change the toggle label from `SHOW DETAILS` / `HIDE DETAILS` to
`Show trace` / `Hide trace`.

---

## Fix 5 — agent.js: plan confirmation gate

**File:** `src/api/agent.js`  
**Around line:** 5700 (between `emitPlan('plan_created', ...)` and `executePlan`)

**Problem:** `executePlan` is called immediately after `plan_created` with no
user confirmation. The system prompt instruction at line ~6244 ("Do not
auto-run…") is only an LLM hint — there is no hard SSE gate.

**Change:** Emit `plan_confirmation_required` and poll D1 for a confirmation
record before calling `executePlan`. Use the existing approval infrastructure.

### 5a — Emit the gate event
After the closing `});` of `emitPlan('plan_created', {...})`, before the
`if (requestedMode !== 'plan')` block, add:

```js
// Only gate in agent/multitask mode, not plan-review mode
if (requestedMode !== 'plan') {
  emitPlan('plan_confirmation_required', {
    plan_id: plan.plan_id,
    plan_title: plan.plan_title,
    task_count: plan.tasks.length,
    message: 'Review the plan above and confirm to begin execution.',
  });

  // Poll D1 for confirmation — max 3 minutes
  const confirmed = await waitForPlanConfirmation(env, plan.plan_id, 180_000);
  if (!confirmed) {
    emitPlan('text', {
      text: '_Plan cancelled or confirmation timed out. Send your message again to retry._',
    });
    emitPlan('done', {});
    return;
  }
}
```

### 5b — Add `waitForPlanConfirmation` helper
Add this function in `src/api/agent.js` (near the other plan helpers, above
the `handleAgentChatStream` function):

```js
async function waitForPlanConfirmation(env, planId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const pollInterval = 2000; // 2s
  while (Date.now() < deadline) {
    try {
      const row = await env.DB.prepare(
        `SELECT status FROM agentsam_plan WHERE plan_id = ? LIMIT 1`
      ).bind(planId).first();
      if (row?.status === 'confirmed') return true;
      if (row?.status === 'cancelled') return false;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  return false; // timed out
}
```

> **Note to Cursor:** Verify the exact D1 table name for plans — it may be
> `agentsam_plan` or `agentsam_chat_plan` or similar. Check
> `src/api/agent.js` and `src/core/agentsam-planner.js` for the INSERT
> statement to confirm the table and status column names. If the status
> column does not exist, add a `status TEXT DEFAULT 'pending'` column via a
> new D1 migration file in `migrations/` before writing the poll query.

### 5c — Add the confirmation endpoint
In `src/api/agent.js` (or the appropriate router file), add a POST endpoint:

```
POST /api/agent/plan/:planId/confirm
POST /api/agent/plan/:planId/cancel
```

Each endpoint updates the `status` column in the plan table to `confirmed` or
`cancelled` and returns `{ ok: true }`.

### 5d — Wire the confirm/cancel UI
In `dashboard/features/agent-chat/hooks/useAgentChatStream.ts`, handle the
new event type:

```ts
if (data.type === 'plan_confirmation_required') {
  // Store on the message so AgentPlanChecklist can render confirm/cancel buttons
  setMessages(prev => {
    const last = [...prev];
    const idx = last.length - 1;
    if (idx >= 0 && last[idx].role === 'assistant') {
      last[idx] = {
        ...last[idx],
        planConfirmationRequired: {
          plan_id: d.plan_id,
          message: d.message,
        },
      };
    }
    return last;
  });
  continue;
}
```

In `AgentPlanChecklist.tsx`, when `plan.planConfirmationRequired` is set and
`plan.status !== 'running'`, render two buttons at the bottom of the card:

```tsx
<div className="flex gap-2 px-3 pb-3 pt-1">
  <button
    onClick={() => fetch(`/api/agent/plan/${planId}/confirm`, { method: 'POST', credentials: 'include' })}
    className="flex-1 rounded-lg bg-[var(--solar-cyan)]/15 border border-[var(--solar-cyan)]/30 text-[var(--solar-cyan)] text-[12px] font-medium py-1.5 hover:bg-[var(--solar-cyan)]/25 transition-colors"
  >
    Start execution
  </button>
  <button
    onClick={() => fetch(`/api/agent/plan/${planId}/cancel`, { method: 'POST', credentials: 'include' })}
    className="px-3 rounded-lg border border-[var(--dashboard-border)] text-[var(--dashboard-muted)] text-[12px] py-1.5 hover:text-[var(--dashboard-text)] transition-colors"
  >
    Cancel
  </button>
</div>
```

Once the user clicks either button, clear `planConfirmationRequired` from the
message state so the buttons disappear.

---

## Fix 6 — BrowserView: playwright polling guard

**File:** `dashboard/components/BrowserView.tsx`

**Problem:** The screenshot-completion poller (line ~69, the `pollJobs` loop)
runs indefinitely when a job from a previous session is stuck in a pending
state. The 60s interval at line ~1611 also runs whenever BrowserView is
mounted, even when the Browser tab is not visible.

**Changes:**

### 6a — Max attempt cap on the screenshot poll loop
In the `pollJobs` / screenshot-completion poller function (line ~69), add an
attempt counter. After 30 attempts (~30 seconds at 1s intervals), abort and
log a warning:

```js
let attempts = 0;
const MAX_ATTEMPTS = 30;
// inside the poll loop:
if (++attempts > MAX_ATTEMPTS) {
  console.warn('[BrowserView] screenshot poll timed out after 30 attempts');
  break;
}
```

### 6b — Clear stale pending jobs on mount
At the beginning of the BrowserView component, add a `useEffect` that runs
once on mount and clears any jobs with status `pending` older than 5 minutes
from local state (or from whatever job list state the component holds) so
they don't restart the poller:

```ts
useEffect(() => {
  // Clear any stale pending jobs from previous sessions
  setJobs(prev =>
    (prev || []).filter(j => j.status !== 'pending' || Date.now() - new Date(j.created_at).getTime() < 300_000)
  );
}, []);
```

Adapt the field names to match the actual job object shape in BrowserView.

### 6c — Guard the 60s poll interval behind tab visibility
Wrap the `setInterval(() => void pollJobs(), 60000)` at line ~1611 in a
visibility check so it only runs when the Browser tab is the active tab:

```ts
const interval = window.setInterval(() => {
  if (document.visibilityState === 'visible') void pollJobs();
}, 60_000);
```

---

## Fix 7 — agent.js: fix "run a python" → browser tool routing bug

**File:** `src/api/agent.js`  

**Problem (from logs):**  
`capability_families: ["terminal"]` was correctly detected for "run a python",  
but `tool_names: ["browser_content","browser_content","browser_navigate"]` were  
injected — terminal tools were NOT given. The agent then tried to navigate to  
`/api/mcp/context/bootstrap` instead of running a shell command.

Also: `D1_ERROR: FOREIGN KEY constraint failed` in `agent_tool_ledger_create` —
a tool ledger row is being inserted before its parent run record exists.

**Changes:**

### 7a — Verify filterToolsByIntent terminal branch
Find `filterToolsByIntent` (or equivalent tool-selection logic) in `agent.js`
or `src/core/capability-router.js`. Locate the branch that handles
`capability_families` containing `'terminal'`. Verify that when `terminal` is
the selected family, browser tools (`browser_content`, `browser_navigate`) are
excluded from the tool list passed to the model.

If the terminal branch is correct but browser tools still leak in, look for
a fallback path that appends browser tools when the terminal capability is
detected (perhaps a `should_use_browser` flag being set incorrectly for short
messages). Add a guard:

```js
if (capabilityFamilies.includes('terminal') && !explicitBrowserRequest) {
  toolList = toolList.filter(t => !t.name.startsWith('browser_'));
}
```

### 7b — Fix FK constraint in agent_tool_ledger_create
Find the `agent_tool_ledger_create` call (in `agent.js` or `src/core/`).
Verify it is called AFTER the parent agent run record is inserted, not before.
If the INSERT order is wrong, move the tool ledger creation to after the run
record INSERT. If it is in a concurrent `Promise.all`, make it sequential.

---

## Final Step — Stage, Commit, Push, Report

After all fixes compile cleanly (`npx tsc --noEmit` in `dashboard/` passes):

```bash
cd /Users/samprimeaux/inneranimalmedia

# Stage only the files touched above
git add \
  dashboard/features/agent-chat/hooks/useAgentChatStream.ts \
  dashboard/features/agent-chat/types.ts \
  dashboard/components/ExcalidrawView.tsx \
  dashboard/src/components/ThinkingCard.tsx \
  dashboard/features/agent-chat/components/AgentPlanChecklist.tsx \
  src/api/agent.js \
  dashboard/components/BrowserView.tsx

# If a D1 migration was required for Fix 5 status column:
git add migrations/

git commit -m "fix(sse-ux): plan confirm gate, live task trace, excalidraw canvas guard, playwright poll cap, browser tool routing"

git push origin main
```

**After push succeeds, report back:**

```
Commit hash:    [full SHA]
Commit message: [as above]
Files changed:  [list]

Recommended deploy path:
  npm run deploy:full

To verify live:
  1. Hard refresh dashboard (Cmd+Shift+R)
  2. Send a multi-step agent task → plan card should show "Start execution" / "Cancel"
  3. Click "Start execution" → tasks should check off with live shimmer
  4. Click "Open plan map (Draw)" → should NOT load the "Hey" canvas
  5. Send "run a python script" → should NOT trigger browser_navigate
  6. wrangler tail: confirm /api/playwright not hitting during non-browser tasks
```

If any fix could not be completed, list exactly which file/line blocked it and why.
Do not silently skip a fix.
