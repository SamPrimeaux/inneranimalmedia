# D1 canonical keys — agent_memory_index + related

## Production tenant

For **active_priorities**, **build_progress**, **today_todo**, and **dashboard_version**, the canonical rows in remote D1 use:

`tenant_id = 'system'`

Session-start queries must filter on this tenant (see `.cursor/rules/session-start-d1-context.mdc`).

## dashboard_versions table

Structured history of shipped agent bundles lives in **`dashboard_versions`** (`page_name` agent / agent-css / agent-html, `version` like v120, `r2_path`, `created_at`).

The **`agent_memory_index` key `dashboard_version`** holds a short narrative linking that table to **`dashboard/agent.html`** `?v=` (they can diverge until the next `deploy-with-record` / R2 sync).

## Re-sync script

After large platform sessions, you can re-run:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=scripts/d1-sync-session-2026-03-22.sql
```

Copy the SQL file to a new dated name when contents change materially. **`memory_type`** for `agent_memory_index` must be one of: `learned_pattern`, `user_context`, `execution_outcome`, `error_recovery`, `decision_log`.

## roadmap_steps

Cross-cutting sprints (e.g. **Mar 23 UI**) may be tracked as extra rows on **`plan_iam_dashboard_v1`** (example id: `step_mar23_ui_sprint`, `order_index` 22).

## ai_knowledge_base + ai_knowledge_chunks

The same canonical content (this doc plus the `d1-sync-session-2026-03-22.sql` reference) is stored for **AutoRAG / knowledge_search**:

| Field | Value |
|--------|--------|
| **knowledge `id`** | `kb-iam-d1-canonical-keys-20260322` |
| **tenant_id** | `tenant_sam_primeaux` |
| **client_id** | **`clients`** is the source of truth (`client_sam_primeaux` for Inner Animal Media). **`ai_knowledge_base`** and **`ai_knowledge_chunks`** have no `client_id` column; the same id is repeated in **`metadata_json`** so queries and RAG can filter without a join when needed. |
| **chunk `id`** | `kb-iam-d1-canonical-keys-20260322-c0` |

Rows are inserted with **`is_indexed = 0`** so **`POST /api/admin/vectorize-kb`** (or your batch job) can embed them into Vectorize.

After you change this doc or `scripts/d1-sync-session-2026-03-22.sql`, update **`scripts/d1-kb-insert-canonical-knowledge.sql`**: refresh the concatenated `content` (MD plus `--- SQL sync reference ---` plus the SQL file), re-escape single quotes for SQL, and set `token_count` / `content_preview` on the chunk row to match. Then apply with:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=scripts/d1-kb-insert-canonical-knowledge.sql
```

## infrastructure_documentation

This doc is registered in D1 as **`infra-doc-d1-canonical-keys-20260322`** (`bucket` **`iam-platform`**, **`r2_key`** **`memory/D1_CANONICAL_AGENT_KEYS.md`**). After you change this file, re-run **`scripts/d1-insert-infra-doc-d1-canonical.sql`** (adjust `size_bytes` / `content_preview` if needed), upload the MD to that R2 key, and set **`last_synced_at`** when your sync records it.
