# Settings Sections — Cursor Build Todo (corrected)

**Repo:** `SamPrimeaux/inneranimalmedia` · branch: `main` → Cloudflare autobuild on push
**Section components:** `src/components/settings/sections/`
**Sub-components:** `src/components/settings/components/`
**New API handlers:** `src/api/` only — nothing into `worker.js`
**Handler signature:** `(request, env, ctx)`
**Rules:** Audit before edit. `PRAGMA table_info` before any schema touch.
No hardcoded IDs. No wholesale rewrites. `FloatingPreviewPanel.jsx` is untouchable.

---

## Effort order (smallest diff → largest)

Themes → Hooks → General → Agents → Rules & Skills → Workspace → Security rotate → ApiKeysSection

---

## PHASE 1 — ThemesSection.tsx

**File:** `src/components/settings/sections/ThemesSection.tsx`
**Current state:** 8-line file. Delegates 100% to `<ThemeSwitcher workspaceId={…} />`.
**Backend needed:** None. `GET /api/settings/themes/status` already exists and returns
`cms_themes`, `cms_theme_preferences` (user + workspace), scope, theme count.

### What to add

1. At mount, call `GET /api/settings/themes/status`. Put result in local state.
2. Before `<ThemeSwitcher />`, render:
   - `<SummaryGrid>` with 4 cells: current user theme, workspace theme, scope, theme count
   - `<WarningStrip>` if status response includes any `missing_tables` entries
3. Then render existing `<ThemeSwitcher workspaceId={workspaceId} />` unchanged.

That's one `useEffect` + two JSX blocks. ThemeSwitcher is not modified.

### Commit
```
git add src/components/settings/sections/ThemesSection.tsx
git commit -m "feat(settings/themes): add status SummaryGrid + WarningStrip above ThemeSwitcher"
```

---

## PHASE 2 — HooksSection.tsx

**File:** `src/components/settings/sections/HooksSection.tsx`
**Current state:** Reads `GET /api/settings/hooks` → `agentsam_hook` + `agentsam_hook_execution`.
Toggle / delete / create are wired and working.
**Backend needed:** None. `GET /api/settings/hooks/status` already shipped and returns
`agentsam_webhook_events`, `agentsam_webhook_weekly`, `agentsam_cron_runs`,
`agentsam_compaction_events`, Supabase `webhook_delivery_attempts`, and
`webhook_secrets` (presence only — names + last-rotated, never values).

### What to add

1. At mount, call `GET /api/settings/hooks/status` in parallel with the existing hooks fetch.
2. At top of section, before the hook list, render:
   - `<SummaryGrid>` with 4 cells: active hooks count, recent failures count,
     last cron run timestamp, last compaction timestamp
3. Below the hook list, add a **Webhook Secrets card**:
   - Source: `webhook_secrets` presence data from the status response
   - Renders: table of secret names + last-rotated date
   - No reveal/copy/value. Name and rotation date only.
   - If array is empty, render muted "No webhook secrets configured" state.

No new mutations. No new backend work.

### Commit
```
git add src/components/settings/sections/HooksSection.tsx
git commit -m "feat(settings/hooks): add status SummaryGrid + webhook secrets presence card"
```

---

## PHASE 3 — GeneralSection.tsx

**File:** `src/components/settings/sections/GeneralSection.tsx`
**Current state:** 4 hardcoded toggles (`sync_layouts`, `show_status_bar`,
`autohide_editor`, `autoinject_code`). Backed by localStorage first,
then fire-and-forget `PATCH /api/settings/user-policy`.
No GET on mount. No summary data displayed.

### Backend work — new handler

Create `src/api/settings-general.js`.

`GET /api/settings/general` — four safeQueryAll calls, all read-only:
- `agentsam_user_policy WHERE user_id = ? AND workspace_id = ?`
- `user_settings WHERE user_id = ?` (return defaults if no row exists, do not insert)
- `users WHERE id = ?` — for `display_name`, `email`
- `agentsam_bootstrap WHERE workspace_id = ?` — for `ui_preferences_json`
  (parse out default_model and plan string)

