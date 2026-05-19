# Agent Sam — Dead Code + Stale File Report
**Generated:** 2026-05-19T13:09:12.921620+00:00

## Summary
- Files scanned: 778
- Backup files scanned: 8
- Duplicate components: 1
- Backup shadow files: 8
- Unreferenced components: 22
- Orphaned files: 78
- Files with large comment blocks: 20
- Files with TODO/FIXME debt: 20
- Files with debug artifacts: 20

## Duplicate Component Implementations
These are high-risk because one implementation may be stale.

### `ChatAssistant`
- `dashboard/components/ChatAssistant.tsx`
- `dashboard/features/agent-chat/ChatAssistant.tsx`

## Backup Files Shadowing Live Files
- BACKUP `scripts/patch_results/backups/20260516_160912/dashboard/App.tsx` shadows LIVE `dashboard/App.tsx`
- BACKUP `scripts/patch_results/backups/20260516_160912/dashboard/components/GitHubExplorer.tsx` shadows LIVE `dashboard/components/GitHubExplorer.tsx`
- BACKUP `scripts/patch_results/backups/20260516_160912/dashboard/components/LocalExplorer.tsx` shadows LIVE `dashboard/components/LocalExplorer.tsx`
- BACKUP `scripts/patch_results/backups/20260516_160912/dashboard/components/UnifiedSearchBar.tsx` shadows LIVE `dashboard/components/UnifiedSearchBar.tsx`
- BACKUP `scripts/patch_results/backups/20260516_160912/src/api/r2-api.js` shadows LIVE `src/api/r2-api.js`
- BACKUP `scripts/patch_results/backups/20260516_160912/src/core/pty-workspace-paths.js` shadows LIVE `src/core/pty-workspace-paths.js`
- BACKUP `scripts/patch_results/backups/20260516_160912/src/api/agent.js` shadows LIVE `src/tools/builtin/agent.js`
- BACKUP `scripts/patch_results/backups/20260516_160912/src/tools/r2-dispatch.js` shadows LIVE `src/tools/r2-dispatch.js`

## Unreferenced Exported Components
Exported but apparently never imported or used in JSX anywhere. Verify before deleting.
- `GLBViewer` in `dashboard/components/GLBViewer.tsx`
- `GlobeErrorState` in `dashboard/components/GlobeErrorState.tsx`
- `JsonModal` in `dashboard/components/JsonModal.tsx`
- `PromptModal` in `dashboard/components/PromptModal.tsx`
- `AdvisorsTab` in `dashboard/components/analytics/tabs/AdvisorsTab.tsx`
- `AgentTab` in `dashboard/components/analytics/tabs/AgentTab.tsx`
- `CodebaseTab` in `dashboard/components/analytics/tabs/CodebaseTab.tsx`
- `CostsTab` in `dashboard/components/analytics/tabs/CostsTab.tsx`
- `DeploysTab` in `dashboard/components/analytics/tabs/DeploysTab.tsx`
- `McpTab` in `dashboard/components/analytics/tabs/McpTab.tsx`
- `ModelsTab` in `dashboard/components/analytics/tabs/ModelsTab.tsx`
- `OverviewTab` in `dashboard/components/analytics/tabs/OverviewTab.tsx`
- `RagTab` in `dashboard/components/analytics/tabs/RagTab.tsx`
- `WorkersTab` in `dashboard/components/analytics/tabs/WorkersTab.tsx`
- `McpAuthorizationScreen` in `dashboard/components/auth/AuthOAuthConsentPage.tsx`
- `CourseNav` in `dashboard/components/learn/CourseNav.tsx`
- `LessonView` in `dashboard/components/learn/LessonView.tsx`
- `MarkdownLite` in `dashboard/components/learn/MarkdownLite.tsx`
- `McpServerCard` in `dashboard/components/settings/components/McpServerCard.tsx`
- `McpToolRow` in `dashboard/components/settings/components/McpToolRow.tsx`
- `PreviewComposition` in `dashboard/features/moviemode/PreviewComposition.tsx`
- `RemotionRoot` in `dashboard/src/remotion-entry.tsx`

