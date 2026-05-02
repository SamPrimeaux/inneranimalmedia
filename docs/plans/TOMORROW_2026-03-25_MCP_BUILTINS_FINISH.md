---
title: "MCP builtins finish — Mar 25, 2026 (smoke + roadmap)"
category: plans
doc_type: runbook
updated: 2026-03-25
importance: high
plan_id: plan_iam_dashboard_v1
roadmap_step_ids:
  - step_mcp_finish_preflight_20260325
  - step_mcp_finish_r2_mcp_html_20260325
  - step_mcp_finish_builtin_matrix_20260325
  - step_mcp_finish_agent_workflows_20260325
  - step_mcp_finish_closeout_20260325
tags:
  - mcp
  - builtins
  - github
  - cloudflare-images
  - gdrive
  - resend
  - cdt
  - roadmap
  - inneranimalmedia
  - invokeMcpToolFromChat
r2:
  iam_docs_key: docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md
  autorag_key: plans/executed/TOMORROW-2026-03-25-mcp-builtins-finish.md
public_url: https://docs.inneranimalmedia.com/docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md
repo_path: docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md
sql_register: scripts/d1-register-plan-mcp-builtins-finish-20260325.sql
---

# Tomorrow — MCP builtins finish (Mar 25, 2026)

**Context:** Production Worker `inneranimalmedia` already includes `invokeMcpToolFromChat` paths for `resend_*`, `cdt_*`, `github_*`, `cf_images_*`, `gdrive_*`, plus `runToolLoop` parity and local-timestamp `post-deploy-record.sh`. **Rollback reference:** git `98ed8d8` (pre-MCP-builtins D1 success); current deploy row uses Worker version id `333355fb-2dd9-4b16-b2d5-b6ccb5a9713a`.

**Canonical D1 rows:** run `scripts/d1-roadmap-mcp-builtins-finish-20260325.sql` after review (adds `roadmap_steps` under `plan_iam_dashboard_v1`).

---

## Block 0 — Pre-flight (~10 min)

1. **D1 tool names:** `SELECT tool_name FROM mcp_registered_tools WHERE enabled=1 AND tool_name LIKE 'cdt_%' ORDER BY tool_name;` — confirm list matches `runCdpBuiltinTool` / inner switch (26 names).
2. **Remote MCP:** From dashboard or curl (session cookie), smoke `list_clients`, `get_worker_services`, `get_deploy_command` if registered — confirms `allowRemoteMcp` + auth.
3. **SUPABASE:** `grep -n SUPABASE worker.js` — expect webhook-only (`SUPABASE_WEBHOOK_SECRET`); note if anything new appears.

## Block 1 — UI + R2 sync (~20 min)

1. **MCP page:** Upload `dashboard/mcp.html` to production R2 (same path the site serves) so shortcuts work: `resend list domains`, `list github repos`, `cf images list`. Match the pattern in `deploy-with-record.sh` for `agent.html` (bucket `agent-sam`, path prefix `static/dashboard/`).
2. **Smoke in browser:** Logged-in `/dashboard/mcp` workspace — run phrases above + DevTools `fetch('/api/mcp/invoke', …)` for `resend_send_email` (verified `from` domain).

## Block 2 — Builtin matrix (~45 min)

| Area | Check |
|------|--------|
| **GitHub** | `github_repos` + `github_file` via `GITHUB_TOKEN`; optional fallback OAuth user still works. |
| **CF Images** | `cf_images_list` / upload / delete with `CLOUDFLARE_IMAGES_TOKEN` + `CLOUDFLARE_IMAGES_ACCOUNT_HASH` only. |
| **Gdrive** | Logged-in + Connect Drive → `gdrive_list`; `oauth_token` param path; 401 refresh via `GOOGLE_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`. |
| **Resend** | `resend_list_domains`, `resend_send_email`; treat `resend_create_api_key` as high-risk if exposed without approval. |
| **CDT** | Pick 3–5 `cdt_*` names from D1; run from MCP panel + Agent chat; confirm `MYBROWSER` errors are clear if misconfigured. |

## Block 3 — Agent chat + workflows (~30 min)

1. **Anthropic path:** `/dashboard/agent` — natural language tool use for `github_repos`, `cf_images_list`, `resend_list_domains`.
2. **Workflows:** `GET /api/mcp/workflows` — run one safe operator workflow if present; confirm steps hit `dispatchMcpTool` / `invokeMcpToolFromChat` without loops (`X-IAM-MCP-Proxy` behavior unchanged).

## Block 4 — Close out

1. Mark completed `roadmap_steps` rows `status='completed'` in D1.
2. Optional: bump `agent_memory_index` keys `active_priorities` / `today_todo` / `build_progress` with one line on MCP builtins shipped.
3. If anything fails: roll Worker to prior revision or redeploy from `98ed8d8`, then file a single `roadmap_steps` follow-up for the broken tool.

---

## Done when

- All Block 2 rows succeed in **both** MCP invoke UI and Agent chat (where applicable).
- `mcp.html` on prod includes Resend/GitHub/Images shortcuts (or documented alternative).
- D1 `roadmap_steps` for this track updated to `completed` or honest `blocked` with notes.

## Storage & D1 registry

| Location | Key / id |
|----------|-----------|
| **iam-docs** (public) | `docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md` → [docs site](https://docs.inneranimalmedia.com/docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md) |
| **autorag** (AI Search corpus) | `plans/executed/TOMORROW-2026-03-25-mcp-builtins-finish.md` |
| **dashboard_assets** | `da_doc_plan_mcp_builtins_finish_iam_docs_20260325`, `da_doc_plan_mcp_builtins_finish_autorag_20260325` |
| **ai_knowledge_base** | `kb-plan-mcp-builtins-finish-20260325` |

After changing the autorag object, run **POST** `/api/agentsam/autorag/sync` (authenticated dashboard session) or the Cloudflare AI Search job for instance **iam-docs-search** so retrieval picks up the new file.