Return flat merged object:
```json
{
  "display_name": "...",
  "email": "...",
  "default_workspace": "...",
  "default_model": "...",
  "plan": "...",
  "policy": { "sync_layouts": 1, "show_status_bar": 1, "autohide_editor": 0, "autoinject_code": 1 }
}
```

No new PATCH — existing `PATCH /api/settings/user-policy` with the
`AGENTSAM_POLICY_COLS` allowlist handles writes. Do not bypass the allowlist.

### What to change in the component

1. Add `useEffect` → `GET /api/settings/general` on mount. Store in state.
2. Replace the 4 localStorage reads with values from `state.policy.*`.
   Keep the existing debounced `PATCH /api/settings/user-policy` call.
   Remove only the localStorage write that happens alongside it.
3. Add `<SummaryGrid>` above the toggles: User, Default workspace, Default model, Plan, email.
4. Any toggle whose column key is not in the `AGENTSAM_POLICY_COLS` allowlist
   renders disabled with a `reasonDisabled` prop.

### Commit
```
git add src/api/settings-general.js
git add src/components/settings/sections/GeneralSection.tsx
git commit -m "feat(settings/general): GET /api/settings/general + SummaryGrid, drop localStorage"
```

---

## PHASE 4 — AgentsSection.tsx

**File:** `src/components/settings/sections/AgentsSection.tsx`
**Current state:** Most complete section. Reads `GET /api/settings/agents` →
`agentsam_user_policy` + all three allowlist tables + `agentsam_subagent_profile`.
25 toggles, 4 selects, `<AgentsAllowlists />`, subagents table.
Saves via `PATCH /api/settings/agents/policy` and per-row POST/DELETE endpoints.
Do not touch any of this.

### Backend work — new read-only endpoint

Create `src/api/settings-agents-health.js`.

`GET /api/settings/agents/health` — three safeQueryAll calls:
- `agentsam_workflow_runs WHERE created_at > (unixepoch() - 86400)` grouped by status
  → success/error counts. **Table is currently empty — return `{ success: 0, error: 0 }`,
  do not throw.**
- `agentsam_error_log WHERE created_at > (unixepoch() - 86400) ORDER BY created_at DESC LIMIT 10`
- `agentsam_usage_events WHERE created_at > (unixepoch() - 604800)` → sum
  `tokens` and `cost_usd`. **Table is dormant (402 rows, stalled writers) — sum
  whatever is there, do not treat as error.**

Return:
```json
{
  "workflow_runs_24h": { "success": 0, "error": 0 },
  "recent_errors": [ { "severity": "...", "message": "...", "created_at": 0 } ],
  "usage_7d": { "total_tokens": 0, "total_cost_usd": 0.0 }
}
```

### What to change in the component

1. Add a second `useEffect` → `GET /api/settings/agents/health` on mount.
2. At the top of the section JSX, above the existing toggles, render `<SummaryGrid>`
   with: workflow success count, workflow error count, recent error count,
   7d token total, 7d cost total.
3. Render the grid in a muted style when all values are zero. Do not hide it —
   zero is meaningful signal for dormant writers.

Do not modify `AgentsAllowlists.tsx`, the subagents table, or any PATCH path.

### Commit
```
git add src/api/settings-agents-health.js
git add src/components/settings/sections/AgentsSection.tsx
git commit -m "feat(settings/agents): health strip via GET /api/settings/agents/health"
```

---

## PHASE 5 — RulesSkillsSection.tsx

**File:** `src/components/settings/sections/RulesSkillsSection.tsx`
**Sub-components:** `src/components/settings/components/rulesSkills/`
**Current state:** Thin tab router → RulesSkillsSkillsTab, RulesSkillsSubagentsTab,
RulesSkillsCommandsTab, RulesSkillsRulesTab + RulesSkillsDrawers. All four tabs
fully wired to real endpoints. Do not touch any tab component or drawer.

