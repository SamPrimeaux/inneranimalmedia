# Agent Dashboard: Side Drawer, Footer, Send-In-Input, Monaco & File Viewer

**Purpose:** Single plan for footer-at-bottom, Cursor-style send button, moving Files/Search/Monaco into the flexfit side drawer. Stored in repo so you can push to remote and resume after any chat interruption.

**Where this lives:** `docs/plans/AGENT_SIDEDRAWER_FOOTER_MONACO_PLAN.md` (this file). Commit and push to your remote so it is the source of truth.

**Also stored in R2:** For reliability and so other agents can load it, this plan is uploaded to the **agent-sam** R2 bucket at key `memory/plans/AGENT_SIDEDRAWER_FOOTER_MONACO_PLAN.md`. Fetch via worker route (if exposed) or re-upload with: `./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/memory/plans/AGENT_SIDEDRAWER_FOOTER_MONACO_PLAN.md --file=docs/plans/AGENT_SIDEDRAWER_FOOTER_MONACO_PLAN.md --content-type=text/markdown --remote -c wrangler.production.toml`

**How to resume:** Open this file, find the next unchecked `[ ]` under "Execution order", implement that step, check it off, then continue. When all are done, run build + R2 upload + deploy per "Deploy steps" below.

---

## Goals (simple English)

1. **Footer at bottom** — Page footer returns to the bottom of the viewport (sticky/fixed or flex layout so main content fills, footer stays at bottom).
2. **R2 file viewer** — Use existing R2 access (Cloud page works) to show a real file browser in the **side drawer**, not in the main chat area.
3. **Send arrow inside chat input** — Move the send (arrow) button **inside** the chat text area, Cursor-style (e.g. bottom-right inside the input).
4. **Monaco/code editor in build** — Integrate Monaco into the app; show it in the **side drawer** for reviewing code, browsing files, and previewing Playwright/test output.
5. **No placeholders under chat** — Do **not** show "Files panel coming soon" or "Search coming soon" in the main chat column. When user clicks Files or Search, open the **side drawer** and show Files or Search (or Code) there. Chat area = chat only.

---

## Execution order

Do in this order so layout and behavior stay consistent.

- [x] **Step 1 — Plan doc (this file)** — Written and committed. Optional: push to remote.
- [x] **Step 2 — Footer at bottom** — In `AgentDashboard.jsx`, ensure root layout is a flex column (already is). Add a footer bar (e.g. "Agent Sam • [provider]" or minimal branding) as the last child of the root, with `flexShrink: 0`, so it sticks to the bottom. Ensure the main content wrapper (chat pane + drawer) has `flex: 1; minHeight: 0` so it fills space and the footer stays at bottom. File: `agent-dashboard/src/AgentDashboard.jsx`.
- [x] **Step 3 — Send arrow inside input** — In `AgentDashboard.jsx`, wrap the chat textarea in a container with `position: "relative"`. Put the send button inside that container, positioned bottom-right (e.g. `position: "absolute", right: 8, bottom: 8`), with padding on the textarea so text doesn’t go under the button. Style to match Cursor (arrow icon inside input). Same file.
- [x] **Step 4 — Remove placeholders from main area; Files/Search open drawer** — In `AgentDashboard.jsx`: Remove or never show the "Files panel coming soon" and "Search coming soon" blocks in the main chat column. When user clicks the **Files** icon in the icon bar: set `floatingPreviewOpen = true`, `floatingPreviewTab = "files"` (new tab). When user clicks **Search**: set `floatingPreviewOpen = true`, `floatingPreviewTab = "search"` (or "code" if Search is merged into Code tab). So the main area only shows chat (and welcome) when in chat mode; no placeholder panels below chat. Files: `AgentDashboard.jsx` (icon bar onClick handlers, remove `mode === "files"` and `mode === "search"` content from main column).
- [x] **Step 5 — Add "Files" and "Code" tabs to side drawer** — In `FloatingPreviewPanel.jsx`: Extend `TAB_LABELS` and tab list to include `files` and `code`. Add state/content for: **Files tab** = R2 file viewer (list buckets/keys, navigate, optional read file); **Code tab** = Monaco editor (read-only or editable, for viewing code and Playwright output). Pass new tab names from `AgentDashboard.jsx` (e.g. `floatingPreviewTab` can be `"preview" | "browser" | "terminal" | "files" | "code"`). Files: `agent-dashboard/src/FloatingPreviewPanel.jsx`, `agent-dashboard/src/AgentDashboard.jsx`.
- [x] **Step 6 — R2 file viewer in drawer** — Implement the Files tab content: call worker API that lists R2 objects (e.g. `/api/r2/list` or reuse Cloud page API). Show a simple tree or list (bucket → prefix → keys). Optional: fetch and show file content in Code tab or in a preview under the list. Worker may already expose R2 list/get; if not, add a small endpoint using existing R2 bindings. Files: `worker.js` (API), `FloatingPreviewPanel.jsx` (Files tab UI).
- [x] **Step 7 — Monaco in drawer** — Add `@monaco-editor/react` (or `monaco-editor`) to `agent-dashboard`. In the Code tab, render Monaco with a default empty or welcome state; when user picks a file from the Files tab (or agent sets content), set Monaco value. Optionally allow "Preview" to show Playwright report HTML in the Preview tab. Files: `agent-dashboard/package.json`, `FloatingPreviewPanel.jsx` (Code tab), possibly `AgentDashboard.jsx` for passing code/content into the panel.

