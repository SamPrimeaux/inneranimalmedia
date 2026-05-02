# plan_iam_dashboard_v2 — IAM dashboard MPA, DB-first, full functionality

**Status:** planning  
**Supersedes nothing yet:** `plan_iam_dashboard_v1` remains the historical roadmap; v2 is the **next-generation shell + settings IA + theme system** track. Add companion rows in `roadmap_plans` / `roadmap_steps` when Sam approves the SQL appendix.

**Non-negotiables**

1. **Full functionality** — No mock data in production paths. Every toggle, icon button, menu item, and popup must either perform a **real mutation/read** or be **absent** until wired.
2. **DB first** — Schema + migrations + worker APIs + seed/repair scripts **before** UI polish. Any screen that lists data must read **D1 (or authoritative KV/R2 where already canonical)**.
3. **Live adjustability** — Developers change rows in D1 (or hit PATCH endpoints) and the UI updates on refresh or via existing realtime hooks; no rebuild required for data fixes.
4. **Three shell themes** — **Kimbie Dark**, **Solarized Dark**, **Solarized Light** — all via **`[data-theme="…"]` + CSS variables** (see `docs/theme-presets/iam-v2-kimbie-solarized.css`); no hex in JSX outside theme definitions (`docs/theme-logic.md`).
5. **MPA, scale-ready** — Multi-page application: discrete routes (HTML pages or route entries), shared shell partial, lazy-loaded chunks where needed. No monolithic “one bundle owns everything” unless measured and justified.

---

## 1. Relationship to v1 and current stack

- **v1** (`plan_iam_dashboard_v1`): delivered and tracks broad IAM dashboard work (auth, MCP, webhooks, agent dashboard, etc.).
- **v2**: focuses on **IDE-grade shell parity** (Agents rail, composer, 15 settings views), **operational honesty** (every control wired), and **data-driven UI** so Sam can tune behavior from D1 without redeploying for content changes.

Existing theme infrastructure (see `docs/THEME_SYSTEM_AUDIT.md`, `docs/theme-logic.md`):

- Themes are **`cms_themes`** rows with **slug** stored in **`user_settings.theme`**.
- **Action for v2:** add two slugs, e.g. `solarized-dark` and `solarized-light`, with **`config` JSON** containing the full variable map for shell + settings surfaces. Align with **GET/PATCH `/api/settings/theme`** and gallery loading from **GET `/api/themes`**.

---

## 2. Color themes (design contract)

### 2.1 Solarized Dark

- Canvas: base03 family; surfaces: base02; text: base0 / base1; muted: base01; accents: Solarized accent set (blue primary actions, green toggle ON, cyan secondary emphasis).
- Composer: docked bar, distinct **input well** one step above canvas.

### 2.2 Solarized Light

- Canvas: base3; surfaces: base2; primary text: base00 / base01; muted: base1; same accent hues as Dark for **predictable** state colors (success/danger/link).

**Canonical CSS file (v2 trio: Kimbie Dark + Solarized Dark + Solarized Light):**  
`docs/theme-presets/iam-v2-kimbie-solarized.css` — includes **popover / command-palette** tokens (`--popover-*`) for Cursor-like dropdowns.

**Proposed D1 seed (run only after approval):**  
`scripts/d1-insert-themes-kimbie-solarized-proposal.sql`

### 2.3 Implementation rules

- Single **`themes/solarized-*.css`** (or injected from `cms_themes.config`) defining only:

  ```text
  [data-theme="solarized-dark"] { --color-bg-canvas: ...; ... }
  [data-theme="solarized-light"] { --color-bg-canvas: ...; ... }
  ```

- Components consume **`var(--color-*)`** only.
- **Contrast:** verify focus rings and `Review` / warning chips in **both** themes (WCAG AA where feasible for text).

---

## 3. Architecture (MPA + shell)

### 3.1 Route map (15 settings views + shell)

