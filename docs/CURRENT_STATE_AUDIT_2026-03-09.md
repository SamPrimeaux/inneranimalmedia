# Current State Audit & Planning Overview

**Generated:** 2026-03-09 (post-deploy)  
**Purpose:** True current state snapshot to plan next pages/functions to fix or build.

---

## 1. Deploy Summary (This Session)

| Step | Status | Details |
|------|--------|---------|
| Agent dashboard build | ✅ | `agent-dashboard/dist/` — agent-dashboard.js, agent-dashboard.css, xterm chunks, agent-dashboard2.css |
| R2 upload (agent-sam) | ✅ | `static/dashboard/agent/*` (JS/CSS/chunks), `static/dashboard/agent.html`, `chats.html`, `cloud.html` |
| Worker deploy | ✅ | inneranimalmedia (wrangler.production.toml), Version ID: 86ef07dc-b8b7-42c5-9709-6b04ae431967 |
| D1 deploy record | ✅ | deployment_id=BB2B7DC4-A0FA-43F4-B10C-340252DC6F82, deploy_time_seconds=59, triggered_by=agent |
| Plan in R2 | ✅ | agent-sam/memory/plans/AGENT_SIDEDRAWER_FOOTER_MONACO_PLAN.md |

**Live URLs:**  
- Worker: https://inneranimalmedia.meauxbility.workers.dev  
- Dashboard: https://inneranimalmedia.com/dashboard (→ overview)  
- Agent: https://inneranimalmedia.com/dashboard/agent  

---

## 2. D1 State (Remote)

### agent_memory_index

- **active_priorities:** Last deploy 2026-03-03; migration 118/119; daily digest live; TOP 3 NEXT: (1) Confirm ai_compiled_context_cache on repeated messages, (2) Wire MCP tool invocation during chat turns, (3) Build /progress page from roadmap_steps.
- **build_progress:** Platform ~47% (10/21 steps). COMPLETED: auth, terminal, agent chat, AI providers, commands, pickers, overview, daily digest, MCP (19 tools), Playwright browser. IN PROGRESS: R2 UI panel (~80%), memory write pipeline, cost tracking, progress UI. NOT STARTED: exit codes, CI/CD, Vertex, client dashboard, billing, SaaS.

### roadmap_steps (plan_iam_dashboard_v1)

| Status | Count | Step IDs (examples) |
|--------|-------|---------------------|
| completed | 14 | step_auth, step_terminal, step_agent_chat, step_providers, step_commands, step_pickers, step_r2_api, step_overview, step_playwright, step_mcp_invoke, step_daily_digest, step_terminal_stability, step_theme_all_pages, step_gemini_wire |
| in_progress | 4 | step_r2_ui, step_memory_retrieval, step_cost_tracking, step_progress_ui |
| not_started | 8 | step_exit_codes, step_cicd_completion, step_vertex, step_client_dashboard, step_billing, step_saas, step_user_settings_theme, step_time_documentation |
| blocked | 1 | step_gcp_vertex |

---

## 3. Dashboard Pages: Repo vs R2 vs Overnight List

**EVERY_PAGE (overnight.js before/after screenshots):**  
overview, finance, chats, mcp, cloud, time-tracking, agent, billing, clients, tools, calendar, images, draw, meet, kanban, cms, mail, pipelines, onboarding, user-settings, settings

**HTML in repo (dashboard/ or static/dashboard/):**

| Segment | Repo path | Uploaded to R2 (this run) | Served at |
|---------|-----------|---------------------------|-----------|
| agent | dashboard/agent.html | ✅ static/dashboard/agent.html | /dashboard/agent |
| chats | dashboard/chats.html | ✅ static/dashboard/chats.html | /dashboard/chats |
| cloud | dashboard/cloud.html | ✅ static/dashboard/cloud.html | /dashboard/cloud |
| overview | dashboard/overview.html | ❌ (not in this batch) | /dashboard/overview |
| finance | dashboard/finance.html | ❌ | /dashboard/finance |
| time-tracking | dashboard/time-tracking.html | ❌ | /dashboard/time-tracking |
| mcp | dashboard/mcp.html | ❌ | /dashboard/mcp |
| draw | static/dashboard/draw.html | ❌ | /dashboard/draw (or /static/dashboard/draw.html) |