## Orphaned Files
Files that appear not to be imported. Verify entrypoints/dynamic imports before deleting.
- `dashboard/components/GlobalSearchPage.tsx`
- `dashboard/components/IntegrationsPage.deprecated.tsx`
- `dashboard/config/analyticsDataSources.ts`
- `dashboard/finance-entry.jsx`
- `dashboard/postcss.config.js`
- `dashboard/src/lib/r2MultipartUpload.ts`
- `dashboard/tailwind.config.js`
- `dashboard/utils/voxelGenerators.ts`
- `scripts/agentsam-command-approval-designer.py`
- `scripts/agentsam-gemini-deploy-fix-brief.py`
- `scripts/agentsam_cms_d1_table_audit.py`
- `scripts/agentsam_seed_parallel_cms_plan.py`
- `scripts/archive/session_repairs/repair_gap_pack_prompt_tool_ids.py`
- `scripts/archive/session_repairs/repair_gap_pack_tool_call_not_nulls.py`
- `scripts/audit/audit_python_architect_skill_table_refs.py`
- `scripts/audit/scan_d1_source_kind_usage.py`
- `scripts/audit_agentsam_d1_and_codebase.py`
- `scripts/audit_agentsam_only_d1_and_codebase.py`
- `scripts/audit_agentsam_todo.py`
- `scripts/audit_deploy_scripts.py`
- `scripts/audit_homepage_cms_structure.py`
- `scripts/audit_identity_for_email.py`
- `scripts/audit_legacy_tables.py`
- `scripts/audit_moviemode_backend.py`
- `scripts/audit_projects_page_data.py`
- `scripts/audit_services_headers.py`
- `scripts/audit_services_route.py`
- `scripts/backfill_memory_embeddings.py`
- `scripts/build-real-workflows-seed.py`
- `scripts/build_services_r2_clean.py`
- `scripts/check-dashboard-theme.py`
- `scripts/cms_01_chunk_schema.py`
- `scripts/cms_04_reduce_reports.py`
- `scripts/cms_05_chess_asset_manifest.py`
- `scripts/cms_05_final_openai_remaster.py`
- `scripts/cms_06_audit_3d_assets.py`
- `scripts/cms_07_audit_homepage_sections.py`
- `scripts/cms_08_replace_selected_work_with_agentsam.py`
- `scripts/cms_09_stage_agentsam_section.py`
- `scripts/cms_10_seed_agentsam_homepage_section.py`
- `scripts/cms_13_rebuild_liquid_imports.py`
- `scripts/cms_14_fix_liquid_fk_seed.py`
- `scripts/cms_15_final_fix_liquid_sections_fk.py`
- `scripts/embed_motion_packet_local.py`
- `scripts/embed_ops_knowledge_batch.py`
- `scripts/export_agentsam_d1_context.py`
- `scripts/export_d1_schema_context.py`
- `scripts/export_learn_course_d1_context.py`
- `scripts/filter_gap_pack_vectorize_balanced.py`
- `scripts/find_agent_prompt_minimal_assets.py`

## Large Comment Blocks
- `src/api/agent.js` — 43 blocks, largest 63458 chars
- `src/api/auth.js` — 9 blocks, largest 37594 chars
- `dashboard/features/agent-chat/ChatAssistant.tsx` — 6 blocks, largest 35443 chars
- `src/api/integrations.js` — 3 blocks, largest 32105 chars
- `src/api/settings.js` — 5 blocks, largest 31240 chars
- `src/api/onboarding.js` — 2 blocks, largest 28705 chars
- `src/api/settings-api-keys.js` — 2 blocks, largest 26669 chars
- `dashboard/components/XTermShell.tsx` — 2 blocks, largest 24481 chars
- `src/api/analytics/boards.js` — 2 blocks, largest 22415 chars
- `src/api/agentsam.js` — 4 blocks, largest 21576 chars
- `src/do/AgentChat.js` — 5 blocks, largest 20729 chars
- `src/index.js` — 3 blocks, largest 20322 chars
- `src/core/agentsam-task-executor.js` — 4 blocks, largest 17980 chars
- `dashboard/components/LocalExplorer.tsx` — 7 blocks, largest 17739 chars
- `src/api/oauth.js` — 10 blocks, largest 15460 chars
- `src/api/r2-api.js` — 7 blocks, largest 14235 chars
- `dashboard/components/MailPage.tsx` — 3 blocks, largest 13486 chars
- `src/core/retention.js` — 2 blocks, largest 12786 chars
- `dashboard/components/settings/sections/SecuritySection.tsx` — 2 blocks, largest 12356 chars
- `dashboard/pages/workflows/WorkflowCanvas.tsx` — 3 blocks, largest 12155 chars

