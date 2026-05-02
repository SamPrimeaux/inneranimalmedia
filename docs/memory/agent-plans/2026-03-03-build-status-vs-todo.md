# Build status vs to-do (2026-03-03)

**Reference:** To-do and plans live in the repo at `docs/memory/agent-plans/` and in R2 **iam-platform** at `memory/daily/YYYY-MM-DD.md` and `memory/schema-and-records.md`. This file summarizes where the build is relative to those plans.

---

## 1. Full-capabilities checklist (AGENT_FULL_CAPABILITIES_AND_MCP_PLAN.md)

| Priority | Item | Status |
|----------|------|--------|
| 1 | **AI Gateway** | ✅ Done. Optional routing via `AI_GATEWAY_BASE_URL`; OpenAI + Anthropic chat can use gateway; `use_ai_gateway: false` for direct. |
| 2 | **Preview: open auth URLs in new tab** | ⬜ Not done. |
| 3 | **R2 list API** | ⬜ Not done. GET `/api/agent/r2/objects?bucket=...` not implemented. |
| 4 | **Accept/Stop + RUN_IN_TERMINAL** | ⬜ Not done. |
| 5 | **MCP invoke** | ⬜ Not done. POST `/api/agent/mcp/invoke` not implemented. |
| 6 | **Pre-query RAG** | ⬜ Not done. |
| 7 | **Structured actions** | ⬜ Not done. |

---

## 2. Today’s overview to-do (2026-03-03-overview-todo.md)

- **Goal:** Refactor `/dashboard/overview` only (shell + mount point for future JSX).
- **Checklist:** Step 1–5 (read overview/chats HTML, refactor layout, add mount point, R2 upload, optional checkpoints).
- **Status:** Not started in this session. R2 upload and worker deploy were done; overview page refactor is separate.

---

## 3. Agent telemetry

- **Current:** Worker writes **agent_telemetry** on every successful `/api/agent/chat` (tokens, provider, model). GET `/api/agent/telemetry` returns last 7 days by provider. Schema and backfill are in `docs/memory/AGENT_MEMORY_SCHEMA_AND_RECORDS.md` and `docs/API_METRICS_AND_AGENT_COST_TRACKING.md`.
- **R2/Index:** Schema/records memory is at R2 **iam-platform** `memory/schema-and-records.md` (upload with `./scripts/upload-schema-memory-to-r2.sh`). Bootstrap injects it into the agent system prompt.
- **Still to address:** Observability **telemetry endpoints** (traces + logs) still return 404. See `docs/memory/agent-plans/telemetry-endpoints.md`: add POST `/api/telemetry/v1/traces` on inneranimalmedia.com and POST `/api/telemetry/otlp/v1/logs` on meauxbility.org (or same worker) and return 200/204.

---

## 4. “Install Anthropic API Key” / API keys in UI

- **Your keys:** All API keys (Anthropic, OpenAI, Google, etc.) are correctly set in the Cloudflare Worker (Dashboard → Workers → inneranimalmedia → Settings → Variables and Secrets). The worker uses them for chat; no need to “install” them in the dashboard.
- **If the dashboard shows a task like “Install Anthropic API Key”:** That text is **not** in D1 table **iam_agent_sam_prompts** (only one system prompt exists; it doesn’t mention API keys). So the card may be from another dashboard view, another app, or an older build. To avoid confusion, the agent welcome message in the dashboard can state that API keys are configured in Cloudflare (see below).

---

## 5. R2 iam-platform layout (memory / index)

| Key | Purpose |
|-----|---------|
| `memory/schema-and-records.md` | Canonical tables, backfill, agent memory. Upload: `./scripts/upload-schema-memory-to-r2.sh` |
| `memory/daily/YYYY-MM-DD.md` | Daily logs. Upload: `./scripts/upload-daily-log-to-r2.sh 2026-03-03` |

There is no single “to-do index” file in R2; the to-do is in the repo (`docs/memory/agent-plans/2026-03-03-overview-todo.md` and this file). To make status visible to the agent from bootstrap, you could add a key like `memory/status.md` and upload this file (or a short version) there.

---

*Generated 2026-03-03. Update this file or upload to R2 `memory/status.md` after each deploy or plan change.*
