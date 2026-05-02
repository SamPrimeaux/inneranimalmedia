# Tomorrow plan — 2026-03-23  
UI enhancements, Settings polish, terminal session fix, testing

## Morning email (Resend)

- **Script:** `scripts/send-morning-brief-email.mjs`
- **Default delivery:** Resend **`scheduled_at`**: `today at 8:30am America/Chicago` (override with env **`MORNING_BRIEF_SCHEDULED_AT`** or Resend natural language / ISO 8601).
- **Immediate send (no schedule):** `node scripts/send-morning-brief-email.mjs --now`
- **Run:** `set -a; . ./.env.cloudflare; set +a; node scripts/send-morning-brief-email.mjs` (requires **`RESEND_API_KEY`**).
- **From / to:** `MORNING_BRIEF_FROM`, `MORNING_BRIEF_TO` (optional; defaults: `support@inneranimalmedia.com` → `support@inneranimalmedia.com`).

---

This document turns tonight’s wins into a sequenced day: **unblock terminal first**, **ship Settings as the control plane**, then **Agent Sam visual parity**. It assumes surgical edits (especially `FloatingPreviewPanel.jsx` per repo rules: line numbers + approval before large changes).

---

## Tonight’s session — completed (baseline)

Use this as the “known good” snapshot before changing UI or terminal wiring.

- PTY terminal: zsh, `--login`, Cloudflare token separated from shell env where applicable.
- `ecosystem.config.cjs` repaired.
- 37+ secrets installed; D1 aligned with operational data.
- 8 webhook endpoints live and verified; 15 hook subscriptions wired.
- `webhook_events` logging confirmed (GitHub); `hook_executions` confirmed (e.g. `hks_gh_event`, `success`, ~37ms) after status hotfix.
- Cron: webhook maintenance + existing schedules (6am UTC path includes cleanup / rollup).
- Worker: CloudConvert + Meshy builtins; tools registered in D1 where applicable.
- Tables in play: `cicd_runs`, `deployment_tracking`, `webhook_event_stats` (and related hook tables).
- Theme: Solarized Dark persisted (D1).
- Chrome DevTools MCP tools registered (26).
- TURN server configured.
- `d1_write` / `agent_memory_index` guard deployed.
- Worker routes for all eight webhook sources live.

**Implication for tomorrow:** Settings UI should **surface** this infrastructure (webhooks, deploys, env) instead of requiring raw D1 or wrangler for routine operations.

---

## Priority order (strict)

1. **Sprint 1 — Terminal session** (~30 min)  
   Blocks honest testing of agent + settings flows that assume a persistent shell.

2. **Sprint 2 — Settings (`SettingsPanel.jsx`)** (2–3 hrs)  
   Largest UX unlock: vault, webhooks, env, agents manageable from the dashboard.

3. **Sprint 3 — Agent Sam polish** (~2 hrs)  
   Visual parity and affordances once terminal + settings are trustworthy.

---

## Sprint 1 — Terminal session fix (`sessionId: null`)

### Problem statement

`runTerminalCommand` (worker) sees `sessionId: null` (or client and worker disagree on the lookup key). Agent Sam connects to the PTY WebSocket, but **commands do not persist session context** (cwd, env, shell state).

### Hypothesis (for audit)

- `FloatingPreviewPanel.jsx`: WebSocket **registration message** sends a `sessionId` (or conversation id) that does not match what the worker uses when routing terminal I/O.
- Alternatively: client generates a session id only in one code path; preview panel uses another; reconnect drops id.

### Audit checklist (before any edit)

1. **Grep** in `agent-dashboard/src`: `sessionId`, `TERMINAL`, `WebSocket`, `terminal`, `conversation`.
2. **Grep** in `worker.js`: `runTerminalCommand`, `TERMINAL_WS`, session key, KV or Durable Object if any.
3. **Trace one round trip:** open terminal tab → first message payload → worker log line (tail) showing bound session id.
4. **Document** the canonical id: `conversation_id` vs `session_id` vs `terminal_session_id` — pick **one** name for both sides.

