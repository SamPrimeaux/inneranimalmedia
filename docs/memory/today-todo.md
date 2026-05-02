# Today's to-do — production-ready workflows (2026-03-09)

**Purpose:** Realtime list for Agent Sam and the team. Stored in D1 (`agent_memory_index` key `today_todo`) and R2 (`memory/today-todo.md`). Auto-RAG indexes this so semantic search and bootstrap have current focus. Update via Agent UI or `PUT /api/agent/today-todo`.

---

## Today's priorities (streamline to production)

- **Drive/GitHub file pickers** — Implement OAuth token storage after Connect; add list + attach APIs and wire Agent UI so users can attach from Drive/GitHub.
- **Time doc & heartbeat** — Finish step_time_documentation: document 12h cap in time-documentation-fix.md; add last_heartbeat_at and auto-close after ~30 min idle.
- **Daily logs to R2** — Keep uploading daily logs after each significant day: `./scripts/with-cloudflare-env.sh ./scripts/upload-daily-log-to-r2.sh YYYY-MM-DD`; run "Re-index memory" or rely on 6 AM cron so bootstrap and RAG stay current.
- **Roadmap & digest** — When finishing roadmap steps, update `roadmap_steps` and `agent_memory_index` (active_priorities, build_progress) so Agent Sam and nightly digest are accurate.
- **Root deploy script** — Add `"deploy": "./scripts/deploy-with-record.sh"` to repo root package.json so `npm run deploy` works.
- **Production sanity** — Smoke-test: OAuth return_to to /dashboard/agent, Re-index memory + Compact & re-index from + popup, agent chats with project_id populated; confirm RAG returns today-todo and compacted chats.

---

*Update this file or use PUT /api/agent/today-todo to keep the list current. Re-index memory from the Agent UI to vectorize changes.*