### Backend work — new read-only endpoint

Create `src/api/settings-rules-guardrails.js`.

`GET /api/settings/rules/guardrails` — three safeQueryAll calls:
- `agentsam_guardrails WHERE is_active = 1 ORDER BY created_at DESC`
- `agentsam_guardrail_rulesets ORDER BY created_at DESC`
- `agentsam_guardrail_events ORDER BY created_at DESC LIMIT 10`
  **Table is currently empty (0 rows) — return `[]`, do not throw.**

Compute `violations_7d` as count of `agentsam_guardrail_events` rows where
`created_at > (unixepoch() - 604800)`. Will be 0 until enforcement layer is wired.

Return:
```json
{
  "guardrails": [ { "id": "...", "name": "...", "type": "..." } ],
  "rulesets": [ { "id": "...", "name": "..." } ],
  "recent_events": [],
  "violations_7d": 0
}
```

### What to change in RulesSkillsSection.tsx

1. Add `useEffect` → `GET /api/settings/rules/guardrails` on mount.
2. Before the tab router, render `<WarningStrip>`:
   - `violations_7d > 0`: "[N] guardrail violations in last 7 days"
   - `violations_7d === 0` and `recent_events.length === 0`: muted "No guardrail events —
     enforcement layer not yet emitting" (honest empty state, not hidden)
   - `guardrails.length === 0`: "No guardrails configured"

### Optional — same commit

In `RulesSkillsSkillsTab.tsx`: if the skills GET response already includes
`last_invoked_at` and `invocation_count` (from `agentsam_skill_invocation` join),
render them as secondary text per row. `agentsam_skill_invocation` is empty —
render `—` when null. No new endpoint, no schema change.

### Commit
```
git add src/api/settings-rules-guardrails.js
git add src/components/settings/sections/RulesSkillsSection.tsx
git add src/components/settings/components/rulesSkills/RulesSkillsSkillsTab.tsx
git commit -m "feat(settings/rules): guardrail WarningStrip + skill invocation display"
```

---

## PHASE 6 — WorkspaceSection.tsx

**File:** `src/components/settings/sections/WorkspaceSection.tsx`
**Current state:** 594 lines. Reads `GET /api/settings/workspace?workspace_id=…`
aggregating `workspaces`, `workspace_settings`, `workspace_domains`, `workspace_limits`,
`workspace_usage_metrics`, `workspaces.settings_json`. Renders 8+ cards.
Saves via `patchWorkspaceCmsPipeline`. Do not touch any existing card or PATCH path.

### Backend work — new endpoint

Create `src/api/settings-workspace-members.js`.

`GET /api/settings/workspace/members?workspace_id=…`

**First check — before any DB read:**
```js
const sessionTenantId = resolveSessionTenantId(request, env);
const ws = await env.DB.prepare(
  'SELECT tenant_id FROM workspaces WHERE id = ?'
).bind(workspaceId).first();
if (!ws || ws.tenant_id !== sessionTenantId) return new Response('Forbidden', { status: 403 });
```

Then two reads merged in the Worker:
1. D1: `workspace_members WHERE workspace_id = ? ORDER BY joined_at DESC`
2. Supabase: `workspace_memberships` joined to `identity_profiles` via service role
   — pull `d1_auth_user_id`, `role`, `access_level`, `status`, `supabase_user_id`

Merge on `d1_auth_user_id = user_id`. Return array:
```json
[{
  "user_id": "...",
  "email": "...",
  "display_name": "...",
  "role": "admin",
  "access_level": "write",
  "status": "active",
  "joined_at": 0
}]
```

No writable endpoints yet.

### What to add in the component

Add one new card at the end of the existing card list. Do not reorder cards.

**Members card:**
- `useEffect` → `GET /api/settings/workspace/members?workspace_id=…` on mount
- Table: initials avatar, display name, email, role badge, access level badge, status badge, joined date
- "Invite member" button → `disabled` with `title="Coming soon"`
- "Remove" button per row → `disabled` with `title="Coming soon"`
- Empty state: "No members found"