| Route / page | Purpose |
|--------------|---------|
| `/dashboard/.../settings` or SPA hash `#/settings/general` | Resolve per stack; MPA prefers **one HTML per top-level section** or **one shell + client router** if already standard. |
| **General** | Account links, layout sync, notifications, privacy toggles backed by `user_settings` / policy rows. |
| **Plan & Usage** | Quotas, meters — read spend/usage tables or worker aggregations; **no fake percentages**. |
| **Agents** | Auto-run policy, command allowlist, MCP allowlist, fetch domains, protections — **all rows in D1** (see schema appendix). |
| **Tab** | Product Tab/completion settings — same pattern. |
| **Models** | Enabled models, API key **presence** flags (never echo secrets); provider config references. |
| **Cloud Agents** | Remote agent flags; org policy. |
| **Plugins** | Installed plugins list from DB or registered manifest table. |
| **Rules, Skills, Subagents** | Lists + toggles; source of truth = files **or** DB pointers (pick one; recommend DB index rows with R2/git hash). |
| **Tools & MCP** | Server list, enable/disable, tool counts from live registration or cached counts updated by worker. |
| **Hooks** | `hook_executions` / configured hooks — already partially in stack; unify read UI. |
| **Indexing & Docs** | Index job status from worker or D1 job table; docs URLs per tenant. |
| **Network** | HTTP mode, diagnostics — env-backed + read-only display where appropriate. |
| **Beta** | Feature flags table. |
| **Marketplace / Integrations** | Your catalog only; each tile is a **real** installable id or hidden. |
| **Docs** | Static links + optional `docs` table. |

**Shared layout components**

- **Activity bar** (optional collapse)
- **Agents rail** (search, new agent, pinned, history — backed by **conversations / agent_sessions** or equivalent)
- **Main column** (document or settings inner layout)
- **Settings inner nav** (fixed width ~200–240px) + **scrollable content** (`flex: 1`, `overflow-y: auto`)
- **Composer** (dock bottom): Agent/Auto, attachments, Undo/Keep/Review only when **pending patch state** exists
- **Status bar**: branch/user/problems — real diagnostics API or WS

### 3.2 UI state matrix (must be implemented, not mocked)

| Control | States | Data source |
|---------|--------|-------------|
| Toggle | on / off / disabled / loading / error revert | PATCH setting key; optimistic UI with rollback |
| Primary button | default / hover / active / disabled / loading | same |
| Icon button | tooltip + **single** action; if no action, **remove** | — |
| Popup / modal | open only when trigger succeeded; ESC + focus trap | — |
| Tag allowlist | add removes row; × calls DELETE | D1 join table or JSON in row with validation |
| Tables | sort, page, empty state, error state | TanStack Table or native `<table>` + server pagination |
| Theme switch | instant preview + PATCH theme slug | `user_settings.theme` + `cms_themes` |

---

## 4. Execution phases (DB first)

### Phase 0 — Schema and API contract (before UI approval)

**Goal:** Any UI field maps to a column or key; Postman/curl can set the same value the UI will set.

Deliverables:

1. **Migration file(s)** under `migrations/` (or agreed folder) — **do not apply until Sam approves** (per D1 rules).
2. **Worker routes:** consistent JSON shapes, auth, validation, idempotent PATCH.
3. **Seed script:** minimal rows so a fresh environment is **non-empty** but **real** (not lorem — use system defaults).
4. **Repair script:** SQL to fix bad enums (e.g. theme slug typos) aligned with `docs/THEME_SYSTEM_AUDIT.md`.

Suggested tables (appendix A — adjust names to match existing schema):

- **`user_agent_policy`** (or extend `user_settings` with JSON): `auto_run_mode`, booleans for protections, `default_agent_location`, etc.
- **`user_command_allowlist`** (`user_id`, `command`, `created_at`) — unique `(user_id, command)`.
- **`user_mcp_allowlist`**, **`user_fetch_domain_allowlist`** — same pattern.
- **`feature_flags`** (key, enabled_globally, optional JSON) + **`user_feature_overrides`** if needed.
- **`cms_themes`**: insert `solarized-dark`, `solarized-light` with full `config`.

### Phase 1 — Shell-only HTML/CSS (approval gate)

**Goal:** Visual and motion approval **without** fake data.

- Static shell can use **one** real GET (e.g. current user + theme) so the page is never “empty mock.”
- **Forbidden:** hardcoded rows that look live but are not in DB.
- **Allowed:** loading skeletons driven by `fetch` state (clearly not pretending to be final data).

### Phase 2 — Wire 15 views (priority order)

1. **General** + **theme** (validates end-to-end persistence).
2. **Agents** (highest complexity).
3. **Tools & MCP** + **Indexing** (operational visibility).
4. **Plan & Usage**, **Models**.
5. Remaining pages.

### Phase 3 — Hardening

- E2E: toggle → DB row → reload → same state.
- Permission tests: unauthorized PATCH returns 403.
- Performance: pagination on large tables; indexes on `user_id`, foreign keys.

---

## 5. Team communication (short brief)

**What we are building:** An IAM dashboard that **looks and behaves** like a serious IDE settings surface (Cursor-class IA), **our** branding, **our** backend.

**How we work:** Database and APIs land first. The UI is a **thin, honest** layer: if the API is not ready, the control **does not ship**. Icons and popups are **binary**: fully wired or removed.