### Implementation rules

- Repo rule: **no wholesale rewrite** of `FloatingPreviewPanel.jsx`; **surgical** change with **line numbers** stated up front; get approval if the file is protected.
- One-line fix is acceptable **if** audit proves a single mismatched field; otherwise minimal patch (one registration site + one worker read site).

### Verification

- [ ] Send `pwd` → note path; send `cd /tmp` → send `pwd` → still under `/tmp`.
- [ ] Reload page / reconnect → behavior defined (same session vs new): document expected behavior.
- [ ] Tail: no repeated `sessionId: null` for successful commands.

### Rollback

- Revert single commit or single hunk if PTY breaks; keep worker + panel in sync.

---

## Sprint 2 — Settings panel: Cursor-parity control plane

**Primary file:** `agent-dashboard/src/SettingsPanel.jsx` (project uses `SettingsPanel`, not `Settings.jsx` — align naming in PR description).

**Constraints:** No hardcoded hex/rgba in JSX/CSS per IAM rules — use **`var(--...)`** tokens; add tokens to the theme layer if missing. Below, “rgba(...)” in the brief = **map to variables** during implementation.

### Phase 1 — Structure and interaction model

**Layout**

- Two columns: **left** = nav groups (stacked sections); **right** = scrollable content.
- **Active nav item:** full-width pill using `var(--bg-active)` (or existing active token).
- **Section labels:** ~10px, uppercase, muted color token (`var(--text-muted)` or equivalent).

**Save model**

- **Live / instant saves** — debounce writes (250–500ms) to avoid D1/API storms; optimistic UI + error toast on failure.
- No global “Save” button unless a dangerous action needs explicit confirm (e.g. secret rotate).

**Acceptance**

- [ ] Keyboard: focus order logical; Esc closes drawers if any.
- [ ] Mobile: collapse nav to drawer or top tabs (minimal scope: desktop-first OK if time-boxed).

### Phase 2 — Wire real data (tabs)

Each tab needs: **read API** (or existing worker route), **write API** where safe, **loading / empty / error** states.

| Tab | Data sources (indicative) | Notes |
|-----|---------------------------|--------|
| **Environment** | `env_secrets`, `worker_env` (or `/api/env/*` as implemented) | Never render full secret; see Phase 4. |
| **Agents** | `agent_configs` | Align with `agent_id` used in chat. |
| **Providers** | `mcp_registered_tools` | Respect `enabled`, `requires_approval`, categories. |
| **Webhooks** | `webhook_endpoints` | NEW tab: source, path, last_received, totals, link to docs for signing headers. |
| **Deploy** | `deployment_tracking` | NEW tab: recent rows, status, version, triggered_by; optional link to `cicd_runs`. |

**Worker/API audit first:** list existing routes (`grep` `/api/` in `worker.js` for env, webhooks, deploy). Add **only** thin read-only endpoints if missing; prefer reusing one dashboard API pattern.

**Acceptance**

- [ ] Each tab loads without console errors when tables empty.
- [ ] Webhooks tab read-only v1 is acceptable; editing endpoints can be phase 2.1.

### Phase 3 — Cursor tab (new)

**Sections (suggested)**

- **Connection status:** MCP / Cursor webhook last ping or last event (from `webhook_events` or dedicated health).
- **Hook last fired:** query latest row for `source = 'cursor'` (or hook_executions joined to subscriptions).
- **Recent sessions:** `agent_memory_index` or sessions table — limit 10, link to chats.
- **Monthly spend:** `spend_ledger` aggregated by month — show USD or internal unit consistently with rest of dashboard.

**Acceptance**

- [ ] All sections degrade gracefully if tables missing columns (try/catch + message).

### Phase 4 — Secret management UX

- **Show/hide** toggle per row; default hidden.
- **Display:** `last4` only + label; copy-to-clipboard only when revealed (optional).
- **Test button:** `POST /api/env/test` (or existing) with selected key id — show pass/fail.
- **Rotation reminders:** badge if `updated_at` or policy older than N days (config constant).

**Security**