---

## Key file paths

| Path | Purpose |
|------|--------|
| `agent-dashboard/src/AgentDashboard.jsx` | Root layout, footer, chat input (send inside), icon bar (Files/Search open drawer), `floatingPreviewTab` state |
| `agent-dashboard/src/FloatingPreviewPanel.jsx` | Tabs: Preview, Browser, Terminal, **Files**, **Code**; R2 list UI; Monaco |
| `agent-dashboard/src/index.css` | Styles for footer, input-with-send-inside |
| `agent-dashboard/package.json` | Dependency: `@monaco-editor/react` (or `monaco-editor`) |
| `worker.js` | Optional: R2 list/get API for file viewer (if not already present) |
| `dashboard/agent.html` | Shell; footer/mobile-footer visibility if needed |

---

## Deploy steps (after implementation)

1. From repo root: `cd agent-dashboard && npm run build`
2. Upload dashboard assets to R2 (agent-sam): run `./scripts/with-cloudflare-env.sh npx wrangler r2 object put ...` for each of `agent-dashboard.js`, `agent-dashboard.css`, and `dashboard/agent.html` per project rules (see `.cursor/rules/dashboard-r2-before-deploy.mdc`).
3. Deploy worker: `npm run deploy` (never raw `wrangler deploy`).
4. Record deploy in D1 if required: `TRIGGERED_BY=agent DEPLOYMENT_NOTES='...' npm run deploy`.

---

## If the chat was interrupted

1. Open `docs/plans/AGENT_SIDEDRAWER_FOOTER_MONACO_PLAN.md`.
2. Find the first `[ ]` under "Execution order" and do that step.
3. Check it off with `[x]`.
4. Continue until all steps are done, then run the deploy steps above.
5. No work is "only in chat" — this file is the contract.

---

## Notes

- **R2:** Cloud page already works; reuse the same R2 bindings/credentials for the file viewer in the drawer.
- **Monaco:** Prefer integration in the existing app (side drawer) rather than a new page; no refactor of the whole dashboard.
- **Placeholders:** "Files panel coming soon" and "Search coming soon" must not appear in the main chat column; they are replaced by opening the drawer and showing Files/Code (and optionally Search) there.

---

## Phase 2 — After full deploy (next priorities)

Do these **after** Steps 1–7 are done and the dashboard is fully deployed and validated.

### A. Agent plans / internal queues (complex tasks like Cursor)

- [ ] **A1 — Plan/queue data model** — Agent Sam breaks user requests into multi-step plans. Store in D1 (e.g. `agent_plans`: id, session_id, title, steps JSON, current_step, status) or in session state; stream "plan" messages to UI.
- [ ] **A2 — Plan UI in chat** — Render plan in chat (numbered steps, checkboxes, current step). Allow "Run next step" or auto-advance. File: `AgentDashboard.jsx` message renderer.
- [ ] **A3 — Worker/API for plan execution** — Backend accepts plan with steps; executes one step at a time; returns step result. Extend chat or add `/api/agent/plan`. Files: `worker.js`, optional D1.
- [ ] **A4 — Internal queue** — Queue of pending steps; agent adds from user message or plan; processes and reports progress in chat.

### B. Agent preview work → click to open in side drawer / Monaco

- [ ] **B1 — "Open in Code" / "Preview" on agent output** — For assistant code blocks or generated content, add button "Open in Code" or "Preview". On click: open drawer, set tab to Code (or Preview), set Monaco/preview content to that block. File: `AgentDashboard.jsx` (code-block renderer), state for drawer + content.
- [ ] **B2 — Pass code/content into FloatingPreviewPanel** — Drawer accepts props for initial code/preview HTML so chat can inject content when user clicks. Files: `AgentDashboard.jsx`, `FloatingPreviewPanel.jsx`.
- [ ] **B3 — Monaco in Code tab** — After Step 7, ensure Code tab receives and displays content set from chat (Monaco model value from clicked block).

### C. R2 store / deploy and validation

- [x] **C1 — R2 upload** — Dashboard build + agent.html (and any new assets) uploaded to R2 (agent-sam) before deploy. Use `./scripts/with-cloudflare-env.sh` and project rules.
- [x] **C2 — Deploy + record**
- [ ] **C3 — Validation checklist**

**Phase 2 order (after Phase 1 deploy):** Finish Step 6–7 → deploy & validate (C1–C3) → B1–B3 (clickable preview in drawer/Monaco) → A1–A4 (plans/queues) → deploy & validate again.