**Why MPA:** Matches existing `dashboard/*.html` delivery, simpler caching on R2, and **independent** failure domains per page. Shared CSS/JS via versioned static assets.

**Themes:** Two Solarized variants for reduced eye strain and clear state colors (green ON, blue focus, red destructive).

**Cost control:** After shell sign-off, most iteration is **SQL + small worker patches**, not full UI rebuilds.

---

## 6. Claude / HTML verification pass (optional precursor)

Before React/Vite heavy work, a **static** `settings-shell-preview.html` may be generated **only** if:

- It uses the **same** `[data-theme]` tokens as production CSS files; and
- It does **not** replace Phase 1; it is a **pixel/layout** check only.

---

## 7. Viewers (Monaco / markup / plaintext), browser parity, trust

**Goal:** Cursor-class workflow in the web app: **compact agent UI**, **click file → open real editor**, **see / edit / save / deploy** on real endpoints; **browser** that is not artificially blocked for normal work; **explicit trust** for risky origins and certificates.

**Current baseline (do not rewrite without approval):** `agent-dashboard/src/FloatingPreviewPanel.jsx` already provides **Monaco** (language from extension, diff flow), **HTML `srcDoc` + sandboxed iframes**, **R2 file preview** (images, html iframe, pdf iframe), **Browser tab** (URL bar + live iframe + screenshot hook), and links into the browser tab from files. Some preview fallbacks still use **hardcoded dark fills**; v2 should migrate those to **`var(--bg-canvas)`** (surgical edits only, line-level approval per repo rules).

### 7.1 Viewer routing matrix (full functionality)

| Input | Primary surface | Actions (each must hit a real API or be omitted) |
|-------|-----------------|--------------------------------------------------|
| Code (`js`, `ts`, `jsx`, `py`, `sql`, …) | **Monaco** | Open, edit, **Save** → worker/R2/git per existing routes; **Diff** from agent proposal → Accept/Reject |
| **Markdown** | **Split: rendered (sanitized)** + **raw** tab | Render via safe pipeline (no raw HTML injection unless trusted mode) |
| **Plain text** | Monaco or readonly `<pre>` for huge files | Same save path as code |
| **HTML** | **Sandbox iframe** (`srcDoc` or signed URL) | Edit source tab + refresh preview |
| **Images / video / audio / pdf** | Native `<img>` / `<video>` / iframe pdf | Download, open external |
| **Binary** | Hex preview or “open externally” | No fake viewer |

### 7.2 “Clean UI” — minimized chrome, expand on demand

- **Agent transcript:** file references as **dense chips** (path + `+/-` stats); **one click** opens the **Editor / Preview** column (same as Cursor’s Review flow).
- **Editor column:** tabs for **Code | Preview | Browser | …**; **dirty indicator**; **Save** enabled only when content changed and path writable.
- **Deploy:** single **Deploy** or **Promote** control wired to existing **R2 + worker + record** scripts policy (no button until route exists).

### 7.3 Why the embedded iframe is limited (and what Cursor does differently)

In a **normal web dashboard**, `<iframe src="https://third-party">` hits:

- **`X-Frame-Options` / `frame-ancestors` (CSP)** — most banks, Google, GitHub, etc. **refuse** to render in iframes.
- **Cross-site cookies / CHIPS** — logged-in sessions often **do not** follow the iframe.
- **Certificate errors** — the browser shows **interstitial** inside the frame or a blank page; there is **no** programmatic “accept cert” API for arbitrary sites in standard web embeds.
- **Sandbox attributes** — tightening sandbox **increases** security but **reduces** capability (popups, forms, top navigation).

**Cursor’s Simple Browser** runs inside a **desktop shell** (Chromium **BrowserView** / equivalent): it is a **real browser surface**, not a sandboxed child frame of a random origin. That is why you can **log into arbitrary sites** and handle **certs** with normal Chromium UI.

### 7.4 v2 strategy: hybrid “web-honest” + maximum capability

**A — Same-origin and controlled previews (keep improving)**  
Keep **iframe / srcDoc** for **your** HTML, **R2** objects, and **allowlisted** dev/staging hosts (e.g. `*.workers.dev` you control). This stays fast and secure.

**B — “Open without iframe jail” for arbitrary HTTPS**  
When embedding fails or user needs **OAuth / cert / XFO**:

- **Primary:** **`window.open(url)`** (or **“Open in new tab”**) from a **user gesture** — full browser chrome, native cert handling, cookies work.
- **Optional v2+:** **registered protocol handler** or **desktop companion** (Electron/Tauri) that hosts a **BrowserView** and **postMessages** back to the dashboard — only if product commits to a desktop shell.

