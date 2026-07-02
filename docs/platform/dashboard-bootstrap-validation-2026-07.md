# Dashboard bootstrap / L2 — manual UX validation

**When:** After deploy of L1/L2 spine refactor (2026-07-01+).

## Prep (one time per session)

1. Open Chrome DevTools → **Network** → filter `Fetch/XHR`, check **Preserve log**.
2. In Console:
   ```js
   localStorage.setItem('IAM_DEBUG_L1', '1');
   localStorage.setItem('IAM_DEBUG_L2', '1');
   ```
3. Hard refresh (`Cmd+Shift+R`).

---

## Test A — CMS route (no agent L2 on cold load)

1. Go to **`/dashboard/cms`** (or `/dashboard/home` without opening agent panel).
2. **Network (first 3s):**
   - ✅ Exactly **one** `GET /api/dashboard/bootstrap`
   - ✅ **No** `/api/agent/policy`
   - ✅ **No** `/api/agent/models`
3. **Console:**
   - ✅ `[IAM L1] bootstrap published` with `l2_excluded: ["agent_policy","agent_models","default_model"]`
   - ✅ No `[IAM L2]` lines (agent shell not mounted)

---

## Test B — Agent route (L2 loads on shell mount)

1. Navigate to **`/dashboard/agent`**.
2. **Network:**
   - ✅ `GET /api/agent/policy` (once per workspace)
   - ✅ `GET /api/agent/models?show_in_picker=1` (once, cached)
   - ✅ Optional: `GET /api/settings/default-model`
3. **Console:**
   - ✅ `[IAM L2] fetch /api/agent/policy`
   - ✅ `[IAM L2] fetch /api/agent/models`
4. **UX:** Model picker populated; chat sends successfully.

---

## Test C — Workspace switch on CMS (theme yes, L2 no)

1. On **`/dashboard/cms`**, switch workspace from launcher.
2. **Network:**
   - ✅ `POST /api/settings/workspaces/active`
   - ✅ `GET /api/dashboard/bootstrap` (refresh for theme)
   - ✅ **No** `/api/agent/policy` or `/api/agent/models`
3. Theme should update; CMS should remain usable.

---

## Test D — Workspace switch on agent (L2 refetch)

1. On **`/dashboard/agent`**, switch workspace.
2. **Network:**
   - ✅ Bootstrap refresh
   - ✅ **New** `/api/agent/policy` for new workspace
3. **Console:**
   - ✅ `[IAM L2] invalidate policy cache`
   - ✅ `[IAM L2] fetch /api/agent/policy`

---

## Server proof (curl, authenticated)

With session cookie:

```bash
curl -s -b "$IAM_COOKIE" https://inneranimalmedia.com/api/dashboard/bootstrap | jq 'keys, ._meta'
```

Expected keys (no `agent`, no `agent_policy`):

```json
["_meta", "client", "fetched_at", "me", "ok", "status", "theme", "workspaces"]
```

`_meta.l2_excluded` should list `agent_policy`, `agent_models`, `default_model`.

---

## Worker logs (Cloudflare Observability)

Filter: `path:/api/dashboard/bootstrap`

Compare D1 query count per request **before vs after** refactor — bootstrap should no longer hit `agentsam_model_catalog` or agent policy resolution joins.

---

## Automated gates (run locally before/after)

```bash
chmod +x scripts/guard-bootstrap-l1-fields.sh scripts/guard-no-bootstrap-domain-leaks.sh
npm run guard:bootstrap-l1
npm run guard:bootstrap-domain-leaks
node --check src/api/dashboard-bootstrap.js
node --test tests/unit/dashboard-bootstrap-payload.test.mjs
node --test tests/unit/agent-chat-resolved-context.test.mjs
npm run build:vite-only
```