## TODO/FIXME Debt
- `src/api/agent.js` — 84 items: temPrompt(env, ctx, systemPrompt, opts) {
- `scripts/smoke/smoke_todo_fix.py` — 77 items: todo_fix.py
- `scripts/smoke/agentsam_seed_visualizer_todos.py` — 44 items: todos.py
- `dashboard/components/MailPage.tsx` — 43 items: template_id: string; reply_to: string;
- `dashboard/Finance.js` — 34 items: tempt to destructure non-iterable instance.
- `scripts/smoke/smoke_register_workflow.py` — 32 items: Todo Fix process as a first-class workflow:
- `scripts/smoke/audit_and_todo.py` — 25 items: todo.py
- `scripts/verify_buildsystemprompt.py` — 21 items: temprompt.py
- `src/api/studio-session.js` — 19 items: todos, budget, artifacts.
- `scripts/agentsam-true-e2e-workflow-runner.py` — 17 items: template.
- `src/core/provider.js` — 17 items: temPromptStringForAudit(systemPrompt) {
- `scripts/seed_session_plan.py` — 15 items: todo = remaining
- `src/api/mail.js` — 15 items: templates, sending).
- `scripts/audit_agentsam_todo.py` — 14 items: TODO_STALE_DAYS", "14"))
- `dashboard/pages/tasks/TasksPage.tsx` — 13 items: todo" - "in_progress" - "testing" - "awaiting_approval" - "complete" - "blocked";
- `scripts/agentsam-e2e-workflow-runner.py` — 13 items: template verification.
- `scripts/audit_cms_motion_schema.py` — 13 items: templates
- `scripts/install_tasks_page_v1.py` — 13 items: todo" - "in_progress" - "testing" - "awaiting_approval" - "complete" - "blocked";
- `scripts/d1_schema_audit.py` — 12 items: todos
- `src/api/onboarding.js` — 12 items: templates load from R2 binding `EMAIL` (inneranimalmedia-email-archive).

## Debug Artifacts
- `src/api/agent.js` — 73 console calls, 0 debuggers
- `src/api/auth.js` — 23 console calls, 0 debuggers
- `scripts/overnight.js` — 16 console calls, 0 debuggers
- `scripts/ingest-docs.js` — 14 console calls, 0 debuggers
- `scripts/validate-overnight-setup.js` — 12 console calls, 0 debuggers
- `src/cron/jobs/daily-plan-email.js` — 12 console calls, 0 debuggers
- `src/api/provisioning.js` — 11 console calls, 0 debuggers
- `src/core/auth.js` — 11 console calls, 0 debuggers
- `src/core/provider.js` — 10 console calls, 0 debuggers
- `src/cron/jobs/thirty-minute-cron.js` — 10 console calls, 0 debuggers
- `src/api/command-run-telemetry.js` — 9 console calls, 0 debuggers
- `src/api/integrations.js` — 9 console calls, 0 debuggers
- `src/api/rag.js` — 9 console calls, 0 debuggers
- `src/core/memory.js` — 9 console calls, 0 debuggers
- `src/api/onboarding.js` — 8 console calls, 0 debuggers
- `src/cron/retention-purge.js` — 8 console calls, 0 debuggers
- `dashboard/Finance.js` — 7 console calls, 0 debuggers
- `dashboard/components/LocalExplorer.tsx` — 7 console calls, 0 debuggers
- `src/api/cicd-event.js` — 7 console calls, 0 debuggers
- `src/api/unified-search.js` — 7 console calls, 0 debuggers

---
*Generated by `scripts/audit_dead_code.py` at 2026-05-19T13:09:12.921620+00:00*