**C — Reverse proxy through worker (high risk, gated)**  
`https://app.../browse?target=https://example.com` with TLS terminated at worker **can** strip some headers — **only** for **explicitly trusted** targets, with **legal**, **abuse**, and **credential** review. Treat as **Phase 3+**, not default.

**D — Headless / MCP automation (already aligned with “CLI work”)**  
Use **MCP + Playwright** (or worker **`/api/browser/screenshot`** and related tools) for **scripted** fetch, screenshot, and testing — **not** a substitute for interactive login, but **is** the right layer for **automation**.

### 7.5 Trust origin + certificate (product behavior)

**Requirement:** When the user first opens a **non-allowlisted** or **self-signed** host, show an **interstitial** (same pattern as Cursor’s trust / cert warnings in spirit):

- Copy: **origin**, **fingerprint** (if available from fetch/proxy), **risk note**.
- Actions: **Cancel**, **Open in new tab** (recommended for public sites), **Trust for this session** / **Always trust this origin** (writes **D1**).

**Proposed table (Appendix A.4):** `user_browser_trusted_origins`  
`(user_id, origin, cert_fingerprint_sha256 NULLABLE, trust_scope TEXT, created_at, updated_at)` with unique `(user_id, origin)`.

**Important:** In **pure** iframe embedding, the app **cannot** programmatically bypass the browser’s cert interstitial. Trust rows matter when:

- using a **worker proxy** you control, or  
- recording **user intent** before opening **popup** / external browser, or  
- gating **server-side** fetch (MCP) to those hosts.

### 7.6 MCP and “see / edit / save / deploy” traceability

- Every agent-proposed file change should map to: **conversation id**, **path**, **revision** (hash or version), **save target** (R2 key, git ref, worker bundle).
- **Browser automation** results (screenshot URL, HAR summary) stored in **existing telemetry / message attachment** tables where possible — **no orphan blobs** without DB reference.

### 7.7 Implementation note (file protection)

- **`FloatingPreviewPanel.jsx`**: **surgical edits only**; state line numbers and get approval before refactors.
- **`agent.html`**: same.

---

## Appendix A — Proposed SQL (DO NOT RUN until approved)

**A.1 Themes**

```sql
-- Example only: align columns with live cms_themes schema before running.
INSERT INTO cms_themes (id, name, slug, is_system, config)
VALUES
  ('theme-solarized-dark', 'Solarized Dark', 'solarized-dark', 1, '{"vars":{...}}'),
  ('theme-solarized-light', 'Solarized Light', 'solarized-light', 1, '{"vars":{...}}');
```

**A.2 Roadmap registration**

```sql
-- Optional: register v2 plan for session-start queries
INSERT INTO roadmap_plans (id, title, status, created_at)
VALUES ('plan_iam_dashboard_v2', 'IAM Dashboard v2 — MPA shell + DB-first settings', 'active', datetime('now'));
-- Then add roadmap_steps rows for Phase 0–3 with order_index.
```

**A.3 Allowlist tables** — sketch; normalize to existing `user_id` type and RLS patterns in worker.

**A.4 Browser trust (v2 viewers / popup / proxy gating)**

```sql
-- PROPOSAL: adjust types/names to match production conventions.
CREATE TABLE IF NOT EXISTS user_browser_trusted_origins (
  user_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  cert_fingerprint_sha256 TEXT,
  trust_scope TEXT DEFAULT 'session',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, origin)
);
```

---

## Appendix B — Definition of Done (per page)

- [ ] All controls bound to API or removed.
- [ ] Empty and error states explicit.
- [ ] Theme switcher applies Solarized Dark/Light with no flash (early `data-theme` script).
- [ ] No console errors on happy path.
- [ ] D1 row documented for each persisted field in this README or `docs/memory/`.

---

## Appendix C — References

- `docs/plans/TOMORROW_2026-03-23_UI_SETTINGS_TERMINAL_PLAN.md` — terminal + Settings sprint context.
- `docs/THEME_SYSTEM_AUDIT.md` — theme slug rules.
- `docs/theme-logic.md` — `data-theme` + localStorage + API flow.
- `docs/memory/D1_CANONICAL_AGENT_KEYS.md` — agent memory keys discipline.
- `agent-dashboard/src/FloatingPreviewPanel.jsx` — Monaco, preview iframes, browser tab (baseline for v2 viewer work).
- `scripts/overnight.js` — `/api/browser/screenshot` usage pattern.