### Commit
```
git add src/api/settings-workspace-members.js
git add src/components/settings/sections/WorkspaceSection.tsx
git commit -m "feat(settings/workspace): Members card via GET /api/settings/workspace/members"
```

---

## PHASE 7 — SecuritySection.tsx: close the rotate gap

**File:** `src/components/settings/sections/SecuritySection.tsx`
**Current state:** Rotate button is inform-only. Confirms + reveals but does not
call `POST /api/vault/secrets/:id/rotate`. That backend route is fully wired.

### What to change

Find the rotate handler. Replace the confirm-only flow with a two-step modal:

**Step 1:** Display `metadata_json.last4` from local state (do not call `/reveal`).
Copy: "Rotating [key_name] — currently ending in ••••[last4]."

**Step 2:** New key input + Confirm button.

```jsx
// uncontrolled ref — never store raw value in state
const newKeyRef = useRef(null);

// on confirm:
const res = await fetch(`/api/vault/secrets/${id}/rotate`, {
  method: 'POST',
  body: JSON.stringify({ new_value: newKeyRef.current.value }),
});
newKeyRef.current.value = ''; // clear immediately after call regardless of result
```

On success: update row in local state with new `metadata_json.last4` from response,
close modal, show toast.
On error: show error inline, do not close modal.

Input: `<input type="password" ref={newKeyRef} />` — uncontrolled, never in state.

No backend changes.

### Commit
```
git add src/components/settings/sections/SecuritySection.tsx
git commit -m "feat(settings/security): wire rotate modal to POST /api/vault/secrets/:id/rotate"
```

---

## PHASE 8 — ApiKeysSection.tsx (new)

