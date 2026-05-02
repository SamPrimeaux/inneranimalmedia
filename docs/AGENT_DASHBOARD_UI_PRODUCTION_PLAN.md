# Agent Dashboard UI — Production-Ready Plan

Use this plan if connection is lost. Execute in order; then run `./agent-dashboard/deploy-to-r2.sh` (with `CLOUDFLARE_API_TOKEN`) and `npm run deploy`.

---

## 1. Shell / Layout (agent.html + AgentDashboard.jsx)

- [x] Remove gap: `.main-content.agent-page-main` padding 0, flush with header/sidenav
- [x] Icon bar: file, search, branch, extensions (replace text mode strip)
- [x] Workflow tabs: Ask, Agent, Plan, Debug
- [x] Welcome state: 6 commands + company icon (Cursor-style)
- [x] Center-aligned chat (max-width 720px), loading dry-humor sayings
- [x] Circular context + $ gauges, image/globe icons, arrow/stop send, Auto + model picker
- [x] **Close model picker on click outside** (useEffect + document click listener)
- [x] **Stop button**: abort in-flight fetch (AbortController), show stop icon while loading, call `controller.abort()` on click

---

## 2. Chat Input Row (AgentDashboard.jsx) — Cursor-style

- [x] **Left-aligned**: "Agent" popup selector (list of agents), then Auto toggle, then model picker when !auto
- [x] **Right-aligned**: context gauge, $ gauge, image attach, globe (open preview), send/stop
- [x] Placeholder "Ask Agent Sam..."
- [x] Auto toggle + model picker popup when Auto off; agent picker closes on outside click + Escape
- [x] **Image attach**: hidden file input, image icon triggers it; up to 3 images; chips shown with remove
- [ ] **Queue message**: optional "Queue" or "Add context" (deferred for later)
- [x] **Accessibility**: aria-labels on icon buttons; model/agent picker aria-expanded/aria-haspopup/role listbox

---

## 3. Responsive / Polish

- [ ] **Mobile**: icon bar and input row wrap or collapse; workflow tabs scroll horizontal if needed
- [ ] **Focus trap**: when model picker open, focus first model; Escape closes picker
- [x] **Spend gauge**: cap fill at 100% (spendPct = min(100, total_cost/100) so $100 = full circle)

---

## 4. Agent Sam Branding / Backend

- [x] Worker: Agent Sam system prompt for all providers (anthropic, openai, google, workers_ai)
- [ ] **Optional**: first boot message in UI says "Agent Sam. D1 connected. Pick a workflow or type below." (already in welcome; ensure no other "Cursor" or "Claude" in default copy)

---

## 5. Preview Pane & Drag (AgentDashboard.jsx)

- [x] **Default empty**: `previewOpen: false`, `previewUrl: ""` — no website preloaded; preview/code used only when user needs it
- [x] **Right panel**: empty state copy when no URL/code; when content exists, header has **Preview** and **Code** icons to switch view (preview = iframe, code = editor content)
- [x] **Drag handle**: 12px hit area, `user-select: none` and `cursor: col-resize` on body during drag so resizing isn’t sticky

## 6. Shell Footer (agent.html)

- [x] **Broken footer hidden on agent page**: `body.agent-dashboard-page #agent-footer-chat` and `.dashboard-mobile-footer` set to `display: none !important`; `body.agent-dashboard-page { padding-bottom: 0 }`; script adds class `agent-dashboard-page` on load

## 7. Production Checklist Before R2 Upload

- [x] No console errors in build (`npm run build` in agent-dashboard)
- [x] agent.html references `agent-dashboard.js?v=5` and `agent-dashboard.css?v=5`
- [ ] Run `./agent-dashboard/deploy-to-r2.sh` with `CLOUDFLARE_API_TOKEN` set (if R2 returns 400, confirm token has R2 Object Write and correct account)
- [ ] Run `npm run deploy` for worker (Agent Sam system prompt already in place)
- [ ] Hard refresh `/dashboard/agent` and test: welcome, send, stop, Agent/Auto/model pickers, image attach, gauges, preview pane empty by default, drag resize, Preview/Code icons when content exists

---

## 8. Files to Touch

| File | Changes |
|------|--------|
| `dashboard/agent.html` | Flush main-content; hide footer on agent page (CSS + class); cache v=5 |
| `agent-dashboard/src/AgentDashboard.jsx` | Agent popup + Auto/model left; gauges/icons right; default preview closed/empty; Preview/Code icons in panel header; drag handle 12px + body userSelect/cursor during drag |
| `agent-dashboard/src/index.css` | Optional: shared styles for focus/accessibility |
| `worker.js` | Agent Sam system prompt |

---

## 9. If Resuming Mid-Plan

1. Open `docs/AGENT_DASHBOARD_UI_PRODUCTION_PLAN.md`
2. Find next unchecked `[ ]` in sections 1–7
3. Implement that item, then check it off in this file
4. Continue until all done, then run deploy steps in section 7

---

## 10. After Deployment — Remote Build Reliability

- **Source of truth**: Use DB tables (e.g. `cloudflare_deployments`, `projects.metadata_json`) to record last deployment timestamp, branch, commit, and worker/R2 paths so support can quickly see which build is live and which repo/commit it came from.
- **If R2 upload returns 400**: Ensure `CLOUDFLARE_API_TOKEN` has **Account** → **R2 Object Read & Write** (or edit template with R2 Write). Run from repo root: `./agent-dashboard/deploy-to-r2.sh` then `npm run deploy`.
- **Customer issues**: 1) Check deployment record in DB for live build. 2) Connect to same repo/branch/commit. 3) Reproduce with same env (dashboard URL, agent boot). 4) No need to dig through local files if deployment metadata is stored and queryable.