- Never log full secrets in browser console.
- Confirm worker never returns plaintext for production keys in GET (audit response shapes).

### Sprint 2 testing matrix

- [ ] Cold load / slow network (throttle): no duplicate writes.
- [ ] Permission denied: user not admin → tabs hidden or 403 handled.
- [ ] Large lists: webhooks + tools paginate or virtualize if >50 rows.

### Definition of done (Sprint 2)

From the dashboard, an operator can **inspect** env keys (masked), **webhook endpoints**, **deploy history**, and **tool registry** without opening D1 console — and **Agents** reflects live `agent_configs`.

---

## Sprint 3 — Agent Sam UI polish

**Scope:** `AgentDashboard.jsx`, related CSS, assets; **not** `FloatingPreviewPanel.jsx` except Sprint 1 terminal fix (surgical).

### 1. Chat input bar — “docked” feel

Brief used `rgba(0,0,0,0.40)` and border rgba — **implement with CSS variables** (e.g. `--input-dock-bg`, `--input-dock-border`) defined in theme (D1 Solarized Dark or static theme file).

**Acceptance:** Contrast passes WCAG for placeholder + text against dock background.

### 2. Icon strip

- Hover / active / tooltip for each icon.
- **Terminal icon:** disabled + greyed until **Sprint 1** verified; then re-enable in same PR or follow-up.

### 3. Panel tab bar — multiple panels

Support **browser + editor** (or equivalent) **open simultaneously** — tab model or split; define z-order and focus.

**Acceptance:** Switching tabs does not lose unsaved editor buffer (if applicable).

### 4. Welcome cards

- Lucide icons on all six cards; hover states (lift, border, or bg token).
- No emoji; icons only.

### 5. Cache bust

- After Vite build + R2 upload of `agent-dashboard.js` / `.css` and `dashboard/agent.html`: bump **`?v=122` → `?v=123`** in `agent.html` per deploy playbook.

**Deploy order:** build → upload static assets to R2 → upload `agent.html` → worker deploy if routes change (often not needed for static only).

---

## Backlog (soon, not tomorrow)

- Stripe smoke (test mode).
- Resend + Supabase webhook smoke.
- `CLOUDFLARE_IMAGES_API_TOKEN` vs `CLOUDFLARE_IMAGES_TOKEN` audit.
- `GOOGLE_CLIENT_SECRET` vs `GOOGLE_OAUTH_CLIENT_SECRET` audit.
- CF Access client id install.
- Cursor hook → `continual-learning-stop.ts` (or repo equivalent).
- Meet page: Cloudflare Calls + TURN.
- GitHub `workflow_run` → verify `cicd_runs` on real push.
- CICD `client_id` migration (legacy → proper `client_` format).
- `wrangler.production.toml` warnings: `esbuild` / `ai_search` unexpected fields — clean up when safe.

---

## End-of-day checklist (tomorrow night)

- [ ] Sprint 1: terminal session persistence verified (manual script above).
- [ ] Sprint 2: Settings nav + 5 data tabs + Cursor tab MVP + masked secrets.
- [ ] Sprint 3: dock input bar, icons, multi-panel, welcome cards, `v=123` if shipped.
- [ ] `docs/cursor-session-log.md` entry: files, line ranges, deploy/R2, version id.
- [ ] Optional: screenshot before/after for agent page if theme tokens shifted.

---

## Risk register

| Risk | Mitigation |
|------|------------|
| FloatingPreviewPanel change breaks layout | Surgical diff only; screenshot before edit. |
| Settings writes hammer D1 | Debounce; batch where possible. |
| Secret leakage in API responses | Audit worker JSON; red-team with network tab. |
| Theme tokens missing for “dock” | Add to Solarized / CSS root once, reuse everywhere. |

---

## Milestone narrative

**Settings is the unlock:** once Sprint 2 lands, webhook endpoints, env visibility, agent config, and tool registry become **operator-first**. That reduces D1 and wrangler as daily tools and matches the Cursor-style “everything in one surface” expectation — with tonight’s worker + D1 foundation already in place.