**Gap:** overview, finance, time-tracking, mcp, draw are in repo but were not re-uploaded this session; if they were previously uploaded they may be stale. For any change under dashboard/, project rules require uploading that file to R2 before deploy.

**Pages in EVERY_PAGE with no HTML in repo (or only shell):**  
billing, clients, tools, calendar, images, meet, kanban, cms, mail, pipelines, onboarding, user-settings, settings — may be shell-only or redirects; need verification per URL.

---

## 4. Worker API Surface (Relevant Routes)

| Path / prefix | Method | Purpose |
|---------------|--------|---------|
| /api/health | GET | Worker + bindings check |
| /api/browser/* | GET | Playwright: screenshot, health, metrics (MYBROWSER) |
| /api/playwright/screenshot | POST | Create screenshot job; sync Playwright or queue |
| /api/playwright/jobs/:id | GET | Job status + result_url |
| /api/agent/* | GET/POST | Boot, terminal WS/run/complete, chat, models, sessions, playwright, MCP, telemetry, RAG, today-todo, context bootstrap |
| /api/overview/* | GET | Stats, recent-activity, checkpoints, activity-strip, deployments |
| /api/finance/* | * | Transactions, summary, ai-spend, etc. |
| /api/r2/* | GET/POST/DELETE | Buckets, list, upload, delete, url, sync, bulk-action |
| /api/commands | GET | Commands + custom_commands (D1) |
| /api/workers | GET | Worker registry |
| /api/themes | GET | cms_themes |
| /api/user/preferences | PATCH | theme_preset |
| /api/auth/login, logout | POST | Auth |
| /api/oauth/google/start|callback | OAuth |
| /api/oauth/github/start|callback | OAuth |
| /api/admin/overnight/validate | POST | Before screenshots + proof email |
| /api/admin/overnight/start | POST | Pipeline start + D1 OVERNIGHT_STATUS |
| /dashboard, /dashboard/* | GET | Redirect or DASHBOARD R2 HTML/static |
| /static/dashboard/* | GET | DASHBOARD R2 (agent bundle, shell, etc.) |

---

## 5. Agent Dashboard (React) — Current State

- **Stack:** Vite, React, AgentDashboard.jsx, FloatingPreviewPanel.jsx, Monaco (Code tab), xterm.js (Terminal).
- **Input bar:** + and mic next to text input; context gauge (e.g. 0/128k) and send button (Agent Sam logo) inside input area; cost popover and image/preview to the right.
- **Side drawer tabs (order):** Preview → Terminal → Browser → Files → Code. Browser (globe) next to Terminal.
- **Files tab:** Bucket selector, “Show all” (recursive list) / “By folder” (prefixes + objects), Folders first then “Files here”; click text file → opens in Code tab.
- **Screenshot:** “Take Screenshot” in + popup uses POST /api/playwright/screenshot (Playwright); fallback GET /api/browser/screenshot if POST fails; job polling GET /api/playwright/jobs/:id. Worker uses @cloudflare/playwright (MYBROWSER).
- **R2:** /api/r2/buckets, /api/r2/list (recursive=0 or 1) used by Files tab; DASHBOARD = agent-sam.

---

## 6. Known Gaps & Suggested Next Work

### High value / quick wins

1. **Progress page (/dashboard/progress or /progress)**  
   - Roadmap and D1 both call out “Build /progress page from roadmap_steps”.  
   - Read roadmap_steps (and optional roadmap_plans) from D1; render steps by status (completed / in_progress / not_started); link to agent or overview.

2. **user-settings — fix apply + remove dead tabs**  
   - roadmap step: step_user_settings_theme (not_started).  
   - Verify theme apply/remove and hide or remove non-functional tabs.

3. **Confirm ai_compiled_context_cache**  
   - active_priorities: “Confirm ai_compiled_context_cache hitting on repeated messages.”  
   - Add a quick test or log in chat path to verify cache hit on repeat.

4. **MCP tool invocation during chat**  
   - active_priorities: “Wire MCP tool invocation during chat turns.”  
   - When agent responds with tool_calls or suggested tool, call /api/mcp/invoke (or equivalent) and surface result in chat.

### In progress (finish or unblock)

5. **R2 Manager UI panel** (step_r2_ui, in_progress)  
   - Cloud page has R2; agent drawer has Files. Either unify or mark “R2 Manager UI” as done and close step.

6. **Memory — AutoRAG retrieval** (step_memory_retrieval, in_progress)  
   - Ensure RAG index + compact endpoints are used from chat and retrieval is visible (e.g. “Sources” or inline).

7. **Cost tracking** (step_cost_tracking, in_progress)  
   - Per-session, per-deploy, per-provider. Use agent_telemetry + spend_ledger; ensure Overview/Finance and agent $ gauge read from same source.

8. **Progress tracking UI** (step_progress_ui, in_progress)  
   - Same as (1); build the page that shows roadmap_steps and optionally deploy history.

### Not started (roadmap)

9. **Terminal — exit code display** (step_exit_codes)  
   - Show exit code inline in terminal output or in a small status row.

10. **CI/CD completion** (step_cicd_completion)  
    - Completion wiring for runs triggered from agent/terminal.

11. **Time documentation** (step_time_documentation)  
    - Fix timer (stops, user-aware, validity) for time-tracking dashboard.

12. **Billing — Stripe + invoicing** (step_billing)  
13. **Client dashboard** (step_client_dashboard)  
14. **SaaS multi-tenant** (step_saas)  
15. **Vertex AI / GCP** (step_vertex, step_gcp_vertex — one blocked)  
    - JWT exchange and service account key.

### Dashboard pages to fix or add

- **billing, clients, tools, calendar, images, meet, kanban, cms, mail, pipelines, onboarding, settings**  
  - Confirm each URL resolves (shell or full page) and either add minimal content or document as “shell only” and prioritize from roadmap.

- **Upload all changed dashboard HTML to R2 before future deploys**  
  - Per .cursor/rules/dashboard-r2-before-deploy.mdc: for any file under dashboard/ that is served from R2, upload to agent-sam at static/dashboard/<filename> with --remote before running deploy.

---

## 7. Canonical Tables & Docs

- **Metrics/cost:** agent_telemetry (tokens), spend_ledger ($), project_time_entries (time). See docs/memory/AGENT_MEMORY_SCHEMA_AND_RECORDS.md and docs/API_METRICS_AND_AGENT_COST_TRACKING.md.
- **Deploys:** cloudflare_deployments (written by post-deploy-record.sh; TRIGGERED_BY=agent, DEPLOYMENT_NOTES for agent deploys).
- **Agent:** agent_sessions, agent_messages, ai_models, playwright_jobs.
- **Roadmap:** roadmap_plans, roadmap_steps (plan_iam_dashboard_v1).

---

## 8. Recommended Next Steps (Priority Order)

1. **Build /dashboard/progress** — Read roadmap_steps from D1; render list/cards by status; link from Overview or Agent. Mark step_progress_ui completed when done.
2. **Update D1 agent_memory_index** — Set active_priorities and build_progress to reflect Playwright screenshot fix and this deploy (and any new “next” priorities).
3. **user-settings** — Fix theme apply/remove and trim dead tabs; set step_user_settings_theme to in_progress then completed.
4. **MCP in chat** — Wire tool invocation during chat turn (backend + UI for tool result).
5. **R2 upload checklist** — Before every deploy, ensure all modified dashboard/*.html are uploaded to R2 (script or manual list).
6. **Verify screenshot E2E** — Hit “Take Screenshot” from + popup on /dashboard/agent and confirm image appears in chat (Playwright path).
7. **Plan Phase 2 (agent plan doc)** — After C3 validation, proceed with B1–B3 (Open in Code / Preview from chat), then A1–A4 (plans/queues). Plan stored at agent-sam/memory/plans/AGENT_SIDEDRAWER_FOOTER_MONACO_PLAN.md.

---

*End of audit. Use this doc to pick the next page/function to fix or build and to keep D1 and roadmap in sync.*
