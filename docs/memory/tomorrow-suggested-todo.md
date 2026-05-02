# Suggested tomorrow to-do (2026-03-19)

**Source:** Cursor session log (past day) + D1 `agent_memory_index` and `roadmap_steps` (plan_iam_dashboard_v1). Use this to pick up and push toward SaaS launch.

---

## 1. Cursor log summary (past day — 2026-03-18)

| Session | What was done | Deploy status |
|--------|----------------|---------------|
| **Token-efficiency refactor** | worker.js: PROMPT_CAPS, mode-specific prompt builders (Ask/Plan/Agent/Debug), tool filtering by mode, rolling session summary + last N turns, file context line-range, RAG only in agent mode, audit report in response. | **Not deployed.** Built: no. R2: no. Worker: no. |
| **Uniform header (public pages)** | public-pages: about, contact, pricing, process — same nav as homepage (64px logo, Sign Up, hamburger + glassmorphic sidenav). | **R2 only.** All four files uploaded to inneranimalmedia-assets. Worker not deployed (not required for these). |

**Blockers / decisions**

- **Token-efficiency deploy:** Code is in worker.js but never deployed. First request after deploy may miss cache (format change); new entries stored as JSON. Decide: (a) deploy and smoke-test, or (b) run local/test first. Frontend can already send `fileContext.startLine/endLine`; dashboard may need to pass these when Monaco selection exists.
- **TOMORROW.md (2026-03-17) P1:** Chat rename still buggy on new conversations; delete chats not implemented; organize (folders/tags) not done.

---

## 2. D1 — agent_memory_index (relevant keys)

- **active_priorities:** Last deploy 2026-03-03; TOP 3 NEXT: (1) Confirm ai_compiled_context, (2) Wire MCP tool invocation during chat, (3) Build /progress page from roadmap_steps.
- **build_progress:** Platform 47% (10/21 steps). Completed: auth, terminal, agent chat, AI providers, commands, pickers, overview, daily digest, MCP (19 tools), Playwright. In progress: R2 UI panel (80%), memory write pipeline, cost tracking, progress UI. Not started: exit codes, CI/CD, Vertex, client dashboard, billing, SaaS.
- **today_todo:** Not present in D1 (query returned empty). Consider seeding via Agent UI or `PUT /api/agent/today-todo` and re-indexing memory.
- **deploy_rules, cost_awareness, db_zero_tables, kpi_targets** — all present; deploy_rules (importance 10) and KPI targets (MRR $2k, AI spend cap $200, etc.) are the ones that affect launch.

---

## 3. D1 — roadmap_steps (plan_iam_dashboard_v1, launch-relevant)

**In progress (finish or unblock)**

- step_r2_ui — R2 Manager UI panel
- step_memory_retrieval — AutoRAG retrieval in chat
- step_cost_tracking — Per-session, per-deploy, per-provider
- step_progress_ui — Build status UI
- step_monaco_editor — Syntax highlighting (in_progress)

**Not started but launch-critical**

- step_agent_page_solid — Agent page no color flash, fully functional
- step_billing — Stripe + invoicing wired
- step_saas — Multi-tenant productization
- step_monaco_edit_save — Monaco edit mode + R2 save
- step_client_dashboard — Per-client status page
- step_memory_management_protocols — Memory management protocols
- step_time_documentation — Timer stops, user-aware, validity
- step_user_settings_theme — user-settings apply + remove dead tabs
- step_exit_codes — Terminal exit code display inline

**Completed (reference)**  
Auth, terminal, agent chat, providers, commands, pickers, overview, Playwright, MCP, daily digest, theme all pages, Gemini 2.5 Flash, Drive/GitHub integration, terminal stability, etc.

---

## 4. Suggested tomorrow to-do (prioritized)

Use this as the day’s list; update D1 `agent_memory_index` (e.g. today_todo) and/or `docs/memory/today-todo.md` after you confirm, and re-index memory so Agent Sam and digest stay accurate.

### P0 — Deploy and stability

1. **Token-efficiency worker:** Decide and execute: deploy the 2026-03-18 token-efficiency refactor (worker.js) with “deploy approved,” then smoke-test one Ask, one Plan, one Agent chat. If you prefer to test first, run locally then deploy. After deploy, optionally run “Re-index memory” so RAG/cache behavior is current.
2. **Chat P1 (from TOMORROW.md):** Fix chat rename on new conversations; implement delete chat; optionally start organize (folders/tags) or document as post-launch.

### P1 — Launch path

3. **Progress UI (step_progress_ui):** Build /dashboard/progress (or equivalent) that reads `roadmap_steps` from D1 and shows status (completed / in progress / not started). Link from Overview or Agent. Mark step completed in D1 when done.
4. **Billing (step_billing):** Start Stripe + invoicing wiring so the product can charge. Even a minimal “connect Stripe + log charges” is a launch blocker.
5. **Agent page solid (step_agent_page_solid):** Confirm no color flash, theme preload, and full flow (chat, tools, Monaco, MCP). Mark step completed when verified.
6. **Cost tracking (step_cost_tracking):** Finish per-session / per-deploy / per-provider so the $ gauge and finance views are accurate. D1 already has agent_telemetry and spend_ledger; wire reads and any missing writes.

### P2 — Same week

7. **Memory (step_memory_retrieval):** Confirm AutoRAG retrieval in chat and ai_compiled_context_cache usage so repeated questions use cache. Matches active_priorities “Confirm ai_compiled_context.”
8. **Today todo in D1:** Seed or update `agent_memory_index` key `today_todo` with a short list (e.g. via PUT /api/agent/today-todo or direct D1). Upload docs/memory/today-todo.md to R2 and run Re-index memory so Agent Sam and digest see it.
9. **Daily log:** After a significant day, run `./scripts/with-cloudflare-env.sh ./scripts/upload-daily-log-to-r2.sh 2026-03-18` (or 2026-03-19) and update docs/cursor-session-log.md + docs/TOMORROW.md. Re-index memory if you want it in RAG.

### P3 — When you have time

10. **Monaco edit + R2 save (step_monaco_edit_save):** Already partially there (diff flow, Keep Changes); close any gaps and mark step done.
11. **Time documentation (step_time_documentation):** Document 12h cap, last_heartbeat_at, auto-close after ~30 min idle (see docs/memory/agent-plans/time-documentation-fix.md).
12. **user-settings theme (step_user_settings_theme):** Fix apply + remove dead tabs.

---

## 5. One-line “copy into today_todo”

You can paste this into the Agent UI today-todo or into D1 agent_memory_index (key `today_todo`) after trimming to your actual day:

```
P0: Deploy token-efficiency worker + smoke-test; fix chat rename on new + delete chat. P1: Progress UI from roadmap_steps; start billing (Stripe); verify agent page solid; finish cost tracking. P2: Confirm AutoRAG/cache; seed today_todo in D1; upload daily log + re-index. P3: Monaco edit save; time doc; user-settings theme.
```

---

## 6. After you finish roadmap steps

Update D1 so Agent Sam and the nightly digest stay accurate:

```sql
UPDATE roadmap_steps SET status='completed', updated_at=datetime('now') WHERE id IN ('step_xxx');
```

Update `agent_memory_index` for keys like `active_priorities` and `build_progress` to match. See docs/memory/AGENT_MEMORY_SCHEMA_AND_RECORDS.md and .cursor/rules/session-start-d1-context.mdc.
