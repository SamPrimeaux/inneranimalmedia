-- Applied remotely via Supabase MCP as repair_agentsam_control_plane_v1 (+ follow-ups).
-- Keep in-repo for audit: dead public.* pg_cron removed; agentsam.* retention only for
-- deploy_events / search_log / usage_events; embed Edge Fns disabled to 410 stubs.
-- See plan: supabase_closed_loop.

-- Live result after apply (2026-07-14):
-- cron.job remaining: refresh-timezone-cache, retention_agentsam_deploy_events,
--   retention_agentsam_search_log, retention_agentsam_usage_events_pg
-- Edge: embed-on-ingest / backfill-embeddings / summarize-thread return 410
