# Companions CPAS — agent context + AST-RAG (compartmentalized)

**Lane:** Companions client delivery — **not** IAM remaster queue / not platform tool-spine P0.  
Keep these tickets separate from `tkt_agentsam_spine_e2e_*`, progressive discovery, and MCP OAuth work.

| D1 id | Outcome | Status intent |
|-------|---------|----------------|
| `tkt_companions_activerepo_lock_20260721` | Project bindings inject `github_repo`, but `activeRepo` only read chat body — resolution-order bug. Lock from `projectExecutionBindings.githubRepo` + `client_apps.github_repository` fallback. | `in_review` (shipped code `8ca82a66`; dual-pass E2E still open) |
| `tkt_companions_ast_rag_index_20260721` | Index `SamPrimeaux/companionscpas` under `ws_companionscpas` / UUID `e57c3f65-…` (1187 nodes, 111 edges, 976 symbols). Runtime retrieve maps project workspace → Supabase UUID. | `in_review` (index live; in-app retrieve smoke still open) |
| `tkt_companions_cms_image_cards_20260721` | Alias / supersede note for CMS card image editor + wishlist cover (`tkt_4232a9831ae74911`). | track via existing CMS ticket |
| `tkt_project_codebase_index_rail_20260721` | **UX:** Codebase Index card on **project page right rail** (not Settings): last indexed + counts + Re-index with baked `--workspace-id`/`--repo`. | `in_review` (API + rail shipped; dual-pass E2E open) |

## Safety rail (platform scripts)

Bare `python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk all` and Phase 2 `--chunk all` **refuse** without `--target platform` or customer `--workspace-id` / `--single-repo`. Prevents accidental dual-repo platform reindex when intending Companions/fuel/etc.

## Job-status card diagnosis (2026-07-21)

Settings → Workspace “failed_partial · 707/911 · ~6d ago” was **live D1**, not a PTY gate:

- Row `cidx_src_reindex_v1` marked `failed_partial` on 2026-07-15 (`triggered_by=mark-code-index-failed-partial`) — abandoned experimental corpus.
- UI used `ORDER BY updated_at DESC LIMIT 1`, so that row beat canonical `cidx_ws_inneranimalmedia`.
- “AST refresh stays off until remote terminal…” was **hardcoded copy**, independent of that job.

Fix: prefer `cidx_{workspace_id}`; stop claiming PTY gate for AST CLI.