**New files:**
- `src/components/settings/sections/ApiKeysSection.tsx`
- `src/api/settings-api-keys.js`
- `src/core/vault-supabase.js` (only if it doesn't already exist — check first)

**Prerequisite:** D1 migration M1 columns (`vault_secret_id`, `capabilities_json`,
`last_tested_at`, `test_status`) on `user_api_keys` are live. Confirmed.

### Step 0 — check vault helper

Before writing the handler, search `src/core/` for an existing Supabase vault
helper. If one exists that covers create/get/update/delete against `vault.secrets`,
use it. If not, create `src/core/vault-supabase.js` with exactly four exports:

```js
export async function vaultCreate(env, secret, name) { ... }
export async function vaultGet(env, vaultId) { ... }     // returns decrypted string
export async function vaultUpdate(env, vaultId, newSecret) { ... }
export async function vaultDelete(env, vaultId) { ... }
```

Each calls Supabase via the service role client using the same pattern
already in the codebase for other Supabase calls. Four functions, no more.

### Backend — `src/api/settings-api-keys.js`

```
GET  /api/settings/api-keys?workspace_id=
     SELECT id, provider, key_name, key_preview, capabilities_json, test_status,
            last_tested_at, status, expires_at, workspace_id, scopes_json
     FROM user_api_keys
     WHERE workspace_id = ? AND tenant_id = ? AND is_active = 1
     ORDER BY created_at DESC
     — never include vault_secret_id in response shape

POST /api/settings/api-keys
     body: { provider, key_name, raw_key, workspace_id, capabilities, scopes }
     → vaultCreate(env, raw_key, `api_key:${tenantId}:${newId}`)
     → D1 INSERT with vault_secret_id + key_preview = computeMasked(raw_key)
     → secret_audit_log INSERT event_type='created' source='user_api_keys'
     → return metadata row only

DELETE /api/settings/api-keys/:id
     → get vault_secret_id from D1
     → vaultDelete(env, vault_secret_id)
     → D1 UPDATE is_active=0
     → secret_audit_log INSERT event_type='revoked'

POST /api/settings/api-keys/:id/rotate
     body: { raw_key }
     → get vault_secret_id from D1
     → vaultUpdate(env, vault_secret_id, raw_key)
     → D1 UPDATE key_preview=computeMasked(raw_key), test_status='untested', last_tested_at=NULL
     → secret_audit_log INSERT event_type='rotated'
     → return updated metadata row

POST /api/settings/api-keys/:id/test
     → get vault_secret_id from D1
     → vaultGet(env, vault_secret_id)           ← raw key, handle immediately
     → call provider test endpoint (table below)
     → discard raw key
     → D1 UPDATE test_status, last_tested_at
     → secret_audit_log INSERT event_type='test_passed' or 'test_failed'
     → return { status, latency_ms } only

GET  /api/settings/api-keys/:id/audit
     SELECT * FROM secret_audit_log
     WHERE secret_id = ? AND secret_source = 'user_api_keys'
     ORDER BY created_at DESC LIMIT 50
```

**Provider test endpoints:**

| provider value | URL | success |
|---|---|---|
| openai | `GET https://api.openai.com/v1/models` | 200 |
| anthropic | `GET https://api.anthropic.com/v1/models` | 200 |
| gemini | `GET https://generativelanguage.googleapis.com/v1beta/models?key={raw}` | 200 |
| github | `GET https://api.github.com/user` | 200 |
| stripe | `GET https://api.stripe.com/v1/account` | 200 |
| resend | `GET https://api.resend.com/emails` | 200 or 400 (400 = valid key) |
| default | skip test → return `{ status: 'untested', latency_ms: 0 }` | — |

**`computeMasked(raw_key)`:** `raw_key.slice(0,4) + '••••••••' + raw_key.slice(-4)`.
If `raw_key.length < 8`: `'••••' + raw_key.slice(-4)`.

### Component — `src/components/settings/sections/ApiKeysSection.tsx`

Follow the same card/table pattern as other sections in this directory.

**Table row:** provider icon, key name, masked preview, capabilities badges,
test status badge (ok / fail / untested), last tested timestamp, rotate button,
test button, revoke button.

**"Add key" slide-over:**
- Provider select + key name input + raw key `<input type="password" ref={rawKeyRef} />`
  (uncontrolled — never in state) + capabilities multi-select + Save
- On save: POST → `rawKeyRef.current.value = ''` → close slide-over
- After close: masked preview shown in table. Key is gone.

**Rotate modal:** same two-step pattern as Phase 7.

**Audit drawer:** click row → `GET /api/settings/api-keys/:id/audit` → paginated list.

### Register in nav

Add to `src/components/settings/settingsConstants.ts` and
`src/components/settings/sections/index.ts`.
Slug: `api-keys`. Label: `API Keys`.
Position: adjacent to Security in the nav order.

### Commit
```
git add src/core/vault-supabase.js
git add src/api/settings-api-keys.js
git add src/components/settings/sections/ApiKeysSection.tsx
git add src/components/settings/settingsConstants.ts
git add src/components/settings/sections/index.ts
git commit -m "feat(settings): ApiKeysSection — vault-backed API key CRUD with test + rotate"
```

---

## Final push sequence

```bash
git push origin main
# CF autobuild triggers on push — no wrangler deploy, no separate production branch
# Verify on inneranimalmedia.com/dashboard/settings once build completes
# Confirm all 8 sections load without console errors
# Confirm rotate modal on Security
# Confirm ApiKeysSection appears in nav
```

---

## Cross-cutting rules for every phase

- New handlers in `src/api/` only. Nothing into `worker.js`.
- DB calls scoped to session-resolved `workspace_id`/`tenant_id` — never from query params.
- `PRAGMA table_info(table)` before any query touching M1–M7 migrated columns.
- No response shape may include: `vault_secret_id`, `secret_value_encrypted`,
  `encrypted_value`, `access_token`, `refresh_token`.
- Empty tables (`agentsam_guardrail_events`, `agentsam_workflow_runs`,
  `agentsam_skill_invocation`) return empty arrays, not errors.
- `agentsam_plans_old` — do not read or write in any new code.
- Every secret write emits a `secret_audit_log` row via `ctx.waitUntil`.
